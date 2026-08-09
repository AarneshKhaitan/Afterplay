"""SponsorBlock avoidance, per-platform copy, and the performance analytics loop.

Three things that all answer "what do we know beyond the pixels":

* `sponsor_segments` — never clip a sponsor read. Crowd-sourced spans, free, one HTTP
  call, no auth.
* `generate_copy` — the title/caption/hashtags that ship with each clip. LLM when
  credentials exist, deterministic extraction otherwise.
* `Analytics` — ingest post-publish metrics, attribute them to clip features, and turn
  that into ranking priors the next job actually uses. Local JSON, same as memory.
"""
from __future__ import annotations

import json
import logging
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import asdict, dataclass, field
from pathlib import Path

log = logging.getLogger("afterplay")


# ── SponsorBlock ─────────────────────────────────────────────────────────────

SB_API = "https://sponsor.ajay.app/api/skipSegments"
SB_CATEGORIES = ("sponsor", "selfpromo", "intro", "outro", "interaction",
                 "preview", "music_offtopic")


def sponsor_segments(video_id: str, categories=SB_CATEGORIES,
                     timeout: int = 15) -> list[dict]:
    """Crowd-sourced spans to avoid. Returns [] when there is nothing to avoid.

    A 404 from this API means "no segments submitted for this video", which is the
    common case and NOT an error — treating it as one would fail most jobs.
    """
    q = urllib.parse.urlencode({"videoID": video_id,
                                "categories": json.dumps(list(categories))})
    try:
        with urllib.request.urlopen(f"{SB_API}?{q}", timeout=timeout) as r:
            data = json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return []
        log.warning("sponsorblock HTTP %s; continuing without it", e.code)
        return []
    except Exception as e:                                    # noqa: BLE001
        log.warning("sponsorblock unavailable (%s); continuing without it", e)
        return []

    out = []
    for seg in data:
        s = seg.get("segment") or []
        if len(s) == 2:
            out.append({"start": float(s[0]), "end": float(s[1]),
                        "category": seg.get("category", "?"),
                        "votes": seg.get("votes", 0)})
    out.sort(key=lambda x: x["start"])
    log.info("sponsorblock: %d segment(s) to avoid", len(out))
    return out


def video_id_from_url(url: str) -> str | None:
    if not url:
        return None
    m = re.search(r"(?:v=|youtu\.be/|/shorts/|/embed/)([A-Za-z0-9_-]{11})", url)
    return m.group(1) if m else None


def overlaps_sponsor(start: float, end: float, segs: list[dict],
                     tolerance: float = 1.0) -> dict | None:
    """The first sponsor span this window meaningfully touches, if any."""
    for s in segs:
        if start < s["end"] - tolerance and s["start"] + tolerance < end:
            return s
    return None


def drop_sponsored(moments, segs: list[dict]):
    """Filter ranked moments that collide with a sponsor read. Logs what it dropped —
    silent filtering makes a short clip list look like weak source material."""
    if not segs:
        return moments
    keep, dropped = [], []
    for m in moments:
        hit = overlaps_sponsor(m.start, m.end, segs)
        (dropped if hit else keep).append((m, hit))
    for m, hit in dropped:
        log.info("dropped %.1f-%.1fs: overlaps %s segment %.1f-%.1fs",
                 m.start, m.end, hit["category"], hit["start"], hit["end"])
    return [m for m, _ in keep]


# ── per-platform copy ────────────────────────────────────────────────────────

STOPWORDS = set("""a an and are as at be but by for from had has have he her his i if in
into is it its me my of on or our so than that the their them then there these they
this to was we were what when which who will with you your just like get got dont
really thats gonna wanna know think going yeah okay right""".split())


TITLE_MAX = 70          # a headline a creator would actually post fits in one line
NEUTRAL_TITLE = "Stream highlight"


@dataclass
class Copy:
    title: str
    caption: str
    hashtags: list[str] = field(default_factory=list)
    hook_text_overlay: str | None = None
    source: str = "heuristic"
    # why the LLM path was not used, when it was attempted and did not produce copy.
    # `source` must never claim "llm" for text the heuristic wrote.
    fallback_reason: str | None = None


