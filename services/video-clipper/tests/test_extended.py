"""Tests for ASR, face reframing, SponsorBlock, copy, analytics and the MCP surface.

Hermetic: no network, no model weights, no GPU. Where a feature genuinely needs an
external resource (Whisper weights, the SponsorBlock API), the test asserts the
DEGRADATION path instead — that is the behaviour that has to be right in production.
"""
from __future__ import annotations

import json
from pathlib import Path

import pytest

from afterplay import ClipResult, JobResult, PLATFORMS, Settings, parse_vtt
from afterplay.understand import MemoryReasoner, Moment, Sentence, Word


# ── creator callback memory ─────────────────────────────────────────────────

def _fake_embed(texts):
    vectors = []
    for text in texts:
        lower = text.lower()
        vectors.append([
            1.0 if "cursed sniper" in lower else 0.0,
            1.0 if "bridge" in lower else 0.0,
            0.1,
        ])
    return vectors


class TestChannelMemory:
    def test_backfill_persists_and_retrieves_threads(self, tmp_path, monkeypatch):
        monkeypatch.setenv("AFTERPLAY_MEMORY", str(tmp_path / "mem"))
        from afterplay.channel_memory import ChannelMemory

        def extractor(stream_id, transcript):
            return {"threads": [{
                "kind": "running_joke",
                "label": "cursed sniper on bridge",
                "summary": "The creator keeps blaming the bridge sniper.",
                "status": "open",
                "first_seen": {"t": 12.0, "quote": "the cursed sniper is back"},
            }]}

        memory = ChannelMemory("creator", embedder=_fake_embed)
        extracted = memory.backfill(
            "stream_a",
            [Sentence(10.0, 20.0, "the cursed sniper is back on the bridge")],
            extractor=extractor,
        )

        assert len(extracted) == 1
        assert memory.path.exists()

        loaded = ChannelMemory("creator", embedder=_fake_embed)
        hits = loaded.retrieve("that cursed sniper returned near the bridge", k=1)
        assert hits[0]["label"] == "cursed sniper on bridge"
        assert hits[0]["similarity"] > 0.9
        assert "embedding" not in hits[0]
        assert "updated" not in hits[0]

    def test_memory_reasoner_boosts_clear_callbacks_and_carries_signals(self):
        class Memory:
            def retrieve(self, text, k=3):
                return [{
                    "id": "thread_1",
                    "label": "cursed sniper on bridge",
                    "summary": "The bridge sniper keeps returning.",
                    "first_seen": {
                        "stream_id": "stream_a",
                        "t": 12.0,
                        "quote": "the cursed sniper is back",
                    },
                }]

        def judge(text, retrieved):
            return {"is_callback": True, "thread_id": "thread_1",
                    "confidence": 0.8, "why": "The window pays off the same bridge sniper."}

        reasoner = MemoryReasoner(Memory(), judge=judge, boost=3.0)
        moments = reasoner.rank(
            [Sentence(0.0, 10.0, "the cursed sniper returned"),
             Sentence(10.0, 22.0, "everyone yells about the bridge again")],
            target=20.0,
            n=1,
            tol=5.0,
        )

        assert moments[0].signals["callback"] is True
        assert moments[0].signals["thread_id"] == "thread_1"
        assert moments[0].signals["source_stream"] == "stream_a"
        assert moments[0].score >= 2.4

    def test_memory_reasoner_does_not_judge_without_retrieved_threads(self):
        class EmptyMemory:
            def retrieve(self, text, k=3):
                return []

        def judge(text, retrieved):
            raise AssertionError("judge should not run without retrieved memory")

        moments = MemoryReasoner(EmptyMemory(), judge=judge).rank(
            [Sentence(0.0, 11.0, "hello there"),
             Sentence(11.0, 23.0, "nothing callbacks here")],
            target=20.0,
            n=1,
            tol=5.0,
        )
        assert "callback" not in moments[0].signals

    def test_memory_reasoner_falls_back_when_memory_fails(self):
        class BrokenMemory:
            def retrieve(self, text, k=3):
                raise RuntimeError("embedding service down")

        sents = [Sentence(0.0, 11.0, "is this good?"),
                 Sentence(11.0, 23.0, "yes it is")]
        moments = MemoryReasoner(BrokenMemory()).rank(sents, target=20.0, n=1, tol=5.0)
        assert len(moments) == 1
        assert moments[0].why.startswith("cold-start")

    def test_memory_reasoner_batches_embeddings_and_caps_judges(self, tmp_path):
        from afterplay.channel_memory import ChannelMemory, StreamMention, ThreadRecord

        calls = []

        def embed(texts):
            calls.append(len(texts))
            return [[1.0, 0.0] if "target" in text else [0.0, 1.0] for text in texts]

        memory = ChannelMemory("creator", root=tmp_path, embedder=embed)
        memory.threads = [ThreadRecord(
            id="thread_1",
            kind="running_joke",
            label="target thread",
            summary="A callback target.",
            first_seen=StreamMention("prior", 3.0, "target quote"),
            mentions=[StreamMention("prior", 3.0, "target quote")],
            embedding=[1.0, 0.0],
        )]
        judged = []

        def judge(text, retrieved):
            judged.append(text)
            assert "embedding" not in retrieved[0]
            return {"is_callback": False, "thread_id": None, "confidence": 0.0, "why": ""}

        sents = [
            Sentence(i * 10.0, i * 10.0 + 10.0,
                     "target callback" if i in (4, 12, 20) else f"ordinary line {i}")
            for i in range(30)
        ]
        MemoryReasoner(memory, judge=judge, judge_top_k=2).rank(
            sents, target=10.0, n=3, min_gap=0.0, tol=1.0
        )

        assert calls == [30]
        assert len(judged) == 2
        assert all("target callback" in text for text in judged)

    def test_memory_reasoner_rejects_hallucinated_thread_id(self):
        class Memory:
            def retrieve_many(self, texts, k=3, top_windows=10):
                return {0: [{"id": "real_thread", "label": "Real thread",
                             "first_seen": {"stream_id": "prior", "t": 1.0,
                                            "quote": "real quote"}}]}

        def judge(text, retrieved):
            return {"is_callback": True, "thread_id": "invented_thread",
                    "confidence": 0.99, "why": "not grounded"}

        moments = MemoryReasoner(Memory(), judge=judge).rank(
            [Sentence(0.0, 10.0, "target callback")], target=10.0, n=1, tol=1.0
        )
        assert "callback" not in moments[0].signals

    def test_memory_reasoner_rejects_low_confidence_callback(self):
        class Memory:
            def retrieve_many(self, texts, k=3, top_windows=10):
                return {0: [{"id": "thread_1", "label": "Thread",
                             "first_seen": {"stream_id": "prior", "t": 1.0,
                                            "quote": "quote"}}]}

        def judge(text, retrieved):
            return {"is_callback": True, "thread_id": "thread_1",
                    "confidence": 0.1, "why": "weak"}

        moments = MemoryReasoner(Memory(), judge=judge).rank(
            [Sentence(0.0, 10.0, "target callback")], target=10.0, n=1, tol=1.0
        )
        assert "callback" not in moments[0].signals

    def test_clip_manifest_includes_signals(self):
        job = JobResult(job_id="job", source={},
                        clips=[ClipResult(clip_id="c1", platform="shorts",
                                          start=0.0, end=20.0, duration=20.0,
                                          signals={"callback": True})])
        assert job.to_dict()["clips"][0]["signals"] == {"callback": True}


