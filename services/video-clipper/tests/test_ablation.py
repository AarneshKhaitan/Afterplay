from __future__ import annotations

from dataclasses import asdict

import pytest

from afterplay.agent import JobResult, Orchestrator
from afterplay.baseline import COMPARISON_POINT, compare_rankings
from afterplay.understand import (
    HeuristicReasoner,
    MemoryReasoner,
    Moment,
    Sentence,
    candidates,
    cold_signals,
    heat_avg,
    rank,
    score_all,
    select,
)


def _legacy_rank(sents, heatmap=None, target=30.0, n=5, min_gap=20.0, tol=10.0):
    """Frozen implementation from before score/select were separated."""
    moments = []
    for start, end, text in candidates(sents, target, tol):
        heat = heat_avg(heatmap or [], start, end)
        if heat is not None:
            moments.append(Moment(start, end, heat, text, f"heatmap mean {heat:.3f}",
                                  {"heatmap": heat}))
        else:
            signals = cold_signals(text, end - start)
            moments.append(Moment(
                start,
                end,
                signals.score,
                text,
                f"cold-start: {signals.describe()}",
                {
                    "events": signals.events,
                    "turns": signals.turns,
                    "questions": signals.questions,
                    "wpm": round(signals.wpm, 1),
                },
            ))
    moments.sort(key=lambda moment: -moment.score)
    picked = []
    for moment in moments:
        if all(moment.start >= prior.end + min_gap or
               moment.end <= prior.start - min_gap for prior in picked):
            picked.append(moment)
        if len(picked) >= n:
            break
    return picked


def _sentences():
    return [
        Sentence(0.0, 10.0, ">> what? [laughter] no way!"),
        Sentence(20.0, 30.0, ">> really? [applause] yes!"),
        Sentence(40.0, 50.0, "the bridge callback returns"),
    ]


@pytest.mark.parametrize("heatmap", [
    None,
    [
        {"start_time": 0.0, "end_time": 15.0, "value": 0.3},
        {"start_time": 15.0, "end_time": 35.0, "value": 0.8},
        {"start_time": 35.0, "end_time": 55.0, "value": 0.5},
    ],
])
def test_score_then_select_is_behaviorally_equivalent_to_legacy_rank(heatmap):
    expected = _legacy_rank(_sentences(), heatmap, target=10.0, n=2,
                            min_gap=0.0, tol=1.0)
    actual = rank(_sentences(), heatmap, target=10.0, n=2,
                  min_gap=0.0, tol=1.0)
    split = select(score_all(_sentences(), heatmap, target=10.0, tol=1.0),
                   n=2, min_gap=0.0)

    assert [asdict(moment) for moment in actual] == [asdict(moment) for moment in expected]
    assert [asdict(moment) for moment in split] == [asdict(moment) for moment in expected]


def test_select_does_not_mutate_score_all_order():
    scored = score_all(_sentences(), target=10.0, tol=1.0)
    original_starts = [moment.start for moment in scored]

    select(scored, n=2, min_gap=0.0)

    assert [moment.start for moment in scored] == original_starts


class _OneThreadMemory:
    def __init__(self):
        self.retrieve_calls = 0

    def retrieve_many(self, texts, k=3, top_windows=10):
        self.retrieve_calls += 1
        return {2: [{
            "id": "bridge_thread",
            "label": "Bridge callback",
            "first_seen": {
                "stream_id": "history_1",
                "t": 12.0,
                "quote": "the bridge returns",
                "verified": True,
            },
        }]}


def test_same_pipeline_ablation_emits_complete_rank_diff():
    memory = _OneThreadMemory()
    judge_calls = 0

    def judge(text, retrieved):
        nonlocal judge_calls
        judge_calls += 1
        return {
            "is_callback": True,
            "thread_id": "bridge_thread",
            "confidence": 1.0,
            "why": "This pays off the verified bridge thread.",
        }

    reasoner = MemoryReasoner(memory, judge=judge, boost=10.0)
    selected = reasoner.rank(_sentences(), target=10.0, n=2,
                             min_gap=0.0, tol=1.0)
    proof = reasoner.ablation

    assert memory.retrieve_calls == 1
    assert judge_calls == 1
    assert proof["available"] is True
    assert proof["unavailable_reason"] is None
    assert proof["comparison_point"] == COMPARISON_POINT
    assert proof["candidate_count"] == 3
    assert len(proof["moments"]) == 3

    callback = next(row for row in proof["moments"] if row["callback"])
    assert callback == {
        "start": 40.0,
        "end": 50.0,
        "baseline_rank": 3,
        "memory_rank": 1,
        "rank_delta": 2,
        "base_percentile": 0.0,
        "boost": 10.0,
        "base_score": 0.0,
        "final_score": 10.0,
        "score_scale": "cold_start_points_plus_additive_memory_boost",
        "baseline_selected": False,
        "memory_selected": True,
        "callback": True,
    }
    assert selected[0].start == callback["start"]


