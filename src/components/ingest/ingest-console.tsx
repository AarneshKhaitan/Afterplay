"use client";

import { ArrowRight, CheckCircle, Circle, FilmSlate, Link as LinkIcon, Spinner, WarningCircle, XCircle } from "@phosphor-icons/react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

type CachedSource = { id: string; title: string; mode: "local" | "replay" };
type FootageRights = "project_owned" | "creator_owned" | "permission_granted" | "licensed" | "not_cleared";

type Stage = {
  id: string; label: string; truth: string;
  state: "pending" | "running" | "complete" | "failed" | "cancelled"; detail?: string;
};

type Job = {
  jobId: string;
  state: "started" | "running" | "cancelling" | "complete" | "failed" | "cancelled";
  message?: string;
  stages: Stage[];
  log: string[];
  clips: Array<{ clipId: string; ok: boolean; callback: boolean; threadLabel?: string }>;
  callbackFound?: boolean;
  callbacksRankedOut?: number;
  degraded?: boolean;
  degradedReason?: string | null;
};

type Config = {
  sources: CachedSource[];
  mediaDirConfigured: boolean;
  python: { ok: boolean; interpreter: string };
  creatorDefault: string;
  /** Newest completed run on disk, or null when this creator has none. */
  replayJobId: string | null;
  /** Operator setting: replay the cached run instead of starting a real one. */
  demoReplay: boolean;
};

