import { randomUUID } from "node:crypto";
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

import { getClipManifestForJob } from "../clip-manifest";
import {
  CreatorProcessConflictError,
  durableActiveJob,
  pythonConfigured,
  runningJob,
  runningJobForCreator,
  spawnPythonJob,
  terminateProcessTree,
  unregisterRunningJob,
  workdir,
} from "./process";
import { type CachedSource } from "./sources";

/** Server-only. Spawns the Python clipper and reads its progress off disk. */

export type StageId = "resolve" | "transcript" | "memory" | "render" | "done";
export type StageState = "pending" | "running" | "complete" | "failed" | "cancelled";
export type IngestJobState = "started" | "running" | "cancelling" | "complete" | "failed" | "cancelled";

export type IngestStage = {
  id: StageId;
  label: string;
  /** What this stage literally does. Shown in the UI so nothing looks more magical
   * than it is. */
  truth: string;
  state: StageState;
  detail?: string;
};

export type IngestJob = {
  jobId: string;
  creatorId: string;
  state: IngestJobState;
  message?: string;
  stages: IngestStage[];
  log: string[];
  clips: Array<{ clipId: string; ok: boolean; callback: boolean; threadLabel?: string }>;
  callbackFound?: boolean;
  callbacksRankedOut?: number;
  degraded?: boolean;
  degradedReason?: string | null;
};

export class IngestError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
    this.name = "IngestError";
  }
}

type JobStatusDocument = {
  creator_id?: string | null;
  state?: IngestJobState;
  stage?: StageId;
  detail?: string;
  updated?: number;
  message?: string;
  manifest?: string;
};

const TERMINAL_STATES = new Set<IngestJobState>(["complete", "failed", "cancelled"]);

function statusPath(jobId: string): string {
  return join(workdir(), jobId, "status.json");
}

function completedManifestStatus(jobId: string, creatorId: string): JobStatusDocument | null {
  const manifestPath = join(workdir(), jobId, "manifest.json");
  const manifest = safeJson<{
    creator_id?: string | null;
    status?: string;
    clips?: Array<{ ok?: boolean }>;
    message?: string | null;
  }>(manifestPath);
  if (manifest?.creator_id !== creatorId || manifest.status !== "complete"
      || !Array.isArray(manifest.clips)) {
    return null;
  }
  const clipsOk = manifest.clips.filter((clip) => clip.ok !== false).length;
  return {
    creator_id: creatorId,
    state: "complete",
    stage: "done",
    detail: `${clipsOk}/${manifest.clips.length} clips passed quality checks.`,
    updated: Date.now() / 1000,
    message: manifest.message ?? undefined,
    manifest: manifestPath,
  };
}

function writeStatus(path: string, status: JobStatusDocument): void {
  const temporary = `${path}.${process.pid}-${randomUUID()}.tmp`;
  try {
    writeFileSync(temporary, JSON.stringify(status), "utf-8");
    try {
      renameSync(temporary, path);
    } catch (error) {
      if (!isNodeError(error, ["EPERM", "EBUSY"])) throw error;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10);
      renameSync(temporary, path);
    }
  } finally {
    try {
      unlinkSync(temporary);
    } catch (error) {
      if (!isNodeError(error, ["ENOENT"])) throw error;
    }
  }
}

function isNodeError(error: unknown, codes: readonly string[]): boolean {
  return typeof error === "object" && error !== null && "code" in error
    && typeof error.code === "string" && codes.includes(error.code);
}

function terminalStatus(
  path: string,
  creatorId: string,
  state: "failed" | "cancelled",
  message: string,
): void {
  const previous = safeJson<JobStatusDocument>(path);
  writeStatus(path, {
    ...previous,
    creator_id: creatorId,
    state,
    updated: Date.now() / 1000,
    message,
  });
}

export { pythonConfigured };

const YOUTUBE_HOSTS = new Set([
  "youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be", "www.youtu.be",
]);

/** Only http(s), only YouTube. The value is passed to yt-dlp as a spawn argument (never
 * through a shell), but restricting the host keeps the server from being used as a
 * general-purpose fetcher for arbitrary URLs. */
export function assertIngestableUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new IngestError("That is not a valid URL.");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new IngestError("Only http and https URLs can be ingested.");
  }
  if (!YOUTUBE_HOSTS.has(url.hostname)) {
    throw new IngestError(
      `Only YouTube links are supported right now (got ${url.hostname}).`,
    );
  }
  return url.toString();
}

export function newJobId(): string {
  return `ui_${Math.random().toString(36).slice(2, 10)}`;
}

