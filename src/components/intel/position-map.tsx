"use client";

import { useId, useMemo, useState } from "react";

import { formatViews, median } from "@/domain/intel/metrics";
import type { ChannelRecord } from "@/domain/intel/types";

/** The competitive position map.
 *
 * Two questions a creator actually has — "do I convert the audience I have?" and "do I
 * land it consistently?" — plotted against each other, with scale as the third channel.
 *
 * Form: **emphasis**, not categorical. One channel is the subject and the rest are
 * context, so the creator is drawn in the accent hue and every rival in the recessive
 * gray. That is both the honest form for this data and the reason there is no categorical
 * palette here to get wrong: identity never rests on hue, because every point is directly
 * labelled.
 *
 * Axes are deliberately size-normalised. Plotting raw views would put a 4M-subscriber
 * channel in the corner every time and say nothing a subscriber count doesn't already.
 */

type Point = {
  id: string;
  name: string;
  isOwn: boolean;
  /** Median views per subscriber — conversion of the audience they already have. */
  efficiency: number;
  /** Share of sampled videos at ≥1.5x their own median — consistency of breakout. */
  hitRate: number;
  medianViews: number;
  subscribers: number;
  sampled: number;
};

const W = 720;
const H = 420;
const PAD = { top: 26, right: 26, bottom: 46, left: 58 };

/** Grow a degenerate domain so a single point, or several identical ones, still land
 * inside the plot instead of collapsing onto an edge or dividing by zero. */
function domain(values: number[]): [number, number] {
  if (values.length === 0) return [0, 1];
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return [0, 1];
  if (hi === lo) return [Math.max(0, lo - Math.abs(lo || 1) * 0.5), lo + Math.abs(lo || 1) * 0.5];
  const pad = (hi - lo) * 0.16;
  return [Math.max(0, lo - pad), hi + pad];
}

function ticks([lo, hi]: [number, number], count = 4): number[] {
  const step = (hi - lo) / count;
  return Array.from({ length: count + 1 }, (_, i) => lo + step * i);
}

