"""Integration tests. Hermetic: a synthetic source is generated with ffmpeg, so the
whole pipeline (extract -> reframe -> caption -> render -> QC -> repair -> manifest)
is exercised with no network, no fixtures and no GPU.

These are the tests that caught the two bugs that mattered: a probe that reported
every file as silent, and a caption/QC timing mismatch.
"""
from __future__ import annotations

import json
from pathlib import Path

import pytest

from afterplay import Brand, PLATFORMS, Settings, probe, run_qc
from afterplay.core import synth_source, read_audio, detect_encoder
from afterplay.produce import RenderSpec, build_ass, extract, render, track_subject
from afterplay.understand import Word



@pytest.fixture(scope="module")
def source(tmp_path_factory):
    """A 24s 1280x720 test pattern with a tone. Deterministic and cheap."""
    d = tmp_path_factory.mktemp("src")
    p = synth_source(d / "src.mp4", seconds=24, size=(1280, 720), fps=30, tone=True)
    return p


@pytest.fixture(scope="module")
def silent_source(tmp_path_factory):
    d = tmp_path_factory.mktemp("silent")
    return synth_source(d / "silent.mp4", seconds=12, size=(1280, 720), tone=False)


def _words(start=0.0, n=40, step=0.35):
    return [Word(start + i * step, f"word{i}") for i in range(n)]


class TestProbe:
    def test_probe_detects_audio_regression(self, source):
        """REGRESSION: probe() ran ffmpeg at -loglevel error, which suppresses the
        `Stream #0:1 ... Audio:` lines, so every file looked silent and every render
        was made with -an. QC caught it; this test keeps it caught."""
        mi = probe(source)
        assert mi.has_audio is True
        assert mi.width == 1280 and mi.height == 720
        assert mi.duration == pytest.approx(24, abs=1.0)
        assert mi.fps == pytest.approx(30, abs=1.0)

    def test_probe_reports_no_audio_when_there_is_none(self, silent_source):
        assert probe(silent_source).has_audio is False

    def test_read_audio_returns_samples(self, source):
        a, sr = read_audio(source)
        assert sr == 16000 and a.size > sr * 5
        assert float(abs(a).max()) > 0.05

    def test_probe_raises_on_garbage(self, tmp_path):
        bad = tmp_path / "nope.mp4"
        bad.write_bytes(b"not a video")
        with pytest.raises(Exception):
            probe(bad)

    def test_probe_does_not_decode_the_whole_file(self, source, monkeypatch):
        """REGRESSION: probe() read header metadata via a full `-f null -` decode.

        Harmless on a 30s test clip, fatal on a real source: a 41-minute VP9 VOD blew
        the 180s timeout and the run died before cutting anything. Header lines are
        printed on open, so no decode is needed.
        """
        from afterplay import core
        calls: list[list[str]] = []
        real = core.run_ffmpeg

        def spy(args, *a, **kw):
            calls.append([str(x) for x in args])
            return real(args, *a, **kw)

        monkeypatch.setattr(core, "run_ffmpeg", spy)
        mi = core.probe(source)
        assert mi.duration == pytest.approx(24, abs=1.0) and mi.has_audio is True
        assert calls and "null" not in calls[0], (
            "a file whose header carries a duration must not be decoded to probe it")


class TestExtract:
    def test_extract_window_and_keep_audio(self, source, tmp_path):
        s = Settings(workdir=tmp_path / "w", outdir=tmp_path / "o")
        out = tmp_path / "cut.mp4"
        mi = extract(str(source), 6.0, 14.0, out, s, pad=1.0)
        assert out.exists()
        assert mi.has_audio, "stream-copy must not drop the audio track"
        # padded window, and a copy-cut may extend to the next keyframe
        assert 8.0 <= mi.duration <= 12.5

    def test_extract_reencode_is_frame_accurate(self, source, tmp_path):
        s = Settings(workdir=tmp_path / "w", outdir=tmp_path / "o")
        out = tmp_path / "cut2.mp4"
        mi = extract(str(source), 5.0, 11.0, out, s, reencode=True)
        assert mi.duration == pytest.approx(6.0, abs=0.35)


