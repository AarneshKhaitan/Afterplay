"""Channel memory for callbacks that span streams.

This is separate from ``memory.py`` on purpose. ``memory.py`` learns rendering and
format preferences. This module stores creator canon: running jokes, rivalries,
recurring people and unfinished stories that can make a later moment meaningful.
"""
from __future__ import annotations

import json
import logging
import math
import os
import time
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Callable, Iterable

from .citations import verify_citation
from .memory import memory_root

log = logging.getLogger("afterplay")

THREAD_KINDS = {"running_joke", "rivalry", "person", "unfinished_story", "recurring_bit"}


@dataclass
class StreamMention:
    stream_id: str
    t: float | None
    quote: str
    verified: bool = False
    match_ratio: float = 0.0
    repair: str | None = None
    t_reported: float | None = None
    quote_display: str = ""


@dataclass
class ThreadRecord:
    id: str
    kind: str
    label: str
    summary: str
    status: str = "open"
    first_seen: StreamMention | dict = field(default_factory=dict)
    mentions: list[StreamMention | dict] = field(default_factory=list)
    embedding: list[float] = field(default_factory=list)
    updated: float = field(default_factory=time.time)

    @classmethod
    def from_dict(cls, data: dict) -> "ThreadRecord":
        first = data.get("first_seen") or {}
        mentions = data.get("mentions") or []
        return cls(
            id=str(data.get("id") or stable_thread_id(data)),
            kind=str(data.get("kind") or "recurring_bit"),
            label=str(data.get("label") or "Untitled thread")[:120],
            summary=str(data.get("summary") or "")[:800],
            status=str(data.get("status") or "open"),
            first_seen=StreamMention(**first) if isinstance(first, dict) and first else first,
            mentions=[StreamMention(**m) if isinstance(m, dict) else m for m in mentions],
            embedding=[float(x) for x in data.get("embedding", [])],
            updated=float(data.get("updated") or time.time()),
        )

    def to_dict(self) -> dict:
        d = asdict(self)
        return d

    def text_for_embedding(self) -> str:
        first = self.first_verified_mention()
        quote = first.get("quote", "") if first else ""
        return f"{self.kind}: {self.label}\n{self.summary}\n{quote}"

    def verified_mentions(self) -> list[dict]:
        values = [mention_dict(self.first_seen), *map(mention_dict, self.mentions)]
        out = []
        seen = set()
        for value in values:
            key = (value.get("stream_id"), value.get("t"), value.get("quote"))
            if value.get("verified") is True and key not in seen:
                out.append(value)
                seen.add(key)
        return out

    def first_verified_mention(self) -> dict:
        mentions = self.verified_mentions()
        return mentions[0] if mentions else {}

    def has_verified_evidence(self) -> bool:
        return bool(self.first_verified_mention())


def mention_dict(value) -> dict:
    if isinstance(value, StreamMention):
        return asdict(value)
    return value if isinstance(value, dict) else {}


def stable_thread_id(data: dict) -> str:
    import hashlib
    raw = "|".join(str(data.get(k, "")) for k in ("kind", "label", "summary"))
    return "thread_" + hashlib.sha1(raw.encode("utf-8")).hexdigest()[:12]


def cosine(a: list[float], b: list[float]) -> float:
    if not a or not b or len(a) != len(b):
        return 0.0
    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(y * y for y in b))
    return dot / (na * nb) if na and nb else 0.0


def _save_json(path: Path, obj) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(obj, indent=2, default=str), encoding="utf-8")
    tmp.replace(path)


