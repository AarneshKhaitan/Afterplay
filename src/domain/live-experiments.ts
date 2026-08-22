import "server-only";

import { createHash } from "node:crypto";
import { isAbsolute, join, resolve } from "node:path";

import { z } from "zod";

import {
  readVersionedJson,
  writeVersionedJson,
  type VersionedJsonSchema,
} from "./persist";

const liveExperimentSchema = z.object({
  id: z.literal("live_current"),
  creatorId: z.string().min(1).max(100),
  source: z.object({
    kind: z.enum(["intel_recommendation", "strategy_proposal"]),
    scanId: z.string().min(1).max(160).optional(),
    recommendationKey: z.string().min(1).max(160).optional(),
  }).strict(),
  title: z.string().min(1).max(160),
  hypothesis: z.string().min(10).max(1_000),
  targetBehavior: z.string().min(5).max(500),
  successSignal: z.string().min(5).max(500),
  confidence: z.number().int().min(0).max(100),
  effort: z.enum(["low", "medium", "high"]).optional(),
  evidenceRefs: z.array(z.string().min(1).max(200)).min(1).max(40),
  status: z.literal("draft"),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
}).strict();

export type LiveExperiment = z.infer<typeof liveExperimentSchema>;

type Store = { creatorId: string; experiment: LiveExperiment };

const storeSchema: VersionedJsonSchema<Store> = {
  name: "afterplay.live-experiment",
  version: 1,
  acceptLegacy: false,
  accepts: (value): value is Store => z.object({
    creatorId: z.string().min(1).max(100),
    experiment: liveExperimentSchema,
  }).strict().safeParse(value).success,
};

const recommendationInputSchema = z.object({
  scanId: z.string().min(1).max(160),
  key: z.string().min(1).max(160),
  title: z.string().min(1).max(160),
  action: z.string().min(5).max(1_000),
  rationale: z.string().min(10).max(1_000),
  expectedSignal: z.string().min(5).max(500),
  confidence: z.number().min(0).max(1),
  effort: z.enum(["low", "medium", "high"]),
  evidence: z.array(z.string().min(1).max(200)).min(1).max(40),
}).strict();

export type RecommendationExperimentInput = z.infer<typeof recommendationInputSchema>;

export class LiveExperimentError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status = 400,
  ) {
    super(message);
    this.name = "LiveExperimentError";
  }
}

function experimentRoot(): string {
  const configured = process.env.AFTERPLAY_EXPERIMENT_DIR?.trim();
  if (!configured) return join(process.cwd(), ".afterplay", "experiments");
  return isAbsolute(configured) ? configured : resolve(process.cwd(), configured);
}

function storePath(creatorId: string): string {
  const key = createHash("sha256").update(`live:${creatorId}`).digest("hex").slice(0, 32);
  return join(experimentRoot(), `${key}.live.json`);
}

export function getLiveExperiment(creatorId: string): LiveExperiment | null {
  const store = readVersionedJson(storePath(creatorId), storeSchema);
  if (!store) return null;
  if (store.creatorId !== creatorId || store.experiment.creatorId !== creatorId) {
    throw new LiveExperimentError(
      "experiment_creator_mismatch",
      "The saved live experiment belongs to a different creator.",
      500,
    );
  }
  return structuredClone(store.experiment);
}

export function parseRecommendationExperimentInput(value: unknown): RecommendationExperimentInput {
  const parsed = recommendationInputSchema.safeParse(value);
  if (!parsed.success) {
    throw new LiveExperimentError(
      "invalid_recommendation",
      parsed.error.issues[0]?.message ?? "The recommendation is invalid.",
      400,
    );
  }
  return parsed.data;
}

export function createLiveExperimentFromRecommendation(
  creatorId: string,
  input: RecommendationExperimentInput,
): LiveExperiment {
  const now = new Date().toISOString();
  const recommendation = parseRecommendationExperimentInput(input);
  const experiment: LiveExperiment = {
    id: "live_current",
    creatorId,
    source: {
      kind: "intel_recommendation",
      scanId: recommendation.scanId,
      recommendationKey: recommendation.key,
    },
    title: recommendation.title,
    hypothesis: `${recommendation.rationale} Test this by doing: ${recommendation.action}`,
    targetBehavior: recommendation.action,
    successSignal: recommendation.expectedSignal,
    confidence: Math.round(recommendation.confidence * 100),
    effort: recommendation.effort,
    evidenceRefs: recommendation.evidence,
    status: "draft",
    createdAt: now,
    updatedAt: now,
  };
  writeVersionedJson(storePath(creatorId), storeSchema, { creatorId, experiment });
  return structuredClone(experiment);
}
