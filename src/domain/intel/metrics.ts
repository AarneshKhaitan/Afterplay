/** Pure analytics over the scraped corpus.
 *
 * Nothing here calls a model or touches the filesystem. This is the layer that has to be
 * *arithmetically* right, because the model's analysis is grounded on it and the UI
 * quotes it verbatim. Every function is total: empty input returns a defined zero rather
 * than NaN, since a single NaN propagates into every downstream ratio and renders as
 * "NaNx" in the interface.
 */

import { FEATURES } from "./features";
import type { ChannelRecord, ChannelStats, FeatureLift, VideoFormat, VideoRecord } from "./types";

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function stdev(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  return Math.sqrt(mean(values.map((v) => (v - m) ** 2)));
}

/** Uploads per week from real publish dates.
 *
 * ONLY meaningful over a chronologically contiguous sample. Callers must not hand this a
 * popularity-ranked sample: those videos are a channel's greatest hits spread across
 * years, so `count / span` measures "how often they made a hit", which is not cadence and
 * is off by an order of magnitude. See `channelStats`, which gates the call.
 *
 * Returns null below two dated videos: one video cannot establish a cadence, and
 * inventing 1.0 would make a dormant channel look like a weekly publisher. */
export function uploadsPerWeek(videos: VideoRecord[]): number | null {
  const times = videos
    .map((video) => (video.publishedAt ? Date.parse(video.publishedAt) : NaN))
    .filter((t) => Number.isFinite(t))
    .sort((a, b) => a - b);
  if (times.length < 2) return null;
  const spanDays = (times[times.length - 1] - times[0]) / 86_400_000;
  if (spanDays <= 0) return null;
  return Number(((times.length / spanDays) * 7).toFixed(2));
}

/** @param cadenceMeasurable true only when the sample is a contiguous recent window
 * (a NEWEST-ordered scrape). A popularity-ordered sample cannot support a cadence claim,
 * so the field is reported as null rather than as a number that looks authoritative and
 * is wrong — the model reads these stats, and it built a headline finding on a bogus
 * 0.02 uploads/week before this was gated. */
export function channelStats(
  videos: VideoRecord[],
  { cadenceMeasurable = false }: { cadenceMeasurable?: boolean } = {},
): ChannelStats {
  const views = videos.map((v) => v.viewCount).filter((v) => v > 0);
  const engagements = videos.map((v) => v.engagementRate).filter((v) => v > 0);
  const durations = videos
    .map((v) => v.durationSeconds)
    .filter((v): v is number => v !== null && v > 0);

  const med = median(views);
  const formatMix: Record<VideoFormat, number> = { video: 0, short: 0, stream: 0 };
  for (const video of videos) formatMix[video.format] += 1;

  const meanViews = mean(views);
  return {
    medianViews: Math.round(med),
    meanViews: Math.round(meanViews),
    maxViews: views.length ? Math.max(...views) : 0,
    medianEngagement: Number(median(engagements).toFixed(5)),
    medianDurationSeconds: durations.length ? Math.round(median(durations)) : null,
    uploadsPerWeek: cadenceMeasurable ? uploadsPerWeek(videos) : null,
    hitRate: videos.length
      ? Number((videos.filter((v) => v.outlierMultiple >= 1.5).length / videos.length).toFixed(3))
      : 0,
    // Coefficient of variation. Guarded on the mean because a channel whose sampled
    // videos all have 0 views would otherwise divide by zero.
    volatility: meanViews > 0 ? Number((stdev(views) / meanViews).toFixed(3)) : 0,
    formatMix,
    sampledVideos: videos.length,
  };
}

/** Measure each packaging feature's association with reach across a video set.
 *
 * Compares median `outlierMultiple` with vs without the feature. `outlierMultiple` is
 * already normalised per channel, so videos from a 4M-sub channel and a 40k-sub channel
 * can sit in the same population without the big channel dominating every row — which is
 * exactly what raw view counts would do.
 *
 * This is association, not causation, and the UI says so. It is still the most decision-
 * useful thing available from public data alone.
 */
