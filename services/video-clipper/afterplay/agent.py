"""The agentic loop.

Designed to run headless and unattended: plan -> call tools -> LOOK at the rendered
frames -> repair -> deliver. One Orchestrator fans out a ClipAgent subagent per
(moment x platform), each of which owns its own render/QC/repair loop and can fix
its clip without redoing the job (PRD 7.3, 10).

Two policies drive decisions:
  HeuristicPolicy - deterministic, no credentials, always available. The default.
  ClaudePolicy    - uses the Anthropic API when credentials are present, including
                    vision review of real frames. Degrades to heuristic on any error.

Nothing here prompts, blocks on input, or assumes a TTY.
"""
from __future__ import annotations

import concurrent.futures as cf
import json
import logging
import os
import time
import uuid
from dataclasses import dataclass, field, asdict
from pathlib import Path

from . import produce, qc as qcmod
# Import the resolve helpers by name: `afterplay/__init__.py` exports a function called
# `resolve`, which shadows the same-named submodule on the package object, so
# `from . import resolve` would bind the function here.
from .resolve import from_info_json, from_local, resolve as resolve_url, stream_urls
from .core import (Brand, AfterplayError, PLATFORMS, Platform, Settings, detect_encoder,
                   jdump, probe, replace_with_retry)
from .channel_memory import ChannelMemory
from .understand import (HeuristicReasoner, LLMReasoner, MemoryReasoner, Moment, Reasoner, Word,
                         parse_vtt, sentences, speech_onset)

log = logging.getLogger("afterplay")
SKILLS_DIR = Path(__file__).parent / "skills"
STATUS_STATES = frozenset({"started", "running", "complete", "failed"})
STATUS_STAGES = frozenset({"resolve", "transcript", "memory", "render", "done"})
MANIFEST_SCHEMA_VERSION = 2
MANIFEST_SCHEMA = "afterplay.clip-manifest"
FOOTAGE_RIGHTS = frozenset({
    "project_owned", "creator_owned", "permission_granted", "licensed", "not_cleared",
})


# ── tool registry (what the agent is allowed to do) ──────────────────────────

@dataclass
class Tool:
    name: str
    description: str
    schema: dict
    fn: callable

    def spec(self) -> dict:
        """Anthropic tool-use shape, so an LLM policy can call these directly."""
        return {"name": self.name, "description": self.description,
                "input_schema": self.schema}


class ToolRegistry:
    def __init__(self):
        self._tools: dict[str, Tool] = {}

    def register(self, name, description, schema):
        def deco(fn):
            self._tools[name] = Tool(name, description, schema, fn)
            return fn
        return deco

    def specs(self) -> list[dict]:
        return [t.spec() for t in self._tools.values()]

    def call(self, name, **kw):
        if name not in self._tools:
            raise AfterplayError(f"unknown tool {name!r}")
        t0 = time.time()
        out = self._tools[name].fn(**kw)
        log.debug("tool %s ok in %.2fs", name, time.time() - t0)
        return out

    def __contains__(self, name):
        return name in self._tools


TOOLS = ToolRegistry()
_S = {"type": "object", "properties": {}, "required": []}


@TOOLS.register("resolve_source", "Fetch metadata, captions and heatmap for a URL. "
                "No video bytes are downloaded.",
                {"type": "object", "properties": {"url": {"type": "string"}},
                 "required": ["url"]})
def _t_resolve(url, settings=None, job_id="job"):
    return resolve_url(url, settings or Settings(), job_id)


@TOOLS.register("read_transcript", "Parse a VTT caption file into word-level timings "
                "and sentence boundaries.",
                {"type": "object", "properties": {"vtt_path": {"type": "string"}},
                 "required": ["vtt_path"]})
def _t_transcript(vtt_path):
    words = parse_vtt(Path(vtt_path).read_text(encoding="utf-8"))
    return words, sentences(words)


@TOOLS.register("rank_moments", "Score and select the most clip-worthy windows using "
                "the engagement heatmap, or cold-start text/audio signals.",
                {"type": "object", "properties": {
                    "n": {"type": "integer"}, "target": {"type": "number"}},
                 "required": ["n"]})
def _t_rank(sents, heatmap=None, n=5, target=30.0, reasoner=None):
    return (reasoner or HeuristicReasoner()).rank(sents, heatmap, target=target, n=n)


@TOOLS.register("extract_range", "Range-fetch only the seconds a clip needs from the "
                "source (HTTP range request; no full download).",
                {"type": "object", "properties": {
                    "start": {"type": "number"}, "end": {"type": "number"}},
                 "required": ["start", "end"]})
