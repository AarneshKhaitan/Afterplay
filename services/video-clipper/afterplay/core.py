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


REPO_ROOT = Path(__file__).resolve().parents[3]


def _configured_dir(var: str, fallback: Path) -> Path:
    """Resolve a directory from the environment, anchored to the repo.

    `.env` ships `AFTERPLAY_WORKDIR=services/video-clipper/.work` — relative to the repo
    root, which is the only place it means anything. Left cwd-relative it silently became
    `services/video-clipper/services/video-clipper/.work` when run from the service
    directory, which is exactly what the README tells you to do: the job succeeded, wrote
    a manifest nobody reads, and Studio showed the previous run.
    """
    raw = os.environ.get(var)
    if not raw:
        return fallback
    p = Path(raw)
    return p if p.is_absolute() else (REPO_ROOT / p)


def _configured_languages() -> tuple[str, ...]:
    raw = os.environ.get("AFTERPLAY_SUBTITLE_LANGUAGES", "en,en-US,en-GB,en-orig")
    languages = tuple(item.strip() for item in raw.split(",") if item.strip())
    return languages or ("en",)


@dataclass
class Settings:
    workdir: Path = field(default_factory=lambda: _configured_dir(
        "AFTERPLAY_WORKDIR", Path.home() / ".afterplay" / "work"))
    outdir: Path = field(default_factory=lambda: _configured_dir(
        "AFTERPLAY_OUTDIR", Path.home() / ".afterplay" / "out"))
    encoder: str | None = None          # None -> auto-detect
    crf: int = 20
    audio_bitrate: str = "128k"
    max_repair_attempts: int = 3
    http_timeout: int = 60
    # yt-dlp format preference: cap the source at 1080p to bound the fetch
    format: str = "bv*[height<=1080]+ba/b[height<=1080]/b"
    subtitle_languages: tuple[str, ...] = field(default_factory=_configured_languages)
    asr_language: str | None = field(default_factory=lambda: (
        os.environ.get("AFTERPLAY_ASR_LANGUAGE") or None
    ))

    # ── ingestion auth and pacing ────────────────────────────────────────────
    # YouTube rate-limits unauthenticated extraction and then answers every
    # request with "Sign in to confirm you're not a bot", which kills ingestion
    # mid-run. Cookies restore an authenticated session; the sleep settings keep
    # a batch of resolves under the threshold in the first place.
    cookies_file: str | None = field(default_factory=lambda: os.environ.get(
        "AFTERPLAY_COOKIES") or None)
    # e.g. "chrome", "firefox", "edge". NOTE: browsers lock their cookie DB while
    # running (yt-dlp issue 7271), so the browser must be closed for this to work.
    cookies_from_browser: str | None = field(default_factory=lambda: os.environ.get(
        "AFTERPLAY_COOKIES_FROM_BROWSER") or None)
    # Seconds to wait between extractions. Cheap insurance for batch backfills.
    sleep_interval: float = field(default_factory=lambda: float(
        os.environ.get("AFTERPLAY_SLEEP_INTERVAL", "0") or 0))
    max_sleep_interval: float = field(default_factory=lambda: float(
        os.environ.get("AFTERPLAY_MAX_SLEEP_INTERVAL", "0") or 0))
    # Passed straight through to yt-dlp, e.g. "youtube:player_client=android".
    extractor_args: str | None = field(default_factory=lambda: os.environ.get(
        "AFTERPLAY_EXTRACTOR_ARGS") or None)
    retries: int = field(default_factory=lambda: int(
        os.environ.get("AFTERPLAY_RETRIES", "3") or 3))

    def __post_init__(self):
        self.workdir = Path(self.workdir)
        self.outdir = Path(self.outdir)
        self.workdir.mkdir(parents=True, exist_ok=True)
        self.outdir.mkdir(parents=True, exist_ok=True)
        self.subtitle_languages = tuple(self.subtitle_languages)
        if not self.subtitle_languages:
            raise ValueError("subtitle_languages must contain at least one language")
        if self.asr_language is None:
            # Keep caption-less runs deterministic too. A Hindi case study can set
            # AFTERPLAY_ASR_LANGUAGE=hi instead of accepting auto-detected drift.
            self.asr_language = self.subtitle_languages[0].split("-", 1)[0]


def network_opts(settings: "Settings") -> dict:
    """yt-dlp options shared by every extraction path.

    Every call site must merge these. Applying cookies to `resolve` but not to
    `stream_urls` or `fetch_audio_only` produces the worst failure mode: metadata
    succeeds, then the run dies partway through on a bot check.
    """
    opts: dict = {
        "socket_timeout": settings.http_timeout,
        "retries": settings.retries,
    }
    if settings.cookies_file:
        opts["cookiefile"] = settings.cookies_file
    if settings.cookies_from_browser:
        # yt-dlp expects a tuple: (browser, profile, keyring, container)
        opts["cookiesfrombrowser"] = (settings.cookies_from_browser, None, None, None)
    if settings.sleep_interval:
        opts["sleep_interval"] = settings.sleep_interval
    if settings.max_sleep_interval:
        opts["max_sleep_interval"] = settings.max_sleep_interval
    if settings.extractor_args:
        key, _, value = settings.extractor_args.partition(":")
        if value:
            arg, _, val = value.partition("=")
            opts["extractor_args"] = {key: {arg: val.split(",")}}
    return opts


def is_bot_block(error: BaseException | str) -> bool:
    """True when an extraction failure is YouTube's anti-bot challenge.

    Worth naming: the generic message sends people debugging the wrong thing."""
    text = str(error).lower()
    return "confirm you" in text and "bot" in text


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

    # `-i` with no output: ffmpeg prints the header (Duration, Stream lines, fps) and
    # exits 1 without decoding a single frame. The previous `-f null -` decoded the whole
    # file to read metadata it already had — invisible on a 30s clip, but a 41-minute VP9
    # source blew the 180s timeout and the run died before any clip was cut.
    p = run_ffmpeg(["-i", path], check=False, timeout=60, loglevel="info")
    err = (p.stderr or "") + (p.stdout or "")
    if not _DUR.search(err):
        # Containers that carry no header duration (raw/streamed input) still need the
        # decode. Bounded, and only reached when the cheap path came up empty.
        p = run_ffmpeg(["-i", path, "-f", "null", "-"], check=False, timeout=180,
                       loglevel="info")
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
