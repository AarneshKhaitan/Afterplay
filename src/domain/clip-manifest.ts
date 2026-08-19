import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { z } from "zod";

export const footageRightsValues = [
  "project_owned", "creator_owned", "permission_granted", "licensed", "not_cleared",
] as const;
export type FootageRights = (typeof footageRightsValues)[number];
const clearedRights = new Set<FootageRights>([
  "project_owned", "creator_owned", "permission_granted", "licensed",
]);

export type ClipMemoryImpact = {
  baselineRank: number;
  memoryRank: number;
  rankDelta: number;
  boost: number;
  scoreScale: string;
  basePercentile: number;
};

export type VerifiedClipEvidence = {
  threadLabel: string;
  confidence?: number;
  sourceStream: string;
  sourceT: number;
  sourceTReported?: number;
  sourceQuote: string;
  sourceQuoteDisplay?: string;
  sourceMatchRatio?: number;
  sourceRepair?: string;
  footageRights?: FootageRights;
  memoryImpact?: ClipMemoryImpact;
};

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
  citationVerified?: boolean;
  decision_window?: { start: number; end: number };
  evidence?: VerifiedClipEvidence;
  memoryImpact?: ClipMemoryImpact;
};

export type ClipperMemoryState = {
  enabled?: boolean;
  degraded?: boolean;
  reason?: string | null;
  threads_considered?: number;
  /** True only when a clip that was actually returned carries the callback. */
  callback_found?: boolean;
  /** Callbacks detected in windows that scored below the clips returned. Non-zero here
   * with `callback_found: false` is a valid state, distinct from "no callback exists". */
  callbacks_ranked_out?: number;
  /** Callback candidates removed after ranking, for example by sponsor safety filtering. */
  callbacks_filtered_out?: number;
};

export type ClipperJobStatus = {
  creator_id?: string | null;
  state?: "started" | "running" | "cancelling" | "complete" | "failed" | "cancelled";
  updated?: number;
  message?: string;
  manifest?: string;
};

export type ClipperManifest = {
  schema?: "afterplay.clip-manifest";
  schema_version?: 1 | 2;
  creator_id?: string | null;
  job_id: string;
  source: {
    title?: string;
    url?: string | null;
    uploader?: string;
    duration?: number;
    transcript_language?: string | null;
    transcript_source?: string | null;
    subtitle_track?: string | null;
    footage_rights?: FootageRights;
  };
  clips: ClipperManifestClip[];
  timings?: Record<string, number>;
  encoder?: string;
  heatmap_available?: boolean;
  memory?: ClipperMemoryState;
  ablation?: {
    schema_version: number;
    available: boolean;
    unavailable_reason?: string | null;
    comparison_point: string;
    candidate_count: number;
    moments: Array<{
      start: number; end: number; baseline_rank: number; memory_rank: number;
      rank_delta: number; boost: number; base_score: number; final_score: number;
      base_percentile: number;
      score_scale: string; baseline_selected: boolean; memory_selected: boolean;
      callback: boolean;
    }>;
  };
  message?: string | null;
  status?: "complete";
  stale?: boolean;
  staleReason?: string;
  latestJobStatus?: ClipperJobStatus;
  manifestPath: string;
  updatedAt: string;
  approvalReady: boolean;
  approvalBlockedReasons: string[];
};

