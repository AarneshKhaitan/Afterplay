"""Build the bounded 50-window corpus from the locally cached real transcripts.

This is intentionally not part of normal evaluation. It exists to make the origin of
the committed JSONL auditable and to prevent hand-edited transcript quotations.
"""
from __future__ import annotations

import hashlib
import json
from pathlib import Path

from afterplay.understand import candidates, parse_vtt, sentences

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / ".demo-cache"
MEMORY = ROOT / ".memory" / "probe_ksi" / "threads.json"
OUT = Path(__file__).resolve().parent

SOURCES = {
    "X955SmTm1rY": {
        "upload_date": "2024-11-09",
        "declared_product_role": "finale_current",
    },
    "BW_MAa5L9lg": {
        "upload_date": "2023-11-18",
        "declared_product_role": "inactive_staged_fixture",
    },
}
MEMORY_SOURCE = {"stream_id": "nxGlZX9GH5I", "upload_date": "2024-07-20"}

# Event groups never cross splits. Sources do, because the available cache has only one
# legitimate payoff source; the report carries that limitation explicitly.
SPECS = {
    "tuning": [
        # Genuine observed callbacks from the finale run.
        ("X955SmTm1rY", 38, "positive", "first-death-or-dc", "first_death"),
        ("X955SmTm1rY", 48, "positive", "first-death-or-dc", "first_death"),
        ("X955SmTm1rY", 1232, "positive", "impostor-role-curse", "impostor_curse"),
        ("X955SmTm1rY", 1242, "positive", "impostor-role-curse", "impostor_curse"),
        # Topic overlap without an evidenced payoff.
        ("X955SmTm1rY", 170, "semantic_near_miss", "dancing-on-cams", "cams_overlap_early"),
        ("X955SmTm1rY", 697, "semantic_near_miss", "toby-dance-cams", "toby_overlap"),
        ("X955SmTm1rY", 1065, "semantic_near_miss", "dancing-on-cams", "cams_overlap"),
        ("X955SmTm1rY", 1676, "semantic_near_miss", "dancing-on-cams", "cams_overlap_late"),
        ("BW_MAa5L9lg", 933, "semantic_near_miss", "impostor-role-curse", "older_impostor"),
        ("BW_MAa5L9lg", 766, "semantic_near_miss", "dancing-on-cams", "older_cams"),
        ("BW_MAa5L9lg", 2171, "semantic_near_miss", "vick-never-votes-seven", "older_vote"),
        ("BW_MAa5L9lg", 2409, "semantic_near_miss", "clear-name-framing", "chronology_trap"),
        # Clear negatives sampled away from the known observed callback events.
        ("X955SmTm1rY", 280, "clear_negative", None, "x_clear_01"),
        ("X955SmTm1rY", 620, "clear_negative", None, "x_clear_02"),
        ("X955SmTm1rY", 770, "clear_negative", None, "x_clear_02"),
        ("X955SmTm1rY", 900, "clear_negative", None, "x_clear_03"),
        ("X955SmTm1rY", 1040, "clear_negative", None, "x_clear_04"),
        ("X955SmTm1rY", 1500, "clear_negative", None, "x_clear_04"),
        ("X955SmTm1rY", 1810, "clear_negative", None, "x_clear_05"),
        ("BW_MAa5L9lg", 300, "clear_negative", None, "bw_clear_01"),
        ("BW_MAa5L9lg", 500, "clear_negative", None, "bw_clear_02"),
        ("BW_MAa5L9lg", 650, "clear_negative", None, "bw_clear_02"),
        ("BW_MAa5L9lg", 1150, "clear_negative", None, "bw_clear_03"),
        ("BW_MAa5L9lg", 1320, "clear_negative", None, "bw_clear_03"),
        ("BW_MAa5L9lg", 2050, "clear_negative", None, "bw_clear_04"),
    ],
    "heldout": [
        ("X955SmTm1rY", 447, "positive", "10m-2hour-among-us", "ten_million_promise"),
        ("X955SmTm1rY", 454, "positive", "10m-2hour-among-us", "ten_million_promise"),
        ("X955SmTm1rY", 462, "positive", "10m-2hour-among-us", "ten_million_promise"),
        ("X955SmTm1rY", 487, "semantic_near_miss", "impostor-role-curse", "role_overlap"),
        ("X955SmTm1rY", 136, "semantic_near_miss", "dancing-on-cams", "cams_overlap_held"),
        ("X955SmTm1rY", 1661, "semantic_near_miss", "vick-never-votes-seven", "seven_overlap_held"),
        ("X955SmTm1rY", 1158, "semantic_near_miss", "toby-dance-cams", "toby_overlap_held"),
        ("BW_MAa5L9lg", 1386, "semantic_near_miss", "impostor-role-curse", "older_impostor_held"),
        ("BW_MAa5L9lg", 1264, "semantic_near_miss", "dancing-on-cams", "older_cams_held"),
        ("BW_MAa5L9lg", 1510, "semantic_near_miss", "medbay-scan-distrust", "older_medbay"),
        ("BW_MAa5L9lg", 882, "semantic_near_miss", "vick-never-votes-seven", "older_vote_held"),
        ("X955SmTm1rY", 100, "clear_negative", None, "x_clear_06"),
        ("X955SmTm1rY", 340, "clear_negative", None, "x_clear_07"),
        ("X955SmTm1rY", 700, "clear_negative", None, "x_clear_08"),
        ("X955SmTm1rY", 830, "clear_negative", None, "x_clear_09"),
        ("X955SmTm1rY", 970, "clear_negative", None, "x_clear_10"),
        ("X955SmTm1rY", 1430, "clear_negative", None, "x_clear_11"),
        ("X955SmTm1rY", 1580, "clear_negative", None, "x_clear_12"),
        ("X955SmTm1rY", 1870, "clear_negative", None, "x_clear_13"),
        ("BW_MAa5L9lg", 240, "clear_negative", None, "bw_clear_07"),
        ("BW_MAa5L9lg", 520, "clear_negative", None, "bw_clear_08"),
        ("BW_MAa5L9lg", 940, "clear_negative", None, "bw_clear_09"),
        ("BW_MAa5L9lg", 1600, "clear_negative", None, "bw_clear_10"),
        ("BW_MAa5L9lg", 1840, "clear_negative", None, "bw_clear_11"),
        ("BW_MAa5L9lg", 2320, "clear_negative", None, "bw_clear_12"),
    ],
}