export type StartOptions = {
  jobId: string;
  creator: string;
  clips: number;
  platforms: string;
  memory: boolean;
  captions: boolean;
  footageRights: "project_owned" | "creator_owned" | "permission_granted" | "licensed" | "not_cleared";
  source: { kind: "url"; url: string } | { kind: "cached"; source: CachedSource };
};

export function startIngestJob(options: StartOptions): { jobId: string; args: string[] } {
  if (runningJobForCreator(options.creator)) {
    throw new IngestError("An ingest job is already running for this creator.", 409);
  }
  const durableJobId = durableActiveJob(
    options.creator,
    (jobId, creatorId) => completedManifestStatus(jobId, creatorId) !== null,
  );
  if (durableJobId) {
    throw new IngestError(
      `Job ${durableJobId} still reports active. Resolve that host process before starting another ingest.`,
      409,
    );
  }

  const dir = join(workdir(), options.jobId);
  mkdirSync(dir, { recursive: true });
  writeStatus(join(dir, "status.json"), {
    creator_id: options.creator,
    state: "started",
    stage: "resolve",
    detail: "Job queued; resolving the source next.",
    updated: Date.now() / 1000,
    message: "Job queued.",
  });

  const args = ["-m", "afterplay.cli", "--json", "run", "--job-id", options.jobId,
    "--creator", options.creator, "--clips", String(options.clips),
    "--platforms", options.platforms, "--rights", options.footageRights];
  if (options.memory) args.push("--memory");
  if (options.captions) args.push("--captions");

  if (options.source.kind === "url") {
    args.push(options.source.url);
  } else {
    const { mediaPath, infoJsonPath, vttPath } = options.source.source;
    if (mediaPath) args.push("--local", mediaPath);
    else if (infoJsonPath) args.push("--info-json", infoJsonPath);
    else {
      terminalStatus(
        join(dir, "status.json"),
        options.creator,
        "failed",
        "The cached source has neither media nor saved metadata.",
      );
      throw new IngestError("That cached source has neither media nor saved metadata.");
    }
    args.push("--vtt", vttPath);
  }

  // The CLI logs progress to stderr; keep it so the status endpoint can report real
  // stages instead of a spinner that means nothing.
  const logPath = join(dir, "run.log");
  let fd: number;
  try {
    fd = openSync(logPath, "a");
  } catch (error) {
    terminalStatus(
      join(dir, "status.json"),
      options.creator,
      "failed",
      `The job log could not be opened: ${(error as Error).message}`,
    );
    throw new IngestError("The clipper job log could not be opened.", 500);
  }

  let child;
  try {
    child = spawnPythonJob({
      jobId: options.jobId,
      creatorId: options.creator,
      kind: "ingest",
      args,
      stdio: ["ignore", fd, fd],
    });
  } catch (error) {
    terminalStatus(
      join(dir, "status.json"),
      options.creator,
      "failed",
      `The clipper process could not be created: ${(error as Error).message}`,
    );
    if (error instanceof CreatorProcessConflictError) {
      throw new IngestError("An ingest job is already running for this creator.", 409);
    }
    throw new IngestError("The clipper process could not be created.", 500);
  } finally {
    closeSync(fd);
  }

  // A job that dies without writing a manifest must say so rather than appearing to run
  // forever. The CLI writes status.json itself on a clean failure; this covers the case
  // where the process never got that far.
  child.once("error", (error) => {
    unregisterRunningJob(options.jobId, child);
    const statusPath = join(dir, "status.json");
    const current = safeJson<JobStatusDocument>(statusPath);
    if (!current?.state || !TERMINAL_STATES.has(current.state)) {
      terminalStatus(statusPath, options.creator, "failed", `The clipper could not start: ${error.message}`);
    }
  });
  child.once("exit", (code, signal) => {
    unregisterRunningJob(options.jobId, child);

    const path = join(dir, "status.json");
    const completed = completedManifestStatus(options.jobId, options.creator);
    if (completed) {
      writeStatus(path, completed);
      return;
    }
    const current = safeJson<JobStatusDocument>(path);
    if (current?.state === "cancelling") return;
    if (current?.state && TERMINAL_STATES.has(current.state)) return;
    if (code === 0) {
      terminalStatus(
        path,
        options.creator,
        "failed",
        "The clipper exited without recording a complete manifest.",
      );
      return;
    }
    terminalStatus(
      path,
      options.creator,
      "failed",
      signal
        ? `The clipper was terminated by ${signal}.`
        : `The clipper exited with code ${code}. See run.log.`,
    );
  });
  child.unref();

  return { jobId: options.jobId, args };
}