const footageRightsSchema = z.enum(footageRightsValues);
const transcriptSourceSchema = z.enum([
  "provided_vtt", "youtube_manual", "youtube_auto", "youtube_unknown", "asr",
]);
const decisionWindowSchema = z.object({ start: z.number().finite(), end: z.number().finite() });
const clipSchema = z.object({
  clip_id: z.string().min(1),
  platform: z.string().min(1),
  start: z.number().finite(),
  end: z.number().finite(),
  duration: z.number().finite().nonnegative(),
  decision_window: decisionWindowSchema.optional(),
  ok: z.boolean().optional(),
  signals: z.record(z.string(), z.unknown()).optional(),
}).passthrough();
const ablationMomentSchema = z.object({
  start: z.number().finite(), end: z.number().finite(),
  baseline_rank: z.number().int().positive(), memory_rank: z.number().int().positive(),
  rank_delta: z.number().int(), boost: z.number().finite(),
  base_score: z.number().finite(), final_score: z.number().finite(),
  base_percentile: z.number().finite().min(0).max(100),
  score_scale: z.string().min(1), baseline_selected: z.boolean(),
  memory_selected: z.boolean(), callback: z.boolean(),
}).passthrough().superRefine((row, context) => {
  if (row.rank_delta !== row.baseline_rank - row.memory_rank) {
    context.addIssue({ code: "custom", message: "rank_delta does not match ranks" });
  }
  if (Math.abs((row.final_score - row.base_score) - row.boost) > 0.00001) {
    context.addIssue({ code: "custom", message: "boost does not match score delta" });
  }
});
const ablationSchema = z.object({
  schema_version: z.literal(1),
  available: z.boolean(),
  unavailable_reason: z.string().nullable().optional(),
  comparison_point: z.literal("post_scoring_pre_sponsor_pre_analytics"),
  candidate_count: z.number().int().nonnegative(),
  moments: z.array(ablationMomentSchema),
}).passthrough().superRefine((proof, context) => {
  if (proof.available && proof.unavailable_reason != null) {
    context.addIssue({ code: "custom", message: "available ablation cannot have a disabled reason" });
  }
  if (!proof.available && !proof.unavailable_reason?.trim()) {
    context.addIssue({ code: "custom", message: "unavailable ablation requires a reason" });
  }
  if (!proof.available && proof.moments.length > 0) {
    context.addIssue({ code: "custom", message: "unavailable ablation cannot contain moments" });
  }
  if (proof.moments.some((row) => row.baseline_rank > proof.candidate_count
    || row.memory_rank > proof.candidate_count)) {
    context.addIssue({ code: "custom", message: "rank exceeds candidate_count" });
  }
  if (proof.available) {
    if (proof.candidate_count === 0 || proof.moments.length !== proof.candidate_count) {
      context.addIssue({ code: "custom", message: "available ablation must include every candidate" });
    }
    const expectedRanks = Array.from({ length: proof.candidate_count }, (_, index) => index + 1);
    const baselineRanks = proof.moments.map((row) => row.baseline_rank).sort((a, b) => a - b);
    const memoryRanks = proof.moments.map((row) => row.memory_rank).sort((a, b) => a - b);
    if (baselineRanks.some((rank, index) => rank !== expectedRanks[index])
      || memoryRanks.some((rank, index) => rank !== expectedRanks[index])) {
      context.addIssue({ code: "custom", message: "ablation ranks must be complete permutations" });
    }
    const windows = proof.moments.map((row) => `${row.start}\u0000${row.end}`);
    if (new Set(windows).size !== windows.length) {
      context.addIssue({ code: "custom", message: "ablation decision windows must be unique" });
    }
    for (const row of proof.moments) {
      const expected = proof.candidate_count === 1
        ? 100
        : 100 * (proof.candidate_count - row.baseline_rank) / (proof.candidate_count - 1);
      if (Math.abs(row.base_percentile - expected) > 0.001) {
        context.addIssue({ code: "custom", message: "base_percentile does not match baseline rank" });
      }
    }
  }
});
const manifestDocumentSchema = z.object({
  schema: z.string().optional(),
  schema_version: z.number().int().positive().optional(),
  creator_id: z.string().nullable().optional(),
  job_id: z.string().min(1),
  source: z.object({
    title: z.string().optional(), url: z.string().nullable().optional(),
    uploader: z.string().optional(), duration: z.number().finite().optional(),
    transcript_language: z.string().nullable().optional(),
    transcript_source: transcriptSourceSchema.nullable().optional(),
    subtitle_track: z.string().nullable().optional(),
    footage_rights: footageRightsSchema.optional(),
  }).passthrough(),
  clips: z.array(clipSchema),
  ablation: ablationSchema.optional(),
  status: z.literal("complete").optional(),
}).passthrough().superRefine((manifest, context) => {
  if (manifest.schema_version !== 2) return;
  const ids = manifest.clips.map((clip) => clip.clip_id);
  if (new Set(ids).size !== ids.length) {
    context.addIssue({ code: "custom", message: "manifest clip ids must be unique" });
  }
  const knownPlatforms = new Set(["shorts", "reels", "tiktok", "linkedin", "x"]);
  for (const clip of manifest.clips) {
    if (!knownPlatforms.has(clip.platform)) {
      context.addIssue({ code: "custom", message: "manifest clip platform is unknown" });
    }
    if (clip.end <= clip.start || Math.abs((clip.end - clip.start) - clip.duration) > 0.1) {
      context.addIssue({ code: "custom", message: "rendered clip window is invalid" });
    }
    if (!clip.decision_window || clip.decision_window.end <= clip.decision_window.start) {
      context.addIssue({ code: "custom", message: "decision window is invalid" });
    }
  }
  if (manifest.ablation?.available) {
    for (const clip of manifest.clips) {
      const window = clip.decision_window;
      const matches = window ? manifest.ablation.moments.filter(
        (row) => Math.abs(row.start - window.start) < 0.001
          && Math.abs(row.end - window.end) < 0.001,
      ) : [];
      if (matches.length !== 1) {
        context.addIssue({ code: "custom", message: "clip decision window lacks one ablation row" });
      } else if (!matches[0].memory_selected) {
        context.addIssue({ code: "custom", message: "returned clip was not selected in memory arm" });
      } else if (matches[0].callback !== hasVerifiedCallbackSignals(clip.signals)) {
        context.addIssue({ code: "custom", message: "ablation callback disagrees with verified clip" });
      }
    }
  }
});

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

