"""MCP server — exposes Afterplay to any MCP client (Claude Desktop, Claude Code, …).

Why this is worth having: the decision phase is cheap and genuinely useful on its own.
Being able to ask an assistant "what are the five best clips in this video, and why"
without leaving the chat is the highest-value slice of the product, and it costs one
thin adapter over the tools that already exist.

Run:
    python -m afterplay.mcp_server                 # stdio transport

Register (Claude Desktop / Code, mcpServers block):
    {"afterplay": {"command": "/path/.venv/bin/python",
                   "args": ["-m", "afterplay.mcp_server"]}}

Design notes:
* Every tool returns JSON text — MCP clients render it, and models parse it.
* `plan_clips` touches no video bytes; `make_clips` is the expensive one and says so in
  its description, so a model does not reach for it casually.
* Errors come back as readable text, never a traceback: a crashed tool call is a dead
  end for the client, a message is something it can act on.
"""
from __future__ import annotations

import json
import logging
import sys
from pathlib import Path

log = logging.getLogger("afterplay.mcp")


def _json(obj) -> str:
    return json.dumps(obj, indent=2, default=str)


# ── the tool implementations (transport-independent, so they are testable) ────

def tool_plan_clips(url: str = "", local: str = "", vtt: str = "", clips: int = 5,
                    target: float = 30.0) -> str:
    """Rank clip-worthy moments. Cheap: metadata + transcript only, no video."""
    from .core import Settings
    from .resolve import from_info_json, from_local, resolve as resolve_url
    from .understand import parse_vtt, rank, sentences
    from .insights import sponsor_segments, video_id_from_url, drop_sponsored

    s = Settings()
    if local:
        src = from_local(local, vtt or None)
    elif url.endswith(".info.json"):
        src = from_info_json(url, vtt or None)
    elif url:
        src = resolve_url(url, s, job_id="mcp_plan")
    else:
        return _json({"error": "provide url= or local="})

    if not src.vtt_path or not Path(src.vtt_path).exists():
        from .audio import audio_moments, fetch_audio_only
        if src.is_local:
            ms = audio_moments(src.local_path, target=target, n=clips)
        else:
            ap = fetch_audio_only(src.url, s, s.workdir / "mcp_audio")
            ms = audio_moments(ap, target=target, n=clips, duration=src.duration)
        detector = "audio"
    else:
        words = parse_vtt(Path(src.vtt_path).read_text(encoding="utf-8"))
        ms = rank(sentences(words), src.heatmap, target=target, n=clips)
        detector = "transcript"

    vid = video_id_from_url(src.url or "")
    if vid:
        ms = drop_sponsored(ms, sponsor_segments(vid))

    return _json({
        "source": {"title": src.title, "duration": src.duration, "url": src.url},
        "detector": detector, "heatmap_available": src.has_heatmap,
        "clips": [{"start": round(m.start, 2), "end": round(m.end, 2),
                   "duration": round(m.dur, 2), "score": round(m.score, 3),
                   "why": m.why, "text": m.text[:300]} for m in ms]})


def tool_make_clips(url: str = "", local: str = "", vtt: str = "", clips: int = 3,
                    platforms: str = "shorts", creator: str = "", workers: int = 4,
                    target: float = 30.0, rights: str = "") -> str:
    """Render finished clips. EXPENSIVE: fetches video ranges and encodes. Minutes."""
    from .agent import HeuristicPolicy, Orchestrator
    from .core import PLATFORMS, Settings
    from .agent import FOOTAGE_RIGHTS
    if not creator:
        return _json({"error": "creator is required for manifest v2"})
    if rights not in FOOTAGE_RIGHTS:
        return _json({"error": "rights must be an explicit valid footage-rights status",
                      "known": sorted(FOOTAGE_RIGHTS)})
    plats = [p.strip() for p in platforms.split(",") if p.strip()]
    bad = [p for p in plats if p not in PLATFORMS]
    if bad:
        return _json({"error": f"unknown platforms {bad}", "known": sorted(PLATFORMS)})
    orch = Orchestrator(settings=Settings(), policy=HeuristicPolicy(),
                        workers=workers, creator=creator or None)
    job = orch.run(url=url or None, local=local or None, vtt=vtt or None,
                   footage_rights=rights,
                   platforms=plats, n_clips=clips, target=target)
    return _json({"job_id": job.job_id, "ok": job.ok, "timings": job.timings,
                  "encoder": job.encoder,
                  "clips": [{"clip_id": c.clip_id, "platform": c.platform,
                             "start": round(c.start, 2), "duration": round(c.duration, 2),
                             "ok": c.ok, "path": c.path, "attempts": c.attempts,
                             "repairs": c.repairs, "error": c.error}
                            for c in job.clips]})


