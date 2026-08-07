import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

export type ClipperManifestClip = {
  clip_id: string;
  platform: string;
  start: number;
  end: number;
  duration: number;
  path?: string | null;
  score?: number;
  why?: string;
  ok?: boolean;
  error?: string | null;
  signals?: Record<string, unknown>;
  text_for_copy?: string;
  copy?: {
    title?: string;
    caption?: string;
    hook_text_overlay?: string | null;
  };
  callback?: boolean;
  threadLabel?: string;
  callbackConfidence?: number;
  sourceStream?: string;
  sourceT?: number;
  sourceQuote?: string;
};

export type ClipperMemoryState = {
  enabled?: boolean;
  degraded?: boolean;
  reason?: string | null;
  threads_considered?: number;
  callback_found?: boolean;
};

export type ClipperJobStatus = {
  state?: "started" | "complete" | "failed";
  updated?: number;
  message?: string;
  manifest?: string;
};

export type ClipperManifest = {
  job_id: string;
  source: {
    title?: string;
    url?: string | null;
    uploader?: string;
    duration?: number;
  };
  clips: ClipperManifestClip[];
  timings?: Record<string, number>;
  encoder?: string;
  heatmap_available?: boolean;
  memory?: ClipperMemoryState;
  message?: string | null;
  status?: "complete";
  stale?: boolean;
  staleReason?: string;
  latestJobStatus?: ClipperJobStatus;
  manifestPath: string;
  updatedAt: string;
};

function clipperWorkdir(): string {
  return process.env.AFTERPLAY_CLIPPER_WORKDIR ?? join(process.cwd(), "services", "video-clipper", ".work");
}

function manifestFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...manifestFiles(path));
    } else if (entry.isFile() && entry.name === "manifest.json") {
      out.push(path);
    }
  }
  return out;
}

function statusFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...statusFiles(path));
    } else if (entry.isFile() && entry.name === "status.json") {
      out.push(path);
    }
  }
  return out;
}

export function getLatestClipManifest(): ClipperManifest | null {
  try {
    const workdir = clipperWorkdir();
    const statusRows = statusFiles(workdir)
      .map((path) => ({ path, mtimeMs: statSync(path).mtimeMs, status: readStatus(path) }))
      .sort((a, b) => b.mtimeMs - a.mtimeMs);
    const files = manifestFiles(workdir)
      .map((path) => ({ path, mtimeMs: statSync(path).mtimeMs }))
      .sort((a, b) => b.mtimeMs - a.mtimeMs);
    const complete = files
      .map((file) => loadManifest(file.path, file.mtimeMs))
      .find((manifest) => manifest && manifest.status === "complete");
    if (!complete) return null;

    const latestStatus = statusRows[0];
    if (latestStatus && latestStatus.mtimeMs > Date.parse(complete.updatedAt) && latestStatus.status?.state !== "complete") {
      complete.stale = true;
      complete.staleReason = `A newer job is ${latestStatus.status?.state ?? "incomplete"}; showing the latest complete manifest.`;
      complete.latestJobStatus = latestStatus.status;
    }
    return complete;
  } catch {
    return null;
  }
}

function loadManifest(path: string, mtimeMs: number): ClipperManifest | null {
  const data = JSON.parse(readFileSync(path, "utf-8")) as Omit<
    ClipperManifest,
    "manifestPath" | "updatedAt"
  >;
  const status = readStatus(join(path, "..", "status.json"));
  const state = data.status ?? status?.state ?? "complete";
  if (state !== "complete") return null;
  return {
    ...data,
    status: "complete",
    clips: Array.isArray(data.clips) ? data.clips.map(normalizeClip) : [],
    manifestPath: path,
    updatedAt: new Date(mtimeMs).toISOString(),
  };
}

function readStatus(path: string): ClipperJobStatus | undefined {
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as ClipperJobStatus;
  } catch {
    return undefined;
  }
}

function normalizeClip(clip: ClipperManifestClip): ClipperManifestClip {
  const signals = clip.signals ?? {};
  return {
    ...clip,
    callback: signals.callback === true,
    threadLabel: stringValue(signals.thread_label),
    callbackConfidence: numberValue(signals.confidence),
    sourceStream: stringValue(signals.source_stream),
    sourceT: numberValue(signals.source_t),
    sourceQuote: stringValue(signals.source_quote),
  };
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}