def _keywords(text: str, k: int = 6) -> list[str]:
    words = re.findall(r"[A-Za-z][A-Za-z'-]{2,}", text.lower())
    freq: dict[str, int] = {}
    for w in words:
        if w in STOPWORDS or len(w) < 4:
            continue
        freq[w] = freq.get(w, 0) + 1
    return [w for w, _ in sorted(freq.items(), key=lambda x: (-x[1], x[0]))[:k]]


def _clamp_words(s: str, limit: int) -> str:
    """Truncate on a word boundary. A line cut mid-word reads like a bug, not copy."""
    s = s.strip()
    if len(s) <= limit:
        return s
    return (s[:limit].rsplit(" ", 1)[0] or s[:limit]).rstrip(" ,;:-")


def _headline(clean: str, title_hint: str) -> str:
    """A line a human would post.

    ASR of a stream is one long unpunctuated run, so the old "first 88 characters"
    rule shipped a mid-sentence transcript slice as the title. Only a COMPLETE short
    sentence earns the slot; otherwise use the source title, and failing that say
    plainly that this is an untitled highlight rather than fake one out of speech.
    """
    for s in re.split(r"(?<=[.!?])\s+", clean):
        s = s.strip()
        if 12 < len(s) <= TITLE_MAX and s[-1] in ".!?":
            return s.rstrip(".").strip()
    hint = re.sub(r"\s+", " ", title_hint or "").strip()
    # a bare video id ("BW_MAa5L9lg") arrives here as the source title on link jobs;
    # it is a filename, not something a creator would post under
    if len(hint) > 3 and (" " in hint or hint.isalpha()):
        return _clamp_words(hint, TITLE_MAX)
    return NEUTRAL_TITLE


def heuristic_copy(text: str, platform: str, title_hint: str = "", *,
                   fallback_reason: str | None = None) -> Copy:
    """Deterministic copy: a complete short sentence as the title, keywords as tags.
    Not clever, but never hallucinates and always available."""
    clean = re.sub(r"\s+", " ", re.sub(r"\[[^\]]*\]|>>+", " ", text)).strip()
    sents = [s.strip() for s in re.split(r"(?<=[.!?])\s+", clean) if len(s.strip()) > 12]
    caption = _clamp_words(" ".join(sents[:2]) if sents else clean, 220)
    tags = [] if platform == "linkedin" else _keywords(clean, 5)
    return Copy(title=_headline(clean, title_hint), caption=caption, hashtags=tags,
                source="heuristic", fallback_reason=fallback_reason)


def copy_with_openai(text: str, platform: str, voice: str | None = None) -> dict:
    """Same client and model configuration the channel-memory pass already runs on —
    one credential, one model env var, no second config mechanism for copy."""
    from .channel_memory import clipper_model, openai_client, parsed_response
    from .prompts import COPY_JSON_SCHEMA, SYSTEM, copy_prompt, json_schema_format
    client = openai_client()
    response = client.responses.create(
        model=clipper_model(),
        input=[
            {"role": "system", "content": SYSTEM},
            {"role": "user", "content": copy_prompt(platform, text[:8000], voice)},
        ],
        text={"format": json_schema_format("afterplay_clip_copy", COPY_JSON_SCHEMA)},
        store=False,
    )
    return parsed_response(response)


def copy_with_anthropic(client, model: str, text: str, platform: str,
                        voice: str | None = None) -> dict:
    """Kept for callers that already hold an Anthropic client (ClaudePolicy)."""
    from .prompts import SYSTEM, copy_prompt, extract_json
    msg = client.messages.create(
        model=model, max_tokens=700, system=SYSTEM,
        messages=[{"role": "user",
                   "content": copy_prompt(platform, text[:8000], voice)}])
    return extract_json(msg.content[0].text)


