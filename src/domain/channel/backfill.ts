import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { z } from "zod";

import { readVersionedJson, writeVersionedJson, type VersionedJsonSchema } from "../persist-core";
import { clipperRoot } from "../ingest/sources";
import {
  CreatorProcessConflictError,
  durableActiveJob,
  pythonBin,
  runningJob,
  runningJobForCreator,
  spawnPythonJob,
  terminateProcessTree,
  unregisterRunningJob,
  workdir,
  type SpawnPythonJobOptions,
} from "../ingest/process";
import {
  channelPreviewSchema,
  CREATOR_ID_PATTERN,
  JOB_ID_PATTERN,
  pythonBackfillReportSchema,
  pythonBackfillStatusSchema,
  VIDEO_ID_PATTERN,
  type ChannelPreview,
  type FootageRights,
} from "./contracts";

const PREVIEW_TIMEOUT_MS = 25_000;
const OUTPUT_LIMIT = 1_000_000;
const TERMINAL_STATES = new Set<ChannelBackfillJobState>([
  "complete", "partial", "failed", "cancelled",
]);

export type ChannelBackfillJobState =
  | "started"
  | "running"
  | "cancelling"
  | "complete"
  | "partial"
  | "failed"
  | "cancelled";

export type ChannelBackfillVideo = {
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

export type ChannelBackfillJob = {
  schema: "afterplay.channel-backfill-job";
  version: 1;
  jobId: string;
  creatorId: string;
  channel: string;
  footageRights: FootageRights;
  workers: number;
  state: ChannelBackfillJobState;
  progress: { done: number; total: number };
  activeChildId: string | null;
  videos: ChannelBackfillVideo[];
  message: string;
  createdAt: string;
  updatedAt: string;
};

export type StartChannelBackfillOptions = {
  channel: string;
  creatorId: string;
  videoIds: string[];
  footageRights: FootageRights;
  workers: number;
};

type PreviewRuntime = {
  spawn: (args: string[]) => ChildProcess;
  terminate: (child: ChildProcess) => Promise<void>;
  timeoutMs: number;
};

type BackfillRuntime = {
  spawn: (options: SpawnPythonJobOptions) => ChildProcess;
  terminate: (child: ChildProcess) => Promise<void>;
  pollMs: number;
};

const jobStateSchema = z.enum([
  "started", "running", "cancelling", "complete", "partial", "failed", "cancelled",
]);
const videoSchema = z.object({
  videoId: z.string().regex(VIDEO_ID_PATTERN),
  childJobId: z.string().regex(JOB_ID_PATTERN),
  state: z.enum(["pending", "running", "complete", "failed", "cancelled"]),
  sections: z.object({
    read: z.number().int().nonnegative(),
    total: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative(),
  }).strict(),
  threadsSuggested: z.number().int().nonnegative(),
  threadsAdded: z.number().int().nonnegative(),
  transcriptLanguage: z.string().nullable().optional(),
  transcriptSource: z.string().nullable().optional(),
  subtitleTrack: z.string().nullable().optional(),
  error: z.string().nullable().optional(),
  log: z.array(z.string()),
}).strict();
const jobValueSchema = z.object({
  schema: z.literal("afterplay.channel-backfill-job"),
  version: z.literal(1),
  jobId: z.string().regex(JOB_ID_PATTERN),
  creatorId: z.string().regex(CREATOR_ID_PATTERN),
  channel: z.string().min(1),
  footageRights: z.enum([
    "project_owned", "creator_owned", "permission_granted", "licensed", "not_cleared",
  ]),
  workers: z.number().int().min(1).max(16),
  state: jobStateSchema,
  progress: z.object({
    done: z.number().int().nonnegative(), total: z.number().int().positive(),
  }).strict(),
  activeChildId: z.string().regex(JOB_ID_PATTERN).nullable(),
  videos: z.array(videoSchema).min(1),
  message: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
}).strict();

const jobSchema: VersionedJsonSchema<ChannelBackfillJob> = {
  name: "channel.backfill-job",
  version: 1,
  acceptLegacy: false,
  accepts: (value): value is ChannelBackfillJob => jobValueSchema.safeParse(value).success,
};

export class ChannelBackfillError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ChannelBackfillError";
  }
}

