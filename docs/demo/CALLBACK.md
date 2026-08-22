# Callback Demo Contract

This file records the evidence that is safe to use in the finals demo. The demo uses
third-party Sidemen footage for analysis, so every output is marked `not_cleared` and is
review-only. It must never be described as creator-owned or publishable.

## Active corpus — rebuilt and rendered 2026-08-20

Creator id: `probe_ksi`, displayed as **Sidemen** because the sources are MoreSidemen
uploads rather than KSI-owned channel uploads.

| Role | Stream | Upload date | Use |
| --- | --- | --- | --- |
| Historical memory | `nxGlZX9GH5I` | 2024-07-20 | The only source written into active memory |
| Finale/current | `X955SmTm1rY` | 2024-11-09 | The source processed by the genuine v2 run |
| Inactive staged fixture | `BW_MAa5L9lg` | 2023-11-18 | Never use as a payoff to `nxGlZX9GH5I`; it predates it |

Tuning and held-out roles are not assigned yet. Consequently this corpus proves the live
product path and same-stream ablation, not measured generalisation. Do not report benchmark
accuracy until the separate evaluation corpus exists.

The active store contains 14 threads extracted from `nxGlZX9GH5I`. Every evidence mention
has `verified: true`; no mention is missing verification metadata. The 17 legacy unverified
threads, including the four authored `VYEtNWp5VgA` records, were pruned by a successful
`backfill --prune-unverified` migration.

Transcripts are YouTube auto-captions cached under
`services/video-clipper/.demo-cache/<video_id>/`. Third-party transcripts and media are
gitignored. The finale media is cached outside the repository on `D:`.

## Genuine finale run

Job `finale_x_verified` was produced end to end by `run --memory` over `X955SmTm1rY`:

- schema `afterplay.clip-manifest` version 2
- creator `probe_ksi`
- transcript `en`, source `provided_vtt`
- footage rights `not_cleared`
- 5/5 clips passed QC at 1080x1920
- memory available, not degraded; 10 threads considered
- 3 selected clips carry verified callback evidence
- Studio reads this job from `services/video-clipper/.work`

### Hero: 10 million subscriber Among Us promise

- Historical receipt: `nxGlZX9GH5I` @ 4.2s, exact verifier match (`1.0`):
  *"if we get 10 mil Subs we'll drop a 2hour Among Us video oh not a compilation yeah
  that's not a compilation"*
- Current clip: `X955SmTm1rY` @ 442.039-465.759s: the group explicitly recalls the
  promised two-hour episode and announces that the plan has changed.
- Callback confidence: `0.98`
- Same-pipeline ablation: baseline rank `94`, memory rank `1`, delta `+93`
- Baseline did not select the moment; memory selected it.

This is the stage proof: turn memory off and the moment is rank 94; turn the same memory
path on and the verified callback becomes the first clip.

### Other selected callbacks

- `impostor-role-curse`: confidence `0.70`, baseline rank `73` to memory rank `5`.
- `first-death-or-dc`: confidence `0.67`, baseline rank `112` to memory rank `6`.

## Inactive fixtures

The old `.demo-final/demo_hero` hand-authored manifest was invalid under schema v2 and was
deleted after the genuine run passed. Do not restore it as evidence or fallback media.
Deterministic `e2e_demo` artifacts prove plumbing only and must remain labelled synthetic.

The live run no longer needs YouTube once the media and VTT are cached, but it is not fully
offline: OpenAI embeddings and callback judging are still live network dependencies.

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
# Run from the repository root with .env loaded into the process.
$env:PYTHONPATH='services/video-clipper'

.\services\video-clipper\.venv\Scripts\python.exe -m afterplay.cli backfill `
  --creator probe_ksi --stream-id nxGlZX9GH5I `
  --vtt services/video-clipper/.demo-cache/nxGlZX9GH5I/source.en.vtt `
  --rights not_cleared --prune-unverified

.\services\video-clipper\.venv\Scripts\python.exe -m afterplay.cli run `
  --memory --creator probe_ksi --rights not_cleared --clips 5 --workers 1 `
  --job-id finale_x_verified --platforms shorts `
  --local D:\tmp\afterplay-demo-media\X955SmTm1rY.mp4 `
  --vtt services/video-clipper/.demo-cache/X955SmTm1rY/source.en.vtt
```

## Review Notes

- Confirm `source_quote` appears verbatim near `source_t` in the prior transcript.
- Confirm the current clip is understandable without watching the full stream.
- Confirm callback evidence or no-callback fallback appears in JSON output and any app evidence panel
  that consumes the manifest.
- Confirm `memory.degraded: true` cases are surfaced as explicit errors and never as
  "no callback found".
