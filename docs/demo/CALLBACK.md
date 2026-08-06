# Callback Demo Contract

This file is the demo checklist for proving the clipping/creator-helper idea with
real creator-owned material. Do not mark the demo complete until a real callback clip
has been selected and the cited source timestamp has been verified.

## Inputs

- Creator id:
- Prior stream id:
- Current stream id:
- Prior transcript path:
- Current media path:
- Current transcript path:

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
- Confirm callback evidence appears in JSON output and any app evidence panel that
  consumes the manifest.