def _t_extract(src, start, end, out, settings, pad=0.0):
    return produce.extract(src, start, end, Path(out), settings, pad=pad)


@TOOLS.register("track_subject", "Find the crop path that keeps the subject framed "
                "for a target aspect ratio.",
                {"type": "object", "properties": {
                    "path": {"type": "string"}, "aspect": {"type": "number"}},
                 "required": ["path", "aspect"]})
def _t_track(path, aspect):
    # face-driven when faces are found, saliency otherwise
    from .vision import track_subject_best
    return track_subject_best(Path(path), aspect)


@TOOLS.register("build_captions", "Generate styled word-level ASS captions placed in "
                "the platform's safe zone.",
                {"type": "object", "properties": {
                    "clip_start": {"type": "number"}, "duration": {"type": "number"}},
                 "required": ["clip_start", "duration"]})
def _t_captions(words, clip_start, duration, platform, brand, out, words_per_line=4):
    return produce.build_ass(words, clip_start, duration, platform, brand, Path(out),
                             words_per_line=words_per_line)


@TOOLS.register("render_clip", "Reframe, caption, brand and normalise the clip, "
                "encoding only these seconds.",
                {"type": "object", "properties": {"out": {"type": "string"}},
                 "required": ["out"]})
def _t_render(extract_path, spec, out, settings):
    return produce.render(Path(extract_path), spec, Path(out), settings)


@TOOLS.register("inspect_clip", "LOOK at the rendered clip: sample frames and audio, "
                "and measure geometry, black/frozen frames, subject framing, caption "
                "safe-zone overflow, loudness and hook.",
                {"type": "object", "properties": {"path": {"type": "string"}},
                 "required": ["path"]})
def _t_qc(path, platform, want_dur, captions_only=None, words=None, clip_start=0.0,
          reviewer=None):
    return qcmod.run_qc(Path(path), platform, want_dur, captions_only=captions_only,
                        words=words, clip_start=clip_start, reviewer=reviewer)


@TOOLS.register("sample_frames", "Grab N frames from a clip as images for visual review.",
                {"type": "object", "properties": {
                    "path": {"type": "string"}, "n": {"type": "integer"}},
                 "required": ["path"]})
def _t_frames(path, n=6):
    return qcmod.sample_frames(Path(path), n=n)


# ── policies ─────────────────────────────────────────────────────────────────

REPAIRS = ("shift_start", "snap_to_speech", "recenter_left", "recenter_right",
           "shrink_captions", "lower_loudness", "shorten", "reextract")


class Policy:
    """Decides ranking and how to repair a failing clip."""

    def reasoner(self) -> Reasoner:
        return HeuristicReasoner()

    def choose_repairs(self, report, attempt: int) -> list[str]:
        return report.repairs

    def reviewer(self):
        return None                      # optional vision callback for QC


class HeuristicPolicy(Policy):
    """Deterministic. Runs anywhere, needs nothing, never blocks."""

    def choose_repairs(self, report, attempt):
        # order matters: fix WHERE the clip starts before fixing how it looks,
        # since a start shift invalidates framing and caption timing anyway.
        pri = {"snap_to_speech": 0, "shift_start": 1, "shorten": 2,
               "recenter_left": 3, "recenter_right": 3, "shrink_captions": 4,
               "lower_loudness": 5, "reextract": 6}
        return sorted(report.repairs, key=lambda r: pri.get(r, 9))[:2]


