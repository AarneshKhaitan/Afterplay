/** Shared types for the competitive intelligence engine.
 *
 * Deliberately free of Node builtins so client components can import these. Anything
 * that touches `node:fs` lives in `store.ts` / `memory.ts` and is server-only — the same
 * split `experiment-metrics.ts` uses, and for the same reason: a value-import of a
 * node builtin from a client component fails the Turbopack build outright.
 */

export type ChannelRole = "own" | "competitor";

export type VideoFormat = "video" | "short" | "stream";

/** One video, normalised from the Apify YouTube Scraper payload and enriched with
 * metrics we compute ourselves. Every numeric field here is either scraped or derived
 * from scraped values — none are invented. */
export type VideoRecord = {
  id: string;
  title: string;
  url: string;
  thumbnailUrl: string | null;
  publishedAt: string | null;
  viewCount: number;
  likes: number;
  commentsCount: number;
  durationSeconds: number | null;
  durationLabel: string | null;
  hashtags: string[];
  description: string;
  format: VideoFormat;
  channelId: string;
  channelName: string;
  /** Present only when the scrape requested subtitles and YouTube had them. This is the
   * only text that reflects what is actually *said* in the video. */
  transcript: string | null;

  // ── derived ────────────────────────────────────────────────────────────────
  /** (likes + comments) / views. The standard public-signal proxy for resonance. */
  engagementRate: number;
  /** views / channel subscribers. >1 means it reached beyond the existing audience. */
  viewsPerSubscriber: number;
  /** views / channel median views. The single most useful number here: it normalises
   * away channel size, so a 3.0x on a small channel is comparable to a 3.0x on a huge
   * one. Everything downstream ranks on this. */
  outlierMultiple: number;
  ageDays: number | null;
  /** Title/packaging features detected on this video, used for lift analysis. */
  features: string[];
};

export type ChannelStats = {
  medianViews: number;
  meanViews: number;
  maxViews: number;
  medianEngagement: number;
  medianDurationSeconds: number | null;
  uploadsPerWeek: number | null;
  /** Share of videos that beat 1.5x the channel median. A channel with a high hit rate
   * is consistent; a low one is lottery-driven. */
  hitRate: number;
  /** Coefficient of variation on views. High = feast-or-famine. */
  volatility: number;
  formatMix: Record<VideoFormat, number>;
  sampledVideos: number;
};

export type ChannelRecord = {
  channelId: string;
  handle: string | null;
  name: string;
  url: string;
  avatarUrl: string | null;
  subscribers: number;
  totalVideos: number;
  totalViews: number;
  verified: boolean;
  role: ChannelRole;
  videos: VideoRecord[];
  stats: ChannelStats;
  /** Set when the scraper returned an error item for this input instead of videos. */
  error?: { code: string; note: string };
};

/** How much a packaging/format feature moves performance, measured against the same
 * channel set's own baseline — never an absolute benchmark, because channels differ by
 * orders of magnitude. */
export type FeatureLift = {
  feature: string;
  label: string;
  /** Median outlierMultiple of videos WITH the feature. */
  withMedian: number;
  /** Median outlierMultiple of videos WITHOUT it. */
  withoutMedian: number;
  /** withMedian / withoutMedian. >1 means the feature is associated with better reach. */
  lift: number;
  sampleWith: number;
  sampleWithout: number;
  /** False when either arm is too small to say anything. Low-sample rows are kept and
   * shown greyed rather than dropped, so the UI never implies a feature was not tested. */
  reliable: boolean;
  exampleVideoIds: string[];
};

// ── the analysis produced by the model ───────────────────────────────────────

export type Insight = {
  /** Stable slug the model must reuse across scans for the same idea. This is what makes
   * memory merging work without embeddings. */
  key: string;
  title: string;
  detail: string;
  /** Video ids or metric ids backing the claim. Validated against the real corpus — the
   * model cannot cite something that was not scraped. */
  evidence: string[];
  confidence: number;
  impact: "high" | "medium" | "low";
};

export type Recommendation = {
  key: string;
  title: string;
  rationale: string;
  /** Concretely what to do next, in the creator's own terms. */
  action: string;
  evidence: string[];
  effort: "low" | "medium" | "high";
  expectedSignal: string;
  confidence: number;
};

export type Parallel = {
  /** A competitor video that worked … */
  competitorVideoId: string;
  /** … set against the closest thing the creator has made. Null when they have no
   * comparable video, which is itself the finding. */
  ownVideoId: string | null;
  theme: string;
  whatTheyDid: string;
  whatYouDid: string;
  gap: string;
  opportunity: string;
};

