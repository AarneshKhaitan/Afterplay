"""Stage 1 — RESOLVE: metadata, captions and direct stream URLs. Kilobytes only.

Nothing here downloads video. It answers: how long is it, what was said and when,
does it expose an engagement heatmap, and what URL can ffmpeg range-fetch from.
"""
from __future__ import annotations

import glob
import json
import logging
import os
import time
from dataclasses import dataclass, field
from pathlib import Path

from .core import is_bot_block, network_opts, ResolveError, Settings

log = logging.getLogger("afterplay")


@dataclass
class Source:
    url: str | None
    title: str = ""
    uploader: str = ""
    duration: float = 0.0
    view_count: int = 0
    heatmap: list[dict] = field(default_factory=list)
    chapters: list[dict] = field(default_factory=list)
    vtt_path: Path | None = None
    info_path: Path | None = None
    local_path: Path | None = None      # set for direct-upload ingest
    resolve_seconds: float = 0.0
    transcript_language: str | None = None
    transcript_source: str | None = None
    subtitle_track: str | None = None

    @property
    def is_local(self) -> bool:
        return self.local_path is not None

    @property
    def has_heatmap(self) -> bool:
        return bool(self.heatmap)


def _ydl_opts(settings: Settings, workdir: Path, extra: dict | None = None) -> dict:
    opts = {
        "quiet": True,
        "no_warnings": True,
        "skip_download": True,
        "writeinfojson": True,
        "writeautomaticsub": True,
        "writesubtitles": True,
        "subtitleslangs": list(settings.subtitle_languages),
        "subtitlesformat": "vtt",
        "outtmpl": str(workdir / "source.%(ext)s"),
        "format": settings.format,
        "ignoreerrors": False,
    }
    opts.update(network_opts(settings))   # cookies, pacing, retries
    if extra:
        opts.update(extra)
    return opts


def resolve(url: str, settings: Settings, job_id: str = "job") -> Source:
    """Fetch metadata + captions for a remote source (no video bytes)."""
    import yt_dlp

    t0 = time.time()
    workdir = settings.workdir / job_id
    workdir.mkdir(parents=True, exist_ok=True)

    try:
        with yt_dlp.YoutubeDL(_ydl_opts(settings, workdir)) as ydl:
            info = ydl.extract_info(url, download=False)
            # writeinfojson/subs only land on disk via process_info; do it explicitly
            ydl.process_info(dict(info))
    except Exception as e:                                   # noqa: BLE001
        if is_bot_block(e):
            raise ResolveError(
                f"could not resolve {url}: blocked by YouTube bot check. "
                "Set AFTERPLAY_COOKIES=<cookies.txt> or "
                "AFTERPLAY_COOKIES_FROM_BROWSER=<browser> (browser must be closed), "
                "raise AFTERPLAY_SLEEP_INTERVAL between batch resolves, "
                "or replay a cached run with --info-json.") from e
        raise ResolveError(f"could not resolve {url}: {e}") from e

    vtt, transcript_language, transcript_source, subtitle_track = _pick_vtt(
        workdir, settings.subtitle_languages, info
    )
    info_json = next(iter(sorted(workdir.glob("*.info.json"))), None)

    src = Source(
        url=info.get("webpage_url") or url,
        title=info.get("title") or "",
        uploader=info.get("uploader") or info.get("channel") or "",
        duration=float(info.get("duration") or 0.0),
        view_count=int(info.get("view_count") or 0),
        heatmap=list(info.get("heatmap") or []),
        chapters=list(info.get("chapters") or []),
        vtt_path=vtt,
        info_path=info_json,
        resolve_seconds=time.time() - t0,
        transcript_language=transcript_language,
        transcript_source=transcript_source,
        subtitle_track=subtitle_track,
    )
    if not src.duration:
        raise ResolveError(f"{url}: no duration in metadata")
    log.info("resolved %r (%.0fs, heatmap=%s, captions=%s) in %.2fs",
             src.title, src.duration, src.has_heatmap, bool(vtt), src.resolve_seconds)
    return src


def from_info_json(info_path, vtt_path=None) -> Source:
    """Build a Source from an already-saved info.json (offline / replay / tests)."""
    info = json.loads(Path(info_path).read_text(encoding="utf-8"))
    vtt = Path(vtt_path) if vtt_path else None
    track = _subtitle_track(vtt) if vtt else None
    return Source(
        url=info.get("webpage_url"),
        title=info.get("title") or "",
        uploader=info.get("uploader") or "",
        duration=float(info.get("duration") or 0.0),
        view_count=int(info.get("view_count") or 0),
        heatmap=list(info.get("heatmap") or []),
        chapters=list(info.get("chapters") or []),
        vtt_path=vtt,
        info_path=Path(info_path),
        transcript_language=_vtt_language(vtt) if vtt else None,
        transcript_source="provided_vtt" if vtt else None,
        subtitle_track=track,
    )


def from_local(path, vtt_path=None) -> Source:
    """Direct-upload ingest — the PRD's preferred path for creator-owned content."""
    from .core import probe
    p = Path(path)
    if not p.exists():
        raise ResolveError(f"{p} does not exist")
    mi = probe(p)
    vtt = Path(vtt_path) if vtt_path else None
    return Source(url=None, title=p.stem, duration=mi.duration,
                  local_path=p, vtt_path=vtt,
                  transcript_language=_vtt_language(vtt) if vtt else None,
                  transcript_source="provided_vtt" if vtt else None,
                  subtitle_track=_subtitle_track(vtt) if vtt else None)


