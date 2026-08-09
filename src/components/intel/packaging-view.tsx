"use client";

import { useState } from "react";

import { featureHint } from "@/domain/intel/features";
import { formatViews } from "@/domain/intel/metrics";
import type { ScanJob } from "@/domain/intel/types";

/** The packaging lab.
 *
 * One table, computed entirely in `metrics.featureLifts` — no model involvement, so this
 * is the part of the console that is arithmetic all the way down. Low-sample rows are
 * shown rather than hidden, greyed and labelled, because silently dropping them would
 * imply a feature was never tested when in fact it was tested and found inconclusive.
 */
export function PackagingView({ scan }: { scan: ScanJob }) {
  const [showAll, setShowAll] = useState(false);
  const byId = new Map(scan.channels.flatMap((c) => c.videos).map((v) => [v.id, v]));
  const rows = showAll ? scan.featureLifts : scan.featureLifts.filter((l) => l.reliable);
  const reliableCount = scan.featureLifts.filter((l) => l.reliable).length;

  return (
    <div className="packaging">
      <div className="section-heading">
        <h3>Packaging lift</h3>
        <span className="sample-note">
          Median outlier multiple with the feature vs without, across all {scan.cost?.videosScraped ?? 0} scraped videos
        </span>
      </div>

      <p className="packaging-explainer">
        Each row asks one question: <strong>do videos with this trait outperform videos without
        it?</strong> Because the score is each video&rsquo;s multiple of its <em>own</em> channel median, a
        big channel cannot dominate the table. This measures association, not causation — a
        trait can correlate with reach because good creators use it, not because it works.
      </p>

      <div className="lift-controls">
        <button
          type="button"
          className={showAll ? "explorer-toggle explorer-toggle--on" : "explorer-toggle"}
          onClick={() => setShowAll((value) => !value)}
          aria-pressed={showAll}
        >
          {showAll ? "Showing all rows" : `Showing ${reliableCount} reliable rows`}
        </button>
        <span className="lift-legend">
          A row is reliable when at least 3 videos sit on each side of the comparison.
        </span>
      </div>

      {rows.length === 0 ? (
        <p className="intel-empty">
          No packaging feature had enough samples on both sides to compare. Scan more videos per
          channel to build this table.
        </p>
      ) : (
        <ul className="lift-list">
          {rows.map((lift) => {
            const strength = Math.min(100, Math.abs(lift.lift - 1) * 100);
            const positive = lift.lift >= 1;
            return (
              <li
                key={lift.feature}
                className={`lift-row ${lift.reliable ? "" : "lift-row--weak"} ${positive ? "lift-row--up" : "lift-row--down"}`}
              >
                <div className="lift-label">
                  <strong>{lift.label}</strong>
                  <small>{featureHint(lift.feature)}</small>
                </div>
                <div className="lift-bar" aria-hidden="true">
                  <span className="lift-bar-mid" />
                  <i
                    className={positive ? "lift-bar-fill lift-bar-fill--up" : "lift-bar-fill lift-bar-fill--down"}
                    style={{ width: `${strength / 2}%` }}
                  />
                </div>
                <div className="lift-value">
                  <strong>{lift.lift.toFixed(2)}x</strong>
                  <small>
                    {lift.withMedian.toFixed(2)} vs {lift.withoutMedian.toFixed(2)}
                  </small>
                </div>
                <div className="lift-sample">
                  <span>
                    n={lift.sampleWith}/{lift.sampleWithout}
                  </span>
                  {!lift.reliable ? <em>low sample</em> : null}
                </div>
                <ul className="lift-examples">
                  {lift.exampleVideoIds.map((id) => {
                    const video = byId.get(id);
                    if (!video) return null;
                    return (
                      <li key={id}>
                        <a href={video.url} target="_blank" rel="noreferrer" title={video.title}>
                          {video.title.length > 34 ? `${video.title.slice(0, 31)}…` : video.title}
                          <em>{formatViews(video.viewCount)}</em>
                        </a>
                      </li>
                    );
                  })}
                </ul>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