class ClaudePolicy(Policy):
    """Uses the Anthropic API when credentials exist in the environment.

    Adds two things over the heuristic: LLM moment ranking, and vision review of
    real frames (the model literally looks at the render). Any failure degrades to
    the heuristic path so a headless run never dies on a policy error.
    """

    def __init__(self, model="claude-sonnet-5", vision=True):
        self.model, self.vision = model, vision
        self._client = None

    def available(self) -> bool:
        return bool(os.environ.get("ANTHROPIC_API_KEY"))

    def client(self):
        if self._client is None:
            import anthropic
            self._client = anthropic.Anthropic()
        return self._client

    def reasoner(self):
        if not self.available():
            return HeuristicReasoner()
        return LLMReasoner(client=self.client(), model=self.model)

    def reviewer(self):
        if not (self.vision and self.available()):
            return None

        def review(frames):
            import base64
            import cv2
            from .prompts import SYSTEM, extract_json, vision_prompt
            if not frames:
                return []
            h, w = frames[0][1].shape[:2]
            content = [{"type": "text",
                        "text": vision_prompt(min(6, len(frames)), w, h)}]
            for ts, fr in frames[:6]:
                ok, buf = cv2.imencode(".jpg", fr, [cv2.IMWRITE_JPEG_QUALITY, 72])
                if not ok:
                    continue
                content.append({"type": "text", "text": f"frame at {ts:.1f}s:"})
                content.append({"type": "image", "source": {
                    "type": "base64", "media_type": "image/jpeg",
                    "data": base64.b64encode(buf.tobytes()).decode()}})
            msg = self.client().messages.create(
                model=self.model, max_tokens=1200, system=SYSTEM,
                messages=[{"role": "user", "content": content}])
            data = extract_json(msg.content[0].text)
            out = []
            for issue in data.get("issues", [])[:3]:
                out.append(qcmod.Finding(
                    code="vision_" + str(issue.get("code", "issue"))[:40],
                    severity=qcmod.FAIL if issue.get("severity") == "fail" else qcmod.WARN,
                    message=str(issue.get("message", ""))[:300],
                    metrics={"verdict": data.get("verdict", "?")},
                    repair=issue.get("repair") if issue.get("repair") in REPAIRS else None))
            return out
        return review


class MemoryPolicy(Policy):
    """Uses OpenAI-backed creator-thread memory for callback-aware ranking.

    Rendering, repair choice and QC stay deterministic unless another policy is
    explicitly selected later. Missing credentials degrade inside MemoryReasoner.
    """

    def __init__(self, creator_id: str, root: Path | None = None):
        self.memory = ChannelMemory(creator_id, root=root)

    def reasoner(self):
        return MemoryReasoner(self.memory)


def load_skill(name: str) -> str:
    """Skills are markdown craft docs the policy loads into its prompts, and that
    document the rules the heuristic path encodes."""
    p = SKILLS_DIR / f"{name}.md"
    return p.read_text(encoding="utf-8") if p.exists() else ""


# ── results ──────────────────────────────────────────────────────────────────

@dataclass
class ClipResult:
    clip_id: str
    platform: str
    start: float
    end: float
    duration: float
    path: str | None = None
    score: float = 0.0
    why: str = ""
    attempts: int = 0
    repairs: list[str] = field(default_factory=list)
    qc: dict = field(default_factory=dict)
    ok: bool = False
    error: str | None = None
    seconds: float = 0.0
    copy: dict = field(default_factory=dict)
    text_for_copy: str = ""
    signals: dict = field(default_factory=dict)
    decision_window: dict = field(default_factory=dict)


@dataclass
class JobResult:
    job_id: str
    source: dict
    schema: str = MANIFEST_SCHEMA
    schema_version: int = MANIFEST_SCHEMA_VERSION
    creator_id: str | None = None
    clips: list[ClipResult] = field(default_factory=list)
    timings: dict = field(default_factory=dict)
    encoder: str = ""
    heatmap_available: bool = False
    memory: dict = field(default_factory=dict)
    ablation: dict = field(default_factory=dict)
    message: str | None = None
    status: str = "complete"
    ok: bool = False

    def to_dict(self):
        if self.schema != MANIFEST_SCHEMA or self.schema_version != MANIFEST_SCHEMA_VERSION:
            raise ValueError("invalid clip manifest schema identity")
        if not self.creator_id:
            raise ValueError("manifest v2 requires a creator_id")
        rights = self.source.get("footage_rights")
        if rights not in FOOTAGE_RIGHTS:
            raise ValueError("manifest source requires explicit footage rights")
        required_source = {"transcript_language", "transcript_source", "subtitle_track"}
        if not required_source.issubset(self.source):
            raise ValueError("manifest v2 source provenance is incomplete")
        d = asdict(self)
        d["clips"] = [asdict(c) if not isinstance(c, dict) else c for c in self.clips]
        if any(not isinstance(clip.get("decision_window"), dict)
               or set(clip["decision_window"]) != {"start", "end"}
               for clip in d["clips"]):
            raise ValueError("manifest v2 clips require immutable decision windows")
        return d


# ── the per-clip subagent ────────────────────────────────────────────────────