def tool_inspect_clip(path: str) -> str:
    """Measure a rendered clip: geometry, frames, subject framing, audio, hook."""
    from .core import PLATFORMS, probe
    from .qc import run_qc
    p = Path(path)
    if not p.exists():
        return _json({"error": f"{path} not found"})
    mi = probe(p)
    plat = next((x for x in PLATFORMS.values()
                 if (x.width, x.height) == (mi.width, mi.height)), PLATFORMS["shorts"])
    rep = run_qc(p, plat, mi.duration)
    return _json({"path": str(p), "geometry": [mi.width, mi.height],
                  "duration": round(mi.duration, 2), "has_audio": mi.has_audio,
                  "matched_platform": plat.name, "qc": rep.to_dict(),
                  "summary": rep.summary()})


def tool_creator_report(creator: str) -> str:
    """Memory + analytics for one creator: learned prefs, QC stats, top clips."""
    from .insights import Analytics
    from .memory import CreatorMemory
    m = CreatorMemory.load(creator)
    a = Analytics(creator)
    return _json({"creator": creator, "stats": m.stats, "prefs": m.prefs.__dict__,
                  "explicit_pins": m.explicit,
                  "recent_corrections": m.corrections[-5:],
                  "analytics": a.report()})


def tool_transcribe(audio_or_video: str, language: str = "") -> str:
    """Transcribe with Whisper and return word-level timings (needs model weights)."""
    from .asr import ASRUnavailable, transcribe
    try:
        t = transcribe(audio_or_video, language=language or None)
    except ASRUnavailable as e:
        return _json({"error": str(e), "hint": "set AFTERPLAY_WHISPER_MODEL to a local "
                                               "CTranslate2 model directory"})
    return _json({"language": t.language, "confidence": round(t.language_prob, 3),
                  "words": len(t.words), "wpm": round(t.wpm), "model": t.model,
                  "seconds": round(t.seconds, 1),
                  "sentences": [{"start": round(s.start, 2), "end": round(s.end, 2),
                                 "text": s.text} for s in t.sents[:80]]})


