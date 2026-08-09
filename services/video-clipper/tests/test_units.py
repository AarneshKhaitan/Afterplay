"""Unit tests — hermetic: no network, no fixtures, no GPU."""
from __future__ import annotations

import json
import math
from pathlib import Path

import pytest

from afterplay import (Brand, CreatorMemory, PLATFORMS, Settings, parse_vtt, rank,
                    sentences)
from afterplay.produce import CropPath, build_ass
from afterplay.qc import Finding, QCReport, FAIL, PASS, WARN, check_geometry
from afterplay.core import MediaInfo
from afterplay.understand import cold_signals, heat_avg, snap, candidates

# The real YouTube rolling-caption shape. NOTE the line holding a single SPACE
# between the timing line and the text — that is what YouTube actually emits, and
# a block-splitting parser orphans the text when it is a truly blank line instead.
ROLLING_VTT = (
    "WEBVTT\nKind: captions\nLanguage: en\n\n"
    "00:00:00.160 --> 00:00:03.429 align:start position:0%\n \n"
    "Ladies<00:00:00.560><c> and</c><00:00:00.800><c> gentlemen,</c>"
    "<00:00:01.439><c> welcome</c><00:00:01.920><c> to</c>\n\n"
    "00:00:03.429 --> 00:00:03.439 align:start position:0%\n"
    "Ladies and gentlemen, welcome to\n \n\n"
    "00:00:03.439 --> 00:00:09.160 align:start position:0%\n"
    "Ladies and gentlemen, welcome to\n"
    "General<00:00:04.080><c> Knowledge.</c>\n\n"
    "00:00:09.160 --> 00:00:09.170 align:start position:0%\n"
    "General Knowledge.\n \n\n"
    "00:00:09.170 --> 00:00:12.500 align:start position:0%\n"
    "General Knowledge.\n"
    "Are<00:00:09.500><c> you</c><00:00:09.800><c> ready?</c><00:00:10.400><c> [laughter]</c>\n"
)

# Same cues, but with a genuinely blank separator line. Both layouts must parse
# identically — this is the regression that shipped a triplicated transcript.
BLANKLINE_VTT = ROLLING_VTT.replace("\n \n", "\n\n")

MANUAL_VTT = """WEBVTT

00:00:01.000 --> 00:00:03.000
&gt;&gt; First line here.

00:00:03.000 --> 00:00:05.000
&gt;&gt; Second line follows.
"""


class TestTranscript:
    def test_rolling_captions_are_not_duplicated(self):
        words = parse_vtt(ROLLING_VTT)
        text = " ".join(w.text for w in words)
        # the phrase appears once in the transcript, not once per rolling cue
        assert text.count("Ladies") == 1
        assert text.count("General") == 1
        assert text.count("gentlemen,") == 1

    def test_cue_settings_are_not_read_as_speech(self):
        words = parse_vtt(ROLLING_VTT)
        joined = " ".join(w.text for w in words)
        assert "align:start" not in joined
        assert "position:0%" not in joined

    def test_word_timings_are_monotonic_and_real(self):
        words = parse_vtt(ROLLING_VTT)
        ts = [w.t for w in words]
        assert ts == sorted(ts)
        assert words[0].text == "Ladies" and words[0].t == pytest.approx(0.16)
        assert any(w.text == "Knowledge." and w.t == pytest.approx(4.08) for w in words)

    def test_html_entities_decoded_in_manual_captions(self):
        words = parse_vtt(MANUAL_VTT)
        joined = " ".join(w.text for w in words)
        assert ">>" in joined and "&gt;" not in joined

    def test_blank_and_space_separator_layouts_parse_identically(self):
        a = [(w.t, w.text) for w in parse_vtt(ROLLING_VTT)]
        b = [(w.t, w.text) for w in parse_vtt(BLANKLINE_VTT)]
        assert a == b, "cue separator style must not change the transcript"
        assert a[0] == (pytest.approx(0.16), "Ladies")

    def test_empty_input_is_not_a_crash(self):
        assert parse_vtt("") == []
        assert parse_vtt("WEBVTT\n\n") == []
        assert sentences([]) == []

    def test_sentences_split_on_punctuation_and_never_mid_word(self):
        sents = sentences(parse_vtt(ROLLING_VTT))
        assert len(sents) >= 2
        for s in sents:
            assert s.end > s.start
            assert not s.text.startswith(" ")


