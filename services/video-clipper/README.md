# Afterplay

An autonomous agent that turns a long video into finished, platform-native short
clips. It decides what to clip from **text and audio alone**, fetches only the seconds
it needs, re-encodes only those seconds, then **looks at the rendered frames** and
repairs the clip if they measure wrong.

Measured on real sources, end to end. **Timings are hardware-dependent** — these were
captured on one Windows laptop (Intel QSV hardware encoder, `h264_qsv`) and are dominated
by the reframe/encode stage, not by ingestion. Re-measure on your own machine before
quoting them.

| Source | Length | Signal used | Result | Wall clock |
|---|---|---|---|---|
| Free Fire gameplay (**no captions, no heatmap**) | 17:14 | audio excitement + onsets | 3/3 clips, all first-pass QC | 1907s |
| Local 68s source with captions, memory enabled | 1:08 | transcript + callback memory | 1/1 clip, first-pass QC, callback cited | 89s |

The decision phase is genuinely cheap — resolve + understand was **43s of that 1907s** run;
the remaining time is frame decoding and encoding. See [reframe performance](../../docs/prd/PRD.md)
(gap G16) for the known bottleneck and the planned fix.

**100 tests pass, 1 skipped** (unit + hermetic integration; no network, model weights or
GPU required). Reproduce with `python -m pytest tests -q`.

---

## Why it's fast

Most tools download the whole video and re-encode the whole video to produce a few
clips, so turnaround scales with **source** length. Afterplay spends strictly more at each
stage, and the expensive stages only ever see the chosen seconds:

```
1 RESOLVE     metadata + captions + heatmap        ~700 KB      1-2 s
2 UNDERSTAND  rank moments from text/audio only    KB (or ~15 MB audio)   0.02-5 s
3 EXTRACT     HTTP range-fetch ONLY chosen windows ~25% of source   parallel
4 EDIT        reframe + caption + brand, those seconds only, hardware encode
4b QC         decode real frames + audio, measure, repair, re-render
5 DELIVER     manifest.json + assets, webhook, memory write-back
```

`-ss` before `-i` turns a seek into an HTTP range request — that single detail is the
latency argument. Stages 1–2 never touch a video byte.

## Install

**Linux / macOS**

```bash
cd services/video-clipper
./setup.sh --test          # venv, deps, doctor, full test suite
source .venv/bin/activate
```

**Windows**

```powershell
python -m venv .venv
.\.venv\Scripts\python -m pip install -r requirements.txt
.\.venv\Scripts\python -m afterplay.cli doctor
```

ffmpeg is bundled via `imageio-ffmpeg`, so nothing else is required. A **system**
ffmpeg is preferred when available because it exposes hardware encoders (NVENC / QSV /
VideoToolbox); the encoder is auto-detected by actually encoding a few frames, since
presence in `-encoders` does not mean the hardware exists.

## Use

```bash
# decide only — no video bytes, < 10 s
afterplay plan "https://youtu.be/VIDEO_ID" --clips 5

# full pipeline
afterplay run "https://youtu.be/VIDEO_ID" --rights not_cleared --clips 5 --platforms shorts,reels --workers 6

# a file you own (preferred path: faster, and no platform-ToS question)
afterplay run --local episode.mp4 --vtt episode.en.vtt --rights creator_owned --clips 5 --creator ksi

# headless: JSON to stdout, webhook on completion, exit code carries the verdict
afterplay run "URL" --rights permission_granted --json --webhook https://your.app/callback

afterplay doctor          # environment + detected encoder
afterplay memory ksi      # what the agent learned about this creator
```

Exit codes: `0` all clips ok · `3` partial · `4` none produced · `2` usage/fatal.

## Channel memory and callbacks

Channel memory is the callback layer: it stores running jokes, rivalries, recurring people,
and unfinished stories from earlier streams, then lets a later run boost moments that pay
those threads off. It is a scoring boost, not a gate. If no callback is found, the run still
returns the best standalone clips and emits:

```text
No memory-dependent callback found in this run. Showing highest-quality standalone clips.
```

