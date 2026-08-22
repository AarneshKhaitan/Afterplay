# Afterplay Current Task Status

Updated: 2026-08-19

Status document, not a history. Anything checked here has an evidence entry in
`docs/prd/EVIDENCE.md` recording the command that produced the result. The gap register in
`docs/prd/PRD.md` is the authority; this file is the short view.

## Finals execution documentation

- [x] Create a repository-owned finals execution index.
- [x] Create four owner-ready workstream plans covering F1-F9 without duplicated ownership.
- [x] Cross-check shared contracts, dependencies, merge order, acceptance gates, and verification.
- [x] Record the documentation review result below.

### Review - 2026-08-19

- Added `docs/prd/FINALS-PHASES.md` as the PRD entry point and linked it from the existing
  implementation roadmap.
- Added `docs/finals/README.md` as the canonical finals execution index.
- Added four workstream plans with one accountable owner each: AI/provenance/proof,
  backend/product, Intel/contracts, and demo/QA/narrative.
- Verified F1-F9 ownership coverage, shared-contract handoffs, merge order, release gates, and
  local Markdown links. No product code was changed and no runtime tests were required for this
  documentation-only task.

## Finals implementation execution

- [x] Baseline verification recorded before runtime changes — E-027.
- [ ] Shared citation, provenance, ablation, creator-scope, and Riff contracts frozen.
- [ ] F1 provenance accepted and committed.
- [ ] F2 measured detection quality accepted and committed.
- [ ] F3 memory ablation accepted and committed.
- [ ] F4 durability, isolation, and live-run safety accepted and committed.
- [x] F5 Intelligence integrity accepted and committed — E-030.
- [ ] F6 product surface accepted and committed.
- [ ] F7 shared evidence contract accepted and committed.
- [ ] F8 narrative, docs, and stage package accepted and committed.
- [ ] F9 second-channel proof accepted, or its go/no-go decision recorded.
- [ ] Full release gate passed on the freeze candidate.

Implementation details and acceptance gates live in `docs/finals/README.md` and its four
workstream plans. Check an item only after its documented verification has run.

### Verified citation boundary

- [x] Match model-reported quotes to contiguous transcript spans and derive source times.
- [x] Default legacy evidence to unverified and exclude it from retrieval and judging.
- [x] Report verified, repaired, and rejected evidence from backfill.
- [x] Cover exact, repaired, rejected, repeated, Unicode, legacy, and judge-boundary cases.
- [x] Suppress legacy manifest callback flags unless complete verified citation metadata exists
      — E-031.

### Language provenance foundation

- [x] Select only configured subtitle languages in deterministic priority order.
- [x] Pin caption-less ASR language and record language, source, and exact track in manifests.
- [x] Preserve source-script quotes and test a Hindi transcript path.
- [ ] Inspect and permission the actual second creator corpus; run the bounded case study.

### F3 ablation implementation

- [x] Split deterministic score-all and selection operations with equivalence coverage.
- [x] Compare memory off/on over identical candidates before sponsor and analytics mutation.
- [x] Emit ranks, rank delta, base percentile, applied boost, scores, scale, and comparison point.
- [x] Emit explicit unavailable reasons and prove the memory-off arm has no memory dependency.
- [ ] Record the stage ablation over the rebuilt, verified demo corpus before accepting F3.

### F5 Intel integrity - complete

- [x] Retain supporting channel ids and decay beliefs only after equivalent scan coverage.
- [x] Preserve legacy beliefs without coverage until they are re-observed.
- [x] Remove the unreachable contradiction state and product claims.
- [x] Tighten challenge and all-caps feature detectors with adversarial coverage.
- [x] Disclose sample sizes and bound recommendation language for thin corpora.
- [x] Run focused Intel tests, typecheck, lint, and review the final diff — E-030.

### F4 storage foundation

- [x] Read the repository rules, backend/product workstream, and relevant bundled Next 16
      server-only guidance.
