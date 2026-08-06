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
  callback?: boolean;
  threadLabel?: string;
  callbackConfidence?: number;
  sourceStream?: string;
  sourceT?: number;
  sourceQuote?: string;
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

export function getLatestClipManifest(): ClipperManifest | null {
  try {
    const files = manifestFiles(clipperWorkdir())
      .map((path) => ({ path, mtimeMs: statSync(path).mtimeMs }))
      .sort((a, b) => b.mtimeMs - a.mtimeMs);
    if (!files[0]) return null;

    const data = JSON.parse(readFileSync(files[0].path, "utf-8")) as Omit<
      ClipperManifest,
      "manifestPath" | "updatedAt"
    >;
    return {
      ...data,
      clips: Array.isArray(data.clips) ? data.clips.map(normalizeClip) : [],
      manifestPath: files[0].path,
      updatedAt: new Date(files[0].mtimeMs).toISOString(),
    };
  } catch {
    return null;
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
