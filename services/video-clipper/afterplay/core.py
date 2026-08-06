"""Core plumbing: settings, platform presets, ffmpeg discovery/execution, probing.

Everything that touches the filesystem or a subprocess funnels through here so the
rest of the package stays testable and the failure modes are in one place.
"""
from __future__ import annotations

import json
import logging
import os
import re
import shutil
import subprocess
import time
from dataclasses import dataclass, field, asdict
from pathlib import Path

log = logging.getLogger("afterplay")

# ── errors ────────────────────────────────────────────────────────────────────


class AfterplayError(Exception):
    """Base for every error this package raises deliberately."""


class FFmpegError(AfterplayError):
    def __init__(self, cmd, code, stderr):
        self.cmd, self.code, self.stderr = cmd, code, stderr
        tail = "\n".join((stderr or "").strip().splitlines()[-12:])
        super().__init__(f"ffmpeg exited {code}\n$ {' '.join(map(str, cmd))}\n{tail}")


class ResolveError(AfterplayError):
    pass


class QCFailure(AfterplayError):
    pass


# ── platform presets (PRD 7.5) ────────────────────────────────────────────────


@dataclass(frozen=True)
class Platform:
    name: str
    width: int
    height: int
    max_dur: float
    # fraction of frame height reserved for platform UI; captions must clear these
    safe_top: float
    safe_bottom: float
    caption_y: float          # caption baseline as a fraction of height
    loudness: float           # LUFS target
    fps: int = 30

    @property
    def aspect(self) -> float:
        return self.width / self.height


PLATFORMS: dict[str, Platform] = {
    # Shorts: bottom ~15% holds title/CTA, top has the channel row.
    "shorts": Platform("shorts", 1080, 1920, 60.0, 0.06, 0.18, 0.72, -14.0),
    # Reels: heavier bottom chrome (caption + audio row + action rail on the right).
    "reels": Platform("reels", 1080, 1920, 90.0, 0.08, 0.22, 0.68, -14.0),
    "tiktok": Platform("tiktok", 1080, 1920, 180.0, 0.08, 0.20, 0.70, -14.0),
    # LinkedIn/X read square-ish in feed; less chrome, captions can sit lower.
    "linkedin": Platform("linkedin", 1080, 1350, 90.0, 0.05, 0.10, 0.80, -14.0),
    "x": Platform("x", 1080, 1350, 140.0, 0.05, 0.10, 0.80, -14.0),
}


@dataclass
class Brand:
    """Per-creator visual identity (PRD 8: Creator Memory, brand slice)."""
    font: str = "Segoe UI Semibold"
    font_size_pct: float = 0.052        # of frame height
    primary: str = "&H00FFFFFF"         # ASS BGR hex: white
    highlight: str = "&H0000D9FF"       # active word: amber
    outline: str = "&H00000000"
    outline_w: float = 3.0
    shadow: float = 0.0
    uppercase: bool = False
    max_chars_per_line: int = 26
    watermark: str | None = None        # path to a PNG
    watermark_scale: float = 0.10
    watermark_margin: float = 0.04


@dataclass
class Settings:
    workdir: Path = field(default_factory=lambda: Path(os.environ.get(
        "AFTERPLAY_WORKDIR", Path.home() / ".afterplay" / "work")))
    outdir: Path = field(default_factory=lambda: Path(os.environ.get(
        "AFTERPLAY_OUTDIR", Path.home() / ".afterplay" / "out")))
    encoder: str | None = None          # None -> auto-detect
    crf: int = 20
    audio_bitrate: str = "128k"
    max_repair_attempts: int = 3
    http_timeout: int = 60
    # yt-dlp format preference: cap the source at 1080p to bound the fetch
    format: str = "bv*[height<=1080]+ba/b[height<=1080]/b"

    def __post_init__(self):
        self.workdir = Path(self.workdir)
        self.outdir = Path(self.outdir)
        self.workdir.mkdir(parents=True, exist_ok=True)
        self.outdir.mkdir(parents=True, exist_ok=True)


# ── ffmpeg ────────────────────────────────────────────────────────────────────

_FFMPEG: str | None = None
_ENCODER: str | None = None

# Preference order: hardware first (cheap, fast), libx264 as the honest fallback.
ENCODER_CANDIDATES = ("h264_nvenc", "h264_qsv", "h264_amf", "libx264")


def ffmpeg_bin() -> str:
    """Locate an ffmpeg binary: env override, PATH, then the imageio-ffmpeg wheel."""
    global _FFMPEG
    if _FFMPEG:
        return _FFMPEG
    cand = os.environ.get("AFTERPLAY_FFMPEG")
    if not cand:
        cand = shutil.which("ffmpeg")
    if not cand:
        try:
            import imageio_ffmpeg
            cand = imageio_ffmpeg.get_ffmpeg_exe()
        except Exception:
            cand = None
    if not cand or not Path(cand).exists():
        raise AfterplayError("no ffmpeg found; set AFTERPLAY_FFMPEG or pip install imageio-ffmpeg")
    _FFMPEG = str(cand)
    return _FFMPEG


def run_ffmpeg(args, cwd=None, timeout=900, check=True, loglevel="error"
               ) -> subprocess.CompletedProcess:
    """Run ffmpeg with sane defaults. Raises FFmpegError with the tail of stderr.

    `loglevel` matters: stream metadata ("Stream #0:1 ... Audio: opus") is only
    emitted at `info` or above, so probing at the default `error` level silently
    reports every file as having no audio.
    """
    cmd = [ffmpeg_bin(), "-hide_banner", "-nostdin", "-loglevel", loglevel, *map(str, args)]
    t0 = time.time()
    p = subprocess.run(cmd, cwd=str(cwd) if cwd else None, capture_output=True,
                       text=True, encoding="utf-8", errors="replace", timeout=timeout)
    log.debug("ffmpeg %.2fs rc=%s", time.time() - t0, p.returncode)
    if check and p.returncode != 0:
        raise FFmpegError(cmd, p.returncode, p.stderr)
    return p


