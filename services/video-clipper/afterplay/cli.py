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
import os
import sys
import uuid
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
    job_id = a.job_id or f"job_{uuid.uuid4().hex[:10]}"
    try:
        job = orch.run(url=a.url, local=a.local, info_json=a.info_json, vtt=a.vtt,
                       footage_rights=a.rights,
                       platforms=plats, n_clips=a.clips, target=a.target,
                       job_id=job_id, webhook=a.webhook)
    except Exception as e:                                      # noqa: BLE001
        orch._write_status(settings.workdir / job_id, "failed",
                           message=f"{type(e).__name__}: {e}")
        raise

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
    from .resolve import from_info_json, from_local, resolve as resolve_url
    from .understand import parse_vtt, sentences

    if not a.creator:
        print("--creator is required", file=sys.stderr)
        return 2
    if not a.stream_id:
        print("--stream-id is required", file=sys.stderr)
        return 2

    vtt_path = Path(a.vtt) if a.vtt else None
    src = None
    if not vtt_path and a.info_json:
        vtt_path = from_info_json(a.info_json).vtt_path
        src = from_info_json(a.info_json)
    if not vtt_path and a.url:
        # Per-stream job id: a fixed "backfill" made every run overwrite the previous
        # one's info.json and captions, so nothing was inspectable or re-runnable and
        # the resolved artifacts could not be cached for an offline demo.
        src = resolve_url(a.url, Settings(), job_id=f"backfill_{a.stream_id}")
        vtt_path = src.vtt_path
    if not vtt_path and a.local:
        src = from_local(a.local, a.vtt)
        vtt_path = src.vtt_path

    if vtt_path:
        words = parse_vtt(vtt_path.read_text(encoding="utf-8"))
        sents = sentences(words)
    elif src:
        try:
            from .audio import fetch_audio_only
            from .asr import ASRUnavailable, to_vtt, transcribe
            backfill_root = Settings().workdir / "backfill" / a.creator / a.stream_id
            backfill_root.mkdir(parents=True, exist_ok=True)
            audio_path = src.local_path if src.is_local else fetch_audio_only(src.url, Settings(), backfill_root / "audio")
            tr = transcribe(audio_path)
            to_vtt(tr.words, backfill_root / "asr.vtt")
            sents = tr.sents
        except ASRUnavailable as e:
            print("backfill needs captions or ASR; faster-whisper could not transcribe "
                  f"this source: {e}. Install faster-whisper and set "
                  "AFTERPLAY_WHISPER_SIZE or AFTERPLAY_WHISPER_MODEL.",
                  file=sys.stderr)
            return 2
        except Exception as e:
            print(f"backfill needs captions or ASR; ASR failed: {e}", file=sys.stderr)
            return 2
    else:
        print("backfill requires captions via --vtt, --info-json, a URL with captions, or --local source",
              file=sys.stderr)
        return 2

    memory = ChannelMemory(a.creator)
    extracted = memory.backfill(a.stream_id, sents)
    counts = getattr(
        memory,
        "verification_counts",
        {"verified": len(extracted), "repaired": 0, "unverified": 0},
    )
    out = {"creator": a.creator, "stream_id": a.stream_id,
           "threads_suggested": len(extracted),
           "threads_added": counts["verified"],
           "citations_repaired": counts["repaired"],
           "citations_rejected": counts["unverified"],
           "path": str(memory.path)}
    print(json.dumps(out, indent=2))
    return 0


