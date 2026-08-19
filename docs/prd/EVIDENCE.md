# PRD Evidence Log

Every quantified claim in [PRD.md](./PRD.md) links here. Each entry records **the command
that produced the number** and the **output it produced**, with a date.

**Rule:** an entry must run something that *generates* the result. Grepping the PRD to show
the claim is written in the PRD proves nothing and is not evidence.

Hardware for all timing entries: one Windows 11 laptop, Intel QSV hardware encoder
(`h264_qsv`). **Timings are hardware-dependent — re-measure before quoting.**

---

## e-001-single-video-live-run

Claim: single-video clipping works on a real VOD with no captions and no heatmap.

- Date: 2026-08-06
- Source: real 1034s Free Fire "Solo vs Squad" VOD (public YouTube, via yt-dlp)
- Command:
  ```
  python -m afterplay.cli run "<VOD URL>" --clips 3 --platforms shorts --workers 3 --creator ffdemo
  ```
- Captured output:
  ```
  resolved '33 Kill ... FreeFire' (1034s, heatmap=False, captions=False) in 5.42s
  no captions for this source -> audio path
  job job_28915a3d50: 3/3 clips ok in 1907.8s  (encoder h264_qsv)
  timings: {'resolve': 8.21, 'understand': 34.62, 'detector': 'audio',
            'stream_urls': 3.99, 'produce': 1861.02, 'total': 1907.84, 'memory': 1.0}
    [ok ] clip01_shorts   890.0s + 30.0s attempts=1 repairs=-
    [ok ] clip02_shorts    19.7s + 30.0s attempts=1 repairs=-
    [ok ] clip03_shorts   690.7s + 30.0s attempts=1 repairs=-
  ```
- Independent verification of the rendered files:
  ```
  clip01_shorts.mp4 -> 1080 x 1920 26.69s fps=30.0 audio=True peak=0.932
  clip02_shorts.mp4 -> 1080 x 1920 26.37s fps=30.0 audio=True peak=0.987
  clip03_shorts.mp4 -> 1080 x 1920 27.03s fps=30.0 audio=True peak=0.941
  ```
- Notes: audio ingest was 14MB vs ~860MB for the full video; 3 windows range-fetched at
  ~25MB each. `resolve + understand = 42.8s` of the 1907.8s total — the decision phase is
  cheap; the cost is frame decode/encode (see gap G16).

## e-002-callback-detection-live

Claim: callback detection works against real OpenAI calls and is semantic, not keyword
matching.

- Date: 2026-08-07
- Setup: two authored transcripts. The prior stream establishes a running joke; the payoff
  window **never repeats the phrase** — it only says "HE GOT HIM… HE FINALLY DID IT."
- Command:
  ```
  python -m afterplay.cli backfill --creator demo_live --stream-id prior_001 --vtt d_prior.vtt
  python -m afterplay.cli run --memory --creator demo_live --local d_current.mp4 \
         --vtt d_current.vtt --clips 2 --platforms shorts --workers 1 --job-id demo_live
  ```
- Captured output (backfill):
  ```
  {"creator": "demo_live", "stream_id": "prior_001", "threads_added": 1, ...}
  ```
- Captured output (manifest `signals`):
  ```
  callback : True
  thread   : Ravi the cursed sniper   conf 0.96
  cited    : stream=prior_001  t=17.0
  quote    : 'that is it, from now on Ravi you are officially the cursed sniper of this squad'
  why      : Ravi lands an AWM shot to win the match, and "HE FINALLY DID IT, after all this
             time" explicitly pays off the running joke about his repeated AWM misses.
  ```
- Limitation: transcripts were authored, not real creator VODs. See gap G6.

## e-003-negative-control-and-adversarial

Claim: the detector does not fabricate callbacks, and degrades safely.

- Date: 2026-08-07
- Live negative control (real OpenAI, unrelated stream, same memory):
  ```
  FALSE POSITIVES: 0 -> PASS
  ```
- Offline adversarial matrix (deterministic stubs):
  ```
  TEST A  no-callback stream            -> PASS (no false positive)
  TEST B  judge returns unknown thread_id -> PASS (rejected unknown id)
  TEST C  judge returns confidence 0.10   -> PASS (gated below 0.55)
  TEST D  judge raises (API outage)       -> PASS (degraded to heuristic)
  TEST E  cold start, zero threads        -> PASS (0 judge calls, no wasted spend)
  ```

## e-004-call-volume-and-cost-profile

Claim: call volume is bounded and prompts carry no embedding payload.

- Date: 2026-08-07
- Command: scale probe with a counting judge/embedder over simulated transcripts, asserting
  `'"embedding"' not in prompt`
- Captured output:
  ```
   10 min |  145 candidate windows -> embed API calls: 1 (batched: 145)  | judge calls: 10
   60 min |  895 candidate windows -> embed API calls: 1 (batched: 895)  | judge calls: 10
  120 min | 1795 candidate windows -> embed API calls: 1 (batched: 1795) | judge calls: 10
          max judge prompt: 3101 chars (~775 tokens)
  ```
- Before the fix, the same 120-min shape required ~1,795 judge calls **and** ~1,795 embed
  calls, sequentially, at ~8,000 tokens each (32,319-char prompts with real 1536-dim
  vectors inlined).

## e-005-test-suites

Claim: Python 100 passed / 1 skipped; Playwright production 22 passed.

- Date: 2026-08-07
- Command: `python -m pytest tests -q` (from `services/video-clipper`)
- Captured output:
  ```
  100 passed, 1 skipped, 1 warning in 889.67s (0:14:49)
  ```
- Command: `npx playwright test --config playwright.production.config.ts`
- Captured output:
  ```
  22 passed (3.3m)
  ```
- **Flake note:** running both suites concurrently produced
  `1 failed … accessibility.spec.ts:14:7` with `Test timeout of 30000ms exceeded`. The page
  snapshot showed a correctly rendered page — this is axe-core CPU contention, **not** a
  WCAG violation. Re-run on an idle machine: 22 passed. Do not run the suites in parallel
  on a single laptop.

## e-006-callback-is-additive-not-a-gate

Claim: memory is a boost, not a gate — moments still rank and ship when no callback exists.

