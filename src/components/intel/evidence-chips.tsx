"use client";

import { FilmSlate, Tag } from "@phosphor-icons/react";

import { formatViews } from "@/domain/intel/metrics";
import type { ScanJob } from "@/domain/intel/types";

/** Render an insight's citations.
 *
 * A citation that resolves to a video becomes a link to the real video with its real
 * numbers; anything else (a packaging feature, a metric name, a theme) renders as a plain
 * tag. That difference is the point: it makes ungrounded-looking claims visually obvious
 * next to ones anchored in a specific video someone can go and watch.
 */
export function EvidenceChips({ evidence, scan }: { evidence: string[]; scan: ScanJob }) {
  if (evidence.length === 0) return null;
  const byId = new Map(scan.channels.flatMap((c) => c.videos).map((v) => [v.id, v]));

  return (
    <ul className="evidence-chips">
      {evidence.map((citation) => {
        const video = byId.get(citation);
        if (video) {
          return (
            <li key={citation}>
              <a
                href={video.url}
                target="_blank"
                rel="noreferrer"
                className="evidence-chip evidence-chip--video"
                title={`${video.channelName} · ${formatViews(video.viewCount)} views · ${video.outlierMultiple.toFixed(1)}x median`}
              >
                <FilmSlate weight="bold" />
                <span>{video.title.length > 40 ? `${video.title.slice(0, 37)}…` : video.title}</span>
                <em>{video.outlierMultiple.toFixed(1)}x</em>
              </a>
            </li>
          );
        }
        return (
          <li key={citation}>
            <span className="evidence-chip">
              <Tag weight="bold" />
              {citation}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