def cmd_predemo(a) -> int:
    """Warm-up step: cache every demo stream, then report offline readiness.

    Exit codes: 0 ready, 3 partially ready (some streams cannot run offline)."""
    from .predemo import cache_root, prepare

    local = {}
    for pair in a.local:
        sid, _, path = pair.partition("=")
        if sid and path:
            local[sid] = path

    report = prepare(a.streams, Settings(), local_media=local, refresh=a.refresh)

    if a.json:
        print(json.dumps(report.to_dict(), indent=2))
    else:
        print(f"cache: {cache_root()}")
        for s in report.streams:
            marks = []
            marks.append("metadata" if s.cached_metadata else "NO metadata")
            marks.append("captions" if s.cached_captions else "NO captions")
            if s.local_media:
                marks.append("local media")
            elif s.stream_urls_age_h is not None:
                marks.append(f"urls {s.stream_urls_age_h:.1f}h old")
            state = "READY" if s.offline_ready else "NOT READY"
            print(f"  [{state:9}] {s.stream_id}: {', '.join(marks)}")
            if s.error:
                print(f"                {s.error}")
            if s.offline_ready and not s.render_ready:
                print("                decide-phase only; rendering still needs a live "
                      "resolve or --local media")
        print()
        print("ready for an offline demo" if report.ok else
              "NOT ready: re-run the cache step, or supply --local media")
    return 0 if report.ok else 3


def cmd_doctor(a) -> int:
    """Verify the environment before anyone waits on a job."""
    from .core import ffmpeg_bin
    from .asr import available as asr_available
    rows = []
    import os
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
    rows.append(("faster_whisper", "ok" if asr_available() else "missing"))
    if os.environ.get("OPENAI_API_KEY"):
        try:
            from .channel_memory import clipper_model, embed_texts, openai_client
            embed_texts(["afterplay doctor embedding preflight"])
            openai_client().responses.create(
                model=clipper_model(),
                input="Return the word ok.",
                max_output_tokens=8,
                store=False,
            )
            rows.append(("openai_memory_preflight", "ok"))
        except Exception as e:                                  # noqa: BLE001
            rows.append(("openai_memory_preflight", f"FAIL: {type(e).__name__}: {e}"))
    else:
        rows.append(("openai_memory_preflight", "skipped: OPENAI_API_KEY unset"))
    s = Settings()
    rows.append(("workdir", str(s.workdir)))
    rows.append(("outdir", str(s.outdir)))
    for k, v in rows:
        print(f"{k:20s} {v}")
    return 0 if not any("FAIL" in str(v) or "MISSING" in str(v) for _, v in rows) else 2


def cmd_results(a) -> int:
    """Record result rows into the analytics store.

    Accepts JSON or CSV. CSV matters because it is the shape a creator actually has:
    YouTube Studio exports analytics as CSV, so this is the route by which *real*
    published performance — rather than hand-authored numbers — reaches the ranking
    priors. `Analytics.ingest_csv` already existed but was unreachable from the CLI.
    """
    from .insights import Analytics
    path = Path(a.input)
    if not path.exists():
        print(f"results file not found: {a.input}", file=sys.stderr)
        return 2

    analytics = Analytics(a.creator)
    if path.suffix.lower() == ".csv":
        try:
            records = analytics.ingest_csv(path)
        except Exception as e:                                  # noqa: BLE001
            print(f"could not read CSV results: {e}", file=sys.stderr)
            return 2
    else:
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
        except Exception as e:                                  # noqa: BLE001
            print(f"results input is not valid JSON: {e}", file=sys.stderr)
            return 2
        rows = payload if isinstance(payload, list) else [payload]
        records = 0
        for row in rows:
            if isinstance(row, dict):
                analytics.record_metric(row)
                records += 1

    # Metrics only become priors once they join a recorded post, so report the join
    # count too: "3 rows in, 0 attributed" is the difference between a bad file and
    # metrics for posts this creator never published through the pipeline.
    attributed = len(analytics.attribute())
    priors = analytics.compute_priors(min_samples=a.min_samples)
    out = {"creator": a.creator, "records": records, "attributed": attributed,
           "compute_priors": priors}
    if a.json:
        print(json.dumps(out, indent=2))
    else:
        print(f"wrote {records} rows for {a.creator} ({attributed} attributed to posts)")
        print(f"priors: {priors}")
    return 0


