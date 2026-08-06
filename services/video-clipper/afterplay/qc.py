"""Stage 4b — QC: look at the actual rendered frames and audio, and decide.

Every check is a measurement on real pixels/samples, not an assumption about what
the filtergraph should have done. Each failure carries a machine-readable `repair`
so the agent can act on it instead of guessing (PRD 7.3 self-check loop).
"""
from __future__ import annotations

import logging
from dataclasses import dataclass, field, asdict
from pathlib import Path

from .core import MediaInfo, Platform, probe, read_audio

log = logging.getLogger("afterplay")

FAIL, WARN, PASS = "fail", "warn", "pass"


@dataclass
class Finding:
    code: str
    severity: str
    message: str
    metrics: dict = field(default_factory=dict)
    repair: str | None = None       # action name the agent can apply


@dataclass
class QCReport:
    findings: list[Finding] = field(default_factory=list)
    frames_checked: int = 0

    @property
    def failures(self) -> list[Finding]:
        return [f for f in self.findings if f.severity == FAIL]

    @property
    def warnings(self) -> list[Finding]:
        return [f for f in self.findings if f.severity == WARN]

    @property
    def ok(self) -> bool:
        return not self.failures

    @property
    def repairs(self) -> list[str]:
        seen, out = set(), []
        for f in self.failures:
            if f.repair and f.repair not in seen:
                seen.add(f.repair)
                out.append(f.repair)
        return out

    def add(self, *a, **kw):
        self.findings.append(Finding(*a, **kw))
        return self

    def summary(self) -> str:
        if self.ok and not self.warnings:
            return f"QC pass ({self.frames_checked} frames)"
        bits = [f"{f.code}[{f.severity}]" for f in self.findings
                if f.severity != PASS]
        return f"QC {'pass' if self.ok else 'FAIL'} ({self.frames_checked} frames): " + ", ".join(bits)

    def to_dict(self) -> dict:
        return {"ok": self.ok, "frames_checked": self.frames_checked,
                "findings": [asdict(f) for f in self.findings]}


def sample_frames(path, n=12, t0=0.0, t1=None):
    """Read n frames spread across the clip as BGR arrays, with their timestamps."""
    import cv2
    import numpy as np
    cap = cv2.VideoCapture(str(path))
    if not cap.isOpened():
        return []
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT)) or 0
    dur = (total / fps) if total else (t1 or 0.0)
    t1 = t1 if t1 is not None else dur
    out = []
    for i in range(n):
        t = t0 + (t1 - t0) * (i / max(1, n - 1))
        cap.set(cv2.CAP_PROP_POS_MSEC, t * 1000.0)
        ok, fr = cap.read()
        if ok and fr is not None:
            out.append((t, fr))
    cap.release()
    return out


# ── individual checks ────────────────────────────────────────────────────────

def check_geometry(mi: MediaInfo, plat: Platform, want_dur: float, rep: QCReport,
                   dur_tol=0.6):
    if (mi.width, mi.height) != (plat.width, plat.height):
        rep.add("geometry", FAIL,
                f"{mi.width}x{mi.height} != {plat.width}x{plat.height} for {plat.name}",
                {"got": [mi.width, mi.height], "want": [plat.width, plat.height]})
    else:
        rep.add("geometry", PASS, f"{mi.width}x{mi.height}")

    if mi.duration > plat.max_dur:
        rep.add("duration_limit", FAIL,
                f"{mi.duration:.1f}s exceeds {plat.name} max {plat.max_dur:.0f}s",
                {"duration": mi.duration}, repair="shorten")
    if abs(mi.duration - want_dur) > dur_tol:
        rep.add("duration_drift", WARN,
                f"rendered {mi.duration:.2f}s vs planned {want_dur:.2f}s",
                {"rendered": mi.duration, "planned": want_dur})
    if mi.fps and abs(mi.fps - plat.fps) > 1.5:
        rep.add("fps", WARN, f"{mi.fps:.2f} fps vs preset {plat.fps}", {"fps": mi.fps})