Seed memory from a captioned prior stream:

```bash
afterplay backfill --creator ksi --stream-id prior_001 --vtt prior.en.vtt
```

For a creator-owned local file without captions, `backfill` can use ASR and writes the
generated transcript under the workdir for inspection:

```bash
afterplay backfill --creator ksi --stream-id prior_002 --local prior.mp4
```

That ASR path requires `faster-whisper` and local/downloadable Whisper weights. If weights
are unavailable, `backfill` fails with an actionable error naming `AFTERPLAY_WHISPER_SIZE`
or `AFTERPLAY_WHISPER_MODEL`; it does not silently behave like a no-callback stream.

Caption selection follows `AFTERPLAY_SUBTITLE_LANGUAGES` in order and never falls back to
an unlisted language. Pin caption-less transcription with `AFTERPLAY_ASR_LANGUAGE`. For the
bounded Hindi case study, for example:

```bash
export AFTERPLAY_SUBTITLE_LANGUAGES=hi,en
export AFTERPLAY_ASR_LANGUAGE=hi
```

Every manifest records `transcript_language`, `transcript_source`, and `subtitle_track`.
This is source provenance for a measured case study, not a claim of general multilingual
support.

Run the current stream with memory enabled:

```bash
afterplay run --memory --creator ksi --local current.mp4 --vtt current.en.vtt --rights permission_granted --clips 3 --platforms shorts
```

The manifest includes `memory: { degraded, reason, threads_considered, callback_found }`.
Studio treats `memory.degraded: true` as a visible failure state and treats no-callback with
healthy memory as a normal fallback outcome.

With `ANTHROPIC_API_KEY` set, `--llm` swaps in LLM moment ranking and **vision QC**
(the model reviews sampled frames). Without it everything still runs — the heuristic
policy is the default, not a degraded mode.

## How moments are chosen

In priority order, using whatever the source actually exposes:

1. **Engagement heatmap** (`most-replayed`) when present — viewers already told you.
   Frequently **absent**; treat that as the default case, not an error.
2. **Cold-start text signals** when captions exist: `[laughter]`/`[applause]` audio
   cues in the caption track, `>>` speaker-turn density, questions, and pace.
3. **ASR** when there are no captions: fetch the audio stream (~15 MB, not ~200 MB)
   and transcribe it with Whisper, which gives sentence-accurate cuts *and* lets the
   clips carry burned captions. Needs model weights; see below.
4. **Audio-energy detection** when ASR is unavailable too (gameplay, music, reaction):
   score excitement above a slow baseline plus transient density, and open the clip a
   few seconds *before* the spike rather than on the aftermath.

**SponsorBlock** spans are subtracted from candidates before ranking, so a sponsor read
is never clipped. **Performance priors** re-rank candidates by what has actually worked
for that creator, at a bounded weight so a thin history cannot override the content
signal.

Cuts always snap to sentence boundaries (from word-level caption timings) so a clip
never starts mid-word.

## QC is the point

A clip ships because the frames **measured correct**, never because ffmpeg exited 0
(it returns 0 having written zero packets in some failure modes). Every check runs on
decoded pixels and real audio samples, and each failure names a repair the agent
applies before re-rendering:

| Check | Repair |
|---|---|
| geometry vs platform preset | — (spec bug) |
| black frames in the hook | `shift_start` |
| frozen / undecodable video | `reextract` |
| subject hugging a frame edge | `recenter_left/right` |
| caption box breaching the safe zone **or clipped by the frame** | `shrink_captions` |
| silent clip / silent hook | `shift_start` / `snap_to_speech` |
| audio clipping | `lower_loudness` |
| over the platform duration cap | `shorten` |

Repairs are ordered (fix *where* the clip starts before *how it looks*), capped at two
per attempt, and bounded by an attempt budget. A clip that still fails is delivered
marked `ok: false` with its findings — never silently shipped as a pass.

## Architecture

