/** The intelligence memory: beliefs that persist and move across scans.
 *
 * This is what separates "a report" from "a partner that remembers". A report is
 * regenerated from scratch each time and has no opinion about last month. A belief has a
 * history: it was formed on a date, has been re-observed N times, and its confidence
 * moves when a later scan does or does not support it.
 *
 * The merge key is a slug the model is required to emit and reuse (`Insight.key`). That
 * is deliberate: matching beliefs by embedding similarity would be more flexible but
 * would also silently merge two genuinely different claims, and a memory that quietly
 * conflates ideas is worse than one that occasionally duplicates them.
 *
 * Pure except for the store calls in `commit`. The maths lives in `mergeBeliefs` so it
 * can be tested without a filesystem.
 */

import { loadMemory, saveMemory } from "./store";
import type { Belief, BeliefStatus, IntelMemory, MemoryEvent, ScanJob } from "./types";

/** Confidence gained when a scan re-observes an existing belief. Additive on the
 * remaining headroom so confidence approaches 1 asymptotically and never asserts
 * certainty from repetition alone. */
const REINFORCE = 0.34;

/** Confidence lost when a scan covering the same ground does NOT re-observe a belief.
 * Smaller than REINFORCE: absence from one scan is weak evidence against, since the
 * model may simply have surfaced a different top-N that run. */
const DECAY = 0.12;

/** Below this, a belief stops being presented as something the system believes. It is
 * retained (not deleted) so the timeline can show that it was once held and faded —
 * which is itself intelligence. */
const WEAK_FLOOR = 0.25;

export function statusFor(confidence: number, observations: number, contradicted: boolean): BeliefStatus {
  if (contradicted) return "contradicted";
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
  /** Set when this scan actively contradicts a prior belief rather than just omitting
   * it. The model is asked for these explicitly. */
  contradicts?: boolean;
};

export type MergeResult = {
  beliefs: Belief[];
  events: MemoryEvent[];
  delta: { newBeliefs: number; confirmed: number; weakened: number; contradicted: number };
};

/** Fold this scan's observations into the standing belief set.
 *
 * `now` and `scanId` are parameters rather than ambient so this is deterministic under
 * test — the same inputs must always produce the same memory.
 */
