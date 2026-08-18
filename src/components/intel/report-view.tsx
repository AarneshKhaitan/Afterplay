"use client";

import { ArrowDown, ArrowUp, Minus, Target, Warning } from "@phosphor-icons/react";

import { formatViews, scoreboard, standings } from "@/domain/intel/metrics";
import type { Insight, ScanJob, VideoRecord } from "@/domain/intel/types";

import { EvidenceChips } from "./evidence-chips";
import { PositionMap } from "./position-map";

function videoIndex(scan: ScanJob): Map<string, VideoRecord> {
  return new Map(scan.channels.flatMap((c) => c.videos).map((v) => [v.id, v]));
}

function InsightList({
  items,
  scan,
  tone,
}: {
  items: Insight[];
  scan: ScanJob;
  tone: "positive" | "negative" | "neutral";
}) {
  if (items.length === 0) {
    return <p className="intel-empty">Nothing in this category from the current corpus.</p>;
  }
  return (
    <div className="insight-list">
      {items.map((insight) => (
        <article key={insight.key} className={`insight-card insight-card--${tone}`}>
          <header>
            <h4>{insight.title}</h4>
            <span className={`impact-chip impact-chip--${insight.impact}`}>{insight.impact}</span>
          </header>
          <p>{insight.detail}</p>
          <footer>
            <span className="confidence-pill">
              {Math.round(insight.confidence * 100)}% model judgment
            </span>
            <EvidenceChips evidence={insight.evidence} scan={scan} />
          </footer>
        </article>
      ))}
    </div>
  );
}