class TestScoring:
    def test_heat_avg_is_overlap_weighted(self):
        hm = [{"start_time": 0, "end_time": 10, "value": 0.2},
              {"start_time": 10, "end_time": 20, "value": 1.0}]
        assert heat_avg(hm, 0, 10) == pytest.approx(0.2)
        assert heat_avg(hm, 0, 20) == pytest.approx(0.6)
        assert heat_avg(hm, 8, 12) == pytest.approx(0.6)

    def test_heat_avg_none_without_heatmap(self):
        assert heat_avg([], 0, 10) is None

    def test_cold_signals_reward_laughter_and_turns(self):
        dull = cold_signals("a plain sentence with nothing much happening", 30)
        lively = cold_signals(">> what? [laughter] >> no way! really? [applause]", 30)
        assert lively.score > dull.score
        assert lively.events == 2 and lively.turns == 2 and lively.questions == 2

    def test_rank_respects_min_gap_and_count(self):
        words = [{"t": i * 0.4, "text": f"word{i}."} for i in range(600)]
        from afterplay.understand import Word
        sents = sentences([Word(w["t"], w["text"]) for w in words])
        picked = rank(sents, None, target=30, n=4, min_gap=20)
        assert len(picked) <= 4
        for a, b in zip(picked, picked[1:]):
            lo, hi = sorted([a, b], key=lambda m: m.start)
            assert hi.start >= lo.end + 20 or hi.end <= lo.start - 20

    def test_candidates_stay_near_target_length(self):
        from afterplay.understand import Word
        sents = sentences([Word(i * 0.5, f"w{i}.") for i in range(200)])
        for start, end, _ in candidates(sents, target=30, tol=10):
            assert 20 <= end - start <= 40

    def test_snap_moves_to_sentence_boundaries(self):
        from afterplay.understand import Sentence
        sents = [Sentence(0, 5, "a"), Sentence(5, 12, "b"), Sentence(12, 20, "c")]
        assert snap(sents, 4.4, 13.0) == (5, 12)


class TestCropPath:
    def test_static_expression_is_clamped_inside_the_frame(self):
        cp = CropPath(crop_w=608, crop_h=1080, keys=[(0.0, 50.0)], static=True)
        assert float(cp.expr(1920)) == 0.0                     # cannot go negative
        cp2 = CropPath(608, 1080, [(0.0, 5000.0)], static=True)
        assert float(cp2.expr(1920)) == pytest.approx(1920 - 608)

    def test_pan_expression_covers_every_keypoint(self):
        cp = CropPath(608, 1080, [(0.0, 700.0), (2.0, 900.0), (4.0, 1100.0)])
        e = cp.expr(1920)
        assert e.count("if(") == 2 and "t-0.000" in e and "t-2.000" in e

    def test_expression_is_valid_ffmpeg_syntax(self):
        cp = CropPath(608, 1080, [(0.0, 700.0), (1.5, 300.0)])
        e = cp.expr(1920)
        assert e.count("(") == e.count(")")

    def test_width_override_recentres_the_window(self):
        # a wider window must move LEFT by half the extra width, not stay put
        cp = CropPath(608, 1080, [(0.0, 700.0)], static=True)
        assert float(cp.expr(1920)) == pytest.approx(700 - 608 / 2)
        assert float(cp.expr(1920, 900)) == pytest.approx(700 - 900 / 2)


