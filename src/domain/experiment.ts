// Type-only: `export type` is erased at build time, so this does NOT pull the bridge's
// node:fs imports into client bundles. The value-side call lives in the API route.
import { createHash } from "node:crypto";
import { isAbsolute, join, resolve } from "node:path";

import { z } from "zod";

import { getLatestClipManifest } from "./clip-manifest";
import { defaultCreatorId } from "./creators";
import { BASELINE, formatDelta } from "./experiment-metrics";
import {
  PersistenceError,
  readVersionedJson,
  writeVersionedJson,
  type VersionedJsonSchema,
} from "./persist";
import type { PerClipResult } from "./results-bridge";

export { BASELINE, resultMovement } from "./experiment-metrics";

export type { PerClipResult } from "./results-bridge";

export type ExperimentStatus =
  | "awaiting_approval"
  | "changes_requested"
  | "rejected"
  | "approved"
  | "distributed"
  | "learned";

export type OutputStatus = "ready" | "approved" | "distributed";

export type ExperimentOutput = {
  id: string;
  type: "premise_cut" | "community_cut" | "return_prompt";
  title: string;
  platform: "YouTube Shorts" | "TikTok" | "Instagram Reels";
  duration: string;
  hook: string;
  caption: string;
  rationale: string;
  thumbnailUrl: string;
  status: OutputStatus;
  provenance: {
    media: "generated_fixture" | "pipeline_manifest";
    source: string;
    /** Never assert ownership the system cannot substantiate. A clip produced from a
     * platform URL was extracted from third-party content; only `--local` media is
     * known to be creator-owned. */
    rights: "project_owned" | "creator_owned" | "third_party_extracted";
  };
};

export type DistributionReceipt = {
  id: string;
  experimentId: string;
  outputId: string;
  platform: ExperimentOutput["platform"];
  simulated: true;
  state: "accepted";
  scheduledFor: string;
};

export type ExperimentResult = {
  disclosure: "synthetic_sample_data";
  causalClaim: false;
  metrics: {
    views: number;
    returningViewerRate: number;
    repeatCommenters: number;
    trackedLiveVisits: number;
    nextStreamAverageConcurrency: number;
  };
  perClip?: PerClipResult[];
};

export type ExperimentLearning = {
  conclusion: string;
  confidence: number;
  evidence: string[];
  limitations: string[];
  nextMove: string;
};

export type GrowthExperiment = {
  id: "exp_one_more_rule";
  name: "One More Rule";
  revision: number;
  status: ExperimentStatus;
  owner: "Strategist";
  stage: string;
  diagnosis: string;
  hypothesis: string;
  targetBehavior: string;
  successSignal: string;
  timebox: string;
  confidence: number;
  evidence: Array<{
    id: string;
    title: string;
    detail: string;
    source: string;
    strength: "strong" | "directional";
  }>;
  alternatives: Array<{
    title: string;
    reasonNotChosen: string;
  }>;
  uncertainty: string;
  falsifier: string;
  plan: Array<{
    step: number;
    role: "Strategist" | "Scout" | "Producer" | "Analyst";
    action: string;
    state: "complete" | "waiting";
  }>;
  outputs: ExperimentOutput[];
  /** Real clipper clips, projected from the latest manifest. Additive: the
   * curated `outputs` package is never replaced. Empty when no manifest exists. */
  pipelineOutputs?: ExperimentOutput[];
  decision?: {
    id: string;
    action: "approve" | "reject" | "request_change";
    revision: number;
    feedback?: string;
    decidedAt: string;
  };
  receipts: DistributionReceipt[];
  result?: ExperimentResult;
  learning?: ExperimentLearning;
  nextExperiment?: {
    id: string;
    name: "Name the Builder";
    status: "proposed";
    hypothesis: string;
  };
};

export type ExperimentStore = {
  creatorId: string;
  experiment: GrowthExperiment;
};

export class ExperimentError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "ExperimentError";
  }
}