class TestReframe:
    def test_crop_path_fits_inside_the_source(self, source):
        plat = PLATFORMS["shorts"]
        cp = track_subject(source, plat.aspect)
        mi = probe(source)
        assert 0 < cp.crop_w <= mi.width and 0 < cp.crop_h <= mi.height
        assert cp.crop_w % 2 == 0 and cp.crop_h % 2 == 0
        assert abs((cp.crop_w / cp.crop_h) - plat.aspect) < 0.02
        assert cp.keys, "must produce at least one keypoint"
        for _, x in cp.keys:
            assert 0 <= x <= mi.width


class TestRenderAndQC:
    @pytest.fixture(scope="class")
    def rendered(self, source, tmp_path_factory):
        d = tmp_path_factory.mktemp("render")
        s = Settings(workdir=d, outdir=d)
        ex = d / "ex.mp4"
        extract(str(source), 4.0, 16.0, ex, s, pad=1.0)
        plat, brand = PLATFORMS["shorts"], Brand()
        ass = d / "c.ass"
        build_ass(_words(0.0, 30), 0.0, 10.0, plat, brand, ass)
        spec = RenderSpec(platform=plat, brand=brand, trim_start=1.0, duration=10.0,
                          crop=track_subject(ex, plat.aspect), ass=ass)
        out = d / "clip.mp4"
        mi = render(ex, spec, out, s)
        return {"dir": d, "path": out, "info": mi, "spec": spec, "settings": s}

    def test_render_hits_platform_geometry(self, rendered):
        mi = rendered["info"]
        plat = PLATFORMS["shorts"]
        assert (mi.width, mi.height) == (plat.width, plat.height)
        assert mi.duration == pytest.approx(10.0, abs=0.6)

    def test_render_keeps_audio(self, rendered):
        assert rendered["info"].has_audio, "the -an regression must stay fixed"
        a, sr = read_audio(rendered["path"])
        assert a.size > sr * 5 and float(abs(a).max()) > 0.01

    def test_qc_passes_a_good_render(self, rendered):
        rep = run_qc(rendered["path"], PLATFORMS["shorts"], 10.0)
        assert rep.frames_checked > 5
        codes = {f.code: f.severity for f in rep.findings}
        assert codes.get("geometry") == "pass"
        assert codes.get("audio") == "pass", [f.message for f in rep.failures]
        assert rep.ok, [f.message for f in rep.failures]

    def test_qc_catches_a_silent_render(self, rendered, tmp_path):
        """Strip the audio and QC must fail with an actionable repair."""
        from afterplay.core import run_ffmpeg
        muted = tmp_path / "muted.mp4"
        run_ffmpeg(["-i", str(rendered["path"]), "-an", "-c:v", "copy", "-y", str(muted)])
        rep = run_qc(muted, PLATFORMS["shorts"], 10.0)
        assert not rep.ok
        assert any(f.code == "audio" for f in rep.failures)
        assert "reextract" in rep.repairs

    def test_qc_catches_wrong_geometry(self, rendered, tmp_path):
        from afterplay.core import run_ffmpeg
        wrong = tmp_path / "wrong.mp4"
        run_ffmpeg(["-i", str(rendered["path"]), "-vf", "scale=640:360",
                    "-c:v", "libx264", "-preset", "ultrafast", "-y", str(wrong)])
        rep = run_qc(wrong, PLATFORMS["shorts"], 10.0)
        assert any(f.code == "geometry" and f.severity == "fail" for f in rep.findings)

    def test_qc_catches_a_frozen_clip(self, tmp_path):
        from afterplay.core import run_ffmpeg
        frozen = tmp_path / "frozen.mp4"
        run_ffmpeg(["-f", "lavfi", "-i", "color=c=gray:s=1080x1920:r=30:d=4",
                    "-f", "lavfi", "-i", "sine=frequency=300:duration=4",
                    "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p",
                    "-c:a", "aac", "-shortest", "-y", str(frozen)])
        rep = run_qc(frozen, PLATFORMS["shorts"], 4.0)
        assert any(f.code == "frozen_video" for f in rep.failures)

    def test_qc_catches_a_black_hook(self, tmp_path):
        from afterplay.core import run_ffmpeg
        black = tmp_path / "black.mp4"
        run_ffmpeg(["-f", "lavfi", "-i", "testsrc=s=1080x1920:r=30:d=4",
                    "-f", "lavfi", "-i", "sine=frequency=300:duration=4",
                    "-vf", "geq=lum='if(lt(T,2),0,lum(X,Y))':cb=128:cr=128",
                    "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p",
                    "-c:a", "aac", "-shortest", "-y", str(black)])
        rep = run_qc(black, PLATFORMS["shorts"], 4.0)
        assert any(f.code == "black_frames" for f in rep.findings)


