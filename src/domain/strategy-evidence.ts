import "server-only";

import { currentCreator, loadThreads } from "@/domain/creators";
import { activeBeliefs } from "@/domain/intel/memory";
import { loadMemory } from "@/domain/intel/store";
import {
  buildStrategyEvidence,
  strategyDirectorInputSchema,
  type StrategyDirectorInput,
  type StrategyRequestInput,
} from "@/domain/strategy";

export class StrategyEvidenceError extends Error {
  constructor(
    public readonly code: "creator_scope_mismatch" | "strategy_evidence_empty",
    message: string,
  ) {
    super(message);
    this.name = "StrategyEvidenceError";
  }
}

function evidenceForCreator(creatorId: string) {
  const memory = loadMemory(creatorId);
  return buildStrategyEvidence(activeBeliefs(memory), loadThreads(creatorId));
}

/** Resolve a live strategy request against request-scoped creator identity and disk data.
 * Client refs may narrow the set, but they can never introduce an evidence body. */
export async function assembleActiveStrategyInput(
  request: StrategyRequestInput,
): Promise<StrategyDirectorInput> {
  const creator = await currentCreator();
  if (request.creatorId !== creator.id) {
    throw new StrategyEvidenceError(
      "creator_scope_mismatch",
      "The strategy request does not belong to the active creator workspace.",
    );
  }

  const available = evidenceForCreator(creator.id);
  const requested = new Set(request.evidenceRefs);
  const selected = available.filter((item) => requested.has(item.id));
  const evidence = (selected.length ? selected : available).slice(0, 20);
  if (!evidence.length) {
    throw new StrategyEvidenceError(
      "strategy_evidence_empty",
      "Run channel backfill or intelligence scan before requesting a live strategy.",
    );
  }

  return strategyDirectorInputSchema.parse({
    creatorId: creator.id,
    objective: request.objective,
    evidence,
  });
}