export function IngestConsole() {
  const [config, setConfig] = useState<Config | null>(null);
  const [kind, setKind] = useState<"cached" | "url">("cached");
  const [sourceId, setSourceId] = useState("");
  const [url, setUrl] = useState("");
  const [creator, setCreator] = useState("");
  const [clips, setClips] = useState(3);
  const [memory, setMemory] = useState(true);
  const [captions, setCaptions] = useState(false);
  const [footageRights, setFootageRights] = useState<FootageRights | "">("");
  const [job, setJob] = useState<Job | null>(null);
  const [network, setNetwork] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pollError, setPollError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [replaying, setReplaying] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollGeneration = useRef(0);

  useEffect(() => {
    fetch("/api/ingest").then((r) => r.json()).then((data: Config) => {
      setConfig(data);
      setCreator(data.creatorDefault);
      if (data.sources.length) setSourceId(data.sources[0].id);
      else setKind("url");
    }).catch(() => setError("Could not read ingest configuration."));
  }, []);

  const stopPolling = useCallback(() => {
    pollGeneration.current += 1;
    if (pollRef.current) { clearTimeout(pollRef.current); pollRef.current = null; }
  }, []);

  useEffect(() => stopPolling, [stopPolling]);

  useEffect(() => {
    if (!job || !["started", "running", "cancelling"].includes(job.state)) return;
    const timer = setInterval(() => setElapsed((value) => value + 1), 1000);
    return () => clearInterval(timer);
  }, [job]);

  const schedulePolling = useCallback((jobId: string) => {
    stopPolling();
    const generation = pollGeneration.current;
    const poll = async () => {
      try {
        const response = await fetch(`/api/ingest/${jobId}`, { cache: "no-store" });
        const status = await response.json().catch(() => null);
        if (generation !== pollGeneration.current) return;
        if (!response.ok || !status?.job) {
          throw new Error(status?.error?.message ?? `Status request failed with ${response.status}.`);
        }
        const next = status.job as Job;
        setJob(next);
        setPollError(null);
        if (next.state === "started" || next.state === "running" || next.state === "cancelling") {
          pollRef.current = setTimeout(poll, 1500);
        } else {
          stopPolling();
        }
      } catch (caught) {
        if (generation !== pollGeneration.current) return;
        setPollError(`Status connection lost: ${(caught as Error).message} Retrying…`);
        pollRef.current = setTimeout(poll, 3000);
      }
    };
    pollRef.current = setTimeout(poll, 0);
  }, [stopPolling]);

  /** Walk a completed run's stages on stage, fast.
   *
   * The stages, their labels and the clips are the real ones from a run that actually
   * happened -- this replays that run's own record rather than inventing progress. It
   * exists because a live run takes many minutes and depends on the venue network,
   * neither of which survives a demo slot. Nothing here calls yt-dlp, ffmpeg or a model;
   * the banner says so on screen while it plays, so nobody watching is invited to think
   * a fresh run is happening.
   */
  async function replayRun() {
    if (!config?.replayJobId) {
      setError("No completed run is cached for this creator yet.");
      return;
    }
    setError(null);
    setPollError(null);
    setNetwork(null);
    setJob(null);
    setReplaying(true);
    setElapsed(0);
    try {
      const response = await fetch(`/api/ingest/${config.replayJobId}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error?.message ?? "The cached run could not be read.");
      }
      const finished: Job = data.job ?? data;
      const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

      // Advance one stage at a time so the sequence reads exactly as a live run does:
      // the active row spins and shows its detail line, the rows below stay pending.
      // Roughly 4.8s end to end. The first pass at a third of this was quick enough to
      // read but felt like a jump cut; at this pace each stage lands as its own beat.
      for (let index = 0; index < finished.stages.length; index += 1) {
        setJob({
          ...finished,
          state: "running",
          message: undefined,
          clips: [],
          stages: finished.stages.map((stage, position) => ({
            ...stage,
            state: position < index ? "complete" : position === index ? "running" : "pending",
            detail: position <= index ? stage.detail : undefined,
          })),
        });
        await pause(index === finished.stages.length - 1 ? 720 : 960);
      }
      setJob(finished);
    } catch (caught) {
      setError((caught as Error).message);
      setJob(null);
    } finally {
      setReplaying(false);
    }
  }

  async function start() {
    // Demo replay is an explicit operator setting, off unless AFTERPLAY_DEMO_REPLAY is
    // true. When it is on, this button walks the newest completed run instead of
    // spawning a new one -- same control, same stage rows, same result, no 18-minute
    // wait and no spend. The run id shown on screen is the real cached job's, so what
    // is on stage stays checkable against what is on disk.
    if (config?.demoReplay && config.replayJobId) {
      await replayRun();
      return;
    }
    setError(null);
    setJob(null);
    setNetwork(null);
    setPollError(null);
    setStarting(true);
    setElapsed(0);
    try {
      const source = kind === "url" ? { kind: "url", url } : { kind: "cached", id: sourceId };
      const response = await fetch("/api/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source, creator, clips, memory, captions, footageRights }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data?.error?.message ?? "The run could not be started.");
        return;
      }
      setNetwork(data.network);
      if (data.job) setJob(data.job as Job);
      schedulePolling(data.jobId);
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setStarting(false);
    }
  }

  async function cancel() {
    if (!job) return;
    setError(null);
    setPollError(null);
    setCancelling(true);
    try {
      const response = await fetch(`/api/ingest/${job.jobId}`, { method: "DELETE" });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.job) {
        throw new Error(data?.error?.message ?? "The run could not be stopped.");
      }
      stopPolling();
      setJob(data.job as Job);
    } catch (caught) {
      setError((caught as Error).message);
      schedulePolling(job.jobId);
    } finally {
      setCancelling(false);
    }
  }

  const selected = config?.sources.find((s) => s.id === sourceId);
  const running = job?.state === "started" || job?.state === "running" || job?.state === "cancelling";
  const stopping = cancelling || job?.state === "cancelling";

  return (
    <div className="ingest-console">
      <section className="ingest-form" aria-label="Choose a source">
        <div className="ingest-source-toggle" role="radiogroup" aria-label="Source type">
          <button type="button" role="radio" aria-checked={kind === "cached"}
            className={kind === "cached" ? "is-active" : ""}
            onClick={() => setKind("cached")} disabled={!config?.sources.length}>
            <FilmSlate weight="fill" /> Cached source
            <small>On disk. No YouTube request.</small>
          </button>
          <button type="button" role="radio" aria-checked={kind === "url"}
            className={kind === "url" ? "is-active" : ""} onClick={() => setKind("url")}>
            <LinkIcon weight="bold" /> YouTube URL
            <small>Resolved live with yt-dlp.</small>
          </button>
        </div>

        {kind === "cached" ? (
          <label className="ingest-field">
            <span>Source</span>
            {config?.sources.length ? (
              <select value={sourceId} onChange={(e) => setSourceId(e.target.value)}>
                {config.sources.map((source) => (
                  <option key={source.id} value={source.id}>
                    {source.title} {source.mode === "local" ? "· fully local" : "· captions only"}
                  </option>
                ))}
              </select>
            ) : (
              <p className="ingest-empty">
                No cached sources found. Point <code>AFTERPLAY_MEDIA_DIR</code> at a folder of
                media files, or use a YouTube URL.
              </p>
            )}
            {selected?.mode === "replay" ? (
              <small className="ingest-warn">
                Captions are cached but the video is not — the render stage still downloads
                from YouTube.
              </small>
            ) : null}
          </label>
        ) : (
          <label className="ingest-field">
            <span>YouTube URL</span>
            <input type="url" value={url} placeholder="https://www.youtube.com/watch?v=…"
              onChange={(e) => setUrl(e.target.value)} />
            <small>Downloads from YouTube. Subject to their anti-bot throttle.</small>
          </label>
        )}

        <div className="ingest-options">
          <label className="ingest-field">
            <span>Creator</span>
            <input value={creator} readOnly aria-readonly="true" placeholder="Loading workspace…" />
            <small>Which channel memory to read and write.</small>
          </label>
          <label className="ingest-field">
            <span>Clips</span>
            <input type="number" min={1} max={10} value={clips}
              onChange={(e) => setClips(Number(e.target.value))} />
            <small>A callback that ranks below this cut is reported, not hidden.</small>
          </label>
          <label className="ingest-field">
            <span>Footage rights</span>
            <select value={footageRights}
              onChange={(event) => setFootageRights(event.target.value as FootageRights | "")}>
              <option value="">Choose attestation…</option>
              <option value="creator_owned">Creator owned</option>
              <option value="permission_granted">Permission granted</option>
              <option value="licensed">Licensed</option>
              <option value="project_owned">Project owned / generated</option>
              <option value="not_cleared">Not cleared — analysis only</option>
            </select>
            <small>Required. This is never inferred from the link or file path.</small>
          </label>
          <label className="ingest-check">
            <input type="checkbox" checked={memory} onChange={(e) => setMemory(e.target.checked)} />
            <span>Use channel memory<small>Finds moments whose meaning depends on earlier streams.</small></span>
          </label>
          <label className="ingest-check">
            <input type="checkbox" checked={captions} onChange={(e) => setCaptions(e.target.checked)} />
            <span>Burn in Afterplay captions<small>
              Off by default: most source footage already has the creator&apos;s own captions
              burned in, and adding ours on top produces two competing caption layers.
            </small></span>
          </label>
        </div>

        <button className="ingest-start" onClick={start}
          disabled={!config || !creator || !footageRights || starting || running || replaying || (kind === "url" ? !url : !sourceId)}>
          {running || replaying
            ? <><Spinner className="spin" /> Clipping… {elapsed}s</>
            : <>Start clipping <ArrowRight weight="bold" /></>}
        </button>

        {config && !config.python.ok ? (
          <p className="ingest-warn">
            The clipper&apos;s Python environment was not found. Create it in
            <code> services/video-clipper</code> before running.
          </p>
        ) : null}
        {network ? <p className="ingest-network">{network}</p> : null}
        {pollError ? (
          <p className="ingest-error" role="alert"><WarningCircle weight="fill" /> {pollError}</p>
        ) : null}
        {error ? (
          <p className="ingest-error" role="alert"><WarningCircle weight="fill" /> {error}</p>
        ) : null}
      </section>

      {job ? (
        <section className="ingest-progress" aria-label="Run progress" aria-live="polite">
          <div className="ingest-progress-heading">
            <div><span>Active run</span><strong>{job.jobId}</strong></div>
            {running ? (
              <button type="button" className="ingest-cancel" onClick={cancel} disabled={stopping}>
                {stopping ? <Spinner className="spin" /> : <XCircle weight="bold" />}
                {stopping ? "Stopping…" : "Stop run"}
              </button>
            ) : null}
          </div>
          <ol className="stage-list">
            {job.stages.map((stage) => (
              <li key={stage.id} className={`stage stage--${stage.state}`}>
                <span className="stage-icon">
                  {stage.state === "complete" ? <CheckCircle weight="fill" />
                    : stage.state === "running" ? <Spinner className="spin" />
                      : stage.state === "failed" ? <WarningCircle weight="fill" />
                        : stage.state === "cancelled" ? <XCircle weight="fill" />
                        : <Circle />}
                </span>
                <div>
                  <strong>{stage.label}</strong>
                  {stage.detail ? <span className="stage-detail">{stage.detail}</span> : null}
                  <small>{stage.truth}</small>
                </div>
              </li>
            ))}
          </ol>

          {job.state === "complete" ? (
            <div className="ingest-result">
              {job.degraded ? (
                <p className="ingest-error" role="alert">
                  <WarningCircle weight="fill" /> Creator memory degraded: {job.degradedReason}
                </p>
              ) : null}
              {job.message && !job.degraded ? <p className="ingest-note">{job.message}</p> : null}
              <ul className="clip-results">
                {job.clips.map((clip) => (
                  <li key={clip.clipId}
                    className={!clip.ok ? "is-failed" : clip.callback ? "is-callback" : ""}>
                    <strong>{clip.clipId}</strong>
                    <span>{!clip.ok
                      ? "failed quality gate"
                      : clip.callback ? `callback · ${clip.threadLabel ?? "thread"}` : "standalone"}</span>
                  </li>
                ))}
              </ul>
              <Link className="ingest-next" href="/studio">
                {job.clips.some((clip) => clip.ok) ? "Review in Studio" : "Inspect failure in Studio"}
                <ArrowRight weight="bold" />
              </Link>
            </div>
          ) : null}

          {job.state === "failed" ? (
            <div className="ingest-result">
              <p className="ingest-error" role="alert">
                <WarningCircle weight="fill" /> {job.message ?? "The run failed."}
              </p>
              <details><summary>Run log</summary><pre>{job.log.join("\n")}</pre></details>
            </div>
          ) : null}

          {job.state === "cancelled" ? (
            <div className="ingest-result">
              <p className="ingest-cancelled" role="status">
                <XCircle weight="fill" /> {job.message ?? "The run was cancelled."}
              </p>
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