- [x] Capture the current Intel persistence behavior before changing it.
- [x] Add server-only, versioned JSON persistence with explicit missing/corrupt states.
- [x] Use unique temporary files and retry one Windows `EPERM`/`EBUSY` rename failure.
- [x] Migrate Intel persistence while retaining legacy-file compatibility.
- [x] Add isolated tests and run focused verification, typecheck, and lint — E-029.
- [x] Replace process-local experiment state with creator-scoped durable state — E-033.
- [x] Migrate valid legacy state and fail visibly without resetting corrupt state.
- [x] Resolve the same active creator through experiment pages, reads, decisions, dispatch,
      results, and explicit demo reset.
- [x] Stamp Python job manifests and status documents with their creator owner - E-034.
- [x] Scope manifest selection, media reads, experiment projection, result feedback, and ingest
      status reads to the request's active creator.
- [x] Reject unscoped legacy artifacts at creator-scoped app boundaries and cover active-workspace
      filtering with Python and browser tests. This is not authentication or tenant isolation.

### F4 ingest trustworthiness

- [x] Emit owner-stamped structured `resolve`, `transcript`, `memory`, `render`, and `done`
      progress from Python; retain log parsing only for legacy status files.
- [x] Retain workspace-scoped child handles and expose idempotent cancellation through the selected
      local creator workspace.
- [x] Record nonterminal `cancelling` while stopping the process tree; publish `cancelled` only
      after termination is confirmed, and leave unresolved termination nonterminal.
- [x] Render stages from the first poll, expose polling/network failures, and announce progress and
      terminal states through `aria-live`.
- [x] Cover start, structured progress, failure, cancellation, active-workspace filtering, dropped
      polls, desktop/mobile layout, and process/artifact cleanup.

### B6 manifest v2 and truthful Studio evidence

- [x] Version new clipper manifests and carry explicit footage rights plus transcript provenance.
- [x] Require rights attestation in browser-started ingest; never infer rights from a URL, path, or
      creator id.
- [x] Validate manifest v2 at the Next boundary, reject invalid rights values, and keep legacy
      manifests visible but out of the approval projection when rights are missing.
- [x] Match each returned clip to its same-pipeline ablation row and expose rank/boost evidence.
- [x] Extract the Studio callback receipt into a reusable evidence card that renders only verified
      citations and labels missing comparison evidence honestly.
- [x] Bind approval to a digest of the exact reviewed creator/manifest/output projection; reject
      dispatch after same-id or identity drift.
- [x] Cover producer serialization, legacy compatibility, invalid-rights rejection, explicit-rights
      approval projection, callback evidence, media controls, and desktop/mobile layout.

### B7 finale truth recovery

- [x] Reproduce the configured callback, Studio, Memory, and cross-creator Intel failures on the
      current branch without substituting fixtures.
- [x] Rebuild `probe_ksi` memory from available cached historical transcripts so retrievable mentions
      are verifier-backed at write time; record corpus roles and remove authored thread records.
- [x] Remove `.demo-final/demo_hero` from active runtime and replace it with a real manifest-v2 run
      carrying explicit rights and transcript provenance, then prove Studio renders its evidence.
- [x] Reject Intel ask requests when the requested scan is not owned by the active creator and cover
      the cross-creator probe.
- [x] Remove residual fabricated/sample labels from the active Memory surface.
- [x] Run Python, TypeScript, build, focused browser, and live API/UI verification; record exact
      evidence and clean generated artifacts before committing.

### B7 review - 2026-08-20

- `backfill --prune-unverified` extracted 14 verifier-backed `nxGlZX9GH5I` threads, repaired one
  citation, rejected none, and removed all 17 legacy unverified records. The four authored
  `VYEtNWp5VgA` ids are absent and the active store has no missing or false verification fields.
- The chronologically invalid `BW_MAa5L9lg` payoff claim was rejected. The active finale source is
  `X955SmTm1rY`, uploaded after the historical source; corpus limitations are recorded in
  `docs/demo/CALLBACK.md` without claiming tuning or held-out accuracy.
- Genuine job `finale_x_verified` produced 5/5 QC-passing v2 clips with English VTT provenance,
  `not_cleared` rights, and three selected callbacks. The hero was promoted from baseline rank 94
  to memory rank 1 at confidence 0.98 with a verifier match ratio of 1.0.
