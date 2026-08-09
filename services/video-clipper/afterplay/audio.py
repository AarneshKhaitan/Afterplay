"""Caption-free moment detection from audio alone.

The transcript path dies on three common source types: gameplay with no captions,
music/reaction content, and anything the platform never auto-captioned. For those the
signal was never words — it is the **audio**: gunfire and killfeed stings, a player
shouting, a crowd reacting, a beat drop.

Cost: an audio-only fetch is ~5-10 MB for 15 minutes versus ~200 MB of video, so this
stays inside the "decide before you download" rule.

Detection is deliberately simple and explainable:
  1. short-time RMS envelope (50 ms hops)
  2. a slow baseline (median over ~15 s) so loud games and quiet ones score alike
  3. score = excitement above baseline + onset density (transients = shots/hits)
  4. pick the best non-overlapping windows, then push the cut back so the clip opens
     just BEFORE the spike rather than on top of it
"""
from __future__ import annotations

import logging
import time
from dataclasses import dataclass
from pathlib import Path

from .core import AfterplayError, Settings, is_bot_block, network_opts, read_audio
from .understand import Moment

log = logging.getLogger("afterplay")


def fetch_audio_only(url: str, settings: Settings, out_dir: Path) -> Path:
    """Download just the audio stream. A fraction of the video's bytes."""
    import yt_dlp
    out_dir.mkdir(parents=True, exist_ok=True)
    tmpl = str(out_dir / "audio.%(ext)s")
    t0 = time.time()
    opts = {"quiet": True, "no_warnings": True,
            "format": "ba/bestaudio/worst", "outtmpl": tmpl}
    opts.update(network_opts(settings))
    try:
        with yt_dlp.YoutubeDL(opts) as ydl:
            info = ydl.extract_info(url, download=True)
    except Exception as e:                                    # noqa: BLE001
        if is_bot_block(e):
            raise AfterplayError(
                f"{url}: blocked by YouTube bot check while fetching audio. "
                "Set AFTERPLAY_COOKIES or AFTERPLAY_COOKIES_FROM_BROWSER, "
                "or run from local media with --local.") from e
        raise
    got = sorted(out_dir.glob("audio.*"))
    if not got:
        raise FileNotFoundError("audio-only fetch produced no file")
    mb = got[0].stat().st_size / 1e6
    log.info("audio-only fetch: %.1f MB in %.1fs (%s)", mb, time.time() - t0,
             got[0].name)
    return got[0]


@dataclass
class AudioProfile:
    hop: float
    rms: "any"
    baseline: "any"
    onsets: "any"


def profile(path, hop_s: float = 0.05, baseline_s: float = 15.0) -> AudioProfile:
    import numpy as np
    a, sr = read_audio(path)
    if a.size == 0:
        raise ValueError(f"no decodable audio in {path}")
    hop = max(1, int(sr * hop_s))
    n = a.size // hop
    frames = a[:n * hop].reshape(n, hop)
    rms = np.sqrt((frames ** 2).mean(axis=1) + 1e-12)

    # slow baseline via a median filter, so absolute loudness does not decide
    w = max(3, int(baseline_s / hop_s) | 1)
    pad = np.pad(rms, (w // 2, w // 2), mode="edge")
    # strided median is expensive; a cumulative-mean approximation is enough here
    kern = np.ones(w, dtype="float32") / w
    baseline = np.convolve(pad, kern, mode="valid")[:rms.size]

    # onsets: positive jumps in the envelope = transients (shots, hits, cuts)
    d = np.diff(rms, prepend=rms[0])
    onsets = np.maximum(0.0, d)
    return AudioProfile(hop=hop_s, rms=rms, baseline=baseline, onsets=onsets)


def audio_moments(path, target: float = 30.0, n: int = 5, min_gap: float = 20.0,
                  lead_in: float = 3.0, duration: float | None = None) -> list[Moment]:
    """Rank windows by audio excitement. Returns Moments with `why` explaining the score.

    `lead_in` shifts the window earlier than the peak: a kill clip should show the
    approach and land the spike a few seconds in, not open on the aftermath.
    """
    import numpy as np
    p = profile(path)
    hop = p.hop
    total = len(p.rms) * hop
    if duration:
        total = min(total, duration)

    win = max(1, int(target / hop))
    excite = np.maximum(0.0, p.rms - p.baseline)          # loud relative to context
    e_cs = np.cumsum(np.insert(excite, 0, 0.0))
    o_cs = np.cumsum(np.insert(p.onsets, 0, 0.0))
    lim = max(1, len(p.rms) - win)

    e_win = (e_cs[win:win + lim] - e_cs[:lim]) / win
    o_win = (o_cs[win:win + lim] - o_cs[:lim]) / win
    if e_win.size == 0:
        return []
    # normalise each component so neither dominates by unit scale
    def z(v):
        s = v.std() or 1.0
        return (v - v.mean()) / s
    score = 1.0 * z(e_win) + 0.8 * z(o_win)

    order = np.argsort(-score)
    picked: list[Moment] = []
    for idx in order:
        peak_t = float(idx * hop)
        start = max(0.0, peak_t - lead_in)
        end = min(total, start + target)
        if end - start < target * 0.6:
            continue
        if any(start < m.end + min_gap and m.start - min_gap < end for m in picked):
            continue
        seg_e = float(e_win[idx])
        seg_o = float(o_win[idx])
        picked.append(Moment(
            start, end, float(score[idx]), "",
            f"audio: excitement {seg_e:.4f} over baseline, "
            f"{seg_o * 1000:.1f} onsets/s (no captions — audio-only detection)",
            {"excitement": round(seg_e, 5), "onset_rate": round(seg_o, 5),
             "peak_at": round(peak_t, 2)}))
        if len(picked) >= n:
            break
    picked.sort(key=lambda m: -m.score)
    log.info("audio detection: %d moments from %.0fs of audio", len(picked), total)
    return picked
