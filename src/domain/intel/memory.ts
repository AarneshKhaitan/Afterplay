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

import { mergeBeliefs, WEAK_FLOOR } from "./belief-evolution";
import type { MergeResult, ObservedBelief } from "./belief-evolution";
import { loadMemory, saveMemory } from "./store";
import type { Belief, IntelMemory, ScanJob } from "./types";

/** Beliefs worth showing as current knowledge. Weakening ones stay in the store and the
 * timeline but do not get presented as things we believe. */
export function activeBeliefs(memory: IntelMemory): Belief[] {
  return memory.beliefs.filter((b) => b.confidence >= WEAK_FLOOR);
}

/** Apply a completed scan to the creator's memory and persist it. */
export function commitScanToMemory(
  job: ScanJob,
  observed: ObservedBelief[],
  now = new Date().toISOString(),
): { memory: IntelMemory; delta: MergeResult["delta"] } {
  const memory = loadMemory(job.creatorId);
  const coveredChannelIds = job.channels
    .filter((channel) => !channel.error && channel.videos.length > 0)
    .map((channel) => channel.channelId);
  const { beliefs, events, delta } = mergeBeliefs(
    memory.beliefs,
    observed,
    job.scanId,
    now,
    coveredChannelIds,
  );

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
