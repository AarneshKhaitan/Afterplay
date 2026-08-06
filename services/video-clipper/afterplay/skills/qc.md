---
name: clip-qc
description: "Quality gate for a rendered short: the measured checks, their thresholds, the repair each failure maps to, repair ordering and attempt budgets. Use when verifying a rendered clip before delivery, or when reviewing frames visually."
version: 1.0.0
---

# Skill — QC rubric

A clip ships because the **frames measured correct**, never because ffmpeg exited 0.
Every check below runs on real decoded pixels and real audio samples. Each failure
names a repair the agent can apply; a failure with no repair is a bug in this rubric.

## Hard failures (block delivery, trigger repair)

| Check | Measurement | Repair |
|---|---|---|
| `geometry` | rendered WxH must equal the platform preset exactly | — (spec bug) |
| `decode` | frames must be readable from the output | `rerender` |
| `frozen_video` | mean inter-frame delta across samples ≈ 0 → still image | `rerender` |
| `black_frames` | mean luma < 14 within the first 1.5 s | `shift_start` |
| `subject_off_center` | edge-energy centre of mass in the outer 16% for ≥ 34% of samples | `recenter_left` / `recenter_right` |
| `caption_overflow` | caption bbox (measured by rendering captions over black) breaches a safe zone or frame edge | `shrink_captions` |
| `audio_silent` | whole-clip RMS below the silence floor | `shift_start` |
| `hook_silent` | first 1.5 s is silent — the clip opens on dead air | `snap_to_speech` |
| `hook_empty` | zero transcript words in the first 1.5 s | `snap_to_speech` |
| `audio_clipping` | > 0.2% of samples at full scale | `lower_loudness` |
| `duration_limit` | longer than the platform's hard cap | `shorten` |

## Warnings (recorded, do not block)

`duration_drift` (rendered length differs from planned by > 0.6 s), `fps` mismatch,
near-black samples outside the hook, and any reviewer note that is not a failure.

## Repair discipline

- **Fix where the clip starts before fixing how it looks.** A start shift changes the
  framing and the caption timing, so re-deriving those first wastes an attempt.
  Priority: `snap_to_speech` → `shift_start` → `shorten` → `recenter_*` →
  `shrink_captions` → `lower_loudness` → `rerender`.
- **At most two repairs per attempt.** More than that and you cannot attribute which
  change fixed or broke the clip.
- **Bounded attempts.** After the budget is spent, deliver the clip marked `ok=false`
  with its findings attached. Never ship a failing clip as if it passed, and never
  loop forever.
- **Every repair is logged** to the creator's corrections file. A repair the agent
  keeps applying should become that creator's default instead.

## If you are a vision model reviewing frames

Report only what you can **see** in the frames provided. Useful things a measurement
misses: a face cropped at the chin or forehead, captions overlapping a burned-in
subtitle from the source, text colliding with on-screen graphics, a crop centred on
a wall while the speaker sits at the edge, an unreadable caption over a busy
background. Do not speculate about audio. Prefer `warn` unless the clip is clearly
unusable, and always name one repair from the table above.