const initialExperiment: GrowthExperiment = {
  id: "exp_one_more_rule",
  name: "One More Rule",
  revision: 2,
  status: "awaiting_approval",
  owner: "Strategist",
  stage: "Creator review",
  diagnosis: "8.2% of viewers returned",
  hypothesis:
    "A named, participatory format may give first-time viewers a clearer reason to recognize the show and return.",
  targetBehavior: "Return to another upload or live session within the next audience window.",
  successSignal: "Returning-viewer rate and repeat commenters rise together; raw views are secondary.",
  timebox: "One stream, then a seven-day sample window",
  confidence: 72,
  evidence: [
    {
      id: "evidence_format_gap",
      title: "Top clips have no shared format",
      detail: "The four most-watched sample clips each end as a one-off. None names a series or tells viewers what comes next.",
      source: "12 sample short-form posts · 28-day archive",
      strength: "strong",
    },
    {
      id: "evidence_return_gap",
      title: "Views are not turning into return visits",
      detail: "Median short-form reach is 842 views while returning YouTube viewers remain at 8.2%.",
      source: "Synthetic YouTube analytics snapshot",
      strength: "strong",
    },
    {
      id: "evidence_chat",
      title: "Chat is busiest when viewers add rules",
      detail: "Messages cluster when viewers suggest a constraint or watch you adapt to one.",
      source: "8 sample streams · chat-event summary",
      strength: "directional",
    },
  ],
  alternatives: [
    {
      title: "Publish more highlight clips",
      reasonNotChosen: "More clips would increase volume without giving viewers a recognizable show to return to.",
    },
    {
      title: "Change games for broader reach",
      reasonNotChosen: "The sample is too small to separate game choice from format quality, and switching could lose the current audience.",
    },
  ],
  uncertainty:
    "Afterplay cannot identify the same person across platforms. Topic, timing, or packaging could explain the aggregate pattern.",
  falsifier:
    "The idea fails if views rise while returning viewers, repeat commenters, and tracked live visits stay flat.",
  plan: [
    { step: 1, role: "Strategist", action: "Set the return target and success signal", state: "complete" },
    { step: 2, role: "Scout", action: "Check recurring formats against your style", state: "complete" },
    { step: 3, role: "Producer", action: "Draft the premise, participation, and return pieces", state: "complete" },
    { step: 4, role: "Analyst", action: "Compare the result with the failure condition", state: "waiting" },
  ],
  outputs: [
    {
      id: "output_premise",
      type: "premise_cut",
      title: "The machine gets one more rule",
      platform: "YouTube Shorts",
      duration: "00:28",
      hook: "This bridge worked—so chat made it illegal.",
      caption: "One More Rule, every Tuesday. The machine survives; chat changes the laws.",
      rationale: "Names the series before the clip reaches its payoff.",
      thumbnailUrl: "/media/rivetfall-one-more-rule.png",
      status: "ready",
      provenance: { media: "generated_fixture", source: "Project-owned Rivetfall fixture", rights: "project_owned" },
    },
    {
      id: "output_community",
      type: "community_cut",
      title: "Chat chooses the impossible constraint",
      platform: "TikTok",
      duration: "00:21",
      hook: "You get ten seconds: which rule ruins this build?",
      caption: "The winning rule enters next week's build. Add yours below.",
      rationale: "Makes the viewer's rule the payoff.",
      thumbnailUrl: "/media/rivetfall-one-more-rule.png",
      status: "ready",
      provenance: { media: "generated_fixture", source: "Project-owned Rivetfall fixture", rights: "project_owned" },
    },
    {
      id: "output_return",
      type: "return_prompt",
      title: "Next rule enters Tuesday",
      platform: "Instagram Reels",
      duration: "00:14",
      hook: "This held for 42 seconds. Your rule goes in next.",
      caption: "Tuesday, 8 PM · One More Rule · viewer constraints open now.",
      rationale: "Names the next session instead of asking for a generic follow.",
      thumbnailUrl: "/media/rivetfall-one-more-rule.png",
      status: "ready",
      provenance: { media: "generated_fixture", source: "Project-owned Rivetfall fixture", rights: "project_owned" },
    },
  ],
  receipts: [],
};

const outputSchema = z.object({
  id: z.string().min(1),
  type: z.enum(["premise_cut", "community_cut", "return_prompt"]),
  title: z.string(),
  platform: z.enum(["YouTube Shorts", "TikTok", "Instagram Reels"]),
  duration: z.string(),
  hook: z.string(),
  caption: z.string(),
  rationale: z.string(),
  thumbnailUrl: z.string(),
  status: z.enum(["ready", "approved", "distributed"]),
  provenance: z.object({
    media: z.enum(["generated_fixture", "pipeline_manifest"]),
    source: z.string(),
    rights: z.enum(["project_owned", "creator_owned", "third_party_extracted"]),
  }).strict(),
}).strict();

