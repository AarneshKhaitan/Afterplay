import { randomUUID } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

import { clipperRoot, type CachedSource } from "./sources";

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

type RunningJob = { creatorId: string; child: ChildProcess };

/** Child handles are intentionally process-local, unlike durable job truth on disk.
 *
 * A global registry survives Next development recompiles so the Stop button does not become a
 * lie after one edit. It is not treated as persistence: after a server restart an in-flight job
 * remains visible from status.json but cancellation fails explicitly because ownership of the OS
 * process can no longer be proven. */
const ingestGlobal = globalThis as typeof globalThis & {
  afterplayRunningIngestJobs?: Map<string, RunningJob>;
  afterplayIngestShutdownRegistered?: boolean;
};
const runningJobs = ingestGlobal.afterplayRunningIngestJobs ?? new Map<string, RunningJob>();
ingestGlobal.afterplayRunningIngestJobs = runningJobs;

if (!ingestGlobal.afterplayIngestShutdownRegistered) {
  ingestGlobal.afterplayIngestShutdownRegistered = true;
  process.once("exit", () => {
    if (process.platform === "win32") return;
    for (const { child } of runningJobs.values()) {
      if (!child.pid || child.exitCode !== null) continue;
      try {
        process.kill(-child.pid, "SIGKILL");
      } catch {
        // The process group may already have exited.
      }
    }
  });
}

const TERMINAL_STATES = new Set<IngestJobState>(["complete", "failed", "cancelled"]);
const ACTIVE_STATES = new Set<IngestJobState>(["started", "running", "cancelling"]);

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

function durableActiveJob(creatorId: string): string | null {
  let entries;
  try {
    entries = readdirSync(workdir(), { withFileTypes: true });
  } catch (error) {
    if (isNodeError(error, ["ENOENT"])) return null;
    throw error;
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const status = safeJson<JobStatusDocument>(statusPath(entry.name));
    if (status?.creator_id !== creatorId || !status.state || !ACTIVE_STATES.has(status.state)) {
      continue;
    }
    if (!completedManifestStatus(entry.name, creatorId)) return entry.name;
  }
  return null;
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

function workdir(): string {
  const configured = process.env.AFTERPLAY_WORKDIR ?? process.env.AFTERPLAY_CLIPPER_WORKDIR;
  if (configured) {
    // Same rule as the Python side: a relative value in .env is repo-root-relative.
    return configured.startsWith("/") || /^[A-Za-z]:/.test(configured)
      ? configured
      : join(process.cwd(), configured);
  }
  return join(clipperRoot(), ".work");
}

/** The interpreter that has the service's dependencies.
 *
 * A bare `python` picks up whatever is on PATH, which is exactly how a reviewer ended up
 * with `ModuleNotFoundError: No module named 'cv2'` and concluded the pipeline was
 * broken. Prefer the venv the README tells you to create. */
function pythonBin(): string {
  const root = clipperRoot();
  const candidates = [
    process.env.AFTERPLAY_PYTHON,
    join(root, ".venv", "Scripts", "python.exe"),
    join(root, ".venv", "bin", "python"),
  ].filter(Boolean) as string[];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return "python";
}

export function pythonConfigured(): { ok: boolean; interpreter: string } {
  const interpreter = pythonBin();
  return { ok: interpreter !== "python" || existsSync(interpreter), interpreter };
}

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
  source: { kind: "url"; url: string } | { kind: "cached"; source: CachedSource };
};

