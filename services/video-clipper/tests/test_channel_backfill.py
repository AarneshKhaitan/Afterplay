from __future__ import annotations

import json
from argparse import Namespace
from pathlib import Path

from afterplay import cli
from afterplay.channel_backfill import (
    CONTRACT_VERSION,
    REPORT_SCHEMA,
    STATUS_SCHEMA,
    preview_channel,
    run_channel_backfill,
)
from afterplay.channels import ChannelListing, ChannelVideo
from afterplay.core import Settings
from afterplay.resolve import Source


def test_dry_run_lists_channel_without_constructing_memory(monkeypatch) -> None:
    listing = ChannelListing(
        "UC123",
        "Creator",
        "@Creator",
        "https://www.youtube.com/@Creator/videos",
        [ChannelVideo("v1", "One")],
        requested=3,
    )
    monkeypatch.setattr(
        "afterplay.channel_backfill.list_channel_videos",
        lambda *args, **kwargs: listing,
    )

    result = preview_channel("@Creator", limit=3)

    assert result["schema"] == REPORT_SCHEMA
    assert result["version"] == CONTRACT_VERSION
    assert result["mode"] == "preview"
    assert result["creator_id"] == "creator"
    assert result["listing"]["videos"][0]["video_id"] == "v1"


def test_cli_dry_run_does_not_require_rights_or_creator(monkeypatch, capsys) -> None:
    monkeypatch.setattr(
        "afterplay.channel_backfill.preview_channel",
        lambda *args, **kwargs: {"mode": "preview", "creator_id": "creator"},
    )
    args = Namespace(
        dry_run=True, channel="@Creator", limit=3, creator=None, videos=None,
        rights=None, job_id=None, workers=None,
    )
    assert cli.cmd_backfill_channel(args) == 0
    assert json.loads(capsys.readouterr().out)["creator_id"] == "creator"


def test_channel_run_is_partial_and_keeps_completed_memory(tmp_path, monkeypatch) -> None:
    work = tmp_path / "work"
    memory_root = tmp_path / "memory"
    monkeypatch.setenv("AFTERPLAY_MEMORY", str(memory_root))
    vtt = tmp_path / "one.vtt"
    vtt.write_text(
        "WEBVTT\n\n00:00:00.000 --> 00:02:31.000\nthis callback returns today\n",
        encoding="utf-8",
    )

    def resolve(url: str, settings: Settings, job_id: str) -> Source:
        if "missing" in url:
            return Source(url=url, vtt_path=None)
        return Source(
            url=url,
            vtt_path=vtt,
            transcript_language="en",
            transcript_source="youtube_subtitle",
            subtitle_track="en.vtt",
        )

    def extractor(_stream: str, _text: str) -> dict:
        return {"threads": [{
            "id": "callback",
            "kind": "recurring_bit",
            "label": "Callback",
            "summary": "A callback returns.",
            "first_seen": {"t": 0, "quote": "this callback returns today"},
        }]}

    monkeypatch.setattr("afterplay.channel_backfill.resolve_url", resolve)
    monkeypatch.setattr(
        "afterplay.channel_memory.extract_threads_with_openai",
        lambda stream, text, client=None: extractor(stream, text),
    )
    monkeypatch.setattr("afterplay.channel_memory.openai_client", lambda: object())
    monkeypatch.setattr(
        "afterplay.channel_memory.embed_texts",
        lambda texts: [[1.0, float(index)] for index, _ in enumerate(texts)],
    )

    code, report = run_channel_backfill(
        "@Creator",
        creator_id="creator",
        video_ids=["ok", "missing"],
        rights="permission_granted",
        job_id="job1",
        workers=8,
        settings=Settings(workdir=work),
    )

    assert code == 3
    assert report["state"] == "partial"
    assert report["videos_succeeded"] == 1
    assert report["videos_failed"] == 1
    assert report["captions_only"] is True and report["asr_used"] is False
    status = json.loads((work / "job1" / "status.json").read_text())
    assert status["schema"] == STATUS_SCHEMA
    assert status["state"] == "partial"
    assert (memory_root / "creator" / "threads.json").exists()
    provenance = json.loads((memory_root / "creator" / "provenance.json").read_text())
    assert provenance["runs"][-1]["footage_rights"] == "permission_granted"
    assert provenance["runs"][-1]["asr_used"] is False
