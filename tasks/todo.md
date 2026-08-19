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

### Implementation review - 2026-08-19

- Citation verification and language provenance are committed foundations; the real corpus
  rebuild, eval, ablation, and second-creator case study remain open.
- The same-pipeline ablation contract is implemented and tested — E-032; F3 remains open until
  its stage result comes from the rebuilt verified corpus.
- Atomic storage is committed, but F4 remains open for complete creator isolation, structured job
  controls, and manifest v2.
- Experiment lifecycle durability and request-level creator isolation are committed — E-033;
  F4 remains open for the other stores, structured job controls, and manifest v2.
- Clipper manifests, media, pipeline projections, result feedback, ingest launch, and job status
  now share one creator ownership boundary — E-034.
- Structured progress, real process-tree cancellation, idempotent Stop, lost-handle disclosure,
  durable duplicate-run admission, visible poll/failed-Stop recovery, and responsive terminal
  states are complete on the configured Windows finale host — E-035. The POSIX group-kill branch is
  reviewed but unexecuted here. F4 remains open for manifest v2 and bounded transient retries.
- The production build is not green: Turbopack exhausted the system drive (`os error 112`).
  Typecheck, focused lint, Python status tests, and focused Chromium pass; rerun build after at least
  1-2 GB more working space is available.
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
