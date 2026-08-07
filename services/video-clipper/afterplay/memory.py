"""Creator Memory (PRD 8), backed by local JSON files.

One directory per creator; plain JSON so it is inspectable, diffable and trivially
portable to a real DB later. Read at planning time, written after every job.

    ~/.afterplay/memory/<creator_id>/profile.json      brand + voice + format prefs
    ~/.afterplay/memory/<creator_id>/corrections.json  what the agent had to fix
    ~/.afterplay/memory/<creator_id>/performance.json  per-clip outcomes (Phase 3)

Precedence, per the PRD: explicit > learned > global default. `learned` is only ever
allowed to move defaults the creator has not pinned themselves.
"""
from __future__ import annotations

import json
import logging
import os
import time
from dataclasses import asdict, dataclass, field
from pathlib import Path

from .core import Brand, _configured_dir

log = logging.getLogger("afterplay")


def memory_root() -> Path:
    """Where channel memory lives. Repo-relative like the workdir — see
    `core._configured_dir`: cwd-relative resolution split the memory in two depending
    on where the command was run from, so a backfill and the run that should have
    used it wrote to different stores."""
    return _configured_dir("AFTERPLAY_MEMORY", Path.home() / ".afterplay" / "memory")


def _load(p: Path, default):
    try:
        return json.loads(p.read_text(encoding="utf-8")) if p.exists() else default
    except (OSError, json.JSONDecodeError) as e:
        log.warning("memory file %s unreadable (%s); using default", p, e)
        return default


def _save(p: Path, obj):
    p.parent.mkdir(parents=True, exist_ok=True)
    tmp = p.with_suffix(p.suffix + ".tmp")
    tmp.write_text(json.dumps(obj, indent=2, default=str), encoding="utf-8")
    tmp.replace(p)                       # atomic: a crashed write never corrupts memory


@dataclass
class FormatPrefs:
    target_len: float = 30.0
    n_clips: int = 5
    platforms: list[str] = field(default_factory=lambda: ["shorts"])
    words_per_line: int = 4
    start_bias: float = 0.0              # learned: this creator wants earlier/later hooks
    uppercase: bool = False


@dataclass
class CreatorMemory:
    creator_id: str
    explicit: dict = field(default_factory=dict)     # pinned by the creator; never overwritten
    brand: Brand = field(default_factory=Brand)
    prefs: FormatPrefs = field(default_factory=FormatPrefs)
    corrections: list[dict] = field(default_factory=list)
    performance: list[dict] = field(default_factory=list)
    stats: dict = field(default_factory=dict)

    # ── io ────────────────────────────────────────────────────────────────────
    @classmethod
    def load(cls, creator_id: str) -> "CreatorMemory":
        d = memory_root() / creator_id
        prof = _load(d / "profile.json", {})
        m = cls(creator_id=creator_id,
                explicit=prof.get("explicit", {}),
                brand=Brand(**{**Brand().__dict__, **prof.get("brand", {})}),
                prefs=FormatPrefs(**{**FormatPrefs().__dict__, **prof.get("prefs", {})}),
                stats=prof.get("stats", {}))
        m.corrections = _load(d / "corrections.json", [])
        m.performance = _load(d / "performance.json", [])
        return m

    def save(self):
        d = memory_root() / self.creator_id
        _save(d / "profile.json", {"creator_id": self.creator_id,
                                   "explicit": self.explicit,
                                   "brand": asdict(self.brand),
                                   "prefs": asdict(self.prefs),
                                   "stats": self.stats,
                                   "updated": time.time()})
        _save(d / "corrections.json", self.corrections[-500:])
        _save(d / "performance.json", self.performance[-2000:])
        return d

    # ── use at planning time ──────────────────────────────────────────────────
    def effective_brand(self) -> Brand:
        """Learned values with the creator's explicit pins layered on top."""
        b = Brand(**self.brand.__dict__)
        for k, v in (self.explicit.get("brand") or {}).items():
            if hasattr(b, k):
                setattr(b, k, v)
        return b

    def pin(self, section: str, **kw):
        """Record an explicit creator choice. These win over anything learned."""
        self.explicit.setdefault(section, {}).update(kw)
        if section == "brand":
            for k, v in kw.items():
                if hasattr(self.brand, k):
                    setattr(self.brand, k, v)
        return self

    # ── write back after a job ────────────────────────────────────────────────
    def record_job(self, job) -> dict:
        """Ingest a JobResult: log corrections and let repeated repairs move defaults.

        This is the cheap version of the feedback loop: if the agent keeps making the
        same fix, stop needing to make it.
        """
        clips = [c if isinstance(c, dict) else asdict(c) for c in job.clips]
        for c in clips:
            if c.get("repairs"):
                self.corrections.append({
                    "job": job.job_id, "clip": c["clip_id"], "platform": c["platform"],
                    "repairs": c["repairs"], "attempts": c.get("attempts"),
                    "ok": c.get("ok"), "ts": time.time()})

        st = self.stats
        st["jobs"] = st.get("jobs", 0) + 1
        st["clips"] = st.get("clips", 0) + len(clips)
        st["clips_ok"] = st.get("clips_ok", 0) + sum(1 for c in clips if c.get("ok"))
        st["first_pass"] = st.get("first_pass", 0) + sum(
            1 for c in clips if c.get("ok") and c.get("attempts") == 1)
        st["qc_pass_rate"] = round(st["clips_ok"] / max(1, st["clips"]), 3)
        st["first_pass_rate"] = round(st["first_pass"] / max(1, st["clips"]), 3)

        applied = self._learn()
        self.save()
        return {"stats": st, "learned": applied}

    def _learn(self, window: int = 40, threshold: float = 0.4) -> dict:
        """Promote frequent repairs into defaults, unless the creator pinned them."""
        recent = self.corrections[-window:]
        if len(recent) < 4:
            return {}
        counts: dict[str, int] = {}
        for c in recent:
            for r in c["repairs"]:
                counts[r] = counts.get(r, 0) + 1
        pinned_brand = set((self.explicit.get("brand") or {}).keys())
        pinned_prefs = set((self.explicit.get("prefs") or {}).keys())
        applied = {}

        if counts.get("shrink_captions", 0) / len(recent) >= threshold:
            if "font_size_pct" not in pinned_brand:
                new = round(max(0.032, self.brand.font_size_pct * 0.92), 4)
                if new != self.brand.font_size_pct:
                    self.brand.font_size_pct = new
                    applied["brand.font_size_pct"] = new
            if "words_per_line" not in pinned_prefs and self.prefs.words_per_line > 2:
                self.prefs.words_per_line -= 1
                applied["prefs.words_per_line"] = self.prefs.words_per_line

        if (counts.get("snap_to_speech", 0) + counts.get("shift_start", 0)) / len(recent) \
                >= threshold and "start_bias" not in pinned_prefs:
            self.prefs.start_bias = round(min(1.5, self.prefs.start_bias + 0.2), 2)
            applied["prefs.start_bias"] = self.prefs.start_bias

        if counts.get("lower_loudness", 0) / len(recent) >= threshold:
            applied["note"] = "recurrent loudness clipping; consider a lower LUFS target"

        if applied:
            log.info("memory[%s] learned: %s", self.creator_id, applied)
        return applied

    def record_performance(self, clip_id: str, platform: str, metrics: dict):
        """Phase 3 hook: post-publish outcomes keyed to a clip."""
        self.performance.append({"clip": clip_id, "platform": platform,
                                 "metrics": metrics, "ts": time.time()})
        return self
