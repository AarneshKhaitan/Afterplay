import { spawn, type ChildProcess, type StdioOptions } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { clipperRoot } from "./sources";

export type ProcessJobKind = "ingest" | "channel-backfill";

export type RunningProcessJob = {
  jobId: string;
  creatorId: string;
  kind: ProcessJobKind;
  child: ChildProcess;
};

type DurableStatusDocument = {
  creator_id?: string | null;
  state?: string;
};

type LegacyRunningProcessJob = Omit<RunningProcessJob, "jobId" | "kind">;

const ACTIVE_STATES = new Set(["started", "running", "cancelling"]);

/** Process handles are intentionally process-local, while job truth remains on disk.
 *
 * The map lives on globalThis so Next development recompiles do not orphan the Stop
 * button. It is shared by every Python workflow: only one process may mutate a creator's
 * memory at a time, regardless of whether that process is clipping or backfilling.
 */
const processGlobal = globalThis as typeof globalThis & {
  afterplayRunningProcessJobs?: Map<string, RunningProcessJob | LegacyRunningProcessJob>;
  afterplayRunningIngestJobs?: Map<string, RunningProcessJob | LegacyRunningProcessJob>;
  afterplayProcessShutdownRegistered?: boolean;
  afterplayIngestShutdownRegistered?: boolean;
};

// Adopt the previous ingest-only registry during a hot reload so existing handles remain
// cancellable while this extraction lands.
const runningJobs = processGlobal.afterplayRunningProcessJobs
  ?? processGlobal.afterplayRunningIngestJobs
  ?? new Map<string, RunningProcessJob>();
processGlobal.afterplayRunningProcessJobs = runningJobs;
processGlobal.afterplayRunningIngestJobs = runningJobs;

if (!processGlobal.afterplayProcessShutdownRegistered
    && !processGlobal.afterplayIngestShutdownRegistered) {
  processGlobal.afterplayProcessShutdownRegistered = true;
  processGlobal.afterplayIngestShutdownRegistered = true;
  process.once("exit", () => {
    if (process.platform === "win32") return;
    for (const running of runningJobs.values()) {
      if (!running.child.pid || running.child.exitCode !== null) continue;
      try {
        process.kill(-running.child.pid, "SIGKILL");
      } catch {
        // The process group may already have exited.
      }
    }
  });
}

export class CreatorProcessConflictError extends Error {
  constructor(readonly activeJob: Pick<RunningProcessJob, "jobId" | "creatorId" | "kind">) {
    super(`Job ${activeJob.jobId} is already running for creator ${activeJob.creatorId}.`);
    this.name = "CreatorProcessConflictError";
  }
}

export function workdir(): string {
  const configured = process.env.AFTERPLAY_WORKDIR ?? process.env.AFTERPLAY_CLIPPER_WORKDIR;
  if (configured) {
    // Same rule as the Python side: a relative value in .env is repo-root-relative.
    return configured.startsWith("/") || /^[A-Za-z]:/.test(configured)
      ? configured
      : join(process.cwd(), configured);
  }
  return join(clipperRoot(), ".work");
}

/** Resolve the interpreter that owns the clipper service's dependencies. */
export function pythonBin(): string {
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

function normalizeRunningJob(jobId: string, running: RunningProcessJob | LegacyRunningProcessJob): RunningProcessJob {
  return {
    jobId,
    creatorId: running.creatorId,
    kind: "kind" in running ? running.kind : "ingest",
    child: running.child,
  };
}

function pruneExitedJobs(): void {
  for (const [jobId, running] of runningJobs) {
    if (running.child.exitCode !== null) runningJobs.delete(jobId);
  }
}

export function runningJobForCreator(creatorId: string): RunningProcessJob | null {
  pruneExitedJobs();
  for (const [jobId, running] of runningJobs) {
    if (running.creatorId === creatorId) return normalizeRunningJob(jobId, running);
  }
  return null;
}

export function runningJob(
  jobId: string,
  creatorId: string,
  kind: ProcessJobKind,
): RunningProcessJob | null {
  const running = runningJobs.get(jobId);
  if (!running || running.creatorId !== creatorId) return null;
  const normalized = normalizeRunningJob(jobId, running);
  return normalized.kind === kind ? normalized : null;
}

export function registerRunningJob(job: RunningProcessJob): void {
  const active = runningJobForCreator(job.creatorId);
  if (active) throw new CreatorProcessConflictError(active);
  if (runningJobs.has(job.jobId)) {
    throw new CreatorProcessConflictError(normalizeRunningJob(job.jobId, runningJobs.get(job.jobId)!));
  }
  runningJobs.set(job.jobId, job);
}

export function unregisterRunningJob(jobId: string, child: ChildProcess): void {
  const registered = runningJobs.get(jobId);
  if (registered?.child === child) runningJobs.delete(jobId);
}

export type SpawnPythonJobOptions = {
  jobId: string;
  creatorId: string;
  kind: ProcessJobKind;
  args: string[];
  stdio: StdioOptions;
};

export function spawnPythonJob(options: SpawnPythonJobOptions): ChildProcess {
  const active = runningJobForCreator(options.creatorId);
  if (active) throw new CreatorProcessConflictError(active);
  const duplicateId = runningJobs.get(options.jobId);
  if (duplicateId) {
    throw new CreatorProcessConflictError(normalizeRunningJob(options.jobId, duplicateId));
  }

  const child = spawn(pythonBin(), options.args, {
    cwd: clipperRoot(),
    // No shell: user input reaches the process as argv, never as a command string.
    shell: false,
    // A POSIX process group lets Stop reach descendants. Windows uses taskkill /T;
    // detached Python processes proved unreliable there.
    detached: process.platform !== "win32",
    windowsHide: true,
    stdio: options.stdio,
    env: { ...process.env, PYTHONPATH: clipperRoot(), PYTHONUNBUFFERED: "1" },
  });
  registerRunningJob({
    jobId: options.jobId,
    creatorId: options.creatorId,
    kind: options.kind,
    child,
  });
  return child;
}

/** Find an active durable job for this creator in the shared workflow directory.
 *
 * A caller may dismiss an active-looking status only when its own terminal artifact
 * proves completion. This preserves ingest's status/manifest race handling without
 * teaching the shared registry about clip manifests.
 */
export function durableActiveJob(
  creatorId: string,
  isDurablyComplete: (jobId: string, creatorId: string) => boolean = () => false,
): string | null {
  let entries;
  try {
    entries = readdirSync(workdir(), { withFileTypes: true });
  } catch (error) {
    if (isNodeError(error, ["ENOENT"])) return null;
    throw error;
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const status = safeJson<DurableStatusDocument>(join(workdir(), entry.name, "status.json"));
    if (status?.creator_id !== creatorId || !status.state || !ACTIVE_STATES.has(status.state)) {
      continue;
    }
    if (!isDurablyComplete(entry.name, creatorId)) return entry.name;
  }
  return null;
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

export async function terminateProcessTree(child: ChildProcess): Promise<void> {
  if (!child.pid) return;
  if (process.platform === "win32") {
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

function safeJson<T>(path: string): T | null {
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as T;
  } catch {
    return null;
  }
}

function isNodeError(error: unknown, codes: readonly string[]): boolean {
  return typeof error === "object" && error !== null && "code" in error
    && typeof error.code === "string" && codes.includes(error.code);
}
