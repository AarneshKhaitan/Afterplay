"""Captions-only channel-memory jobs with a stable machine-readable contract."""
from __future__ import annotations

import json
import os
import time
import uuid
from pathlib import Path

from .agent import FOOTAGE_RIGHTS
from .channel_memory import ChannelMemory, memory_workers
from .channels import ChannelListing, creator_id_from, list_channel_videos
from .core import Settings
from .resolve import resolve as resolve_url
from .understand import parse_vtt, sentences

STATUS_SCHEMA = "afterplay.channel-backfill-status"
REPORT_SCHEMA = "afterplay.channel-backfill-report"
PROVENANCE_SCHEMA = "afterplay.channel-memory-provenance"
CONTRACT_VERSION = 1


def _atomic_json(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(f".{path.name}.{os.getpid()}.{uuid.uuid4().hex}.tmp")
    try:
        tmp.write_text(json.dumps(payload, indent=2, default=str), encoding="utf-8")
        os.replace(tmp, path)
    finally:
        tmp.unlink(missing_ok=True)


def preview_channel(raw: str, *, limit: int = 5, settings: Settings | None = None) -> dict:
    listing = list_channel_videos(raw, settings, limit=limit)
    return {
        "schema": REPORT_SCHEMA,
        "version": CONTRACT_VERSION,
        "mode": "preview",
        "creator_id": creator_id_from(listing),
        "listing": listing.to_dict(),
    }


def _write_status(path: Path, *, job_id: str, creator_id: str, state: str,
                  stage: str, progress: dict, video: dict | None = None,
                  message: str | None = None) -> None:
    payload = {
        "schema": STATUS_SCHEMA,
        "version": CONTRACT_VERSION,
        "job_id": job_id,
        "creator_id": creator_id,
        "state": state,
        "stage": stage,
        "progress": progress,
        "updated": time.time(),
    }
    if video is not None:
        payload["video"] = video
    if message:
        payload["message"] = message
    _atomic_json(path, payload)


def append_provenance(
    memory: ChannelMemory,
    *,
    job_id: str,
    channel: str,
    rights: str,
    videos: list[dict],
) -> Path:
    if rights not in FOOTAGE_RIGHTS:
        raise ValueError(f"rights must be one of {sorted(FOOTAGE_RIGHTS)}")
    path = memory.dir / "provenance.json"
    prior = {}
    if path.exists():
        try:
            prior = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError, TypeError):
            prior = {}
    runs = prior.get("runs") if (
        prior.get("schema") == PROVENANCE_SCHEMA
        and prior.get("version") == CONTRACT_VERSION
        and isinstance(prior.get("runs"), list)
    ) else []
    runs.append({
        "job_id": job_id,
        "channel": channel,
        "footage_rights": rights,
        "captions_only": True,
        "asr_used": False,
        "videos": videos,
        "recorded": time.time(),
    })
    payload = {
        "schema": PROVENANCE_SCHEMA,
        "version": CONTRACT_VERSION,
        "creator_id": memory.creator_id,
        "runs": runs[-100:],
    }
    _atomic_json(path, payload)
    return path


def _video_url(video_id: str) -> str:
    return f"https://www.youtube.com/watch?v={video_id}"


