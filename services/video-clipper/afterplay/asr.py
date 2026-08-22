"""ASR — a real transcript when the source has no captions.

Audio-only detection (`audio.py`) picks *where* to clip without captions, but the clips
then ship with no burned captions, which is a visible quality gap on gameplay and music
content. This module closes it: transcribe the audio we already fetched, emit
word-level timings in the same `Word` shape the caption path produces, and let the rest
of the pipeline behave identically.

Backend: faster-whisper (CTranslate2). Chosen over openai-whisper because it is ~4x
faster on CPU, needs no torch, and gives word timestamps directly.

Model resolution order, so this works on a locked-down box:
  1. AFTERPLAY_WHISPER_MODEL — a path to an already-downloaded CTranslate2 model dir
  2. AFTERPLAY_WHISPER_SIZE  — a size name ("tiny".."large-v3"), downloaded on first use
  3. "base"                  — the default

If the model cannot be loaded (no weights, no network), `transcribe` raises
`ASRUnavailable` and the caller keeps the audio-only path instead of failing the job.
"""
from __future__ import annotations

import logging
import os
import time
from dataclasses import dataclass
from pathlib import Path

from .core import AfterplayError
from .understand import Sentence, Word, sentences

log = logging.getLogger("afterplay")

MODEL_ENV = "AFTERPLAY_WHISPER_MODEL"
SIZE_ENV = "AFTERPLAY_WHISPER_SIZE"
DEFAULT_SIZE = "base"


class ASRUnavailable(AfterplayError):
    """Raised when no usable model/weights are reachable. Callers degrade, not fail."""


@dataclass
class Transcript:
    words: list[Word]
    sents: list[Sentence]
    language: str
    language_prob: float
    seconds: float
    model: str

    @property
    def wpm(self) -> float:
        if not self.words:
            return 0.0
        span = max(1e-6, self.words[-1].t - self.words[0].t) / 60.0
        return len(self.words) / span


def _resolve_model() -> str:
    p = os.environ.get(MODEL_ENV)
    if p:
        if not Path(p).expanduser().exists():
            raise ASRUnavailable(f"{MODEL_ENV}={p} does not exist")
        return str(Path(p).expanduser())
    return os.environ.get(SIZE_ENV) or DEFAULT_SIZE


def load_model(compute_type: str = "int8", device: str = "cpu"):
    """Load once; the caller should cache. Raises ASRUnavailable on any failure so the
    pipeline can degrade rather than crash a headless job."""
    try:
        from faster_whisper import WhisperModel
    except ImportError as e:
        raise ASRUnavailable("faster-whisper is not installed "
                             "(pip install faster-whisper)") from e
    name = _resolve_model()
    try:
        t0 = time.time()
        m = WhisperModel(name, device=device, compute_type=compute_type)
        log.info("ASR model %r ready in %.1fs (%s/%s)", name, time.time() - t0,
                 device, compute_type)
        return m, name
    except Exception as e:                                     # noqa: BLE001
        # Most common causes: no network for the first download, or a CDN that closes
        # the connection. Both are environment problems, not job problems.
        raise ASRUnavailable(
            f"could not load Whisper model {name!r}: {type(e).__name__}: {e}. "
            f"Pre-download a CTranslate2 model and set {MODEL_ENV}, or set "
            f"{SIZE_ENV} to a size already in the HF cache.") from e


_CACHE: dict[str, object] = {}


def transcribe(audio_path, *, language: str | None = None, vad: bool = True,
               beam_size: int = 1, model=None) -> Transcript:
    """Transcribe audio to word-level timings.

    `beam_size=1` (greedy) is deliberate: on a clipping pipeline the win from beam
    search is small relative to the latency, and moment selection cares about *where*
    words are far more than about perfect wording.
    """
    if model is None:
        if "m" not in _CACHE:
            _CACHE["m"], _CACHE["name"] = load_model()
        model, name = _CACHE["m"], _CACHE["name"]
    else:
        name = getattr(model, "model_size_or_path", "provided")

    t0 = time.time()
    segments, info = model.transcribe(
        str(audio_path), language=language, word_timestamps=True,
        vad_filter=vad, beam_size=beam_size,
        condition_on_previous_text=False)     # stops hallucination loops on gameplay

    words: list[Word] = []
    for seg in segments:                      # generator: this is where work happens
        for w in (seg.words or []):
            txt = (w.word or "").strip()
            if txt:
                words.append(Word(float(w.start), txt))
    if not words:
        raise ASRUnavailable("transcription produced no words (silent or music-only?)")

    words.sort(key=lambda w: w.t)
    t = Transcript(words=words, sents=sentences(words),
                   language=getattr(info, "language", "?") or "?",
                   language_prob=float(getattr(info, "language_probability", 0.0) or 0),
                   seconds=time.time() - t0, model=str(name))
    log.info("ASR: %d words, %d sentences, lang=%s (%.2f), %.0f wpm in %.1fs",
             len(t.words), len(t.sents), t.language, t.language_prob, t.wpm, t.seconds)
    return t


def to_vtt(words: list[Word], path, group: int = 7, language: str = "auto") -> Path:
    """Write a WebVTT with word-level tags, in the same shape the caption path reads.

    Writing it out means an ASR transcript is inspectable, cacheable and re-runnable —
    and the VTT parser stays the single entry point for all transcripts.
    """
    def ts(x: float) -> str:
        h, r = divmod(max(0.0, x), 3600)
        m, s = divmod(r, 60)
        return f"{int(h):02d}:{int(m):02d}:{s:06.3f}"

    lines = ["WEBVTT", "Kind: captions", f"Language: {language}", ""]
    for i in range(0, len(words), group):
        chunk = words[i:i + group]
        start = chunk[0].t
        end = (words[i + group].t if i + group < len(words) else chunk[-1].t + 1.0)
        body = chunk[0].text + "".join(
            f"<{ts(w.t)}><c> {w.text}</c>" for w in chunk[1:])
        lines += [f"{ts(start)} --> {ts(max(end, start + 0.2))}", body, ""]
    p = Path(path)
    p.write_text("\n".join(lines), encoding="utf-8")
    return p


def available() -> bool:
    """Cheap capability check for `doctor`, without downloading anything."""
    try:
        import faster_whisper  # noqa: F401
    except ImportError:
        return False
    p = os.environ.get(MODEL_ENV)
    return bool(p and Path(p).expanduser().exists()) or True   # size names resolve lazily