```
afterplay/
  core.py        settings, platform presets, ffmpeg exec, probing, encoder detection
  resolve.py     stage 1 — yt-dlp metadata / captions / stream URLs
  understand.py  stage 2 — VTT word-level parsing, ranking, Reasoner strategies
  asr.py         stage 2 — Whisper transcript when the source has no captions
  audio.py       stage 2 fallback — caption-free detection from audio energy
  produce.py     stages 3-4 — range extract, saliency reframe, ASS captions, render
  vision.py      face detection (YuNet) driving the reframe, saliency as fallback
  qc.py          stage 4b — frame + audio measurement, findings, repairs
  insights.py    SponsorBlock, per-platform copy, the performance analytics loop
  mcp_server.py  MCP tools so any MCP client can call the pipeline
  agent.py       the loop: tool registry, ClipAgent subagents, Orchestrator, policies
  memory.py      Creator Memory (local JSON): brand, prefs, corrections, learning
  prompts.py     production prompts (system / ranking / vision QC / copy)
  cli.py         headless CLI
  skills/        the craft rules, as markdown the agent loads and humans can read
```

**Agentic, not a fixed script.** `Orchestrator` fans out one `ClipAgent` per
(moment × platform) across a thread pool; each subagent owns its own render→QC→repair
loop and can fix its clip without redoing the job. Tools are registered with JSON
schemas (`TOOLS.specs()`), so an LLM policy can call them directly.

**Skills** (`afterplay/skills/*.md`) carry the craft: `clipping-craft`, `clip-qc`,
`ffmpeg-clipping`, `ytdlp-ingestion`. The heuristic policy encodes these rules; the LLM
policy is handed the same files verbatim. They are also the honest documentation of
every trap this pipeline hit.

**Memory** is local JSON per creator (`~/.afterplay/memory/<id>/`): brand, format prefs, a
corrections log, and running QC stats. Repeated repairs get promoted into defaults —
if the agent keeps shrinking captions for a creator, that becomes their font size.
Explicit pins always beat learned values.

## Reframing

Faces first: **YuNet** (a 230 KB ONNX model) finds the speaker and drives the crop; the
largest detection wins, because that is the speaker in a two-shot far more often than
the highest-confidence one. When faces are too sparse to trust (< 35% of sampled
frames) it declines and the saliency tracker takes over. On the quiz-show source the
face path hit **100% coverage**.

Fetch the model once:

```bash
python -c "from afterplay.vision import fetch_model; fetch_model()"
```

Note it downloads from `media.githubusercontent.com`, not `raw.githubusercontent.com` —
`opencv_zoo` stores models in git-lfs and the raw URL returns a 131-byte pointer that
loads as a corrupt ONNX.

### Vertical framing

The output is 1080x1920. By default the **entire** source frame is kept: it is scaled to
the full width and centred, with a blurred, slightly darkened copy of itself filling the
space above and below. Nothing is cropped away.

`AFTERPLAY_MIN_WIDTH_FRAC` sets the floor as a fraction of source width. `1.0` (the
default) is the full frame; lower values crop in before letterboxing, and `0` restores an
edge-to-edge crop. Note what a hard 9:16 crop of a 16:9 source costs: it keeps 31.6% of
the frame width and enlarges it 2.7x, so heads lose their tops and a two-shot loses a
head entirely.

### Burned-in captions

Off by default, opt in with `--captions`.

Most source footage already carries the creator's own burned-in captions. Adding ours on
top produces two layers that disagree, because word timings come from the platform's
auto-captions and drift against the speech. With captions off, no subtitle file and no
caption QC probe are generated at all.

```bash
python -m afterplay.cli run --captions ...
```

## ASR

```bash
pip install faster-whisper
export AFTERPLAY_WHISPER_SIZE=base          # downloaded on first use
# or, on a locked-down box, point at a pre-downloaded CTranslate2 model:
export AFTERPLAY_WHISPER_MODEL=/models/faster-whisper-base
export AFTERPLAY_SUBTITLE_LANGUAGES=en,en-US,en-GB,en-orig
export AFTERPLAY_ASR_LANGUAGE=en
```