# ── ASR ──────────────────────────────────────────────────────────────────────

class TestASR:
    def test_vtt_roundtrip_preserves_words_and_timings(self, tmp_path):
        """to_vtt must emit exactly what parse_vtt reads back, so an ASR transcript and
        a platform transcript are indistinguishable downstream."""
        from afterplay.asr import to_vtt
        words = [Word(round(i * 0.37, 3), f"word{i}") for i in range(40)]
        p = to_vtt(words, tmp_path / "asr.vtt")
        back = parse_vtt(p.read_text(encoding="utf-8"))
        assert [w.text for w in back] == [w.text for w in words]
        for a, b in zip(back, words):
            assert a.t == pytest.approx(b.t, abs=0.01)

    def test_vtt_is_wellformed(self, tmp_path):
        from afterplay.asr import to_vtt
        p = to_vtt([Word(0.0, "hello"), Word(0.5, "world")], tmp_path / "a.vtt")
        txt = p.read_text(encoding="utf-8")
        assert txt.startswith("WEBVTT")
        assert "-->" in txt and "<c>" in txt

    def test_empty_words_yields_header_only(self, tmp_path):
        from afterplay.asr import to_vtt
        p = to_vtt([], tmp_path / "e.vtt")
        assert parse_vtt(p.read_text(encoding="utf-8")) == []

    def test_bad_model_path_raises_asr_unavailable(self, monkeypatch):
        """A missing model must be a typed, catchable error — the orchestrator relies on
        this to fall back to audio-energy detection instead of failing the job."""
        from afterplay.asr import ASRUnavailable, MODEL_ENV, load_model
        monkeypatch.setenv(MODEL_ENV, "/definitely/not/here")
        with pytest.raises(ASRUnavailable):
            load_model()

    def test_transcript_wpm(self):
        from afterplay.asr import Transcript
        t = Transcript(words=[Word(0.0, "a"), Word(60.0, "b")], sents=[],
                       language="en", language_prob=1.0, seconds=1.0, model="tiny")
        assert t.wpm == pytest.approx(2.0, abs=0.1)