export function getLatestClipManifest(creatorId: string): ClipperManifest | null {
  try {
    const owner = creatorId.trim();
    if (!owner) return null;
    const workdir = clipperWorkdir();
    const statusRows = statusFiles(workdir)
      .map((path) => ({ path, mtimeMs: statSync(path).mtimeMs, status: readStatus(path) }))
      .filter((row) => row.status?.creator_id === owner)
      .sort((a, b) => b.mtimeMs - a.mtimeMs);
    const files = manifestFiles(workdir)
      .map((path) => ({ path, mtimeMs: statSync(path).mtimeMs }))
      .sort((a, b) => b.mtimeMs - a.mtimeMs);
    const inspected = files.map(inspectManifestFile);
    const newest = inspected.find(
      (entry) => entry.manifest?.creator_id === owner && entry.manifest.status === "complete",
    );
    if (!newest?.manifest) return null;
    const complete = newest.manifest;

    const rejectedNewerManifest = inspected.find(
      (entry) => entry.rejected && entry.creatorIds.includes(owner) && entry.mtimeMs >= newest.mtimeMs,
    );
    if (rejectedNewerManifest) {
      markManifestStale(
        complete,
        "A newer manifest was rejected by the manifest-v2 contract; showing the latest valid manifest.",
      );
    }

    /* Look for an unfinished job that is NOT older than the manifest we are about to
     * serve — the G20 case, where a run died before writing its own manifest.
     *
     * Two bugs lived in the previous version of this check, both invisible until a
     * machine was fast enough to hit them:
     *
     *  1. It examined only `statusRows[0]`, the newest status file of ANY state. A
     *     completed job's own `status.json` is usually the newest, so the check compared
     *     against that, saw `state === "complete"`, and never flagged anything. Now we
     *     search for the newest genuinely-incomplete status instead.
     *  2. It compared against `Date.parse(updatedAt)`, and `updatedAt` is the mtime
     *     round-tripped through an ISO string, which truncates sub-millisecond
     *     precision. Comparing the raw mtimes avoids inventing a difference that is not
     *     there.
     *
     * `>=` rather than `>` because a dead job written in the same filesystem timestamp
     * tick as the previous complete one is exactly the case worth catching: the operator
     * still needs to know the run they are looking at is not the latest attempt.
     */
    const staleSignal = statusRows.find(
      (row) => row.status?.state !== "complete" && row.mtimeMs >= newest.mtimeMs,
    );
    if (staleSignal) {
      markManifestStale(
        complete,
        `A newer job is ${staleSignal.status?.state ?? "incomplete"}; showing the latest complete manifest.`,
      );
      complete.latestJobStatus = staleSignal.status;
    }
    return complete;
  } catch {
    return null;
  }
}

export function getClipManifestForJob(jobId: string, creatorId: string): ClipperManifest | null {
  const owner = creatorId.trim();
  const id = jobId.trim();
  if (!owner || !/^[A-Za-z0-9_-]{1,120}$/.test(id)) return null;
  const path = join(clipperWorkdir(), id, "manifest.json");
  if (!existsSync(path)) return null;
  try {
    const inspected = inspectManifestFile({ path, mtimeMs: statSync(path).mtimeMs });
    return inspected.manifest?.creator_id === owner ? inspected.manifest : null;
  } catch {
    return null;
  }
}

type InspectedManifest = {
  manifest: ClipperManifest | null;
  creatorIds: string[];
  mtimeMs: number;
  rejected: boolean;
};

