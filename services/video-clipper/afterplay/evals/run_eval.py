"""Run the bounded callback corpus with deterministic response replay."""
from __future__ import annotations

import hashlib
import inspect
import json
from datetime import datetime, timezone
from pathlib import Path

from .models import DatasetError, EvalExample, load_examples
from .replay import ReplayError, ReplayStore, judge


class EvaluationError(RuntimeError):
    pass


def _sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _code_sha256(obj) -> str:
    return hashlib.sha256(inspect.getsource(obj).encode("utf-8")).hexdigest()


def _confusion(gold: list[bool], predicted: list[bool]) -> dict:
    tp = sum(g and p for g, p in zip(gold, predicted))
    fp = sum(not g and p for g, p in zip(gold, predicted))
    tn = sum(not g and not p for g, p in zip(gold, predicted))
    fn = sum(g and not p for g, p in zip(gold, predicted))
    precision = tp / (tp + fp) if tp + fp else 0.0
    recall = tp / (tp + fn) if tp + fn else 0.0
    f1 = 2 * precision * recall / (precision + recall) if precision + recall else 0.0
    return {
        "confusion_matrix": {"tp": tp, "fp": fp, "tn": tn, "fn": fn},
        "precision": round(precision, 4), "recall": round(recall, 4),
        "f1": round(f1, 4), "accuracy": round((tp + tn) / len(gold), 4) if gold else 0.0,
        "support": len(gold),
    }


def _confidence_buckets(examples: list[EvalExample], responses: list[dict]) -> list[dict]:
    buckets = []
    for low, high in ((0.0, 0.2), (0.2, 0.4), (0.4, 0.6), (0.6, 0.8), (0.8, 1.0)):
        indices = [i for i, response in enumerate(responses)
                   if low <= response["confidence"] <= high
                   and (response["confidence"] < high or high == 1.0)]
        correct = sum(
            responses[i]["is_callback"] == examples[i].gold_is_callback for i in indices
        )
        buckets.append({
            "range": [low, high], "count": len(indices),
            "judge_accuracy": round(correct / len(indices), 4) if indices else None,
        })
    return buckets


def metrics(examples: list[EvalExample], responses: list[dict], threshold: float) -> dict:
    detected = [bool(response["is_callback"] and response["confidence"] >= threshold)
                for response in responses]
    valid_ids = [{str(item["id"]) for item in example.retrieved_threads}
                 for example in examples]
    selected = [
        detected[i]
        and bool(response.get("thread_id"))
        and str(response["thread_id"]) in valid_ids[i]
        and (not examples[i].gold_is_callback
             or str(response["thread_id"]) == examples[i].gold_thread_id)
        for i, response in enumerate(responses)
    ]
    detection = _confusion([example.gold_is_callback for example in examples], detected)
    selection = _confusion([example.should_select for example in examples], selected)
    selection["wrong_thread"] = sum(
        detected[i] and examples[i].gold_is_callback
        and response.get("thread_id") != examples[i].gold_thread_id
        for i, response in enumerate(responses)
    )
    by_category = {}
    for category in ("positive", "clear_negative", "semantic_near_miss"):
        indices = [i for i, example in enumerate(examples) if example.category == category]
        by_category[category] = {
            "count": len(indices),
            "accepted": sum(detected[i] for i in indices),
            "acceptance_rate": round(sum(detected[i] for i in indices) / len(indices), 4)
            if indices else None,
        }
    return {
        "threshold": threshold,
        "detection": detection,
        "thread_selection": selection,
        "by_category": by_category,
        "confidence_buckets": _confidence_buckets(examples, responses),
    }


def decisions(examples: list[EvalExample], responses: list[dict], threshold: float) -> list[dict]:
    """Emit auditable per-window outcomes without duplicating transcript text."""
    rows = []
    for example, response in zip(examples, responses):
        accepted = bool(response["is_callback"] and response["confidence"] >= threshold)
        valid_thread = str(response.get("thread_id") or "") in {
            str(item["id"]) for item in example.retrieved_threads
        }
        rows.append({
            "id": example.id,
            "source_stream": example.source.get("stream_id"),
            "window": {"start": example.raw["window"]["start"],
                       "end": example.raw["window"]["end"]},
            "category": example.category,
            "gold": {"is_callback": example.gold_is_callback,
                     "thread_id": example.gold_thread_id,
                     "should_select": example.should_select},
            "response": response,
            "accepted": accepted,
            "correct_thread": (valid_thread and response.get("thread_id") == example.gold_thread_id)
            if example.gold_is_callback else None,
        })
    return rows