class ChannelMemory:
    def __init__(
        self,
        creator_id: str,
        root: Path | None = None,
        embedder: Callable[[list[str]], list[list[float]]] | None = None,
    ):
        self.creator_id = creator_id
        self.dir = Path(root or memory_root()) / creator_id
        self.path = self.dir / "threads.json"
        self.embedder = embedder
        self.verification_counts = {"verified": 0, "repaired": 0, "unverified": 0}
        self.threads = self._load()

    def _load(self) -> list[ThreadRecord]:
        try:
            data = json.loads(self.path.read_text(encoding="utf-8")) if self.path.exists() else []
            return [ThreadRecord.from_dict(item) for item in data]
        except (OSError, json.JSONDecodeError, TypeError, ValueError) as e:
            log.warning("channel memory %s unreadable (%s); using empty memory", self.path, e)
            return []

    def save(self) -> Path:
        _save_json(self.path, [t.to_dict() for t in self.threads])
        return self.path

    def add_or_merge(self, thread: ThreadRecord, threshold: float = 0.86) -> ThreadRecord:
        if not thread.has_verified_evidence():
            raise ValueError("unverified threads cannot enter active channel memory")
        if not thread.embedding:
            thread.embedding = self.embed([thread.text_for_embedding()])[0]
        best = None
        best_score = 0.0
        for existing in self.threads:
            if not existing.has_verified_evidence():
                continue
            score = cosine(existing.embedding, thread.embedding)
            if score > best_score:
                best, best_score = existing, score
        if best and best_score >= threshold:
            best.summary = merge_summary(best.summary, thread.summary)
            best.status = thread.status if thread.status == "paid_off" else best.status
            seen = {(m.get("stream_id"), m.get("t"), m.get("quote"))
                    for m in best.verified_mentions()}
            for md in thread.verified_mentions():
                key = (md.get("stream_id"), md.get("t"), md.get("quote"))
                if key not in seen:
                    best.mentions.append(StreamMention(**md))
                    seen.add(key)
            best.updated = time.time()
            return best
        self.threads.append(thread)
        return thread

    def embed(self, texts: list[str]) -> list[list[float]]:
        if self.embedder:
            return self.embedder(texts)
        return embed_texts(texts)

    def retrieved_thread(self, thread: ThreadRecord, score: float) -> dict:
        d = thread.to_dict()
        d.pop("embedding", None)
        d.pop("updated", None)
        verified = thread.verified_mentions()
        d["first_seen"] = verified[0]
        d["mentions"] = verified[:3]
        d["similarity"] = round(score, 4)
        return d

    def retrieve(self, text: str, k: int = 3) -> list[dict]:
        found = self.retrieve_many([text], k=k, top_windows=1)
        return found.get(0, [])

    def retrieve_many(self, texts: list[str], k: int = 3, top_windows: int = 10) -> dict[int, list[dict]]:
        if not self.threads:
            return {}
        eligible = [t for t in self.threads if t.embedding and t.has_verified_evidence()]
        if not eligible or not texts:
            return {}

        query_vectors = self.embed(texts)
        windows = []
        for idx, query in enumerate(query_vectors):
            scored = [(cosine(query, t.embedding), t) for t in eligible]
            scored.sort(key=lambda item: -item[0])
            if scored:
                windows.append((idx, scored[0][0], scored[:k]))

        windows.sort(key=lambda item: -item[1])
        out = {}
        for idx, _, scored in windows[:top_windows]:
            out[idx] = [self.retrieved_thread(thread, score) for score, thread in scored]
        return out

    def backfill(self, stream_id: str, sents, extractor=None) -> list[ThreadRecord]:
        extracted = extract_threads(stream_id, sents, extractor=extractor)
        verified = [thread for thread in extracted if thread.has_verified_evidence()]
        self.verification_counts = {
            "verified": len(verified),
            "repaired": sum(
                1 for thread in verified
                if thread.first_verified_mention().get("repair")
            ),
            "unverified": len(extracted) - len(verified),
        }
        texts = [t.text_for_embedding() for t in verified]
        if texts:
            vectors = self.embed(texts)
            for thread, vector in zip(verified, vectors):
                thread.embedding = vector
                self.add_or_merge(thread)
            self.save()
        return extracted


def merge_summary(a: str, b: str) -> str:
    if not a:
        return b
    if not b or b in a:
        return a
    return (a.rstrip(".") + ". " + b).strip()[:800]