# ── SponsorBlock ─────────────────────────────────────────────────────────────

class TestSponsorBlock:
    def test_video_id_extraction(self):
        from afterplay.insights import video_id_from_url
        for u in ("https://youtu.be/xUgE42wSzUM?si=abc",
                  "https://www.youtube.com/watch?v=xUgE42wSzUM&t=10",
                  "https://youtube.com/shorts/xUgE42wSzUM",
                  "https://www.youtube.com/embed/xUgE42wSzUM"):
            assert video_id_from_url(u) == "xUgE42wSzUM", u
        assert video_id_from_url("https://example.com/video") is None
        assert video_id_from_url("") is None

    def test_overlap_detection_respects_tolerance(self):
        from afterplay.insights import overlaps_sponsor
        segs = [{"start": 100.0, "end": 130.0, "category": "sponsor", "votes": 5}]
        assert overlaps_sponsor(110, 140, segs) is not None      # straddles
        assert overlaps_sponsor(90, 125, segs) is not None       # starts before
        assert overlaps_sponsor(0, 99, segs) is None             # clear
        assert overlaps_sponsor(131, 160, segs) is None
        assert overlaps_sponsor(129.5, 160, segs) is None        # within tolerance

    def test_drop_sponsored_filters_and_keeps_order(self):
        from afterplay.insights import drop_sponsored
        ms = [Moment(0, 30, 5.0, "a", "why"), Moment(100, 130, 4.0, "b", "why"),
              Moment(200, 230, 3.0, "c", "why")]
        segs = [{"start": 95.0, "end": 135.0, "category": "sponsor", "votes": 9}]
        kept = drop_sponsored(ms, segs)
        assert [m.start for m in kept] == [0, 200]

    def test_no_segments_is_a_passthrough(self):
        from afterplay.insights import drop_sponsored
        ms = [Moment(0, 30, 1.0, "a", "w")]
        assert drop_sponsored(ms, []) is ms

    def test_api_failure_degrades_to_empty(self, monkeypatch):
        """A 404 means 'nothing submitted' and any other error must not fail a job."""
        import afterplay.insights as I
        import urllib.error

        def boom(*a, **k):
            raise urllib.error.HTTPError("u", 404, "nf", None, None)
        monkeypatch.setattr(I.urllib.request, "urlopen", boom)
        assert I.sponsor_segments("abc") == []

        def worse(*a, **k):
            raise TimeoutError("slow")
        monkeypatch.setattr(I.insights_urlopen if hasattr(I, "insights_urlopen")
                            else I.urllib.request, "urlopen", worse)
        assert I.sponsor_segments("abc") == []


# ── copy generation ──────────────────────────────────────────────────────────