export function PositionMap({ channels }: { channels: ChannelRecord[] }) {
  const titleId = useId();
  const [hover, setHover] = useState<Point | null>(null);
  const [showTable, setShowTable] = useState(false);

  const points = useMemo<Point[]>(
    () =>
      channels
        .filter((channel) => channel.videos.length > 0)
        .map((channel) => ({
          id: channel.channelId,
          name: channel.name,
          isOwn: channel.role === "own",
          efficiency: median(channel.videos.map((v) => v.viewsPerSubscriber)),
          hitRate: channel.stats.hitRate,
          medianViews: channel.stats.medianViews,
          subscribers: channel.subscribers,
          sampled: channel.stats.sampledVideos,
        })),
    [channels],
  );

  const xDomain = useMemo(() => domain(points.map((p) => p.efficiency)), [points]);
  const yDomain = useMemo(() => domain(points.map((p) => p.hitRate)), [points]);
  const maxViews = useMemo(() => Math.max(...points.map((p) => p.medianViews), 1), [points]);

  if (points.length < 2) {
    return null;
  }

  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const x = (v: number) => PAD.left + ((v - xDomain[0]) / (xDomain[1] - xDomain[0])) * plotW;
  const y = (v: number) => PAD.top + plotH - ((v - yDomain[0]) / (yDomain[1] - yDomain[0])) * plotH;
  // Area-proportional, so a channel with 4x the views reads as 4x the area rather than
  // 4x the radius — which would exaggerate it fourfold.
  const r = (v: number) => 7 + Math.sqrt(v / maxViews) * 17;

  const rivals = points.filter((p) => !p.isOwn);
  const own = points.find((p) => p.isOwn);
  // Guides sit at the competitor median, so each quadrant means something concrete
  // ("better conversion than the field") rather than being an arbitrary halfway line.
  const guideX = rivals.length ? median(rivals.map((p) => p.efficiency)) : null;
  const guideY = rivals.length ? median(rivals.map((p) => p.hitRate)) : null;

  return (
    <section className="intel-section position-map" aria-labelledby={titleId}>
      <div className="section-heading">
        <h3 id={titleId}>Competitive position</h3>
        <span className="sample-note">
          Both axes are size-normalised · n={points.reduce((sum, point) => sum + point.sampled, 0)} videos across {points.length} channels
        </span>
      </div>

      <div className="position-map-body">
        <figure className="position-figure">
          <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Competitive position map">
            {/* Template string, not interpolated children: React requires a single text
                child on <title> and throws on an array, which also desynchronises
                hydration. */}
            <title>{`Reach efficiency against breakout consistency for ${points.length} channels`}</title>

            {/* Recessive grid — present for reading values, never competing with marks. */}
            {ticks(yDomain).map((t) => (
              <g key={`y${t}`}>
                <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} className="pm-grid" />
                <text x={PAD.left - 10} y={y(t) + 4} className="pm-axis-label pm-axis-label--y">
                  {(t * 100).toFixed(0)}%
                </text>
              </g>
            ))}
            {ticks(xDomain).map((t) => (
              <text key={`x${t}`} x={x(t)} y={H - PAD.bottom + 20} className="pm-axis-label">
                {t.toFixed(3)}
              </text>
            ))}

            {guideX !== null && guideX > xDomain[0] && guideX < xDomain[1] ? (
              <line x1={x(guideX)} x2={x(guideX)} y1={PAD.top} y2={PAD.top + plotH} className="pm-guide" />
            ) : null}
            {guideY !== null && guideY > yDomain[0] && guideY < yDomain[1] ? (
              <line x1={PAD.left} x2={W - PAD.right} y1={y(guideY)} y2={y(guideY)} className="pm-guide" />
            ) : null}

            {/* No quadrant caption inside the plot: it sat in the top-right, which is
                exactly where a strong channel's label lands, and the two collided. The
                figcaption and the readout hint both state the direction instead. */}

            <line x1={PAD.left} x2={W - PAD.right} y1={PAD.top + plotH} y2={PAD.top + plotH} className="pm-axis" />
            <line x1={PAD.left} x2={PAD.left} y1={PAD.top} y2={PAD.top + plotH} className="pm-axis" />

            <text x={PAD.left + plotW / 2} y={H - 8} className="pm-axis-title">
              Median views per subscriber →
            </text>
            <text
              x={-(PAD.top + plotH / 2)}
              y={15}
              transform="rotate(-90)"
              className="pm-axis-title"
            >
              Breakout hit rate →
            </text>

            {/* Rivals first so the creator's mark is never occluded by context. */}
            {[...rivals, ...(own ? [own] : [])].map((point) => (
              <g
                key={point.id}
                className={`pm-point ${point.isOwn ? "pm-point--own" : ""} ${hover?.id === point.id ? "pm-point--hover" : ""}`}
                onMouseEnter={() => setHover(point)}
                onMouseLeave={() => setHover(null)}
                tabIndex={0}
                role="button"
                aria-label={`${point.name}: ${point.efficiency.toFixed(3)} views per subscriber, ${(point.hitRate * 100).toFixed(0)}% hit rate, median ${formatViews(point.medianViews)} views, sampled ${point.sampled} videos`}
                onFocus={() => setHover(point)}
                onBlur={() => setHover(null)}
              >
                {/* 2px surface ring keeps overlapping marks readable. */}
                <circle cx={x(point.efficiency)} cy={y(point.hitRate)} r={r(point.medianViews) + 2} className="pm-ring" />
                <circle cx={x(point.efficiency)} cy={y(point.hitRate)} r={r(point.medianViews)} className="pm-dot" />
                <text
                  x={x(point.efficiency)}
                  y={y(point.hitRate) - r(point.medianViews) - 8}
                  className="pm-label"
                >
                  {point.name}
                  {point.isOwn ? " (you)" : ""}
                </text>
              </g>
            ))}
          </svg>

          <figcaption>
            Bubble area is median views. Guides mark the competitor median on each axis.
            {` Based on ${points.reduce((sum, point) => sum + point.sampled, 0)} sampled videos.`}
            {own
              ? ` You sit ${own.efficiency >= (guideX ?? 0) ? "ahead of" : "behind"} the field on conversion and ${own.hitRate >= (guideY ?? 0) ? "ahead on" : "behind on"} consistency.`
              : ""}
          </figcaption>
        </figure>

        <aside className="position-readout" aria-live="polite">
          {hover ? (
            <>
              <span className={hover.isOwn ? "pm-readout-name pm-readout-name--own" : "pm-readout-name"}>
                {hover.name}
                {hover.isOwn ? " · you" : ""}
              </span>
              <dl>
                <div>
                  <dt>Views per subscriber</dt>
                  <dd>{hover.efficiency.toFixed(3)}</dd>
                </div>
                <div>
                  <dt>Hit rate</dt>
                  <dd>{(hover.hitRate * 100).toFixed(0)}%</dd>
                </div>
                <div>
                  <dt>Median views</dt>
                  <dd>{formatViews(hover.medianViews)}</dd>
                </div>
                <div>
                  <dt>Subscribers</dt>
                  <dd>{formatViews(hover.subscribers)}</dd>
                </div>
                <div>
                  <dt>Sampled</dt>
                  <dd>{hover.sampled} videos</dd>
                </div>
              </dl>
            </>
          ) : (
            <p className="pm-readout-hint">
              Hover or focus a channel to read its numbers. Up and to the right is
              stronger: better conversion of the audience they have, landed more often.
            </p>
          )}
        </aside>
      </div>

      <button
        type="button"
        className="explorer-toggle pm-table-toggle"
        onClick={() => setShowTable((value) => !value)}
        aria-expanded={showTable}
      >
        {showTable ? "Hide table view" : "Show table view"}
      </button>

      {showTable ? (
        <table className="pm-table">
          <caption className="visually-hidden">Competitive position values</caption>
          <thead>
            <tr>
              <th scope="col">Channel</th>
              <th scope="col">Views / sub</th>
              <th scope="col">Hit rate</th>
              <th scope="col">Median views</th>
              <th scope="col">Subscribers</th>
              <th scope="col">Sample</th>
            </tr>
          </thead>
          <tbody>
            {[...points].sort((a, b) => b.efficiency - a.efficiency).map((point) => (
              <tr key={point.id} className={point.isOwn ? "pm-table-own" : undefined}>
                <th scope="row">
                  {point.name}
                  {point.isOwn ? " (you)" : ""}
                </th>
                <td>{point.efficiency.toFixed(3)}</td>
                <td>{(point.hitRate * 100).toFixed(0)}%</td>
                <td>{formatViews(point.medianViews)}</td>
                <td>{formatViews(point.subscribers)}</td>
                <td>n={point.sampled}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </section>
  );
}