class TestCaptionSafeZone:
    def test_measured_caption_box_stays_inside_the_safe_zone(self, tmp_path):
        """Render captions over black and measure the real text bbox — the same
        mechanism QC uses in production."""
        from afterplay.produce import render_captions_only
        plat, brand = PLATFORMS["shorts"], Brand()
        ass = tmp_path / "c.ass"
        build_ass(_words(0.0, 24), 0.0, 8.0, plat, brand, ass)
        spec = RenderSpec(platform=plat, brand=brand, duration=8.0, ass=ass)
        probe_mp4 = tmp_path / "cap.mp4"
        render_captions_only(spec, probe_mp4, Settings(workdir=tmp_path, outdir=tmp_path))
        rep = run_qc.__globals__["QCReport"]()
        from afterplay.qc import check_caption_box
        check_caption_box(probe_mp4, plat, rep)
        f = [x for x in rep.findings if x.code in ("caption_overflow", "caption_box")]
        assert f, "the caption check must produce a finding"
        assert f[0].severity == "pass", f[0].message

    def test_oversized_font_is_detected_as_overflow(self, tmp_path):
        """A deliberately huge font must be caught, not silently shipped."""
        from afterplay.produce import render_captions_only
        from afterplay.qc import QCReport, check_caption_box
        plat = PLATFORMS["shorts"]
        brand = Brand(font_size_pct=0.30, max_chars_per_line=60)   # absurd on purpose
        ass = tmp_path / "big.ass"
        build_ass([Word(i * 0.4, "ENORMOUSWORD") for i in range(10)], 0.0, 4.0,
                  plat, brand, ass)
        spec = RenderSpec(platform=plat, brand=brand, duration=4.0, ass=ass)
        probe_mp4 = tmp_path / "big.mp4"
        render_captions_only(spec, probe_mp4, Settings(workdir=tmp_path, outdir=tmp_path))
        rep = QCReport()
        check_caption_box(probe_mp4, plat, rep)
        assert any(f.code == "caption_overflow" and f.severity == "fail"
                   for f in rep.findings), [f.message for f in rep.findings]
        assert "shrink_captions" in rep.repairs


