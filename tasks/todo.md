# Afterplay Current Task Status

Updated: 2026-08-07

## Phase 0 - Truth and submission integrity

- [x] Fixed-gap namespace uses `FIX-*`; no legacy short fixed-gap IDs remain.
- [x] Evidence index exists at `docs/prd/EVIDENCE.md` and PRD R2 links to evidence IDs.
- [x] README judge path leads with `backfill` -> `run --memory` -> Studio manifest review.
- [x] Runtime mode table documents demo, live, and clipper guarantees.
- [x] Callback framing states boost-not-gate and precision-first behavior.
- [x] No-callback outcome is documented as a valid result, separate from degraded memory failure.
- [ ] G1 deliverables remain external: PDF deck and demo video are not in the repo.

## Phase 1 - Live path as demo

- [x] `backfill` supports `--local` and ASR fallback for caption-less sources.
- [x] ASR failure in `backfill` names `faster-whisper`, `AFTERPLAY_WHISPER_SIZE`, and `AFTERPLAY_WHISPER_MODEL`.
- [x] Manifest includes memory state: degraded, reason, threads considered, and callback found.
- [x] CLI jobs write `status.json` for started, complete, and failed states.
- [x] `doctor` includes ASR and OpenAI memory preflight checks.
- [ ] G6 remains open: real creator-owned stream validation has not been performed.
- [ ] Manual fault validation remains: revoked key and killed render should be observed in Studio.

## Phase 2 - Close the loop

- [x] App projects latest complete clipper manifest into experiment outputs.
- [x] App accepts optional per-clip result metrics.
- [x] Per-clip results are written into the Python analytics memory shape under `AFTERPLAY_MEMORY`.
- [x] Studio renders stale manifest, degraded memory, and valid no-callback states separately.
- [ ] Ranking-change proof remains: record enough per-clip results, rerun clipper, and show ranking changes.

## Verification Run This Pass

- [x] `python -m py_compile services\video-clipper\afterplay\agent.py services\video-clipper\afterplay\cli.py services\video-clipper\afterplay\understand.py`
- [x] `npm run typecheck`

## Blockers

- Real creator data selection and callback hand-verification are still required before closing G6.
- Full Phase 2 acceptance still requires a post-results rerun showing changed ranking.
- Submission deck and demo video are still owned outside this code/docs pass.