class ClipAgent:
    """Owns one clip end to end: extract -> render -> inspect -> repair -> accept.

    The repair loop is the point. A clip is never shipped because the commands
    exited 0; it ships because the frames measured correct.
    """

    def __init__(self, job_dir: Path, source_ref, words: list[Word], settings: Settings,
                 brand: Brand, policy: Policy):
        self.dir, self.src_ref, self.words = job_dir, source_ref, words
        self.settings, self.brand, self.policy = settings, brand, policy

    def run(self, moment: Moment, plat: Platform, clip_id: str) -> ClipResult:
        t0 = time.time()
        res = ClipResult(clip_id=clip_id, platform=plat.name, start=moment.start,
                         end=moment.end, duration=moment.dur, score=moment.score,
                         why=moment.why,
                         # the clip's own transcript, for per-platform copy generation
                         text_for_copy=(moment.text or "")[:4000],
                         signals=dict(moment.signals or {}),
                         decision_window={"start": moment.start, "end": moment.end})
        try:
            dur = min(moment.dur, plat.max_dur)
            pad = 2.0                       # keyframe slack for the copy-cut
            ex = self.dir / f"{clip_id}_src.mp4"
            if not ex.exists():
                TOOLS.call("extract_range", src=self.src_ref, start=moment.start,
                           end=moment.start + dur, out=ex, settings=self.settings, pad=pad)
            ex_info = probe(ex)
            # A copy-cut lands on the nearest keyframe at or before the requested
            # time, so the extract starts EARLIER than the moment. Trim that slack
            # off in the render pass, where the cut is frame-accurate.
            ex_start = max(0.0, moment.start - pad)
            trim = min(moment.start - ex_start, max(0.0, ex_info.duration - 1.0))

            crop = TOOLS.call("track_subject", path=str(ex), aspect=plat.aspect)
            spec = produce.RenderSpec(platform=plat, brand=self.brand, trim_start=trim,
                                      duration=min(dur, ex_info.duration - trim),
                                      crop=crop,
                                      min_width_frac=self.settings.min_width_frac,
                                      watermark=Path(self.brand.watermark)
                                      if self.brand.watermark else None)
            wpl = 4
            out = self.dir / f"{clip_id}.mp4"

            self._reextract = False
            for attempt in range(1, self.settings.max_repair_attempts + 2):
                res.attempts = attempt
                if self._reextract:
                    self._reextract = False
                    ex.unlink(missing_ok=True)
                    TOOLS.call("extract_range", src=self.src_ref, start=moment.start,
                               end=moment.start + dur, out=ex, settings=self.settings,
                               pad=pad)
                    ex_info = probe(ex)
                    spec = spec.clone(duration=min(spec.duration,
                                                   ex_info.duration - spec.trim_start))
                # Captions are timed in SOURCE time: the rendered clip starts at
                # ex_start + trim_start, and repairs move trim_start.
                abs_start = ex_start + spec.trim_start
                if self.settings.captions:
                    spec.ass = self.dir / f"{clip_id}.ass"
                    TOOLS.call("build_captions", words=self.words, clip_start=abs_start,
                               duration=spec.duration, platform=plat, brand=spec.brand,
                               out=spec.ass, words_per_line=wpl)
                else:
                    # Captions are opt-in (off by default: most source footage already
                    # carries the creator's own burned-in captions). Skip generating
                    # and then discarding an ASS file that would never be rendered.
                    spec.ass = None
                TOOLS.call("render_clip", extract_path=ex, spec=spec, out=out,
                           settings=self.settings)

                cap_probe = None
                if self.settings.captions:
                    cap_probe = self.dir / f"{clip_id}_cap.mp4"
                    try:
                        produce.render_captions_only(spec, cap_probe, self.settings)
                    except Exception as e:                   # noqa: BLE001
                        log.warning("caption probe failed for %s: %s", clip_id, e)
                        cap_probe = None

                report = TOOLS.call("inspect_clip", path=out, platform=plat,
                                    want_dur=spec.duration, captions_only=cap_probe,
                                    words=self.words, clip_start=abs_start,
                                    reviewer=self.policy.reviewer())
                res.qc = report.to_dict()
                log.info("[%s] attempt %d: %s", clip_id, attempt, report.summary())

                if report.ok:
                    res.ok = True
                    break
                if attempt > self.settings.max_repair_attempts:
                    res.error = "QC still failing after repairs: " + \
                                "; ".join(f.message for f in report.failures)
                    break

                actions = self.policy.choose_repairs(report, attempt)
                if not actions:
                    res.error = "QC failed with no actionable repair: " + \
                                "; ".join(f.code for f in report.failures)
                    break
                res.repairs.extend(actions)
                spec, wpl = self._apply(actions, spec, wpl, ex_start, plat)

            res.path = str(out) if out.exists() else None
            res.start = ex_start + spec.trim_start
            res.duration = spec.duration
            res.end = res.start + spec.duration
        except Exception as e:                                # noqa: BLE001
            log.exception("[%s] failed", clip_id)
            res.error = f"{type(e).__name__}: {e}"
        res.seconds = time.time() - t0
        return res

    def _apply(self, actions, spec, wpl, ex_start, plat):
        """Turn QC repair codes into concrete changes to the render spec."""
        b = spec.brand
        for a in actions:
            if a == "shift_start":
                spec = spec.clone(trim_start=spec.trim_start + 0.4,
                                  duration=max(6.0, spec.duration - 0.4))
            elif a == "snap_to_speech":
                # move the cut to the next word after the current clip start
                cur_abs = ex_start + spec.trim_start
                onset = speech_onset(self.words, cur_abs)
                if onset is not None:
                    delta = max(0.05, min(3.0, onset - cur_abs))
                    spec = spec.clone(trim_start=spec.trim_start + delta,
                                      duration=max(6.0, spec.duration - delta))
            elif a in ("recenter_left", "recenter_right"):
                # subject hugged that edge -> push the window the other way
                px = 0.10 * (spec.crop.crop_w if spec.crop else plat.width)
                spec = spec.clone(x_bias=spec.x_bias + (px if a == "recenter_left" else -px),
                                  zoom=min(1.35, spec.zoom * 1.08))
            elif a == "shrink_captions":
                b = Brand(**{**b.__dict__,
                             "font_size_pct": max(0.030, b.font_size_pct * 0.86),
                             "max_chars_per_line": max(14, b.max_chars_per_line - 4)})
                wpl = max(2, wpl - 1)
                spec = spec.clone(brand=b)
            elif a == "lower_loudness":
                p2 = Platform(**{**plat.__dict__, "loudness": plat.loudness - 2.0})
                spec = spec.clone(platform=p2)
            elif a == "shorten":
                spec = spec.clone(duration=min(spec.duration, plat.max_dur - 0.2))
            elif a == "reextract":
                # A no-op retry wastes the attempt budget. Re-cut the window with a
                # real re-encode: fixes copy-cut artefacts, missing/odd audio streams
                # and containers whose first keyframe landed badly.
                self._reextract = True
        return spec, wpl