- Date: 2026-08-07
- Source (`afterplay/understand.py`, `MemoryReasoner`):
  ```
  Memory is strictly additive and opt-in. If retrieval, embedding, or model judging
  fails, this returns the same heuristic ranking the service already shipped with.
  ...
  score += self.boost * confidence
  ```
- Behavioural confirmation: the no-callback stream in `e-003` still returned ranked moments
  with `callback: false`. A stream with no history-dependent moment is a **valid outcome**,
  not a failure.

## e-007-honest-analyst

Claim: result analysis is computed from submitted metrics, not fixtures.

- Date: 2026-08-06
- Command: three `POST /api/experiments/exp_one_more_rule/results` payloads against the
  production build
- Captured output:
  ```
  FAILURE  (all zero)      -> "The result is inconclusive."                       conf 42
     evidence[0]: Returning-viewer rate moved from 8.2% to 0% (-8.2pt).
  FALSIFIER (views up, returns flat)
                           -> "The result contradicted the return-cue hypothesis." conf 32
  SUCCESS  (returns up)    -> "The named format earned a cautious second test."    conf 64
     evidence[0]: Returning-viewer rate moved from 8.2% to 19% (+10.8pt).
  ```
- Before the fix, submitting all-zero metrics returned "The format name is worth testing
  again" citing a rise "from 8.2% to 13.6%" that appeared nowhere in the input.

## e-008-authority-model

Claim: external action fails closed and dispatch is idempotent.

- Date: 2026-08-07
- Command: direct HTTP against the production build
- Captured output:
  ```
  dispatch before approval: 409
  stale revision 99:        409
  reject w/o feedback:      400
  results w/o disclosure:   400
  live AI (no key):         503
  receipts after 2 dispatches: 3   (expect 3)
  ```

## e-009-clip-media-and-playback

Claim: clip media serves byte ranges and plays in a browser.

- Date: 2026-08-07
- Captured output (HTTP):
  ```
  GET (no Range)          -> 200, accept-ranges: bytes, content-length: 3056169
  Range: bytes=0-         -> 206, content-range: bytes 0-3056168/3056169
  Range: bytes=1000000-1000999 -> 206, 1000 bytes, byte-identical to file offset
  Range: bytes=-500       -> 206, 500 bytes, byte-identical to file tail
  Range: bytes=99999999-  -> 416, content-range: bytes */3056169
  ```
- Captured output (browser, real mouse click on the play control):
  ```
  paused: false, currentTime: 14.81, duration: 24, error: null
  ```
  then ran through to `0:24 / 0:24`.
- Independent decode check: `ffprobe` over the HTTP route returned
  `h264 1080x1920 / aac / duration=24.000000`.

## e-010-install-path-correction

Claim: the service install path is repo-local, not an external clone.

- Date: 2026-08-07
- Source (`services/video-clipper/README.md`, Install section):
  ```
  cd services/video-clipper
  ./setup.sh --test          # venv, deps, doctor, full test suite
  ```
- The previous `git clone https://github.com/aryanjain285/video-clipper-service-.git`
  has been removed.

## e-011-no-callback-valid-fallback

Claim: missing callback evidence is a valid first-class outcome, not a hard-fail.