function inspectManifestFile(file: { path: string; mtimeMs: number }): InspectedManifest {
  const status = readStatus(join(file.path, "..", "status.json"));
  const statusOwner = typeof status?.creator_id === "string" ? status.creator_id : undefined;
  try {
    const raw = JSON.parse(readFileSync(file.path, "utf-8")) as unknown;
    let manifestOwner: string | undefined;
    if (raw && typeof raw === "object" && "creator_id" in raw) {
      const candidate = (raw as { creator_id?: unknown }).creator_id;
      if (typeof candidate === "string") manifestOwner = candidate;
    }
    const creatorIds = [...new Set([statusOwner, manifestOwner].filter(
      (value): value is string => Boolean(value),
    ))];
    if (statusOwner && manifestOwner && statusOwner !== manifestOwner) {
      return { manifest: null, creatorIds, mtimeMs: file.mtimeMs, rejected: true };
    }
    const manifest = loadManifest(file.path, file.mtimeMs, raw);
    return {
      manifest,
      creatorIds: manifest?.creator_id ? [manifest.creator_id] : creatorIds,
      mtimeMs: file.mtimeMs,
      rejected: manifest === null,
    };
  } catch {
    return {
      manifest: null,
      creatorIds: statusOwner ? [statusOwner] : [],
      mtimeMs: file.mtimeMs,
      rejected: true,
    };
  }
}

function markManifestStale(manifest: ClipperManifest, reason: string): void {
  manifest.stale = true;
  manifest.staleReason = manifest.staleReason
    ? `${manifest.staleReason} ${reason}`
    : reason;
  const blocked = "A newer run is incomplete or invalid; review is blocked until it produces a valid manifest.";
  if (!manifest.approvalBlockedReasons.includes(blocked)) {
    manifest.approvalBlockedReasons.push(blocked);
  }
  manifest.approvalReady = false;
}

function loadManifest(path: string, mtimeMs: number, raw?: unknown): ClipperManifest | null {
  const parsed = manifestDocumentSchema.safeParse(
    raw ?? JSON.parse(readFileSync(path, "utf-8")),
  );
  if (!parsed.success) return null;
  const data = parsed.data as unknown as Omit<
    ClipperManifest,
    "manifestPath" | "updatedAt" | "approvalReady" | "approvalBlockedReasons"
  >;
  const schemaVersion = data.schema_version ?? 1;
  if (schemaVersion !== 1 && schemaVersion !== 2) return null;
  if (schemaVersion === 2) {
    const source = data.source as Record<string, unknown>;
    const provenanceComplete = data.schema === "afterplay.clip-manifest"
      && typeof data.creator_id === "string" && data.creator_id.length > 0
      && Boolean(data.source.footage_rights)
      && Object.hasOwn(source, "transcript_language")
      && Object.hasOwn(source, "transcript_source")
      && Object.hasOwn(source, "subtitle_track")
      && data.clips.every((clip) => Boolean(clip.decision_window) && typeof clip.ok === "boolean");
    if (!provenanceComplete) return null;
  }
  const status = readStatus(join(path, "..", "status.json"));
  const state = data.status ?? status?.state ?? "complete";
  if (state !== "complete") return null;
  const rawClips = Array.isArray(data.clips) ? data.clips : [];
  const clips = rawClips.map((clip) => normalizeClip(
    { ...clip, path: resolvedClipPath(path, clip.path) },
    data.source.footage_rights,
    data.ablation,
  ));
  const rejectedCallbacks = rawClips.filter(
    (clip, index) => clip.signals?.callback === true && clips[index]?.callback !== true,
  ).length;
  const integrityReason = rejectedCallbacks
    ? `${rejectedCallbacks} callback ${rejectedCallbacks === 1 ? "claim was" : "claims were"} omitted because the manifest lacks complete verified citation metadata.`
    : null;
  const approvalBlockedReasons: string[] = [];
  if (schemaVersion < 2) approvalBlockedReasons.push("Legacy manifest: rerun to record manifest v2 provenance.");
  if (!data.source.footage_rights) approvalBlockedReasons.push("Footage rights were not attested.");
  else if (!clearedRights.has(data.source.footage_rights)) {
    approvalBlockedReasons.push("Footage is marked not cleared; clips are available for analysis only.");
  }
  if (integrityReason) approvalBlockedReasons.push(integrityReason);
  const successful = clips.filter((clip) => clip.ok === true);
  if (successful.length === 0) {
    approvalBlockedReasons.push("No clip passed quality checks; there is nothing to approve.");
  }
  if (successful.some((clip) => !clip.path)) {
    approvalBlockedReasons.push("A successful clip has no readable media inside its job directory.");
  }
  if (successful.some((clip) => !["shorts", "reels", "tiktok"].includes(clip.platform))) {
    approvalBlockedReasons.push("A successful clip targets a platform this approval workflow cannot dispatch.");
  }
  return {
    ...data,
    schema_version: schemaVersion,
    status: "complete",
    clips,
    memory: integrityReason
      ? {
          ...data.memory,
          enabled: data.memory?.enabled ?? true,
          degraded: true,
          reason: data.memory?.reason ?? integrityReason,
          callback_found: clips.some((clip) => clip.callback === true),
        }
      : data.memory,
    message: integrityReason ?? data.message,
    manifestPath: path,
    updatedAt: new Date(mtimeMs).toISOString(),
    approvalReady: approvalBlockedReasons.length === 0,
    approvalBlockedReasons,
  };
}