const perClipResultSchema = z.object({
  clip_id: z.string().min(1),
  post_id: z.string().min(1).optional(),
  platform: z.enum(["YouTube Shorts", "TikTok", "Instagram Reels"]).optional(),
  metrics: z.object({
    views: z.number().int().nonnegative(),
    likes: z.number().int().nonnegative().optional(),
    comments: z.number().int().nonnegative().optional(),
    shares: z.number().int().nonnegative().optional(),
    saves: z.number().int().nonnegative().optional(),
    avg_watch_pct: z.number().min(0).max(100).optional(),
  }).strict(),
}).strict();

const growthExperimentSchema = z.object({
  id: z.literal("exp_one_more_rule"),
  name: z.literal("One More Rule"),
  revision: z.number().int().positive(),
  status: z.enum([
    "awaiting_approval",
    "changes_requested",
    "rejected",
    "approved",
    "distributed",
    "learned",
  ]),
  owner: z.literal("Strategist"),
  stage: z.string(),
  diagnosis: z.string(),
  hypothesis: z.string(),
  targetBehavior: z.string(),
  successSignal: z.string(),
  timebox: z.string(),
  confidence: z.number().min(0).max(100),
  evidence: z.array(z.object({
    id: z.string().min(1),
    title: z.string(),
    detail: z.string(),
    source: z.string(),
    strength: z.enum(["strong", "directional"]),
  }).strict()),
  alternatives: z.array(z.object({
    title: z.string(),
    reasonNotChosen: z.string(),
  }).strict()),
  uncertainty: z.string(),
  falsifier: z.string(),
  plan: z.array(z.object({
    step: z.number().int().positive(),
    role: z.enum(["Strategist", "Scout", "Producer", "Analyst"]),
    action: z.string(),
    state: z.enum(["complete", "waiting"]),
  }).strict()),
  outputs: z.array(outputSchema),
  // A response projection may have been captured by an early prototype. It is accepted
  // for migration, then removed so stale manifest data never becomes durable state.
  pipelineOutputs: z.array(outputSchema).optional(),
  decision: z.object({
    id: z.string().min(1),
    action: z.enum(["approve", "reject", "request_change"]),
    revision: z.number().int().positive(),
    feedback: z.string().optional(),
    decidedAt: z.string(),
  }).strict().optional(),
  receipts: z.array(z.object({
    id: z.string().min(1),
    experimentId: z.string().min(1),
    outputId: z.string().min(1),
    platform: z.enum(["YouTube Shorts", "TikTok", "Instagram Reels"]),
    simulated: z.literal(true),
    state: z.literal("accepted"),
    scheduledFor: z.string(),
  }).strict()),
  result: z.object({
    disclosure: z.literal("synthetic_sample_data"),
    causalClaim: z.literal(false),
    metrics: z.object({
      views: z.number().int().nonnegative(),
      returningViewerRate: z.number().min(0).max(100),
      repeatCommenters: z.number().int().nonnegative(),
      trackedLiveVisits: z.number().int().nonnegative(),
      nextStreamAverageConcurrency: z.number().nonnegative(),
    }).strict(),
    perClip: z.array(perClipResultSchema).optional(),
  }).strict().optional(),
  learning: z.object({
    conclusion: z.string(),
    confidence: z.number().min(0).max(100),
    evidence: z.array(z.string()),
    limitations: z.array(z.string()),
    nextMove: z.string(),
  }).strict().optional(),
  nextExperiment: z.object({
    id: z.string().min(1),
    name: z.literal("Name the Builder"),
    status: z.literal("proposed"),
    hypothesis: z.string(),
  }).strict().optional(),
}).strict();

type PersistedExperimentStore = {
  /** Missing only in the unversioned prototype format. */
  creatorId?: string;
  experiment: GrowthExperiment;
};

const experimentStoreSchema: VersionedJsonSchema<PersistedExperimentStore> = {
  name: "afterplay.experiment-store",
  version: 1,
  acceptLegacy: true,
  accepts: (value): value is PersistedExperimentStore => z.object({
    creatorId: z.string().trim().min(1).max(100).optional(),
    experiment: growthExperimentSchema,
  }).strict().safeParse(value).success,
};

