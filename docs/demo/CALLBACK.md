# Callback Demo Contract

This file is the demo checklist for proving the clipping/creator-helper idea with
real creator-owned material. Do not mark the demo complete until a real callback clip
has been selected and the cited source timestamp has been verified.

## Inputs — VALIDATED AND RENDERED 2026-08-07 (A5 / G6 closed)

Creators: **KSI/Sidemen** (hero) and **iShowSpeed** (generalisation proof). Both are
third-party YouTube content resolved with yt-dlp. Rights status is
`third_party_extracted`, not creator-owned — disclose in `docs/THIRD_PARTY.md` and never
label it otherwise in the UI.

- Creator id: `probe_ksi` (rename to the demo creator before recording)
- **Prior (setup) stream:** `nxGlZX9GH5I` — *SIDEMEN AMONG US: KSI SHAPESHIFTER MASTERCLASS*
- **Current (payoff) streams:**
  - `X955SmTm1rY` — *AMONG US BUT EVERYONE'S NAME IS A PRONOUN* (2 callbacks)
  - `BW_MAa5L9lg` — *AMONG US BUT KSI CHOOSES ALL THE ROLES* (1 callback, the hero)
- Transcripts: YouTube auto-captions, resolved by `backfill` / `resolve`. Cached under
  `services/video-clipper/.demo-cache/<video_id>/` (gitignored — third-party transcripts
  must not be committed).

### Verified callbacks (live OpenAI, real auto-captions)

**Hero — "Frame Ethan to clear his name" — RENDERED, confidence 0.93**

