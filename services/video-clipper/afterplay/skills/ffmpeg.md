---
name: ffmpeg-clipping
description: "ffmpeg for a clipping pipeline: range-fetch seeking, keyframe-accurate cutting, DASH dual-input mapping, filtergraph ordering, crop expressions, encoder probing and rate control, loudness normalisation, probing without ffprobe, and output verification. Use for any extract, reframe, caption-burn or encode step."
version: 1.0.0
---

# Skill — ffmpeg for clipping

The rules this pipeline encodes, and why. Every one of these was a bug before it was a
rule.

## Seeking and cutting

- **`-ss` BEFORE `-i` is an input seek**; after `-i` it is an output seek. Before-input
  makes ffmpeg jump to the position first — over HTTP that becomes a **range request**,
  so you pull the bytes around the window instead of the whole file. This is the entire
  latency argument of the product. After-input decodes everything from zero and
  discards it.
- **A stream copy cannot cut mid-GOP.** `-c copy` lands on the nearest keyframe at or
  *before* your `-ss`, so the extract is longer and starts earlier than asked. Do not
  fight it: extract with a **pad** (~2s), then make the frame-accurate cut in the
  render pass, which is re-encoding anyway. Trying to be exact in the copy step gives
  you a frozen first frame or a black start.
- **`-t` is duration, `-to` is an end timestamp**, and after an input `-ss` they are
  relative to the seek. Mixing them up silently produces short clips.
- `-avoid_negative_ts make_zero` on a copy-cut, or the first PTS can be negative and
  players show a frozen frame.
- `-movflags +faststart` on every delivered MP4: the moov atom moves to the front so
  the file starts playing before it is fully downloaded. Costs one rewrite pass.

## DASH sources have separate video and audio

YouTube-style adaptive sources hand you two URLs. Give each its own `-ss` and `-i`, then
map explicitly:

    -ss T -i VIDEO_URL -ss T -i AUDIO_URL -map 0:v:0 -map 1:a:0

Each input issues its own range request. **Without explicit `-map`, ffmpeg's default
stream selection can silently drop one of them.**

## Filtergraph order is not cosmetic

    crop → scale → fps → setsar → ass(subtitles) → overlay(watermark)

- **Crop before scale.** Scaling first burns work on pixels you are about to discard,
  and softens what remains.
- **Burn captions AFTER the final scale.** Subtitles are rasterised at the frame size
  they are drawn onto; scale afterwards and the text is resampled and mushy. ASS
  `PlayResX/PlayResY` must match the *output* geometry for this reason.
- **`setsar=1` after scale.** A non-square sample aspect ratio inherited from the
  source makes correct pixel dimensions render as the wrong shape.
- **`fps=` before captions**, so caption timing is quantised to the frames that exist.
- Chain with `,` for a linear graph; use `-filter_complex` with named pads only when
  you genuinely have multiple inputs (a watermark). Mixing `-vf` and `-filter_complex`
  on the same stream is an error.

## Expressions

- `crop=w:h:x='expr'` accepts `t` (seconds) — this is how you pan. But the expression
  evaluator **rejects deeply nested `if()` chains**: ~100 levels fails with
  `Missing ')' or too many args` and the filter never configures. Keep piecewise paths
  to roughly a dozen keypoints, or hold a static crop.
- Always clamp: `max(0,min(iw-cw, …))`. An out-of-range crop is a hard failure, not a
  clipped image.
- Quote expressions in single quotes and pass them as ONE argv element. Never build a
  filtergraph by string-concatenating unsanitised text.

## Windows paths in filtergraphs

