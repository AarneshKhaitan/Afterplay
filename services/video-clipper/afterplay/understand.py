"""Stage 2 — UNDERSTAND: transcript parsing and moment ranking.

Operates on kilobytes of text. No video bytes are touched here, which is what makes
the "decide before you download" architecture possible (PRD principle 1).
"""
from __future__ import annotations

import html
import re
from dataclasses import dataclass, field

# ── VTT -> word-level timings ─────────────────────────────────────────────────

_CUE = re.compile(r"(\d\d:\d\d:\d\d\.\d+)\s*-->\s*(\d\d:\d\d:\d\d\.\d+)")
_TAG = re.compile(r"<(\d\d:\d\d:\d\d\.\d+)><c>([^<]*)</c>")
_BREAK = re.compile(r"[.!?]$")
_EVENT = re.compile(r"\[\s*(laughter|laughs|applause|cheering|music|singing)\s*\]", re.I)
_TURN = re.compile(r">>")


def _ts(t: str) -> float:
    h, m, s = t.split(":")
    return int(h) * 3600 + int(m) * 60 + float(s)


@dataclass
class Word:
    t: float
    text: str


def parse_vtt(text: str) -> list[Word]:
    """Parse WebVTT into one entry per spoken word.

    Handles the two things that break naive parsers on YouTube auto-captions:

    1. ROLLING cues. A short "carry" cue repeats the previous line verbatim, then
       the next cue repeats it again as plain text and appends new words wrapped in
       ``<TS><c>word</c>``. Parsing every cue's full text triples the transcript and
       makes every window's text unusable.
    2. Cue SETTINGS on the timing line (``align:start position:0%``). They sit after
       the timestamps, so slicing from the end of the timestamp match reads them as
       speech.
    """
    has_tags = "<c>" in text
    words: list[Word] = []
    state = {"last_t": -1.0, "tail": ""}      # tail spots the rolled-over prefix

    def flush(start, end, payload):
        if start is None:
            return
        payload = html.unescape(payload).replace("\n", " ")
        tags = _TAG.findall(payload)
        if has_tags and not tags:
            return                            # pure carry cue: nothing new in it

        # The plain-text run before the first timing tag repeats what the previous
        # cue already said AND can append a new word ("...welcome to General").
        # Strip the longest already-seen prefix rather than dropping the whole run.
        lead = re.sub(r"\s+", " ", payload.split("<")[0]).strip()
        if lead:
            lw = lead.split()
            for k in range(len(lw), 0, -1):
                if state["tail"].endswith(" ".join(lw[:k])):
                    lw = lw[k:]
                    break
            for w in lw:
                words.append(Word(start, w))
            if lw:
                state["tail"] = (state["tail"] + " " + " ".join(lw))[-300:]

        for t_str, w in tags:
            t = _ts(t_str)
            w = re.sub(r"\s+", " ", html.unescape(w)).strip()
            if w and t >= state["last_t"]:
                words.append(Word(t, w))
                state["last_t"] = t
                state["tail"] = (state["tail"] + " " + w)[-300:]
        if not has_tags:
            state["last_t"] = end

    # Line-driven, not block-driven: YouTube separates a cue's timing from its text
    # with a line containing a single SPACE, and other writers use a truly blank
    # line. Splitting on blank lines silently orphans the text in the second case.
    start = end = None
    buf: list[str] = []
    for line in text.splitlines():
        m = _CUE.match(line.strip())
        if m:
            flush(start, end, " ".join(buf))
            start, end, buf = _ts(m.group(1)), _ts(m.group(2)), []
        elif start is not None and line.strip():
            buf.append(line)
    flush(start, end, " ".join(buf))
    return words


@dataclass
class Sentence:
    start: float
    end: float
    text: str


def sentences(words: list[Word], max_gap=1.4, max_chars=200) -> list[Sentence]:
    """Group words into sentence-ish units. These are the only legal cut boundaries,
    so clips never start or end mid-word (PRD 7.2)."""
    out: list[Sentence] = []
    cur: list[str] = []
    start = None
    for i, w in enumerate(words):
        if start is None:
            start = w.t
        cur.append(w.text)
        nxt = words[i + 1].t if i + 1 < len(words) else w.t + 0.6
        text = " ".join(cur)
        if _BREAK.search(w.text) or nxt - w.t > max_gap or len(text) > max_chars:
            # a zero-length span is unusable as a cut boundary; keep it positive
            out.append(Sentence(start, max(nxt, start + 0.15), text))
            cur, start = [], None
    if cur and start is not None:
        out.append(Sentence(start, words[-1].t + 0.6, " ".join(cur)))
    return out


def speech_onset(words: list[Word], after: float = 0.0) -> float | None:
    """First word at/after `after` — used to fix a hook that starts on silence."""
    for w in words:
        if w.t >= after:
            return w.t
    return None


# ── scoring ───────────────────────────────────────────────────────────────────