function experimentRoot(): string {
  const configured = process.env.AFTERPLAY_EXPERIMENT_DIR?.trim();
  if (!configured) return join(process.cwd(), ".afterplay", "experiments");
  return isAbsolute(configured) ? configured : resolve(process.cwd(), configured);
}

function normalizeCreatorId(creatorId?: string): string {
  const normalized = (creatorId ?? defaultCreatorId()).trim();
  if (!normalized || normalized.length > 100) {
    throw new ExperimentError("invalid_creator_id", "The creator id is invalid.", 400);
  }
  return normalized;
}

function experimentStorePath(creatorId: string): string {
  // Creator ids can originate in configuration. A digest makes traversal impossible
  // while the envelope retains the original id for ownership checks and diagnostics.
  const key = createHash("sha256").update(creatorId).digest("hex").slice(0, 32);
  return join(experimentRoot(), `${key}.json`);
}

function persistenceError(error: unknown): never {
  if (!(error instanceof PersistenceError)) throw error;

  const incompatible = error.code === "schema_mismatch" || error.code === "unsupported_version";
  const unavailable = error.code === "read_failed" || error.code === "write_failed";
  throw new ExperimentError(
    incompatible
      ? "experiment_state_incompatible"
      : unavailable
        ? "experiment_state_unavailable"
        : "experiment_state_corrupt",
    incompatible
      ? "The saved experiment state uses an unsupported format."
      : unavailable
        ? "Experiment state could not be read or written."
        : "The saved experiment state is invalid and was not reset.",
    500,
  );
}

function writeStore(value: ExperimentStore): void {
  const durable = structuredClone(value);
  delete durable.experiment.pipelineOutputs;
  try {
    writeVersionedJson(experimentStorePath(value.creatorId), experimentStoreSchema, durable);
  } catch (error) {
    persistenceError(error);
  }
}

function cloneInitialStore(creatorId: string): ExperimentStore {
  return { creatorId, experiment: structuredClone(initialExperiment) };
}

function store(creatorId?: string): ExperimentStore {
  const resolvedCreatorId = normalizeCreatorId(creatorId);
  const path = experimentStorePath(resolvedCreatorId);
  let persisted: PersistedExperimentStore | null;
  try {
    persisted = readVersionedJson(path, experimentStoreSchema);
  } catch (error) {
    persistenceError(error);
  }

  if (!persisted) {
    const initial = cloneInitialStore(resolvedCreatorId);
    writeStore(initial);
    return initial;
  }
  if (persisted.creatorId && persisted.creatorId !== resolvedCreatorId) {
    throw new ExperimentError(
      "experiment_creator_mismatch",
      "The saved experiment state belongs to a different creator and was not loaded.",
      500,
    );
  }

  const migrated: ExperimentStore = {
    creatorId: resolvedCreatorId,
    experiment: structuredClone(persisted.experiment),
  };
  delete migrated.experiment.pipelineOutputs;
  if (!persisted.creatorId || persisted.experiment.pipelineOutputs) writeStore(migrated);
  return migrated;
}

function assertExperimentId(id: string): asserts id is GrowthExperiment["id"] {
  if (id !== initialExperiment.id) {
    throw new ExperimentError("experiment_not_found", "Experiment not found.", 404);
  }
}

function assertCurrentRevision(experiment: GrowthExperiment, revision: number) {
  if (revision !== experiment.revision) {
    throw new ExperimentError(
      "stale_revision",
      `Revision ${revision} is stale. The current revision is ${experiment.revision}.`,
      409,
    );
  }
}

export function resetExperimentStore(creatorId?: string): GrowthExperiment {
  const initial = cloneInitialStore(normalizeCreatorId(creatorId));
  writeStore(initial);
  return toResponse(initial.experiment, initial.creatorId);
}

/** Clone for return, with the pipeline projection attached.
 *
 * Every function that hands an experiment back must go through this. Attaching the
 * projection in `getExperiment` alone meant a mutation response (approve, dispatch,
 * results) carried no `pipelineOutputs`, so a client that replaced its state from that
 * response made the pipeline-clips section disappear after approval. */
function toResponse(experiment: GrowthExperiment, creatorId: string): GrowthExperiment {
  const clone = structuredClone(experiment);
  clone.pipelineOutputs = projectPipelineOutputs(clone, creatorId);
  return clone;
}