export function ReportView({ scan }: { scan: ScanJob }) {
  const analysis = scan.analysis;
  const byId = videoIndex(scan);
  const board = scoreboard(scan.channels);
  const st = standings(scan.channels);
  const own = scan.channels.find((c) => c.role === "own");
  const sampledChannels = scan.channels.filter((channel) => channel.stats.sampledVideos > 0);
  const totalSampledVideos = sampledChannels.reduce(
    (total, channel) => total + channel.stats.sampledVideos,
    0,
  );
  const transcriptCount = scan.channels.reduce(
    (total, channel) => total + channel.videos.filter((video) => video.transcript).length,
    0,
  );
  const thinChannels = sampledChannels.filter((channel) => channel.stats.sampledVideos < 3);
  const thinCorpus = thinChannels.length > 0;

  if (!analysis) {
    return <p className="intel-empty">This scan produced no analysis.</p>;
  }

  /** Three numbers that carry the verdict. Chosen because each is a *comparison* — a
   * bare "350K median views" tells a creator nothing without the field beside it. */
  const reach = st.find((s) => s.metric === "median_views");
  const efficiency = st.find((s) => s.metric === "reach_efficiency");
  const consistency = st.find((s) => s.metric === "hit_rate");
  const headlineStats = [
    reach && {
      label: `Median views vs field${reach.direction === "ahead" ? " · ahead" : reach.direction === "behind" ? " · behind" : ""}`,
      value: `${reach.ratio.toFixed(2)}x`,
      accent: reach.direction === "behind",
    },
    efficiency && {
      label: "Views per subscriber vs field",
      value: `${efficiency.ratio.toFixed(2)}x`,
      accent: efficiency.direction === "behind",
    },
    consistency && {
      label: "Breakout hit rate vs field",
      value: `${consistency.ratio.toFixed(2)}x`,
      accent: consistency.direction === "behind",
    },
    own && {
      label: `Sampled from ${own.name}`,
      value: `${own.videos.length} videos`,
      accent: false,
    },
  ].filter((stat): stat is { label: string; value: string; accent: boolean } => Boolean(stat));

  return (
    <div className="intel-report">
      <section className="intel-headline-card">
        <span className="intel-kicker">The verdict</span>
        <h2 className="verdict-h">{analysis.headline}</h2>
        <p className="verdict-lede">{analysis.positioning}</p>

        {/* The three numbers that carry the verdict, pulled forward so the reader gets
            the shape of it before reading a word of analysis. */}
        <div className="verdict-stats">
          {headlineStats.map((stat) => (
            <div
              key={stat.label}
              className={stat.accent ? "verdict-stat verdict-stat--accent" : "verdict-stat"}
            >
              <strong>{stat.value}</strong>
              <span>{stat.label}</span>
            </div>
          ))}
        </div>
        <div className="intel-provenance">
          <span>
            {scan.channels.length} {scan.channels.length === 1 ? "channel" : "channels"} ·{" "}
            {scan.cost?.videosScraped ?? 0} real{" "}
            {(scan.cost?.videosScraped ?? 0) === 1 ? "video" : "videos"} · {transcriptCount}{" "}
            {transcriptCount === 1 ? "transcript" : "transcripts"}
          </span>
          <span>
            Scraped live from YouTube. Rankings are relative to each channel&rsquo;s own median.{" "}
            {scan.input.sortVideosBy === "POPULAR"
              ? "Sample: each channel’s all-time most popular uploads, so posting cadence is not measurable from it."
              : "Sample: each channel’s most recent uploads, so cadence and recency are measured, not inferred."}
          </span>
          {thinCorpus ? (
            <span>
              Directional sample: {thinChannels.length} of {sampledChannels.length}{" "}
              {sampledChannels.length === 1 ? "channel has" : "channels have"} fewer than 3
              sampled videos. Treat findings as hypotheses to test.
            </span>
          ) : null}
        </div>
      </section>

      <section className="intel-section" aria-labelledby="standings-title">
        <div className="section-heading">
          <h3 id="standings-title">Where you stand</h3>
          <span className="sample-note">
            Against the competitor median · n={totalSampledVideos} videos across {sampledChannels.length} channels
          </span>
        </div>
        <div className="standings-grid">
          {st.map((row) => (
            <article key={row.metric} className={`standing standing--${row.direction}`}>
              <span>{row.label}</span>
              <strong>
                {row.metric === "engagement"
                  ? `${(row.own * 100).toFixed(2)}%`
                  : row.metric === "median_views"
                    ? formatViews(row.own)
                    : row.own.toFixed(2)}
              </strong>
              <div className="standing-delta">
                {row.direction === "ahead" ? (
                  <ArrowUp weight="bold" />
                ) : row.direction === "behind" ? (
                  <ArrowDown weight="bold" />
                ) : (
                  <Minus weight="bold" />
                )}
                <span>{row.ratio.toFixed(2)}x their median</span>
              </div>
              <small>
                Ahead of {row.betterThan} of {row.of} · n={row.ownSampledVideos} yours vs n={row.competitorSampledVideos} competitor videos
              </small>
            </article>
          ))}
        </div>
      </section>

      <PositionMap channels={scan.channels} />

      <section className="intel-section" aria-labelledby="board-title">
        <div className="section-heading">
          <h3 id="board-title">The field</h3>
          <span className="sample-note">
            Sorted by views per subscriber · n={totalSampledVideos} videos
          </span>
        </div>
        <div className="board-table" role="table">
          <div className="board-row board-row--head" role="row">
            <span role="columnheader">Channel</span>
            <span role="columnheader">Subscribers</span>
            <span role="columnheader">Median views</span>
            <span role="columnheader">Views / sub</span>
            <span role="columnheader">Engagement</span>
            <span role="columnheader">Hit rate</span>
            <span role="columnheader">Cadence</span>
            <span role="columnheader">Sample</span>
          </div>
          {board.map((row) => (
            <div
              key={row.channelId}
              className={`board-row ${row.role === "own" ? "board-row--own" : ""}`}
              role="row"
            >
              <span role="cell" className="board-channel">
                {row.name}
                {row.role === "own" ? <em>you</em> : null}
              </span>
              <span role="cell">{formatViews(row.subscribers)}</span>
              <span role="cell">{formatViews(row.medianViews)}</span>
              <span role="cell">{row.reachEfficiency.toFixed(3)}</span>
              <span role="cell">{(row.medianEngagement * 100).toFixed(2)}%</span>
              <span role="cell">{(row.hitRate * 100).toFixed(0)}%</span>
              <span role="cell" title={row.uploadsPerWeek === null ? "Not measurable from an all-time-popular sample" : undefined}>
                {row.uploadsPerWeek !== null ? `${row.uploadsPerWeek}/wk` : "not measured"}
              </span>
              <span role="cell">n={row.sampledVideos}</span>
            </div>
          ))}
        </div>
      </section>

      <div className="intel-columns">
        <section className="intel-section" aria-labelledby="working-title">
          <div className="section-heading">
            <h3 id="working-title">What is working</h3>
          </div>
          <InsightList items={analysis.working} scan={scan} tone="positive" />
        </section>

        <section className="intel-section" aria-labelledby="notworking-title">
          <div className="section-heading">
            <h3 id="notworking-title">What is not</h3>
          </div>
          <InsightList items={analysis.notWorking} scan={scan} tone="negative" />
        </section>
      </div>

      {analysis.whitespace.length > 0 ? (
        <section className="intel-section" aria-labelledby="whitespace-title">
          <div className="section-heading">
            <h3 id="whitespace-title">Whitespace</h3>
            <span className="sample-note">Ground they cover that you do not</span>
          </div>
          <InsightList items={analysis.whitespace} scan={scan} tone="neutral" />
        </section>
      ) : null}

      {analysis.parallels.length > 0 ? (
        <section className="intel-section" aria-labelledby="parallels-title">
          <div className="section-heading">
            <h3 id="parallels-title">Head to head</h3>
            <span className="sample-note">Their video against your closest equivalent</span>
          </div>
          <div className="parallel-list">
            {analysis.parallels.map((parallel) => {
              const theirs = byId.get(parallel.competitorVideoId);
              const yours = parallel.ownVideoId ? byId.get(parallel.ownVideoId) : null;
              return (
                <article className="parallel-card" key={parallel.competitorVideoId}>
                  <span className="parallel-theme">{parallel.theme}</span>
                  <div className="parallel-pair">
                    <div className="parallel-side">
                      <span className="parallel-label">Them</span>
                      {theirs ? (
                        <a href={theirs.url} target="_blank" rel="noreferrer" className="parallel-video">
                          {theirs.thumbnailUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={theirs.thumbnailUrl} alt="" loading="lazy" />
                          ) : null}
                          <strong>{theirs.title}</strong>
                          <small>
                            {theirs.channelName} · {formatViews(theirs.viewCount)} views ·{" "}
                            {theirs.outlierMultiple.toFixed(1)}x their median
                          </small>
                        </a>
                      ) : null}
                      <p>{parallel.whatTheyDid}</p>
                    </div>
                    <div className="parallel-side">
                      <span className="parallel-label">You</span>
                      {yours ? (
                        <a href={yours.url} target="_blank" rel="noreferrer" className="parallel-video">
                          {yours.thumbnailUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={yours.thumbnailUrl} alt="" loading="lazy" />
                          ) : null}
                          <strong>{yours.title}</strong>
                          <small>
                            {formatViews(yours.viewCount)} views · {yours.outlierMultiple.toFixed(1)}x your median
                          </small>
                        </a>
                      ) : (
                        <div className="parallel-absent">
                          <Warning weight="fill" />
                          <span>No comparable video in your sampled corpus.</span>
                        </div>
                      )}
                      <p>{parallel.whatYouDid}</p>
                    </div>
                  </div>
                  <div className="parallel-gap">
                    <div>
                      <span>Gap</span>
                      <p>{parallel.gap}</p>
                    </div>
                    <div>
                      <span>Opportunity</span>
                      <p>{parallel.opportunity}</p>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      ) : null}

      <section className="intel-section" aria-labelledby="recs-title">
        <div className="section-heading">
          <h3 id="recs-title">What to test next</h3>
          <span className="sample-note">
            {thinCorpus
              ? "Directional hypotheses from a thin public-data sample"
              : "Ordered by the analyst’s model judgment"}
          </span>
        </div>
        <div className="rec-list">
          {[...analysis.recommendations]
            .sort((a, b) => b.confidence - a.confidence)
            .map((rec, index) => (
              <article className="rec-card" key={rec.key}>
                <span className="rec-index">{String(index + 1).padStart(2, "0")}</span>
                <div className="rec-body">
                  <header>
                    <h4>{rec.title}</h4>
                    <div className="rec-chips">
                      <span className={`effort-chip effort-chip--${rec.effort}`}>{rec.effort} effort</span>
                      <span className="confidence-pill">
                        {Math.round(rec.confidence * 100)}% model judgment
                      </span>
                    </div>
                  </header>
                  <p className="rec-action">
                    <Target weight="bold" /> Test: {rec.action}
                  </p>
                  <p className="rec-rationale">{rec.rationale}</p>
                  <div className="rec-signal">
                    <span>Watch for</span>
                    <strong>{rec.expectedSignal}</strong>
                  </div>
                  <EvidenceChips evidence={rec.evidence} scan={scan} />
                </div>
              </article>
            ))}
        </div>
      </section>

      {analysis.blindSpots.length > 0 ? (
        <section className="intel-section intel-blindspots" aria-labelledby="blind-title">
          <div className="section-heading">
            <h3 id="blind-title">What this cannot tell you</h3>
          </div>
          <ul>
            {analysis.blindSpots.map((spot) => (
              <li key={spot}>{spot}</li>
            ))}
          </ul>
          <p className="intel-footnote">
            Public scrape data shows association, never causation. Retention, click-through and
            traffic sources are not visible without the creator&rsquo;s own analytics.
            {own ? ` Your corpus here is ${own.videos.length} of your ${own.totalVideos || "?"} uploads.` : ""}
          </p>
        </section>
      ) : null}
    </div>
  );
}