def test_memory_off_arm_has_no_memory_or_judge_dependency():
    class SpyMemory(_OneThreadMemory):
        def __init__(self):
            super().__init__()
            self.embed_calls = 0

        def embed(self, *args):
            self.embed_calls += 1
            return []

    memory = SpyMemory()
    judge_calls = 0

    def judge(*args):
        nonlocal judge_calls
        judge_calls += 1
        return {"is_callback": False}

    # This is the exact scorer and selector used to construct the ablation's
    # memory-off arm. Neither API accepts a memory or judge dependency.
    memory_off = HeuristicReasoner().rank(
        _sentences(), target=10.0, n=2, min_gap=0.0, tol=1.0
    )

    assert memory_off
    assert memory.embed_calls == 0
    assert memory.retrieve_calls == 0
    assert judge_calls == 0


def test_retrieval_failure_disables_ablation_with_reason():
    class BrokenMemory:
        def retrieve_many(self, texts, k=3, top_windows=10):
            raise RuntimeError("embedding endpoint unavailable")

    reasoner = MemoryReasoner(BrokenMemory(), judge=lambda *_: None)
    selected = reasoner.rank(_sentences(), target=10.0, n=2,
                             min_gap=0.0, tol=1.0)

    assert selected == rank(_sentences(), target=10.0, n=2,
                            min_gap=0.0, tol=1.0)
    assert reasoner.ablation["available"] is False
    assert "thread lookup failed" in reasoner.ablation["unavailable_reason"]
    assert "embedding endpoint unavailable" in reasoner.ablation["unavailable_reason"]


def test_judge_failure_disables_ablation_instead_of_claiming_zero_effect():
    reasoner = MemoryReasoner(
        _OneThreadMemory(),
        judge=lambda *_: (_ for _ in ()).throw(RuntimeError("judge offline")),
    )
    reasoner.rank(_sentences(), target=10.0, n=2, min_gap=0.0, tol=1.0)

    assert reasoner.ablation["available"] is False
    assert "callback judge failed" in reasoner.ablation["unavailable_reason"]
    assert "judge offline" in reasoner.ablation["unavailable_reason"]


def test_manifest_disabled_states_are_explicit_and_copied():
    disabled = Orchestrator._ablation_manifest(
        HeuristicReasoner(), transcript_available=True
    )
    no_transcript = Orchestrator._ablation_manifest(
        HeuristicReasoner(), transcript_available=False
    )

    assert disabled["unavailable_reason"] == "memory_disabled"
    assert no_transcript["unavailable_reason"] == "transcript_unavailable"
    assert disabled["comparison_point"] == COMPARISON_POINT


def test_manifest_ablation_is_frozen_before_downstream_score_mutation():
    reasoner = MemoryReasoner(
        _OneThreadMemory(),
        judge=lambda *_: {
            "is_callback": True,
            "thread_id": "bridge_thread",
            "confidence": 1.0,
            "why": "Verified payoff.",
        },
        boost=10.0,
    )
    selected = reasoner.rank(_sentences(), target=10.0, n=2,
                             min_gap=0.0, tol=1.0)
    captured = Orchestrator._ablation_manifest(reasoner, transcript_available=True)
    callback_before = next(row for row in captured["moments"] if row["callback"])

    # Analytics is allowed to mutate the production moments after this comparison
    # point. The emitted proof must continue to describe the pre-analytics scores.
    selected[0].score += 999.0
    reasoner.ablation["moments"][0]["final_score"] += 999.0

    callback_after = next(row for row in captured["moments"] if row["callback"])
    assert callback_after == callback_before
    assert callback_after["final_score"] == 10.0


def test_job_manifest_serializes_structured_ablation():
    proof = {
        "schema_version": 1,
        "available": True,
        "unavailable_reason": None,
        "comparison_point": COMPARISON_POINT,
        "candidate_count": 1,
        "moments": [],
    }

    manifest = JobResult(job_id="job", source={}, ablation=proof).to_dict()

    assert manifest["ablation"] == proof


def test_candidate_mismatch_is_not_presented_as_a_valid_comparison():
    base = [Moment(0.0, 10.0, 1.0, "a", "base")]
    memory = [Moment(1.0, 11.0, 2.0, "different", "memory")]

    proof = compare_rankings(base, memory, base, memory)

    assert proof["available"] is False
    assert proof["unavailable_reason"] == "candidate_sets_differ"
