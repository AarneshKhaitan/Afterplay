"use client";

import { ArrowsDownUp, FunnelSimple, MagnifyingGlass, TextT } from "@phosphor-icons/react";
import { useMemo, useState } from "react";

import { featureLabel } from "@/domain/intel/features";
import { formatDuration, formatViews } from "@/domain/intel/metrics";
import type { ScanJob, VideoRecord } from "@/domain/intel/types";

type SortKey = "outlier" | "views" | "engagement" | "recent" | "duration";

const SORTS: Array<{ id: SortKey; label: string; get: (v: VideoRecord) => number }> = [
  { id: "outlier", label: "Outlier multiple", get: (v) => v.outlierMultiple },
  { id: "views", label: "Views", get: (v) => v.viewCount },
  { id: "engagement", label: "Engagement", get: (v) => v.engagementRate },
  { id: "recent", label: "Most recent", get: (v) => (v.publishedAt ? Date.parse(v.publishedAt) : 0) },
  { id: "duration", label: "Duration", get: (v) => v.durationSeconds ?? 0 },
];

/** The full corpus, explorable.
 *
 * Every insight elsewhere in the console is a claim about this table, so the table has to
 * be here and has to be honest: it shows all scraped videos, not a curated subset, and
 * the filter state is visible so nobody mistakes a filtered view for the whole picture.
 */
