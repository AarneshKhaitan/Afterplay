"""Stages 3-4 — EXTRACT and EDIT/RENDER.

Extract fetches only the byte ranges a clip needs. Render decodes and re-encodes
only those seconds, and only when the edit actually changes pixels.
"""
from __future__ import annotations

import logging
import math
import re
import time
from dataclasses import dataclass, field
from pathlib import Path

from .core import (Brand, MediaInfo, Platform, Settings, detect_encoder,
                   encoder_flags, probe, run_ffmpeg)
from .understand import Word

log = logging.getLogger("afterplay")


# ── stage 3: range extraction ────────────────────────────────────────────────

def extract(src, start: float, end: float, out: Path, settings: Settings,
            pad: float = 0.0, reencode: bool = False) -> MediaInfo:
    """Cut [start, end] out of a source into `out`.

    `-ss` BEFORE `-i` makes ffmpeg seek first, so over HTTP it issues a range
    request and pulls only the bytes around the window instead of the whole file.
    That is the single biggest latency lever in the pipeline.

    `src` is a local path, a single URL, or a {"video":…, "audio":…} dict for
    DASH sources whose streams are separate (each gets its own range request).
    """
    s = max(0.0, start - pad)
    dur = (end + pad) - s
    args = ["-ss", f"{s:.3f}"]

    if isinstance(src, dict) and not src.get("muxed"):
        v, a = src.get("video"), src.get("audio")
        args += ["-i", v, "-ss", f"{s:.3f}", "-i", a, "-map", "0:v:0", "-map", "1:a:0"]
    else:
        url = src.get("muxed") or src.get("video") if isinstance(src, dict) else str(src)
        args += ["-i", str(url)]

    args += ["-t", f"{dur:.3f}"]
    if reencode:
        enc = detect_encoder(settings)
        args += ["-c:v", enc, *encoder_flags(enc, settings.crf),
                 "-c:a", "aac", "-b:a", settings.audio_bitrate]
    else:
        # stream-copy: zero re-encode. Cuts land on keyframes, which is why the
        # render stage re-cuts precisely from this slightly padded extract.
        args += ["-c", "copy", "-avoid_negative_ts", "make_zero"]
    args += ["-movflags", "+faststart", "-y", str(out)]

    t0 = time.time()
    run_ffmpeg(args, timeout=600)
    mi = probe(out)
    log.info("extracted %.1f-%.1fs (%.1fs) in %.2fs -> %s",
             start, end, dur, time.time() - t0, out.name)
    return mi


# ── reframe: model-free subject tracking ─────────────────────────────────────

@dataclass
class CropPath:
    """Where to crop each moment in time. `keys` are (t, x_center) in source px."""
    crop_w: int
    crop_h: int
    keys: list[tuple[float, float]] = field(default_factory=list)
    static: bool = False

    def expr(self, src_w: int, crop_w: int | None = None) -> str:
        """An ffmpeg crop-x expression: piecewise-linear pan between keypoints.

        `crop_w` overrides the path's own width for renders that widen or tighten the
        window (context floor, zoom): the keypoints are subject *centres*, so the
        half-width subtracted here has to be the one actually cropped, not the one
        the tracker planned with.
        """
        cw = crop_w or self.crop_w
        max_x = max(0, src_w - cw)
        def clamp(x):
            return min(max(0.0, x - cw / 2), max_x)
        if self.static or len(self.keys) < 2:
            x = clamp(self.keys[0][1]) if self.keys else max_x / 2
            return f"{x:.1f}"
        e = f"{clamp(self.keys[-1][1]):.1f}"
        for (t0, x0), (t1, x1) in reversed(list(zip(self.keys, self.keys[1:]))):
            a, b = clamp(x0), clamp(x1)
            span = max(1e-3, t1 - t0)
            seg = f"({a:.1f}+({b - a:.1f})*(t-{t0:.3f})/{span:.3f})"
            e = f"if(lt(t,{t1:.3f}),{seg},{e})"
        return e


def _energy_columns(frame) -> "any":
    """Column-wise 'interest' for one frame: edge density is a decent, cheap proxy
    for where the subject is when no face model is available."""
    import cv2
    import numpy as np
    g = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    g = cv2.GaussianBlur(g, (5, 5), 0)
    sx = cv2.Sobel(g, cv2.CV_32F, 1, 0, ksize=3)
    sy = cv2.Sobel(g, cv2.CV_32F, 0, 1, ksize=3)
    mag = cv2.magnitude(sx, sy)
    return np.asarray(mag).sum(axis=0)


