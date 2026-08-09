"""Face-aware reframing.

The saliency tracker in `produce.py` finds where the *detail* is. That is a decent
proxy, but it centres on a busy desk as happily as on a person. This module finds
actual faces (YuNet, a 230 KB ONNX model) and, when it finds them, drives the crop
from the speaker instead.

Degrades in a straight line: no model file -> no faces found -> saliency. The pipeline
never depends on the model being present.
"""
from __future__ import annotations

import logging
import os
from dataclasses import dataclass
from pathlib import Path

from .core import probe
from .produce import CropPath

log = logging.getLogger("afterplay")

MODEL_ENV = "AFTERPLAY_FACE_MODEL"
DEFAULT_PATHS = ("models/yunet.onnx", "~/.afterplay/models/yunet.onnx")
MODEL_URL = ("https://media.githubusercontent.com/media/opencv/opencv_zoo/main/"
             "models/face_detection_yunet/face_detection_yunet_2023mar.onnx")


def model_path() -> Path | None:
    """Locate the face model: env override, then the usual places."""
    cand = os.environ.get(MODEL_ENV)
    if cand and Path(cand).exists():
        return Path(cand)
    for p in DEFAULT_PATHS:
        q = Path(p).expanduser()
        if q.exists():
            return q
    return None


def fetch_model(dest: Path | None = None) -> Path:
    """Download YuNet once. NOTE the media.githubusercontent.com host: opencv_zoo
    stores models in git-lfs, and the plain `raw` URL returns a 131-byte pointer file
    that loads as a corrupt ONNX."""
    import urllib.request
    dest = Path(dest or Path("models/yunet.onnx"))
    dest.parent.mkdir(parents=True, exist_ok=True)
    urllib.request.urlretrieve(MODEL_URL, dest)
    if dest.stat().st_size < 100_000:            # an LFS pointer, not a model
        dest.unlink(missing_ok=True)
        raise RuntimeError("face model download returned an LFS pointer, not the model")
    log.info("face model: %s (%d bytes)", dest, dest.stat().st_size)
    return dest


@dataclass
class FaceTrack:
    """Per-sample face centres, in source pixels."""
    times: list[float]
    centres: list[float]
    sizes: list[float]
    coverage: float          # fraction of sampled frames with a face

    def __bool__(self):
        return bool(self.centres)


def detect_faces(path, sample_fps: float = 3.0, min_score: float = 0.7) -> FaceTrack:
    """Sample frames and track the dominant face's horizontal centre.

    'Dominant' = largest detection, which is the speaker in a two-shot far more often
    than the highest-confidence one.
    """
    import cv2
    mp = model_path()
    if mp is None:
        return FaceTrack([], [], [], 0.0)

    mi = probe(path)
    try:
        det = cv2.FaceDetectorYN.create(str(mp), "", (mi.width, mi.height),
                                        score_threshold=min_score)
    except Exception as e:                                    # noqa: BLE001
        log.warning("face detector unavailable (%s); using saliency", e)
        return FaceTrack([], [], [], 0.0)

    cap = cv2.VideoCapture(str(path))
    if not cap.isOpened():
        return FaceTrack([], [], [], 0.0)
    step = max(1, int(round((mi.fps or 30) / sample_fps)))
    times, centres, sizes = [], [], []
    sampled = 0
    idx = 0
    while True:
        ok, frame = cap.read()
        if not ok:
            break
        if idx % step == 0:
            sampled += 1
            t = idx / (mi.fps or 30)
            try:
                _, faces = det.detect(frame)
            except Exception:                                 # noqa: BLE001
                faces = None
            if faces is not None and len(faces):
                # faces: [x, y, w, h, ...landmarks..., score]
                best = max(faces, key=lambda f: float(f[2]) * float(f[3]))
                x, y, w, h = (float(best[0]), float(best[1]),
                              float(best[2]), float(best[3]))
                times.append(t)
                centres.append(x + w / 2.0)
                sizes.append(w * h)
        idx += 1
    cap.release()
    cov = len(centres) / sampled if sampled else 0.0
    log.info("faces: %d/%d sampled frames (%.0f%% coverage)", len(centres), sampled,
             cov * 100)
    return FaceTrack(times, centres, sizes, cov)