TOOL_SPECS = [
    {"name": "plan_clips",
     "description": "Rank the most clip-worthy moments in a video. CHEAP: reads only "
                    "metadata, captions and (if there are none) the audio track — no "
                    "video is downloaded. Use this to answer 'what should I clip'.",
     "fn": tool_plan_clips,
     "schema": {"type": "object", "properties": {
         "url": {"type": "string", "description": "video URL, or a saved .info.json"},
         "local": {"type": "string", "description": "path to a local video file"},
         "vtt": {"type": "string", "description": "optional caption file"},
         "clips": {"type": "integer", "default": 5},
         "target": {"type": "number", "description": "clip length in seconds",
                    "default": 30}}}},
    {"name": "make_clips",
     "description": "Render finished vertical clips with reframing, word-level captions "
                    "and QC. EXPENSIVE: fetches video ranges and encodes; takes "
                    "minutes. Call plan_clips first and only call this when the user "
                    "wants actual files.",
     "fn": tool_make_clips,
     "schema": {"type": "object", "properties": {
         "url": {"type": "string"}, "local": {"type": "string"},
         "vtt": {"type": "string"}, "clips": {"type": "integer", "default": 3},
         "platforms": {"type": "string",
                       "description": "comma-separated: shorts,reels,tiktok,linkedin,x",
                       "default": "shorts"},
         "creator": {"type": "string", "description": "creator id for memory"},
          "rights": {"type": "string",
                     "enum": ["project_owned", "creator_owned", "permission_granted",
                              "licensed", "not_cleared"],
                     "description": "explicit footage-rights attestation"},
          "workers": {"type": "integer", "default": 4},
          "target": {"type": "number", "default": 30}},
       "required": ["creator", "rights"]}},
    {"name": "inspect_clip",
     "description": "Measure a rendered clip file: geometry, black/frozen frames, "
                    "subject framing, caption safe zone, audio loudness and hook.",
     "fn": tool_inspect_clip,
     "schema": {"type": "object", "properties": {"path": {"type": "string"}},
                "required": ["path"]}},
    {"name": "creator_report",
     "description": "What the system has learned about a creator: brand and format "
                    "preferences, corrections log, QC pass rates, and performance "
                    "priors from published clips.",
     "fn": tool_creator_report,
     "schema": {"type": "object", "properties": {"creator": {"type": "string"}},
                "required": ["creator"]}},
    {"name": "transcribe",
     "description": "Transcribe an audio or video file to word-level timings using "
                    "Whisper. Requires model weights to be available locally.",
     "fn": tool_transcribe,
     "schema": {"type": "object", "properties": {
         "audio_or_video": {"type": "string"}, "language": {"type": "string"}},
         "required": ["audio_or_video"]}},
]


def specs() -> list[dict]:
    """Tool definitions without the callables — used by tests and for registration."""
    return [{k: v for k, v in t.items() if k != "fn"} for t in TOOL_SPECS]


def call(name: str, **kw) -> str:
    for t in TOOL_SPECS:
        if t["name"] == name:
            try:
                return t["fn"](**kw)
            except Exception as e:                            # noqa: BLE001
                log.exception("mcp tool %s failed", name)
                return _json({"error": f"{type(e).__name__}: {e}"})
    return _json({"error": f"unknown tool {name!r}",
                  "available": [t["name"] for t in TOOL_SPECS]})


# ── transport ────────────────────────────────────────────────────────────────

def main() -> int:
    logging.basicConfig(level=logging.INFO, stream=sys.stderr,
                        format="%(asctime)s %(levelname)s %(name)s %(message)s")
    try:
        from mcp.server.fastmcp import FastMCP
    except ImportError:
        print("the 'mcp' package is required for the server transport:\n"
              "    pip install 'mcp[cli]'\n"
              "The tools themselves are importable without it "
              "(afterplay.mcp_server.call).", file=sys.stderr)
        return 2

    app = FastMCP("afterplay")

    @app.tool(description=TOOL_SPECS[0]["description"])
    def plan_clips(url: str = "", local: str = "", vtt: str = "", clips: int = 5,
                   target: float = 30.0) -> str:
        return tool_plan_clips(url, local, vtt, clips, target)

    @app.tool(description=TOOL_SPECS[1]["description"])
    def make_clips(url: str = "", local: str = "", vtt: str = "", clips: int = 3,
                   platforms: str = "shorts", creator: str = "", workers: int = 4,
                   target: float = 30.0) -> str:
        return tool_make_clips(url, local, vtt, clips, platforms, creator, workers,
                               target)

    @app.tool(description=TOOL_SPECS[2]["description"])
    def inspect_clip(path: str) -> str:
        return tool_inspect_clip(path)

    @app.tool(description=TOOL_SPECS[3]["description"])
    def creator_report(creator: str) -> str:
        return tool_creator_report(creator)

    @app.tool(description=TOOL_SPECS[4]["description"])
    def transcribe(audio_or_video: str, language: str = "") -> str:
        return tool_transcribe(audio_or_video, language)

    log.info("afterplay MCP server ready (%d tools, stdio)", len(TOOL_SPECS))
    app.run()
    return 0


if __name__ == "__main__":
    sys.exit(main())