def run_channel_backfill(
    channel: str,
    *,
    creator_id: str,
    video_ids: list[str],
    rights: str,
    job_id: str,
    workers: int | None = None,
    settings: Settings | None = None,
) -> tuple[int, dict]:
    if rights not in FOOTAGE_RIGHTS:
        raise ValueError(f"rights must be one of {sorted(FOOTAGE_RIGHTS)}")
    selected = list(dict.fromkeys(value.strip() for value in video_ids if value.strip()))
    if not selected:
        raise ValueError("at least one video id is required")

    settings = settings or Settings()
    worker_count = memory_workers(workers)
    # Share the clipper's top-level job directory so durable admission can detect
    # either workflow after a Next.js restart and prevent concurrent memory writes.
    job_dir = settings.workdir / job_id
    status_path = job_dir / "status.json"
    report_path = job_dir / "report.json"
    started = time.time()
    memory = ChannelMemory(creator_id)
    results: list[dict] = []

    _write_status(
        status_path,
        job_id=job_id,
        creator_id=creator_id,
        state="running",
        stage="resolve",
        progress={"done": 0, "total": len(selected)},
        message="Resolving captions for the first selected video.",
    )

    for video_index, video_id in enumerate(selected):
        video_result = {
            "video_id": video_id,
            "url": _video_url(video_id),
            "state": "failed",
            "sections_read": 0,
            "sections_total": 0,
            "sections_failed": 0,
            "threads_suggested": 0,
            "threads_added": 0,
            "error": None,
        }
        _write_status(
            status_path,
            job_id=job_id,
            creator_id=creator_id,
            state="running",
            stage="resolve",
            progress={"done": video_index, "total": len(selected)},
            video=video_result,
        )
        try:
            source = resolve_url(
                video_result["url"],
                settings,
                job_id=f"channel_{job_id}_{video_id}",
            )
            if not source.vtt_path:
                raise RuntimeError("no captions available; captions-only backfill skipped this video")
            words = parse_vtt(Path(source.vtt_path).read_text(encoding="utf-8"))
            transcript_sentences = sentences(words)
            if not transcript_sentences:
                raise RuntimeError("captions contained no readable transcript")

            section_state = {"done": 0, "total": 0, "failed": 0, "indices": []}

            def on_progress(index: int, total: int, succeeded: bool) -> None:
                section_state["done"] += 1
                section_state["total"] = total
                section_state["failed"] += 0 if succeeded else 1
                section_state["indices"].append(index)
                video_result.update({
                    "sections_read": section_state["done"] - section_state["failed"],
                    "sections_total": total,
                    "sections_failed": section_state["failed"],
                })
                _write_status(
                    status_path,
                    job_id=job_id,
                    creator_id=creator_id,
                    state="running",
                    stage="memory",
                    progress={"done": video_index, "total": len(selected)},
                    video=video_result,
                )

            extracted = memory.backfill(
                video_id,
                transcript_sentences,
                workers=worker_count,
                progress=on_progress,
            )
            if section_state["total"] and section_state["failed"] == section_state["total"]:
                raise RuntimeError("every transcript section failed after retry")
            counts = memory.verification_counts
            video_result.update({
                "state": "complete",
                "threads_suggested": len(extracted),
                "threads_added": counts["verified"],
                "citations_repaired": counts["repaired"],
                "citations_rejected": counts["unverified"],
                "transcript_language": source.transcript_language,
                "transcript_source": source.transcript_source,
                "subtitle_track": source.subtitle_track,
            })
        except Exception as exc:  # noqa: BLE001 - one source must not discard prior videos
            video_result["error"] = f"{type(exc).__name__}: {exc}"
        results.append(video_result)

        _write_status(
            status_path,
            job_id=job_id,
            creator_id=creator_id,
            state="running",
            stage="resolve" if video_index + 1 < len(selected) else "done",
            progress={"done": video_index + 1, "total": len(selected)},
            video=video_result,
        )

    succeeded = sum(item["state"] == "complete" for item in results)
    state = "complete" if succeeded == len(results) else ("partial" if succeeded else "failed")
    provenance_videos = [
        {
            key: item.get(key)
            for key in (
                "video_id", "url", "state", "transcript_language", "transcript_source",
                "subtitle_track", "sections_read", "sections_total", "sections_failed",
            )
        }
        for item in results
        if item["state"] == "complete"
    ]
    provenance_path = append_provenance(
        memory,
        job_id=job_id,
        channel=channel,
        rights=rights,
        videos=provenance_videos,
    ) if succeeded else None

    report = {
        "schema": REPORT_SCHEMA,
        "version": CONTRACT_VERSION,
        "mode": "run",
        "job_id": job_id,
        "creator_id": creator_id,
        "channel": channel,
        "footage_rights": rights,
        "captions_only": True,
        "asr_used": False,
        "workers": worker_count,
        "state": state,
        "progress": {"done": len(results), "total": len(selected)},
        "videos_succeeded": succeeded,
        "videos_failed": len(results) - succeeded,
        "videos": results,
        "memory_path": str(memory.path),
        "provenance_path": str(provenance_path) if provenance_path else None,
        "started": started,
        "finished": time.time(),
    }
    _atomic_json(report_path, report)
    _write_status(
        status_path,
        job_id=job_id,
        creator_id=creator_id,
        state=state,
        stage="done",
        progress=report["progress"],
        message=(
            f"{succeeded} of {len(results)} videos contributed. "
            f"{len(results) - succeeded} were skipped or failed."
        ),
    )
    return (0 if state == "complete" else (3 if state == "partial" else 4)), report