def main(argv=None) -> int:
    p = argparse.ArgumentParser("afterplay", description="autonomous short-form clipper")
    p.add_argument("--verbose", "-v", action="store_true")
    p.add_argument("--json", action="store_true", help="machine-readable output")

    # Ingestion auth and pacing. YouTube rate-limits anonymous extraction and then
    # answers everything with "Sign in to confirm you're not a bot"; these restore a
    # session or keep a batch under the threshold. Env equivalents:
    # AFTERPLAY_COOKIES / AFTERPLAY_COOKIES_FROM_BROWSER / AFTERPLAY_SLEEP_INTERVAL.
    p.add_argument("--cookies", help="path to a cookies.txt for extraction")
    p.add_argument("--cookies-from-browser", dest="cookies_from_browser",
                   help="read cookies from a browser (chrome/firefox/edge). "
                        "The browser must be CLOSED: it locks its cookie DB.")
    p.add_argument("--sleep-interval", dest="sleep_interval", type=float,
                   help="seconds to wait between extractions (batch backfills)")
    p.add_argument("--extractor-args", dest="extractor_args",
                   help="yt-dlp extractor args, e.g. youtube:player_client=android")

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
    sp.add_argument("--creator", required=True, help="creator id and manifest owner")
    sp.add_argument("--workers", type=int, default=4)
    sp.add_argument("--max-repairs", dest="max_repairs", type=int, default=3)
    sp.add_argument("--encoder", help="force an encoder (default: auto-detect)")
    sp.add_argument("--watermark", help="PNG to overlay")
    sp.add_argument("--job-id", dest="job_id")
    sp.add_argument("--webhook", help="POST the manifest here on completion")
    sp.add_argument("--memory", action="store_true",
                    help="use OpenAI creator-memory callback detection")
    sp.add_argument("--rights", required=True,
                    choices=["project_owned", "creator_owned", "permission_granted",
                             "licensed", "not_cleared"],
                    help="explicit footage-rights attestation for the output manifest")
    sp.set_defaults(fn=cmd_run)

    sp = sub.add_parser("backfill", help="extract callback memory from a past stream")
    sp.add_argument("url", nargs="?")
    sp.add_argument("--info-json", dest="info_json", help="replay a saved info.json")
    sp.add_argument("--vtt", help="caption file to use")
    sp.add_argument("--local", help="ingest a local file (creator-owned path)")
    sp.add_argument("--creator", required=True, help="creator id for local JSON memory")
    sp.add_argument("--stream-id", required=True, help="stable id for this source stream")
    sp.set_defaults(fn=cmd_backfill)

    sp = sub.add_parser("memory", help="inspect local creator memory")
    sp.add_argument("creator")
    sp.set_defaults(fn=cmd_memory)

    sp = sub.add_parser("doctor", help="check the environment")
    sp.set_defaults(fn=cmd_doctor)

    sp = sub.add_parser("results", help="record per-post metrics into the analytics memory store")
    sp.add_argument("--creator", required=True, help="creator id for analytics memory")
    sp.add_argument("--input", required=True,
                help="JSON payload, or a .csv analytics export (e.g. from YouTube Studio)")
    sp.add_argument("--min-samples", type=int, default=3, help="minimum samples before priors are ready")
    sp.set_defaults(fn=cmd_results)

    sp = sub.add_parser("predemo", help="cache demo streams and check offline readiness")
    sp.add_argument("streams", nargs="+", help="video ids or URLs to cache")
    sp.add_argument("--local", action="append", default=[], metavar="ID=PATH",
                    help="map a stream id to local media (the only render-safe offline path)")
    sp.add_argument("--no-refresh", dest="refresh", action="store_false",
                    help="keep existing cache; do not re-resolve")
    sp.set_defaults(fn=cmd_predemo)

    a = p.parse_args(argv)
    _log(a.verbose, a.json)

    # Publish ingestion flags as env before anything constructs Settings(), so every
    # extraction path picks them up without threading a Settings object through every
    # call. Explicit flags win over the environment.
    for flag, env in (("cookies", "AFTERPLAY_COOKIES"),
                      ("cookies_from_browser", "AFTERPLAY_COOKIES_FROM_BROWSER"),
                      ("sleep_interval", "AFTERPLAY_SLEEP_INTERVAL"),
                      ("extractor_args", "AFTERPLAY_EXTRACTOR_ARGS")):
        value = getattr(a, flag, None)
        if value is not None:
            os.environ[env] = str(value)

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