const defaultPreviewRuntime: PreviewRuntime = {
  spawn: (args) => spawn(pythonBin(), args, {
    cwd: clipperRoot(),
    shell: false,
    detached: process.platform !== "win32",
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, PYTHONPATH: clipperRoot(), PYTHONUNBUFFERED: "1" },
  }),
  terminate: terminateProcessTree,
  timeoutMs: PREVIEW_TIMEOUT_MS,
};

const defaultBackfillRuntime: BackfillRuntime = {
  spawn: spawnPythonJob,
  terminate: terminateProcessTree,
  pollMs: 100,
};

export async function previewChannel(
  channel: string,
  limit: number,
  runtimeOverrides: Partial<PreviewRuntime> = {},
): Promise<ChannelPreview> {
  const runtime = { ...defaultPreviewRuntime, ...runtimeOverrides };
  const args = [
    "-m", "afterplay.cli", "backfill-channel", channel,
    "--dry-run", "--limit", String(limit),
  ];
  const child = runtime.spawn(args);

  return new Promise<ChannelPreview>((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    let settled = false;
    let timingOut = false;

    const finish = (error?: Error, preview?: ChannelPreview) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (error) reject(error);
      else resolve(preview!);
    };
    const append = (current: string, chunk: unknown) => {
      const next = current + String(chunk);
      if (next.length > OUTPUT_LIMIT) {
        throw new ChannelBackfillError(
          "channel_invalid_response",
          "The channel preview produced more output than the service can safely accept.",
          502,
        );
      }
      return next;
    };

    child.stdout?.on("data", (chunk) => {
      try {
        stdout = append(stdout, chunk);
      } catch (error) {
        void runtime.terminate(child).then(
          () => finish(error as Error),
          () => finish(new ChannelBackfillError(
            "channel_termination_failed",
            "The oversized preview process could not be confirmed stopped.",
            500,
          )),
        );
      }
    });
    child.stderr?.on("data", (chunk) => {
      try {
        stderr = append(stderr, chunk);
      } catch (error) {
        void runtime.terminate(child).then(() => finish(error as Error), () => finish(error as Error));
      }
    });

    child.once("error", () => {
      if (timingOut) return;
      finish(new ChannelBackfillError(
        "channel_preview_unavailable",
        "The channel preview process could not be started.",
        503,
      ));
    });
    child.once("exit", (code) => {
      if (timingOut || settled) return;
      if (code !== 0) {
        finish(mapPythonPreviewError(stderr));
        return;
      }
      let decoded: unknown;
      try {
        decoded = JSON.parse(stdout) as unknown;
      } catch {
        finish(new ChannelBackfillError(
          "channel_invalid_response",
          "The channel preview returned invalid JSON.",
          502,
        ));
        return;
      }
      const parsed = channelPreviewSchema.safeParse(decoded);
      if (!parsed.success) {
        finish(new ChannelBackfillError(
          "channel_invalid_response",
          "The channel preview did not match the supported version-1 contract.",
          502,
        ));
        return;
      }
      finish(undefined, parsed.data);
    });

    const timeout = setTimeout(() => {
      timingOut = true;
      void runtime.terminate(child).then(
        () => finish(new ChannelBackfillError(
          "channel_timeout",
          "The channel listing exceeded 25 seconds and was stopped. Retry or use the rehearsed cached workspace.",
          504,
        )),
        () => finish(new ChannelBackfillError(
          "channel_termination_failed",
          "The timed-out channel listing could not be confirmed stopped.",
          500,
        )),
      );
    }, runtime.timeoutMs);
  });
}