- Studio reads the genuine `.work` job, exposes the rights block and evidence receipt, and no longer
  references `.demo-final`; the staged directory and obsolete generated runs were deleted.
- Explicit Intel scan ids are creator-scoped and foreign/missing ids share the same 404 response.
- Verification: typecheck, focused lint, production build, 152 Python tests, 19 focused production
  Playwright tests, and 104/105 full production Playwright tests pass. The only full-suite failure is
  the pre-existing out-of-scope Riff Electron launch because its executable is not installed.

### Implementation review - 2026-08-19

- Citation verification and language provenance are committed foundations; the real corpus
  rebuild, eval, ablation, and second-creator case study remain open.
- The same-pipeline ablation contract is implemented and tested — E-032; F3 remains open until
  its stage result comes from the rebuilt verified corpus.
- Atomic versioned storage is committed — E-029 and E-031.
- Experiment lifecycle durability and request-level creator isolation are committed — E-033.
- Clipper manifests, media, pipeline projections, result feedback, ingest launch, and job status
  now share one creator ownership boundary — E-034.
- Structured progress, real process-tree cancellation, idempotent Stop, lost-handle disclosure,
  durable duplicate-run admission, visible poll/failed-Stop recovery, and responsive terminal
  states are complete on the configured Windows finale host — E-035. The POSIX group-kill branch is
  reviewed but unexecuted here. F4 remains open for bounded transient retries inside the
  media/model pipeline.
- Manifest v2, explicit rights/transcript provenance, strict same-pipeline ablation joins, verified
  evidence receipts, invalid-newest disclosure, and approval-to-dispatch binding are complete —
  E-036. This closes B6; canonical F7 remains the separate Afterplay/Riff evidence-packet contract.
- After storage was recovered, the production Next.js build completed successfully. Typecheck,
  focused lint, the complete Python service suite, and the unified 19-test Chromium B6 matrix also
  pass. Review rejected treating a vanished Windows parent PID as proof that its descendants are
  gone; unresolved `taskkill /T` races remain nonterminal and continue to block another ingest.
- F5 acceptance is complete: scoped decay, contradiction removal, detector calibration,
  low-sample disclosure, grounding tests, typecheck, and lint all pass.

## Phase 0 - Truth and submission integrity — complete except G1

- [x] Fixed-gap namespace uses `FIX-*`; no legacy short fixed-gap IDs remain.
- [x] Evidence index exists at `docs/prd/EVIDENCE.md` and PRD R2 links to evidence IDs.
- [x] README judge path leads with `backfill` -> `run --memory` -> Studio manifest review.
- [x] Runtime mode table documents demo, live, and clipper guarantees.
- [x] Callback framing states boost-not-gate and precision-first behavior.
- [x] No-callback outcome is documented as a valid result, separate from degraded memory failure.
- [ ] **G1 — PDF deck and demo video are not in the repo.** Owned outside this pass;
      `docs/submission/REQUIREMENTS.md` correctly still shows both unchecked. This is the
      only open item in phase 0.

## Phase 1 - Live path as demo — complete

- [x] `backfill` supports `--local` and ASR fallback for caption-less sources.
- [x] ASR failure in `backfill` names `faster-whisper`, `AFTERPLAY_WHISPER_SIZE`, and `AFTERPLAY_WHISPER_MODEL`.
- [x] **ASR success path proven on real caption-less gameplay** — 15 min of audio, 2427
      words at lang confidence 0.97, 5 named threads (G23) — E-025.
- [x] Manifest includes memory state: degraded, reason, threads considered, callback found,
      and callbacks ranked out.
- [x] `callback_found` reports the clips that shipped, not every candidate scored — E-024.
- [x] CLI jobs write `status.json` for started, complete, and failed states.
- [x] `doctor` includes ASR and OpenAI memory preflight checks.
- [x] **G6 closed** — real creator VODs (KSI/Sidemen, iShowSpeed), 3 genuine cross-video
      callbacks, hero rendered 1080x1920 with its citation — E-015, E-017, E-018.