export async function cancelIngestJob(jobId: string, creatorId: string): Promise<IngestJob> {
  const job = readIngestJob(jobId, creatorId);
  if (!job) throw new IngestError("No such job.", 404);
  if (TERMINAL_STATES.has(job.state)) return job;

  const path = statusPath(jobId);
  const alreadyComplete = completedManifestStatus(jobId, creatorId);
  if (alreadyComplete) {
    writeStatus(path, alreadyComplete);
    return readIngestJob(jobId, creatorId) ?? job;
  }

  const running = runningJob(jobId, creatorId, "ingest");
  if (!running) {
    throw new IngestError(
      "This job is still visible, but its process handle was lost after a server restart. Stop it from the host before retrying.",
      409,
    );
  }

  const previous = safeJson<JobStatusDocument>(path);
  writeStatus(path, {
    ...previous,
    creator_id: creatorId,
    state: "cancelling",
    updated: Date.now() / 1000,
    message: "Stopping the clipper process tree.",
  });
  try {
    await terminateProcessTree(running.child);
    // Python writes status atomically too. A genuinely completed manifest wins the race;
    // otherwise publish cancelled only after the whole process tree is confirmed gone.
    const completed = completedManifestStatus(jobId, creatorId);
    if (completed) writeStatus(path, completed);
    else {
      terminalStatus(path, creatorId, "cancelled", "Cancelled by the creator.");
    }
    unregisterRunningJob(jobId, running.child);
  } catch (error) {
    const completed = completedManifestStatus(jobId, creatorId);
    if (completed) {
      writeStatus(path, completed);
      return readIngestJob(jobId, creatorId) ?? job;
    }
    writeStatus(path, {
      ...previous,
      creator_id: creatorId,
      state: "cancelling",
      updated: Date.now() / 1000,
      message: `Process-tree termination could not be confirmed: ${(error as Error).message}. Resolve the host process before starting another ingest.`,
    });
    throw new IngestError("The job's process tree could not be confirmed stopped.", 500);
  }
  return readIngestJob(jobId, creatorId) ?? job;
}

const STAGE_TEMPLATE: Array<Omit<IngestStage, "state" | "detail">> = [
  { id: "resolve", label: "Resolving the source", truth: "yt-dlp reads metadata and captions. No video bytes are downloaded yet." },
  { id: "transcript", label: "Reading the transcript", truth: "Parses captions into sentences and scores candidate windows." },
  { id: "memory", label: "Ranking candidate moments", truth: "Uses channel memory when enabled; otherwise ranks standalone transcript or audio signals." },
  { id: "render", label: "Cutting and reframing", truth: "ffmpeg extracts each window, reframes to vertical, burns captions, then QC-checks the result." },
  { id: "done", label: "Manifest written", truth: "Clips and their evidence trail are handed to Studio." },
];
const STAGE_ORDER = STAGE_TEMPLATE.map((stage) => stage.id);

function structuredProgress(status: JobStatusDocument | null): {
  states: Record<StageId, StageState>;
  details: Partial<Record<StageId, string>>;
} | null {
  if (!status?.stage || !STAGE_ORDER.includes(status.stage)) return null;
  const current = STAGE_ORDER.indexOf(status.stage);
  const states = Object.fromEntries(STAGE_ORDER.map((id, index) => {
    let state: StageState = index < current ? "complete" : index === current ? "running" : "pending";
    if (status.state === "complete") state = "complete";
    else if (index === current && status.state === "failed") state = "failed";
    else if (index === current && status.state === "cancelled") state = "cancelled";
    return [id, state];
  })) as Record<StageId, StageState>;
  return {
    states,
    details: status.detail ? { [status.stage]: status.detail } : {},
  };
}

