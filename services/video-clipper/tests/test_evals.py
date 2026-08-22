from __future__ import annotations

import argparse
import json
from pathlib import Path
from types import SimpleNamespace

import pytest

from afterplay.evals.models import DatasetError, EvalExample, load_examples
from afterplay.evals.replay import ReplayMiss, ReplayStore, judge
from afterplay.evals.run_eval import metrics, sweep_thresholds


SERVICE_ROOT = Path(__file__).resolve().parents[1]
TUNING = SERVICE_ROOT / "evals" / "tuning.jsonl"
HELDOUT = SERVICE_ROOT / "evals" / "heldout.jsonl"


def _record(identifier: str, split: str, *, positive: bool = False,
            category: str | None = None) -> dict:
    category = category or ("positive" if positive else "clear_negative")
    thread_id = "thread-one" if positive else None
    return {
        "schema": "afterplay.callback-eval-example", "schema_version": 1,
        "id": identifier, "split": split,
        "source": {"stream_id": f"source-{split}"},
        "window": {"start": 1.0, "end": 31.0, "text": f"real window {identifier}"},
        "retrieved_threads": [{
            "id": "thread-one", "label": "A promise", "summary": "A prior promise.",
            "first_seen": {"stream_id": "history", "t": 4.0, "quote": "I promise",
                           "verified": True, "match_ratio": 1.0},
        }],
        "gold": {"is_callback": positive, "thread_id": thread_id,
                 "should_select": positive, "category": category},
        "annotations": [{"annotator_id": "test", "annotator_type": "fixture",
                         "is_callback": positive, "thread_id": thread_id}],
        "disagreement": {"present": False, "records": [], "resolution": "agree"},
    }


def _example(identifier: str = "example", *, positive: bool = False) -> EvalExample:
    return EvalExample.from_dict(
        _record(identifier, "tuning", positive=positive), path=Path("fixture.jsonl"), line=1
    )


def test_committed_corpus_is_bounded_real_window_contract():
    tuning = load_examples(TUNING, expected_split="tuning")
    heldout = load_examples(HELDOUT, expected_split="heldout")
    assert len(tuning) == len(heldout) == 25
    assert 40 <= len(tuning) + len(heldout) <= 60
    assert {item.category for item in tuning + heldout} == {
        "positive", "clear_negative", "semantic_near_miss"
    }
    assert all(len(item.annotations) >= 2 for item in tuning + heldout
               if item.category == "semantic_near_miss")
    chronology = [item for item in tuning + heldout if item.disagreement["present"]]
    assert len(chronology) == 1
    assert chronology[0].disagreement["resolved_by"] == "source chronology"

    for example in tuning + heldout:
        if example.gold_thread_id == "first-death-or-dc":
            assert "killed first" in example.window_text.lower()
        elif example.gold_thread_id == "impostor-role-curse":
            assert "imposter once" in example.window_text.lower()
        elif example.gold_thread_id == "10m-2hour-among-us":
            lowered = example.window_text.lower()
            assert "10 million" in lowered and ("2 hour" in lowered or "2hour" in lowered)

    # Candidate windows, not just record ids, must be held out from tuning.
    for left in tuning:
        for right in heldout:
            if left.source["stream_id"] != right.source["stream_id"]:
                continue
            assert (left.raw["window"]["end"] <= right.raw["window"]["start"]
                    or left.raw["window"]["start"] >= right.raw["window"]["end"])


def test_dataset_rejects_unverified_retrieved_evidence(tmp_path):
    record = _record("bad", "tuning")
    record["retrieved_threads"][0]["first_seen"]["verified"] = False
    path = tmp_path / "bad.jsonl"
    path.write_text(json.dumps(record) + "\n", encoding="utf-8")
    with pytest.raises(DatasetError, match="verified evidence"):
        load_examples(path)


def test_replay_miss_never_calls_live_client(tmp_path):
    class ForbiddenClient:
        @property
        def responses(self):
            raise AssertionError("replay mode attempted a live call")

    with pytest.raises(ReplayMiss, match="rerun explicitly with --record"):
        judge(_example(), store=ReplayStore(tmp_path / "replays.jsonl"), mode="replay",
              model="test-model", prompt_version="v1", client=ForbiddenClient())


