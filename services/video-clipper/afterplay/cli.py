"""Headless CLI. No prompts, no TTY assumptions, machine-readable output.

    afterplay run <url> --platforms shorts,reels --clips 5 --creator ksi
    afterplay run --local video.mp4 --vtt subs.vtt
    afterplay plan <url>                 # decision phase only, no video touched
    afterplay memory <creator_id>        # inspect the local JSON memory

Exit codes: 0 all clips ok, 3 partial, 4 no clips produced, 2 usage/other error.
"""
from __future__ import annotations

import argparse
import json
import logging
import sys
from pathlib import Path

from .core import Brand, PLATFORMS, Settings, detect_encoder
from .agent import ClaudePolicy, HeuristicPolicy, MemoryPolicy, Orchestrator


def _log(verbose: bool, as_json: bool):
    lvl = logging.DEBUG if verbose else logging.INFO
    fmt = ("%(asctime)s %(levelname)s %(name)s %(message)s" if not as_json
           else "%(message)s")
    logging.basicConfig(level=lvl, format=fmt, stream=sys.stderr)
    logging.getLogger("afterplay").setLevel(lvl)


def cmd_plan(a) -> int:
    """Decision phase only: prove what it costs before spending a single video byte."""
    import time
    # import by name: `afterplay.resolve` the function shadows the submodule
    from .resolve import from_info_json, resolve as resolve_url
    from .understand import parse_vtt, sentences
    from .agent import TOOLS, ClaudePolicy, HeuristicPolicy

    s = Settings()
    t0 = time.time()
    if a.info_json:
        src = from_info_json(a.info_json, a.vtt)
    else:
        if not a.url:
            print("need a URL or --info-json", file=sys.stderr)
            return 2
        src = resolve_url(a.url, s, job_id="plan")
    if not src.vtt_path:
        print("no captions available for this source", file=sys.stderr)
        return 2
    words = parse_vtt(Path(src.vtt_path).read_text(encoding="utf-8"))
    sents = sentences(words)
    policy = ClaudePolicy() if a.llm else HeuristicPolicy()
    moments = TOOLS.call("rank_moments", sents=sents, heatmap=src.heatmap,
                         n=a.clips, target=a.target, reasoner=policy.reasoner())
    elapsed = time.time() - t0

    out = {"source": {"url": src.url, "title": src.title, "uploader": src.uploader,
                      "duration": src.duration, "views": src.view_count},
           "heatmap_available": src.has_heatmap,
           "transcript": {"words": len(words), "sentences": len(sents)},
           "decision_seconds": round(elapsed, 2),
           "clips": [{"start": round(m.start, 2), "end": round(m.end, 2),
                      "duration": round(m.dur, 2), "score": round(m.score, 3),
                      "why": m.why, "text": m.text[:400]} for m in moments]}
    if a.json:
        print(json.dumps(out, indent=2))
    else:
        print(f"{src.title}  ({src.duration/60:.1f} min, {src.view_count:,} views)")
        print(f"heatmap: {'yes' if src.has_heatmap else 'ABSENT -> cold-start signals'}"
              f"   transcript: {len(words)} words / {len(sents)} sentences")
        for i, m in enumerate(moments, 1):
            mm, ss = divmod(int(m.start), 60)
            print(f"\nCLIP {i}  {mm}:{ss:02d}  [{m.start:.1f}-{m.end:.1f}] "
                  f"{m.dur:.1f}s  score {m.score:.2f}\n  {m.why}\n  \"{m.text[:180]}\"")
        print(f"\ndecision phase: {elapsed:.2f}s")
    return 0