function mapPythonPreviewError(stderr: string): ChannelBackfillError {
  let decoded: unknown;
  try {
    decoded = JSON.parse(stderr.trim()) as unknown;
  } catch {
    return new ChannelBackfillError(
      "channel_unavailable",
      "The channel could not be listed.",
      502,
    );
  }
  const parsed = z.object({ error: z.string(), message: z.string() }).strict().safeParse(decoded);
  if (!parsed.success) {
    return new ChannelBackfillError(
      "channel_unavailable",
      "The channel could not be listed.",
      502,
    );
  }
  const mapped: Record<string, { status: number; message: string }> = {
    invalid_channel: { status: 400, message: parsed.data.message },
    no_uploads: { status: 404, message: parsed.data.message },
    channel_blocked: { status: 503, message: parsed.data.message },
    channel_timeout: { status: 504, message: parsed.data.message },
    channel_unavailable: { status: 502, message: "The channel could not be listed." },
  };
  const error = mapped[parsed.data.error] ?? mapped.channel_unavailable;
  return new ChannelBackfillError(parsed.data.error in mapped ? parsed.data.error : "channel_unavailable", error.message, error.status);
}

export function newChannelBackfillJobId(): string {
  return `channel_${randomUUID().replaceAll("-", "").slice(0, 12)}`;
}

export function startChannelBackfillJob(
  options: StartChannelBackfillOptions,
  runtimeOverrides: Partial<BackfillRuntime> = {},
): ChannelBackfillJob {
  assertStartOptions(options);
  const active = runningJobForCreator(options.creatorId);
  if (active) throw conflict(active.jobId);
  const durable = durableActiveJob(options.creatorId, isDurablyComplete);
  if (durable) throw conflict(durable);

  const jobId = newChannelBackfillJobId();
  const now = new Date().toISOString();
  const job: ChannelBackfillJob = {
    schema: "afterplay.channel-backfill-job",
    version: 1,
    jobId,
    creatorId: options.creatorId,
    channel: options.channel,
    footageRights: options.footageRights,
    workers: options.workers,
    state: "started",
    progress: { done: 0, total: options.videoIds.length },
    activeChildId: null,
    videos: options.videoIds.map((videoId, index) => ({
      videoId,
      childJobId: `${jobId}_v${index + 1}`,
      state: "pending",
      sections: { read: 0, total: 0, failed: 0 },
      threadsSuggested: 0,
      threadsAdded: 0,
      log: [],
    })),
    message: "Channel backfill queued. Captions only; media and ASR are disabled.",
    createdAt: now,
    updatedAt: now,
  };
  saveJob(job);

  const runtime = { ...defaultBackfillRuntime, ...runtimeOverrides };
  void runChannelBackfill(jobId, runtime).catch((error) => {
    patchJob(jobId, (current) => {
      if (TERMINAL_STATES.has(current.state) || current.state === "cancelling") return current;
      return {
        ...current,
        state: "failed",
        activeChildId: null,
        message: `The channel backfill stopped unexpectedly: ${(error as Error).message}`,
      };
    });
  });
  return job;
}

export function loadJob(jobId: string): ChannelBackfillJob | null {
  if (!JOB_ID_PATTERN.test(jobId)) return null;
  return readVersionedJson(jobPath(jobId), jobSchema);
}

export function loadJobForCreator(jobId: string, creatorId: string): ChannelBackfillJob | null {
  const job = loadJob(jobId);
  return job?.creatorId === creatorId ? job : null;
}

export async function cancelChannelBackfillJob(
  jobId: string,
  creatorId: string,
  runtimeOverrides: Partial<Pick<BackfillRuntime, "terminate">> = {},
): Promise<ChannelBackfillJob> {
  const job = loadJobForCreator(jobId, creatorId);
  if (!job) throw new ChannelBackfillError("job_not_found", "No such channel backfill job.", 404);
  if (TERMINAL_STATES.has(job.state)) return job;

  const cancelling = patchJob(jobId, (current) => ({
    ...current,
    state: "cancelling",
    message: "Stopping the active captions process. Completed videos are kept.",
  }));
  const childId = cancelling.activeChildId;
  if (!childId) {
    return patchJob(jobId, cancelledJob);
  }

  const active = runningJob(childId, creatorId, "channel-backfill");
  if (!active) {
    throw new ChannelBackfillError(
      "job_not_cancellable",
      "The job is durable, but its process handle was lost after a server restart. Stop it from the host before retrying.",
      409,
    );
  }

  const terminate = runtimeOverrides.terminate ?? defaultBackfillRuntime.terminate;
  try {
    await terminate(active.child);
    unregisterRunningJob(childId, active.child);
  } catch (error) {
    patchJob(jobId, (current) => ({
      ...current,
      state: "cancelling",
      message: `Process-tree termination could not be confirmed: ${(error as Error).message}`,
    }));
    throw new ChannelBackfillError(
      "cancel_failed",
      "The channel backfill process tree could not be confirmed stopped.",
      500,
    );
  }
  return patchJob(jobId, cancelledJob);
}