def windows(sents, seconds: float = 150.0) -> Iterable[list]:
    chunk = []
    start = None
    for sent in sents:
        if start is None:
            start = sent.start
        chunk.append(sent)
        if sent.end - start >= seconds:
            yield chunk
            chunk, start = [], None
    if chunk:
        yield chunk


def extract_threads(stream_id: str, sents, extractor=None) -> list[ThreadRecord]:
    out: list[ThreadRecord] = []
    for chunk in windows(sents):
        text = "\n".join(f"[{s.start:.1f}] {s.text}" for s in chunk)
        data = extractor(stream_id, text) if extractor else extract_threads_with_openai(stream_id, text)
        for item in data.get("threads", [])[:10]:
            kind = str(item.get("kind") or "recurring_bit")
            if kind not in THREAD_KINDS:
                kind = "recurring_bit"
            first = item.get("first_seen") or {}
            reported_quote = str(first.get("quote") or item.get("quote") or "")[:500]
            reported_t = first.get("t", chunk[0].start)
            citation = verify_citation(reported_quote, reported_t, chunk)
            mention = StreamMention(
                stream_id=stream_id,
                t=citation.t,
                quote=citation.quote,
                verified=citation.verified,
                match_ratio=citation.match_ratio,
                repair=citation.repair,
                t_reported=citation.t_reported,
                quote_display=citation.quote_display,
            )
            record = ThreadRecord(
                id=str(item.get("id") or stable_thread_id(item)),
                kind=kind,
                label=str(item.get("label") or "Untitled thread")[:120],
                summary=str(item.get("summary") or "")[:800],
                status=str(item.get("status") or "open"),
                first_seen=mention,
                mentions=[mention],
            )
            out.append(record)
    return out


def openai_client():
    if not os.environ.get("OPENAI_API_KEY"):
        raise RuntimeError("OPENAI_API_KEY is required for OpenAI calls "
                           "(channel memory, clip copy)")
    from openai import OpenAI
    return OpenAI()


def embed_texts(texts: list[str], *, model: str = "text-embedding-3-small") -> list[list[float]]:
    client = openai_client()
    response = client.embeddings.create(model=model, input=texts)
    return [list(item.embedding) for item in response.data]


def clipper_model() -> str:
    return os.environ.get("AFTERPLAY_CLIPPER_MODEL", "gpt-5.6-sol")


def parsed_response(response) -> dict:
    parsed = getattr(response, "output_parsed", None)
    if parsed is not None:
        return parsed
    from .prompts import extract_json
    return extract_json(response.output_text)


def extract_threads_with_openai(stream_id: str, transcript: str) -> dict:
    from .prompts import (SYSTEM, THREAD_EXTRACTION_JSON_SCHEMA, json_schema_format,
                          thread_extraction_prompt)
    client = openai_client()
    response = client.responses.create(
        model=clipper_model(),
        input=[
            {"role": "system", "content": SYSTEM},
            {"role": "user", "content": thread_extraction_prompt(stream_id, transcript[:120000])},
        ],
        text={"format": json_schema_format("afterplay_thread_extraction",
                                           THREAD_EXTRACTION_JSON_SCHEMA)},
        store=False,
    )
    return parsed_response(response)


def judge_callback_with_openai(window_text: str, retrieved: list[dict]) -> dict:
    from .prompts import (CALLBACK_JUDGE_JSON_SCHEMA, SYSTEM, callback_judge_prompt,
                          json_schema_format)
    client = openai_client()
    response = client.responses.create(
        model=clipper_model(),
        input=[
            {"role": "system", "content": SYSTEM},
            {"role": "user", "content": callback_judge_prompt(window_text[:12000], retrieved)},
        ],
        text={"format": json_schema_format("afterplay_callback_judge",
                                           CALLBACK_JUDGE_JSON_SCHEMA)},
        store=False,
    )
    return parsed_response(response)