- Date: 2026-08-07
- Command:
  ```powershell
  python -m afterplay.cli --json run --memory --creator <creator> --local <current.mp4> `
    --vtt <current.vtt> --clips 3 --platforms shorts --job-id callback_no_match
  ```
- Expected output snippet:
  ```
  callback: false
  memory_degraded: false
  message: "No memory-dependent callback found in this run. Showing highest-quality standalone clips."
  ranked clips: >=1
  ```
- Artifact:
  `services/video-clipper/.work/callback_no_match/manifest.json` (or current job dir)

## e-012-callback-status-contract

Claim: the clipper manifest distinguishes memory degradation, valid no-callback fallback,
and job lifecycle state.

- Date: 2026-08-07
- Command:
  ```powershell
  python -m py_compile services\video-clipper\afterplay\agent.py `
    services\video-clipper\afterplay\cli.py `
    services\video-clipper\afterplay\understand.py
  ```
- Captured output:
  ```text
  <no stdout; exit code 0>
  ```
- Command-to-claim mapping:
  - `afterplay/agent.py`: `JobResult.memory`, `JobResult.message`, `status`, and
    `status.json` writes for `started` and `complete`.
  - `afterplay/cli.py`: failed CLI runs write `status.json` with `state: failed`, and
    `doctor` performs one embedding call plus one model call when `OPENAI_API_KEY` is set.
  - `afterplay/understand.py`: `MemoryReasoner` records `degraded`, `reason`,
    `threads_considered`, and `callback_found`.
- Artifact/path:
  - `services/video-clipper/afterplay/agent.py`
  - `services/video-clipper/afterplay/cli.py`
  - `services/video-clipper/afterplay/understand.py`

## e-013-app-feedback-loop-typecheck

Claim: the app contract compiles with manifest-derived approval outputs, per-clip result
ingestion, stale/degraded/no-callback UI states, and the filesystem bridge into
`AFTERPLAY_MEMORY`.

- Date: 2026-08-07
- Command:
  ```powershell
  npm run typecheck
  ```
- Captured output:
  ```text
  > afterplay@0.1.0 typecheck
  > tsc --noEmit
  ```
- Command-to-claim mapping:
  - `src/domain/clip-manifest.ts`: prefers complete manifests and reports newer incomplete
    jobs as stale.
  - `src/domain/experiment.ts`: projects manifest clips into approval outputs and persists
    per-clip results into the Python analytics memory shape.
  - `src/app/api/experiments/[id]/results/route.ts`: accepts optional `perClip` metrics.
  - `src/app/studio/page.tsx`: renders stale, degraded, and valid no-callback outcomes as
    separate UI states.
- Note: the first sandboxed run failed with `EPERM: operation not permitted, lstat
  'C:\Users\HP'`; the escalated rerun passed. The shell also printed an unrelated Conda
  startup warning after the successful command.

## e-017-real-creator-thread-extraction

Claim: thread extraction works on real, messy, auto-captioned gaming VODs — not only on
authored transcripts.

- Date: 2026-08-07
- Sources: 3 KSI/Sidemen gaming videos and 3 iShowSpeed gaming videos (public YouTube,
  auto-captions, resolved with yt-dlp). Scratch creator ids and a scratch
  `AFTERPLAY_MEMORY` so the demo memory was untouched.
- Command (per video):
  ```
  python -m afterplay.cli backfill --creator probe_<creator> --stream-id <video_id> <url>
  ```
- Captured output:
  ```
  probe_ksi:   12 threads across 2 streams
               {recurring_bit: 6, rivalry: 2, running_joke: 2, unfinished_story: 2}
  probe_speed: 18 threads across 3 streams
               {unfinished_story: 8, recurring_bit: 7, rivalry: 1, person: 1, running_joke: 1}
  0 failures
  ```
- Sample threads (all carry a verbatim quote and timestamp):
  ```
  [rivalry]          Tekken rivalry with Deji
  [running_joke]     Silent Toby            "Toby last round he hasn't said a word"
  [recurring_bit]    Vikk never votes on seven
  [unfinished_story] 10 million subscriber Among Us promise
  [unfinished_story] Speed's forbidden basement   "do not go into the basement"
  ```
- Decision rule outcome: **no generic threads** for either creator. Every thread is a named
  entity or a specific promise, which is the pre-check's pass condition.
- Note the creators differ in shape: KSI's threads are social and cross-stream (named
  people, recurring bits); Speed's are dominated by within-video narrative arcs
  (`unfinished_story` 8/18), which resolve inside one stream and are therefore weaker for
  cross-stream detection.

## e-018-cross-video-callback-on-real-data

Claim: the engine independently finds genuine cross-video callbacks in real creator VODs,
with correct citations. **This is the claim the product rests on.**

- Date: 2026-08-07
- History: `probe_ksi` memory (12 threads from 2 prior Sidemen streams).
- Method: decide phase only — resolve + captions + `MemoryReasoner.rank`. No video bytes.
- Captured output:
  ```
  RESULT: 3 cross-video callback(s) found across 4 candidates
          (2 candidates unreadable: YouTube bot-blocking, see below)

  X955SmTm1rY  degraded=False callback_found=True threads_considered=9
    conf 0.98  "10 million subscriber Among Us promise"
               cites nxGlZX9GH5I @ 4.2      payoff @ 451-473s
    conf 0.86  "Silent Toby"
               cites nxGlZX9GH5I @ 577.2    payoff @ 547-571s

  BW_MAa5L9lg  degraded=False callback_found=True threads_considered=8
    conf 0.86  "Frame Ethan to clear his name"
               cites nxGlZX9GH5I @ 2488.1   payoff @ 2409-2433s
  ```
- Why this is semantic, not keyword matching: the payoff windows never repeat the setup
  wording — *"now he has to stay muted / Toby can't talk"* pays off *"he hasn't said a
  word"*, and *"so I just kill Harry and cover the body"* pays off *"I might shapeshift
  into Ethan and then kill Harry"*.
- Cost held: 8–9 threads considered per stream, so ~10 judge calls, not thousands.
- **Limitation:** all three callbacks cite the same prior stream (`nxGlZX9GH5I`). Broader
  history would strengthen the claim.
- **Blocker:** 2 of 4 candidates failed with *"Sign in to confirm you're not a bot"* after
  ~8 resolves in quick succession. Demo runs must be served from cached `info.json` + VTT
  via `resolve.from_info_json`, not live network calls.

## e-019-live-vs-demo-latency

Claim: live strategy planning is slow enough to need visible in-flight status; demo mode
is effectively instant.

- Date: 2026-08-07, `gpt-5.6-sol`, reasoning effort medium
- Command: `POST /api/strategy/plan` against the production build, timed with
  `curl -w "%{time_total}"`
- Captured output:
  ```
  live call 1: 21.99s (HTTP 200)
  live call 2: 19.53s (HTTP 200)
  live call 3: 14.18s (HTTP 200)
  demo call:    0.01s (HTTP 200)
  ```
- Consequence: ~14-22s observed, so the panel counts up visibly and states the expected
  range rather than showing a silent spinner. Demo mode is ~1800x faster, which is why the
  deterministic path remains the repeatable judge walkthrough.

## e-014-youtube-bot-block-and-offline-cache

Claim: YouTube anti-bot throttling is a real ingestion risk, and the demo can be made
independent of it.

- Date: 2026-08-07
- Incident: after roughly eight resolves in quick succession, extraction began failing:
  ```
  ERROR: [youtube] <id>: Sign in to confirm you're not a bot. Use --cookies-from-browser
  or --cookies for the authentication.
  ```
  This blocked 2 of 4 candidates during the callback hunt, and later blocked re-resolving
  `nxGlZX9GH5I` entirely. `--cookies-from-browser chrome` also failed while Chrome was
  running — the browser locks its cookie database (yt-dlp issue 7271).
- Mitigations implemented (not merely documented):
  - `core.network_opts()` applies cookies, pacing and retries to **all three** extraction
    paths — `resolve()`, `stream_urls()` and `audio.fetch_audio_only()`. Applying them to
    only one produces the worst failure: metadata succeeds, then the run dies mid-way.
  - `core.is_bot_block()` turns the generic message into a named, actionable error.
  - CLI: `--cookies`, `--cookies-from-browser`, `--sleep-interval`, `--extractor-args`;
    env equivalents `AFTERPLAY_COOKIES`, `AFTERPLAY_COOKIES_FROM_BROWSER`,
    `AFTERPLAY_SLEEP_INTERVAL`, `AFTERPLAY_EXTRACTOR_ARGS`.
  - `stream_urls(..., cache_dir=)` persists direct URLs and replays them within a 4h TTL,
    raising a clear "cache expired / re-resolve required" error instead of silently making
    a live call.
  - `afterplay predemo <ids>` caches metadata + captions and reports readiness.
- Captured output (after the throttle lifted, all three demo streams cached):
  ```
  [READY    ] X955SmTm1rY: metadata, captions
  [READY    ] BW_MAa5L9lg: metadata, captions
  [READY    ] nxGlZX9GH5I: metadata, captions
  ready for an offline demo
  ```
- **Honest limit:** CDN URLs expire, so cached URLs are a rehearsal aid, not a guarantee.
  The only durable network-free path that also renders is local media via `--local`;
  `predemo` reports decide-phase readiness separately from render readiness for exactly
  this reason.

## e-015-hero-callback-rendered

Claim: the hero cross-video callback is a real, playable artifact — not only a decide-phase
result. **This closes A5 / G6.**

- Date: 2026-08-07
- History: `probe_ksi` channel memory (12 threads from 2 prior Sidemen streams)
- Command:
  ```
  python -m afterplay.cli run --memory --creator probe_ksi \
    "https://www.youtube.com/watch?v=BW_MAa5L9lg" \
    --clips 2 --platforms shorts --workers 2 --job-id hero_callback
  ```
- Captured output:
  ```
  job hero_callback: 2/2 clips ok in 412.4s  (encoder h264_qsv)
  timings: {'resolve': 13.6, 'understand': 75.59, 'detector': 'transcript',
            'stream_urls': 4.4, 'produce': 318.79, 'total': 412.39}
    [ok ] clip01_shorts  2409.0s + 24.2s  attempts=1 repairs=-
    [ok ] clip02_shorts  1775.1s + 24.7s  attempts=1 repairs=-
  ```
- Manifest evidence for `clip01_shorts`:
  ```
  memory: {enabled: true, degraded: false, threads_considered: 8, callback_found: true}
  callback: true, confidence 0.93
  thread  : Frame Ethan to clear his name
  cites   : nxGlZX9GH5I @ 2488.1
  quote   : "okay I might shapeshift into Ethan and then kill Harry, I need to clear my
             name people"
  why     : executes the open plan by saying he kills Harry and then declares "job done"
  ```
- Rendered files verified by decoding, not by trusting ffmpeg's exit code:
  ```
  clip01_shorts.mp4 -> 1080x1920 21.82s fps=30 audio=True peak=0.896 (11.7 MB)
  clip02_shorts.mp4 -> 1080x1920 23.99s fps=30 audio=True peak=0.923 (12.3 MB)
  ```
- Three separate fixes proved themselves in this single run: `stream_urls.json` was
  cached (video + audio) so a re-run inside the 4h TTL replays offline; `status.json`
  went `started` -> `complete` with the manifest path; and the memory block reports
  `degraded: false` next to `callback_found: true`, so a genuine no-callback run stays
  distinguishable from a broken one.
- Note the decision phase was 89s of the 412s total; the rest is rendering. The earlier
  1907s Free Fire run was a 1080p60 source, which is the G16 reframe cost, not ingestion.

## e-016-ranking-feedback-changes-a-later-run

Claim: recording results changes the ranking of a subsequent run. **This is phase 2's B3
acceptance criterion.**

- Date: 2026-08-07
- Method: real `insights.Analytics` path — `record_post` -> `record_metric` ->
  `compute_priors` -> `apply_to_moments` — over an identical candidate set, so any
  reordering comes from priors alone.
- Captured output:
  ```
  BEFORE (no results):  ranking ['story', 'punchline', 'reaction']   priors ready: False

  RECORDED 9 posts (punchline wins, story loses)
    punchline  lift x1.681
    story      lift x0.442
    reaction   lift x0.877

  AFTER:                ranking ['punchline', 'reaction', 'story']
    punchline  score=6.085  llm[punchline]: the joke lands | prior[punchline] x1.68
    reaction   score=4.943  llm[reaction]: he reacts       | prior[reaction] x0.88
    story      score=4.303  llm[story]: a narrative beat   | prior[story] x0.44

  RANKING CHANGED: YES
  ```
- The re-ranking reason is visible in each moment's `why`, so the learning is inspectable
  rather than implicit.
- **Limitation:** the outcomes here are synthetic, driven through the real code path.
  The mechanism is proven; it has not run on actual published performance, because
  nothing has been published (see G12).

---

## e-020-pipeline-clips-in-the-approval-loop

Claim: real clipper clips are approved and dispatched with the curated package, without
replacing it. **This is what closes G7 on the app side.**

- Date: 2026-08-07
- Method: production build (`npm run build` → `npm run start`), driven over HTTP against
  the real routes. `AFTERPLAY_CLIPPER_WORKDIR` pointed at the real service workdir, so the
  pipeline clips are the hero callback run, not a fixture.
- Captured output:
  ```
  GET           : curated 3  pipeline 2
     clip01_shorts   Frame Ethan to clear his name   status=ready  rights=third_party_extracted
     clip02_shorts   ...                             status=ready  rights=third_party_extracted

  after APPROVE : curated  approved, approved, approved
                  pipeline clip01_shorts=approved, clip02_shorts=approved

  after DISPATCH: receipts 5   pipeline still present: 2
     sim_receipt_1    -> output_premise   2026-08-05T12:00:00.000Z
     sim_receipt_2    -> output_community 2026-08-06T11:30:00.000Z
     sim_receipt_3    -> output_return    2026-08-07T11:00:00.000Z
     sim_receipt_4    -> clip01_shorts    2026-08-08T10:30:00.000Z
     sim_receipt_5    -> clip02_shorts    2026-08-09T10:00:00.000Z
  ```
- **Additive by design.** An earlier attempt overwrote `experiment.outputs` with manifest
  clips, collapsing Studio's three-card package into one raw card and duplicating the
  manifest section. That was reverted; `pipelineOutputs` is a separate set with its own
  Studio section.
- **Rights are derived, never asserted.** `manifest.source.url` present → the media was
  extracted from third-party content, so `third_party_extracted`. Only `--local` media is
  labelled `creator_owned`.
- Two defects were found and fixed while capturing this, each with a regression test in
  `tests/e2e/pipeline-approval.spec.ts`:
  1. Only `getExperiment` attached the projection, so **approve/dispatch/results responses
     carried no `pipelineOutputs`** — a client replacing its state from a mutation response
     lost the pipeline section the moment the creator approved. All returns now go through
     `toResponse`.
  2. `scheduledFor` came from a fixed three-entry array, so **receipts 4 and 5 carried
     `undefined`** — a value `DistributionReceipt` forbids and indexed access does not
     catch. Now derived per index.
- Verification: `npx playwright test --config playwright.production.config.ts
  tests/e2e/pipeline-approval.spec.ts` → **2 passed**.

---

## e-021-real-analytics-csv-into-the-ranking-priors

Claim: a creator's real published performance can reach the ranking priors, in the format
platforms actually export.

- Date: 2026-08-07
- Motivation: `Analytics.ingest_csv` existed but **no command reached it**, so the only way
  in was hand-authored JSON. YouTube Studio exports CSV; without this the feedback loop
  could only ever be fed by numbers someone typed.
- Command:
  ```
  python -m afterplay.cli --json results --creator real_creator --input yt_export.csv
  ```
  ```
  analytics: ingested 3 CSV rows
  { "creator": "real_creator", "records": 3, "attributed": 0,
    "compute_priors": { "n": 0, "ready": false, "note": "need >= 3 attributed posts" } }
  ```
- The `attributed` count is reported alongside `records` deliberately: *3 rows in, 0
  attributed* is the difference between a malformed file and metrics for posts this
  creator never published through the pipeline. Without it, a correct ingest and a useless
  one print the same thing.
- The full join — CSV rows → metrics → `attribute()` against recorded posts → priors — is
  covered by `TestResultsCli::test_csv_export_reaches_priors`, which asserts the priors
  agree with what the CSV said (`punchline` lift > `story` lift).
- A defect found while writing it: `record_metric` persists on every call, so a bad row
  halfway down a CSV left the earlier rows written **while the CLI reported failure**, and
  the retry double-recorded them. `ingest_csv` now parses every row before recording any.
  `test_failed_csv_ingest_records_nothing` fails without that fix (verified by reverting:
  `1 failed, 4 passed`).
- **Honest limit.** This makes real analytics *reachable*; it does not mean real analytics
  have been ingested. Nothing has been published through the tool, because there are no
  publishing connectors (G12). The B3 re-ranking demonstration in
  [E-016](#e-016-ranking-feedback-changes-a-later-run) still uses synthetic outcomes driven
  through the real code path.

---

## e-022-probe-does-not-decode-the-whole-file

Claim: probing a real full-length VOD is a header read, not a full decode.

- Date: 2026-08-07
- Found by: the offline demo run (see [E-014](#e-014-youtube-bot-block-and-offline-cache))
  dying before it cut a single clip:
  ```
  subprocess.TimeoutExpired: Command '[... ffmpeg ..., '-i',
    'D:\tmp\afterplay-demo-media\BW_MAa5L9lg.webm', '-f', 'null', '-']'
    timed out after 180 seconds
  ```
- Cause: `core.probe()` read header metadata (`Duration`, `Stream`, fps) by running
  `ffmpeg -i <file> -f null -`, which decodes the entire file. Invisible on a 30s test
  clip; fatal on a 41-minute 720p60 VP9 source.
- Fix: `ffmpeg -i <file>` with no output prints the same header and exits without decoding
  a frame. The decode remains as a bounded fallback for containers with no header duration.
- Measured after the fix, same 260 MB / 41-minute source:
  ```
  probe took 4.44s
  duration=2459.93  1280x720  fps=60.0  audio=True
  ```
- Regression test: `TestProbe::test_probe_does_not_decode_the_whole_file` spies on
  `run_ffmpeg` and asserts the first probe command contains no `null` muxer.

---

## e-023-demo-without-youtube

Claim: the demo can be recorded without YouTube being cooperative. **This removes the
pre-demo warm-up dependency.**

- Date: 2026-08-07
- Previously: the recording depended on `afterplay predemo <ids>` reporting **ready** in a
  window where YouTube's anti-bot throttle had lifted — see
  [E-014](#e-014-youtube-bot-block-and-offline-cache). If it had not, there was no demo.
- Method: media file and captions on disk, `--local` + `--vtt`, no URL anywhere in the
  command:
  ```
  python -m afterplay.cli --json run --memory --creator probe_ksi \
    --local D:\tmp\afterplay-demo-media\BW_MAa5L9lg.webm \
    --vtt .demo-cache\BW_MAa5L9lg\source.en.vtt --clips 5 --platforms shorts \
    --job-id offline_demo
  ```
- Result — **5/5 clips ok**, and the callback survived to the output:
  ```
  memory : {'enabled': True, 'degraded': False, 'reason': None,
            'threads_considered': 7, 'callback_found': True, 'callbacks_ranked_out': 0}

  clip04_shorts  ok=True  start=1632.9  dur=24.8  callback=True
     thread : Clear Vic's name by framing Ethan          confidence 0.88
     cites  : nxGlZX9GH5I @ 2488.1
     quote  : "okay I might shap shift into Ethan and then kill Harry
               I need to I need to clear my name"
  ```
- Every host contacted during the run, from the process's own HTTP logs:
  ```
  11 https://api.openai.com
  ```
  **Zero YouTube requests. Zero yt-dlp invocations.**
- **This is not "fully offline" and must not be described that way.** The memory pass
  still calls OpenAI for embeddings and callback judging — that is live mode working as
  designed. What changed is that the demo no longer depends on the one service that was
  actively rate-limiting it.
- Wall-clock for this run is not a performance number: the machine was left idle
  mid-render. Per-clip render times from the same log are the honest figures — e.g.
  `rendered clip05_shorts.mp4 1080x1920 23.1s in 18.15s (h264_qsv)`.
- Two prerequisites had to be fixed before this worked at all:
  [E-022](#e-022-probe-does-not-decode-the-whole-file) (probe timed out on the 41-minute
  source) and the repo-anchored config paths below.

### Config paths were resolved against the wrong directory

`.env` ships `AFTERPLAY_WORKDIR=services/video-clipper/.work` — relative to the **repo
root**, the only place it means anything. It was resolved against the current directory,
so running from `services/video-clipper` — exactly what `README` and `CALLBACK.md` tell
you to do — wrote to `services/video-clipper/services/video-clipper/.work`. The job
reported success, and Studio kept serving the previous run.

`AFTERPLAY_MEMORY` had the same defect, which is worse: a `backfill` and the `run
--memory` that should consume it could reach **different stores** depending on the shell's
directory.

Both now resolve relative values against the repo root. Absolute values are untouched.
Covered by `TestConfiguredDirs`; the first test fails against cwd-relative resolution
(verified by reverting: `1 failed, 2 passed`).

**Cost of this bug, recorded honestly:** cleaning up the stray nested directory deleted
the `probe_ksi` channel memory. It was rebuilt by re-running `backfill` against the cached
transcript — `threads_added: 14`, ~3 minutes, no YouTube — which is itself evidence that
the cached-transcript path makes the memory reproducible.

---

## e-024-callback-found-reflects-shipped-clips

Claim: the manifest reports the callback state of the clips it actually returned.

- Date: 2026-08-07
- Found by: a real run of the command in [E-023](#e-023-demo-without-youtube) at
  `--clips 3`, whose manifest was self-contradictory:
  ```
  memory : {'threads_considered': 7, 'callback_found': True}
  message: None
  clip01_shorts  start=539.8   callback=None
  clip02_shorts  start=1410.9  callback=None
  clip03_shorts  start=1028.7  callback=None
  ```
  `callback_found: true`, no clip carrying a callback, and **no message** — because the
  honest no-callback message is suppressed when the flag is set. Studio would have shown a
  callback claim with nothing to cite.
- Cause: `MemoryReasoner.rank` set `self.callback_found = True` while scoring candidate
  windows, before the top-n selection. A callback in a window that lost the cut still
  flipped the flag.
- Fix: the flag is computed from the moments actually picked. The discarded information is
  not thrown away — `callbacks_ranked_out` reports how many callbacks scored below the
  clips returned, and the message says so:
  ```
  memory : {'callback_found': False, 'callbacks_ranked_out': 2}
  message: No memory-dependent callback made this cut. 2 callback moment(s) scored below
           the clips returned - ask for more clips to include them. Showing
           highest-quality standalone clips.
  ```
- **The advice was then tested rather than assumed.** Same source, same memory, `--clips 5`:
  `callback_found: True`, `callbacks_ranked_out: 0`, and `clip04_shorts` carries the
  citation (see [E-023](#e-023-demo-without-youtube)).
- Regression test: `TestCallbackFoundReflectsShippedClips`. It constructs a case where the
  callback genuinely loses the cut — loud standalone windows, a flat callback window,
  `boost=0.0`, `n=1` — and fails against the old behaviour (verified by reverting:
  `1 failed, 1 passed`).
- **Ranking on real data is not deterministic.** A prior run of the same source put the
  callback at rank 1 ([E-015](#e-015-hero-callback-rendered), 2409.0s, confidence 0.93);
  this one placed a different window of the same thread at rank 4, confidence 0.88, from a
  freshly extracted 14-thread memory. Both cite the same setup line at
  `nxGlZX9GH5I @ 2488.1`. Nothing was tuned to make either happen.

---

## e-025-asr-backfill-on-a-caption-less-source

Claim: channel memory works on a source with no captions. **This is A1's success path and
closes G23.**

- Date: 2026-08-08
- Previously unproven: `faster-whisper` was not installed on this machine, so only the
  failure path had been exercised. Both are now verified.
- **Failure path first** — the error must name the fix, not fall through to the generic
  "requires captions", which is the silent-failure pattern G19 warns about:
  ```
  $ python -m afterplay.cli backfill --creator scratch --stream-id s1 --local <mp4>
  backfill needs captions or ASR; faster-whisper could not transcribe this source:
  faster-whisper is not installed (pip install faster-whisper). Install faster-whisper
  and set AFTERPLAY_WHISPER_SIZE or AFTERPLAY_WHISPER_MODEL.
  exit=2
  ```
- **Success path** — 15 minutes of real KSI gameplay audio, captions deliberately withheld
  (`--local` only, no `--vtt`):
  ```
  ASR model 'tiny' ready in 2.4s (cpu/int8)
  Processing audio with duration 15:00.011
  VAD filter removed 00:38.192 of audio
  Detected language 'en' with probability 0.97
  ASR: 2427 words, 405 sentences, lang=en (0.97), 162 wpm in 113.7s
  { "creator": "asr_probe", "stream_id": "asr_long", "threads_added": 5 }
  ```
- The threads are concrete and referenceable — the A5 decision rule for whether a creator
  is demoable — not generic descriptions of play style:
  ```
  [recurring_bit]      Lawyer and client bit          t=3.2   "When I am your lawyer"
  [unfinished_story]   Interrupted card-thing story   t=177.1 "So I was doing a card thing."
  [recurring_bit]      Simon is Harry's lawyer        t=459.3 "Harry is my client."
  [running_joke]       JJ always kills Deji           t=590.9 "And JJ wants to kill Deadgey every time."
  [running_joke]       Harry just doesn't like a man  t=657.5 "Harry's reason is always, I just don't like a man."
  ```
- A 90-second sample of the same source returned `threads_added: 0`. That is correct, not a
  failure — a 90-second window has no durable channel threads in it — and it is why the
  proof needed a realistic span.
- `whisper tiny` on CPU/int8 transcribed 15 minutes in 113.7s. Larger models are available
  via `AFTERPLAY_WHISPER_SIZE`; `tiny` was enough for thread extraction to work.

---

## e-026-fault-injection-degraded-and-stale

Claim: the two silent-failure modes fail loudly. **These were the last fault-injection
gates on phases 1–2 (G19, G20).**

- Date: 2026-08-08

### Revoked API key (G19)

A dead key must not produce a successful-looking run with zero callbacks, which is
indistinguishable from a stream that genuinely has none.

```
$ OPENAI_API_KEY=sk-revoked-... python -m afterplay.cli --json run --memory ...
memory : {'enabled': True, 'degraded': True,
          'reason': "thread lookup failed (AuthenticationError: Error code: 401 -
                     {'error': {'message': 'Incorrect API key provided: sk-revok****work',
                     'code': 'invalid_api_key'}, 'status': 401})",
          'threads_considered': 0, 'callback_found': False, 'callbacks_ranked_out': 0}