export type IntelAnalysis = {
  headline: string;
  positioning: string;
  working: Insight[];
  notWorking: Insight[];
  whitespace: Insight[];
  parallels: Parallel[];
  recommendations: Recommendation[];
  /** Model's own statement of what it could not determine from this data. */
  blindSpots: string[];
};

// ── memory ───────────────────────────────────────────────────────────────────

export type BeliefStatus = "emerging" | "confirmed" | "weakening";

/** One durable thing the system believes about this creator's competitive position.
 *
 * Beliefs are the memory. They survive scans, gain confidence when re-observed, and
 * decay when a later scan covers the same supporting channels but stops supporting
 * them — so an unrelated competitor set cannot weaken standing knowledge. */
export type Belief = {
  key: string;
  scope: "own" | "competitive" | "market";
  statement: string;
  detail: string;
  confidence: number;
  observations: number;
  firstSeen: string;
  lastConfirmed: string;
  lastScanId: string;
  status: BeliefStatus;
  evidence: string[];
  /** Channels whose corpus directly supported the latest observations. Optional only
   * for legacy records; records without coverage do not decay until re-observed. */
  supportingChannelIds?: string[];
  /** Confidence change attributable to the most recent scan. Drives the "what moved"
   * strip in the UI. */
  lastDelta: number;
  history: Array<{ scanId: string; at: string; confidence: number }>;
};

export type MemoryEvent = {
  at: string;
  scanId: string;
  kind: "belief_new" | "belief_confirmed" | "belief_weakened" | "scan";
  summary: string;
  detail?: string;
};

export type IntelMemory = {
  creatorId: string;
  beliefs: Belief[];
  events: MemoryEvent[];
  scans: Array<{
    scanId: string;
    at: string;
    channels: string[];
    videosAnalyzed: number;
    beliefsAfter: number;
  }>;
  /** Cumulative across every scan this workspace has ever run. */
  totals: {
    scans: number;
    videosAnalyzed: number;
    transcriptsRead: number;
    channelsTracked: number;
  };
};

// ── job / pipeline ───────────────────────────────────────────────────────────

export type StageId = "resolve" | "harvest" | "measure" | "watch" | "reason" | "remember";

export type StageState = "pending" | "running" | "complete" | "failed" | "skipped";

export type Stage = {
  id: StageId;
  label: string;
  /** What this stage genuinely does, shown in the UI on hover. Keeps the theatre
   * honest: the stage names are evocative, this line is literal. */
  truth: string;
  state: StageState;
  startedAt?: string;
  endedAt?: string;
  detail?: string;
  progress?: { done: number; total: number };
};

export type ScanLogLine = {
  at: string;
  stage: StageId;
  level: "info" | "success" | "warn" | "error";
  message: string;
};

export type ScanStatus = "queued" | "running" | "complete" | "failed";

export type AgentKind = "scout" | "watcher" | "analyst" | "consolidator";

export type AgentState = "spawning" | "working" | "done" | "failed";

/** One unit of fan-out work, surfaced so the interface can show the swarm.
 *
 * These are real: a `scout` owns one channel's harvest+measure, a `watcher` owns a batch
 * of videos it reads, the `analyst` owns the model call, the `consolidator` owns the
 * memory merge. The concurrency is genuine within a stage — what is presentational is
 * that they are drawn as cards rather than log lines. */
export type AgentTask = {
  id: string;
  kind: AgentKind;
  label: string;
  /** What this agent is actually doing right now. */
  detail: string;
  state: AgentState;
  /** Channel this agent is assigned to, when it has one. */
  channelId?: string;
  processed: number;
  total: number;
  startedAt: string;
  endedAt?: string;
  /** Short findings the agent reports back, shown streaming into its card. */
  findings: string[];
};

export type ScanJob = {
  scanId: string;
  creatorId: string;
  status: ScanStatus;
  startedAt: string;
  endedAt?: string;
  stages: Stage[];
  log: ScanLogLine[];
  input: {
    ownChannel: string;
    competitors: string[];
    videosPerChannel: number;
    withTranscripts: boolean;
    /** NEWEST samples a contiguous recent window — the only ordering from which cadence
     * and recency mean anything. POPULAR samples all-time hits, which is better for
     * "what broke out" but makes cadence unmeasurable. The report states which was used. */
    sortVideosBy: "NEWEST" | "POPULAR";
  };
  /** The fan-out swarm, appended to as stages spawn work. */
  agents: AgentTask[];
  /** Populated as stages complete so the UI can render partial results early. */
  channels: ChannelRecord[];
  featureLifts: FeatureLift[];
  analysis?: IntelAnalysis;
  memoryDelta?: {
    newBeliefs: number;
    confirmed: number;
    weakened: number;
  };
  cost?: { videosScraped: number; estimatedUsd: number };
  error?: { code: string; message: string };
};
