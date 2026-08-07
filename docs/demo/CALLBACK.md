# Callback Demo Contract

This file is the demo checklist for proving the clipping/creator-helper idea with
real creator-owned material. Do not mark the demo complete until a real callback clip
has been selected and the cited source timestamp has been verified.

## Inputs

- Creator id: `OPEN - select during G6/A5 real creator validation`
- Prior stream id: `OPEN - record after creator-owned prior stream is chosen`
- Current stream id: `OPEN - record after callback/no-callback current stream is chosen`
- Prior transcript path: `OPEN - creator-owned transcript or ASR artifact path`
- Current media path: `OPEN - creator-owned local media path`
- Current transcript path: `OPEN - creator-owned transcript or ASR artifact path`

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
- `memory.callback_found`
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
python -m afterplay.cli --json run --memory --creator demo --local path\to\current.mp4 --vtt path\to\current.vtt --clips 3 --platforms shorts
```

## Review Notes

- Confirm `source_quote` appears verbatim near `source_t` in the prior transcript.
- Confirm the current clip is understandable without watching the full stream.
- Confirm callback evidence or no-callback fallback appears in JSON output and any app evidence panel
  that consumes the manifest.
- Confirm `memory.degraded: true` cases are surfaced as explicit errors and never as
  "no callback found".