def heat_avg(heatmap: list[dict], a: float, b: float) -> float | None:
    """Overlap-weighted mean of YouTube's most-replayed curve over [a, b].
    None when the source exposes no heatmap, which is the common case."""
    if not heatmap:
        return None
    tot = wt = 0.0
    for seg in heatmap:
        lo, hi = max(a, seg["start_time"]), min(b, seg["end_time"])
        if hi > lo:
            tot += seg["value"] * (hi - lo)
            wt += hi - lo
    return tot / wt if wt else 0.0


@dataclass
class ColdSignals:
    events: int = 0          # [laughter] / [applause] — the caption track's audio cues
    turns: int = 0           # ">>" speaker changes: back-and-forth density
    questions: int = 0
    wpm: float = 0.0
    score: float = 0.0

    def describe(self) -> str:
        return (f"{self.events} audio-events, {self.turns} turns, "
                f"{self.questions} questions, {self.wpm:.0f} wpm")


def cold_signals(text: str, dur: float) -> ColdSignals:
    """Cold-start scoring for sources with no heatmap and no creator memory
    (the PRD 17 risk). Cheap text/audio proxies only — still no video."""
    s = ColdSignals(
        events=len(_EVENT.findall(text)),
        turns=len(_TURN.findall(text)),
        questions=text.count("?"),
        wpm=len(text.split()) / (dur / 60.0) if dur > 0 else 0.0,
    )
    s.score = (2.2 * s.events + 0.55 * s.turns + 0.5 * s.questions
               + 0.010 * max(0.0, s.wpm - 120))
    return s


@dataclass
class Moment:
    start: float
    end: float
    score: float
    text: str
    why: str
    signals: dict = field(default_factory=dict)

    @property
    def dur(self) -> float:
        return self.end - self.start


def candidates(sents: list[Sentence], target=30.0, tol=10.0) -> list[tuple[float, float, str]]:
    """Every sentence-aligned window of roughly `target` seconds."""
    out = []
    for i, s0 in enumerate(sents):
        chunk = []
        for s in sents[i:]:
            if s.start - s0.start > target + tol:
                break
            chunk.append(s)
            if s.end - s0.start >= target - tol:
                break
        if not chunk:
            continue
        end = chunk[-1].end
        if target - tol <= end - s0.start <= target + tol:
            out.append((s0.start, end, " ".join(c.text for c in chunk)))
    return out


def rank(sents: list[Sentence], heatmap: list[dict] | None = None, target=30.0,
         n=5, min_gap=20.0, tol=10.0) -> list[Moment]:
    """Rank candidate windows and return the top `n` that don't overlap.

    Uses the engagement heatmap when the source has one, else the cold-start
    signals. Selection is greedy with a spacing constraint so the clips aren't five
    variations of the same 40 seconds.
    """
    moments: list[Moment] = []
    for start, end, text in candidates(sents, target, tol):
        h = heat_avg(heatmap or [], start, end)
        if h is not None:
            moments.append(Moment(start, end, h, text, f"heatmap mean {h:.3f}",
                                  {"heatmap": h}))
        else:
            cs = cold_signals(text, end - start)
            moments.append(Moment(start, end, cs.score, text, f"cold-start: {cs.describe()}",
                                  {"events": cs.events, "turns": cs.turns,
                                   "questions": cs.questions, "wpm": round(cs.wpm, 1)}))

    moments.sort(key=lambda m: -m.score)
    picked: list[Moment] = []
    for m in moments:
        if all(m.start >= p.end + min_gap or m.end <= p.start - min_gap for p in picked):
            picked.append(m)
        if len(picked) >= n:
            break
    return picked


# ── pluggable reasoner (PRD 7.2 creator-aware ranking) ────────────────────────


class Reasoner:
    """Strategy interface for the ranking brain.

    HeuristicReasoner is the always-available default. LLMReasoner (or a
    memory-conditioned ranker) can replace it without touching the pipeline.
    """

    def rank(self, sents, heatmap=None, *, target=30.0, n=5, **kw) -> list[Moment]:
        raise NotImplementedError


class HeuristicReasoner(Reasoner):
    def rank(self, sents, heatmap=None, *, target=30.0, n=5, **kw) -> list[Moment]:
        return rank(sents, heatmap, target=target, n=n, **kw)


class LLMReasoner(Reasoner):
    """Ranks with an LLM over the timestamped transcript, then snaps the returned
    times back onto sentence boundaries. Falls back to the heuristic on any error,
    so a missing key or a bad response degrades instead of failing the job."""

    def __init__(self, client=None, model="claude-sonnet-5"):
        self.client, self.model = client, model

    def _client(self):
        if self.client:
            return self.client
        import anthropic
        return anthropic.Anthropic()

    def rank(self, sents, heatmap=None, *, target=30.0, n=5, memory=None,
             **kw) -> list[Moment]:
        try:
            from .prompts import SYSTEM, extract_json, rank_prompt
            lines = "\n".join(f"[{s.start:.1f}] {s.text}" for s in sents)
            msg = self._client().messages.create(
                model=self.model, max_tokens=2000, system=SYSTEM,
                messages=[{"role": "user",
                           "content": rank_prompt(lines[:120000], n, target,
                                                  memory=memory)}])
            data = extract_json(msg.content[0].text)
            out = []
            for c in data.get("clips", [])[:n]:
                start, end = snap(sents, float(c["start"]), float(c["end"]))
                text = " ".join(s.text for s in sents if start <= s.start < end)
                out.append(Moment(start, end, float(c.get("confidence", 1.0)), text,
                                  f"llm[{c.get('moment_type', '?')}]: {c.get('why', '')}",
                                  {"llm": True, "hook": c.get("hook", "")}))
            if out:
                return out
        except Exception as e:                       # noqa: BLE001 - degrade, don't fail
            import logging
            logging.getLogger("afterplay").warning("LLM ranking unavailable (%s); "
                                                "falling back to heuristic", e)
        return rank(sents, heatmap, target=target, n=n, **kw)