export function featureLifts(videos: VideoRecord[], minSample = 3): FeatureLift[] {
  const usable = videos.filter((v) => v.outlierMultiple > 0);
  const lifts: FeatureLift[] = [];

  for (const feature of FEATURES) {
    const withFeature = usable.filter((v) => v.features.includes(feature.id));
    const withoutFeature = usable.filter((v) => !v.features.includes(feature.id));
    if (withFeature.length === 0) continue;

    const withMedian = median(withFeature.map((v) => v.outlierMultiple));
    const withoutMedian = median(withoutFeature.map((v) => v.outlierMultiple));
    // A zero baseline makes lift meaningless rather than infinite.
    const lift = withoutMedian > 0 ? withMedian / withoutMedian : 0;

    lifts.push({
      feature: feature.id,
      label: feature.label,
      withMedian: Number(withMedian.toFixed(3)),
      withoutMedian: Number(withoutMedian.toFixed(3)),
      lift: Number(lift.toFixed(3)),
      sampleWith: withFeature.length,
      sampleWithout: withoutFeature.length,
      reliable: withFeature.length >= minSample && withoutFeature.length >= minSample && lift > 0,
      exampleVideoIds: [...withFeature]
        .sort((a, b) => b.outlierMultiple - a.outlierMultiple)
        .slice(0, 3)
        .map((v) => v.id),
    });
  }

  // Strongest signal first, but unreliable rows sink below reliable ones so the top of
  // the table is always something you could act on.
  return lifts.sort((a, b) => {
    if (a.reliable !== b.reliable) return a.reliable ? -1 : 1;
    return Math.abs(b.lift - 1) - Math.abs(a.lift - 1);
  });
}

/** The videos that most outperformed their own channel. The core "what worked" list. */
export function topOutliers(videos: VideoRecord[], limit = 12): VideoRecord[] {
  return [...videos]
    .filter((v) => v.outlierMultiple > 0)
    .sort((a, b) => b.outlierMultiple - a.outlierMultiple)
    .slice(0, limit);
}

/** The videos that most underperformed. Equally important and usually ignored. */
export function underperformers(videos: VideoRecord[], limit = 8): VideoRecord[] {
  return [...videos]
    .filter((v) => v.outlierMultiple > 0)
    .sort((a, b) => a.outlierMultiple - b.outlierMultiple)
    .slice(0, limit);
}

export type Scoreboard = {
  channelId: string;
  name: string;
  role: ChannelRecord["role"];
  avatarUrl: string | null;
  subscribers: number;
  medianViews: number;
  medianEngagement: number;
  uploadsPerWeek: number | null;
  hitRate: number;
  /** Median views per subscriber — the size-normalised reach measure that lets a small
   * channel legitimately beat a large one. */
  reachEfficiency: number;
  sampledVideos: number;
};

export function scoreboard(channels: ChannelRecord[]): Scoreboard[] {
  return channels
    .map((channel) => ({
      channelId: channel.channelId,
      name: channel.name,
      role: channel.role,
      avatarUrl: channel.avatarUrl,
      subscribers: channel.subscribers,
      medianViews: channel.stats.medianViews,
      medianEngagement: channel.stats.medianEngagement,
      uploadsPerWeek: channel.stats.uploadsPerWeek,
      hitRate: channel.stats.hitRate,
      reachEfficiency: Number(median(channel.videos.map((v) => v.viewsPerSubscriber)).toFixed(4)),
      sampledVideos: channel.stats.sampledVideos,
    }))
    .sort((a, b) => b.reachEfficiency - a.reachEfficiency);
}

/** Where the creator sits against the competitor set on each measure.
 *
 * Percentile rather than rank so the phrasing stays honest with small sets: "ahead of
 * 3 of 5" is clearer than "rank 2". */
export type Standing = {
  metric: string;
  label: string;
  own: number;
  competitorMedian: number;
  /** own / competitorMedian, guarded. */
  ratio: number;
  betterThan: number;
  of: number;
  ownSampledVideos: number;
  competitorSampledVideos: number;
  direction: "ahead" | "behind" | "level";
};