def test_explicit_record_then_replay_is_deterministic(tmp_path):
    calls = []

    class Responses:
        def create(self, **kwargs):
            calls.append(kwargs)
            return SimpleNamespace(output_parsed={
                "is_callback": True, "thread_id": "thread-one",
                "confidence": 0.82, "why": "The prior promise is explicitly paid off.",
            })

    client = SimpleNamespace(responses=Responses())
    path = tmp_path / "replays.jsonl"
    store = ReplayStore(path)
    first, first_key = judge(
        _example(positive=True), store=store, mode="record", model="test-model",
        prompt_version="v1", client=client,
    )
    assert len(calls) == 1 and path.exists()
    second, second_key = judge(
        _example(positive=True), store=ReplayStore(path), mode="replay",
        model="test-model", prompt_version="v1",
        client=SimpleNamespace(responses=SimpleNamespace(
            create=lambda **_: pytest.fail("replay made a hidden live call")
        )),
    )
    assert first == second
    assert first_key == second_key
    assert len(path.read_text(encoding="utf-8").splitlines()) == 1


def test_metrics_separate_detection_from_correct_thread_selection():
    examples = [_example("p", positive=True), _example("n", positive=False)]
    responses = [
        {"is_callback": True, "thread_id": "wrong", "confidence": 0.9, "why": "wrong"},
        {"is_callback": False, "thread_id": None, "confidence": 0.1, "why": "none"},
    ]
    result = metrics(examples, responses, 0.55)
    assert result["detection"]["confusion_matrix"] == {"tp": 1, "fp": 0, "tn": 1, "fn": 0}
    assert result["thread_selection"]["confusion_matrix"]["fn"] == 1
    assert result["thread_selection"]["wrong_thread"] == 1


def test_threshold_sweep_uses_supplied_tuning_examples_only():
    examples = [_example("p", positive=True), _example("n", positive=False)]
    responses = [
        {"is_callback": True, "thread_id": "thread-one", "confidence": 0.7, "why": "yes"},
        {"is_callback": True, "thread_id": "thread-one", "confidence": 0.4, "why": "weak"},
    ]
    sweep = sweep_thresholds(examples, responses)
    assert sweep["selected_threshold"] > 0.4
    assert sweep["objective"] == "detection_f1_then_precision"


def test_plan_memory_surfaces_decide_only_state(tmp_path, monkeypatch, capsys):
    import importlib
    from afterplay import agent, cli
    from afterplay.understand import Moment

    vtt = tmp_path / "source.vtt"
    vtt.write_text(
        "WEBVTT\n\n00:00:00.000 --> 00:00:31.000\nhello this is a complete real sentence.\n",
        encoding="utf-8",
    )
    source = SimpleNamespace(
        vtt_path=vtt, url="local", title="Local source", uploader="owner",
        duration=31.0, view_count=0, heatmap=[], has_heatmap=False,
    )
    resolve_module = importlib.import_module("afterplay.resolve")
    monkeypatch.setattr(resolve_module, "from_info_json", lambda *_: source)

    reasoner = SimpleNamespace(
        memory_degraded=False, memory_degradation_reason=None, callback_found=True,
        threads_considered=2, memory_timings={"embed": 0.1, "retrieve": 0.1, "judge": 0.2},
        ablation={"available": True},
    )
    monkeypatch.setattr(agent, "MemoryPolicy", lambda creator: SimpleNamespace(
        reasoner=lambda: reasoner
    ))
    monkeypatch.setattr(agent.TOOLS, "call", lambda *_, **__: [
        Moment(0.0, 30.0, 2.0, "window", "callback", {"callback": True})
    ])
    args = argparse.Namespace(
        info_json="ignored.json", vtt=str(vtt), url=None, clips=1, target=30.0,
        llm=False, memory=True, creator="creator-one", json=True,
    )
    assert cli.cmd_plan(args) == 0
    output = json.loads(capsys.readouterr().out)
    assert output["memory"] == {
        "creator": "creator-one", "degraded": False, "reason": None,
        "callback_found": True, "threads_considered": 2,
        "timings": {"embed": 0.1, "retrieve": 0.1, "judge": 0.2},
        "ablation": {"available": True},
    }


def test_eval_cli_defaults_to_replay_and_reports_miss(tmp_path, capsys):
    from afterplay import cli
    args = argparse.Namespace(
        tuning=str(TUNING), heldout=str(HELDOUT), replays=str(tmp_path / "empty.jsonl"),
        record=False, model="test-model", threshold=None, report=None, json=False,
    )
    assert cli.cmd_eval(args) == 2
    assert "replay miss" in capsys.readouterr().err


def test_eval_parser_accepts_json_after_subcommand(monkeypatch):
    from afterplay import cli

    seen = {}

    def fake_eval(args):
        seen["json"] = args.json
        return 0

    monkeypatch.setattr(cli, "cmd_eval", fake_eval)
    assert cli.main([
        "eval", "--set", "evals/heldout.jsonl", "--tuning", "evals/tuning.jsonl",
        "--json",
    ]) == 0
    assert seen["json"] is True