class TestOrchestratorEndToEnd:
    def test_local_source_produces_a_clip_and_manifest(self, source, tmp_path, monkeypatch):
        """The whole agent loop on a local file: rank -> extract -> render -> QC ->
        deliver -> memory write-back."""
        monkeypatch.setenv("AFTERPLAY_MEMORY", str(tmp_path / "mem"))
        from afterplay import Orchestrator

        vtt = tmp_path / "s.vtt"
        cues = ["WEBVTT", ""]
        for i in range(60):
            t0, t1 = i * 0.4, i * 0.4 + 0.4
            cues += [f"00:00:{t0:06.3f} --> 00:00:{t1:06.3f}",
                     f">> line {i} is here. [laughter]" if i % 5 == 0 else f"word{i} spoken now.",
                     ""]
        vtt.write_text("\n".join(cues), encoding="utf-8")

        s = Settings(workdir=tmp_path / "w", outdir=tmp_path / "o", max_repair_attempts=1)
        orch = Orchestrator(settings=s, policy=None, workers=2, creator="tester")
        job = orch.run(local=str(source), vtt=str(vtt), platforms=["shorts"],
                       n_clips=2, target=8.0, job_id="t1")

        assert job.job_id == "t1"
        assert job.clips, "must plan at least one clip"
        manifest = s.workdir / "t1" / "manifest.json"
        assert manifest.exists()
        data = json.loads(manifest.read_text(encoding="utf-8"))
        assert data["clips"] and data["encoder"]

        produced = [c for c in job.clips if c.path and Path(c.path).exists()]
        assert produced, [c.error for c in job.clips]
        for c in produced:
            mi = probe(c.path)
            assert (mi.width, mi.height) == (1080, 1920)
            assert mi.has_audio

        # memory recorded the job
        from afterplay.memory import CreatorMemory
        m = CreatorMemory.load("tester")
        assert m.stats.get("jobs") == 1
        assert m.stats.get("clips") == len(job.clips)

    def test_two_platforms_fan_out(self, source, tmp_path, monkeypatch):
        monkeypatch.setenv("AFTERPLAY_MEMORY", str(tmp_path / "mem"))
        from afterplay import Orchestrator
        vtt = tmp_path / "s.vtt"
        vtt.write_text("WEBVTT\n\n00:00:00.000 --> 00:00:20.000\n"
                       ">> hello there this is a test. [laughter] really? yes.\n",
                       encoding="utf-8")
        s = Settings(workdir=tmp_path / "w", outdir=tmp_path / "o", max_repair_attempts=0)
        job = Orchestrator(settings=s, workers=2).run(
            local=str(source), vtt=str(vtt), platforms=["shorts", "linkedin"],
            n_clips=1, target=8.0, job_id="t2")
        plats = {c.platform for c in job.clips}
        assert plats == {"shorts", "linkedin"}
        for c in job.clips:
            if c.path and Path(c.path).exists():
                mi = probe(c.path)
                want = PLATFORMS[c.platform]
                assert (mi.width, mi.height) == (want.width, want.height)

    def test_missing_captions_fails_loudly(self, source, tmp_path):
        from afterplay import Orchestrator
        from afterplay.core import AfterplayError
        s = Settings(workdir=tmp_path / "w", outdir=tmp_path / "o")
        with pytest.raises(AfterplayError):
            Orchestrator(settings=s).run(local=str(source), platforms=["shorts"],
                                         n_clips=1, job_id="t3")


class TestCropPathBounded:
    """REGRESSION: fast-cut footage produced ~100 crop keypoints, and ffmpeg's
    expression parser rejects that nesting depth ("Missing ')' or too many args"),
    so the render failed outright. The path must stay small or go static."""

    def test_high_motion_source_yields_a_bounded_expression(self, tmp_path):
        from afterplay.core import run_ffmpeg
        from afterplay.produce import track_subject
        # a source whose busiest column jumps around every few frames
        chaos = tmp_path / "chaos.mp4"
        run_ffmpeg(["-f", "lavfi", "-i",
                    "testsrc=s=1280x720:r=30:d=12,random=frames=30",
                    "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p",
                    "-y", str(chaos)])
        cp = track_subject(chaos, PLATFORMS["shorts"].aspect, max_keys=12)
        assert len(cp.keys) <= 13, f"{len(cp.keys)} keypoints will break ffmpeg"
        e = cp.expr(1280)
        assert e.count("if(") <= 13
        assert e.count("(") == e.count(")")

    def test_bounded_expression_actually_configures_in_ffmpeg(self, source, tmp_path):
        """The real proof: feed the generated expression to ffmpeg's crop filter."""
        from afterplay.core import run_ffmpeg
        from afterplay.produce import track_subject
        plat = PLATFORMS["shorts"]
        cp = track_subject(source, plat.aspect)
        xe = cp.expr(1280)
        out = tmp_path / "cropped.mp4"
        run_ffmpeg(["-i", str(source), "-t", "3",
                    "-vf", f"crop={cp.crop_w}:{cp.crop_h}:x='{xe}':y='(ih-{cp.crop_h})/2'",
                    "-c:v", "libx264", "-preset", "ultrafast", "-y", str(out)])
        assert probe(out).width == cp.crop_w