export function VideoExplorer({ scan }: { scan: ScanJob }) {
  const allVideos = useMemo(() => scan.channels.flatMap((c) => c.videos), [scan]);

  const [query, setQuery] = useState("");
  const [channelFilter, setChannelFilter] = useState<string>("all");
  const [featureFilter, setFeatureFilter] = useState<string>("all");
  const [transcriptOnly, setTranscriptOnly] = useState(false);
  const [outlierOnly, setOutlierOnly] = useState(false);
  const [sort, setSort] = useState<SortKey>("outlier");
  const [ascending, setAscending] = useState(false);

  const availableFeatures = useMemo(() => {
    const counts = new Map<string, number>();
    for (const video of allVideos) {
      for (const feature of video.features) counts.set(feature, (counts.get(feature) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [allVideos]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const getter = SORTS.find((s) => s.id === sort)?.get ?? SORTS[0].get;

    const rows = allVideos.filter((video) => {
      if (channelFilter !== "all" && video.channelId !== channelFilter) return false;
      if (featureFilter !== "all" && !video.features.includes(featureFilter)) return false;
      if (transcriptOnly && !video.transcript) return false;
      if (outlierOnly && video.outlierMultiple < 1.5) return false;
      if (!needle) return true;
      // Search titles, descriptions and transcripts. Searching the transcript is the
      // reason this is worth building: "find every video where they mention the new
      // patch" is not answerable from titles alone.
      return (
        video.title.toLowerCase().includes(needle) ||
        video.description.toLowerCase().includes(needle) ||
        video.channelName.toLowerCase().includes(needle) ||
        (video.transcript?.toLowerCase().includes(needle) ?? false)
      );
    });

    return rows.sort((a, b) => (ascending ? getter(a) - getter(b) : getter(b) - getter(a)));
  }, [allVideos, query, channelFilter, featureFilter, transcriptOnly, outlierOnly, sort, ascending]);

  const matchesTranscript = (video: VideoRecord) => {
    const needle = query.trim().toLowerCase();
    if (!needle || !video.transcript) return null;
    const index = video.transcript.toLowerCase().indexOf(needle);
    if (index < 0) return null;
    const start = Math.max(0, index - 60);
    return `…${video.transcript.slice(start, index + needle.length + 90)}…`;
  };

  return (
    <div className="explorer">
      <div className="explorer-controls">
        <div className="explorer-search">
          <MagnifyingGlass weight="bold" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search titles, descriptions and transcripts…"
            aria-label="Search the corpus"
            type="search"
          />
        </div>

        <label className="explorer-select">
          <FunnelSimple weight="bold" />
          <span className="visually-hidden">Filter by channel</span>
          <select value={channelFilter} onChange={(event) => setChannelFilter(event.target.value)}>
            <option value="all">All channels</option>
            {scan.channels
              .filter((channel) => channel.videos.length > 0)
              .map((channel) => (
                <option key={channel.channelId} value={channel.channelId}>
                  {channel.name} ({channel.videos.length})
                </option>
              ))}
          </select>
        </label>

        <label className="explorer-select">
          <TextT weight="bold" />
          <span className="visually-hidden">Filter by packaging feature</span>
          <select value={featureFilter} onChange={(event) => setFeatureFilter(event.target.value)}>
            <option value="all">Any packaging</option>
            {availableFeatures.map(([feature, count]) => (
              <option key={feature} value={feature}>
                {featureLabel(feature)} ({count})
              </option>
            ))}
          </select>
        </label>

        <label className="explorer-select">
          <ArrowsDownUp weight="bold" />
          <span className="visually-hidden">Sort by</span>
          <select value={sort} onChange={(event) => setSort(event.target.value as SortKey)}>
            {SORTS.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <button
          type="button"
          className="explorer-toggle"
          onClick={() => setAscending((value) => !value)}
          aria-pressed={ascending}
        >
          {ascending ? "Ascending" : "Descending"}
        </button>

        <button
          type="button"
          className={outlierOnly ? "explorer-toggle explorer-toggle--on" : "explorer-toggle"}
          onClick={() => setOutlierOnly((value) => !value)}
          aria-pressed={outlierOnly}
        >
          Outliers only
        </button>

        <button
          type="button"
          className={transcriptOnly ? "explorer-toggle explorer-toggle--on" : "explorer-toggle"}
          onClick={() => setTranscriptOnly((value) => !value)}
          aria-pressed={transcriptOnly}
        >
          Has transcript
        </button>
      </div>

      <p className="explorer-count" role="status">
        Showing {filtered.length} of {allVideos.length} scraped videos
        {query.trim() ? ` matching “${query.trim()}”` : ""}
      </p>

      {filtered.length === 0 ? (
        <p className="intel-empty">No videos match these filters.</p>
      ) : (
        <ul className="explorer-list">
          {filtered.map((video) => {
            const excerpt = matchesTranscript(video);
            return (
              <li key={video.id} className="explorer-row">
                <a href={video.url} target="_blank" rel="noreferrer" className="explorer-thumb">
                  {video.thumbnailUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={video.thumbnailUrl} alt="" loading="lazy" />
                  ) : (
                    <span className="explorer-thumb-empty" aria-hidden="true" />
                  )}
                  <span className="explorer-duration">{formatDuration(video.durationSeconds)}</span>
                </a>
                <div className="explorer-main">
                  <a href={video.url} target="_blank" rel="noreferrer" className="explorer-title">
                    {video.title}
                  </a>
                  <div className="explorer-meta">
                    <span className="explorer-channel">{video.channelName}</span>
                    <span>{formatViews(video.viewCount)} views</span>
                    <span>{(video.engagementRate * 100).toFixed(2)}% engagement</span>
                    {video.ageDays !== null ? <span>{video.ageDays}d old</span> : null}
                    {video.transcript ? <span className="explorer-flag">transcript</span> : null}
                  </div>
                  {excerpt ? <p className="explorer-excerpt">{excerpt}</p> : null}
                  {video.features.length > 0 ? (
                    <ul className="explorer-features">
                      {video.features.slice(0, 6).map((feature) => (
                        <li key={feature}>
                          <button type="button" onClick={() => setFeatureFilter(feature)}>
                            {featureLabel(feature)}
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
                <div
                  className={`explorer-outlier ${video.outlierMultiple >= 1.5 ? "explorer-outlier--hot" : ""}`}
                >
                  <strong>{video.outlierMultiple.toFixed(1)}x</strong>
                  <small>vs own median</small>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