class TestContextFloor:
    """A hard 9:16 crop of 16:9 keeps 31.6% of the width; the floor widens it."""

    def _spec(self, **kw):
        from afterplay.produce import RenderSpec
        return RenderSpec(platform=PLATFORMS["shorts"], brand=Brand(),
                          crop=CropPath(404, 720, [(0.0, 640.0)], static=True), **kw)

    def _src(self):
        return MediaInfo("src.mp4", width=1280, height=720, fps=30.0, duration=30.0,
                         has_audio=True)

    def test_narrow_crop_is_widened_and_composited(self):
        from afterplay.produce import build_filtergraph
        vf = build_filtergraph(self._spec(), self._src())
        assert vf.startswith("crop=640:720:")          # 50% of 1280, not 404
        assert "overlay=(W-w)/2:(H-h)/2" in vf and "boxblur" in vf

    def test_floor_off_keeps_the_edge_to_edge_crop(self):
        from afterplay.produce import build_filtergraph
        vf = build_filtergraph(self._spec(min_width_frac=0.0), self._src())
        assert vf.startswith("crop=404:720:")
        assert "overlay" not in vf and "scale=1080:1920:flags=lanczos" in vf


class TestCaptions:
    def test_ass_is_wellformed_and_inside_the_safe_zone(self, tmp_path):
        from afterplay.understand import Word
        words = [Word(10.0 + i * 0.35, f"word{i}") for i in range(24)]
        plat, brand = PLATFORMS["shorts"], Brand()
        plan = build_ass(words, 10.0, 8.0, plat, brand, tmp_path / "c.ass")
        txt = plan.path.read_text(encoding="utf-8")
        assert "[Script Info]" in txt and "Dialogue:" in txt
        assert f"PlayResX: {plat.width}" in txt
        # MarginV must keep text above the platform's bottom UI band
        margin_v = int(round(plat.height * (1.0 - plat.caption_y)))
        assert f",{margin_v},1" in txt
        assert plan.lines > 1

    def test_line_length_respects_the_character_budget(self, tmp_path):
        from afterplay.understand import Word
        words = [Word(i * 0.3, "supercalifragilistic") for i in range(10)]
        plan = build_ass(words, 0.0, 4.0, PLATFORMS["shorts"], Brand(),
                        tmp_path / "c.ass")
        for line in plan.path.read_text(encoding="utf-8").splitlines():
            if line.startswith("Dialogue:"):
                visible = line.split(",,", 1)[1]
                import re
                visible = re.sub(r"\{[^}]*\}", "", visible)
                assert len(visible) <= plan.max_chars + 24   # +1 long word tolerance

    def test_braces_in_text_cannot_break_ass_override_syntax(self, tmp_path):
        from afterplay.understand import Word
        plan = build_ass([Word(0.0, "{evil}"), Word(0.5, "back\\slash")],
                         0.0, 2.0, PLATFORMS["shorts"], Brand(), tmp_path / "c.ass")
        body = [l for l in plan.path.read_text(encoding="utf-8").splitlines()
                if l.startswith("Dialogue:")][0]
        assert "{evil}" not in body and "(evil)" in body

    def test_no_words_yields_no_dialogue_events(self, tmp_path):
        plan = build_ass([], 0.0, 5.0, PLATFORMS["shorts"], Brand(), tmp_path / "c.ass")
        assert plan.lines == 0
        assert "Dialogue:" not in plan.path.read_text(encoding="utf-8")


