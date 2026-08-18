from __future__ import annotations

import json

from afterplay.core import Settings
from afterplay.resolve import _pick_vtt, _ydl_opts, from_info_json


def _vtt(path, language: str, body: str = "hello"):
    path.write_text(
        f"WEBVTT\nKind: captions\nLanguage: {language}\n\n"
        f"00:00:00.000 --> 00:00:01.000\n{body}\n",
        encoding="utf-8",
    )
    return path


def test_settings_parse_language_priority_and_pin_asr(tmp_path, monkeypatch):
    monkeypatch.setenv("AFTERPLAY_SUBTITLE_LANGUAGES", "hi, en")
    monkeypatch.setenv("AFTERPLAY_ASR_LANGUAGE", "hi")

    settings = Settings(workdir=tmp_path / "work", outdir=tmp_path / "out")

    assert settings.subtitle_languages == ("hi", "en")
    assert settings.asr_language == "hi"
    assert _ydl_opts(settings, tmp_path)["subtitleslangs"] == ["hi", "en"]


def test_asr_language_defaults_to_first_configured_track(tmp_path):
    settings = Settings(
        workdir=tmp_path / "work",
        outdir=tmp_path / "out",
        subtitle_languages=("hi", "en"),
    )

    assert settings.asr_language == "hi"


def test_pick_vtt_respects_priority_and_records_manual_track(tmp_path):
    _vtt(tmp_path / "source.en.vtt", "en", "English")
    hindi = _vtt(tmp_path / "source.hi.vtt", "hi", "हिंदी")
    info = {
        "subtitles": {"hi": [{"ext": "vtt"}]},
        "automatic_captions": {"en": [{"ext": "vtt"}]},
    }

    selected = _pick_vtt(tmp_path, ("hi", "en"), info)

    assert selected == (hindi, "hi", "youtube_manual", "hi")


def test_pick_vtt_records_automatic_caption_and_never_falls_back(tmp_path):
    english = _vtt(tmp_path / "source.en-orig.vtt", "en")
    info = {"automatic_captions": {"en-orig": [{"ext": "vtt"}]}}

    assert _pick_vtt(tmp_path, ("en",), info) == (
        english,
        "en",
        "youtube_auto",
        "en-orig",
    )
    assert _pick_vtt(tmp_path, ("hi",), info) == (None, None, None, None)


def test_provided_vtt_provenance_is_preserved(tmp_path):
    info = tmp_path / "source.info.json"
    info.write_text(json.dumps({
        "webpage_url": "https://example.test/video",
        "title": "Known streamer",
        "duration": 60,
    }), encoding="utf-8")
    vtt = _vtt(tmp_path / "source.hi.vtt", "hi", "यह एक परीक्षण है")

    source = from_info_json(info, vtt)

    assert source.vtt_path == vtt
    assert source.transcript_language == "hi"
    assert source.transcript_source == "provided_vtt"
    assert source.subtitle_track == "hi"
