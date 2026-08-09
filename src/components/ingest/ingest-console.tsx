"use client";

import { ArrowRight, CheckCircle, Circle, FilmSlate, Link as LinkIcon, Spinner, WarningCircle } from "@phosphor-icons/react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

type CachedSource = { id: string; title: string; mode: "local" | "replay" };

type Stage = {
  id: string; label: string; truth: string;
  state: "pending" | "running" | "complete" | "failed"; detail?: string;
};

type Job = {
  jobId: string;
  state: "started" | "complete" | "failed";
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
};

export function IngestConsole() {
  const [config, setConfig] = useState<Config | null>(null);
  const [kind, setKind] = useState<"cached" | "url">("cached");
  const [sourceId, setSourceId] = useState("");
  const [url, setUrl] = useState("");
  const [creator, setCreator] = useState("demo_live");
  const [clips, setClips] = useState(3);
  const [memory, setMemory] = useState(true);
  const [job, setJob] = useState<Job | null>(null);
  const [network, setNetwork] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    fetch("/api/ingest").then((r) => r.json()).then((data: Config) => {
      setConfig(data);
      setCreator(data.creatorDefault);
      if (data.sources.length) setSourceId(data.sources[0].id);
      else setKind("url");
    }).catch(() => setError("Could not read ingest configuration."));
  }, []);

  const stopPolling = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }, []);

  useEffect(() => stopPolling, [stopPolling]);

  useEffect(() => {
    if (!job || job.state !== "started") return;
    const timer = setInterval(() => setElapsed((value) => value + 1), 1000);
    return () => clearInterval(timer);
  }, [job]);

  async function start() {
    setError(null);
    setJob(null);
    setNetwork(null);
    setStarting(true);
    setElapsed(0);
    try {
      const source = kind === "url" ? { kind: "url", url } : { kind: "cached", id: sourceId };
      const response = await fetch("/api/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source, creator, clips, memory }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data?.error?.message ?? "The run could not be started.");
        return;
      }
      setNetwork(data.network);
      stopPolling();
      pollRef.current = setInterval(async () => {
        const status = await fetch(`/api/ingest/${data.jobId}`).then((r) => r.json()).catch(() => null);
        if (status?.job) {
          setJob(status.job);
          if (status.job.state !== "started") stopPolling();
        }
      }, 1500);
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setStarting(false);
    }
  }

  const selected = config?.sources.find((s) => s.id === sourceId);
  const running = job?.state === "started";

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
            <input value={creator} onChange={(e) => setCreator(e.target.value)} />
            <small>Which channel memory to read and write.</small>
          </label>
          <label className="ingest-field">
            <span>Clips</span>
            <input type="number" min={1} max={10} value={clips}
              onChange={(e) => setClips(Number(e.target.value))} />
            <small>A callback that ranks below this cut is reported, not hidden.</small>
          </label>
          <label className="ingest-check">
            <input type="checkbox" checked={memory} onChange={(e) => setMemory(e.target.checked)} />
            <span>Use channel memory<small>Finds moments whose meaning depends on earlier streams.</small></span>
          </label>
        </div>

        <button className="ingest-start" onClick={start}
          disabled={starting || running || (kind === "url" ? !url : !sourceId)}>
          {running ? <><Spinner className="spin" /> Clipping… {elapsed}s</> : <>Start clipping <ArrowRight weight="bold" /></>}
        </button>

        {config && !config.python.ok ? (
          <p className="ingest-warn">
            The clipper&apos;s Python environment was not found. Create it in
            <code> services/video-clipper</code> before running.
          </p>
        ) : null}
        {network ? <p className="ingest-network">{network}</p> : null}
        {error ? (
          <p className="ingest-error" role="alert"><WarningCircle weight="fill" /> {error}</p>
        ) : null}
      </section>

      {job ? (
        <section className="ingest-progress" aria-label="Run progress">
          <ol className="stage-list">
            {job.stages.map((stage) => (
              <li key={stage.id} className={`stage stage--${stage.state}`}>
                <span className="stage-icon">
                  {stage.state === "complete" ? <CheckCircle weight="fill" />
                    : stage.state === "running" ? <Spinner className="spin" />
                      : stage.state === "failed" ? <WarningCircle weight="fill" />
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
                  <li key={clip.clipId} className={clip.callback ? "is-callback" : ""}>
                    <strong>{clip.clipId}</strong>
                    <span>{clip.callback ? `callback · ${clip.threadLabel ?? "thread"}` : "standalone"}</span>
                  </li>
                ))}
              </ul>
              <Link className="ingest-next" href="/studio">
                Review in Studio <ArrowRight weight="bold" />
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
        </section>
      ) : null}
    </div>
  );
}
