# Clipper Integration

Afterplay is now the product repo. The Python clipper service lives at
`services/video-clipper` and owns media ingestion, moment selection, rendering, QC,
repair, manifests, and creator rendering memory.

## Boundary

- `src/` owns the creator-facing app, approvals, evidence panels, strategy workflow,
  and demo presentation.
- `services/video-clipper/afterplay/` owns the media pipeline:
  `resolve -> understand -> extract -> render -> QC -> manifest`.
- The Next.js ingest API starts and cancels creator-scoped local clipper jobs, then validates and
  projects completed `manifest.json` documents into Studio and the approval workflow.
- [Clip manifest v2](../contracts/clip-manifest-v2.md) is the shared boundary for ownership,
  transcript provenance, immutable decision windows, callback evidence, and ablation proof.

## Callback Memory Status

The combined repo now has an opt-in callback-memory path in the clipper service:

1. `afterplay.cli backfill` extracts recurring creator threads from prior captions.
2. `ChannelMemory` stores those threads locally under the creator memory root.
3. `MemoryReasoner` retrieves relevant threads for each candidate moment.
4. An OpenAI judge can confirm a callback/payoff and boost that moment.
5. `ClipResult.signals` carries the cited source stream, timestamp, quote,
   confidence, and explanation into the manifest.

The remaining product bridge is to call the service from the Next.js app and render
those manifest signals in Studio/Evidence views. A real demo contract lives in
`docs/demo/CALLBACK.md`.

## Local Service Commands

From `services/video-clipper`:

```powershell
$env:PYTHONPATH='.'
$env:AFTERPLAY_WORKDIR="$PWD\.work"
$env:AFTERPLAY_OUTDIR="$PWD\.out"
$env:AFTERPLAY_MEMORY="$PWD\.memory"
python -m afterplay.cli doctor
python -m pytest -q tests\test_units.py
```

Use creator-owned local media for functional runs:

```powershell
python -m afterplay.cli --json run --local path\to\source.mp4 --vtt path\to\captions.vtt --rights permission_granted --clips 1 --platforms shorts --creator demo
```

Use callback memory after backfilling prior captions:

```powershell
python -m afterplay.cli backfill --creator demo --stream-id prior_001 --vtt path\to\prior.vtt
python -m afterplay.cli --json run --memory --local path\to\source.mp4 --vtt path\to\captions.vtt --rights permission_granted --clips 3 --platforms shorts --creator demo
```
