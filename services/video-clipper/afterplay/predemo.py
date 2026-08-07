"""Pre-demo cache and readiness check.

Run this during a warm-up window, never during a recording. It resolves each demo
stream once, persists metadata and captions, and then reports whether the demo can run
without touching the network.

Why it exists: YouTube rate-limits anonymous extraction and then answers every request
with "Sign in to confirm you're not a bot". Discovering that mid-recording ends the demo.
"""
from __future__ import annotations

import json
import time
from dataclasses import dataclass, field
from pathlib import Path

from .core import Settings, is_bot_block
from .resolve import STREAM_URL_TTL_S, from_info_json, resolve as resolve_url

CACHE_DIRNAME = ".demo-cache"


def cache_root(settings: Settings | None = None) -> Path:
    s = settings or Settings()
    return Path(s.workdir).parent / CACHE_DIRNAME


@dataclass
class StreamReport:
    stream_id: str
    cached_metadata: bool = False
    cached_captions: bool = False
    stream_urls_age_h: float | None = None
    local_media: str | None = None
    error: str | None = None

    @property
    def offline_ready(self) -> bool:
        """Can this stream drive a demo with no network call?

        Local media is the only durable answer: CDN URLs expire. Cached metadata plus
        captions is enough for the decide phase (backfill, callback detection), which is
        what the callback demo actually shows."""
        if self.error:
            return False
        if self.local_media:
            return True
        return self.cached_metadata and self.cached_captions

    @property
    def render_ready(self) -> bool:
        """Can it also render clips without re-resolving? Needs fresh URLs or local media."""
        if self.local_media:
            return True
        return self.stream_urls_age_h is not None and \
            self.stream_urls_age_h < STREAM_URL_TTL_S / 3600


@dataclass
class ReadinessReport:
    streams: list[StreamReport] = field(default_factory=list)

    @property
    def ok(self) -> bool:
        return bool(self.streams) and all(s.offline_ready for s in self.streams)

    def to_dict(self) -> dict:
        return {
            "ok": self.ok,
            "streams": [
                {"stream_id": s.stream_id, "offline_ready": s.offline_ready,
                 "render_ready": s.render_ready, "cached_metadata": s.cached_metadata,
                 "cached_captions": s.cached_captions,
                 "stream_urls_age_h": s.stream_urls_age_h,
                 "local_media": s.local_media, "error": s.error}
                for s in self.streams
            ],
        }


def _inspect(dest: Path, stream_id: str, local_media: str | None) -> StreamReport:
    rep = StreamReport(stream_id=stream_id, local_media=local_media)
    rep.cached_metadata = (dest / "source.info.json").exists()
    rep.cached_captions = any(dest.glob("*.vtt"))
    urls = dest / "stream_urls.json"
    if urls.exists():
        try:
            saved = float(json.loads(urls.read_text(encoding="utf-8")).get("saved_at", 0))
            rep.stream_urls_age_h = (time.time() - saved) / 3600
        except (OSError, ValueError, json.JSONDecodeError):
            pass
    return rep


def prepare(streams: list[str], settings: Settings | None = None,
            local_media: dict[str, str] | None = None,
            refresh: bool = True) -> ReadinessReport:
    """Resolve and cache each stream, then report readiness.

    `streams` are video ids or URLs. `local_media` maps stream id -> local file, which is
    the only network-free path that also renders.
    """
    s = settings or Settings()
    root = cache_root(s)
    root.mkdir(parents=True, exist_ok=True)
    local_media = local_media or {}
    report = ReadinessReport()

    for raw in streams:
        stream_id = raw.rsplit("=", 1)[-1].rsplit("/", 1)[-1]
        dest = root / stream_id
        dest.mkdir(parents=True, exist_ok=True)
        url = raw if raw.startswith("http") else f"https://www.youtube.com/watch?v={stream_id}"

        already = (dest / "source.info.json").exists() and any(dest.glob("*.vtt"))
        if already and not refresh:
            report.streams.append(_inspect(dest, stream_id, local_media.get(stream_id)))
            continue

        try:
            src = resolve_url(url, s, job_id=f"predemo_{stream_id}")
            work = Path(s.workdir) / f"predemo_{stream_id}"
            for pattern in ("*.info.json", "*.vtt"):
                for f in work.glob(pattern):
                    (dest / f.name).write_bytes(f.read_bytes())
            _ = src
        except Exception as e:                                    # noqa: BLE001
            rep = _inspect(dest, stream_id, local_media.get(stream_id))
            # A cached copy from an earlier warm-up still makes the demo viable.
            rep.error = ("blocked by YouTube bot check" if is_bot_block(e) else str(e)[:200]) \
                if not rep.offline_ready else None
            report.streams.append(rep)
            continue

        report.streams.append(_inspect(dest, stream_id, local_media.get(stream_id)))

    return report


def replay_source(stream_id: str, settings: Settings | None = None,
                  vtt: str | None = None):
    """Build a Source from the cache — no network. Raises if the stream was never cached."""
    root = cache_root(settings)
    dest = root / stream_id
    info = dest / "source.info.json"
    if not info.exists():
        raise FileNotFoundError(
            f"{stream_id} is not cached at {dest}. Run the pre-demo cache step first: "
            "python -m afterplay.cli predemo <stream ids>")
    caption = Path(vtt) if vtt else next(iter(sorted(dest.glob("*.vtt"))), None)
    return from_info_json(info, caption)