def generate_copy(text: str, platform: str, *, client=None,
                  model="claude-sonnet-5", voice: str | None = None,
                  title_hint: str = "") -> Copy:
    """LLM copy in the creator's voice, with the heuristic as the floor.

    Default path is OpenAI on `OPENAI_API_KEY` + `AFTERPLAY_CLIPPER_MODEL`, exactly the
    credentials the channel-memory pass uses; an Anthropic `client`, when one is passed,
    wins. Every failure mode — no key, API error, unparseable or empty JSON — degrades
    to `heuristic_copy` with the reason recorded, so a render never dies on copy and a
    heuristic title is never labelled `llm`.
    """
    try:
        if client is not None:
            d = copy_with_anthropic(client, model, text, platform, voice)
        else:
            d = copy_with_openai(text, platform, voice)
        title = re.sub(r"\s+", " ", str(d.get("title") or "")).strip()
        if not title:
            raise ValueError("model returned no title")
    except Exception as e:                                    # noqa: BLE001
        log.warning("copy generation failed (%s); using heuristic", e)
        return heuristic_copy(text, platform, title_hint,
                              fallback_reason=f"{type(e).__name__}: {e}"[:200])
    tags = [str(t).lstrip("#").lower() for t in (d.get("hashtags") or [])][:6]
    return Copy(title=title[:90],
                caption=str(d.get("caption", ""))[:400],
                hashtags=tags,
                hook_text_overlay=(str(d["hook_text_overlay"])[:42]
                                   if d.get("hook_text_overlay") else None),
                source="llm")


# ── performance analytics loop ───────────────────────────────────────────────

@dataclass
class Post:
    """A published clip, so metrics can be attributed back to its features."""
    clip_id: str
    platform: str
    post_id: str
    published_at: float
    features: dict = field(default_factory=dict)


@dataclass
class Metric:
    post_id: str
    views: int = 0
    likes: int = 0
    comments: int = 0
    shares: int = 0
    saves: int = 0
    avg_watch_pct: float = 0.0
    fetched_at: float = 0.0

    def score(self) -> float:
        """One comparable number. Retention dominates because it is the thing a clip
        controls; raw views are mostly distribution."""
        engage = (self.likes + 2 * self.comments + 3 * self.shares + 3 * self.saves)
        per_view = engage / self.views if self.views else 0.0
        return 0.65 * (self.avg_watch_pct / 100.0) + 0.35 * min(1.0, per_view * 50)


