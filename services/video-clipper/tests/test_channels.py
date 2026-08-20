from __future__ import annotations

import socket
from types import SimpleNamespace

import pytest

from afterplay.channels import (
    ChannelError,
    ChannelListing,
    creator_id_from,
    list_channel_videos,
    normalise_channel,
)


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("@Creator", "https://www.youtube.com/@Creator/videos"),
        ("https://youtube.com/@Creator", "https://www.youtube.com/@Creator/videos"),
        ("https://www.youtube.com/@Creator/shorts", "https://www.youtube.com/@Creator/videos"),
        ("https://youtube.com/channel/UC_abc-123/playlists?view=1", "https://www.youtube.com/channel/UC_abc-123/videos"),
        ("https://youtube.com/c/Creator/live", "https://www.youtube.com/c/Creator/videos"),
        ("https://youtube.com/user/Creator/streams", "https://www.youtube.com/user/Creator/videos"),
    ],
)
def test_normalise_channel_accepts_only_channel_shapes(raw: str, expected: str) -> None:
    assert normalise_channel(raw) == expected


@pytest.mark.parametrize(
    "raw",
    [
        "Creator",
        "dQw4w9WgXcQ",
        "https://youtube.com/@Creator/watch?v=dQw4w9WgXcQ",
        "https://youtube.com/watch?v=dQw4w9WgXcQ",
        "https://youtu.be/dQw4w9WgXcQ",
    ],
)
def test_normalise_channel_rejects_ambiguous_or_video_inputs(raw: str) -> None:
    with pytest.raises(ChannelError) as caught:
        normalise_channel(raw)
    assert caught.value.code == "invalid_channel"


def _install_ytdlp(monkeypatch: pytest.MonkeyPatch, result=None, error=None) -> dict:
    seen: dict = {}

    class YoutubeDL:
        def __init__(self, opts):
            seen.update(opts)

        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return None

        def extract_info(self, url, download=False):
            seen["url"] = url
            seen["download"] = download
            if error:
                raise error
            return result

    monkeypatch.setitem(__import__("sys").modules, "yt_dlp", SimpleNamespace(YoutubeDL=YoutubeDL))
    return seen


def test_listing_reports_requested_count_and_unknown_flat_metadata(monkeypatch) -> None:
    seen = _install_ytdlp(monkeypatch, {
        "channel_id": "UC123",
        "channel": "Creator Name",
        "uploader_id": "@Creator",
        "entries": [{"id": "video1", "title": "First"}],
    })

    listing = list_channel_videos("@Creator", limit=3)
    payload = listing.to_dict()

    assert seen["playlistend"] == 3
    assert seen["ignoreerrors"] is True
    assert payload["requested"] == 3
    assert payload["returned"] == 1
    assert payload["videos"][0]["duration_label"] == "unknown"
    assert payload["videos"][0]["view_count"] is None


@pytest.mark.parametrize(
    ("error", "code"),
    [
        (socket.timeout("timed out"), "channel_timeout"),
        (RuntimeError("Sign in to confirm you're not a bot"), "channel_blocked"),
        (RuntimeError("upstream unavailable"), "channel_unavailable"),
    ],
)
def test_listing_maps_operational_failures(monkeypatch, error: Exception, code: str) -> None:
    _install_ytdlp(monkeypatch, error=error)
    with pytest.raises(ChannelError) as caught:
        list_channel_videos("@Creator")
    assert caught.value.code == code


def test_listing_rejects_empty_or_unusable_uploads(monkeypatch) -> None:
    _install_ytdlp(monkeypatch, {"entries": [{"title": "missing id"}]})
    with pytest.raises(ChannelError) as caught:
        list_channel_videos("@Creator")
    assert caught.value.code == "no_uploads"


def test_creator_id_is_derived_from_resolved_channel() -> None:
    listing = ChannelListing("UC123", "Creator Name", "@Creator.Name", "url")
    assert creator_id_from(listing) == "creator_name"
