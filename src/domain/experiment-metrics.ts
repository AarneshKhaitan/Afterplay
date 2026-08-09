/** Pure metric helpers shared by server code and client components.
 *
 * Deliberately free of Node builtins. `domain/experiment.ts` reaches the clipper
 * manifest (and therefore `node:fs`), so any client component that value-imports from
 * it drags `node:fs` into the browser bundle and fails the Turbopack build. Client
 * components import from here instead.
 */

export type ExperimentMetrics = {
  views: number;
  returningViewerRate: number;
  repeatCommenters: number;
  trackedLiveVisits: number;
  nextStreamAverageConcurrency: number;
};

/** Pre-experiment baseline. These are the numbers the experiment's own evidence
 * claims, so every reported delta is measured against something stated up front. */
export const BASELINE = {
  views: 842,
  returningViewerRate: 8.2,
  repeatCommenters: 2,
  trackedLiveVisits: 3,
  nextStreamAverageConcurrency: 3.4,
} as const;

export function formatDelta(delta: number, suffix = ""): string {
  const rounded = Number(delta.toFixed(1));
  const sign = rounded > 0 ? "+" : "";
  return `${sign}${rounded}${suffix}`;
}

export function movementMetric(
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
    direction: delta > 0 ? ("up" as const) : ("flat" as const),
  };
}

export function resultMovement(result?: { metrics: ExperimentMetrics }): Array<{
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