export function startIngestJob(options: StartOptions): { jobId: string; args: string[] } {
  for (const [jobId, running] of runningJobs) {
    if (running.child.exitCode !== null) runningJobs.delete(jobId);
  }
  if ([...runningJobs.values()].some((running) => running.creatorId === options.creator)) {
    throw new IngestError("An ingest job is already running for this creator.", 409);
  }
  const durableJobId = durableActiveJob(options.creator);
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
    "--platforms", options.platforms];
  if (options.memory) args.push("--memory");

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

  let child: ChildProcess;
  try {
    child = spawn(pythonBin(), args, {
      cwd: clipperRoot(),
      // No shell: user input reaches the process as argv, never as a command string.
      shell: false,
      // A POSIX process group lets Stop reach ffmpeg/yt-dlp descendants. Windows uses
      // taskkill /T instead; detached Python processes proved unreliable there.
      detached: process.platform !== "win32",
      windowsHide: true,
      stdio: ["ignore", fd, fd],
      env: { ...process.env, PYTHONPATH: clipperRoot(), PYTHONUNBUFFERED: "1" },
    });
  } catch (error) {
    terminalStatus(
      join(dir, "status.json"),
      options.creator,
      "failed",
      `The clipper process could not be created: ${(error as Error).message}`,
    );
    throw new IngestError("The clipper process could not be created.", 500);
  } finally {
    closeSync(fd);
  }
  runningJobs.set(options.jobId, { creatorId: options.creator, child });

  // A job that dies without writing a manifest must say so rather than appearing to run
  // forever. The CLI writes status.json itself on a clean failure; this covers the case
  // where the process never got that far.
  child.once("error", (error) => {
    const registered = runningJobs.get(options.jobId);
    if (registered?.child === child) runningJobs.delete(options.jobId);
    const statusPath = join(dir, "status.json");
    const current = safeJson<JobStatusDocument>(statusPath);
    if (!current?.state || !TERMINAL_STATES.has(current.state)) {
      terminalStatus(statusPath, options.creator, "failed", `The clipper could not start: ${error.message}`);
    }
  });
  child.once("exit", (code, signal) => {
    const registered = runningJobs.get(options.jobId);
    if (registered?.child === child) runningJobs.delete(options.jobId);

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

function processGroupExists(pid: number): boolean {
  try {
    process.kill(-pid, 0);
    return true;
  } catch (error) {
    if (isNodeError(error, ["ESRCH"])) return false;
    throw error;
  }
}

async function waitForProcessGroupExit(pid: number, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (processGroupExists(pid)) {
    if (Date.now() >= deadline) return false;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return true;
}

async function terminateProcessTree(child: ChildProcess): Promise<void> {
  if (!child.pid) return;
  if (process.platform === "win32") {
    if (child.exitCode !== null) {
      throw new Error("The clipper parent exited before its Windows process tree was confirmed stopped.");
    }
    await new Promise<void>((resolve, reject) => {
      const killer = spawn("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
        shell: false,
        windowsHide: true,
        stdio: "ignore",
      });
      let settled = false;
      const finish = (error?: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        if (error) reject(error);
        else resolve();
      };
      const timeout = setTimeout(() => {
        killer.kill();
        finish(new Error("taskkill did not finish within ten seconds."));
      }, 10_000);
      killer.once("error", (error) => finish(error));
      killer.once("exit", (code) => {
        if (code === 0) finish();
        else finish(new Error(`taskkill exited with code ${code}`));
      });
    });
    return;
  }

  const pid = child.pid;
  if (!pid) return;
  try {
    process.kill(-pid, "SIGTERM");
  } catch (error) {
    if (isNodeError(error, ["ESRCH"])) return;
    throw new Error("The clipper process group could not be signalled.");
  }
  if (await waitForProcessGroupExit(pid, 5_000)) return;

  try {
    process.kill(-pid, "SIGKILL");
  } catch (error) {
    if (isNodeError(error, ["ESRCH"])) return;
    throw new Error("The clipper process group could not be force-stopped.");
  }
  if (!await waitForProcessGroupExit(pid, 2_000)) {
    throw new Error("The clipper process group remained alive after SIGKILL.");
  }
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

  const running = runningJobs.get(jobId);
  if (!running || running.creatorId !== creatorId) {
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
    const registered = runningJobs.get(jobId);
    if (registered?.child === running.child) runningJobs.delete(jobId);
  } catch (error) {
    const completed = completedManifestStatus(jobId, creatorId);
    if (completed) {
      writeStatus(path, completed);
      return readIngestJob(jobId, creatorId) ?? job;
    }
    if (running.child.exitCode !== null) {
      writeStatus(path, {
        ...previous,
        creator_id: creatorId,
        state: "cancelling",
        updated: Date.now() / 1000,
        message: "The parent exited, but process-tree termination could not be confirmed. Resolve the host process before starting another ingest.",
      });
      throw new IngestError("The job's process tree could not be confirmed stopped.", 500);
    }
    writeStatus(path, {
      ...previous,
      creator_id: creatorId,
      state: previous?.state === "started" ? "started" : "running",
      updated: Date.now() / 1000,
      message: `Cancellation failed: ${(error as Error).message}. Retry Stop.`,
    });
    throw new IngestError("The job could not be stopped. Check the host process list.", 500);
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

  const legacy = parseProgress(log);
  const progress = structuredProgress(status) ?? legacy;
  const { states, details } = progress;
  const { lines } = legacy;
  const manifestComplete = manifest?.status === "complete" && Array.isArray(manifest.clips);
  const state: IngestJobState = manifestComplete
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

  return {
    jobId,
    creatorId,
    state,
    message: manifest?.message ?? status?.message,
    stages: STAGE_TEMPLATE.map((stage) => ({
      ...stage,
      state: states[stage.id],
      detail: details[stage.id],
    })),
    log: lines.slice(-40),
    clips: (manifest?.clips ?? []).map((clip) => ({
      clipId: clip.clip_id,
      ok: clip.ok !== false,
      callback: (clip.signals as { callback?: boolean } | undefined)?.callback === true,
      threadLabel: (clip.signals as { thread_label?: string } | undefined)?.thread_label,
    })),
    callbackFound: manifest?.memory?.callback_found,
    callbacksRankedOut: manifest?.memory?.callbacks_ranked_out,
    degraded: manifest?.memory?.degraded,
    degradedReason: manifest?.memory?.reason ?? null,
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