`ass=C:\\path\\file.ass` breaks: `:` separates filter options and `\` escapes. Do not
build escape ladders — **run ffmpeg with `cwd` set to the file's directory and pass the
bare filename.** Robust on every platform.

## Encoders

- Presence in `-encoders` does **not** mean the hardware exists. `h264_nvenc` is listed
  on machines with no NVIDIA GPU and fails at init. **Probe by actually encoding a few
  frames**, once, and cache the winner.
- Rate control is not portable: `libx264` takes `-crf`, `nvenc` takes `-cq` (+`-rc vbr`),
  `qsv` takes `-global_quality`, `amf` takes `-qp_i/-qp_p`. Passing `-crf` to a hardware
  encoder is either ignored or an error.
- **Pixel format matters:** `yuv420p` for x264/nvenc, `nv12` for qsv. Omit it and some
  encoders emit a format phones will not decode.
- Hardware encoders are 5–20× faster and slightly worse per bit. For 20–60s clips that
  trade is free.

## Audio

- **Normalise loudness, don't just raise gain.** `loudnorm=I=-14:TP=-1.5:LRA=11` targets
  the platform spec. Single-pass loudnorm is approximate; a two-pass (measure, then
  apply the measured values) is exact and worth it for delivery.
- Follow with a limiter (`alimiter=limit=0.94`). Loudnorm can overshoot on transients
  and a clipped waveform is unfixable after the fact.
- Set `-ar 48000` explicitly. Mixed sample rates between clips is an audible artefact
  when a creator posts a series.

## Probing

- **`ffprobe` is not always installed** (the `imageio-ffmpeg` wheel ships ffmpeg only).
  You can read stream info from `ffmpeg -i` on stderr instead.
- **That output only exists at `-loglevel info` or higher.** Probing at the default
  `error` level returns nothing, and the natural reading of "no Audio: line" is "this
  file has no audio" — which silently strips audio from every render. Verify a probe by
  asserting a *known-good* file reports what you expect.
- OpenCV is a good second opinion for width/height/fps/frame-count, and disagrees with
  the container often enough to be worth cross-checking.

## Verification

Never trust exit code 0. `ffmpeg` returns 0 having written a file with **zero packets**
in some failure modes. After every render: probe the geometry, decode real frames, and
decode real audio samples. That is what QC is for.

## Recipes used by this pipeline

Copy-pasteable, in pipeline order. `$V`/`$A` are direct stream URLs, `$T`/`$D` a start
time and duration.

**Range-extract a window from a remote DASH source (no full download):**
```bash
ffmpeg -ss $T -i "$V" -ss $T -i "$A" -map 0:v:0 -map 1:a:0 \
  -t $D -c copy -avoid_negative_ts make_zero -movflags +faststart -y cut.mp4
```

**Frame-accurate re-cut + vertical reframe + burn ASS captions + normalise:**
```bash
cd "$(dirname cut.mp4)"   # bare filename keeps ':' out of the filtergraph
ffmpeg -ss 1.85 -i cut.mp4 -t 21.0 \
  -vf "crop=608:1080:x='max(0,min(1312,700))':y='(ih-1080)/2',\
scale=1080:1920:flags=lanczos,fps=30,setsar=1,ass=captions.ass" \
  -af "loudnorm=I=-14:TP=-1.5:LRA=11,alimiter=limit=0.94" \
  -c:v h264_qsv -global_quality 20 -pix_fmt nv12 \
  -c:a aac -b:a 128k -ar 48000 -movflags +faststart -y clip.mp4
```

**Watermark (needs filter_complex, not -vf):**
```bash
ffmpeg -i clip_base.mp4 -i logo.png -filter_complex \
  "[0:v]crop=…,scale=1080:1920,fps=30,setsar=1,ass=captions.ass[base];\
[1:v]scale=108:-1[wm];[base][wm]overlay=W-w-43:76[v]" \
  -map "[v]" -map 0:a:0 -c:v libx264 -crf 20 -y clip.mp4
```

**Two-pass loudnorm (exact LUFS for delivery):**
```bash
ffmpeg -i clip.mp4 -af loudnorm=I=-14:TP=-1.5:LRA=11:print_format=json -f null -   # read measured_*
ffmpeg -i clip.mp4 -af loudnorm=I=-14:TP=-1.5:LRA=11:measured_I=…:measured_TP=…:\
measured_LRA=…:measured_thresh=…:linear=true -c:v copy -y clip_norm.mp4
```

**Caption-only probe over black (how QC measures the real text bbox):**
```bash
ffmpeg -f lavfi -i color=c=black:s=1080x1920:r=30:d=21 -vf "ass=captions.ass" \
  -c:v libx264 -preset ultrafast -pix_fmt yuv420p -y capprobe.mp4
```

**Contact sheet for visual review:**
```bash
ffmpeg -i clip.mp4 -vf "fps=1/4,scale=270:480,tile=4x1" -frames:v 1 -y sheet.png
```

**Cover frame / thumbnail at the hook:**
```bash
ffmpeg -ss 1.2 -i clip.mp4 -frames:v 1 -q:v 2 -y cover.jpg
```

**Trim dead air (detect first, then cut — never blind):**
```bash
ffmpeg -i clip.mp4 -af silencedetect=noise=-35dB:d=0.35 -f null -   # parse silence_start/end
```

## Guidelines for an agent using this skill

1. **Probe the input first** (`ffmpeg -i` at `-loglevel info`), and never assume a
   stream exists.
2. **Choose copy vs re-encode deliberately:** copy for a rough window, re-encode only
   where pixels change. State which you are doing and why.
3. **Build filtergraphs in the fixed order** above; do not reorder for convenience.
4. **Probe the encoder once per machine**, cache it, and use that family's rate-control
   flags — not another family's.
5. **Verify the output after every render**: geometry, decoded frames, decoded audio.
   Exit code 0 is not evidence.
6. **On failure, read the tail of stderr and fix the cause.** Do not retry the identical
   command — a no-op retry burns the attempt budget and changes nothing.