async function runChannelBackfill(jobId: string, runtime: BackfillRuntime): Promise<void> {
  let initial = loadJob(jobId);
  if (!initial) return;
  patchJob(jobId, (job) => ({
    ...job,
    state: "running",
    message: `Reading captions for ${job.videos.length} video${job.videos.length === 1 ? "" : "s"} sequentially.`,
  }));

  for (let index = 0; index < initial.videos.length; index += 1) {
    const before = loadJob(jobId);
    if (!before || before.state === "cancelling" || before.state === "cancelled") return;
    await runVideo(jobId, index, runtime);
    const after = loadJob(jobId);
    if (!after || after.state === "cancelling" || after.state === "cancelled") return;
    initial = after;
  }

  patchJob(jobId, (job) => {
    if (job.state === "cancelling" || job.state === "cancelled") return job;
    const succeeded = job.videos.filter((video) => video.state === "complete").length;
    const failed = job.videos.filter((video) => video.state === "failed").length;
    const state: ChannelBackfillJobState = succeeded === job.videos.length
      ? "complete"
      : succeeded > 0
        ? "partial"
        : "failed";
    return {
      ...job,
      state,
      activeChildId: null,
      progress: { done: succeeded + failed, total: job.videos.length },
      message: `${succeeded} of ${job.videos.length} videos contributed. ${failed} were skipped or failed.`,
    };
  });
}