def check_frames(path, plat: Platform, rep: QCReport, hook_s=1.5,
                 black_luma=14.0, freeze_delta=0.6):
    """Black frames, frozen video, and whether the hook actually shows something."""
    import numpy as np
    frames = sample_frames(path, n=14)
    rep.frames_checked = len(frames)
    if not frames:
        rep.add("decode", FAIL, "no frames decodable from render", repair="reextract")
        return

    lumas, prev, diffs = [], None, []
    for t, fr in frames:
        y = float(np.asarray(fr).mean())
        lumas.append((t, y))
        if prev is not None:
            diffs.append(float(np.abs(fr.astype("int16") - prev.astype("int16")).mean()))
        prev = fr

    dark = [t for t, y in lumas if y < black_luma]
    if dark:
        early = [t for t in dark if t <= hook_s]
        rep.add("black_frames", FAIL if early else WARN,
                f"{len(dark)} near-black sample(s) at {[round(t,2) for t in dark][:4]}",
                {"times": dark, "min_luma": min(y for _, y in lumas)},
                repair="shift_start" if early else None)
    else:
        rep.add("black_frames", PASS, f"min mean luma {min(y for _, y in lumas):.1f}")

    if diffs and max(diffs) < freeze_delta:
        rep.add("frozen_video", FAIL,
                f"no motion across samples (max frame delta {max(diffs):.3f})",
                {"max_delta": max(diffs)}, repair="reextract")


def check_subject(path, plat: Platform, rep: QCReport, edge_frac=0.16,
                  min_bad_frac=0.34):
    """Is the subject inside the frame, or has the crop pushed it to the edge?

    Model-free: the horizontal centre of mass of edge energy stands in for the
    subject. If it hugges a side border across many frames, the crop is wrong.
    """
    import numpy as np
    from .produce import _energy_columns
    frames = sample_frames(path, n=12)
    if not frames:
        return
    bad, centres = 0, []
    for _, fr in frames:
        cols = _energy_columns(fr)
        tot = float(cols.sum())
        if tot <= 0:
            continue
        cx = float((cols * np.arange(cols.size)).sum() / tot) / cols.size
        centres.append(cx)
        if cx < edge_frac or cx > 1.0 - edge_frac:
            bad += 1
    if not centres:
        return
    frac = bad / len(centres)
    metrics = {"bad_frac": round(frac, 3),
               "mean_center": round(float(np.mean(centres)), 3),
               "spread": round(float(np.ptp(centres)), 3)}
    if frac >= min_bad_frac:
        side = "left" if float(np.mean(centres)) < 0.5 else "right"
        rep.add("subject_off_center", FAIL,
                f"subject hugs the {side} edge in {frac:.0%} of samples",
                metrics, repair="recenter_" + side)
    else:
        rep.add("subject_off_center", PASS,
                f"subject centred (mean {metrics['mean_center']:.2f})", metrics)


def check_caption_box(captions_only: Path, plat: Platform, rep: QCReport,
                      lum_thresh=40):
    """Measure the caption text's real bounding box (rendered over black) and verify
    it clears the platform's UI safe zones and the frame edges."""
    import numpy as np
    frames = sample_frames(captions_only, n=16)
    if not frames:
        rep.add("caption_box", WARN, "caption probe produced no frames")
        return

    top_lim = plat.safe_top * plat.height
    bot_lim = (1.0 - plat.safe_bottom) * plat.height
    worst = None
    seen_text = False
    for t, fr in frames:
        g = np.asarray(fr).max(axis=2)
        ys, xs = np.where(g > lum_thresh)
        if ys.size == 0:
            continue
        seen_text = True
        box = (int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max()))
        over = max(top_lim - box[1], box[3] - bot_lim,
                   0 - box[0], box[2] - (plat.width - 1))
        if worst is None or over > worst[0]:
            worst = (over, box, t)

    if not seen_text:
        rep.add("caption_box", WARN, "no caption pixels found (silent clip?)")
        return

    over, box, t = worst
    x0, y0, x1, y1 = box
    # Text wide enough to be CLIPPED by the frame measures as "exactly at the edge",
    # so an overflow of 0 is indistinguishable from a perfect fit. Glyphs touching
    # the outermost columns/rows mean characters are being cut off.
    clipped = x0 <= 1 or x1 >= plat.width - 2 or y0 <= 1 or y1 >= plat.height - 2
    too_tall = (y1 - y0) > 0.45 * plat.height
    metrics = {"box": box, "overflow_px": round(float(over), 1),
               "safe_top_px": round(top_lim, 1), "safe_bottom_px": round(bot_lim, 1),
               "edge_clipped": bool(clipped), "box_h_frac": round((y1 - y0) / plat.height, 3),
               "at": round(t, 2)}
    if over > 2:
        rep.add("caption_overflow", FAIL,
                f"caption box {box} breaches the safe zone by {over:.0f}px at {t:.1f}s",
                metrics, repair="shrink_captions")
    elif clipped:
        rep.add("caption_overflow", FAIL,
                f"caption text is clipped by the frame edge at {t:.1f}s (box {box})",
                metrics, repair="shrink_captions")
    elif too_tall:
        rep.add("caption_overflow", FAIL,
                f"captions occupy {metrics['box_h_frac']:.0%} of frame height at {t:.1f}s",
                metrics, repair="shrink_captions")
    else:
        rep.add("caption_overflow", PASS,
                f"captions inside safe zone (margin {-over:.0f}px)", metrics)