def cmd_run(a) -> int:
    settings = Settings(max_repair_attempts=a.max_repairs)
    if a.encoder:
        settings.encoder = a.encoder
    brand = None
    if a.watermark:
        brand = Brand(watermark=a.watermark)
    if a.memory:
        if not a.creator:
            print("--memory requires --creator", file=sys.stderr)
            return 2
        policy = MemoryPolicy(a.creator)
    else:
        policy = ClaudePolicy() if a.llm else HeuristicPolicy()
    if a.llm and not a.memory and not policy.available():
        logging.getLogger("afterplay").warning(
            "--llm given but ANTHROPIC_API_KEY is unset; using heuristic policy")

    plats = [p.strip() for p in a.platforms.split(",") if p.strip()]
    bad = [p for p in plats if p not in PLATFORMS]
    if bad:
        print(f"unknown platform(s): {bad}; known: {sorted(PLATFORMS)}", file=sys.stderr)
        return 2

    orch = Orchestrator(settings=settings, brand=brand, policy=policy,
                        workers=a.workers, creator=a.creator)
    job = orch.run(url=a.url, local=a.local, info_json=a.info_json, vtt=a.vtt,
                   platforms=plats, n_clips=a.clips, target=a.target,
                   job_id=a.job_id, webhook=a.webhook)

    if a.json:
        print(json.dumps(job.to_dict(), indent=2, default=str))
    else:
        ok = sum(1 for c in job.clips if c.ok)
        print(f"\njob {job.job_id}: {ok}/{len(job.clips)} clips ok "
              f"in {job.timings['total']:.1f}s  (encoder {job.encoder})")
        print(f"timings: {job.timings}")
        for c in job.clips:
            flag = "ok " if c.ok else "FAIL"
            print(f"  [{flag}] {c.clip_id:20s} {c.start:7.1f}s +{c.duration:5.1f}s "
                  f"attempts={c.attempts} repairs={','.join(c.repairs) or '-'}")
            if c.error:
                print(f"         {c.error[:160]}")
            if c.path:
                print(f"         {c.path}")
    ok = sum(1 for c in job.clips if c.ok)
    return 0 if ok == len(job.clips) else (3 if ok else 4)


def cmd_memory(a) -> int:
    from .memory import CreatorMemory, memory_root
    m = CreatorMemory.load(a.creator)
    print(json.dumps({"creator": m.creator_id, "root": str(memory_root() / m.creator_id),
                      "stats": m.stats, "prefs": m.prefs.__dict__,
                      "brand": m.brand.__dict__, "explicit": m.explicit,
                      "corrections": len(m.corrections),
                      "recent_corrections": m.corrections[-5:]},
                     indent=2, default=str))
    return 0


def cmd_backfill(a) -> int:
    from .channel_memory import ChannelMemory
    from .resolve import from_info_json, resolve as resolve_url
    from .understand import parse_vtt, sentences

    if not a.creator:
        print("--creator is required", file=sys.stderr)
        return 2
    if not a.stream_id:
        print("--stream-id is required", file=sys.stderr)
        return 2

    vtt_path = Path(a.vtt) if a.vtt else None
    if not vtt_path and a.info_json:
        vtt_path = from_info_json(a.info_json).vtt_path
    if not vtt_path and a.url:
        src = resolve_url(a.url, Settings(), job_id="backfill")
        vtt_path = src.vtt_path
    if not vtt_path or not vtt_path.exists():
        print("backfill requires captions via --vtt, --info-json, or a URL with captions",
              file=sys.stderr)
        return 2

    words = parse_vtt(vtt_path.read_text(encoding="utf-8"))
    sents = sentences(words)
    memory = ChannelMemory(a.creator)
    extracted = memory.backfill(a.stream_id, sents)
    out = {"creator": a.creator, "stream_id": a.stream_id,
           "threads_added": len(extracted), "path": str(memory.path)}
    print(json.dumps(out, indent=2))
    return 0