Produced end to end by `run --memory` as job `hero_callback`:
`clip01_shorts.mp4`, 1080x1920, 21.8s, real audio, first-pass QC. Studio serves it as
the newest manifest. Full command and decoded verification in
[EVIDENCE.md E-015](../prd/EVIDENCE.md#e-015-hero-callback-rendered).


- Setup: `nxGlZX9GH5I` @ 2488.1s — *"okay I might shapeshift into Ethan and then kill
  Harry, I need to clear my name people"*
- Payoff: `BW_MAa5L9lg` @ 2409–2433s — *"so I just kill Harry and cover the body and it's
  fine"*
- Why it is the hero: a plan stated in one stream, executed in another, ~40 minutes into a
  41-minute video. Manual scrubbing does not find this.

**"10 million subscriber Among Us promise" (confidence 0.98)**

- Setup: `nxGlZX9GH5I` @ 4.2s — *"if we get 10 mil Subs we'll drop a 2-hour Among Us
  video — not a compilation"*
- Payoff: `X955SmTm1rY` @ 451–473s — *"we said a 2 hour Among Us episode when we reach 10
  million but we've decided to change it"*

**"Silent Toby" (confidence 0.86)**

- Setup: `nxGlZX9GH5I` @ 577.2s — *"Toby last round he hasn't said a word"*
- Payoff: `X955SmTm1rY` @ 547–571s — *"now he has to stay muted… well Toby can't talk"*

The payoff windows do **not** repeat the setup wording ("stay muted" vs "hasn't said a
word"), so this is semantic matching rather than keyword overlap. `degraded=False` on both
runs, and only 8–9 threads were considered per stream, so the top-K gate held.

### Known blockers before recording

1. **YouTube bot-blocking is intermittent.** After roughly eight resolves in quick
   succession, yt-dlp returns *"Sign in to confirm you're not a bot"*. The throttle
   later lifted and all three streams are now cached. Ingestion supports
   `--cookies` / `--cookies-from-browser` (browser must be CLOSED, yt-dlp issue 7271),
   `--sleep-interval` and `--extractor-args` across every extraction path.
2. **The recording no longer depends on YouTube.** This was previously a warm-up
   dependency — `afterplay predemo <ids>` had to report **ready** in a window where
   YouTube was cooperating, or there was no demo. It no longer is: with the media file
   and its captions on disk, `run --memory --local … --vtt …` renders the callback clip
   with **no yt-dlp call and no YouTube request at all**. Verified end to end —
   [E-023](../prd/EVIDENCE.md#e-023-demo-without-youtube). `predemo` is now a convenience
   for *building* that cache, not a gate on recording. Cache every demo video first,
   then record.

   **This is not fully offline, and must not be described as such.** The memory pass
   still calls the OpenAI API for embeddings and callback judging — that is live mode
   working as designed, and it is the one network dependency left at record time. The
   difference that matters: OpenAI does not rate-limit the demo the way YouTube's
   anti-bot throttle did.
3. All three callbacks trace back to the single prior stream `nxGlZX9GH5I`. Backfilling
   more history would make the memory claim more convincing.
4. **Run commands from the repo root or the service directory — either works now.**
   `AFTERPLAY_WORKDIR` and `AFTERPLAY_MEMORY` are repo-root-relative in `.env` and were
   previously resolved against the current directory, so running from
   `services/video-clipper` wrote artifacts to a nested path Studio never reads. Fixed
   and covered by `TestConfiguredDirs`.

## Authored Smoke Artifact

The repo may contain a gitignored local smoke run at:

- `services/video-clipper/.memory/e2e_demo/threads.json`
- `services/video-clipper/.work/e2e_callback/manifest.json`

That artifact proves plumbing only. It uses deterministic test stubs and must be labelled
synthetic if used as a fallback demo. The real submission pass should still fill the input
fields above with creator-owned streams and a live OpenAI run.

## Expected Evidence

The clip manifest should include:

- `signals.callback: true`
- `signals.thread_id`
- `signals.thread_label`
- `signals.confidence`
- `signals.source_stream`
- `signals.source_t`
- `signals.source_quote`
- `signals.why`
- `memory.degraded`
- `memory.reason`
- `memory.threads_considered`
- `memory.callback_found` — true only when a CLIPPED moment carries the callback
- `memory.callbacks_ranked_out` — callbacks that scored below the clips returned
- `memory.callbacks_filtered_out` — selected callbacks removed by post-ranking safety filters
- `message` for no-callback or degraded outcomes

### Callback outcome states

- **Callback found (success):** ranked moments should include `signals.callback: true` and a
  populated callback thread citation.
- Callback matches must be precision-first; do not fabricate moments. If confidence is low or
  evidence cannot be cited, prefer the no-callback outcome.
- **No memory-dependent callback found (valid fallback):**
  `signals.callback: false`, `memory.degraded: false`, and `memory.callback_found: false`;
  UI message must be
  `"No memory-dependent callback found in this run. Showing highest-quality standalone clips."`
- **Callback found but ranked out (valid, and distinct):** a callback was detected in a
  window that scored below the clips returned. `memory.callback_found: false` with
  `memory.callbacks_ranked_out > 0`, and the message says so and suggests asking for more
  clips. `callback_found` previously described every candidate scored rather than the
  clips shipped, so this case claimed a callback the manifest could not cite —
  [E-024](../prd/EVIDENCE.md#e-024-callback-found-reflects-shipped-clips).
- **Callback removed by a safety filter (valid, and distinct):** `callback_found: false` with
  `callbacks_filtered_out > 0`; the message says the candidate did not make the final cut after
  post-ranking filtering and does not claim it merely lost on score.
- **Failure/degraded states (invalid):** `memory.degraded: true` with a reason; UI must still keep
  a visible error path (model id/key/IO/auth/network problems, parsing errors, etc.) instead of
  rendering an empty callback success. Distinguish this from the no-callback but valid fallback message:
  `"No memory-dependent callback found in this run. Showing highest-quality standalone clips."`

## Commands

```powershell
cd services\video-clipper
$env:PYTHONPATH='.'
$env:AFTERPLAY_MEMORY="$PWD\.memory"
$env:OPENAI_API_KEY="<set outside git>"

python -m afterplay.cli backfill --creator demo --stream-id prior_001 --vtt path\to\prior.vtt
python -m afterplay.cli --json run --memory --creator demo --local path\to\current.mp4 --vtt path\to\current.vtt --rights permission_granted --clips 3 --platforms shorts
```

## Review Notes

- Confirm `source_quote` appears verbatim near `source_t` in the prior transcript.
- Confirm the current clip is understandable without watching the full stream.
- Confirm callback evidence or no-callback fallback appears in JSON output and any app evidence panel
  that consumes the manifest.
- Confirm `memory.degraded: true` cases are surfaced as explicit errors and never as
  "no callback found".