def sweep_thresholds(examples: list[EvalExample], responses: list[dict]) -> dict:
    rows = []
    for step in range(20, 96, 5):
        threshold = step / 100
        result = metrics(examples, responses, threshold)
        rows.append({
            "threshold": threshold,
            "detection_precision": result["detection"]["precision"],
            "detection_recall": result["detection"]["recall"],
            "detection_f1": result["detection"]["f1"],
            "thread_selection_f1": result["thread_selection"]["f1"],
        })
    best = max(rows, key=lambda row: (
        row["detection_f1"], row["detection_precision"],
        row["thread_selection_f1"], row["threshold"]
    ))
    return {"objective": "detection_f1_then_precision", "candidates": rows,
            "selected_threshold": best["threshold"]}


def _run_split(examples: list[EvalExample], *, store: ReplayStore, mode: str,
               model: str, prompt_version: str, client=None) -> tuple[list[dict], list[str]]:
    responses, keys = [], []
    for example in examples:
        response, key = judge(example, store=store, mode=mode, model=model,
                              prompt_version=prompt_version, client=client)
        responses.append(response)
        keys.append(key)
    return responses, keys


def evaluate(*, tuning_path: Path, heldout_path: Path, replay_path: Path,
             mode: str = "replay", model: str | None = None,
             threshold: float | None = None, report_path: Path | None = None,
             client=None) -> dict:
    from ..channel_memory import clipper_model, similarity_floor
    from ..citations import verify_citation
    from ..prompts import CALLBACK_JUDGE, PROMPT_VERSION

    model = model or clipper_model()
    try:
        tuning = load_examples(tuning_path, expected_split="tuning")
        heldout = load_examples(heldout_path, expected_split="heldout")
        overlap = {item.id for item in tuning} & {item.id for item in heldout}
        if overlap:
            raise DatasetError(f"record ids overlap across splits: {sorted(overlap)}")
        store = ReplayStore(replay_path)
        tuning_responses, tuning_keys = _run_split(
            tuning, store=store, mode=mode, model=model,
            prompt_version=PROMPT_VERSION, client=client,
        )
        sweep = sweep_thresholds(tuning, tuning_responses)
        selected_threshold = float(
            threshold if threshold is not None else sweep["selected_threshold"]
        )
        if not 0.0 <= selected_threshold <= 1.0:
            raise EvaluationError("threshold must be in [0, 1]")
        heldout_responses, heldout_keys = _run_split(
            heldout, store=store, mode=mode, model=model,
            prompt_version=PROMPT_VERSION, client=client,
        )
    except (DatasetError, ReplayError) as exc:
        raise EvaluationError(str(exc)) from exc

    source_ids = sorted({item.source.get("stream_id") for item in tuning + heldout})
    source_overlap = sorted(
        {item.source.get("stream_id") for item in tuning}
        & {item.source.get("stream_id") for item in heldout}
    )
    report = {
        "schema": "afterplay.callback-eval-report",
        "schema_version": 1,
        "claim_scope": "bounded_candidate_window_corpus_not_a_benchmark",
        "metadata": {
            "run_at": datetime.now(timezone.utc).isoformat(),
            "mode": mode,
            "model": model,
            "prompt_version": PROMPT_VERSION,
            "prompt_sha256": hashlib.sha256(CALLBACK_JUDGE.encode("utf-8")).hexdigest(),
            "citation_verifier": "verify_citation",
            "citation_verifier_sha256": _code_sha256(verify_citation),
            "threshold": selected_threshold,
            "thresholds": {
                "callback_acceptance": selected_threshold,
                "retrieval_similarity_floor": similarity_floor(),
                "citation_match": 0.75,
            },
            "tuning_sha256": _sha256(tuning_path),
            "heldout_sha256": _sha256(heldout_path),
            "replay_sha256": _sha256(replay_path) if replay_path.exists() else None,
            "corpus_revision": hashlib.sha256(
                (tuning_path.read_bytes() + b"\0" + heldout_path.read_bytes())
            ).hexdigest(),
            "response_request_sha256": sorted(tuning_keys + heldout_keys),
        },
        "corpus": {
            "candidate_windows": len(tuning) + len(heldout),
            "tuning_windows": len(tuning), "heldout_windows": len(heldout),
            "sources": source_ids, "source_overlap_across_splits": source_overlap,
            "split_unit": "candidate_event_and_window",
            "human_annotators": 0,
            "limitations": [
                "The available cache does not support source-disjoint tuning and held-out splits.",
                "Annotations are transparent system evidence and AI-assisted review, not two independent humans.",
                "Repeated windows around one event are grouped into one split but are not independent samples.",
                "Results describe only this bounded third-party transcript corpus.",
            ],
        },
        "threshold_sweep": {**sweep, "data_used": "tuning_only"},
        "tuning": {
            **metrics(tuning, tuning_responses, selected_threshold),
            "decisions": decisions(tuning, tuning_responses, selected_threshold),
        },
        "heldout": {
            **metrics(heldout, heldout_responses, selected_threshold),
            "decisions": decisions(heldout, heldout_responses, selected_threshold),
        },
    }
    if report_path:
        report_path.parent.mkdir(parents=True, exist_ok=True)
        report_path.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n",
                               encoding="utf-8")
    return report