export function mergeBeliefs(
  existing: Belief[],
  observed: ObservedBelief[],
  scanId: string,
  now: string,
): MergeResult {
  const byKey = new Map(existing.map((belief) => [belief.key, { ...belief }]));
  const events: MemoryEvent[] = [];
  const delta = { newBeliefs: 0, confirmed: 0, weakened: 0, contradicted: 0 };
  const seen = new Set<string>();

  for (const observation of observed) {
    seen.add(observation.key);
    const prior = byKey.get(observation.key);

    if (!prior) {
      const belief: Belief = {
        key: observation.key,
        scope: observation.scope,
        statement: observation.statement,
        detail: observation.detail,
        // A first observation is capped: nothing seen once is highly confident, however
        // certain the model sounds about it.
        confidence: Math.min(observation.confidence, 0.55),
        observations: 1,
        firstSeen: now,
        lastConfirmed: now,
        lastScanId: scanId,
        status: "emerging",
        evidence: observation.evidence,
        lastDelta: Math.min(observation.confidence, 0.55),
        history: [{ scanId, at: now, confidence: Math.min(observation.confidence, 0.55) }],
      };
      belief.status = statusFor(belief.confidence, belief.observations, false);
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
    if (observation.contradicts) {
      prior.confidence = Math.max(0.05, prior.confidence - 0.4);
      prior.status = "contradicted";
      delta.contradicted += 1;
      events.push({
        at: now,
        scanId,
        kind: "belief_contradicted",
        summary: `Contradicted: ${prior.statement}`,
        detail: observation.detail,
      });
    } else {
      // Approach 1 asymptotically: each confirmation closes a third of the remaining gap.
      prior.confidence = Number(
        Math.min(0.97, prior.confidence + (1 - prior.confidence) * REINFORCE).toFixed(3),
      );
      prior.observations += 1;
      prior.lastConfirmed = now;
      prior.status = statusFor(prior.confidence, prior.observations, false);
      delta.confirmed += 1;
      events.push({
        at: now,
        scanId,
        kind: "belief_confirmed",
        summary: `Reconfirmed (${prior.observations}x): ${prior.statement}`,
        detail: `Confidence ${Math.round(before * 100)}% → ${Math.round(prior.confidence * 100)}%`,
      });
    }

    // Keep the freshest wording and union the evidence, bounded so memory cannot grow
    // without limit across many scans.
    prior.statement = observation.statement;
    prior.detail = observation.detail;
    prior.evidence = [...new Set([...observation.evidence, ...prior.evidence])].slice(0, 12);
    prior.lastScanId = scanId;
    prior.lastDelta = Number((prior.confidence - before).toFixed(3));
    prior.history = [...prior.history, { scanId, at: now, confidence: prior.confidence }].slice(-20);
  }

  // Beliefs this scan did not re-observe decay.
  for (const [key, belief] of byKey) {
    if (seen.has(key)) continue;
    if (belief.status === "contradicted") continue;
    const before = belief.confidence;
    belief.confidence = Number(Math.max(0.02, belief.confidence - DECAY).toFixed(3));
    belief.lastDelta = Number((belief.confidence - before).toFixed(3));
    belief.lastScanId = scanId;
    belief.history = [...belief.history, { scanId, at: now, confidence: belief.confidence }].slice(-20);
    const nextStatus = statusFor(belief.confidence, belief.observations, false);
    if (nextStatus !== belief.status && nextStatus === "weakening") {
      delta.weakened += 1;
      events.push({
        at: now,
        scanId,
        kind: "belief_weakened",
        summary: `Weakening: ${belief.statement}`,
        detail: `Not observed in this scan. Confidence ${Math.round(before * 100)}% → ${Math.round(belief.confidence * 100)}%`,
      });
    }
    belief.status = nextStatus;
  }

  const beliefs = [...byKey.values()].sort((a, b) => b.confidence - a.confidence);
  return { beliefs, events, delta };
}

/** Beliefs worth showing as current knowledge. Weakening/contradicted ones stay in the
 * store and the timeline but do not get presented as things we believe. */
export function activeBeliefs(memory: IntelMemory): Belief[] {
  return memory.beliefs.filter((b) => b.confidence >= WEAK_FLOOR && b.status !== "contradicted");
}

/** Apply a completed scan to the creator's memory and persist it. */
export function commitScanToMemory(
  job: ScanJob,
  observed: ObservedBelief[],
  now = new Date().toISOString(),
): { memory: IntelMemory; delta: MergeResult["delta"] } {
  const memory = loadMemory(job.creatorId);
  const { beliefs, events, delta } = mergeBeliefs(memory.beliefs, observed, job.scanId, now);

  const videosAnalyzed = job.channels.reduce((sum, channel) => sum + channel.videos.length, 0);
  const transcriptsRead = job.channels.reduce(
    (sum, channel) => sum + channel.videos.filter((v) => v.transcript).length,
    0,
  );
  const trackedChannels = new Set([
    ...memory.scans.flatMap((scan) => scan.channels),
    ...job.channels.map((channel) => channel.channelId),
  ]);

  const next: IntelMemory = {
    creatorId: job.creatorId,
    beliefs,
    events: [
      {
        at: now,
        scanId: job.scanId,
        kind: "scan" as const,
        summary: `Scanned ${job.channels.length} channels · ${videosAnalyzed} videos`,
        detail: `${transcriptsRead} transcripts read`,
      },
      ...events,
      ...memory.events,
    ].slice(0, 300),
    scans: [
      {
        scanId: job.scanId,
        at: now,
        channels: job.channels.map((channel) => channel.channelId),
        videosAnalyzed,
        beliefsAfter: beliefs.length,
      },
      ...memory.scans,
    ].slice(0, 100),
    totals: {
      scans: memory.totals.scans + 1,
      videosAnalyzed: memory.totals.videosAnalyzed + videosAnalyzed,
      transcriptsRead: memory.totals.transcriptsRead + transcriptsRead,
      channelsTracked: trackedChannels.size,
    },
  };

  saveMemory(next);
  return { memory: next, delta };
}