def face_crop_path(path, target_aspect: float, *, min_coverage: float = 0.35,
                   smooth_s: float = 1.2, sample_fps: float = 3.0,
                   simplify_px: float = 14.0, max_keys: int = 12) -> CropPath | None:
    """A crop path driven by faces, or None if faces are too sparse to trust.

    Returning None (rather than a bad path) is what keeps the fallback honest.
    """
    import numpy as np

    track = detect_faces(path, sample_fps=sample_fps)
    if not track or track.coverage < min_coverage:
        if track:
            log.info("face coverage %.0f%% below %.0f%% -> saliency",
                     track.coverage * 100, min_coverage * 100)
        return None

    mi = probe(path)
    crop_h = mi.height
    crop_w = int(round(crop_h * target_aspect))
    if crop_w > mi.width:
        crop_w, crop_h = mi.width, int(round(mi.width / target_aspect))
    crop_w -= crop_w % 2
    crop_h -= crop_h % 2

    xs = np.array(track.centres, dtype="float32")
    win = max(1, int(round(smooth_s * sample_fps)))
    ker = np.ones(win, dtype="float32") / win
    sm = np.convolve(np.pad(xs, (win // 2, win // 2), mode="edge"), ker,
                     mode="valid")[:xs.size]

    # same bounded simplification as the saliency path: ffmpeg's expression parser
    # cannot take deep if() nesting, and a 100-key pan is jitter
    tol = simplify_px
    keys: list[tuple[float, float]] = []
    for _ in range(9):
        keys = [(track.times[0], float(sm[0]))]
        for t, x in zip(track.times[1:], sm[1:]):
            if abs(x - keys[-1][1]) >= tol:
                keys.append((t, float(x)))
        if len(keys) <= max_keys:
            break
        tol *= 1.8
    if len(keys) > max_keys:
        return CropPath(crop_w, crop_h, [(0.0, float(np.median(sm)))], static=True)

    spread = float(np.max(sm) - np.min(sm))
    return CropPath(crop_w, crop_h, keys, static=spread < simplify_px)


def track_subject_best(path, target_aspect: float, **kw) -> CropPath:
    """Faces when they are there, saliency when they are not. This is what the
    pipeline calls."""
    from .produce import track_subject
    try:
        cp = face_crop_path(path, target_aspect, **kw)
        if cp is not None:
            log.info("reframe: face-driven (%d keypoints%s)", len(cp.keys),
                     ", static" if cp.static else "")
            return cp
    except Exception as e:                                    # noqa: BLE001
        log.warning("face reframing failed (%s); using saliency", e)
    return track_subject(path, target_aspect)


def face_in_safe_zone(path, plat, min_coverage: float = 0.3,
                      edge_frac: float = 0.14) -> tuple[bool, dict]:
    """QC helper: is the detected face inside the horizontal safe band?

    This is the check the saliency-based `check_subject` can only approximate — a face
    cropped at the edge is the single most obvious reframing failure.
    """
    track = detect_faces(path, sample_fps=2.0)
    if not track or track.coverage < min_coverage:
        return True, {"faces": len(track.centres), "coverage": round(track.coverage, 3),
                      "verdict": "insufficient faces to judge"}
    import numpy as np
    mi = probe(path)
    frac = np.array(track.centres, dtype="float32") / max(1, mi.width)
    bad = float(((frac < edge_frac) | (frac > 1 - edge_frac)).mean())
    return bad < 0.34, {"faces": len(track.centres),
                        "coverage": round(track.coverage, 3),
                        "edge_frac": round(bad, 3),
                        "mean_center": round(float(frac.mean()), 3)}
