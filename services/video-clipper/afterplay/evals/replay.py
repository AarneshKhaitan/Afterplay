"""Immutable, replay-first storage for callback-judge responses."""
from __future__ import annotations

import hashlib
import json
import os
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path

from .models import EvalExample


class ReplayError(RuntimeError):
    pass


class ReplayMiss(ReplayError):
    pass


def request_payload(example: EvalExample, *, model: str, prompt_version: str) -> dict:
    from ..prompts import SYSTEM, callback_judge_prompt
    return {
        "model": model,
        "prompt_version": prompt_version,
        "system": SYSTEM,
        "prompt": callback_judge_prompt(example.window_text, example.retrieved_threads),
    }


def request_key(payload: dict) -> str:
    canonical = json.dumps(payload, sort_keys=True, separators=(",", ":"),
                           ensure_ascii=False)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def validate_response(value: dict) -> dict:
    if not isinstance(value, dict):
        raise ReplayError("callback response must be an object")
    required = {"is_callback", "thread_id", "confidence", "why"}
    if set(value) != required:
        raise ReplayError(f"callback response fields must be exactly {sorted(required)}")
    if not isinstance(value["is_callback"], bool):
        raise ReplayError("callback response is_callback must be boolean")
    if value["thread_id"] is not None and not isinstance(value["thread_id"], str):
        raise ReplayError("callback response thread_id must be string or null")
    try:
        confidence = float(value["confidence"])
    except (TypeError, ValueError) as exc:
        raise ReplayError("callback response confidence must be numeric") from exc
    if not 0.0 <= confidence <= 1.0:
        raise ReplayError("callback response confidence must be in [0, 1]")
    if not isinstance(value["why"], str):
        raise ReplayError("callback response why must be a string")
    return {"is_callback": value["is_callback"], "thread_id": value["thread_id"],
            "confidence": confidence, "why": value["why"]}


class ReplayStore:
    def __init__(self, path: Path):
        self.path = path
        self.entries = self._load()

    def _load(self) -> dict[str, dict]:
        if not self.path.exists():
            return {}
        entries: dict[str, dict] = {}
        for line_number, line in enumerate(
            self.path.read_text(encoding="utf-8").splitlines(), 1
        ):
            if not line.strip():
                continue
            try:
                entry = json.loads(line)
            except json.JSONDecodeError as exc:
                raise ReplayError(f"{self.path}:{line_number}: invalid JSON: {exc}") from exc
            key = str(entry.get("request_sha256") or "")
            if not key:
                raise ReplayError(f"{self.path}:{line_number}: request_sha256 is required")
            if key in entries:
                raise ReplayError(f"{self.path}:{line_number}: duplicate replay key {key}")
            validate_response(entry.get("response"))
            entries[key] = entry
        return entries

    def get(self, key: str) -> dict | None:
        entry = self.entries.get(key)
        return validate_response(entry["response"]) if entry else None

    def put(self, *, key: str, example_id: str, payload: dict, response: dict) -> None:
        response = validate_response(response)
        if key in self.entries:
            if validate_response(self.entries[key]["response"]) != response:
                raise ReplayError(f"refusing to overwrite response for {example_id} ({key})")
            return
        entry = {
            "schema": "afterplay.callback-eval-replay",
            "schema_version": 1,
            "request_sha256": key,
            "example_id": example_id,
            "model": payload["model"],
            "prompt_version": payload["prompt_version"],
            "recorded_at": datetime.now(timezone.utc).isoformat(),
            "response": response,
        }
        self.entries[key] = entry
        self._save()

    def _save(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        tmp = self.path.with_name(
            f".{self.path.name}.{os.getpid()}-{time.time_ns()}-{uuid.uuid4().hex}.tmp"
        )
        lines = [json.dumps(entry, sort_keys=True, ensure_ascii=False)
                 for _, entry in sorted(self.entries.items())]
        tmp.write_text("\n".join(lines) + ("\n" if lines else ""), encoding="utf-8")
        tmp.replace(self.path)


def _live_response(payload: dict, *, client=None) -> dict:
    from ..channel_memory import openai_client, parsed_response
    from ..prompts import CALLBACK_JUDGE_JSON_SCHEMA, json_schema_format
    client = client or openai_client()
    response = client.responses.create(
        model=payload["model"],
        input=[
            {"role": "system", "content": payload["system"]},
            {"role": "user", "content": payload["prompt"]},
        ],
        text={"format": json_schema_format(
            "afterplay_callback_judge", CALLBACK_JUDGE_JSON_SCHEMA
        )},
        store=False,
    )
    return validate_response(parsed_response(response))


def judge(example: EvalExample, *, store: ReplayStore, mode: str, model: str,
          prompt_version: str, client=None) -> tuple[dict, str]:
    if mode not in {"replay", "record"}:
        raise ReplayError(f"unsupported eval mode: {mode}")
    payload = request_payload(example, model=model, prompt_version=prompt_version)
    key = request_key(payload)
    cached = store.get(key)
    if cached is not None:
        return cached, key
    if mode == "replay":
        raise ReplayMiss(
            f"replay miss for {example.id} ({key}); rerun explicitly with --record"
        )
    response = _live_response(payload, client=client)
    store.put(key=key, example_id=example.id, payload=payload, response=response)
    return response, key