class MemoryReasoner(Reasoner):
    """Ranks with deterministic signals plus creator-thread callback memory.

    Memory is strictly additive and opt-in. If retrieval, embedding, or model judging
    fails, this returns the same heuristic ranking the service already shipped with.
    """

    def __init__(self, channel_memory, judge=None, min_confidence: float = 0.55,
                 boost: float = 3.0, judge_top_k: int = 10):
        self.channel_memory = channel_memory
        self.judge = judge
        self.min_confidence = min_confidence
        self.boost = boost
        self.judge_top_k = judge_top_k

    def rank(self, sents, heatmap=None, *, target=30.0, n=5, min_gap=20.0,
             tol=10.0, **kw) -> list[Moment]:
        try:
            moments: list[Moment] = []
            candidate_windows = candidates(sents, target, tol)
            retrieved_by_idx = self._retrieve_candidates([text for _, _, text in candidate_windows])
            judge = self.judge
            if retrieved_by_idx and judge is None:
                from .channel_memory import judge_callback_with_openai
                judge = judge_callback_with_openai

            for idx, (start, end, text) in enumerate(candidate_windows):
                h = heat_avg(heatmap or [], start, end)
                if h is not None:
                    score = h
                    why = f"heatmap mean {h:.3f}"
                    signals = {"heatmap": h}
                else:
                    cs = cold_signals(text, end - start)
                    score = cs.score
                    why = f"cold-start: {cs.describe()}"
                    signals = {"events": cs.events, "turns": cs.turns,
                               "questions": cs.questions, "wpm": round(cs.wpm, 1)}

                retrieved = retrieved_by_idx.get(idx, [])
                if retrieved and judge:
                    verdict = judge(text, retrieved)
                    thread_ids = {str(item.get("id")) for item in retrieved}
                    thread_id = str(verdict.get("thread_id")) if verdict.get("thread_id") else ""
                    confidence = float(verdict.get("confidence") or 0.0)
                    if (verdict.get("is_callback") and thread_id in thread_ids
                            and confidence >= self.min_confidence):
                        thread = next(item for item in retrieved
                                      if str(item.get("id")) == thread_id)
                        score += self.boost * confidence
                        why = f"callback[{thread.get('label', thread_id)}]: " \
                              f"{verdict.get('why', '')}"
                        first = thread.get("first_seen") or {}
                        signals.update({
                            "callback": True,
                            "thread_id": thread_id,
                            "thread_label": thread.get("label"),
                            "confidence": round(confidence, 3),
                            "why": verdict.get("why", ""),
                            "source_stream": first.get("stream_id"),
                            "source_t": first.get("t"),
                            "source_quote": first.get("quote"),
                        })

                moments.append(Moment(start, end, score, text, why, signals))

            moments.sort(key=lambda m: -m.score)
            picked: list[Moment] = []
            for m in moments:
                if all(m.start >= p.end + min_gap or m.end <= p.start - min_gap
                       for p in picked):
                    picked.append(m)
                if len(picked) >= n:
                    break
            return picked
        except Exception as e:                       # noqa: BLE001 - degrade, don't fail
            import logging
            logging.getLogger("afterplay").warning("channel memory ranking unavailable "
                                                   "(%s); falling back to heuristic", e)
            return rank(sents, heatmap, target=target, n=n, min_gap=min_gap, tol=tol)

    def _retrieve_candidates(self, texts: list[str]) -> dict[int, list[dict]]:
        if not texts:
            return {}
        if hasattr(self.channel_memory, "retrieve_many"):
            return self.channel_memory.retrieve_many(texts, k=3, top_windows=self.judge_top_k)

        scored = []
        for idx, text in enumerate(texts):
            hits = self.channel_memory.retrieve(text, k=3)
            if hits:
                scored.append((idx, float(hits[0].get("similarity") or 0.0), hits))
        scored.sort(key=lambda item: -item[1])
        return {idx: hits for idx, _, hits in scored[:self.judge_top_k]}


def snap(sents: list[Sentence], start: float, end: float) -> tuple[float, float]:
    """Snap arbitrary times onto the nearest sentence boundaries."""
    if not sents:
        return start, end
    s = min(sents, key=lambda x: abs(x.start - start)).start
    e = min(sents, key=lambda x: abs(x.end - end)).end
    if e <= s:
        e = s + (end - start)
    return s, e