export function getExperiment(id: string, creatorId?: string): GrowthExperiment {
  assertExperimentId(id);
  const state = store(creatorId);
  return toResponse(state.experiment, state.creatorId);
}

/** Real clipper output, presented as its own approvable set.
 *
 * Deliberately additive: an earlier attempt replaced `outputs` with manifest clips,
 * which collapsed the curated three-card package to a single raw card and duplicated
 * the manifest section. The curated package stays immutable; pipeline clips get their
 * own section and carry the same approval status, so approving the experiment approves
 * real clips too — which is what closes the loop (G7).
 */
function projectPipelineOutputs(experiment: GrowthExperiment, creatorId: string): ExperimentOutput[] {
  const manifest = getLatestClipManifest(creatorId);
  const clips = (manifest?.clips ?? []).filter((clip) => clip.ok !== false);
  if (!manifest || clips.length === 0) return [];

  // A platform URL means the media was extracted from third-party content; only local
  // media is known to be creator-owned. Never assert ownership we cannot substantiate.
  const rights: ExperimentOutput["provenance"]["rights"] =
    manifest.source?.url ? "third_party_extracted" : "creator_owned";
  const status: OutputStatus =
    experiment.status === "distributed" || experiment.status === "learned"
      ? "distributed"
      : experiment.status === "approved"
        ? "approved"
        : "ready";

  /** A short human label. Never the raw transcript: without an LLM the heuristic copy
   * generator derives `copy.title` from speech, so it arrives as a sentence fragment.
   * Falling back to `clip_id` printed the id twice in one row, since Studio already
   * shows it as the identifier — so fall back to the platform name instead. */
  const label = (clip: (typeof clips)[number]) => {
    const generated = clip.copy?.title?.trim() ?? "";
    const candidate = (generated.length > 0 && generated.length <= 60 ? generated : "")
      || clip.threadLabel?.trim()
      || "";
    if (candidate) return candidate;
    // A run returns several standalone clips; "Standalone clip" four times over tells the
    // reviewer nothing about which is which. Their position in the stream does, and it is
    // the one fact about them that is always true and never speculative.
    const mm = Math.floor(clip.start / 60);
    const ss = Math.floor(clip.start % 60).toString().padStart(2, "0");
    return `${clip.callback ? "Callback clip" : "Standalone clip"} · ${mm}:${ss}`;
  };

  return clips.map((clip) => ({
    id: clip.clip_id,
    type: clip.callback ? "community_cut" : "premise_cut",
    title: label(clip),
    platform: clip.platform === "tiktok" ? "TikTok"
      : clip.platform === "reels" ? "Instagram Reels" : "YouTube Shorts",
    duration: `00:${Math.round(clip.duration).toString().padStart(2, "0")}`,
    hook: clip.why ?? "Selected by the clipper pipeline.",
    caption: clip.text_for_copy ?? "",
    rationale: clip.callback
      ? `Callback to ${clip.threadLabel ?? "creator memory"} at confidence ${clip.callbackConfidence ?? "?"}.`
      : "Standalone clip; no history-dependent moment required.",
    thumbnailUrl: "",
    status,
    provenance: { media: "pipeline_manifest", source: manifest.manifestPath, rights },
  }));
}

export function recordDecision(input: {
  id: string;
  action: "approve" | "reject" | "request_change";
  revision: number;
  feedback?: string;
  creatorId?: string;
}): { experiment: GrowthExperiment; decision: NonNullable<GrowthExperiment["decision"]> } {
  assertExperimentId(input.id);
  const state = store(input.creatorId);
  const experiment = state.experiment;
  assertCurrentRevision(experiment, input.revision);

  if (experiment.status !== "awaiting_approval") {
    if (experiment.decision?.action === input.action && experiment.decision.revision === input.revision) {
      return { experiment: toResponse(experiment, state.creatorId), decision: structuredClone(experiment.decision) };
    }
    throw new ExperimentError("decision_not_allowed", "This experiment is no longer awaiting a decision.", 409);
  }

  const decision = {
    id: `decision_${input.action}_r${input.revision}`,
    action: input.action,
    revision: input.revision,
    feedback: input.feedback,
    decidedAt: "2026-08-05T09:44:00.000Z",
  } as const;

  experiment.decision = decision;
  if (input.action === "approve") {
    experiment.status = "approved";
    experiment.stage = "Ready for simulated distribution";
    experiment.outputs.forEach((output) => { output.status = "approved"; });
  } else if (input.action === "reject") {
    experiment.status = "rejected";
    experiment.stage = "Rejected by creator";
  } else {
    experiment.status = "changes_requested";
    experiment.stage = "Creator changes requested";
  }

  writeStore(state);
  return { experiment: toResponse(experiment, state.creatorId), decision: structuredClone(decision) };
}