def track_subject(path, target_aspect: float, sample_fps: float = 4.0,
                  smooth_s: float = 1.2, simplify_px: float = 12.0,
                  max_keys: int = 12) -> CropPath:
    """Find the crop window that keeps the subject framed, without a face model.

    Combines edge energy (where the detail is) with inter-frame motion (where the
    action is), takes the best-scoring column window per sample, smooths it over
    time so the crop doesn't jitter, then simplifies to a few keypoints.
    """
    import cv2
    import numpy as np

    mi = probe(path)
    crop_h = mi.height
    crop_w = int(round(crop_h * target_aspect))
    if crop_w > mi.width:                     # source is narrower than the target
        crop_w = mi.width
        crop_h = int(round(crop_w / target_aspect))
    crop_w -= crop_w % 2
    crop_h -= crop_h % 2

    cap = cv2.VideoCapture(str(path))
    if not cap.isOpened():
        return CropPath(crop_w, crop_h, [(0.0, mi.width / 2)], static=True)

    step = max(1, int(round((mi.fps or 30) / sample_fps)))
    samples: list[tuple[float, float]] = []
    prev_gray = None
    idx = 0
    while True:
        ok, frame = cap.read()
        if not ok:
            break
        if idx % step == 0:
            t = idx / (mi.fps or 30)
            cols = _energy_columns(frame)
            g = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            if prev_gray is not None:
                d = cv2.absdiff(g, prev_gray)
                cols = cols + 2.0 * np.asarray(d, dtype="float32").sum(axis=0)
            prev_gray = g
            # integral image -> best window in O(width)
            csum = np.cumsum(np.insert(cols, 0, 0.0))
            wins = csum[crop_w:] - csum[:-crop_w]
            left = int(np.argmax(wins))
            samples.append((t, left + crop_w / 2))
        idx += 1
    cap.release()

    if not samples:
        return CropPath(crop_w, crop_h, [(0.0, mi.width / 2)], static=True)

    # temporal smoothing (moving average over ~smooth_s)
    win = max(1, int(round(smooth_s * sample_fps)))
    xs = np.array([s[1] for s in samples], dtype="float32")
    ker = np.ones(win, dtype="float32") / win
    sm = np.convolve(np.pad(xs, (win // 2, win // 2), mode="edge"), ker, mode="valid")[:len(xs)]

    # Simplify to a SMALL keypoint set, for two independent reasons:
    #   1. ffmpeg's expression parser rejects deeply nested if() chains, so a path
    #      with ~100 keypoints fails to configure the crop filter at all.
    #   2. A pan that changes direction 100 times is jitter, not a pan.
    # Raise the tolerance until the path fits; if fast-cut footage still won't fit,
    # hold a static crop — the right call for high-motion sources anyway.
    tol = simplify_px
    keys: list[tuple[float, float]] = []
    for _ in range(9):
        keys = [(samples[0][0], float(sm[0]))]
        for (t, _), x in zip(samples[1:], sm[1:]):
            if abs(x - keys[-1][1]) >= tol:
                keys.append((t, float(x)))
        if len(keys) <= max_keys:
            break
        tol *= 1.8
    if len(keys) > max_keys:
        log.info("%s: %d keypoints after simplification -> static crop",
                 Path(path).name, len(keys))
        return CropPath(crop_w, crop_h, [(0.0, float(np.median(sm)))], static=True)
    if len(keys) > 1 and keys[-1][0] < samples[-1][0]:
        keys.append((samples[-1][0], float(sm[-1])))

    spread = float(np.max(sm) - np.min(sm))
    return CropPath(crop_w, crop_h, keys, static=spread < simplify_px)


# ── captions: word-level ASS ─────────────────────────────────────────────────

def _ass_time(t: float) -> str:
    t = max(0.0, t)
    h, r = divmod(t, 3600)
    m, s = divmod(r, 60)
    return f"{int(h)}:{int(m):02d}:{s:05.2f}"


@dataclass
class CaptionPlan:
    path: Path
    lines: int
    max_chars: int
    font_px: int


_MARKUP = re.compile(r"^(>>+|\[[^\]]*\]?|\([^)]*\)?|-{2,})$")


def _is_speech(token: str) -> bool:
    """False for transcript markup that must not appear in burned-in captions."""
    t = token.strip()
    return bool(t) and not _MARKUP.match(t)


def build_ass(words: list[Word], clip_start: float, dur: float, plat: Platform,
              brand: Brand, out: Path, words_per_line: int = 4) -> CaptionPlan:
    """Word-level captions as ASS, styled per brand and positioned in the safe zone.

    ASS (libass) rather than drawtext: real text shaping, outlines, and per-word
    karaoke highlighting, all in one pass.
    """
    font_px = max(18, int(round(plat.height * brand.font_size_pct)))
    # Rough advance width per character, as a fraction of font_px. Measured directly
    # off real libass renders (ffmpeg's ass filter) of the brand font at font_px=100:
    # mixed-case text advances ~0.36x font_px per character, all-caps (brand.uppercase
    # =True, or any creator whose captions read louder) ~0.44x. The old constant,
    # 0.52, has margin over mixed case on THIS box with the brand font resolved
    # correctly -- but production has shipped lines that overran the frame, which
    # means at least one of {a wider fallback font when the exact brand font isn't
    # installed, the outline stroke pushing the visible glyph wider, a heavier/condensed
    # brand font elsewhere} eats that margin in practice. 0.60 keeps ~35% headroom over
    # the worst case measured here (uppercase) so max_chars stays an underestimate
    # rather than an overestimate across those conditions.
    avg_adv = font_px * 0.60
    usable = plat.width * 0.86
    max_chars = max(8, min(brand.max_chars_per_line, int(usable / avg_adv)))

    # Transcript markup is a SCORING signal, not speech: ">>" marks a speaker change
    # and "[laughter]" is an audio cue. Both are invaluable for ranking and must
    # never be burned into the frame.
    inside = [w for w in words
              if clip_start <= w.t < clip_start + dur and _is_speech(w.text)]
    groups: list[list[Word]] = []
    cur: list[Word] = []
    for w in inside:
        cand = " ".join([x.text for x in cur] + [w.text])
        if cur and (len(cand) > max_chars or len(cur) >= words_per_line):
            groups.append(cur)
            cur = [w]
        else:
            cur.append(w)
    if cur:
        groups.append(cur)

    margin_v = int(round(plat.height * (1.0 - plat.caption_y)))
    head = f"""[Script Info]
ScriptType: v4.00+
PlayResX: {plat.width}
PlayResY: {plat.height}
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Afterplay,{brand.font},{font_px},{brand.primary},{brand.highlight},{brand.outline},&H64000000,-1,0,0,0,100,100,0,0,1,{brand.outline_w},{brand.shadow},2,40,40,{margin_v},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
    ev = []
    for i, grp in enumerate(groups):
        gs = grp[0].t - clip_start
        ge = (groups[i + 1][0].t - clip_start) if i + 1 < len(groups) else min(
            dur, grp[-1].t - clip_start + 1.2)
        ge = max(gs + 0.30, min(ge, dur))
        parts = []
        for j, w in enumerate(grp):
            nxt = grp[j + 1].t if j + 1 < len(grp) else clip_start + ge
            cs = max(8, int(round((nxt - w.t) * 100)))       # centiseconds
            txt = w.text.upper() if brand.uppercase else w.text
            txt = txt.replace("{", "(").replace("}", ")").replace("\\", "/")
            parts.append(f"{{\\kf{cs}}}{txt}")
        ev.append(f"Dialogue: 0,{_ass_time(gs)},{_ass_time(ge)},Afterplay,,0,0,0,,"
                  + " ".join(parts))

    out.write_text(head + "\n".join(ev) + "\n", encoding="utf-8")
    return CaptionPlan(out, len(groups), max_chars, font_px)


# ── stage 4: render ──────────────────────────────────────────────────────────

@dataclass
class RenderSpec:
    """Everything that determines the pixels. Mutating this and re-rendering is how
    the agent repairs a clip that failed QC."""
    platform: Platform
    brand: Brand
    trim_start: float = 0.0          # seconds into the extract
    duration: float = 30.0
    crop: CropPath | None = None
    ass: Path | None = None
    zoom: float = 1.0                # >1 tightens the crop (subject-out-of-frame fix)
    x_bias: float = 0.0              # nudge the crop window horizontally (px)
    # A hard 9:16 crop of a 16:9 source keeps 31.6% of the frame width and then blows
    # it up 2.7x — heads lose their tops, two-shots lose a head. This fraction sets the
    # minimum width (relative to the source) that the crop window is widened to before
    # zoom; at 1.0 the crop always spans the full source width, so nothing is ever
    # cropped away — the entire frame is kept and the surplus above/below it is
    # letterboxed over a blurred fill. 0 restores the edge-to-edge crop.
    min_width_frac: float = 1.0
    loudnorm: bool = True
    watermark: Path | None = None

    def clone(self, **kw) -> "RenderSpec":
        d = dict(self.__dict__)
        d.update(kw)
        return RenderSpec(**d)


def build_filtergraph(spec: RenderSpec, src: MediaInfo) -> str:
    p = spec.platform
    fill = False
    if spec.crop:
        # widen to the context floor BEFORE zoom, so a repair that tightens the crop
        # still tightens relative to the framing the viewer would otherwise have got
        base_w = max(spec.crop.crop_w, min(src.width, int(src.width * spec.min_width_frac)))
        cw = int(base_w / max(1.0, spec.zoom)) & ~1
        ch = int(spec.crop.crop_h / max(1.0, spec.zoom)) & ~1
        xe = spec.crop.expr(src.width, cw)
        if spec.x_bias:
            xe = f"({xe})+({spec.x_bias:.1f})"
        xe = f"max(0,min({src.width - cw},{xe}))"
        ye = f"(ih-{ch})/2"
        vf = [f"crop={cw}:{ch}:x='{xe}':y='{ye}'"]
        fill = cw * p.height > ch * p.width          # wider than target -> can't fill
    else:
        vf = [f"crop='min(iw,ih*{p.aspect:.6f})':'min(ih,iw/{p.aspect:.6f})'"]

    if fill:
        # The surplus width means the sharp frame no longer fills 9:16. Sit it on a
        # blurred, slightly darkened copy of itself rather than black bars: the blur is
        # computed at 1/8 scale so it costs almost nothing.
        vf.append(f"split=2[bg][fg];"
                  f"[bg]scale={p.width // 8}:{p.height // 8},boxblur=8:2,"
                  f"scale={p.width}:{p.height},setsar=1,eq=brightness=-0.08[bgo];"
                  f"[fg]scale={p.width}:-2:flags=lanczos,setsar=1[fgo];"
                  f"[bgo][fgo]overlay=(W-w)/2:(H-h)/2")
    else:
        vf.append(f"scale={p.width}:{p.height}:flags=lanczos")
    vf.append(f"fps={p.fps}")
    vf.append("setsar=1")
    if spec.ass:
        # relative filename + cwd avoids Windows drive-colon escaping in filtergraphs
        vf.append(f"ass={spec.ass.name}")
    return ",".join(vf)


def render(extract_path: Path, spec: RenderSpec, out: Path, settings: Settings) -> MediaInfo:
    """Reframe + caption + brand + normalise, encoding only these seconds."""
    src = probe(extract_path)
    enc = detect_encoder(settings)
    vf = build_filtergraph(spec, src)

    args = ["-ss", f"{spec.trim_start:.3f}", "-i", extract_path.name,
            "-t", f"{spec.duration:.3f}"]
    if spec.watermark:
        args += ["-i", str(spec.watermark)]
        wm_w = int(spec.platform.width * spec.brand.watermark_scale)
        mx = int(spec.platform.width * spec.brand.watermark_margin)
        my = int(spec.platform.height * spec.brand.watermark_margin)
        fc = (f"[0:v]{vf}[base];[1:v]scale={wm_w}:-1[wm];"
              f"[base][wm]overlay=W-w-{mx}:{my}[v]")
        args += ["-filter_complex", fc, "-map", "[v]"]
    else:
        args += ["-vf", vf, "-map", "0:v:0"]

    if src.has_audio:
        args += ["-map", "0:a:0"]
        if spec.loudnorm:
            args += ["-af", f"loudnorm=I={spec.platform.loudness}:TP=-1.5:LRA=11,"
                            f"alimiter=limit=0.94"]
        args += ["-c:a", "aac", "-b:a", settings.audio_bitrate, "-ar", "48000"]
    else:
        args += ["-an"]

    args += ["-c:v", enc, *encoder_flags(enc, settings.crf),
             "-movflags", "+faststart", "-y", out.name]

    t0 = time.time()
    run_ffmpeg(args, cwd=extract_path.parent, timeout=900)
    rendered = out.parent / out.name
    mi = probe(rendered)
    log.info("rendered %s %dx%d %.1fs in %.2fs (%s)", out.name, mi.width, mi.height,
             mi.duration, time.time() - t0, enc)
    return mi


def render_captions_only(spec: RenderSpec, out: Path, settings: Settings,
                         seconds: float | None = None) -> Path:
    """Burn the captions over black. QC measures the text's real bounding box from
    this, which is how caption overflow is caught objectively rather than guessed."""
    p = spec.platform
    dur = seconds if seconds is not None else spec.duration
    vf = f"ass={spec.ass.name}" if spec.ass else "null"
    run_ffmpeg(["-f", "lavfi", "-i",
                f"color=c=black:s={p.width}x{p.height}:r={p.fps}:d={dur:.3f}",
                "-vf", vf, "-c:v", "libx264", "-preset", "ultrafast",
                "-pix_fmt", "yuv420p", "-y", out.name],
               cwd=spec.ass.parent if spec.ass else out.parent, timeout=300)
    return out