function parseProgress(log: string): { states: Record<StageId, StageState>; details: Partial<Record<StageId, string>>; lines: string[] } {
  const states: Record<StageId, StageState> = {
    resolve: "pending", transcript: "pending", memory: "pending", render: "pending", done: "pending",
  };
  const details: Partial<Record<StageId, string>> = {};
  const lines = log.split(/\r?\n/).filter(Boolean);

  for (const line of lines) {
    if (line.includes("job") && line.includes("start (")) {
      states.resolve = "running";
    }
    if (/resolved|\[transcript\]|decision phase/.test(line)) {
      states.resolve = "complete";
    }
    const decision = line.match(/decision phase \[(\w+)\]: (\d+) words, (\d+) sentences.*?in ([\d.]+)s/);
    if (decision) {
      states.transcript = "complete";
      details.transcript = `${decision[2]} words, ${decision[3]} sentences`;
      // The memory pass runs inside the decision phase; a long one means it did work.
      states.memory = "complete";
      details.memory = `judged in ${decision[4]}s`;
    }
    if (line.includes("extracted ")) {
      states.render = "running";
    }
    const rendered = line.match(/rendered (\S+) (\d+x\d+) ([\d.]+)s in ([\d.]+)s \((\w+)\)/);
    if (rendered) {
      states.render = "running";
      details.render = `${rendered[1]} ${rendered[2]} in ${rendered[4]}s`;
    }
    if (/job .* done:/.test(line)) {
      states.render = "complete";
      states.done = "complete";
      const ok = line.match(/done: (\d+)\/(\d+) clips ok in ([\d.]+)s/);
      if (ok) details.done = `${ok[1]}/${ok[2]} clips in ${Math.round(Number(ok[3]))}s`;
    }
    if (/Traceback|error:|failed/i.test(line) && !/0 failed/.test(line)) {
      details.done = details.done ?? line.slice(0, 200);
    }
  }

  // Anything before the first incomplete stage must have happened.
  let seenIncomplete = false;
  for (const id of STAGE_ORDER) {
    if (states[id] === "complete" && !seenIncomplete) continue;
    if (states[id] !== "complete") {
      if (!seenIncomplete && states[id] === "pending") states[id] = "running";
      seenIncomplete = true;
    }
  }
  return { states, details, lines };
}

export function readIngestJob(jobId: string, creatorId: string): IngestJob | null {
  const dir = join(workdir(), jobId);
  if (!existsSync(dir)) return null;

  const log = safeRead(join(dir, "run.log")) ?? "";
  const status = safeJson<JobStatusDocument>(join(dir, "status.json"));
  const manifest = safeJson<{
    creator_id?: string | null;
    status?: string;
    clips?: Array<{ clip_id: string; ok?: boolean; signals?: Record<string, unknown> }>;
    memory?: { degraded?: boolean; reason?: string | null; callback_found?: boolean; callbacks_ranked_out?: number };
    message?: string | null;
  }>(join(dir, "manifest.json"));
  if (status?.creator_id !== creatorId || (manifest && manifest.creator_id !== creatorId)) {
    return null;
  }
  const validatedManifest = getClipManifestForJob(jobId, creatorId);
  const artifactValidationFailed = !validatedManifest
    && (Boolean(manifest) || status?.state === "complete");

  const legacy = parseProgress(log);
  const progress = structuredProgress(status) ?? legacy;
  const { states, details } = progress;
  const { lines } = legacy;
  const manifestComplete = validatedManifest?.status === "complete";
  const state: IngestJobState = artifactValidationFailed
    ? "failed"
    : manifestComplete
    ? "complete"
    : status?.state ?? (manifest ? "complete" : "started");

  if (!status?.stage && (state === "failed" || state === "cancelled")) {
    for (const stage of Object.keys(states) as StageId[]) {
      if (states[stage] === "running") states[stage] = state;
    }
  }
  if (state === "complete") {
    for (const stage of Object.keys(states) as StageId[]) states[stage] = "complete";
  }
  if (artifactValidationFailed) states.done = "failed";

  return {
    jobId,
    creatorId,
    state,
    message: artifactValidationFailed
      ? "The clipper wrote an invalid manifest. Its outputs are excluded from review."
      : validatedManifest?.message ?? status?.message,
    stages: STAGE_TEMPLATE.map((stage) => ({
      ...stage,
      state: states[stage.id],
      detail: details[stage.id],
    })),
    log: lines.slice(-40),
    clips: (validatedManifest?.clips ?? []).map((clip) => ({
      clipId: clip.clip_id,
      ok: clip.ok === true,
      callback: clip.callback === true,
      threadLabel: clip.callback ? clip.threadLabel : undefined,
    })),
    callbackFound: validatedManifest?.memory?.callback_found === true
      && validatedManifest.clips.some((clip) => clip.callback === true),
    callbacksRankedOut: validatedManifest?.memory?.callbacks_ranked_out,
    degraded: validatedManifest?.memory?.degraded,
    degradedReason: validatedManifest?.memory?.reason ?? null,
  };
}

function safeRead(path: string): string | null {
  try {
    return readFileSync(path, "utf-8");
  } catch {
    return null;
  }
}

function safeJson<T>(path: string): T | null {
  const raw = safeRead(path);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}