/** Simulated publish slot for the nth dispatched output.
 *
 * Derived rather than looked up in a fixed three-entry array: once pipeline clips joined
 * the dispatch, indices past the third produced `scheduledFor: undefined` — a value the
 * `DistributionReceipt` type forbids but indexed access does not catch. One slot per day
 * from the first, staggered so the receipts read as a schedule rather than a batch. */
const DISPATCH_EPOCH = Date.parse("2026-08-05T12:00:00.000Z");
function simulatedSlot(index: number): string {
  return new Date(DISPATCH_EPOCH + index * (24 * 60 * 60 * 1000 - 30 * 60 * 1000)).toISOString();
}

export function dispatchExperiment(input: { id: string; revision: number; creatorId?: string }): {
  experiment: GrowthExperiment;
  receipts: DistributionReceipt[];
} {
  assertExperimentId(input.id);
  const state = store(input.creatorId);
  const experiment = state.experiment;
  assertCurrentRevision(experiment, input.revision);

  if (experiment.status === "distributed" || experiment.status === "learned") {
    return { experiment: toResponse(experiment, state.creatorId), receipts: structuredClone(experiment.receipts) };
  }
  if (experiment.status !== "approved") {
    throw new ExperimentError(
      "approval_required",
      "The current revision must be approved before distribution.",
      409,
    );
  }

  // Receipts cover the curated package AND the pipeline clips: approving the
  // experiment approves both, so distribution must account for both.
  const dispatched = [...experiment.outputs, ...projectPipelineOutputs(experiment, state.creatorId)];
  experiment.receipts = dispatched.map((output, index) => ({
    id: `sim_receipt_${index + 1}`,
    experimentId: experiment.id,
    outputId: output.id,
    platform: output.platform,
    simulated: true,
    state: "accepted",
    scheduledFor: simulatedSlot(index),
  }));
  experiment.outputs.forEach((output) => { output.status = "distributed"; });
  experiment.status = "distributed";
  experiment.stage = "Observing sample results";

  writeStore(state);
  return { experiment: toResponse(experiment, state.creatorId), receipts: structuredClone(experiment.receipts) };
}

