"""Resolve a channel to its recent uploads, without downloading anything.

`resolve.py` answers "what is this one video". Nothing answered "what has this
creator published", so channel memory could only ever be built one manually-supplied
video id at a time — which is why building memory was a CLI-only operation and
"point Afterplay at a channel" did not exist.

This module does the cheap half: a flat playlist listing (metadata only, no captions,
no media). Caption fetching stays in `resolve.resolve()` per video, so a caller can
show the list, pick a subset, and pay for only those.
"""
from __future__ import annotations

import logging
import re
import socket
import time
from dataclasses import dataclass, field
from pathlib import Path

from .core import Settings, is_bot_block, network_opts

log = logging.getLogger("afterplay")

# A channel's uploads live behind several URL shapes. Normalise to the videos tab so
# the flat listing is uploads rather than the channel's curated home page, which
# includes other people's videos in shelves.
_HANDLE = re.compile(r"^@[\w.-]{1,60}$")
_CHANNEL_URL = re.compile(
    r"^https?://(?:www\.)?youtube\.com/"
    r"(?P<channel>@[\w.-]+|c/[\w.-]+|channel/[\w-]+|user/[\w.-]+)"
    r"(?:/(?:videos|shorts|live|streams|playlists|featured|about))?/?"
    r"(?:[?#].*)?$",
    re.I,
)


class ChannelError(RuntimeError):
    """Raised when a channel cannot be resolved. Never returns a partial guess."""

    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code


@dataclass
class ChannelVideo:
    video_id: str
    title: str
    duration: float | None = None
    view_count: int | None = None
    url: str = ""

    @property
    def duration_label(self) -> str:
        if not self.duration:
            return "unknown"
        minutes, seconds = divmod(int(self.duration), 60)
        return f"{minutes}:{seconds:02d}"


@dataclass
class ChannelListing:
    channel_id: str
    name: str
    handle: str
    url: str
    videos: list[ChannelVideo] = field(default_factory=list)
    requested: int = 0
    elapsed: float = 0.0

    def to_dict(self) -> dict:
        return {
            "channel_id": self.channel_id,
            "name": self.name,
            "handle": self.handle,
            "url": self.url,
            "requested": self.requested,
            "returned": len(self.videos),
            "elapsed": round(self.elapsed, 2),
            "videos": [
                {
                    "video_id": v.video_id,
                    "title": v.title,
                    "duration": v.duration,
                    "duration_label": v.duration_label,
                    "view_count": v.view_count,
                    "url": v.url,
                }
                for v in self.videos
            ],
        }


def normalise_channel(raw: str) -> str:
    """Accept a handle or any channel URL shape; return the uploads tab URL.

    Rejecting rather than guessing matters: a watch URL silently listing the whole
    channel it belongs to would backfill memory from a source the operator never chose.
    """
    value = (raw or "").strip()
    if not value:
        raise ChannelError("invalid_channel", "A channel handle or URL is required.")

    if _HANDLE.match(value):
        return f"https://www.youtube.com/{value}/videos"

    if not value.startswith("http"):
        raise ChannelError(
            "invalid_channel",
            f"{raw!r} is not a channel handle. Include the leading @.",
        )

    match = _CHANNEL_URL.fullmatch(value)
    if not match:
        raise ChannelError(
            "invalid_channel",
            "That is not a channel URL. Use a handle (@creator) or a /channel/, /c/, "
            "/user/ or /@handle link — a single-video link will not do."
        )

    return f"https://www.youtube.com/{match.group('channel')}/videos"


def _is_timeout(exc: BaseException) -> bool:
    current: BaseException | None = exc
    while current is not None:
        if isinstance(current, (TimeoutError, socket.timeout)):
            return True
        current = current.__cause__ or current.__context__
    message = str(exc).lower()
    return "timed out" in message or "timeout" in message


def list_channel_videos(
    raw: str,
    settings: Settings | None = None,
    *,
    limit: int = 5,
    workdir: Path | None = None,
) -> ChannelListing:
    """Recent uploads for a channel. Metadata only — no captions, no media.

    `extract_flat` keeps this to a single cheap request: without it yt-dlp resolves
    every entry individually, which turns a five-video listing into five round trips
    and makes the anti-bot throttle far more likely mid-demo.
    """
    import yt_dlp

    settings = settings or Settings()
    url = normalise_channel(raw)
    limit = max(1, min(int(limit), 50))

    opts = {
        "quiet": True,
        "no_warnings": True,
        "skip_download": True,
        "extract_flat": "in_playlist",
        "playlistend": limit,
        "ignoreerrors": True,
    }
    opts.update(network_opts(settings))

    t0 = time.time()
    try:
        with yt_dlp.YoutubeDL(opts) as ydl:
            info = ydl.extract_info(url, download=False)
    except Exception as exc:                                   # noqa: BLE001
        if is_bot_block(exc):
            raise ChannelError(
                "channel_blocked",
                "YouTube blocked the channel listing. Set AFTERPLAY_COOKIES=<cookies.txt> "
                "or AFTERPLAY_COOKIES_FROM_BROWSER=<browser> and retry.",
            ) from exc
        if _is_timeout(exc):
            raise ChannelError(
                "channel_timeout",
                "The channel listing timed out. Retry or use the rehearsed cached workspace.",
            ) from exc
        raise ChannelError("channel_unavailable", f"Could not read that channel: {exc}") from exc

    if not info:
        raise ChannelError("invalid_channel", "That channel returned nothing. Check the handle.")

    entries = [e for e in (info.get("entries") or []) if e]
    if not entries:
        raise ChannelError(
            "no_uploads",
            "That channel has no listable uploads. A channel with only shorts or "
            "members-only videos will look like this."
        )

    videos: list[ChannelVideo] = []
    for entry in entries[:limit]:
        video_id = entry.get("id") or ""
        if not video_id:
            continue
        videos.append(ChannelVideo(
            video_id=video_id,
            title=entry.get("title") or video_id,
            duration=float(entry["duration"]) if entry.get("duration") else None,
            view_count=int(entry["view_count"]) if entry.get("view_count") else None,
            url=entry.get("url") or f"https://www.youtube.com/watch?v={video_id}",
        ))

    listing = ChannelListing(
        channel_id=info.get("channel_id") or info.get("id") or "",
        name=info.get("channel") or info.get("uploader") or info.get("title") or url,
        handle=info.get("uploader_id") or "",
        url=url,
        videos=videos,
        requested=limit,
        elapsed=time.time() - t0,
    )
    if not listing.videos:
        raise ChannelError("no_uploads", "That channel returned no usable upload ids.")
    log.info("channel %s: %d video(s) in %.1fs", listing.name, len(videos), listing.elapsed)
    return listing


def creator_id_from(listing: ChannelListing) -> str:
    """A stable, filesystem-safe creator id derived from the channel itself.

    Derived rather than typed so the workspace id cannot drift from the channel whose
    history it holds — the divergence the ingest form still allows today.
    """
    seed = (listing.handle or listing.name or listing.channel_id or "creator").lstrip("@")
    slug = re.sub(r"[^a-zA-Z0-9]+", "_", seed).strip("_").lower()
    return (slug or "creator")[:60]