class TestQCLogic:
    def test_report_ok_only_without_failures(self):
        r = QCReport()
        r.add("x", WARN, "meh")
        assert r.ok
        r.add("y", FAIL, "bad", repair="shift_start")
        assert not r.ok and r.repairs == ["shift_start"]

    def test_repairs_deduplicated_in_priority_order(self):
        r = QCReport()
        r.add("a", FAIL, "1", repair="shrink_captions")
        r.add("b", FAIL, "2", repair="shrink_captions")
        r.add("c", FAIL, "3", repair="shift_start")
        assert r.repairs == ["shrink_captions", "shift_start"]

    def test_geometry_check_catches_wrong_size(self):
        r = QCReport()
        check_geometry(MediaInfo("x", 1920, 1080, 30, 30), PLATFORMS["shorts"], 30, r)
        assert any(f.code == "geometry" and f.severity == FAIL for f in r.findings)

    def test_geometry_check_flags_over_length(self):
        r = QCReport()
        mi = MediaInfo("x", 1080, 1920, 30, 75.0)
        check_geometry(mi, PLATFORMS["shorts"], 75.0, r)   # shorts cap is 60s
        f = [x for x in r.findings if x.code == "duration_limit"]
        assert f and f[0].repair == "shorten"

    def test_policy_orders_start_fixes_before_cosmetics(self):
        from afterplay.agent import HeuristicPolicy
        r = QCReport()
        r.add("a", FAIL, "", repair="shrink_captions")
        r.add("b", FAIL, "", repair="snap_to_speech")
        assert HeuristicPolicy().choose_repairs(r, 1)[0] == "snap_to_speech"


class TestMemory:
    def test_roundtrip_and_isolation(self, tmp_path, monkeypatch):
        monkeypatch.setenv("AFTERPLAY_MEMORY", str(tmp_path))
        m = CreatorMemory.load("ksi")
        m.brand.font_size_pct = 0.044
        m.prefs.n_clips = 6
        m.save()
        again = CreatorMemory.load("ksi")
        assert again.brand.font_size_pct == pytest.approx(0.044)
        assert again.prefs.n_clips == 6
        other = CreatorMemory.load("someone_else")
        assert other.brand.font_size_pct == Brand().font_size_pct

    def test_explicit_pins_beat_learned_values(self, tmp_path, monkeypatch):
        monkeypatch.setenv("AFTERPLAY_MEMORY", str(tmp_path))
        m = CreatorMemory.load("c1")
        m.pin("brand", font_size_pct=0.060)
        for i in range(10):
            m.corrections.append({"job": "j", "clip": f"c{i}", "platform": "shorts",
                                  "repairs": ["shrink_captions"], "ok": True})
        m._learn()
        assert m.brand.font_size_pct == pytest.approx(0.060)   # pin held

    def test_repeated_repairs_move_the_default(self, tmp_path, monkeypatch):
        monkeypatch.setenv("AFTERPLAY_MEMORY", str(tmp_path))
        m = CreatorMemory.load("c2")
        before = m.brand.font_size_pct
        for i in range(10):
            m.corrections.append({"job": "j", "clip": f"c{i}", "platform": "shorts",
                                  "repairs": ["shrink_captions"], "ok": True})
        applied = m._learn()
        assert m.brand.font_size_pct < before
        assert "brand.font_size_pct" in applied

    def test_corrupt_memory_file_degrades_instead_of_crashing(self, tmp_path, monkeypatch):
        monkeypatch.setenv("AFTERPLAY_MEMORY", str(tmp_path))
        d = tmp_path / "c3"
        d.mkdir(parents=True)
        (d / "profile.json").write_text("{ not json", encoding="utf-8")
        m = CreatorMemory.load("c3")
        assert m.creator_id == "c3" and m.brand.font_size_pct == Brand().font_size_pct


class TestPlatforms:
    def test_all_presets_are_vertical_or_square_and_sane(self):
        for name, p in PLATFORMS.items():
            assert p.aspect < 1.0, name
            assert 0 < p.safe_top < 0.3 and 0 < p.safe_bottom < 0.4, name
            assert p.caption_y + p.safe_bottom <= 1.02, name
            assert p.max_dur >= 60 or name == "shorts"
            assert p.width % 2 == 0 and p.height % 2 == 0

    def test_tools_registry_exposes_llm_ready_schemas(self):
        from afterplay.agent import TOOLS
        specs = TOOLS.specs()
        assert len(specs) >= 8
        for s in specs:
            assert s["name"] and s["description"]
            assert s["input_schema"]["type"] == "object"
        assert "inspect_clip" in TOOLS and "extract_range" in TOOLS