export function recordResults(input: {
  id: string;
  result: ExperimentResult;
  perClip?: PerClipResult[];
  creatorId?: string;
}): {
  experiment: GrowthExperiment;
  result: ExperimentResult;
  learning: ExperimentLearning;
  nextExperiment: NonNullable<GrowthExperiment["nextExperiment"]>;
} {
  assertExperimentId(input.id);
  const state = store(input.creatorId);
  const experiment = state.experiment;

  if (experiment.status === "learned" && experiment.result && experiment.learning && experiment.nextExperiment) {
    return {
      experiment: toResponse(experiment, state.creatorId),
      result: structuredClone(experiment.result),
      learning: structuredClone(experiment.learning),
      nextExperiment: structuredClone(experiment.nextExperiment),
    };
  }
  if (experiment.status !== "distributed") {
    throw new ExperimentError(
      "distribution_required",
      "Results can only be recorded after approved distribution.",
      409,
    );
  }

  const result = structuredClone(input.result);
  result.perClip = input.perClip ? structuredClone(input.perClip) : result.perClip;
  const metrics = result.metrics;
  const returningDelta = Number((metrics.returningViewerRate - BASELINE.returningViewerRate).toFixed(1));
  const repeatDelta = metrics.repeatCommenters - BASELINE.repeatCommenters;
  const liveDelta = metrics.trackedLiveVisits - BASELINE.trackedLiveVisits;
  const viewsDelta = metrics.views - BASELINE.views;
  const concurrencyDelta = Number((metrics.nextStreamAverageConcurrency - BASELINE.nextStreamAverageConcurrency).toFixed(1));

  const returnSignalsUp =
    returningDelta >= 1.5 &&
    repeatDelta >= 2 &&
    liveDelta >= 2;
  const falsifierMet =
    viewsDelta > 0 &&
    returningDelta <= 0.3 &&
    repeatDelta <= 0 &&
    liveDelta <= 0;

  const movementEvidence = [
    `Returning-viewer rate moved from ${BASELINE.returningViewerRate}% to ${metrics.returningViewerRate}% (${formatDelta(returningDelta, "pt")}).`,
    `Repeat commenters moved from ${BASELINE.repeatCommenters} to ${metrics.repeatCommenters} (${formatDelta(repeatDelta)}).`,
    `Tracked live visits moved from ${BASELINE.trackedLiveVisits} to ${metrics.trackedLiveVisits} (${formatDelta(liveDelta)}).`,
    `Views moved from ${BASELINE.views} to ${metrics.views} (${formatDelta(viewsDelta)}), while next-stream average concurrency moved from ${BASELINE.nextStreamAverageConcurrency} to ${metrics.nextStreamAverageConcurrency} (${formatDelta(concurrencyDelta)}).`,
  ];
  const strongestClip = strongestPerClip(result.perClip);
  if (strongestClip) {
    movementEvidence.push(
      `${strongestClip.clip_id} led the clip-level sample with ${strongestClip.metrics.views} views and ${strongestClip.metrics.avg_watch_pct ?? 0}% average watch.`,
    );
  }

  let learning: ExperimentLearning;
  let nextExperiment: NonNullable<GrowthExperiment["nextExperiment"]>;

  if (returnSignalsUp) {
    learning = {
      conclusion: "The named format earned a cautious second test.",
      confidence: confidenceFromEffect([returningDelta / 5, repeatDelta / 5, liveDelta / 6], 64),
      evidence: movementEvidence,
      limitations: defaultLimitations(),
      nextMove: "Name participating viewers in the next test and see whether they return again.",
    };
    nextExperiment = {
      id: "exp_name_the_builder",
      name: "Name the Builder",
      status: "proposed",
      hypothesis: "Naming viewers whose constraints enter the build may increase repeat participation without needing more reach.",
    };
  } else if (falsifierMet) {
    learning = {
      conclusion: "The result contradicted the return-cue hypothesis.",
      confidence: confidenceFromEffect([Math.abs(returningDelta) / 3, Math.abs(repeatDelta), Math.abs(liveDelta)], 58),
      evidence: movementEvidence,
      limitations: defaultLimitations(),
      nextMove: "Stop repeating this package as-is and test a clearer path from clip viewer to next live session.",
    };
    nextExperiment = {
      id: "exp_fix_return_path",
      name: "Name the Builder",
      status: "proposed",
      hypothesis: "A clip with an explicit next-session reason and schedule may convert reach into return behavior better than the named format alone.",
    };
  } else {
    learning = {
      conclusion: "The result is inconclusive.",
      confidence: confidenceFromEffect([Math.abs(returningDelta) / 4, Math.abs(repeatDelta) / 3, Math.abs(liveDelta) / 3], 42),
      evidence: movementEvidence,
      limitations: defaultLimitations(),
      nextMove: "Repeat a narrower version with fewer packaging changes before changing the creator strategy.",
    };
    nextExperiment = {
      id: "exp_clean_repeat",
      name: "Name the Builder",
      status: "proposed",
      hypothesis: "Repeating the named-format test with the same posting window and one changed variable may separate signal from noise.",
    };
  }

  experiment.result = result;
  experiment.learning = learning;
  experiment.nextExperiment = nextExperiment;
  experiment.status = "learned";
  experiment.stage = "Learning recorded";

  writeStore(state);
  return {
    experiment: toResponse(experiment, state.creatorId),
    result: structuredClone(experiment.result),
    learning: structuredClone(experiment.learning),
    nextExperiment: structuredClone(experiment.nextExperiment),
  };
}

function strongestPerClip(perClip?: PerClipResult[]): PerClipResult | undefined {
  return perClip?.slice().sort((a, b) => b.metrics.views - a.metrics.views)[0];
}


function confidenceFromEffect(effects: number[], cap: number): number {
  const mean = effects.reduce((sum, value) => sum + Math.min(1, Math.max(0, value)), 0) / effects.length;
  return Math.max(28, Math.min(cap, Math.round(32 + mean * 38)));
}

function defaultLimitations(): string[] {
  return [
    "One sample run cannot establish causality.",
    "Topic, posting time, and packaging may have changed alongside the tested format.",
    "Cross-platform viewers cannot be joined at person level.",
  ];
}
