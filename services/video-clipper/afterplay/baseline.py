"""Structured same-pipeline memory ablation output.

This module compares two already-scored views of the same candidate windows. It has
no dependency on channel memory by design: the memory-off arm is produced by the
normal deterministic scorer, and memory retrieval/judging happens only while the
memory-on arm is being constructed.
"""
from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from .understand import Moment


ABLATION_SCHEMA_VERSION = 1
COMPARISON_POINT = "post_scoring_pre_sponsor_pre_analytics"


def unavailable_ablation(reason: str, *, candidate_count: int = 0) -> dict:
    """Return a complete, explicit disabled state instead of an absent comparison."""
    if not reason:
        raise ValueError("an unavailable ablation requires a reason")
    return {
        "schema_version": ABLATION_SCHEMA_VERSION,
        "available": False,
        "unavailable_reason": reason,
        "comparison_point": COMPARISON_POINT,
        "candidate_count": candidate_count,
        "moments": [],
    }


def _key(moment: Moment) -> tuple[float, float, str]:
    return moment.start, moment.end, moment.text


def _ordered(moments: list[Moment]) -> list[Moment]:
    # Python's stable sort preserves candidate order for score ties, matching the
    # production selector.
    return sorted(moments, key=lambda moment: -moment.score)


def _score_scale(moment: Moment) -> str:
    if "heatmap" in moment.signals:
        return "heatmap_mean_plus_additive_memory_boost"
    return "cold_start_points_plus_additive_memory_boost"


def compare_rankings(
    baseline_moments: list[Moment],
    memory_moments: list[Moment],
    baseline_selected: list[Moment],
    memory_selected: list[Moment],
) -> dict:
    """Compare ranks for identical candidate windows.

    ``rank_delta`` is positive when memory moves a window toward rank 1. The
    percentile is based on the memory-off score distribution: 100 is the best
    baseline candidate and 0 is the worst (a sole candidate is 100).

    Every candidate is emitted so the artifact is a reproducible ranking rather than
    a selected-result summary. Transcript text is intentionally omitted.
    """
    baseline_by_key = {_key(moment): moment for moment in baseline_moments}
    memory_by_key = {_key(moment): moment for moment in memory_moments}
    if baseline_by_key.keys() != memory_by_key.keys():
        return unavailable_ablation(
            "candidate_sets_differ",
            candidate_count=max(len(baseline_moments), len(memory_moments)),
        )

    baseline_order = _ordered(baseline_moments)
    memory_order = _ordered(memory_moments)
    baseline_ranks = {_key(moment): rank for rank, moment in enumerate(baseline_order, 1)}
    memory_ranks = {_key(moment): rank for rank, moment in enumerate(memory_order, 1)}
    baseline_selected_keys = {_key(moment) for moment in baseline_selected}
    memory_selected_keys = {_key(moment) for moment in memory_selected}
    denominator = max(1, len(baseline_order) - 1)

    rows = []
    for key in sorted(memory_by_key, key=lambda item: (memory_ranks[item], baseline_ranks[item])):
        base = baseline_by_key[key]
        final = memory_by_key[key]
        baseline_rank = baseline_ranks[key]
        memory_rank = memory_ranks[key]
        percentile = (100.0 if len(baseline_order) == 1 else
                      100.0 * (len(baseline_order) - baseline_rank) / denominator)
        rows.append({
            "start": round(base.start, 3),
            "end": round(base.end, 3),
            "baseline_rank": baseline_rank,
            "memory_rank": memory_rank,
            "rank_delta": baseline_rank - memory_rank,
            "base_percentile": round(percentile, 3),
            "boost": round(final.score - base.score, 6),
            "base_score": round(base.score, 6),
            "final_score": round(final.score, 6),
            "score_scale": _score_scale(base),
            "baseline_selected": key in baseline_selected_keys,
            "memory_selected": key in memory_selected_keys,
            "callback": bool(final.signals.get("callback")),
        })

    return {
        "schema_version": ABLATION_SCHEMA_VERSION,
        "available": True,
        "unavailable_reason": None,
        "comparison_point": COMPARISON_POINT,
        "candidate_count": len(baseline_moments),
        "moments": rows,
    }
