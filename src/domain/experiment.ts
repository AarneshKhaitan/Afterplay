import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import { type ClipperManifestClip, getLatestClipManifest } from "./clip-manifest";

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
    rights: "project_owned" | "creator_owned";
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

export type PerClipResult = {
  clip_id: string;
  post_id?: string;
  platform?: ExperimentOutput["platform"];
  metrics: {
    views: number;
    likes?: number;
    comments?: number;
    shares?: number;
    saves?: number;
    avg_watch_pct?: number;
  };
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

export const BASELINE = {
  views: 842,
  returningViewerRate: 8.2,
  repeatCommenters: 2,
  trackedLiveVisits: 3,
  nextStreamAverageConcurrency: 3.4,
} as const;

export function resultMovement(result?: ExperimentResult): Array<{
  label: string;
  value: string;
  baseline: string;
  delta: string;
  direction: "up" | "flat";
}> {
  const metrics = result?.metrics;
  return [
    movementMetric("Returning viewers", metrics?.returningViewerRate, BASELINE.returningViewerRate, "%", "pt"),
    movementMetric("Repeat commenters", metrics?.repeatCommenters, BASELINE.repeatCommenters),
    movementMetric("Tracked live visits", metrics?.trackedLiveVisits, BASELINE.trackedLiveVisits),
    movementMetric("Next-stream avg.", metrics?.nextStreamAverageConcurrency, BASELINE.nextStreamAverageConcurrency),
  ];
}

const initialExperiment: GrowthExperiment = {
  id: "exp_one_more_rule",
  name: "One More Rule",
  revision: 2,
  status: "awaiting_approval",
  owner: "Strategist",
  stage: "Creator review",
  diagnosis: "New viewers watch, but few come back",
  hypothesis:
    "If Mika turns each live session into a named, participatory format, first-time viewers will have a clearer reason to recognize the show and return.",
  targetBehavior: "Return to another Mika upload or live session within the next audience window.",
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
      detail: "Messages cluster when viewers suggest a constraint or watch Mika adapt to one.",
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
    { step: 2, role: "Scout", action: "Check recurring formats against Mika's style", state: "complete" },
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

declare global {
  var __afterplayExperimentStore: ExperimentStore | undefined;
}

function cloneInitialStore(): ExperimentStore {
  return { experiment: structuredClone(initialExperiment) };
}

function store(): ExperimentStore {
  globalThis.__afterplayExperimentStore ??= cloneInitialStore();
  return globalThis.__afterplayExperimentStore;
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

export function resetExperimentStore(): GrowthExperiment {
  globalThis.__afterplayExperimentStore = cloneInitialStore();
  return getExperiment(initialExperiment.id);
}

export function getExperiment(id: string): GrowthExperiment {
  assertExperimentId(id);
  return withCurrentOutputs(store().experiment);
}

export function recordDecision(input: {
  id: string;
  action: "approve" | "reject" | "request_change";
  revision: number;
  feedback?: string;
}): { experiment: GrowthExperiment; decision: NonNullable<GrowthExperiment["decision"]> } {
  assertExperimentId(input.id);
  const experiment = store().experiment;
  assertCurrentRevision(experiment, input.revision);

  if (experiment.status !== "awaiting_approval") {
    if (experiment.decision?.action === input.action && experiment.decision.revision === input.revision) {
      return { experiment: structuredClone(experiment), decision: structuredClone(experiment.decision) };
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
    experiment.outputs = currentOutputsFor(experiment);
    experiment.outputs.forEach((output) => { output.status = "approved"; });
  } else if (input.action === "reject") {
    experiment.status = "rejected";
    experiment.stage = "Rejected by creator";
  } else {
    experiment.status = "changes_requested";
    experiment.stage = "Creator changes requested";
  }

  return { experiment: structuredClone(experiment), decision: structuredClone(decision) };
}

export function dispatchExperiment(input: { id: string; revision: number }): {
  experiment: GrowthExperiment;
  receipts: DistributionReceipt[];
} {
  assertExperimentId(input.id);
  const experiment = store().experiment;
  assertCurrentRevision(experiment, input.revision);

  if (experiment.status === "distributed" || experiment.status === "learned") {
    return { experiment: structuredClone(experiment), receipts: structuredClone(experiment.receipts) };
  }
  if (experiment.status !== "approved") {
    throw new ExperimentError(
      "approval_required",
      "The current revision must be approved before distribution.",
      409,
    );
  }

  experiment.outputs = currentOutputsFor(experiment);
  experiment.receipts = experiment.outputs.map((output, index) => ({
    id: `sim_receipt_${index + 1}`,
    experimentId: experiment.id,
    outputId: output.id,
    platform: output.platform,
    simulated: true,
    state: "accepted",
    scheduledFor: ["2026-08-05T12:00:00.000Z", "2026-08-06T11:30:00.000Z", "2026-08-07T12:15:00.000Z"][index],
  }));
  experiment.outputs.forEach((output) => { output.status = "distributed"; });
  experiment.status = "distributed";
  experiment.stage = "Observing sample results";

  return { experiment: structuredClone(experiment), receipts: structuredClone(experiment.receipts) };
}

export function recordResults(input: { id: string; result: ExperimentResult; perClip?: PerClipResult[] }): {
  experiment: GrowthExperiment;
  result: ExperimentResult;
  learning: ExperimentLearning;
  nextExperiment: NonNullable<GrowthExperiment["nextExperiment"]>;
} {
  assertExperimentId(input.id);
  const experiment = store().experiment;

  if (experiment.status === "learned" && experiment.result && experiment.learning && experiment.nextExperiment) {
    return {
      experiment: structuredClone(experiment),
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
  persistPerClipResults(result.perClip, experiment.outputs);
  experiment.learning = learning;
  experiment.nextExperiment = nextExperiment;
  experiment.status = "learned";
  experiment.stage = "Learning recorded";

  return {
    experiment: structuredClone(experiment),
    result: structuredClone(experiment.result),
    learning: structuredClone(experiment.learning),
    nextExperiment: structuredClone(experiment.nextExperiment),
  };
}

function withCurrentOutputs(experiment: GrowthExperiment): GrowthExperiment {
  const cloned = structuredClone(experiment);
  cloned.outputs = currentOutputsFor(cloned);
  return cloned;
}

function currentOutputsFor(experiment: GrowthExperiment): ExperimentOutput[] {
  const manifest = getLatestClipManifest();
  const clips = manifest?.clips.filter((clip) => clip.ok !== false).slice(0, 3) ?? [];
  if (!manifest || clips.length === 0) return structuredClone(experiment.outputs);
  const outputStatus: OutputStatus =
    experiment.status === "distributed" || experiment.status === "learned"
      ? "distributed"
      : experiment.status === "approved"
        ? "approved"
        : "ready";
  return clips.map((clip, index) => projectManifestClip(clip, index, manifest.manifestPath, outputStatus));
}

function projectManifestClip(
  clip: ClipperManifestClip,
  index: number,
  manifestPath: string,
  status: OutputStatus,
): ExperimentOutput {
  return {
    id: clip.clip_id,
    type: clip.callback ? "community_cut" : (index === 0 ? "premise_cut" : index === 1 ? "community_cut" : "return_prompt"),
    title: clip.copy?.title || clip.clip_id,
    platform: platformLabel(clip.platform),
    duration: formatDuration(clip.duration),
    hook: clip.copy?.hook_text_overlay || clip.why || "Selected by the live clipper pipeline.",
    caption: clip.copy?.caption || clip.text_for_copy || "Pipeline-produced clip from the latest complete manifest.",
    rationale: clip.callback
      ? `Callback boost from ${clip.threadLabel ?? "creator memory"} at confidence ${clip.callbackConfidence ?? "unknown"}.`
      : "Standalone clip selected without requiring callback evidence.",
    thumbnailUrl: "/media/rivetfall-one-more-rule.png",
    status,
    provenance: { media: "pipeline_manifest", source: manifestPath, rights: "creator_owned" },
  };
}

function platformLabel(platform: string): ExperimentOutput["platform"] {
  if (platform === "tiktok") return "TikTok";
  if (platform === "reels") return "Instagram Reels";
  return "YouTube Shorts";
}

function formatDuration(seconds: number): string {
  const safe = Number.isFinite(seconds) ? Math.max(0, Math.round(seconds)) : 0;
  const mm = Math.floor(safe / 60);
  const ss = safe % 60;
  return `${mm.toString().padStart(2, "0")}:${ss.toString().padStart(2, "0")}`;
}

function strongestPerClip(perClip?: PerClipResult[]): PerClipResult | undefined {
  return perClip?.slice().sort((a, b) => b.metrics.views - a.metrics.views)[0];
}

function persistPerClipResults(perClip: PerClipResult[] | undefined, outputs: ExperimentOutput[]) {
  if (!perClip?.length) return;
  const creator = process.env.AFTERPLAY_CREATOR_ID ?? "creator_mika_rigged";
  const root = process.env.AFTERPLAY_MEMORY ?? join(homedir(), ".afterplay", "memory");
  const dir = join(root, creator);
  mkdirSync(dir, { recursive: true });
  const postsPath = join(dir, "posts.json");
  const metricsPath = join(dir, "metrics.json");
  const posts = readJsonArray(postsPath);
  const metrics = readJsonArray(metricsPath);
  const byId = new Map(outputs.map((output) => [output.id, output]));
  const now = Date.now() / 1000;
  for (const row of perClip) {
    const output = byId.get(row.clip_id);
    const postId = row.post_id || `app_${row.clip_id}`;
    posts.push({
      clip_id: row.clip_id,
      platform: row.platform || output?.platform || "YouTube Shorts",
      post_id: postId,
      published_at: now,
      features: { provenance: output?.provenance.media ?? "unknown" },
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

function formatDelta(delta: number, suffix = ""): string {
  const rounded = Number(delta.toFixed(1));
  const sign = rounded > 0 ? "+" : "";
  return `${sign}${rounded}${suffix}`;
}

function movementMetric(
  label: string,
  value: number | undefined,
  baseline: number,
  valueSuffix = "",
  deltaSuffix = "",
) {
  const displayValue = value ?? baseline;
  const delta = value === undefined ? 0 : Number((value - baseline).toFixed(1));
  return {
    label,
    value: `${displayValue}${valueSuffix}`,
    baseline: `${baseline}${valueSuffix}`,
    delta: value === undefined ? "baseline" : formatDelta(delta, deltaSuffix),
    direction: delta > 0 ? "up" as const : "flat" as const,
  };
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