class TestCopy:
    def test_heuristic_copy_strips_markup_and_extracts_keywords(self):
        from afterplay.insights import heuristic_copy
        c = heuristic_copy(">> [laughter] The plate trade is obviously worth it. "
                           "Nobody would ever refuse that plate.", "shorts")
        assert ">>" not in c.title and "[laughter]" not in c.title
        assert c.title and len(c.title) <= 90
        assert "plate" in c.hashtags
        assert c.source == "heuristic"

    def test_linkedin_gets_no_hashtags(self):
        from afterplay.insights import heuristic_copy
        assert heuristic_copy("Some professional insight about hiring.", "linkedin"
                              ).hashtags == []

    def test_generate_copy_without_client_uses_heuristic(self):
        from afterplay.insights import generate_copy
        c = generate_copy("A sentence about testing things properly.", "shorts")
        assert c.source == "heuristic" and c.title

    def test_generate_copy_falls_back_when_llm_errors(self):
        from afterplay.insights import generate_copy

        class Broken:
            class messages:
                @staticmethod
                def create(**kw):
                    raise RuntimeError("api down")
        c = generate_copy("Real text here about something.", "shorts", client=Broken())
        assert c.source == "heuristic"

    def test_generate_copy_parses_llm_json(self):
        from afterplay.insights import generate_copy

        class Fake:
            class messages:
                @staticmethod
                def create(**kw):
                    class M:
                        content = [type("T", (), {"text": json.dumps({
                            "title": "A better title",
                            "caption": "One line.",
                            "hashtags": ["#Gaming", "clips"],
                            "hook_text_overlay": "wait for it"})})]
                    return M()
        c = generate_copy("text", "shorts", client=Fake())
        assert c.source == "llm" and c.title == "A better title"
        assert c.hashtags == ["gaming", "clips"]        # normalised
        assert c.hook_text_overlay == "wait for it"


# ── analytics loop ───────────────────────────────────────────────────────────

class TestAnalytics:
    def _seed(self, tmp_path, monkeypatch, n=8):
        monkeypatch.setenv("AFTERPLAY_MEMORY", str(tmp_path / "mem"))
        from afterplay.insights import Analytics, Metric
        a = Analytics("creator1")
        for i in range(n):
            kind = "punchline" if i % 2 == 0 else "unknown"
            clip = {"clip_id": f"c{i}", "duration": 30.0, "start": 100.0 * i,
                    "why": "cold-start: 2 audio-events" if kind == "punchline" else "x",
                    "attempts": 1, "repairs": [], "source_duration": 900.0}
            a.record_post(clip, "shorts", f"post{i}")
            # punchlines get much better retention
            a.record_metric(Metric(post_id=f"post{i}", views=1000,
                                   likes=100 if kind == "punchline" else 10,
                                   comments=10, shares=5, saves=5,
                                   avg_watch_pct=80.0 if kind == "punchline" else 25.0))
        return a

    def test_attribution_joins_metrics_to_features(self, tmp_path, monkeypatch):
        a = self._seed(tmp_path, monkeypatch)
        joined = a.attribute()
        assert len(joined) == 8
        assert all("score" in j and "features" in j for j in joined)

    def test_priors_show_lift_for_the_better_moment_type(self, tmp_path, monkeypatch):
        a = self._seed(tmp_path, monkeypatch)
        pr = a.compute_priors()
        assert pr["ready"] is True and pr["n"] == 8
        types = pr["by"]["moment_type"]
        assert types["punchline"]["lift"] > 1.0
        assert types["punchline"]["lift"] > types["unknown"]["lift"]

    def test_priors_not_ready_with_thin_history(self, tmp_path, monkeypatch):
        a = self._seed(tmp_path, monkeypatch, n=1)
        assert a.compute_priors()["ready"] is False

    def test_ranking_hints_are_compact(self, tmp_path, monkeypatch):
        a = self._seed(tmp_path, monkeypatch)
        a.compute_priors()
        h = a.ranking_hints()
        assert "punchline" in h["winning_types"]
        assert h["n"] == 8

    def test_priors_rerank_moments_but_do_not_dominate(self, tmp_path, monkeypatch):
        a = self._seed(tmp_path, monkeypatch)
        a.compute_priors()
        ms = [Moment(0, 30, 1.0, "t", "cold-start: 2 audio-events"),
              Moment(60, 90, 1.05, "t", "x")]
        out = a.apply_to_moments(ms, weight=0.25)
        # the punchline should now lead despite starting lower
        assert out[0].start == 0
        # bounded: a single prior cannot multiply a score arbitrarily
        assert out[0].score < 1.5

    def test_csv_and_json_ingest(self, tmp_path, monkeypatch):
        monkeypatch.setenv("AFTERPLAY_MEMORY", str(tmp_path / "mem"))
        from afterplay.insights import Analytics
        a = Analytics("c2")
        csv_p = tmp_path / "m.csv"
        csv_p.write_text("post_id,views,likes,avg_watch_pct\np1,500,50,60\n"
                         "p2,900,10,20\n", encoding="utf-8")
        assert a.ingest_csv(csv_p) == 2
        js = tmp_path / "m.json"
        js.write_text(json.dumps([{"post_id": "p3", "views": 10, "likes": 1,
                                   "avg_watch_pct": 5}]), encoding="utf-8")
        assert a.ingest_json(js) == 1
        assert len(a.metrics) == 3

    def test_metric_score_weights_retention_over_raw_views(self):
        from afterplay.insights import Metric
        retained = Metric(post_id="a", views=100, likes=5, avg_watch_pct=90)
        viral_but_skipped = Metric(post_id="b", views=100000, likes=50, avg_watch_pct=5)
        assert retained.score() > viral_but_skipped.score()

    def test_corrupt_analytics_file_degrades(self, tmp_path, monkeypatch):
        monkeypatch.setenv("AFTERPLAY_MEMORY", str(tmp_path / "mem"))
        d = tmp_path / "mem" / "c3"
        d.mkdir(parents=True)
        (d / "posts.json").write_text("{{{", encoding="utf-8")
        from afterplay.insights import Analytics
        assert Analytics("c3").posts == []


