import type { Belief, BeliefStatus, IntelMemory, MemoryEvent } from "./types";

const REINFORCE = 0.34;
const DECAY = 0.12;
export const WEAK_FLOOR = 0.25;

export function statusFor(confidence: number, observations: number): BeliefStatus {
  if (confidence < WEAK_FLOOR) return "weakening";
  if (observations >= 2 && confidence >= 0.6) return "confirmed";
  return "emerging";
}

export type ObservedBelief = {
  key: string;
  scope: Belief["scope"];
  statement: string;
  detail: string;
  confidence: number;
  evidence: string[];
  supportingChannelIds: string[];
};

export type MergeResult = {
  beliefs: Belief[];
  events: MemoryEvent[];
  delta: { newBeliefs: number; confirmed: number; weakened: number };
};

/** Retire the never-grounded contradiction state without letting old records become
 * active beliefs. They remain visible in history as weakening, low-confidence items. */
export function normalizeLegacyMemory(memory: IntelMemory): IntelMemory {
  return {
    ...memory,
    beliefs: memory.beliefs.map((belief) =>
      String(belief.status) === "contradicted"
        ? {
            ...belief,
            status: "weakening" as const,
            confidence: Math.min(belief.confidence, WEAK_FLOOR - 0.01),
            lastDelta: Math.min(0, belief.lastDelta),
          }
        : belief,
    ),
    events: memory.events.map((event) =>
      String(event.kind) === "belief_contradicted"
        ? {
            ...event,
            kind: "belief_weakened" as const,
            summary: event.summary.replace(/^Contradicted:/, "Legacy disputed belief:"),
          }
        : event,
    ),
  };
}

/** Fold one scan into standing beliefs without touching storage.
 *
 * An omitted belief decays only when the scan covered every channel currently recorded
 * as supporting it. Legacy beliefs without coverage are preserved until re-observation
 * establishes that boundary.
 */
export function mergeBeliefs(
  existing: Belief[],
  observed: ObservedBelief[],
  scanId: string,
  now: string,
  coveredChannelIds: string[],
): MergeResult {
  const byKey = new Map<string, Belief>(
    existing.map((belief) => [
      belief.key,
      {
        ...belief,
        evidence: [...belief.evidence],
        supportingChannelIds: belief.supportingChannelIds
          ? [...belief.supportingChannelIds]
          : undefined,
        history: [...belief.history],
      } as Belief,
    ]),
  );
  const events: MemoryEvent[] = [];
  const delta = { newBeliefs: 0, confirmed: 0, weakened: 0 };
  const seen = new Set<string>();
  const covered = new Set(coveredChannelIds);

  for (const observation of observed) {
    seen.add(observation.key);
    const prior = byKey.get(observation.key);

    if (!prior) {
      const initialConfidence = Math.min(observation.confidence, 0.55);
      const belief: Belief = {
        key: observation.key,
        scope: observation.scope,
        statement: observation.statement,
        detail: observation.detail,
        confidence: initialConfidence,
        observations: 1,
        firstSeen: now,
        lastConfirmed: now,
        lastScanId: scanId,
        status: statusFor(initialConfidence, 1),
        evidence: observation.evidence,
        supportingChannelIds: [...new Set(observation.supportingChannelIds)],
        lastDelta: initialConfidence,
        history: [{ scanId, at: now, confidence: initialConfidence }],
      };
      byKey.set(belief.key, belief);
      delta.newBeliefs += 1;
      events.push({
        at: now,
        scanId,
        kind: "belief_new",
        summary: `New belief formed: ${belief.statement}`,
        detail: belief.detail,
      });
      continue;
    }

    const before = prior.confidence;
    prior.confidence = Number(
      Math.min(0.97, prior.confidence + (1 - prior.confidence) * REINFORCE).toFixed(3),
    );
    prior.observations += 1;
    prior.lastConfirmed = now;
    prior.status = statusFor(prior.confidence, prior.observations);
    prior.statement = observation.statement;
    prior.detail = observation.detail;
    prior.evidence = [...new Set([...observation.evidence, ...prior.evidence])].slice(0, 12);
    prior.supportingChannelIds = [...new Set(observation.supportingChannelIds)];
    prior.lastScanId = scanId;
    prior.lastDelta = Number((prior.confidence - before).toFixed(3));
    prior.history = [...prior.history, { scanId, at: now, confidence: prior.confidence }].slice(-20);
    delta.confirmed += 1;
    events.push({
      at: now,
      scanId,
      kind: "belief_confirmed",
      summary: `Reconfirmed (${prior.observations}x): ${prior.statement}`,
      detail: `Confidence ${Math.round(before * 100)}% → ${Math.round(prior.confidence * 100)}%`,
    });
  }

  for (const [key, belief] of byKey) {
    if (seen.has(key)) continue;
    const support = belief.supportingChannelIds ?? [];
    if (support.length === 0 || !support.every((channelId) => covered.has(channelId))) continue;

    const before = belief.confidence;
    belief.confidence = Number(Math.max(0.02, belief.confidence - DECAY).toFixed(3));
    belief.lastDelta = Number((belief.confidence - before).toFixed(3));
    belief.lastScanId = scanId;
    belief.history = [...belief.history, { scanId, at: now, confidence: belief.confidence }].slice(-20);
    const nextStatus = statusFor(belief.confidence, belief.observations);
    if (nextStatus !== belief.status && nextStatus === "weakening") {
      delta.weakened += 1;
      events.push({
        at: now,
        scanId,
        kind: "belief_weakened",
        summary: `Weakening: ${belief.statement}`,
        detail: `Not observed in a scan covering its supporting channels. Confidence ${Math.round(before * 100)}% → ${Math.round(belief.confidence * 100)}%`,
      });
    }
    belief.status = nextStatus;
  }

  return {
    beliefs: [...byKey.values()].sort((a, b) => b.confidence - a.confidence),
    events,
    delta,
  };
}