async function runVideo(jobId: string, index: number, runtime: BackfillRuntime): Promise<void> {
  const parent = loadJob(jobId);
  if (!parent) return;
  const selected = parent.videos[index];
  patchJob(jobId, (job) => ({
    ...job,
    activeChildId: selected.childJobId,
    videos: replaceVideo(job.videos, index, {
      ...job.videos[index],
      state: "running",
      error: null,
    }),
    message: `Reading captions for video ${index + 1} of ${job.videos.length}.`,
  }));

  const args = [
    "-m", "afterplay.cli", "backfill-channel", parent.channel,
    "--creator", parent.creatorId,
    // "=" form, not a separate argv entry: YouTube ids may start with "-" and argparse
    // would otherwise read the id as a flag and exit 2.
    `--videos=${selected.videoId}`,
    "--rights", parent.footageRights,
    "--job-id", selected.childJobId,
    "--workers", String(parent.workers),
  ];

  let child: ChildProcess;
  try {
    child = runtime.spawn({
      jobId: selected.childJobId,
      creatorId: parent.creatorId,
      kind: "channel-backfill",
      args,
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    const message = error instanceof CreatorProcessConflictError
      ? "Another creator workflow started before this video could begin."
      : "The captions process could not be started.";
    markVideoFailed(jobId, index, message);
    return;
  }

  let output = "";
  const appendOutput = (chunk: unknown) => {
    output = `${output}${String(chunk)}`.slice(-OUTPUT_LIMIT);
  };
  child.stdout?.on("data", appendOutput);
  child.stderr?.on("data", appendOutput);

  const poll = setInterval(() => reconcileChildStatus(jobId, index), runtime.pollMs);
  const result = await waitForChild(child);
  clearInterval(poll);
  unregisterRunningJob(selected.childJobId, child);

  const latest = loadJob(jobId);
  if (!latest || latest.state === "cancelling" || latest.state === "cancelled") return;
  const report = readChildReport(selected.childJobId, parent.creatorId, selected.videoId);
  if (!report) {
    markVideoFailed(
      jobId,
      index,
      result.error
        ? "The captions process could not run."
        : `The captions process exited${result.signal ? ` on ${result.signal}` : ` with code ${result.code ?? "unknown"}`} without a valid report.`,
      output,
    );
    return;
  }

  const video = report.videos[0];
  patchJob(jobId, (job) => ({
    ...job,
    activeChildId: null,
    progress: { done: Math.min(index + 1, job.videos.length), total: job.videos.length },
    videos: replaceVideo(job.videos, index, {
      ...job.videos[index],
      state: video.state,
      sections: {
        read: video.sections_read,
        total: video.sections_total,
        failed: video.sections_failed,
      },
      threadsSuggested: video.threads_suggested,
      threadsAdded: video.threads_added,
      transcriptLanguage: video.transcript_language,
      transcriptSource: video.transcript_source,
      subtitleTrack: video.subtitle_track,
      error: video.error,
      log: outputLines(output),
    }),
  }));
}

function reconcileChildStatus(jobId: string, index: number): void {
  const job = loadJob(jobId);
  if (!job || job.state !== "running") return;
  const child = job.videos[index];
  const decoded = safeJson(join(workdir(), child.childJobId, "status.json"));
  const parsed = pythonBackfillStatusSchema.safeParse(decoded);
  if (!parsed.success || parsed.data.creator_id !== job.creatorId || !parsed.data.video) return;
  const status = parsed.data.video;
  if (status.video_id !== child.videoId) return;
  patchJob(jobId, (current) => {
    if (current.state !== "running") return current;
    return {
      ...current,
      videos: replaceVideo(current.videos, index, {
        ...current.videos[index],
        sections: {
          read: status.sections_read,
          total: status.sections_total,
          failed: status.sections_failed,
        },
        threadsSuggested: status.threads_suggested,
        threadsAdded: status.threads_added,
      }),
    };
  });
}

function readChildReport(childJobId: string, creatorId: string, videoId: string) {
  const decoded = safeJson(join(workdir(), childJobId, "report.json"));
  const parsed = pythonBackfillReportSchema.safeParse(decoded);
  if (!parsed.success) return null;
  if (parsed.data.job_id !== childJobId || parsed.data.creator_id !== creatorId) return null;
  if (parsed.data.videos.length !== 1 || parsed.data.videos[0].video_id !== videoId) return null;
  return parsed.data;
}

function waitForChild(child: ChildProcess): Promise<{
  code: number | null;
  signal: NodeJS.Signals | null;
  error?: Error;
}> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value: { code: number | null; signal: NodeJS.Signals | null; error?: Error }) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    child.once("error", (error) => finish({ code: null, signal: null, error }));
    child.once("exit", (code, signal) => finish({ code, signal }));
  });
}

function assertStartOptions(options: StartChannelBackfillOptions): void {
  if (!CREATOR_ID_PATTERN.test(options.creatorId)) {
    throw new ChannelBackfillError("invalid_creator", "The creator id is not valid.", 400);
  }
  if (!options.channel.trim()) {
    throw new ChannelBackfillError("invalid_channel", "A channel is required.", 400);
  }
  if (!Number.isInteger(options.workers) || options.workers < 1 || options.workers > 16) {
    throw new ChannelBackfillError("invalid_workers", "Workers must be between 1 and 16.", 400);
  }
  if (options.videoIds.length < 1 || options.videoIds.length > 5) {
    throw new ChannelBackfillError("invalid_videos", "Select between 1 and 5 videos.", 400);
  }
  if (new Set(options.videoIds).size !== options.videoIds.length
      || options.videoIds.some((videoId) => !VIDEO_ID_PATTERN.test(videoId))) {
    throw new ChannelBackfillError("invalid_videos", "The selected video ids are not valid.", 400);
  }
}

function conflict(jobId: string): ChannelBackfillError {
  return new ChannelBackfillError(
    "channel_job_conflict",
    `Job ${jobId} is already active for this creator.`,
    409,
  );
}