def detect_encoder(settings: Settings | None = None) -> str:
    """Probe encoders once by actually encoding 3 frames. Availability in
    `-encoders` does NOT mean the hardware is present, so we test for real."""
    global _ENCODER
    if settings and settings.encoder:
        return settings.encoder
    if _ENCODER:
        return _ENCODER
    for enc in ENCODER_CANDIDATES:
        try:
            run_ffmpeg(["-f", "lavfi", "-i", "testsrc=size=256x144:rate=25:duration=0.12",
                        "-c:v", enc, "-f", "null", "-"], timeout=60)
            _ENCODER = enc
            log.info("video encoder: %s", enc)
            return enc
        except Exception:
            continue
    raise AfterplayError("no working H.264 encoder found")


def encoder_flags(enc: str, crf: int) -> list[str]:
    """Quality flags per encoder family (they don't share a rate-control vocabulary)."""
    if enc == "libx264":
        return ["-preset", "veryfast", "-crf", str(crf), "-pix_fmt", "yuv420p"]
    if enc == "h264_nvenc":
        return ["-preset", "p4", "-rc", "vbr", "-cq", str(crf), "-pix_fmt", "yuv420p"]
    if enc == "h264_qsv":
        return ["-preset", "veryfast", "-global_quality", str(crf), "-pix_fmt", "nv12"]
    if enc == "h264_amf":
        return ["-quality", "balanced", "-rc", "cqp", "-qp_i", str(crf),
                "-qp_p", str(crf), "-pix_fmt", "yuv420p"]
    return ["-crf", str(crf), "-pix_fmt", "yuv420p"]


# ── probing ───────────────────────────────────────────────────────────────────


@dataclass
class MediaInfo:
    path: str
    width: int = 0
    height: int = 0
    fps: float = 0.0
    duration: float = 0.0
    has_audio: bool = False
    nb_frames: int = 0

    @property
    def aspect(self) -> float:
        return self.width / self.height if self.height else 0.0


_DUR = re.compile(r"Duration:\s*(\d+):(\d\d):(\d\d\.\d+)")
_STREAM_A = re.compile(r"Stream #\d+:\d+.*: Audio:")
_STREAM_V = re.compile(r"Stream #\d+:\d+.*: Video:.*?(\d{2,5})x(\d{2,5})")
_FPS = re.compile(r"(\d+(?:\.\d+)?)\s+fps")


def probe(path) -> MediaInfo:
    """Media properties WITHOUT ffprobe (imageio-ffmpeg ships ffmpeg only).

    Reads `ffmpeg -i` stderr, then refines with OpenCV when it can open the file.
    """
    path = str(path)
    info = MediaInfo(path=path)
    p = run_ffmpeg(["-i", path, "-f", "null", "-"], check=False, timeout=180,
                   loglevel="info")          # stream lines require info level
    err = (p.stderr or "") + (p.stdout or "")
    if m := _DUR.search(err):
        info.duration = int(m.group(1)) * 3600 + int(m.group(2)) * 60 + float(m.group(3))
    if m := _STREAM_V.search(err):
        info.width, info.height = int(m.group(1)), int(m.group(2))
    if m := _FPS.search(err):
        info.fps = float(m.group(1))
    info.has_audio = bool(_STREAM_A.search(err))

    try:
        import cv2
        cap = cv2.VideoCapture(path)
        if cap.isOpened():
            info.width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)) or info.width
            info.height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT)) or info.height
            fps = cap.get(cv2.CAP_PROP_FPS)
            if fps and fps > 0:
                info.fps = fps
            n = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
            if n > 0:
                info.nb_frames = n
                if not info.duration and info.fps:
                    info.duration = n / info.fps
        cap.release()
    except Exception:
        pass
    if not info.width or not info.duration:
        raise AfterplayError(f"could not probe {path}: got {asdict(info)}")
    return info


def read_audio(path, sr=16000, timeout=300):
    """Decode audio to a mono float32 numpy array in [-1, 1]. Empty if no audio."""
    import numpy as np
    p = subprocess.run(
        [ffmpeg_bin(), "-hide_banner", "-nostdin", "-loglevel", "error", "-i", str(path),
         "-vn", "-ac", "1", "-ar", str(sr), "-f", "s16le", "-"],
        capture_output=True, timeout=timeout)
    if p.returncode != 0 or not p.stdout:
        return np.zeros(0, dtype="float32"), sr
    a = np.frombuffer(p.stdout, dtype="<i2").astype("float32") / 32768.0
    return a, sr


def synth_source(path, seconds=40, size=(1280, 720), fps=30, tone=True):
    """Generate a deterministic test video. Used by the test suite so the whole
    pipeline can be exercised hermetically, with no network and no fixtures."""
    args = ["-f", "lavfi", "-i",
            f"testsrc=size={size[0]}x{size[1]}:rate={fps}:duration={seconds}"]
    if tone:
        args += ["-f", "lavfi", "-i", f"sine=frequency=350:duration={seconds}:sample_rate=44100"]
    args += ["-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", "-g", "30"]
    if tone:
        args += ["-c:a", "aac", "-b:a", "96k", "-shortest"]
    args += ["-y", str(path)]
    run_ffmpeg(args, timeout=600)
    return Path(path)


def jdump(obj, path):
    Path(path).write_text(json.dumps(obj, indent=2, default=str), encoding="utf-8")