export function standings(channels: ChannelRecord[]): Standing[] {
  const own = channels.find((c) => c.role === "own");
  const rivals = channels.filter((c) => c.role === "competitor" && c.stats.sampledVideos > 0);
  if (!own || rivals.length === 0) return [];

  const measures: Array<{ metric: string; label: string; get: (c: ChannelRecord) => number }> = [
    { metric: "median_views", label: "Median views", get: (c) => c.stats.medianViews },
    {
      metric: "reach_efficiency",
      label: "Views per subscriber",
      get: (c) => median(c.videos.map((v) => v.viewsPerSubscriber)),
    },
    { metric: "engagement", label: "Engagement rate", get: (c) => c.stats.medianEngagement },
    { metric: "hit_rate", label: "Hit rate", get: (c) => c.stats.hitRate },
    // Only offered when the scrape was chronological. On a popularity-ordered sample
    // every channel reports null, and coercing that to 0 would render a confident
    // "0.00 vs 0.00, level" row that means nothing.
    ...(own.stats.uploadsPerWeek !== null
      ? [
          {
            metric: "cadence",
            label: "Uploads per week",
            get: (c: ChannelRecord) => c.stats.uploadsPerWeek ?? 0,
          },
        ]
      : []),
  ];

  return measures.map(({ metric, label, get }) => {
    const ownValue = get(own);
    const rivalValues = rivals.map(get);
    const competitorMedian = median(rivalValues);
    const betterThan = rivalValues.filter((value) => ownValue > value).length;
    const ratio = competitorMedian > 0 ? Number((ownValue / competitorMedian).toFixed(3)) : 0;
    return {
      metric,
      label,
      own: Number(ownValue.toFixed(4)),
      competitorMedian: Number(competitorMedian.toFixed(4)),
      ratio,
      betterThan,
      of: rivals.length,
      ownSampledVideos: own.stats.sampledVideos,
      competitorSampledVideos: rivals.reduce(
        (total, rival) => total + rival.stats.sampledVideos,
        0,
      ),
      direction: ratio > 1.1 ? "ahead" : ratio < 0.9 ? "behind" : "level",
    };
  });
}

/** Themes the competitor set covers that the creator does not.
 *
 * Token-based rather than model-based on purpose: this feeds the model as *evidence*,
 * so it must be computed independently. If the model both proposed and justified the
 * whitespace, the citation would be circular.
 */
const STOPWORDS = new Set(
  ("the a an and or but of to in on for with my your our this that is are was were i we you it its" +
    " at by from as be been new now how why what when who all not no just get got make made vs ep" +
    " part full live stream video gameplay let lets im ive dont cant wont he she they them")
    .split(/\s+/),
);

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s'-]/g, " ")
    .split(/\s+/)
    .map((token) => token.replace(/^['-]+|['-]+$/g, ""))
    .filter((token) => token.length >= 3 && !STOPWORDS.has(token));
}

export type ThemeGap = {
  term: string;
  competitorVideos: number;
  competitorMedianOutlier: number;
  ownVideos: number;
  /** Highest-performing competitor videos on this theme, for citation. */
  exampleVideoIds: string[];
};

export function themeGaps(channels: ChannelRecord[], limit = 10): ThemeGap[] {
  const own = channels.find((c) => c.role === "own");
  const rivals = channels.filter((c) => c.role === "competitor");
  if (!own || rivals.length === 0) return [];

  const ownTerms = new Map<string, number>();
  for (const video of own.videos) {
    for (const token of new Set(tokenize(video.title))) {
      ownTerms.set(token, (ownTerms.get(token) ?? 0) + 1);
    }
  }

  const rivalVideos = rivals.flatMap((c) => c.videos);
  const byTerm = new Map<string, VideoRecord[]>();
  for (const video of rivalVideos) {
    for (const token of new Set(tokenize(video.title))) {
      const bucket = byTerm.get(token);
      if (bucket) bucket.push(video);
      else byTerm.set(token, [video]);
    }
  }

  const gaps: ThemeGap[] = [];
  for (const [term, videos] of byTerm) {
    // A theme needs to appear across the competitor set to be a theme rather than one
    // creator's running series.
    if (videos.length < 3) continue;
    const ownCount = ownTerms.get(term) ?? 0;
    if (ownCount > 1) continue;
    const medianOutlier = median(videos.map((v) => v.outlierMultiple));
    if (medianOutlier < 1) continue;
    gaps.push({
      term,
      competitorVideos: videos.length,
      competitorMedianOutlier: Number(medianOutlier.toFixed(2)),
      ownVideos: ownCount,
      exampleVideoIds: [...videos]
        .sort((a, b) => b.outlierMultiple - a.outlierMultiple)
        .slice(0, 3)
        .map((v) => v.id),
    });
  }

  return gaps
    .sort(
      (a, b) =>
        b.competitorMedianOutlier * Math.log(1 + b.competitorVideos) -
        a.competitorMedianOutlier * Math.log(1 + a.competitorVideos),
    )
    .slice(0, limit);
}

export function formatViews(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(value >= 10_000_000 ? 0 : 1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(value >= 100_000 ? 0 : 1)}K`;
  return String(Math.round(value));
}

export function formatDuration(seconds: number | null): string {
  if (seconds === null) return "—";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${m}:${String(s).padStart(2, "0")}`;
}