def _subtitle_track(path: Path | None) -> str | None:
    if not path:
        return None
    stem = path.stem
    return stem.rsplit(".", 1)[-1] if "." in stem else None


def _vtt_language(path: Path | None) -> str | None:
    if not path or not path.exists():
        return None
    try:
        for line in path.read_text(encoding="utf-8-sig").splitlines()[:20]:
            key, separator, value = line.partition(":")
            if separator and key.strip().casefold() == "language":
                language = value.strip()
                return language if language and language.casefold() != "auto" else None
    except OSError:
        return None
    track = _subtitle_track(path)
    return track.split("-", 1)[0] if track else None


def _metadata_has_track(tracks: dict, track: str) -> bool:
    wanted = track.casefold()
    return any(str(key).casefold() == wanted for key in (tracks or {}))


def _track_matches(requested: str, track: str) -> bool:
    requested = requested.casefold()
    track = track.casefold()
    return track == requested or track.startswith(requested + "-")


def _pick_vtt(
    workdir: Path,
    preferred_languages: tuple[str, ...],
    info: dict | None = None,
) -> tuple[Path | None, str | None, str | None, str | None]:
    """Select only a configured language and disclose the exact selected track."""
    cands = [Path(p) for p in glob.glob(str(workdir / "*.vtt"))]
    if not cands:
        return None, None, None, None

    by_track = [(path, _subtitle_track(path) or "") for path in cands]
    for requested in preferred_languages:
        matches = [item for item in by_track if _track_matches(requested, item[1])]
        if not matches:
            continue
        matches.sort(key=lambda item: (
            item[1].casefold() != requested.casefold(),
            -item[0].stat().st_size,
        ))
        path, track = matches[0]
        metadata = info or {}
        if _metadata_has_track(metadata.get("subtitles") or {}, track):
            source = "youtube_manual"
        elif _metadata_has_track(metadata.get("automatic_captions") or {}, track):
            source = "youtube_auto"
        else:
            source = "youtube_unknown"
        language = _vtt_language(path) or track.split("-", 1)[0]
        return path, language, source, track
    return None, None, None, None


STREAM_URL_TTL_S = 4 * 3600      # CDN URLs are short-lived; assume ~4h


def cached_stream_urls(cache_dir: Path | None) -> dict | None:
    """Replay direct URLs saved by a previous resolve, if still fresh.

    Lets a rehearsed demo run without touching the network. Returns None when the
    cache is absent, and raises when it exists but has expired, because silently
    falling back to a live call is what gets a demo bot-blocked on stage."""
    if not cache_dir:
        return None
    path = Path(cache_dir) / "stream_urls.json"
    if not path.exists():
        return None
    payload = json.loads(path.read_text(encoding="utf-8"))
    age = time.time() - float(payload.get("saved_at", 0))
    if age > STREAM_URL_TTL_S:
        raise ResolveError(
            f"cached stream URLs expired ({age / 3600:.1f}h old, TTL "
            f"{STREAM_URL_TTL_S / 3600:.0f}h): re-resolve required. Re-run the "
            "pre-demo cache step, or use --local media for a network-free demo.")
    urls = payload.get("urls") or {}
    if not any(urls.values()):
        return None
    log.info("using cached stream URLs (%.0f min old)", age / 60)
    return urls


def stream_urls(url: str, settings: Settings, cache_dir: Path | None = None) -> dict:
    """Direct CDN URLs for the chosen format(s).

    These are short-lived and support HTTP range requests, which is what lets
    ffmpeg pull only the seconds a clip needs instead of the whole file.

    Prefers a fresh cache when `cache_dir` is given so a rehearsed demo never
    depends on live extraction.
    """
    cached = cached_stream_urls(cache_dir)
    if cached:
        return cached
    import yt_dlp
    opts = {"quiet": True, "no_warnings": True, "format": settings.format}
    opts.update(network_opts(settings))
    try:
        with yt_dlp.YoutubeDL(opts) as ydl:
            info = ydl.extract_info(url, download=False)
    except Exception as e:                                   # noqa: BLE001
        if is_bot_block(e):
            raise ResolveError(
                f"{url}: blocked by YouTube bot check while fetching stream URLs. "
                "Set AFTERPLAY_COOKIES=<cookies.txt> or "
                "AFTERPLAY_COOKIES_FROM_BROWSER=<browser> (browser must be closed), "
                "or run from local media with --local.") from e
        raise ResolveError(f"{url}: could not fetch stream URLs: {e}") from e

    fmts = info.get("requested_formats") or ([info] if info.get("url") else [])
    if not fmts:
        raise ResolveError(f"{url}: no direct URL available for format {settings.format!r}")
    out = {"video": None, "audio": None, "muxed": None}
    for f in fmts:
        has_v = f.get("vcodec", "none") != "none"
        has_a = f.get("acodec", "none") != "none"
        if has_v and has_a:
            out["muxed"] = f["url"]
        elif has_v:
            out["video"] = f["url"]
        elif has_a:
            out["audio"] = f["url"]
    if not any(out.values()):
        raise ResolveError(f"{url}: resolved formats carry no URLs")
    if cache_dir:
        Path(cache_dir).mkdir(parents=True, exist_ok=True)
        (Path(cache_dir) / "stream_urls.json").write_text(
            json.dumps({"saved_at": time.time(), "url": url, "urls": out}, indent=2),
            encoding="utf-8")
    return out