def check_audio(path, plat: Platform, rep: QCReport, hook_s=1.5,
                peak_fail=0.995, silence_rms=0.004):
    import numpy as np
    a, sr = read_audio(path)
    if a.size == 0:
        rep.add("audio", FAIL, "no decodable audio in render", repair="reextract")
        return
    peak = float(np.abs(a).max())
    rms = float(np.sqrt((a ** 2).mean()))
    hook = a[:int(hook_s * sr)]
    hook_rms = float(np.sqrt((hook ** 2).mean())) if hook.size else 0.0
    clipped = int((np.abs(a) >= peak_fail).sum())
    metrics = {"peak": round(peak, 4), "rms": round(rms, 5),
               "hook_rms": round(hook_rms, 5), "clipped_samples": clipped,
               "lufs_target": plat.loudness}

    if clipped > sr * 0.002:
        rep.add("audio_clipping", FAIL,
                f"{clipped} samples at full scale (peak {peak:.3f})",
                metrics, repair="lower_loudness")
    if rms < silence_rms:
        rep.add("audio_silent", FAIL, f"clip is effectively silent (rms {rms:.5f})",
                metrics, repair="shift_start")
    elif hook_rms < silence_rms:
        rep.add("hook_silent", FAIL,
                f"first {hook_s}s is silent (rms {hook_rms:.5f}) — the hook is dead air",
                metrics, repair="snap_to_speech")
    else:
        rep.add("audio", PASS, f"peak {peak:.3f}, rms {rms:.4f}, hook {hook_rms:.4f}",
                metrics)


def check_hook_text(words, clip_start: float, rep: QCReport, hook_s=1.5):
    """The first ~1.5s must carry words, or the clip opens on nothing (PRD 7.3)."""
    n = sum(1 for w in words if clip_start <= w.t < clip_start + hook_s)
    if n == 0:
        rep.add("hook_empty", FAIL,
                f"no words in the first {hook_s}s of the clip",
                {"words_in_hook": 0}, repair="snap_to_speech")
    else:
        rep.add("hook_empty", PASS, f"{n} words in the hook", {"words_in_hook": n})


# ── the full gate ────────────────────────────────────────────────────────────

def run_qc(rendered: Path, plat: Platform, want_dur: float, *, captions_only=None,
           words=None, clip_start=0.0, reviewer=None) -> QCReport:
    """Everything, in one report. `reviewer` is an optional vision model callback:
    fn(list[(t, frame)]) -> list[Finding], for model-based visual review."""
    rep = QCReport()
    mi = probe(rendered)
    check_geometry(mi, plat, want_dur, rep)
    check_frames(rendered, plat, rep)
    check_subject(rendered, plat, rep)
    check_audio(rendered, plat, rep)
    if captions_only and Path(captions_only).exists():
        check_caption_box(Path(captions_only), plat, rep)
    if words:
        check_hook_text(words, clip_start, rep)
    if reviewer:
        try:
            for f in reviewer(sample_frames(rendered, n=6)) or []:
                rep.findings.append(f)
        except Exception as e:                          # noqa: BLE001
            log.warning("visual reviewer failed (%s); continuing on measurements", e)
            rep.add("visual_review", WARN, f"reviewer error: {e}")
    return rep
