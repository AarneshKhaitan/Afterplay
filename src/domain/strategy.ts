import { z } from "zod";

import type { ChannelThread } from "@/domain/creators";
import type { Belief } from "@/domain/intel/types";

export const strategyRequestInputSchema = z.object({
  creatorId: z.string().min(1).max(100),
  objective: z.string().min(10).max(500),
  evidenceRefs: z.array(z.string().min(1).max(160)).min(1).max(20),
});

const beliefEvidenceSchema = z.object({
  id: z.string().startsWith("belief:").max(160),
  kind: z.literal("belief"),
  title: z.string().min(1).max(300),
  detail: z.string().min(1).max(2_000),
  confidence: z.number().min(0).max(1),
  status: z.enum(["emerging", "confirmed", "weakening"]),
  observations: z.number().int().min(1),
  lastScanId: z.string().min(1).max(160),
  sourceRefs: z.array(z.string().min(1).max(200)).max(40),
});

const verifiedThreadEvidenceSchema = z.object({
  id: z.string().startsWith("thread:").max(160),
  kind: z.literal("verified_thread"),
  title: z.string().min(1).max(300),
  detail: z.string().max(2_000),
  status: z.string().min(1).max(80),
  provenance: z.object({
    streamId: z.string().min(1).max(160),
    timestampSeconds: z.number().min(0),
    quote: z.string().min(1).max(2_000),
    verified: z.literal(true),
  }),
});

export const strategyEvidenceSchema = z.discriminatedUnion("kind", [
  beliefEvidenceSchema,
  verifiedThreadEvidenceSchema,
]);

export const strategyDirectorInputSchema = strategyRequestInputSchema
  .omit({ evidenceRefs: true })
  .extend({ evidence: z.array(strategyEvidenceSchema).min(1).max(20) });

export type StrategyRequestInput = z.infer<typeof strategyRequestInputSchema>;
export type StrategyEvidence = z.infer<typeof strategyEvidenceSchema>;
export type StrategyDirectorInput = z.infer<typeof strategyDirectorInputSchema>;

export function buildStrategyEvidence(
  beliefs: Belief[],
  threads: ChannelThread[],
): StrategyEvidence[] {
  const beliefEvidence: StrategyEvidence[] = [...beliefs]
    .sort((a, b) => b.confidence - a.confidence || b.observations - a.observations)
    .map((belief) => ({
      id: `belief:${belief.key}`,
      kind: "belief",
      title: belief.statement,
      detail: belief.detail,
      confidence: belief.confidence,
      status: belief.status,
      observations: belief.observations,
      lastScanId: belief.lastScanId,
      sourceRefs: belief.evidence,
    }));

  const threadEvidence: StrategyEvidence[] = threads.map((thread) => ({
    id: `thread:${thread.id}`,
    kind: "verified_thread",
    title: thread.label,
    detail: thread.summary,
    status: thread.status,
    provenance: {
      streamId: thread.streamId,
      timestampSeconds: thread.t,
      quote: thread.quote,
      verified: true,
    },
  }));

  return [...beliefEvidence, ...threadEvidence];
}

export type StrategyOutputBriefType = "premise_cut" | "community_cut" | "return_prompt";

export type StrategyProductAction = {
  href: string;
  label: string;
};

const PRODUCT_ACTIONS: Record<StrategyOutputBriefType, StrategyProductAction> = {
  premise_cut: { href: "/studio", label: "Review premise cut" },
  community_cut: { href: "/studio", label: "Review community cut" },
  return_prompt: { href: "/experiments", label: "Review experiment" },
};

export function strategyProductAction(type: StrategyOutputBriefType): StrategyProductAction {
  return PRODUCT_ACTIONS[type];
}