def cmd_doctor(a) -> int:
    """Verify the environment before anyone waits on a job."""
    from .core import ffmpeg_bin
    rows = []
    try:
        rows.append(("ffmpeg", ffmpeg_bin()))
        rows.append(("encoder", detect_encoder(Settings())))
    except Exception as e:                                    # noqa: BLE001
        rows.append(("ffmpeg", f"FAIL: {e}"))
    for mod in ("cv2", "numpy", "yt_dlp"):
        try:
            m = __import__(mod)
            rows.append((mod, getattr(m, "__version__", "ok")))
        except Exception as e:                                # noqa: BLE001
            rows.append((mod, f"MISSING: {e}"))
    import os
    rows.append(("ANTHROPIC_API_KEY", "set" if os.environ.get("ANTHROPIC_API_KEY") else "unset"))
    rows.append(("OPENAI_API_KEY", "set" if os.environ.get("OPENAI_API_KEY") else "unset"))
    s = Settings()
    rows.append(("workdir", str(s.workdir)))
    rows.append(("outdir", str(s.outdir)))
    for k, v in rows:
        print(f"{k:20s} {v}")
    return 0 if not any("FAIL" in str(v) or "MISSING" in str(v) for _, v in rows) else 2


def main(argv=None) -> int:
    p = argparse.ArgumentParser("afterplay", description="autonomous short-form clipper")
    p.add_argument("--verbose", "-v", action="store_true")
    p.add_argument("--json", action="store_true", help="machine-readable output")
    sub = p.add_subparsers(dest="cmd", required=True)

    def common(sp):
        sp.add_argument("url", nargs="?")
        sp.add_argument("--local", help="ingest a local file (creator-owned path)")
        sp.add_argument("--info-json", dest="info_json", help="replay a saved info.json")
        sp.add_argument("--vtt", help="caption file to use")
        sp.add_argument("--clips", type=int, default=5)
        sp.add_argument("--target", type=float, default=30.0, help="clip length (s)")
        sp.add_argument("--llm", action="store_true",
                        help="use the Anthropic policy (ranking + vision QC)")

    sp = sub.add_parser("plan", help="decision phase only (no video bytes)")
    common(sp)
    sp.set_defaults(fn=cmd_plan)

    sp = sub.add_parser("run", help="full pipeline: extract, render, QC, deliver")
    common(sp)
    sp.add_argument("--platforms", default="shorts")
    sp.add_argument("--creator", help="creator id for local JSON memory")
    sp.add_argument("--workers", type=int, default=4)
    sp.add_argument("--max-repairs", dest="max_repairs", type=int, default=3)
    sp.add_argument("--encoder", help="force an encoder (default: auto-detect)")
    sp.add_argument("--watermark", help="PNG to overlay")
    sp.add_argument("--job-id", dest="job_id")
    sp.add_argument("--webhook", help="POST the manifest here on completion")
    sp.add_argument("--memory", action="store_true",
                    help="use OpenAI creator-memory callback detection")
    sp.set_defaults(fn=cmd_run)

    sp = sub.add_parser("backfill", help="extract callback memory from a past stream")
    sp.add_argument("url", nargs="?")
    sp.add_argument("--info-json", dest="info_json", help="replay a saved info.json")
    sp.add_argument("--vtt", help="caption file to use")
    sp.add_argument("--creator", required=True, help="creator id for local JSON memory")
    sp.add_argument("--stream-id", required=True, help="stable id for this source stream")
    sp.set_defaults(fn=cmd_backfill)

    sp = sub.add_parser("memory", help="inspect local creator memory")
    sp.add_argument("creator")
    sp.set_defaults(fn=cmd_memory)

    sp = sub.add_parser("doctor", help="check the environment")
    sp.set_defaults(fn=cmd_doctor)

    a = p.parse_args(argv)
    _log(a.verbose, a.json)
    try:
        return a.fn(a)
    except KeyboardInterrupt:
        return 130
    except Exception as e:                                    # noqa: BLE001
        logging.getLogger("afterplay").exception("fatal")
        print(f"error: {type(e).__name__}: {e}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())