function isDurablyComplete(jobId: string, creatorId: string): boolean {
  const channelJob = loadJobForCreator(jobId, creatorId);
  if (channelJob && TERMINAL_STATES.has(channelJob.state)) return true;
  const manifest = safeJson(join(workdir(), jobId, "manifest.json"));
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) return false;
  const record = manifest as Record<string, unknown>;
  return record.creator_id === creatorId
    && record.status === "complete"
    && Array.isArray(record.clips);
}

function jobPath(jobId: string): string {
  return join(workdir(), jobId, "channel-job.json");
}

function saveJob(job: ChannelBackfillJob): void {
  const value = { ...job, updatedAt: new Date().toISOString() };
  writeVersionedJson(jobPath(job.jobId), jobSchema, value);
  writeStatusMarker(value);
}

function patchJob(
  jobId: string,
  update: (job: ChannelBackfillJob) => ChannelBackfillJob,
): ChannelBackfillJob {
  const current = loadJob(jobId);
  if (!current) throw new ChannelBackfillError("job_not_found", "No such channel backfill job.", 404);
  const next = { ...update(current), updatedAt: new Date().toISOString() };
  saveJob(next);
  return next;
}

function writeStatusMarker(job: ChannelBackfillJob): void {
  const dir = join(workdir(), job.jobId);
  mkdirSync(dir, { recursive: true });
  const path = join(dir, "status.json");
  const temporary = `${path}.${process.pid}-${randomUUID()}.tmp`;
  try {
    writeFileSync(temporary, JSON.stringify({
      schema: "afterplay.channel-backfill-node-status",
      version: 1,
      job_id: job.jobId,
      creator_id: job.creatorId,
      state: job.state,
      stage: job.activeChildId ? "memory" : job.state === "started" ? "resolve" : "done",
      progress: job.progress,
      updated: Date.now() / 1000,
      message: job.message,
    }), "utf-8");
    renameSync(temporary, path);
  } finally {
    try {
      unlinkSync(temporary);
    } catch (error) {
      if (!isNodeError(error, ["ENOENT"])) throw error;
    }
  }
}

function markVideoFailed(jobId: string, index: number, message: string, output = ""): void {
  patchJob(jobId, (job) => {
    if (job.state === "cancelling" || job.state === "cancelled") return job;
    return {
      ...job,
      activeChildId: null,
      progress: { done: Math.min(index + 1, job.videos.length), total: job.videos.length },
      videos: replaceVideo(job.videos, index, {
        ...job.videos[index],
        state: "failed",
        error: message,
        log: outputLines(output),
      }),
    };
  });
}

function cancelledJob(job: ChannelBackfillJob): ChannelBackfillJob {
  const videos = job.videos.map((video) => {
    if (video.state === "complete" || video.state === "failed") return video;
    return {
      ...video,
      state: "cancelled" as const,
      error: video.state === "running"
        ? "Cancelled before this video completed."
        : "Cancelled before this video started.",
    };
  });
  return {
    ...job,
    state: "cancelled",
    activeChildId: null,
    progress: {
      done: videos.filter((video) => video.state !== "pending").length,
      total: job.videos.length,
    },
    videos,
    message: "Cancelled. Threads from videos that finished are kept.",
  };
}

function replaceVideo(
  videos: ChannelBackfillVideo[],
  index: number,
  replacement: ChannelBackfillVideo,
): ChannelBackfillVideo[] {
  return videos.map((video, current) => current === index ? replacement : video);
}

function outputLines(value: string): string[] {
  return value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).slice(-20);
}

function safeJson(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as unknown;
  } catch {
    return null;
  }
}

function isNodeError(error: unknown, codes: readonly string[]): boolean {
  return typeof error === "object" && error !== null && "code" in error
    && typeof error.code === "string" && codes.includes(error.code);
}

export function channelBackfillJobExists(jobId: string): boolean {
  return JOB_ID_PATTERN.test(jobId) && existsSync(jobPath(jobId));
}
