"use client";

import {
  ArrowRight,
  CheckCircle,
  Circle,
  Clock,
  Database,
  Spinner,
  WarningCircle,
  XCircle,
  YoutubeLogo,
} from "@phosphor-icons/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type FootageRights =
  | "project_owned"
  | "creator_owned"
  | "permission_granted"
  | "licensed"
  | "not_cleared";

type ChannelVideo = {
  video_id: string;
  title: string;
  duration: number | null;
  duration_label: string;
  view_count: number | null;
  url: string;
};

type ChannelPreview = {
  schema: "afterplay.channel-backfill-report";
  version: 1;
  mode: "preview";
  creator_id: string;
  listing: {
    channel_id: string;
    name: string;
    handle: string;
    url: string;
    requested: number;
    returned: number;
    elapsed: number;
    videos: ChannelVideo[];
  };
};

type BackfillVideo = {
  videoId: string;
  childJobId: string;
  state: "pending" | "running" | "complete" | "failed" | "cancelled";
  sections: { read: number; total: number; failed: number };
  threadsSuggested: number;
  threadsAdded: number;
  transcriptLanguage?: string | null;
  transcriptSource?: string | null;
  subtitleTrack?: string | null;
  error?: string | null;
  log: string[];
};

type BackfillJob = {
  jobId: string;
  creatorId: string;
  channel: string;
  footageRights: FootageRights;
  state: "started" | "running" | "cancelling" | "complete" | "partial" | "failed" | "cancelled";
  progress: { done: number; total: number };
  videos: BackfillVideo[];
  message: string;
  createdAt: string;
  updatedAt: string;
};

type CreatorProfile = { id: string };

const ACTIVE_STATES = new Set<BackfillJob["state"]>(["started", "running", "cancelling"]);
const compactNumber = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });

function errorMessage(value: unknown, fallback: string): string {
  if (!value || typeof value !== "object") return fallback;
  const error = "error" in value ? value.error : null;
  if (!error || typeof error !== "object" || !("message" in error)) return fallback;
  return typeof error.message === "string" ? error.message : fallback;
}

function formatSeconds(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "Timing unavailable";
  return seconds < 10 ? `${seconds.toFixed(1)}s` : `${Math.round(seconds)}s`;
}

function videoStateLabel(video: BackfillVideo): string {
  if (video.state === "complete" && video.sections.failed > 0) return "Complete with gaps";
  if (video.state === "failed" && /caption/i.test(video.error ?? "")) return "No captions";
  return video.state[0].toUpperCase() + video.state.slice(1);
}