def _thread_payload(thread: dict) -> dict:
    return {
        "id": thread["id"], "kind": thread["kind"], "label": thread["label"],
        "summary": thread["summary"], "first_seen": thread["first_seen"],
    }


def _annotations(category: str, *, stream_id: str, target: float,
                 thread_id: str | None) -> tuple[list[dict], dict]:
    if category == "positive":
        values = [
            {"annotator_id": "genuine-finale-run-2026-08-20", "annotator_type": "system_evidence",
             "is_callback": True, "thread_id": thread_id,
             "notes": "Observed in the genuine memory-on finale manifest."},
            {"annotator_id": "codex-semantic-review-2026-08-20", "annotator_type": "ai_assistant",
             "is_callback": True, "thread_id": thread_id,
             "notes": "Current transcript explicitly references the verified memory thread."},
        ]
    elif category == "semantic_near_miss":
        values = [
            {"annotator_id": "semantic-overlap-rule-v1", "annotator_type": "deterministic_rule",
             "is_callback": False, "thread_id": None,
             "notes": "Topic/entity overlap alone does not establish a payoff or reference."},
            {"annotator_id": "codex-semantic-review-2026-08-20", "annotator_type": "ai_assistant",
             "is_callback": False, "thread_id": None,
             "notes": "Reviewed as a hard negative under the callback rubric."},
        ]
    else:
        values = [
            {"annotator_id": "codex-semantic-review-2026-08-20", "annotator_type": "ai_assistant",
             "is_callback": False, "thread_id": None,
             "notes": "No material link to the retrieved verified memory threads."},
        ]

    disagreement = {"present": False, "records": [], "resolution": "annotations agree"}
    if stream_id == "BW_MAa5L9lg" and abs(target - 2409) < 1:
        values = [
            {"annotator_id": "prior-live-judge-evidence-e014", "annotator_type": "model_observation",
             "is_callback": True, "thread_id": "clear-name-framing",
             "notes": "The prior live run accepted this semantic match."},
            {"annotator_id": "chronology-rule-v1", "annotator_type": "provenance_rule",
             "is_callback": False, "thread_id": None,
             "notes": "The candidate upload predates the cited setup, so it cannot pay it off."},
        ]
        disagreement = {
            "present": True,
            "records": ["model_observation:true", "provenance_rule:false"],
            "resolution": "negative",
            "resolved_by": "source chronology",
            "notes": "2023-11-18 candidate predates 2024-07-20 memory evidence.",
        }
    return values, disagreement


