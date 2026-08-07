import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import { getLatestClipManifest, type ClipperManifestClip } from "@/domain/clip-manifest";

/** Server-only bridge from recorded results back into the clipper's ranking priors.
 *
 * Kept out of `domain/experiment.ts` on purpose: that module is imported by client
 * components (`audience-results.tsx`, `studio-decision-panel.tsx`), and pulling
 * `node:fs` into the browser bundle fails the Turbopack build outright.
 *
 * The clipper reads these files through `insights.Analytics`, so the shapes here must
 * match what `record_post` / `record_metric` write and what `compute_priors` groups by.
 */

export type PerClipMetrics = {
  views: number;
  likes?: number;
  comments?: number;
  shares?: number;
  saves?: number;
  avg_watch_pct?: number;
};

export type PerClipResult = {
  clip_id: string;
  platform?: string;
  post_id?: string;
  metrics: PerClipMetrics;
};

/** Creator id the clipper stores memory under.
 *
 * MUST match the `--creator` passed to `afterplay run`, or results land in a directory
 * the clipper never reads and the feedback loop silently does nothing. */
export function resultsCreatorId(): string {
  return process.env.AFTERPLAY_CREATOR_ID ?? "demo_live";
}

function memoryRoot(): string {
  return process.env.AFTERPLAY_MEMORY ?? join(homedir(), ".afterplay", "memory");
}

// Mirrors insights.Analytics._bucket
function durationBucket(seconds: number): string {
  return seconds < 24 ? "short" : seconds < 38 ? "mid" : "long";
}

// Mirrors insights.Analytics._position
function sourcePosition(start: number, total?: number): string {
  if (!total) return "unknown";
  const f = start / total;
  return f < 0.2 ? "opening" : f < 0.75 ? "middle" : "closing";
}

function readJsonArray(path: string): unknown[] {
  if (!existsSync(path)) return [];
  try {
    const data = JSON.parse(readFileSync(path, "utf-8"));
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

/** Build the feature set `compute_priors` actually groups by.
 *
 * It groups on moment_type, duration_bucket, source_position and platform, and
 * `apply_to_moments` re-ranks using moment_type. Writing anything else produces priors
 * keyed "unknown", which match no candidate moment and leave ranking untouched. */
function featuresFor(clip: ClipperManifestClip | undefined, sourceDuration?: number) {
  const signals = (clip?.signals ?? {}) as Record<string, unknown>;
  const momentType =
    typeof signals.moment_type === "string" && signals.moment_type
      ? signals.moment_type
      : clip?.callback
        ? "callback"
        : "unknown";
  return {
    moment_type: momentType,
    duration_bucket: durationBucket(clip?.duration ?? 0),
    source_position: sourcePosition(clip?.start ?? 0, sourceDuration),
    detector: typeof signals.detector === "string" ? signals.detector : undefined,
    callback: clip?.callback === true,
  };
}

/** Append per-clip outcomes to the creator's analytics files.
 *
 * No-op when nothing was submitted. Failure is swallowed and logged: recording results
 * must never fail the experiment lifecycle. */
export function persistPerClipResults(perClip: PerClipResult[] | undefined): void {
  if (!perClip?.length) return;

  try {
    const manifest = getLatestClipManifest();
    const clipsById = new Map((manifest?.clips ?? []).map((clip) => [clip.clip_id, clip]));
    const sourceDuration = manifest?.source?.duration;

    const dir = join(memoryRoot(), resultsCreatorId());
    mkdirSync(dir, { recursive: true });
    const postsPath = join(dir, "posts.json");
    const metricsPath = join(dir, "metrics.json");

    const posts = readJsonArray(postsPath);
    const metrics = readJsonArray(metricsPath);
    const now = Date.now() / 1000;

    for (const row of perClip) {
      const clip = clipsById.get(row.clip_id);
      const postId = row.post_id || `app_${row.clip_id}`;
      posts.push({
        clip_id: row.clip_id,
        platform: row.platform || clip?.platform || "shorts",
        post_id: postId,
        published_at: now,
        features: featuresFor(clip, sourceDuration),
      });
      metrics.push({
        post_id: postId,
        views: row.metrics.views,
        likes: row.metrics.likes ?? 0,
        comments: row.metrics.comments ?? 0,
        shares: row.metrics.shares ?? 0,
        saves: row.metrics.saves ?? 0,
        avg_watch_pct: row.metrics.avg_watch_pct ?? 0,
        fetched_at: now,
      });
    }

    writeFileSync(postsPath, JSON.stringify(posts.slice(-5000), null, 2), "utf-8");
    writeFileSync(metricsPath, JSON.stringify(metrics.slice(-20000), null, 2), "utf-8");
  } catch (error) {
    console.warn("[afterplay] per-clip results were not persisted:", error);
  }
}