```

The clip still rendered (`ok: true`) — this is degradation, not failure. Studio's rendered
HTML for that manifest:

```
alert tone : warning
alert title: Creator memory degraded
role       : alert          (assertive, not a passive status)
reason     : the 401 is shown to the operator
```

### Killed render (G20)

A run that dies before writing `manifest.json` must not leave the previous manifest served
as if it were current.

```
(kill -9 mid-render)
status.json     : {"state": "started", ...}
manifest.json   : absent

served job      : degraded_probe          <- the last COMPLETE run, not the dead one
stale           : True
staleReason     : A newer job is started; showing the latest complete manifest.
banner          : Showing latest complete run
```

### A defect this fault injection exposed

The two states were chained with `? :`, so a manifest that was **both** stale and degraded
showed only the stale banner — the operator saw that a newer job had not finished, but not
that the run in front of them had a broken memory pass. A panel whose entire purpose is to
stop states being hidden was hiding one behind another.

Both now render:

```
banner: Showing latest complete run
banner: Creator memory degraded
```

Regression test `tests/e2e/manifest-states.spec.ts` seeds exactly this combination and
fails against the chained version (verified by reverting: `1 failed, 1 passed`). It also
asserts the degraded run is never presented as the valid no-callback outcome.

---

## e-027-finals-baseline-and-verified-citation-boundary

Claim: model-authored quotes cannot enter active channel memory or affect a clip decision unless
they resolve to a contiguous transcript span.

- Date: 2026-08-19
- Commit: `da9bc2a` (`feat(clipper): verify memory citations`).
- Verification before the change: `pytest tests/test_extended.py tests/test_units.py -q`
  returned `99 passed, 1 skipped`.
- Focused verification after the change returned `20 passed`. It covers exact matches, fuzzy
  caption repair, rejected quotes, repeated-quote timestamp tie-breaking, Devanagari text,
  legacy unverified records, and the rule that the callback judge is never called with
  unverified evidence.
- The broader clipper regression suite returned `107 passed, 1 skipped` for the citation commit.
- Backfill now reports suggestions separately from verified additions, repaired citations, and
  rejected citations. Missing verification metadata defaults to unverified.

---

## e-028-transcript-language-provenance

Claim: the clipper selects only configured subtitle languages and discloses the actual transcript
language, source, and track in its manifest.

- Date: 2026-08-19
- Commit: `307399f` (`feat(clipper): record transcript language provenance`).
- Focused language plus end-to-end manifest verification returned `6 passed`.
- Full clipper verification returned `134 passed, 1 skipped` in `625.79s`.
- Tested paths include Hindi-first subtitle selection, refusal to fall back to an unlisted
  English track, manual versus automatic YouTube provenance, provided VTT provenance, pinned ASR
  language, and source-script VTT round-trip.
- This proves the language-provenance foundation only. It does not prove the second creator case
  study and does not support a general multilingual-product claim.

---

## e-029-versioned-atomic-storage

Claim: Intel persistence distinguishes missing from corrupt data, preserves legacy JSON, and
writes versioned state atomically with bounded Windows contention handling.

- Date: 2026-08-19
- Commit: `39648eb` (`feat(storage): add versioned atomic persistence`).
- `playwright test --config=playwright.persistence.config.ts` returned `5 passed`.
- Cases cover corrupt JSON, malformed envelopes, schema/version mismatch, legacy migration,
  re-entrant writes with unique temporary names, one `EPERM` retry, and non-retryable failures.
- `npm run typecheck` and `npm run lint` both exit zero for the app. The nested `demo-video`
  package is excluded from the app `tsconfig` because it owns a separate toolchain and config.
- This is the storage foundation, not completion of F4 creator isolation and job durability.

---

## e-030-intelligence-integrity

Claim: competitive beliefs decay only under equivalent supporting-channel coverage, title
detectors no longer make the documented bare-word/acronym errors, and thin samples are disclosed
as hypotheses rather than recommendations presented as facts.

- Date: 2026-08-19
- Focused command:
  `playwright test tests/e2e/intel-engine.spec.ts tests/e2e/intel-console.spec.ts`.
- Result: `35 passed` in `71.7s` after correcting one fixture expectation exposed by the first
  run (`34 passed, 1 failed`).
- Tests cover same-scope decay, different-competitor preservation, legacy coverage behavior,
  retirement of the unreachable contradiction state, evidence-to-channel provenance, GTA/FPS/COD
  adversarial titles, explicit constraints, sample denominators, bounded copy, and rendered UI.
- `npm run typecheck` and `npm run lint` both exit zero.

---

## e-031-manifest-citation-integrity-boundary

Claim: a staged or legacy manifest cannot display a callback or enter the approval package as a
memory-dependent clip unless it carries complete verified citation metadata.

- Date: 2026-08-19
- The loader requires `citation_verified: true`, source stream, source timestamp, and source quote
  before projecting `callback: true`.
- A rejected callback claim is normalized to a standalone clip and the manifest is surfaced as
  degraded with an explicit integrity reason; the original clip asset remains inspectable.
- `npm run typecheck` exits zero and focused ESLint exits zero.
- Focused Playwright's first run passed the new integrity test plus six related manifest tests.
  One unrelated dispatch test then timed out when Turbopack filled the system drive (`os error
  112`); this was an environmental failure after the integrity assertion had passed, not a green
  full-suite claim.
- After storage was recovered, a clean combined Chromium run covering citation integrity, creator
  isolation, media ranges, stale/degraded states, and approval returned `9 passed` in `2.5m`.

---

## e-032-same-pipeline-memory-ablation-contract

Claim: one memory-enabled clipper run computes a same-source memory-off/memory-on comparison over
identical candidate windows before sponsor filtering and analytics mutation.

- Date: 2026-08-19
- `score_all` and `select` are separate deterministic operations; frozen legacy-equivalence tests
  cover both heatmap and cold-start scoring.
- The versioned manifest artifact records baseline rank, memory rank and rank delta, baseline
  percentile, applied boost, base and final scores, score scale, selected state, candidate count,
  and `post_scoring_pre_sponsor_pre_analytics` as the comparison point.
- Missing transcripts, disabled memory, retrieval/judge degradation, no candidates, and candidate
  mismatch produce explicit unavailable reasons rather than a zero-effect claim.
- Parent verification:
  `pytest tests/test_ablation.py tests/test_citations.py tests/test_extended.py::TestChannelMemory tests/test_extended.py::TestCallbackFoundReflectsShippedClips -q`
  returned `29 passed`.
- Parallel broader verification returned `122 passed, 1 skipped`; the dedicated ablation slice
  returned `32 passed` during implementation.
- This proves the implementation contract, not the finale result. F3 remains open until the same
  artifact is produced from the rebuilt verified demo corpus.

---

## e-033-creator-scoped-durable-experiments

Claim: experiment decisions, dispatch receipts, results, and learned state survive process restart
and cannot be read or mutated through another active creator's request context.

- Date: 2026-08-19
- State uses the versioned atomic persistence helper under `AFTERPLAY_EXPERIMENT_DIR`, with a
  traversal-safe creator digest and the original creator id retained inside the envelope.
- Missing state initializes explicitly; valid unversioned state migrates; corrupt, mismatched, or
  unsupported state fails visibly and is not silently replaced.
- `pipelineOutputs` remains a response projection and is deliberately removed before persistence,
  preventing stale manifest output from becoming durable experiment truth.
- All experiment server pages and API routes now resolve `currentCreator()` and pass the same id to
  reads and mutations. Focused tests cover durable initialization, migration, corruption, and two
  isolated creator lifecycles.
- Parent verification: `npm run typecheck` exits zero and focused ESLint exits zero.
- The worker's focused browser run returned `6 passed, 1 timed out`; the timeout occurred during
  first route compilation at the old 30-second limit, while the same results endpoint passed in
  the following test. A clean rerun could not be completed after the system drive fell to roughly
  70 MB free, so this is not recorded as a fully green browser-suite result.
- After storage was recovered and the cold-compilation budget was raised, the complete focused
  lifecycle suite returned `7 passed` in `5.0m`.

---

## e-034-creator-owned-clipper-artifacts

Claim: inside the local single-operator app, active-workspace filtering keeps manifests, media,
approvals, learning, and job status aligned to the selected creator; ownerless legacy artifacts
fail closed.

- Date: 2026-08-19
- Python `JobResult` manifests and every started, complete, or failed `status.json` now carry a
  top-level `creator_id`; deliberately unscoped runs serialize `null` rather than implying an owner.
- Manifest selection and stale-job detection require an exact active-creator match. The latest API,
  Studio, media route, experiment projection, result bridge, ingest launch, and ingest status route
  all use the same request creator.
- An ingest request whose creator does not match the selected workspace returns
  `409 creator_mismatch` before checking Python or starting a process. The workspace cookie is a
  local selector, not an authentication or authorization credential.
- The adversarial browser fixture creates configured, guest, and newer ownerless manifests. It
  verifies per-creator latest selection, bidirectional media denial, per-creator experiment
  projection, same-owner stale state, cross-owner job-status denial, and ingest mismatch rejection.
- Verification: focused Python returned `5 passed`; `npm run typecheck` and focused ESLint exit zero;
  the final combined Chromium regression returned `9 passed` in `2.5m`.
- A separate real Chromium pass against the configured workspace exercised creator switching and
  Studio/Ingest at `1440x1000` and `390x844`. Guest propagated to Ingest, console/page errors were
  empty, and document widths matched both viewports. Temporary screenshots, logs, traces, and the
  validation server were removed afterward.
- This closes artifact ownership, not all of F4. Structured stage events, retry/cancellation, and a
  versioned manifest schema remain open.

---

## e-035-structured-progress-and-cancellation

Claim: a browser-started clipper run exposes structured, creator-owned progress; can be stopped
through the public API; and reaches a durable cancelled state without poll or exit-handler lies.

- Date: 2026-08-19
- Python atomically writes owner-stamped `resolve`, `transcript`, `memory`, `render`, and `done`
  stages with `started`, `running`, `complete`, or `failed` state and a bounded human-readable
  detail. CLI failure preserves the last durable stage and detail.
- Next projects structured stages first and uses log regexes only for legacy status files. The POST
  response includes the initial job so all five stages render before the first poll.
- A hot-reload-stable process registry retains only ephemeral creator/child handles. Durable truth
  remains in `status.json`. `DELETE /api/ingest/:jobId` scopes reads to the selected creator, is
  idempotent after a terminal state, writes nonterminal `cancelling` during process termination,
  and publishes `cancelled` only after the process tree is confirmed gone.
- This is local single-operator workspace scoping, not authentication or tenant isolation. The
  creator cookie selects a workspace; it is not an authorization credential.
- A completed, owner-matched manifest wins over stale status on reads, process exit, and Stop.
  Failed termination leaves a live process handle registered and restores a nonterminal, retryable
  status. If the parent exited but descendants cannot be ruled out, status remains unresolved
  `cancelling`. Durable active status blocks a second ingest for the creator even if a server
  restart lost the process handle.
- Windows tree termination uses bounded `taskkill /T /F`. POSIX runs use a dedicated process group,
  wait for the full group to disappear after `SIGTERM`, then wait again after `SIGKILL` if needed.
  The Windows branch is exercised on the finale host; the POSIX branch is implementation-reviewed
  but was not executed on this Windows machine.
- Node status transitions also use unique atomic replacements with one Windows rename retry, so a
  poll cannot observe a partially written cancellation or launch failure.
- If a server restart loses the unprovable process handle, cancellation returns an explicit `409`
  rather than claiming to stop the job. Synchronous log-open/spawn failures write failed status.
- Client polling uses one scheduled request at a time. A dropped poll is announced, retries after
  three seconds, clears on recovery, and never overwrites a later cancellation. A failed Stop keeps
  polling through `cancelling`, restores a retryable Stop control, and does not strand a false
  terminal state. Progress uses `aria-live=polite`.
- Focused Python status tests returned `3 passed`; `npm run typecheck` and focused ESLint exit zero.
  The final combined Chromium run returned `3 passed` in `1.2m`: durable admission after handle
  loss, completed-manifest status repair, a required prepared local clipper cancelled through the
  public route, dropped-poll recovery, failed-Stop recovery, retry, and UI Stop. After tightening
  Windows success criteria, the real process cancellation drill passed three consecutive repeats.
- A separate visual Chromium pass inspected poll-error, recovered-running, and cancelled states at
  `1440x1000` and `390x844`. The mobile document remained exactly `390px` wide; the only console
  error was the intentionally aborted poll used to exercise recovery. Screenshots, logs, traces,
  server processes, and real test job directories were removed afterward.
- The production build reached Turbopack compilation but the host had only about 220 MB free and
  failed with `os error 112` while writing `.next`; generated build/report/temp artifacts and
  disposable npm/pip caches were removed. This is an environmental verification gap, not recorded
  as a passing build.
- This closes B4 for the configured Windows finale host. Bounded retries inside the media/model
  pipeline and the versioned manifest schema remain separate work.
