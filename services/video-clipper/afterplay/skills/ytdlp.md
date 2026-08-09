---
name: ytdlp-ingestion
description: "yt-dlp for a clipping pipeline: metadata-only resolution, caption/transcript retrieval, engagement heatmaps, chapters, SponsorBlock, comment-timestamp mining, storyboards, direct stream URLs for range-fetching, format selection, throttling, auth/cookies, JS runtimes and impersonation. Use for any source ingestion, transcript pull, or 'what can I learn before downloading video' step."
version: 1.0.0
---

# Skill — yt-dlp for ingestion

yt-dlp is used here as a **resolver and metadata miner**, not a downloader. The whole
architecture depends on learning everything possible from kilobytes of text before any
video byte is fetched. Do not fork it and do not reach for `--download-sections` by
reflex — you usually want direct URLs plus your own ffmpeg range-fetch, because that
parallelises across clips.

## The one call that gets you everything cheap

```bash
yt-dlp --skip-download --write-info-json --write-auto-subs --write-subs \
       --sub-langs "en,en-orig,en-US" --sub-format vtt \
       -o "source.%(ext)s" "$URL"
```

~700 KB for a 15-minute video: the full transcript plus every metadata signal below.
Typically 1–3 s. This is the entire decision phase's input.

## Signals in `info.json`, ranked by how much they predict a good clip

| Field | What it gives you | Reality check |
|---|---|---|
| `subtitles` / `automatic_captions` | word-level timings via VTT — the primary signal | auto-captions are ROLLING; see the parsing trap below |
| `heatmap` | most-replayed curve: `[{start_time, end_time, value}]` | **often absent.** Missing on new uploads and many mid-size channels. Treat its absence as the default case |
| `chapters` | creator-authored segment boundaries with titles | free semantic segmentation when present |
| `sponsorblock` markers | crowd-sourced sponsor/intro/outro/self-promo spans | never clip a sponsor read; subtract these spans from candidates |
| `comments` (`--write-comments`) | viewers post timestamps ("3:42 killed me") | a genuine engagement signal most tools ignore. Expensive: fetches pages of comments |
| `duration`, `view_count`, `like_count` | job sizing and priors | — |
| `storyboards` (format `sb0`/`sb1`) | sprite sheets of thumbnails | a visual preview for pennies, without touching the video |

## Getting direct stream URLs for range-fetching

```bash
yt-dlp -g -f "bv*[height<=1080]+ba/b[height<=1080]/b" "$URL"
```

- Prints video and audio URLs on separate lines for adaptive (DASH) sources. **Hand both
  to ffmpeg with their own `-ss`** — see the ffmpeg skill.
- URLs are **short-lived and IP-bound**. Resolve them immediately before extracting; do
  not cache them across a job that might sit in a queue.
- Always include a progressive fallback (`/b`) in the format string. A source with no
  separate streams otherwise fails the whole job.
- `-S "res:1080,fps,vcodec:h264"` sorts by preference and is usually better than a long
  filter expression. Prefer h264 over AV1 when you will re-encode anyway: AV1 decode is
  slower and some builds lack it.

## Format selection that will not surprise you

- `bv*+ba` = best video plus best audio, merged. `b` = best single progressive file.
- Cap resolution deliberately (`height<=1080`). A 4K source triples fetch and decode
  cost for output that ships at 1080×1920.
- `--concurrent-fragments 4` speeds up fragmented sources materially.
- `--limit-rate` is a courtesy that also avoids tripping throttling on large pulls.

## The parsing trap: rolling auto-captions

YouTube auto-caption VTT repeats itself. A short "carry" cue restates the previous line,
then the next cue restates it *again* as plain text and appends new words wrapped in
`<00:00:04.640><c> word</c>`. Two consequences:

1. Reading each cue's full text yields a **3–4× duplicated transcript**, which wrecks
   every downstream signal (word counts, density, LLM input).
2. Cue **settings** (`align:start position:0%`) sit on the timing line after the
   timestamps. Slice from the end of the timestamp match and you read them as speech.

Parse the `<TS><c>word</c>` tags to get **word-level timings**, dedupe by monotonic
timestamp, and strip the already-seen prefix from each cue's plain-text run. Also: cues
are separated from their text by a line containing a **single space**, not a blank line,
so a blank-line-splitting parser orphans the text on files that do use blank lines.
Verify a parser by asserting the word count is plausible (~150 wpm × minutes).

## Auth, bot walls and runtimes

- **`--cookies-from-browser chrome`** (or `firefox`) authenticates as the logged-in user:
  members-only content, age-gated video, and a way past some bot checks. On a headless
  box with the operator's own login this is the practical path. Handle with care — these
  are real credentials.
- **A JS runtime is now expected.** Without one (`deno` by default, or
  `--js-runtimes node`) yt-dlp warns and **silently offers fewer formats** — you can end
  up with a 360p progressive stream and think that is all the source has. If your
  resolved height looks implausibly low, this is why.
- **Impersonation** (`--impersonate`, needs `curl-cffi`) presents a real browser TLS
  fingerprint and clears some blocks. Without it you may see "no formats" on sources
  that work in a browser.
- Client choice matters: `--extractor-args "youtube:player_client=web"` can expose fields
  the mobile clients omit, but the web client needs the JS runtime. `android_vr` works
  without one but returns a smaller format set and no heatmap.

## Robustness rules

1. **Never assume a field exists.** `heatmap`, `chapters`, `comments` and even captions
   are all frequently absent. `info.get("heatmap") or []`, always.
2. **No captions is not a dead end.** Fetch **audio only** (`-f ba`, ~5–10 MB for 15
   minutes) and run ASR. Still a fraction of the video.
3. **Pin the version and expect breakage.** Extractors break when platforms change; that
   is a monitored failure mode with an alert, not a surprise.
4. **Use the Python API for orchestration**, the CLI for exploration. `YoutubeDL(...)
   .extract_info(url, download=False)` gives the full dict without a subprocess. Note
   that `writeinfojson`/subtitle writing only lands on disk via `process_info`.
5. **`--dump-json` on a playlist emits one object per line** — do not `json.load` the
   whole stream.
6. Prefer **direct upload / connected-account ingest for creator-owned content**. It is
   faster, has no extractor to break, and avoids the platform-ToS question entirely.
   Treat third-party extraction as the higher-risk path and gate it behind a rights
   attestation.

## Guidelines for an agent using this skill

1. Resolve metadata + captions **first**, in one call. Log what was and was not present
   (`heatmap: absent` is important context for the ranking step).
2. Decide clip windows from text alone. Do not fetch stream URLs until the windows exist.
3. Subtract SponsorBlock spans from candidate windows before ranking.
4. Resolve stream URLs **immediately before** extraction, then range-fetch each window
   in parallel.
5. On "requested format not available", re-resolve with a progressive fallback and log
   the degradation — do not fail the job.
6. When output resolution is surprisingly low, check for the JS-runtime warning before
   blaming the source.