def build() -> None:
    if not MEMORY.exists():
        raise SystemExit(f"active verified memory is required to build the corpus: {MEMORY}")
    memory = json.loads(MEMORY.read_text(encoding="utf-8"))
    threads = {item["id"]: _thread_payload(item) for item in memory
               if (item.get("first_seen") or {}).get("verified") is True}
    if len(threads) < 3:
        raise SystemExit("at least three verified memory threads are required")

    source_windows: dict[str, tuple[list[tuple[float, float, str]], str]] = {}
    for stream_id in SOURCES:
        path = CACHE / stream_id / "source.en.vtt"
        raw = path.read_bytes()
        parsed = sentences(parse_vtt(raw.decode("utf-8")))
        source_windows[stream_id] = (candidates(parsed, target=30.0, tol=10.0),
                                     hashlib.sha256(raw).hexdigest())

    default_ids = list(threads)[:3]
    written = {}
    prior_split_intervals: dict[str, list[tuple[float, float]]] = {}
    for split, specs in SPECS.items():
        records = []
        used_windows = set()
        for index, (stream_id, target, category, related_id, event_group) in enumerate(specs, 1):
            windows, transcript_hash = source_windows[stream_id]
            ranked = sorted(windows, key=lambda value: abs(((value[0] + value[1]) / 2) - target))
            window = next((value for value in ranked
                           if (stream_id, round(value[0], 3), round(value[1], 3)) not in used_windows
                           and all(value[1] <= old_start or value[0] >= old_end
                                   for old_start, old_end
                                   in prior_split_intervals.get(stream_id, []))), None)
            if window is None:
                raise SystemExit(f"could not find a unique candidate near {stream_id}@{target}")
            start, end, text = window
            used_windows.add((stream_id, round(start, 3), round(end, 3)))
            selected_ids = [related_id] if related_id else []
            selected_ids.extend(item for item in default_ids if item not in selected_ids)
            retrieved = [threads[item] for item in selected_ids[:3]]
            annotations, disagreement = _annotations(
                category, stream_id=stream_id, target=target, thread_id=related_id
            )
            records.append({
                "schema": "afterplay.callback-eval-example", "schema_version": 1,
                "id": f"{split}_{index:02d}_{stream_id}_{round(start, 3)}",
                "split": split,
                "source": {
                    "stream_id": stream_id, **SOURCES[stream_id],
                    "transcript_language": "en", "transcript_source": "youtube_auto_captions",
                    "transcript_sha256": transcript_hash,
                    "memory_source": MEMORY_SOURCE,
                },
                "window": {"start": round(start, 3), "end": round(end, 3), "text": text},
                "event_group": event_group,
                "retrieved_threads": retrieved,
                "gold": {"is_callback": category == "positive",
                         "thread_id": related_id if category == "positive" else None,
                         "should_select": category == "positive", "category": category},
                "annotations": annotations,
                "disagreement": disagreement,
            })
        path = OUT / f"{split}.jsonl"
        path.write_text("\n".join(json.dumps(item, ensure_ascii=False, sort_keys=True)
                                  for item in records) + "\n", encoding="utf-8")
        for record in records:
            prior_split_intervals.setdefault(record["source"]["stream_id"], []).append(
                (record["window"]["start"], record["window"]["end"])
            )
        written[split] = {"path": path.name, "records": len(records),
                          "sha256": hashlib.sha256(path.read_bytes()).hexdigest()}

    (OUT / "corpus.json").write_text(json.dumps({
        "schema": "afterplay.callback-eval-corpus", "schema_version": 1,
        "claim_scope": "bounded_candidate_window_corpus_not_a_benchmark",
        "records": sum(value["records"] for value in written.values()),
        "splits": written,
        "source_overlap_across_splits": sorted(SOURCES),
        "human_annotators": 0,
        "notes": [
            "Windows are transcript-verbatim and hashes bind them to the local cached VTTs.",
            "The available cache cannot produce a source-disjoint tuning/held-out split.",
            "Ambiguous cases have two transparent system/AI annotation records, not two humans.",
            "Do not present results as a benchmark or a generalisation claim.",
        ],
    }, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    build()