# ── face reframing ───────────────────────────────────────────────────────────

class TestVision:
    def test_model_path_finds_the_downloaded_model_or_returns_none(self):
        from afterplay.vision import model_path
        p = model_path()
        assert p is None or p.exists()

    def test_env_override_wins(self, tmp_path, monkeypatch):
        from afterplay.vision import MODEL_ENV, model_path
        fake = tmp_path / "m.onnx"
        fake.write_bytes(b"x" * 10)
        monkeypatch.setenv(MODEL_ENV, str(fake))
        assert model_path() == fake

    def test_missing_model_disables_face_detection_cleanly(self, tmp_path, monkeypatch):
        from afterplay.vision import MODEL_ENV, detect_faces
        monkeypatch.setenv(MODEL_ENV, str(tmp_path / "nope.onnx"))
        monkeypatch.setattr("afterplay.vision.DEFAULT_PATHS", ())
        track = detect_faces(tmp_path / "no_such_video.mp4")
        assert not track and track.coverage == 0.0

    def test_no_faces_in_a_test_pattern_falls_back_to_saliency(self, tmp_path):
        """testsrc has no faces, so the face path must decline and saliency must run."""
        from afterplay.core import synth_source
        from afterplay.vision import face_crop_path, track_subject_best
        v = synth_source(tmp_path / "s.mp4", seconds=6, size=(640, 360), tone=False)
        plat = PLATFORMS["shorts"]
        assert face_crop_path(v, plat.aspect) is None
        cp = track_subject_best(v, plat.aspect)          # must still produce a crop
        assert cp.crop_w > 0 and cp.keys

    def test_safe_zone_helper_abstains_without_faces(self, tmp_path):
        from afterplay.core import synth_source
        from afterplay.vision import face_in_safe_zone
        v = synth_source(tmp_path / "s2.mp4", seconds=4, size=(640, 360), tone=False)
        ok, metrics = face_in_safe_zone(v, PLATFORMS["shorts"])
        assert ok is True                      # abstain, never fail on no evidence
        assert "verdict" in metrics or "edge_frac" in metrics


# ── MCP surface ──────────────────────────────────────────────────────────────