# ── the orchestrator ─────────────────────────────────────────────────────────

class Orchestrator:
    """Runs a whole job headlessly and fans clips out across subagents."""

    def __init__(self, settings: Settings | None = None, brand: Brand | None = None,
                 policy: Policy | None = None, workers: int = 4,
                 creator: str | None = None):
        from .memory import CreatorMemory
        self.settings = settings or Settings()
        self.policy = policy or HeuristicPolicy()
        self.workers = max(1, workers)
        self.creator_id = creator
        # Creator Memory conditions the brand and format defaults (PRD 8).
        self.memory = CreatorMemory.load(creator) if creator else None
        self.brand = brand or (self.memory.effective_brand() if self.memory else Brand())

    def _write_status(self, job_dir: Path, state: str, *, stage: str | None = None,
                      detail: str | None = None, message: str | None = None,
                      manifest: Path | None = None) -> None:
        if state not in STATUS_STATES:
            raise ValueError(f"invalid job state: {state}")
        job_dir.mkdir(parents=True, exist_ok=True)
        status_path = job_dir / "status.json"
        previous = {}
        if status_path.exists():
            try:
                previous = json.loads(status_path.read_text(encoding="utf-8"))
            except (OSError, json.JSONDecodeError):
                previous = {}

        # Failure writers can omit the stage and retain the last durable pipeline
        # boundary. This is important when the CLI catches an exception outside run().
        if stage is None:
            prior_stage = previous.get("stage")
            stage = prior_stage if prior_stage in STATUS_STAGES else (
                "done" if state == "complete" else "resolve"
            )
        if stage not in STATUS_STAGES:
            raise ValueError(f"invalid job stage: {stage}")
        if detail is None and previous.get("stage") == stage:
            previous_detail = previous.get("detail")
            if isinstance(previous_detail, str):
                detail = previous_detail

        payload = {"state": state, "stage": stage, "creator_id": self.creator_id,
                   "updated": time.time()}
        if detail:
            payload["detail"] = detail
        if message:
            payload["message"] = message
        if manifest:
            payload["manifest"] = str(manifest)
        tmp = status_path.with_name(f".{status_path.name}.{uuid.uuid4().hex}.tmp")
        try:
            jdump(payload, tmp)
            replace_with_retry(tmp, status_path)
        finally:
            tmp.unlink(missing_ok=True)

    @staticmethod
    def _memory_manifest(reasoner: Reasoner) -> dict:
        if not isinstance(reasoner, MemoryReasoner):
            return {"enabled": False, "degraded": False,
                    "reason": None, "threads_considered": 0,
                    "callback_found": False, "callbacks_ranked_out": 0,
                    "callbacks_filtered_out": 0}
        return {
            "enabled": True,
            "degraded": bool(reasoner.memory_degraded),
            "reason": reasoner.memory_degradation_reason,
            "threads_considered": int(getattr(reasoner, "threads_considered", 0) or 0),
            "timings": dict(getattr(reasoner, "memory_timings", {}) or {}),
            # True only when a CLIPPED moment carries the callback. A callback that lost
            # the top-n cut is reported separately rather than silently claimed.
            "callback_found": bool(reasoner.callback_found),
            "callbacks_ranked_out": int(getattr(reasoner, "callbacks_ranked_out", 0) or 0),
            "callbacks_filtered_out": int(
                getattr(reasoner, "callbacks_filtered_out", 0) or 0
            ),
        }

    @staticmethod
    def _reconcile_memory_selection(reasoner: Reasoner, callbacks_before: int,
                                    final_moments: list[Moment]) -> None:
        """Make memory state describe the moments that survive post-ranking filters."""
        if not isinstance(reasoner, MemoryReasoner):
            return
        callbacks_after = sum(1 for moment in final_moments
                              if moment.signals.get("callback"))
        removed = max(0, callbacks_before - callbacks_after)
        reasoner.callback_found = callbacks_after > 0
        reasoner.callbacks_filtered_out = int(
            getattr(reasoner, "callbacks_filtered_out", 0) or 0
        ) + removed

    @staticmethod
    def _ablation_manifest(reasoner: Reasoner, *, transcript_available: bool) -> dict:
        from .baseline import unavailable_ablation
        if not transcript_available:
            return unavailable_ablation("transcript_unavailable")
        if not isinstance(reasoner, MemoryReasoner):
            return unavailable_ablation("memory_disabled")
        from copy import deepcopy
        return deepcopy(reasoner.ablation)

    @staticmethod
    def _job_message(memory: dict) -> str | None:
        if not memory.get("enabled"):
            return None
        if memory.get("degraded"):
            return f"Creator memory degraded: {memory.get('reason') or 'unknown reason'}"
        if not memory.get("callback_found"):
            filtered_out = memory.get("callbacks_filtered_out") or 0
            if filtered_out:
                return (f"No memory-dependent callback made the final cut. {filtered_out} "
                        f"callback moment(s) were removed by post-ranking safety filters. "
                        f"Showing highest-quality standalone clips.")
            ranked_out = memory.get("callbacks_ranked_out") or 0
            if ranked_out:
                return (f"No memory-dependent callback made this cut. {ranked_out} "
                        f"callback moment(s) scored below the clips returned - ask for "
                        f"more clips to include them. Showing highest-quality "
                        f"standalone clips.")
            return ("No memory-dependent callback found in this run. "
                    "Showing highest-quality standalone clips.")
        return None

    def run(self, url: str | None = None, *, local: str | None = None,
            info_json: str | None = None, vtt: str | None = None,
            footage_rights: str,
            platforms=("shorts",), n_clips=5, target=30.0, job_id=None,
            webhook: str | None = None) -> JobResult:
        if footage_rights not in FOOTAGE_RIGHTS:
            raise ValueError(
                f"footage_rights must be one of {sorted(FOOTAGE_RIGHTS)}"
            )
        job_id = job_id or f"job_{uuid.uuid4().hex[:10]}"
        job_dir = self.settings.workdir / job_id
        job_dir.mkdir(parents=True, exist_ok=True)
        timings, t_all = {}, time.time()
        log.info("=== job %s start (platforms=%s, n=%d) ===", job_id,
                 ",".join(platforms), n_clips)
        self._write_status(job_dir, "started", stage="resolve",
                           detail="Resolving source metadata and captions.",
                           message="Job started.")

        # ── stage 1: resolve (kilobytes)
        t0 = time.time()
        if local:
            src = from_local(local, vtt)
        elif info_json:
            src = from_info_json(info_json, vtt)
        elif url:
            src = TOOLS.call("resolve_source", url=url, settings=self.settings,
                             job_id=job_id)
        else:
            raise AfterplayError("need one of url=, local=, info_json=")
        timings["resolve"] = round(time.time() - t0, 2)

        # ── stage 2: understand (still kilobytes)
        self._write_status(job_dir, "running", stage="transcript",
                           detail="Reading captions or transcribing source audio.")
        t0 = time.time()
        words, sents, detector = [], [], "transcript"
        from .baseline import unavailable_ablation
        ablation = unavailable_ablation("transcript_unavailable")
        if src.vtt_path and Path(src.vtt_path).exists():
            words, sents = TOOLS.call("read_transcript", vtt_path=str(src.vtt_path))
        reasoner = self.policy.reasoner()
        ranking_detail = (
            "Ranking candidate moments with channel context."
            if isinstance(reasoner, MemoryReasoner)
            else "Ranking candidate moments without channel memory."
        )
        if sents:
            self._write_status(job_dir, "running", stage="memory",
                               detail=ranking_detail)
            moments = TOOLS.call("rank_moments", sents=sents, heatmap=src.heatmap,
                                 n=n_clips, target=target,
                                 reasoner=reasoner)
            ablation = self._ablation_manifest(reasoner, transcript_available=True)
        else:
            # No captions (gameplay, music, reaction content). The signal was never
            # words — fetch audio only (~5-15 MB, not ~200 MB) and score excitement
            # and transient density. Still no video bytes. Clips ship without burned
            # captions because there is no verified transcript to burn.
            log.info("no captions for this source -> audio path")
            from .audio import audio_moments, fetch_audio_only
            audio_path = (src.local_path if src.is_local else
                          fetch_audio_only(src.url, self.settings, job_dir / "audio"))
            # ASR first: a real transcript gives sentence-accurate cuts AND lets the
            # clips carry burned captions. Audio-energy is the fallback.
            try:
                from .asr import to_vtt, transcribe
                tr = transcribe(audio_path, language=self.settings.asr_language)
                words, sents = tr.words, tr.sents
                src.vtt_path = to_vtt(
                    words, job_dir / "asr.vtt", language=tr.language
                )
                src.transcript_language = tr.language
                src.transcript_source = "asr"
                src.subtitle_track = None
                detector = "asr:" + tr.model
                self._write_status(job_dir, "running", stage="memory",
                                   detail=ranking_detail)
                moments = TOOLS.call("rank_moments", sents=sents, heatmap=src.heatmap,
                                     n=n_clips, target=target,
                                     reasoner=reasoner)
                ablation = self._ablation_manifest(reasoner, transcript_available=True)
            except Exception as e:                            # noqa: BLE001
                log.info("ASR unavailable (%s) -> audio-energy detection", e)
                detector = "audio"
                self._write_status(job_dir, "running", stage="memory",
                                   detail="Ranking candidate moments from audio signals.")
                moments = audio_moments(audio_path, target=target, n=n_clips,
                                        duration=src.duration or None)
        callbacks_before_postfilters = sum(
            1 for moment in moments if moment.signals.get("callback")
        )
        # never clip a sponsor read; free, one HTTP call, a 404 means "none"
        from .insights import (Analytics, drop_sponsored, sponsor_segments,
                               video_id_from_url)
        vid = video_id_from_url(src.url or "")
        if vid:
            segs = sponsor_segments(vid)
            if segs:
                timings["sponsor_segments"] = len(segs)
                moments = drop_sponsored(moments, segs)
        # re-rank by this creator's own published performance, when there is history
        self.analytics = (Analytics(self.memory.creator_id) if self.memory else None)
        if self.analytics:
            moments = self.analytics.apply_to_moments(moments)
        self._reconcile_memory_selection(
            reasoner, callbacks_before_postfilters, moments
        )
        if not moments:
            raise AfterplayError("no clip-worthy moments found in this source")
        timings["understand"] = round(time.time() - t0, 2)
        timings["detector"] = detector
        log.info("decision phase [%s]: %d words, %d sentences, %d moments in %.2fs",
                 detector, len(words), len(sents), len(moments),
                 timings["resolve"] + timings["understand"])

        # ── stage 3 ref: what the extractor will range-fetch from
        self._write_status(job_dir, "running", stage="render",
                           detail="Cutting, reframing, captioning, and checking clips.")
        t0 = time.time()
        if src.is_local:
            src_ref = str(src.local_path)
        else:
            # Cache direct URLs in the job dir so a rehearsed demo can replay without
            # a live extraction (and without risking a bot check mid-run).
            src_ref = stream_urls(src.url, self.settings, cache_dir=job_dir)
        timings["stream_urls"] = round(time.time() - t0, 2)

        # ── stages 3-4: fan out one subagent per (moment x platform)
        t0 = time.time()
        jobs = []
        for i, m in enumerate(moments, 1):
            for pname in platforms:
                plat = PLATFORMS[pname]
                jobs.append((m, plat, f"clip{i:02d}_{pname}"))

        results: list[ClipResult] = []
        agent = ClipAgent(job_dir, src_ref, words, self.settings, self.brand, self.policy)
        with cf.ThreadPoolExecutor(max_workers=self.workers) as pool:
            futs = {pool.submit(agent.run, m, p, cid): (cid, m, p)
                    for m, p, cid in jobs}
            for fut in cf.as_completed(futs):
                try:
                    results.append(fut.result())
                except Exception as e:                       # noqa: BLE001
                    cid, moment, platform = futs[fut]
                    log.exception("subagent %s crashed", cid)
                    results.append(ClipResult(
                        clip_id=cid, platform=platform.name,
                        start=moment.start, end=moment.end, duration=moment.dur,
                        score=moment.score, why=moment.why, error=str(e),
                        text_for_copy=(moment.text or "")[:4000],
                        signals=dict(moment.signals or {}),
                        decision_window={"start": moment.start, "end": moment.end},
                    ))
        timings["produce"] = round(time.time() - t0, 2)
        timings["total"] = round(time.time() - t_all, 2)

        # per-platform copy for every clip that rendered. With no Anthropic client this
        # falls through to the OpenAI path inside generate_copy (same key and model as
        # the memory pass) — passing None here used to mean "raw transcript as a title".
        from .insights import generate_copy
        client = None
        if isinstance(self.policy, ClaudePolicy) and self.policy.available():
            try:
                client = self.policy.client()
            except Exception:                                 # noqa: BLE001
                client = None
        for r in results:
            if r.ok and r.text_for_copy:
                try:
                    r.copy = asdict(generate_copy(r.text_for_copy, r.platform,
                                                  client=client, title_hint=src.title))
                except Exception as e:                        # noqa: BLE001
                    log.warning("copy for %s failed: %s", r.clip_id, e)
        n_llm = sum(1 for r in results if r.copy.get("source") == "llm")
        n_copy = sum(1 for r in results if r.copy)
        if n_copy:
            log.info("copy: %d/%d from the LLM, %d heuristic", n_llm, n_copy,
                     n_copy - n_llm)
        results.sort(key=lambda r: (r.clip_id))
        memory_state = self._memory_manifest(reasoner)
        job = JobResult(job_id=job_id,
                        source={"url": src.url, "title": src.title,
                                "uploader": src.uploader, "duration": src.duration,
                                "local": str(src.local_path) if src.local_path else None,
                                 "transcript_language": src.transcript_language,
                                 "transcript_source": src.transcript_source,
                                 "subtitle_track": src.subtitle_track,
                                 "footage_rights": footage_rights},
                        creator_id=self.creator_id,
                        clips=results, timings=timings,
                        encoder=detect_encoder(self.settings),
                        heatmap_available=src.has_heatmap,
                        memory=memory_state,
                        ablation=ablation,
                        message=self._job_message(memory_state),
                        ok=any(r.ok for r in results))

        # write back to Creator Memory: corrections become learned defaults
        if self.memory:
            try:
                learned = self.memory.record_job(job)
                timings["memory"] = learned.get("stats", {}).get("qc_pass_rate")
                log.info("memory[%s] updated: %s", self.memory.creator_id, learned)
            except Exception as e:                            # noqa: BLE001
                log.warning("memory write failed (%s); job result is unaffected", e)

        # deliver: manifest next to the assets (PRD 13 job result shape)
        manifest = job_dir / "manifest.json"
        jdump(job.to_dict(), manifest)
        clips_ok = sum(1 for r in results if r.ok)
        self._write_status(job_dir, "complete", stage="done",
                           detail=f"{clips_ok}/{len(results)} clips passed quality checks.",
                           message=job.message, manifest=manifest)
        log.info("=== job %s done: %d/%d clips ok in %.1fs -> %s ===", job_id,
                 clips_ok, len(results), timings["total"],
                 manifest)
        if webhook:
            self._notify(webhook, job)
        return job

    @staticmethod
    def _notify(webhook: str, job: JobResult):
        """At-least-once webhook. Never raises: delivery failure must not fail a job."""
        import urllib.request
        try:
            body = json.dumps(job.to_dict(), default=str).encode()
            req = urllib.request.Request(webhook, data=body, method="POST",
                                         headers={"Content-Type": "application/json"})
            with urllib.request.urlopen(req, timeout=20) as r:
                log.info("webhook %s -> %s", webhook, r.status)
        except Exception as e:                                # noqa: BLE001
            log.warning("webhook delivery failed (%s); manifest is still on disk", e)