- [x] **Fault validation done, not just implemented** (G19, G20): revoked key produces a
      visible degraded state carrying the 401; a killed render leaves the last complete
      manifest served and flagged stale — E-026.

## Phase 2 - Close the loop — complete

- [x] App projects the latest complete clipper manifest into the experiment as an additive
      `pipelineOutputs` set; the curated package is never overwritten.
- [x] Pipeline clips are approved and dispatched with the curated package — E-020.
- [x] App accepts optional per-clip result metrics.
- [x] Per-clip results are written into the Python analytics memory shape under `AFTERPLAY_MEMORY`.
- [x] Studio renders stale manifest, degraded memory, and valid no-callback states
      separately — and renders stale AND degraded together rather than one hiding the other.
- [x] **Ranking-change proof done** — recorded outcomes re-rank a later run,
      `[story, punchline, reaction]` -> `[punchline, reaction, story]` — E-016.
- [x] Real analytics can reach the priors via `results --input <csv>` — E-021.

## Verification last run (2026-08-08)

- [x] `.venv/Scripts/python -m pytest tests -q` -> **116 passed, 1 skipped**
- [x] `npx playwright test --config playwright.production.config.ts` -> **26 passed**
- [x] `npm run build`, `npm run lint`, `npm run typecheck` -> clean

Run pytest with the project interpreter. `tests/conftest.py` fails fast with an actionable
message if `requirements.txt` was not installed, rather than producing a spread of
`ModuleNotFoundError` failures that look like broken render code.

## Open

- **G1** — submission deck and demo video, owned outside this code/docs pass.
- **Publishing (G12)** is absent, so the outcomes driving the feedback loop are synthetic
  by necessity. The CSV path makes real analytics reachable; there is nothing real to
  ingest until a publishing connector exists. This is a scope boundary, not a defect.
- P1/P2 gaps G8-G15 and G16-G22 remain open by design; see the register.

## Live workflow, honest modes, and product consolidation - 2026-08-20

Source plan: `~/.claude/plans/woolly-wobbling-stallman.md`. All items below are acceptance
units: implementation and the named verification must land together.

### Phase L1 - Python channel and memory contract

- [x] Harden channel parsing/listing with stable error codes, bot-block/timeout mapping, requested
      counts, unknown metadata, and tests.
- [x] Parallelize per-window extraction with indexed deterministic placement, bounded retries,
      cached OpenAI clients, worker limits, progress, and workers=1/8 equivalence tests.
- [x] Add rights-aware `backfill-channel` preview/run contracts with atomic status/report/provenance,
      captions-only partial failure, cancellation-safe writes, and CLI coverage.
- [x] Remove the callback judge gate leak and add the planned retrieval/prompt quality protections.

### Phase L2 - Product backend

- [x] Extract the shared ingest process registry and re-point clip ingest without regression.
- [x] Add creator-scoped durable channel jobs, duplicate-run exclusion, cancellation, and ownership
      checks.
- [x] Add channel preview/backfill GET/POST/DELETE routes with a 25-second preview timeout.
- [x] Add collision-safe creator workspace registry, creator union/`hasMemory`, create/select PUT,
      and rename PATCH.

### Phase L3 - Honest live/demo mode

- [x] Add validated cookie/env mode resolution, lock behavior, API route, sidebar toggle, and
      effective-mode provenance on every Afterplay page.
- [x] Replace fixture-backed live HQ/Audience/Experiments branches with truthful cold states.
- [x] Guard synthetic result/dispatch/reset mutations with `409 demo_only` in live mode.
- [x] Preserve visibly labelled demo fixtures as the explicit stage fallback.

### Phase L4 - Channel workflow and UI consolidation

- [x] Add the two-step channel console with preview, derived creator identity, workspace creation,
      video selection, rights, captions-only disclosure, progress, partial/cancelled states, and
      generation-safe polling.
- [x] Consolidate Afterplay-only tokens, warning colour, surfaces, cards, chips, headings, motion,
      selector collisions, focus/cold states, and 390px/intermediate responsive behavior without
      changing Riff styles or shared token values.

### Phase L5 - Verification and release