class TestMCP:
    def test_specs_are_llm_ready(self):
        from afterplay.mcp_server import specs
        s = specs()
        assert len(s) == 5
        names = {t["name"] for t in s}
        assert names == {"plan_clips", "make_clips", "inspect_clip",
                         "creator_report", "transcribe"}
        for t in s:
            assert t["description"] and t["schema"]["type"] == "object"
            assert "fn" not in t
        # the expensive tool must warn a model off casual use
        mk = next(t for t in s if t["name"] == "make_clips")
        assert "EXPENSIVE" in mk["description"]

    def test_unknown_tool_returns_json_error_not_exception(self):
        from afterplay.mcp_server import call
        out = json.loads(call("nope"))
        assert "error" in out and "available" in out

    def test_tool_errors_are_returned_as_json(self):
        from afterplay.mcp_server import call
        out = json.loads(call("inspect_clip", path="/no/such/file.mp4"))
        assert "error" in out

    def test_plan_requires_a_source(self):
        from afterplay.mcp_server import call
        assert "error" in json.loads(call("plan_clips"))

    def test_make_clips_validates_platforms(self):
        from afterplay.mcp_server import call
        out = json.loads(call("make_clips", url="x", platforms="myspace"))
        assert "error" in out and "known" in out

    def test_creator_report_works_on_an_unknown_creator(self, tmp_path, monkeypatch):
        monkeypatch.setenv("AFTERPLAY_MEMORY", str(tmp_path / "mem"))
        from afterplay.mcp_server import call
        out = json.loads(call("creator_report", creator="brand_new"))
        assert out["creator"] == "brand_new" and "analytics" in out


class TestCopyWiring:
    """REGRESSION: the ClipResult was built without `text_for_copy`, so the copy stage
    saw an empty string, skipped silently, and every clip shipped with no title or
    hashtags. A patch that no-ops is worse than one that fails."""

    def test_clip_result_carries_its_transcript(self, tmp_path, monkeypatch):
        monkeypatch.setenv("AFTERPLAY_MEMORY", str(tmp_path / "mem"))
        from afterplay.agent import ClipAgent, HeuristicPolicy
        from afterplay.core import Brand, PLATFORMS, Settings, synth_source
        from afterplay.understand import Moment, Word
        src = synth_source(tmp_path / "s.mp4", seconds=14, size=(640, 360), tone=True)
        s = Settings(workdir=tmp_path / "w", outdir=tmp_path / "o",
                     max_repair_attempts=0)
        words = [Word(i * 0.4, f"word{i}") for i in range(30)]
        agent = ClipAgent(tmp_path / "w", str(src), words, s, Brand(),
                          HeuristicPolicy())
        m = Moment(1.0, 9.0, 1.0, "A real sentence about a plate trade.", "test")
        res = agent.run(m, PLATFORMS["shorts"], "c1")
        assert res.text_for_copy, "copy stage would silently produce nothing"
        assert "plate" in res.text_for_copy

    def test_copy_is_attached_by_a_full_job(self, tmp_path, monkeypatch):
        monkeypatch.setenv("AFTERPLAY_MEMORY", str(tmp_path / "mem"))
        from afterplay import Orchestrator, Settings
        from afterplay.core import synth_source
        src = synth_source(tmp_path / "s2.mp4", seconds=16, size=(640, 360), tone=True)
        vtt = tmp_path / "s.vtt"
        vtt.write_text("WEBVTT\n\n00:00:00.000 --> 00:00:14.000\n"
                       ">> The plate trade is obviously worth it. [laughter] "
                       "Nobody refuses a plate like that. Really?\n", encoding="utf-8")
        s = Settings(workdir=tmp_path / "w", outdir=tmp_path / "o",
                     max_repair_attempts=0)
        job = Orchestrator(settings=s, workers=1).run(
            local=str(src), vtt=str(vtt), platforms=["shorts"], n_clips=1,
            target=8.0, job_id="copy1")
        done = [c for c in job.clips if c.ok]
        assert done, [c.error for c in job.clips]
        c = done[0]
        assert c.copy, "no copy attached to a delivered clip"
        assert c.copy["title"] and c.copy["source"] == "heuristic"
        assert ">>" not in c.copy["title"] and "[laughter]" not in c.copy["title"]
