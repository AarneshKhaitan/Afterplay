"""Verify model-reported citations against transcript text.

The model may suggest a quote and timestamp, but neither is evidence until the quote is
matched to a contiguous transcript span. The matched span supplies both the stored quote
and timestamp; reported values are retained only for audit.
"""
from __future__ import annotations

import unicodedata
from dataclasses import dataclass
from difflib import SequenceMatcher
from typing import Iterable


@dataclass(frozen=True)
class CitationMatch:
    verified: bool
    quote: str
    t: float | None
    t_reported: float | None
    quote_display: str
    match_ratio: float
    repair: str | None


@dataclass(frozen=True)
class _Token:
    raw: str
    normalized: str
    t: float


def _normalize_token(value: str) -> str:
    text = unicodedata.normalize("NFC", value).casefold()
    # Captions commonly split or drop apostrophes and hyphens. Deleting them keeps
    # contractions and compounds comparable without transliterating any script.
    text = text.replace("'", "").replace("’", "").replace("-", "")
    return "".join(
        char
        for char in text
        if unicodedata.category(char)[0] in {"L", "N", "M"}
    )


def _tokens(text: str, t: float) -> list[_Token]:
    out = []
    for raw in unicodedata.normalize("NFC", text).split():
        normalized = _normalize_token(raw)
        if normalized:
            out.append(_Token(raw=raw, normalized=normalized, t=t))
    return out


def _reported_time(value) -> float | None:
    try:
        return float(value) if value is not None else None
    except (TypeError, ValueError):
        return None


def verify_citation(
    reported_quote: str,
    reported_t,
    sentences: Iterable,
    *,
    threshold: float = 0.75,
) -> CitationMatch:
    """Return a source-derived citation when a contiguous transcript span matches.

    Candidate spans stay close to the quote's token count. This prevents scattered
    topic words across a long window from being mistaken for a quotation. The reported
    timestamp only breaks ties between repeated quotes; it never becomes verified time.
    """
    quote_display = unicodedata.normalize("NFC", str(reported_quote or "")).strip()
    t_reported = _reported_time(reported_t)
    query = _tokens(quote_display, 0.0)
    query_norm = [token.normalized for token in query]
    query_chars = "".join(query_norm)
    if not query_norm or len(query_chars) < 4:
        return CitationMatch(False, "", None, t_reported, quote_display, 0.0, None)

    transcript: list[_Token] = []
    for sentence in sentences:
        transcript.extend(_tokens(str(sentence.text), float(sentence.start)))
    if not transcript:
        return CitationMatch(False, "", None, t_reported, quote_display, 0.0, None)

    minimum = max(1, len(query_norm) - 3)
    maximum = min(len(transcript), len(query_norm) + 3)
    best = None
    best_key = None

    for size in range(minimum, maximum + 1):
        for start in range(0, len(transcript) - size + 1):
            candidate = transcript[start:start + size]
            candidate_norm = [token.normalized for token in candidate]
            matcher = SequenceMatcher(None, query_norm, candidate_norm, autojunk=False)
            matched = sum(block.size for block in matcher.get_matching_blocks())
            containment = matched / len(query_norm)
            char_ratio = SequenceMatcher(
                None, query_chars, "".join(candidate_norm), autojunk=False
            ).ratio()
            score = max(containment, char_ratio)
            distance = abs(candidate[0].t - t_reported) if t_reported is not None else 0.0
            key = (score, -abs(size - len(query_norm)), -distance)
            if best_key is None or key > best_key:
                best_key = key
                best = candidate

    score = float(best_key[0]) if best_key is not None else 0.0
    if not best or score < threshold:
        return CitationMatch(
            False, "", None, t_reported, quote_display, round(score, 4), None
        )

    actual_quote = " ".join(token.raw for token in best)
    actual_t = best[0].t
    reported_norm = " ".join(query_norm)
    actual_norm = " ".join(token.normalized for token in best)
    repairs = []
    if reported_norm != actual_norm:
        repairs.append("quote_fuzzy")
    elif quote_display != actual_quote:
        repairs.append("quote_normalized")
    if t_reported is None or abs(t_reported - actual_t) > 0.5:
        repairs.append("timestamp")

    return CitationMatch(
        True,
        actual_quote,
        actual_t,
        t_reported,
        quote_display,
        round(score, 4),
        "+".join(repairs) or None,
    )