function readStatus(path: string): ClipperJobStatus | undefined {
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as ClipperJobStatus;
  } catch {
    return undefined;
  }
}

function normalizeClip(
  clip: ClipperManifestClip,
  footageRights: FootageRights | undefined,
  ablation: ClipperManifest["ablation"],
): ClipperManifestClip {
  const signals = clip.signals ?? {};
  const threadLabel = stringValue(signals.thread_label);
  const sourceStream = stringValue(signals.source_stream);
  const sourceT = numberValue(signals.source_t);
  const sourceQuote = stringValue(signals.source_quote);
  const sourceTReported = numberValue(signals.source_t_reported);
  const sourceQuoteDisplay = stringValue(signals.source_quote_display);
  const sourceMatchRatio = numberValue(signals.source_match_ratio);
  const sourceRepair = stringValue(signals.source_repair);
  const window = clip.decision_window;
  const ablationRow = window && ablation?.available ? ablation.moments.find(
    (row) => Math.abs(row.start - window.start) < 0.001
      && Math.abs(row.end - window.end) < 0.001,
  ) : undefined;
  const callback = hasVerifiedCallbackSignals(signals);
  const memoryImpact = ablationRow && ablationRow.memory_selected
    && ablationRow.callback === callback ? {
      baselineRank: ablationRow.baseline_rank,
      memoryRank: ablationRow.memory_rank,
      rankDelta: ablationRow.rank_delta,
      boost: ablationRow.boost,
      scoreScale: ablationRow.score_scale,
      basePercentile: ablationRow.base_percentile,
    } : undefined;
  const callbackRejected = signals.callback === true && !callback;
  const evidence = callback && threadLabel && sourceStream && sourceT !== undefined && sourceQuote
    ? {
        threadLabel,
        confidence: numberValue(signals.confidence),
        sourceStream,
        sourceT,
        sourceTReported,
        sourceQuote,
        sourceQuoteDisplay,
        sourceMatchRatio,
        sourceRepair,
        footageRights,
        memoryImpact,
      }
    : undefined;
  return {
    ...clip,
    why: callbackRejected
      ? "Standalone clip; an unverified callback claim was omitted."
      : clip.why,
    callback,
    threadLabel: callback ? threadLabel : undefined,
    callbackConfidence: callback ? numberValue(signals.confidence) : undefined,
    sourceStream: callback ? sourceStream : undefined,
    sourceT: callback ? sourceT : undefined,
    sourceQuote: callback ? sourceQuote : undefined,
    citationVerified: callback,
    evidence,
    memoryImpact,
  };
}

function hasVerifiedCallbackSignals(signals: Record<string, unknown> | undefined): boolean {
  if (!signals) return false;
  const sourceTReported = numberValue(signals.source_t_reported);
  const sourceMatchRatio = numberValue(signals.source_match_ratio);
  const sourceRepair = stringValue(signals.source_repair);
  const citationAuditComplete = Object.hasOwn(signals, "source_t_reported")
    && (sourceTReported !== undefined || signals.source_t_reported === null)
    && Boolean(stringValue(signals.source_quote_display))
    && sourceMatchRatio !== undefined && sourceMatchRatio >= 0.75 && sourceMatchRatio <= 1
    && Object.hasOwn(signals, "source_repair")
    && (sourceRepair !== undefined || signals.source_repair === null);
  return signals.callback === true
    && signals.citation_verified === true
    && citationAuditComplete
    && Boolean(
      stringValue(signals.thread_label)
      && stringValue(signals.source_stream)
      && numberValue(signals.source_t) !== undefined
      && stringValue(signals.source_quote),
    );
}

function resolvedClipPath(manifestPath: string, value: unknown): string | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  const jobDir = dirname(manifestPath);
  try {
    const target = resolve(jobDir, value);
    if (!existsSync(target) || !statSync(target).isFile()) return undefined;
    const realJobDir = realpathSync(jobDir);
    const realTarget = realpathSync(target);
    const within = relative(realJobDir, realTarget);
    if (!within || within === ".." || within.startsWith(`..${sep}`) || isAbsolute(within)) {
      return undefined;
    }
    return realTarget;
  } catch {
    return undefined;
  }
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}