export function ChannelConsole() {
  const [channel, setChannel] = useState("");
  const [preview, setPreview] = useState<ChannelPreview | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [knownCreatorIds, setKnownCreatorIds] = useState<Set<string>>(new Set());
  const [registryLoaded, setRegistryLoaded] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [workspaceState, setWorkspaceState] = useState<"idle" | "saving" | "ready">("idle");
  const [footageRights, setFootageRights] = useState<FootageRights | "">("");
  const [job, setJob] = useState<BackfillJob | null>(null);
  const [starting, setStarting] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pollError, setPollError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [replayConfig, setReplayConfig] =
    useState<{ demoReplay: boolean; replayJobId: string | null } | null>(null);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollGeneration = useRef(0);

  useEffect(() => {
    // Whether this machine is set up to replay a cached memory run instead of starting
    // a real one. A failure here just leaves the real path in place.
    fetch("/api/channel/backfill", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => setReplayConfig(data))
      .catch(() => setReplayConfig(null));
  }, []);

  useEffect(() => {
    fetch("/api/creator", { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(errorMessage(data, "Workspace registry unavailable."));
        setKnownCreatorIds(new Set((data.creators as CreatorProfile[]).map((creator) => creator.id)));
      })
      .catch(() => setKnownCreatorIds(new Set()))
      .finally(() => setRegistryLoaded(true));
  }, []);

  const stopPolling = useCallback(() => {
    pollGeneration.current += 1;
    if (pollRef.current) {
      clearTimeout(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  useEffect(() => stopPolling, [stopPolling]);

  const jobCreatedAt = job?.createdAt;
  const jobState = job?.state;

  useEffect(() => {
    if (!jobCreatedAt || !jobState || !ACTIVE_STATES.has(jobState)) return;
    const tick = () => {
      const start = Date.parse(jobCreatedAt);
      setElapsed(Number.isFinite(start) ? Math.max(0, Math.floor((Date.now() - start) / 1000)) : 0);
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [jobCreatedAt, jobState]);

  const schedulePolling = useCallback((jobId: string) => {
    stopPolling();
    const generation = pollGeneration.current;
    const poll = async () => {
      try {
        const response = await fetch(`/api/channel/backfill/${jobId}`, { cache: "no-store" });
        const data = await response.json().catch(() => null);
        if (generation !== pollGeneration.current) return;
        if (!response.ok || !data?.job) {
          throw new Error(errorMessage(data, `Status request failed with ${response.status}.`));
        }
        const next = data.job as BackfillJob;
        setJob(next);
        setPollError(null);
        if (ACTIVE_STATES.has(next.state)) pollRef.current = setTimeout(poll, 1_500);
        else stopPolling();
      } catch (caught) {
        if (generation !== pollGeneration.current) return;
        setPollError(`Status connection lost: ${(caught as Error).message} Retrying...`);
        pollRef.current = setTimeout(poll, 3_000);
      }
    };
    pollRef.current = setTimeout(poll, 0);
  }, [stopPolling]);

  async function loadPreview() {
    stopPolling();
    setPreviewing(true);
    setError(null);
    setPollError(null);
    setPreview(null);
    setJob(null);
    setWorkspaceState("idle");
    setFootageRights("");
    try {
      const response = await fetch("/api/channel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel, limit: 5 }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.preview) {
        throw new Error(errorMessage(data, "The channel could not be previewed."));
      }
      const next = data.preview as ChannelPreview;
      setPreview(next);
      setSelectedIds(next.listing.videos.slice(0, 3).map((video) => video.video_id));
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setPreviewing(false);
    }
  }

  function toggleVideo(videoId: string) {
    setSelectedIds((current) => {
      if (current.includes(videoId)) return current.filter((id) => id !== videoId);
      return current.length >= 5 ? current : [...current, videoId];
    });
  }

  async function ensureWorkspace() {
    if (!preview) return false;
    if (existingWorkspace) {
      // Selecting matters even though there is nothing to create. PUT both creates and
      // selects, so the create path set the cookie as a side effect; returning early
      // here skipped that, and the backfill then posted this creator id while the cookie
      // still named the previously selected workspace -- which the route correctly
      // rejects as creator_mismatch. POST is the select-only half of the same endpoint.
      setWorkspaceState("saving");
      const selected = await fetch("/api/creator", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: preview.creator_id }),
      });
      if (!selected.ok) {
        const data = await selected.json().catch(() => null);
        throw new Error(errorMessage(data, "The workspace could not be selected."));
      }
      setWorkspaceState("ready");
      return true;
    }

    setWorkspaceState("saving");
    const response = await fetch("/api/creator", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: preview.creator_id,
        channelId: preview.listing.channel_id,
        displayName: preview.listing.name,
        handle: preview.listing.handle,
        mode: "live",
      }),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(errorMessage(data, "The workspace could not be created."));
    }
    setKnownCreatorIds((current) => new Set(current).add(preview.creator_id));
    setWorkspaceState("ready");
    return true;
  }

  /** Walk a finished memory run's progress on stage, fast.
   *
   * The videos, their per-video progress and the final counts are the real ones from a
   * run that happened -- this replays that run's own record. A real backfill reads every
   * caption and calls a model per video, which is minutes and real spend; neither fits a
   * demo slot. Roughly 1.6s end to end, and the run id shown is the cached job's, so
   * what is on stage stays checkable against what is on disk. */
  async function replayBackfill(replayJobId: string) {
    setStarting(true);
    setError(null);
    setPollError(null);
    setJob(null);
    setElapsed(0);
    try {
      await ensureWorkspace();
      const response = await fetch(`/api/channel/backfill/${replayJobId}`, { cache: "no-store" });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.job) {
        throw new Error(errorMessage(data, "The cached memory run could not be read."));
      }
      const finished = data.job as BackfillJob;
      const total = finished.videos.length;
      const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

      // One video at a time, so the overall bar and the per-video rows fill in the same
      // order a live run fills them.
      for (let done = 0; done <= total; done += 1) {
        setJob({
          ...finished,
          state: done === total ? finished.state : "running",
          progress: { done, total },
          videos: finished.videos.map((video, index) => (
            index < done ? video
              : { ...video, state: index === done ? "running" : "pending" }
          )),
        });
        await pause(done === total ? 200 : Math.max(260, Math.round(1400 / Math.max(1, total))));
      }
      setJob(finished);
    } catch (caught) {
      setWorkspaceState("idle");
      setError((caught as Error).message);
    } finally {
      setStarting(false);
    }
  }

  async function startBackfill() {
    if (!preview) return;
    if (!footageRights) {
      setError("Choose a footage-rights attestation first.");
      return;
    }
    if (selectedIds.length === 0) {
      setError("Select at least one upload.");
      return;
    }
    // Stage demo: same button, cached run, no minutes and no spend. Off unless
    // AFTERPLAY_DEMO_REPLAY is set, so a developer machine still does the real thing.
    if (replayConfig?.demoReplay && replayConfig.replayJobId) {
      await replayBackfill(replayConfig.replayJobId);
      return;
    }
    setStarting(true);
    setError(null);
    setPollError(null);
    setJob(null);
    setElapsed(0);
    try {
      await ensureWorkspace();
      const response = await fetch("/api/channel/backfill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channel: preview.listing.url,
          creatorId: preview.creator_id,
          videoIds: selectedIds,
          footageRights,
        }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.job) {
        throw new Error(errorMessage(data, "Channel memory could not be started."));
      }
      setJob(data.job as BackfillJob);
      schedulePolling(data.jobId);
    } catch (caught) {
      setWorkspaceState("idle");
      setError((caught as Error).message);
    } finally {
      setStarting(false);
    }
  }

  async function cancelBackfill() {
    if (!job) return;
    setCancelling(true);
    setError(null);
    setPollError(null);
    try {
      const response = await fetch(`/api/channel/backfill/${job.jobId}`, { method: "DELETE" });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.job) {
        throw new Error(errorMessage(data, "The channel backfill could not be stopped."));
      }
      setJob(data.job as BackfillJob);
      if (ACTIVE_STATES.has(data.job.state)) schedulePolling(job.jobId);
      else stopPolling();
    } catch (caught) {
      setError((caught as Error).message);
      schedulePolling(job.jobId);
    } finally {
      setCancelling(false);
    }
  }

  const existingWorkspace = preview ? knownCreatorIds.has(preview.creator_id) : false;
  const running = job ? ACTIVE_STATES.has(job.state) : false;
  const requirementRows = preview ? [
    {
      label: existingWorkspace ? "Workspace selected" : `Will create workspace ${preview.creator_id}`,
      state: existingWorkspace ? "done" : workspaceState === "saving" ? "current" : "locked",
    },
    {
      label: footageRights ? "Footage rights set" : "Choose a footage-rights attestation",
      state: footageRights ? "done" : "current",
    },
    {
      label: selectedIds.length > 0 ? `${selectedIds.length} uploads selected` : "Select uploads",
      state: selectedIds.length > 0 ? "done" : "current",
    },
  ] as const : [];
  const videoTitles = useMemo(
    () => new Map(preview?.listing.videos.map((video) => [video.video_id, video.title]) ?? []),
    [preview],
  );
  const progressPercent = job ? Math.min(100, (job.progress.done / Math.max(1, job.progress.total)) * 100) : 0;

  return (
    <section className="channel-console" id="channel" aria-labelledby="channel-console-title">
      <header className="channel-console-head">
        <div className="channel-console-icon" aria-hidden="true"><Database weight="fill" /></div>
        <div>
          <span>Channel setup</span>
          <h2 id="channel-console-title">Build the memory before you clip</h2>
          <p>Choose recent uploads, verify the workspace, then extract evidence-backed threads from captions.</p>
        </div>
      </header>

      <div className="channel-steps">
        <section className="channel-step" aria-labelledby="channel-step-one">
          <div className="channel-step-title">
            <span>1</span>
            <div><h3 id="channel-step-one">Point at a channel</h3><p>Previewing lists uploads only. It does not call OpenAI.</p></div>
          </div>
          <form className="channel-preview-form" onSubmit={(event) => { event.preventDefault(); void loadPreview(); }}>
            <label className="ingest-field" htmlFor="channel-address">
              <span>Channel handle or URL</span>
              <div className="channel-input-wrap">
                <YoutubeLogo weight="fill" aria-hidden="true" />
                <input
                  id="channel-address"
                  value={channel}
                  onChange={(event) => setChannel(event.target.value)}
                  placeholder="@handle or https://youtube.com/@handle"
                  autoComplete="off"
                />
              </div>
              <small>Use an explicit @handle or channel URL, not a search term.</small>
            </label>
            <button className="channel-action channel-action--primary" type="submit" disabled={previewing || channel.trim().length < 2}>
              {previewing ? <><Spinner className="spin" /> Listing channel...</> : <>Preview uploads <ArrowRight weight="bold" /></>}
            </button>
          </form>

          {!preview && !previewing ? (
            <div className="channel-cold-state">
              <YoutubeLogo weight="duotone" aria-hidden="true" />
              <div><strong>No channel selected</strong><span>The five newest available uploads will appear here.</span></div>
            </div>
          ) : null}

          {preview ? (
            <div className="channel-preview-result">
              <div className="channel-identity">
                <div>
                  <span className="channel-handle">{preview.listing.handle || "Handle unavailable"}</span>
                  <h4>{preview.listing.name}</h4>
                  <p>{preview.listing.returned} uploads listed in {formatSeconds(preview.listing.elapsed)}</p>
                </div>
                <span className={`channel-workspace-state ${workspaceState === "ready" ? "is-ready" : ""}`}>
                  {workspaceState === "ready" ? "Selected" : !registryLoaded ? "Checking workspace" : existingWorkspace ? "Existing workspace" : "New workspace"}
                </span>
              </div>

              <div className="channel-workspace-row">
                <label className="ingest-field">
                  <span>Python-derived creator ID</span>
                  <input value={preview.creator_id} readOnly aria-readonly="true" />
                  <small>This ID is carried from Python unchanged to prevent split memory.</small>
                </label>
                <div className="channel-workspace-status">
                  <span className={`channel-workspace-state ${workspaceState === "ready" ? "is-ready" : ""}`}>
                    {workspaceState === "saving" ? "Creating workspace" : existingWorkspace ? "Workspace ready" : `Will create ${preview.creator_id}`}
                  </span>
                  <p>Create happens inline when you build memory. No separate workspace button.</p>
                </div>
              </div>

              <div className="channel-requirements" aria-label="Run requirements">
                {requirementRows.map((row) => (
                  <div key={row.label} className={`channel-requirement channel-requirement--${row.state}`}>
                    <span>
                      {row.state === "done" ? <CheckCircle weight="fill" /> : row.state === "current" ? <Clock weight="bold" /> : <Circle aria-hidden="true" />}
                    </span>
                    <strong>{row.label}</strong>
                  </div>
                ))}
              </div>

              <fieldset className="channel-video-fieldset">
                <legend>Choose uploads <span>{selectedIds.length}/5 selected</span></legend>
                <p>Three are selected by default. Completed videos contribute even if a later one fails.</p>
                <div className="channel-video-list">
                  {preview.listing.videos.map((video, index) => {
                    const checked = selectedIds.includes(video.video_id);
                    return (
                      <label className={`channel-video-option ${checked ? "is-selected" : ""}`} key={video.video_id}>
                        <input type="checkbox" checked={checked} disabled={!checked && selectedIds.length >= 5} onChange={() => toggleVideo(video.video_id)} />
                        <span className="channel-video-index">{String(index + 1).padStart(2, "0")}</span>
                        <span className="channel-video-copy">
                          <strong>{video.title || "Untitled upload"}</strong>
                          <small>
                            <span>{video.duration_label || "Duration unavailable"}</span>
                            <span>{video.view_count === null ? "Views unavailable" : `${compactNumber.format(video.view_count)} views`}</span>
                          </small>
                        </span>
                        {checked ? <CheckCircle weight="fill" aria-hidden="true" /> : <Circle aria-hidden="true" />}
                      </label>
                    );
                  })}
                </div>
              </fieldset>
            </div>
          ) : null}
        </section>

        <section className={`channel-step ${preview ? "" : "is-disabled"}`} aria-labelledby="channel-step-two">
          <div className="channel-step-title">
            <span>2</span>
            <div><h3 id="channel-step-two">Build memory</h3><p>Read captions sequentially and extract threads into this creator workspace.</p></div>
          </div>

          {!preview ? (
            <div className="channel-cold-state">
              <Database weight="duotone" aria-hidden="true" />
              <div><strong>Waiting for a channel</strong><span>Preview a channel to configure this run.</span></div>
            </div>
          ) : (
            <div className="channel-build-form">
              <div className="channel-disclosure">
                <WarningCircle weight="fill" aria-hidden="true" />
                <div><strong>Captions only. No ASR.</strong><span>A video without captions is skipped, not transcribed. Media is never downloaded.</span></div>
              </div>
              <label className="ingest-field">
                <span>Footage rights</span>
                <select value={footageRights} onChange={(event) => setFootageRights(event.target.value as FootageRights | "")}>
                  <option value="">Choose attestation...</option>
                  <option value="creator_owned">Creator owned</option>
                  <option value="permission_granted">Permission granted</option>
                  <option value="licensed">Licensed</option>
                  <option value="project_owned">Project owned / generated</option>
                  <option value="not_cleared">Not cleared - analysis only</option>
                </select>
                <small>Required and recorded with the backfill. It is never inferred.</small>
              </label>
              <div className="channel-run-summary">
                <span><strong>{selectedIds.length}</strong> uploads</span>
                <span><strong>{workspaceState === "ready" ? "Ready" : "Not ready"}</strong> workspace</span>
              </div>
              <button className="channel-action channel-action--primary" type="button" onClick={() => void startBackfill()} disabled={starting || running}>
                {starting ? <><Spinner className="spin" /> Starting memory run...</> : running ? <><Spinner className="spin" /> Building memory - {elapsed}s</> : <>Build memory from {selectedIds.length} {selectedIds.length === 1 ? "upload" : "uploads"} <ArrowRight weight="bold" /></>}
              </button>
              <p className="channel-inline-note">The button creates the workspace if needed, then starts the run.</p>
            </div>
          )}

          {pollError ? <p className="ingest-error" role="alert"><WarningCircle weight="fill" /> {pollError}</p> : null}
          {error ? <p className="ingest-error" role="alert"><WarningCircle weight="fill" /> {error}</p> : null}

          {job ? (
            <div className="channel-job" aria-live="polite" aria-label="Channel backfill progress">
              <div className="channel-job-head">
                <div><span>Memory run</span><strong>{job.jobId}</strong><small><Clock weight="bold" /> {ACTIVE_STATES.has(job.state) ? `${elapsed}s elapsed` : `${job.progress.done} of ${job.progress.total} finished`}</small></div>
                {running ? <button className="ingest-cancel" type="button" onClick={() => void cancelBackfill()} disabled={cancelling || job.state === "cancelling"}>{cancelling || job.state === "cancelling" ? <><Spinner className="spin" /> Stopping...</> : <><XCircle weight="bold" /> Stop run</>}</button> : <span className={`channel-job-state channel-job-state--${job.state}`}>{job.state}</span>}
              </div>

              <ol className="channel-stage-list" aria-label="Run stages">
                <li className="is-complete"><CheckCircle weight="fill" /><div><strong>Channel listed</strong><span>{preview ? `${preview.listing.returned} uploads in ${formatSeconds(preview.listing.elapsed)}` : "Preview unavailable"}</span></div></li>
                <li className="is-complete"><CheckCircle weight="fill" /><div><strong>Workspace selected</strong><span>{job.creatorId}</span></div></li>
                <li className={job.state === "failed" ? "is-failed" : ACTIVE_STATES.has(job.state) ? "is-running" : "is-complete"}>{job.state === "failed" ? <WarningCircle weight="fill" /> : ACTIVE_STATES.has(job.state) ? <Spinner className="spin" /> : <CheckCircle weight="fill" />}<div><strong>Captions and memory</strong><span>{job.progress.done} of {job.progress.total} videos processed</span></div></li>
              </ol>

              <div className="channel-overall-progress">
                <div><span>Overall progress</span><strong>{Math.round(progressPercent)}%</strong></div>
                <span className="channel-progress-track" role="progressbar" aria-label="Overall backfill progress" aria-valuemin={0} aria-valuemax={job.progress.total} aria-valuenow={job.progress.done}><i style={{ width: `${progressPercent}%` }} /></span>
              </div>

              <ol className="channel-video-progress">
                {job.videos.map((video, index) => {
                  const total = video.sections.total;
                  const pct = total > 0 ? Math.min(100, (video.sections.read / total) * 100) : video.state === "complete" ? 100 : 0;
                  return (
                    <li key={video.videoId} className={`channel-video-progress-row is-${video.state}`}>
                      <div className="channel-video-progress-head">
                        <span>{video.state === "complete" ? <CheckCircle weight="fill" /> : video.state === "running" ? <Spinner className="spin" /> : video.state === "failed" ? <WarningCircle weight="fill" /> : video.state === "cancelled" ? <XCircle weight="fill" /> : <Circle />}</span>
                        <div><strong>{videoTitles.get(video.videoId) ?? `Upload ${index + 1}`}</strong><small>{videoStateLabel(video)} - {total > 0 ? `${video.sections.read} of ${total} sections read` : "Waiting for section count"}</small></div>
                        <span className="channel-thread-count">{video.threadsAdded} threads</span>
                      </div>
                      <span className="channel-progress-track" aria-hidden="true"><i style={{ width: `${pct}%` }} /></span>
                      {video.sections.failed > 0 ? <p>{video.sections.failed} sections failed; successful sections were kept.</p> : null}
                      {video.error ? <p className="channel-video-error">{video.error}</p> : null}
                      {video.transcriptLanguage ? <p className="channel-video-provenance">{video.transcriptLanguage} captions{video.subtitleTrack ? ` - ${video.subtitleTrack}` : ""}</p> : null}
                    </li>
                  );
                })}
              </ol>

              {!running ? (
                <div className={`channel-job-result channel-job-result--${job.state}`} role={job.state === "failed" ? "alert" : "status"}>
                  {job.state === "complete" ? <CheckCircle weight="fill" /> : job.state === "partial" || job.state === "failed" ? <WarningCircle weight="fill" /> : <XCircle weight="fill" />}
                  <div><strong>{job.state === "complete" ? "Memory build complete" : job.state === "partial" ? "Memory build partially complete" : job.state === "cancelled" ? "Memory build cancelled" : "Memory build failed"}</strong><span>{job.message}</span>{job.state === "cancelled" ? <small>Threads from videos that finished are kept.</small> : null}</div>
                </div>
              ) : null}
            </div>
          ) : null}
        </section>
      </div>
    </section>
  );
}