- [x] Pin demo mode and locks in all existing Playwright web-server configs; isolate live specs and
      exclude them from the default config.
- [x] Cover live cold states, mode behavior, workspace/channel flow, demo-only 409s, no-fixture
      assertions, partial failure, cancellation, creator isolation, and accessibility.
- [x] Backfill cached `BW_MAa5L9lg` as the independent historical stream and record its corpus role.
- [ ] Rehearse a clean creator channel-to-memory-to-clip-to-Studio path twice, prove captions-only
      operation, and record timings and fallback tier.
- [x] Run full Python, typecheck, lint, build, production Playwright, live Playwright, and manual
      desktop/mobile browser validation; clean owned generated artifacts.

### Review

- Part C design-system consolidation — `306e52d`:
  - Added semantic Afterplay accent, surface, spacing, weight, shadow, duration, easing, and z-index
    scales without changing shared/Riff token values.
  - Consolidated product-region card, chip, heading, evidence-surface, radius, color, and weight
    recipes; preserved the dedicated live-plan grid and the existing collision fixes.
  - Verification: `npm run test:unit` — 9 passed; production build — clean; production accessibility
    suite — 9 passed across 8 routes plus 390px overflow; product-area browser suite — 4 passed.

- Follow-up correction: removed `AFTERPLAY_CREATOR_ID` from the three web Playwright server
  configurations. The suite now uses an isolated selectable workspace fixture and explicitly selects
  it through `/api/creator`; the live config keeps its intentional `guest` first-run default.
- Split Intel isolation coverage into two assertions: a foreign scan returns `404 scan_not_found`,
  while a client-supplied creator different from the selected workspace returns `409 creator_mismatch`.

- Implemented the channel memory product path: explicit YouTube channel preview, Python-derived
  creator id, workspace create/select/rename, rights-aware captions-only backfill jobs, durable
  progress, partial failure, cancellation, and shared process exclusion with clip ingest.
- Implemented honest demo/live mode: cookie/env resolution, lock behavior, visible mode provenance,
  live cold states for HQ/Audience/Experiments, server-side demo-only guards, and isolated live
  Playwright coverage.
- Integrated Intelligence and Strategy: active creator strategy evidence now carries real belief
  bodies and verified thread provenance; Intel recommendations can create a persisted live
  experiment draft; foreign scan ids are rejected before persistence.
- Preserved Riff as a contract boundary while adding versioned Afterplay/Riff packet validation and
  running the Riff web cohost specs after adjacent route typing changes.
- Verification completed:
  - `services/video-clipper`: full Python suite `187 passed, 1 skipped`.
  - Focused eval/channel Python suite: `35 passed`.
  - `npm run lint`: clean.
  - `npm run typecheck`: clean.
  - `npm run build`: clean production build.
  - Live Playwright: `13 passed`.
  - Production product/strategy Playwright: `7 passed`.
  - Production lifecycle/manifest group: `35 passed`, then `growth-hq.spec.ts` rerun `2 passed`
    after updating the stale demo badge assertion.
  - Riff web cohost Playwright: `15 passed`.
  - Core Afterplay browser subset earlier in dev mode: `68 passed`; stale assertions were fixed and
    reverified in production mode.
- Cached `BW_MAa5L9lg` operational backfill completed from local `.demo-cache` captions for
  `probe_ksi`: 18 threads suggested, 18 added, 2 citations repaired, 0 rejected, with
  `not_cleared` rights and `provided_vtt` provenance recorded in the ignored runtime memory store.
- Remaining operational gate: two timed stage rehearsals are not recorded in this pass. Do not
  claim rehearsal completion until the actual runbook evidence exists.

## FIXED (2026-08-21) — video ids beginning with a hyphen were silently dropped

**Symptom:** a channel backfill reports a video as `No captions — the captions process
exited with code 2 without a valid report`, when the video has perfectly good captions.

**Cause:** YouTube ids use the base64url alphabet, so they may begin with `-`
(observed: `-KuTXDqFGI8`, "BETA SQUAD MAFIA GAME: ALL STAR EDITION"). `backfill-channel`
declares `--videos` with `nargs="+"`, so argparse reads a hyphen-leading value as a flag:

```
afterplay backfill-channel: error: argument --videos: expected at least one argument
SystemExit code: 2
```

Exit code 2 is argparse's usage-error code. The process dies at argument parsing — it never
resolves the video, never looks for captions, never calls OpenAI. Confirmed both ways: the
parse fails in isolation, and the same video resolves fine by URL (`vtt: YES`, `lang: en`).

**Frequency:** roughly 1 id in 64 begins with `-`, so most channels will contain one.

**Fix applied:** `--videos` is now `action="append"` (one value per flag, repeatable) and
splits on commas, replacing `nargs="+"`. `backfill.ts:496` passes the `--videos=<id>` form,
so argparse treats everything after `=` as data and a leading hyphen is unambiguous.

Verified by parsing alone (each case stops at the `--rights` check, so no network and no
OpenAI spend):

| Input | Before | After |
|---|---|---|
| `--videos=-KuTXDqFGI8` | exit 2 at argparse | parses, reaches `--rights` check |
| `--videos=-KuTXDqFGI8,94I_OA8WreA` | exit 2 | both ids parsed |
| `--videos 94I_OA8WreA` (old form) | ok | still ok — backward compatible |
| `--videos=, ,` | — | still rejected as empty |

`channel-backfill.spec.ts` updated to assert the `=` form.

The second half — reporting exit 2 as "no captions" — turned out to be less wrong than it
looked: `backfill.ts:541` already surfaces `exited with code 2` and captures stderr. The
misleading impression came from the argparse failure being the hidden *cause*, not from the
wording. Left as is.

## FIXED (2026-08-21) — YouTube 403 on media was a stale yt-dlp

**Symptom:** clipping from a YouTube URL produces `0/3 clips passed quality checks` and
"The clipper wrote an invalid manifest". Every clip fails with
`FFmpegError: ffmpeg exited 3436169992`.

**Cause:** `Server returned 403 Forbidden` when fetching the googlevideo CDN URL. Narrowed
down by elimination:

| Attempt | Result |
|---|---|
| ffmpeg reading the stream URL | 403 |
| ffmpeg + yt-dlp's own `http_headers` (UA, Accept, …) | 403 |
| yt-dlp `download_ranges` (delegates to ffmpeg) | 403 |
| **yt-dlp's own native downloader, no ffmpeg** | **403** |
| yt-dlp cookies from Firefox | 403 (no YouTube session there) |
| yt-dlp cookies from Chrome | `no such table: meta` — locked DB, Chrome must be closed (yt-dlp #7271) |

So this is not an ffmpeg bug and not a header problem. YouTube is refusing **video media**
to this client while still serving **metadata and captions** — which is why channel backfill
works fine (70 verified threads) and only clipping fails.

**What still works:** clipping from local media. `finale_x_verified` (5 clips, 3 callbacks)
and `offline_demo` were both produced this way, from files in `AFTERPLAY_MEDIA_DIR`.

**Actual cause: yt-dlp was six weeks stale.** Installed `2026.07.04`; latest `2026.08.19`,
published two days earlier. YouTube changed its media signing; yt-dlp had already patched it.
Nothing was wrong with ffmpeg, the headers, the network, or the code — every row in the table
above was a symptom of an extractor that could no longer sign a media URL.

`pip install -U yt-dlp` → `2026.08.19`. After the upgrade, on the same machine and the same
video:

| Check | Before | After |
|---|---|---|
| yt-dlp native download | 403 | 10 MB file |
| **ffmpeg on a `stream_urls()` URL (the app's actual path)** | **403** | **returncode 0, 1.1 MB slice** |

**Operational note:** this will recur. yt-dlp goes stale against YouTube on a scale of weeks,
so pin-and-forget is the wrong posture — re-run `pip install -U yt-dlp` before any demo, and
treat a sudden 403 on media (while captions still work) as "the extractor is old" rather than
as a machine or network problem.

**Also worth fixing:** the UI reported "invalid manifest", which is a symptom. The 403 was
only visible by re-running ffmpeg by hand — the clip error captured the command but not
ffmpeg's stderr.
