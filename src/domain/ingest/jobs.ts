import { spawn } from "node:child_process";
import { existsSync, mkdirSync, openSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { clipperRoot, type CachedSource } from "./sources";

/** Server-only. Spawns the Python clipper and reads its progress off disk. */

export type StageId = "resolve" | "transcript" | "memory" | "render" | "done";
export type StageState = "pending" | "running" | "complete" | "failed";

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
  state: "started" | "complete" | "failed";
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
  const dir = join(workdir(), options.jobId);
  mkdirSync(dir, { recursive: true });

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
    else throw new IngestError("That cached source has neither media nor saved metadata.");
    args.push("--vtt", vttPath);
  }

  // The CLI logs progress to stderr; keep it so the status endpoint can report real
  // stages instead of a spinner that means nothing.
  const logPath = join(dir, "run.log");
  const fd = openSync(logPath, "a");

  const child = spawn(pythonBin(), args, {
    cwd: clipperRoot(),
    // No shell: user input reaches the process as argv, never as a command string.
    shell: false,
    // NOT detached. On Windows a detached child was dying silently a few seconds in —
    // the run.log held only the start banner and no traceback, while the identical
    // command run by hand completed. Keeping it in the server's process group makes the
    // job live exactly as long as the server, which is what an operator expects anyway,
    // and lets us record an exit that would otherwise vanish.
    detached: false,
    stdio: ["ignore", fd, fd],
    env: { ...process.env, PYTHONPATH: clipperRoot(), PYTHONUNBUFFERED: "1" },
  });

  // A job that dies without writing a manifest must say so rather than appearing to run
  // forever. The CLI writes status.json itself on a clean failure; this covers the case
  // where the process never got that far.
  child.on("exit", (code, signal) => {
    if (code === 0) return;
    const statusPath = join(dir, "status.json");
    try {
      const raw = readFileSync(statusPath, "utf-8");
      if ((JSON.parse(raw) as { state?: string }).state !== "started") return;
    } catch { /* no status yet: fall through and write one */ }
    writeFileSync(statusPath, JSON.stringify({
      state: "failed",
      updated: Date.now() / 1000,
      message: signal
        ? `The clipper was terminated by ${signal}.`
        : `The clipper exited with code ${code}. See run.log.`,
    }), "utf-8");
  });
  child.unref();

  return { jobId: options.jobId, args };
}

const STAGE_TEMPLATE: Array<Omit<IngestStage, "state" | "detail">> = [
  { id: "resolve", label: "Resolving the source", truth: "yt-dlp reads metadata and captions. No video bytes are downloaded yet." },
  { id: "transcript", label: "Reading the transcript", truth: "Parses captions into sentences and scores candidate windows." },
  { id: "memory", label: "Searching channel memory", truth: "Embeds every candidate window once, then asks the model to judge the closest past threads." },
  { id: "render", label: "Cutting and reframing", truth: "ffmpeg extracts each window, reframes to vertical, burns captions, then QC-checks the result." },
  { id: "done", label: "Manifest written", truth: "Clips and their evidence trail are handed to Studio." },
];

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
  const order: StageId[] = ["resolve", "transcript", "memory", "render", "done"];
  let seenIncomplete = false;
  for (const id of order) {
    if (states[id] === "complete" && !seenIncomplete) continue;
    if (states[id] !== "complete") {
      if (!seenIncomplete && states[id] === "pending") states[id] = "running";
      seenIncomplete = true;
    }
  }
  return { states, details, lines };
}

export function readIngestJob(jobId: string): IngestJob | null {
  const dir = join(workdir(), jobId);
  if (!existsSync(dir)) return null;

  const log = safeRead(join(dir, "run.log")) ?? "";
  const status = safeJson<{ state?: IngestJob["state"]; message?: string }>(join(dir, "status.json"));
  const manifest = safeJson<{
    clips?: Array<{ clip_id: string; ok?: boolean; signals?: Record<string, unknown> }>;
    memory?: { degraded?: boolean; reason?: string | null; callback_found?: boolean; callbacks_ranked_out?: number };
    message?: string | null;
  }>(join(dir, "manifest.json"));

  const { states, details, lines } = parseProgress(log);
  const state = status?.state ?? (manifest ? "complete" : "started");

  if (state === "failed") {
    for (const stage of Object.keys(states) as StageId[]) {
      if (states[stage] === "running") states[stage] = "failed";
    }
  }
  if (state === "complete") {
    for (const stage of Object.keys(states) as StageId[]) states[stage] = "complete";
  }

  return {
    jobId,
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
