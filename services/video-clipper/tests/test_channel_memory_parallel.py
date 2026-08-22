from __future__ import annotations

import re
import threading
import time

from afterplay.channel_memory import (
    ChannelMemory,
    StreamMention,
    ThreadRecord,
    extract_threads,
    memory_workers,
    similarity_floor,
)
from afterplay.understand import Sentence


def _sentences(count: int = 5) -> list[Sentence]:
    return [
        Sentence(index * 200.0, index * 200.0 + 151.0, f"quote number {index} returns")
        for index in range(count)
    ]


def _thread_payload(index: int) -> dict:
    return {
        "threads": [{
            "id": f"thread-{index}",
            "kind": "recurring_bit",
            "label": f"Thread {index}",
            "summary": f"Summary {index}",
            "first_seen": {"t": index * 200.0, "quote": f"quote number {index} returns"},
        }]
    }


def _index(text: str) -> int:
    return int(re.search(r"quote number (\d+)", text).group(1))


def _logical_records(records) -> list[dict]:
    values = [thread.to_dict() for thread in records]
    for value in values:
        value.pop("updated", None)
    return values


def test_parallel_completion_preserves_sequential_output_order() -> None:
    def extractor(_stream: str, text: str) -> dict:
        index = _index(text)
        time.sleep((5 - index) * 0.005)
        return _thread_payload(index)

    sequential = extract_threads("stream", _sentences(), extractor, workers=1)
    parallel = extract_threads("stream", _sentences(), extractor, workers=8)

    assert _logical_records(parallel) == _logical_records(sequential)
    assert [thread.id for thread in parallel] == [f"thread-{i}" for i in range(5)]


def test_window_retry_and_failure_are_isolated() -> None:
    calls: dict[int, int] = {}
    lock = threading.Lock()
    progress: list[tuple[int, int, bool]] = []

    def extractor(_stream: str, text: str) -> dict:
        index = _index(text)
        with lock:
            calls[index] = calls.get(index, 0) + 1
            attempt = calls[index]
        if index == 1 and attempt == 1:
            raise RuntimeError("transient")
        if index == 3:
            raise RuntimeError("persistent")
        return _thread_payload(index)

    result = extract_threads(
        "stream",
        _sentences(),
        extractor,
        workers=8,
        progress=lambda index, total, ok: progress.append((index, total, ok)),
    )

    assert [thread.id for thread in result] == ["thread-0", "thread-1", "thread-2", "thread-4"]
    assert calls[1] == 2
    assert calls[3] == 2
    assert len(progress) == 5
    assert sorted((index, ok) for index, _, ok in progress) == [
        (0, True), (1, True), (2, True), (3, False), (4, True)
    ]


def test_memory_worker_setting_is_bounded(monkeypatch) -> None:
    monkeypatch.setenv("AFTERPLAY_MEMORY_WORKERS", "200")
    assert memory_workers() == 16
    assert memory_workers(0) == 1
    assert memory_workers("invalid") == 8


def test_similarity_floor_filters_weak_hits_and_reports_percentile(tmp_path) -> None:
    memory = ChannelMemory(
        "creator",
        root=tmp_path,
        embedder=lambda texts: [[1.0, 0.0] for _ in texts],
    )
    memory.threads = [
        ThreadRecord(
            id="strong",
            kind="recurring_bit",
            label="Strong",
            summary="Strong",
            first_seen=StreamMention("s", 0, "strong quote", verified=True),
            embedding=[0.8, 0.6],
        ),
        ThreadRecord(
            id="weak",
            kind="recurring_bit",
            label="Weak",
            summary="Weak",
            first_seen=StreamMention("s", 1, "weak quote", verified=True),
            embedding=[0.1, 0.995],
        ),
    ]

    hits = memory.retrieve("query", k=3, min_similarity=0.5)

    assert [hit["id"] for hit in hits] == ["strong"]
    assert hits[0]["similarity"] == 0.8
    assert hits[0]["similarity_percentile"] == 1.0


def test_similarity_floor_setting_is_bounded(monkeypatch) -> None:
    monkeypatch.setenv("AFTERPLAY_MEMORY_SIMILARITY_FLOOR", "2")
    assert similarity_floor() == 1.0
    assert similarity_floor("invalid") == 0.3


def test_callback_prompt_does_not_leak_acceptance_gate() -> None:
    from afterplay.prompts import callback_judge_prompt, thread_extraction_prompt
    prompt = callback_judge_prompt("current", [])
    assert "0.55" not in prompt
    assert "Hard negative" in prompt
    assert "Positive:" in prompt
    assert "never\n  translate or transliterate" in prompt
    extraction = thread_extraction_prompt("stream", "[0.0] फिर से clutch")
    assert "source script exactly" in extraction
    assert "label and summary in English" in extraction
