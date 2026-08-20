"""Strict data contracts for callback evaluation records."""
from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path


class DatasetError(ValueError):
    """The committed evaluation corpus does not satisfy its declared contract."""


@dataclass(frozen=True)
class EvalExample:
    id: str
    split: str
    window_text: str
    retrieved_threads: list[dict]
    gold_is_callback: bool
    gold_thread_id: str | None
    should_select: bool
    category: str
    source: dict
    annotations: list[dict]
    disagreement: dict
    raw: dict

    @classmethod
    def from_dict(cls, data: dict, *, path: Path, line: int) -> "EvalExample":
        where = f"{path}:{line}"
        if data.get("schema") != "afterplay.callback-eval-example":
            raise DatasetError(f"{where}: unsupported or missing schema")
        if data.get("schema_version") != 1:
            raise DatasetError(f"{where}: schema_version must be 1")
        required = ("id", "split", "window", "retrieved_threads", "gold",
                    "source", "annotations", "disagreement")
        missing = [key for key in required if key not in data]
        if missing:
            raise DatasetError(f"{where}: missing fields: {', '.join(missing)}")
        window = data["window"]
        gold = data["gold"]
        if not isinstance(window, dict) or not str(window.get("text") or "").strip():
            raise DatasetError(f"{where}: window.text must be non-empty")
        if not isinstance(gold, dict) or not isinstance(gold.get("is_callback"), bool):
            raise DatasetError(f"{where}: gold.is_callback must be boolean")
        category = str(gold.get("category") or "")
        if category not in {"positive", "clear_negative", "semantic_near_miss"}:
            raise DatasetError(f"{where}: invalid gold.category {category!r}")
        thread_id = gold.get("thread_id")
        if gold["is_callback"] and not thread_id:
            raise DatasetError(f"{where}: positive records require gold.thread_id")
        if not gold["is_callback"] and thread_id is not None:
            raise DatasetError(f"{where}: negative records cannot name gold.thread_id")
        annotations = data["annotations"]
        if not isinstance(annotations, list) or not annotations:
            raise DatasetError(f"{where}: at least one annotation is required")
        for annotation in annotations:
            if not all(annotation.get(key) is not None
                       for key in ("annotator_id", "annotator_type", "is_callback")):
                raise DatasetError(f"{where}: incomplete annotator record")
        disagreement = data["disagreement"]
        if not isinstance(disagreement, dict) or "present" not in disagreement:
            raise DatasetError(f"{where}: disagreement.present is required")
        if disagreement["present"] and len(annotations) < 2:
            raise DatasetError(f"{where}: disagreements require at least two annotations")
        threads = data["retrieved_threads"]
        if not isinstance(threads, list):
            raise DatasetError(f"{where}: retrieved_threads must be a list")
        for thread in threads:
            first = thread.get("first_seen") or {}
            if not thread.get("id") or first.get("verified") is not True:
                raise DatasetError(f"{where}: every retrieved thread needs verified evidence")
        return cls(
            id=str(data["id"]), split=str(data["split"]),
            window_text=str(window["text"]), retrieved_threads=threads,
            gold_is_callback=gold["is_callback"],
            gold_thread_id=str(thread_id) if thread_id is not None else None,
            should_select=bool(gold.get("should_select", gold["is_callback"])),
            category=category, source=data["source"], annotations=annotations,
            disagreement=disagreement, raw=data,
        )


def load_examples(path: Path, *, expected_split: str | None = None) -> list[EvalExample]:
    if not path.exists():
        raise DatasetError(f"evaluation set not found: {path}")
    examples: list[EvalExample] = []
    ids: set[str] = set()
    for line_number, raw_line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        if not raw_line.strip():
            continue
        try:
            data = json.loads(raw_line)
        except json.JSONDecodeError as exc:
            raise DatasetError(f"{path}:{line_number}: invalid JSON: {exc}") from exc
        example = EvalExample.from_dict(data, path=path, line=line_number)
        if expected_split and example.split != expected_split:
            raise DatasetError(
                f"{path}:{line_number}: expected split {expected_split!r}, got {example.split!r}"
            )
        if example.id in ids:
            raise DatasetError(f"{path}:{line_number}: duplicate id {example.id!r}")
        ids.add(example.id)
        examples.append(example)
    if not examples:
        raise DatasetError(f"evaluation set is empty: {path}")
    return examples