class TestCaptionSanitisation:
    """REGRESSION: ">>" speaker markers and "[laughter]" audio cues were being burned
    into the frame. They are ranking signals, never caption text."""

    def test_markup_is_stripped_from_burned_captions(self, tmp_path):
        from afterplay.understand import Word
        from afterplay.produce import build_ass, _is_speech
        words = [Word(0.0, ">>"), Word(0.2, "What"), Word(0.4, "can"),
                 Word(0.6, "[laughter]"), Word(0.8, "we"), Word(1.0, "eat?"),
                 Word(1.2, "(applause)"), Word(1.4, "--")]
        plan = build_ass(words, 0.0, 3.0, PLATFORMS["shorts"], Brand(),
                         tmp_path / "c.ass")
        body = plan.path.read_text(encoding="utf-8")
        dialogue = "\n".join(l for l in body.splitlines() if l.startswith("Dialogue:"))
        for junk in (">>", "[laughter]", "(applause)", "--"):
            assert junk not in dialogue, f"{junk!r} must not be burned in"
        for real in ("What", "can", "we", "eat?"):
            assert real in dialogue

    def test_is_speech_classifier(self):
        from afterplay.produce import _is_speech
        for junk in (">>", ">>>", "[laughter]", "[music", "(applause)", "--", "   "):
            assert not _is_speech(junk), junk
        for real in ("hello", "eat?", "don't", "3:42", "[weird]word"):
            assert _is_speech(real), real

    def test_markup_still_counts_for_scoring(self):
        """Stripping captions must not weaken the ranking signal."""
        from afterplay.understand import cold_signals
        s = cold_signals(">> hi [laughter] >> no way?", 30)
        assert s.events == 1 and s.turns == 2 and s.questions == 1


class TestCLIWiring:
    """REGRESSION: `kairos/__init__.py` exports a function named `resolve`, which
    shadows the `afterplay.resolve` submodule. `from . import resolve as R` then binds
    the function, and R.resolve(...) raises AttributeError at runtime. It shipped
    twice (agent.py, cli.py) because no test invoked the CLI."""

    ASSETS = Path(__file__).parent.parent / "assets"

    def test_every_module_resolves_its_helpers(self):
        import afterplay.agent as A
        import afterplay.cli as C
        assert callable(A.resolve_url) and callable(A.stream_urls)
        assert callable(A.from_local) and callable(A.from_info_json)
        # the shadowing itself is real and intentional; document it so it is not
        # "fixed" by renaming the public function
        import afterplay
        import types
        assert not isinstance(afterplay.resolve, types.ModuleType)

    @pytest.mark.skipif(not (Path(__file__).parent.parent / "assets" /
                             "vid.info.json").exists(),
                        reason="saved fixture not present")
    def test_plan_command_runs_offline_on_real_metadata(self, capsys):
        """Exercises the real CLI path with saved YouTube metadata: no network."""
        from afterplay.cli import main
        rc = main(["--json", "plan", "--info-json", str(self.ASSETS / "vid.info.json"),
                   "--vtt", str(self.ASSETS / "vid.en.vtt"), "--clips", "3"])
        assert rc == 0
        out = json.loads(capsys.readouterr().out)
        assert out["source"]["duration"] > 0
        assert out["heatmap_available"] is False          # this source has none
        assert 1 <= len(out["clips"]) <= 3
        for c in out["clips"]:
            assert c["end"] > c["start"] and 15 <= c["duration"] <= 45
            assert c["why"].startswith("cold-start")
        assert out["decision_seconds"] < 10.0             # PRD latency target
