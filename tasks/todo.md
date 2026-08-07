# Afterplay Current Task Status

Updated: 2026-08-08

Status document, not a history. Anything checked here has an evidence entry in
`docs/prd/EVIDENCE.md` recording the command that produced the result. The gap register in
`docs/prd/PRD.md` is the authority; this file is the short view.

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