If weights cannot be loaded, `transcribe` raises `ASRUnavailable` and the job silently
continues on audio-energy detection. Transcripts are written to `asr.vtt` in the job
directory, so the VTT parser stays the single entry point for every transcript and an
ASR run is inspectable and re-runnable.

## The analytics loop

```python
from afterplay.insights import Analytics, Metric
a = Analytics("ksi")
a.record_post(clip, "shorts", post_id="abc123")     # links features to the post
a.ingest_csv("youtube_export.csv")                  # or record_metric(...) from an API
a.compute_priors()                                  # per-feature lift vs this creator
a.ranking_hints()                                   # what the next job's ranker uses
```

Lift is measured against the creator's **own** average, never an absolute benchmark,
because channels differ by orders of magnitude. Retention dominates the score because
it is the thing a clip actually controls; raw views are mostly distribution.

## MCP server

```bash
pip install "mcp[cli]"
python -m afterplay.mcp_server
```

```json
{"mcpServers": {"afterplay": {"command": "/path/.venv/bin/python",
                              "args": ["-m", "afterplay.mcp_server"]}}}
```

Five tools: `plan_clips` (cheap — no video), `make_clips` (expensive, and its
description says so, so a model does not reach for it casually), `inspect_clip`,
`creator_report`, `transcribe`. Errors come back as JSON, never a traceback.

## Bugs this build found and fixed

Kept here because they are the reason the tests and skills look the way they do:

- **`probe()` reported every file as silent.** It parsed `ffmpeg -i` output at
  `-loglevel error`, which suppresses `Stream #…` lines — so every render got `-an`.
  QC caught it (`no decodable audio`) rather than shipping silent clips.
- **Rolling auto-captions triplicated the transcript** (2343 real words read as 5632),
  and VTT cue settings (`align:start position:0%`) were parsed as speech.
- **Cue text was orphaned** by blank-line block splitting: YouTube separates a cue's
  timing from its text with a line containing a *single space*.
- **~100 crop keypoints broke ffmpeg** (`Missing ')' or too many args`) on fast-cut
  footage. Now bounded, falling back to a static crop — which is better craft anyway.
- **A caption clipped by the frame edge measured as "exactly at the edge"** and passed.
- **`>>` speaker markers were burned into captions.** They are a ranking signal, never
  caption text.
- **`afterplay.resolve` the function shadows the `afterplay.resolve` submodule**, so
  `from . import resolve` binds the function. Shipped twice before a CLI test caught it.

## Requires credentials or a network to exercise

Everything below is implemented and unit-tested against its degradation path, but could
not be verified end-to-end from this machine:

- ~~**Whisper weights** could not be downloaded here~~ — **resolved.** The weights now
  download and the ASR path is verified end to end on real caption-less gameplay:
  15 minutes of audio, 2427 words at language confidence 0.97, transcribed in 113.7s with
  `tiny` on CPU/int8, producing 5 named channel-memory threads. See
  [EVIDENCE E-025](../../docs/prd/EVIDENCE.md#e-025-asr-backfill-on-a-caption-less-source).
  `faster-whisper` stays an optional dependency: without it `backfill` fails with an
  actionable error naming the install command, never a silent no-callback run.
- **The LLM policy** (`--llm`: ranking + vision QC + copy) needs `ANTHROPIC_API_KEY`.
  Tested with fake clients covering success, malformed JSON and API failure.
- **Platform metric APIs.** `Analytics` ingests CSV/JSON exports today and takes
  `record_metric` from any connector; no OAuth client is included.
- **SponsorBlock** returned no segments for the test videos (a 404, meaning "none
  submitted"), so the filtering path is tested with synthetic spans.
- **`setup.sh`** is syntax-checked but was written and committed from Windows; it has
  not been executed on a Linux or macOS host.

Still genuinely absent: publishing integrations (posting on a creator's behalf),
multi-speaker reframe switching, b-roll and zoom-punch effects, and A/B hook
experimentation.

## Legal

Prefer **creator-owned** content via `--local` or a connected account. Third-party
platform extraction raises ToS and copyright questions and should be gated behind an
explicit rights attestation. Publishing should use official platform APIs.