class Analytics:
    """Local-JSON analytics store: posts, metrics, and the priors they produce.

    Deliberately connector-agnostic. `ingest_csv`/`ingest_json` work today with an
    export or a scheduled pull; a platform API client can call `record_metric` with the
    same shape when credentials exist.
    """

    def __init__(self, creator_id: str, root: Path | None = None):
        from .memory import memory_root
        self.creator_id = creator_id
        self.dir = Path(root or memory_root()) / creator_id
        self.dir.mkdir(parents=True, exist_ok=True)
        self.posts_path = self.dir / "posts.json"
        self.metrics_path = self.dir / "metrics.json"
        self.priors_path = self.dir / "priors.json"
        self.posts = self._load(self.posts_path, [])
        self.metrics = self._load(self.metrics_path, [])
        self.priors = self._load(self.priors_path, {})

    @staticmethod
    def _load(p: Path, default):
        try:
            return json.loads(p.read_text(encoding="utf-8")) if p.exists() else default
        except (OSError, json.JSONDecodeError) as e:
            log.warning("analytics file %s unreadable (%s)", p, e)
            return default

    @staticmethod
    def _save(p: Path, obj):
        tmp = p.with_suffix(p.suffix + ".tmp")
        tmp.write_text(json.dumps(obj, indent=2, default=str), encoding="utf-8")
        tmp.replace(p)

    # ── record ───────────────────────────────────────────────────────────────
    def record_post(self, clip, platform: str, post_id: str,
                    published_at: float | None = None) -> Post:
        """Link a published post to the clip's features — the join key for learning."""
        c = clip if isinstance(clip, dict) else asdict(clip)
        feats = {
            "moment_type": (c.get("signals") or {}).get("moment_type")
                           or self._infer_type(c.get("why", "")),
            "duration_bucket": self._bucket(c.get("duration") or 0),
            "source_position": self._position(c.get("start") or 0, c.get("source_duration")),
            "attempts": c.get("attempts"),
            "repairs": c.get("repairs") or [],
            "detector": (c.get("signals") or {}).get("detector"),
        }
        p = Post(clip_id=c.get("clip_id", "?"), platform=platform, post_id=post_id,
                 published_at=published_at or time.time(), features=feats)
        self.posts.append(asdict(p))
        self._save(self.posts_path, self.posts[-5000:])
        return p

    def record_metric(self, m: Metric | dict):
        d = m if isinstance(m, dict) else asdict(m)
        d.setdefault("fetched_at", time.time())
        self.metrics.append(d)
        self._save(self.metrics_path, self.metrics[-20000:])
        return d

    def ingest_json(self, path) -> int:
        """Bulk import from a platform export or a scheduled pull."""
        rows = json.loads(Path(path).read_text(encoding="utf-8"))
        rows = rows if isinstance(rows, list) else rows.get("rows", [])
        for r in rows:
            self.record_metric({k: r.get(k, 0) for k in
                                ("post_id", "views", "likes", "comments", "shares",
                                 "saves", "avg_watch_pct")})
        log.info("analytics: ingested %d metric rows", len(rows))
        return len(rows)

    def ingest_csv(self, path) -> int:
        """Bulk import a platform analytics export (e.g. YouTube Studio).

        Parse every row before recording any of them: `record_metric` persists on each
        call, so failing halfway through would leave a partial ingest behind while the
        caller was told the import failed, and the retry would double-record the prefix.
        """
        import csv
        parsed: list[dict] = []
        with open(path, newline="", encoding="utf-8") as f:
            for i, row in enumerate(csv.DictReader(f), 2):       # row 1 is the header
                try:
                    parsed.append({
                        "post_id": row.get("post_id") or row.get("id") or "",
                        "views": int(float(row.get("views") or 0)),
                        "likes": int(float(row.get("likes") or 0)),
                        "comments": int(float(row.get("comments") or 0)),
                        "shares": int(float(row.get("shares") or 0)),
                        "saves": int(float(row.get("saves") or 0)),
                        "avg_watch_pct": float(row.get("avg_watch_pct") or 0),
                    })
                except (TypeError, ValueError) as e:
                    raise ValueError(f"{Path(path).name} line {i}: {e}") from e
        for m in parsed:
            self.record_metric(m)
        log.info("analytics: ingested %d CSV rows", len(parsed))
        return len(parsed)

    # ── attribute + learn ────────────────────────────────────────────────────
    def attribute(self) -> list[dict]:
        """Join metrics onto post features. Latest metric per post wins."""
        latest: dict[str, dict] = {}
        for m in self.metrics:
            pid = m.get("post_id")
            if pid and m.get("fetched_at", 0) >= latest.get(pid, {}).get("fetched_at", -1):
                latest[pid] = m
        joined = []
        for p in self.posts:
            m = latest.get(p["post_id"])
            if not m:
                continue
            joined.append({**p, "metric": m,
                           "score": Metric(**{k: m.get(k, 0) for k in
                                              ("post_id", "views", "likes", "comments",
                                               "shares", "saves", "avg_watch_pct")}
                                           ).score()})
        return joined

    def compute_priors(self, min_samples: int = 3) -> dict:
        """Per-feature lift versus this creator's own average.

        Lift, not absolute score, because channels differ by orders of magnitude and we
        only ever compare a creator against themselves.
        """
        joined = self.attribute()
        if len(joined) < min_samples:
            return {"n": len(joined), "ready": False,
                    "note": f"need >= {min_samples} attributed posts"}
        base = sum(j["score"] for j in joined) / len(joined) or 1e-9
        priors: dict = {"n": len(joined), "ready": True, "baseline": round(base, 4),
                        "updated": time.time(), "by": {}}
        for dim in ("moment_type", "duration_bucket", "source_position", "platform"):
            groups: dict[str, list[float]] = {}
            for j in joined:
                key = str(j.get(dim) or (j["features"].get(dim) if dim != "platform"
                                         else j.get("platform")) or "unknown")
                groups.setdefault(key, []).append(j["score"])
            priors["by"][dim] = {
                k: {"n": len(v), "mean": round(sum(v) / len(v), 4),
                    "lift": round((sum(v) / len(v)) / base, 3)}
                for k, v in groups.items() if len(v) >= max(2, min_samples // 2)}
        self.priors = priors
        self._save(self.priors_path, priors)
        log.info("analytics: priors from %d posts (baseline %.3f)", len(joined), base)
        return priors

    def ranking_hints(self, top: int = 3) -> dict:
        """The compact form the ranking prompt and the scorer consume."""
        pr = self.priors if self.priors.get("ready") else self.compute_priors()
        if not pr.get("ready"):
            return {}
        types = pr["by"].get("moment_type", {})
        win = sorted((k for k in types if types[k]["lift"] > 1.05),
                     key=lambda k: -types[k]["lift"])[:top]
        lose = sorted((k for k in types if types[k]["lift"] < 0.9),
                      key=lambda k: types[k]["lift"])[:top]
        durs = pr["by"].get("duration_bucket", {})
        best_dur = max(durs, key=lambda k: durs[k]["lift"]) if durs else None
        hints = {"winning_types": win, "rejected_types": lose, "n": pr["n"]}
        if best_dur:
            hints["target_len"] = {"short": 20.0, "mid": 30.0, "long": 45.0}.get(
                best_dur, 30.0)
        return hints

    def apply_to_moments(self, moments, weight: float = 0.25):
        """Re-rank candidates by the creator's own history. Bounded weight so a thin
        history cannot override the content signal."""
        pr = self.priors if self.priors.get("ready") else {}
        types = (pr.get("by") or {}).get("moment_type") or {}
        if not types:
            return moments
        for m in moments:
            t = (m.signals or {}).get("moment_type") or self._infer_type(m.why)
            lift = types.get(str(t), {}).get("lift")
            if lift:
                m.score *= (1.0 - weight) + weight * float(lift)
                m.why += f" | prior[{t}] x{lift:.2f}"
        moments.sort(key=lambda m: -m.score)
        return moments

    # ── helpers ──────────────────────────────────────────────────────────────
    @staticmethod
    def _bucket(d: float) -> str:
        return "short" if d < 24 else ("mid" if d < 38 else "long")

    @staticmethod
    def _position(start: float, total: float | None) -> str:
        if not total:
            return "unknown"
        f = start / total
        return "opening" if f < 0.2 else ("middle" if f < 0.75 else "closing")

    @staticmethod
    def _infer_type(why: str) -> str:
        """Classify a moment from its rationale string.

        ORDER MATTERS: the specific patterns must be tested before the general ones.
        A broad `"audio" in why` check shadows `"audio-event"`, which silently labelled
        every caption-derived punchline a "reaction" and poisoned the priors.
        """
        w = (why or "").lower()
        if "llm[" in w:                          # the LLM names the type itself
            import re as _re
            m = _re.search(r"llm\[([a-z_]+)\]", w)
            if m and m.group(1) != "?":
                return m.group(1)
        # the cold-start rationale reports COUNTS ("0 audio-events, 2 questions"), so
        # a substring match labels a clip a punchline on zero laughs
        def count(label: str) -> int:
            import re as _re
            m = _re.search(rf"(\d+)\s+{label}", w)
            return int(m.group(1)) if m else 0
        events, questions = count("audio-events?"), count("questions?")
        if events > 0 or "laughter" in w or "applause" in w:
            return "punchline"
        if "heatmap" in w:
            return "replayed"
        if questions > 0:
            return "question_answer"
        if w.startswith("audio:") or "excitement" in w:
            return "reaction"                    # the audio-energy detector
        return "unknown"

    def report(self) -> dict:
        j = self.attribute()
        top = sorted(j, key=lambda x: -x["score"])[:5]
        return {"creator": self.creator_id, "posts": len(self.posts),
                "metrics": len(self.metrics), "attributed": len(j),
                "priors_ready": bool(self.priors.get("ready")),
                "hints": self.ranking_hints(),
                "top_clips": [{"clip": t["clip_id"], "platform": t["platform"],
                               "score": round(t["score"], 3),
                               "views": t["metric"].get("views")} for t in top]}
