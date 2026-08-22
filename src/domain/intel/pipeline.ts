/** The scan pipeline.
 *
 * Six named stages, run in the background, each writing progress to the scan file so the
 * UI can poll and narrate what is happening. The stage names are evocative because this
 * is a product surface; every stage also carries a `truth` line stating literally what it
 * does, which the UI shows on hover. Both are in `types.ts`.
 *
 * The stages are real work, in order:
 *   resolve  — normalise handles to channel URLs and reject malformed input
 *   harvest  — Apify scrape (the only paid step; cached aggressively)
 *   measure  — pure arithmetic over the corpus
 *   watch    — read transcripts and packaging; the "understanding" pass
 *   reason   — one real model call producing the analysis
 *   remember — fold findings into durable memory and compute deltas
 *
 * Runs are fire-and-forget from the route's perspective: `startScan` returns as soon as
 * the job file exists, and `runScan` continues on the server's event loop. That is why
 * every mutation goes through `patch()` — the file on disk IS the progress channel.
 */

import { randomUUID } from "node:crypto";

import { analysisToObservations, analyzeCorpus, AnalystError } from "./analyst";
import { apifyConfigured, ApifyError, runScrape, toChannelVideosUrl, USD_PER_RESULT } from "./apify";
import { activeBeliefs } from "./memory";
import { commitScanToMemory } from "./memory";
import { featureLifts } from "./metrics";
import { groupByChannel, toChannelRecord } from "./normalize";
import { cacheKey, loadMemory, loadScan, readCache, saveScan, writeCache } from "./store";
import type {
  AgentState,
  AgentTask,
  ChannelRecord,
  IntelAnalysis,
  ScanJob,
  Stage,
  StageId,
} from "./types";

/** Cached scrapes are reused for a day. Long enough that iterating on the UI costs
 * nothing; short enough that a "fresh" scan the next morning really is fresh. */
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

const STAGE_TEMPLATE: Array<Pick<Stage, "id" | "label" | "truth">> = [
  {
    id: "resolve",
    label: "Locking targets",
    truth: "Normalises the handles you typed into YouTube channel URLs and validates them.",
  },
  {
    id: "harvest",
    label: "Harvesting the corpus",
    truth: "Calls the Apify YouTube scraper for each channel's videos tab. This is the only paid step.",
  },
  {
    id: "measure",
    label: "Measuring performance",
    truth: "Pure arithmetic: outlier multiples, engagement, cadence, volatility, hit rate, packaging lift.",
  },
  {
    id: "watch",
    label: "Watching & understanding",
    truth:
      "Reads each video's title, description, packaging features and — where YouTube exposed captions — the actual transcript. Frame-level vision is roadmap, not active.",
  },
  {
    id: "reason",
    label: "Reasoning over the evidence",
    truth: "One real model call over the scraped corpus. Citations are validated against the corpus afterwards.",
  },
  {
    id: "remember",
    label: "Updating memory",
    truth: "Merges findings into durable beliefs, reinforcing or decaying only when the scan covers the same supporting channels.",
  },
];

function freshStages(): Stage[] {
  return STAGE_TEMPLATE.map((stage) => ({ ...stage, state: "pending" as const }));
}

export type StartScanInput = {
  creatorId: string;
  ownChannel: string;
  competitors: string[];
  videosPerChannel?: number;
  withTranscripts?: boolean;
  sortVideosBy?: "POPULAR" | "NEWEST";
};

/** Cadence and recency are only real over a contiguous recent window. */
function cadenceMeasurable(sort: "POPULAR" | "NEWEST"): boolean {
  return sort === "NEWEST";
}

export function createScanJob(input: StartScanInput): ScanJob {
  return {
    scanId: `scan_${randomUUID().slice(0, 8)}`,
    creatorId: input.creatorId,
    status: "queued",
    startedAt: new Date().toISOString(),
    stages: freshStages(),
    log: [],
    input: {
      ownChannel: input.ownChannel,
      competitors: input.competitors,
      videosPerChannel: input.videosPerChannel ?? 12,
      withTranscripts: input.withTranscripts ?? true,
      // NEWEST by default: a competitive read is about what they are doing now, and it
      // is the only ordering from which cadence is a real number.
      sortVideosBy: input.sortVideosBy ?? "NEWEST",
    },
    agents: [],
    channels: [],
    featureLifts: [],
  };
}

/** Spawn a swarm agent and return its id.
 *
 * The swarm is how the interface shows fan-out. Each agent corresponds to real work —
 * one channel, one batch of videos, the model call, the memory merge — so the card count
 * and the processed counters are true, not decorative. */
function spawnAgent(
  scanId: string,
  agent: Omit<AgentTask, "startedAt" | "findings" | "processed"> & { processed?: number },
): string {
  patch(scanId, (job) => {
    job.agents.push({
      ...agent,
      processed: agent.processed ?? 0,
      startedAt: new Date().toISOString(),
      findings: [],
    });
  });
  return agent.id;
}

function updateAgent(scanId: string, id: string, mutate: (agent: AgentTask) => void): void {
  patch(scanId, (job) => {
    const agent = job.agents.find((a) => a.id === id);
    if (agent) mutate(agent);
  });
}

function finishAgent(scanId: string, id: string, state: AgentState, detail?: string): void {
  updateAgent(scanId, id, (agent) => {
    agent.state = state;
    agent.endedAt = new Date().toISOString();
    if (detail) agent.detail = detail;
    if (state === "done") agent.processed = agent.total;
  });
}

/** Read-modify-write the scan file.
 *
 * Always re-reads first: the job runs across many awaits, and holding a stale in-memory
 * copy would clobber log lines appended by a later stage. The file is the single source
 * of truth precisely so the polling route and the runner cannot diverge. */
function patch(scanId: string, mutate: (job: ScanJob) => void): ScanJob {
  const job = loadScan(scanId);
  if (!job) throw new Error(`scan ${scanId} vanished`);
  mutate(job);
  saveScan(job);
  return job;
}

function log(scanId: string, stage: StageId, level: "info" | "success" | "warn" | "error", message: string) {
  patch(scanId, (job) => {
    job.log.push({ at: new Date().toISOString(), stage, level, message });
    // A runaway loop must not grow the file without bound.
    if (job.log.length > 400) job.log = job.log.slice(-400);
  });
}

function stage(scanId: string, id: StageId, state: Stage["state"], detail?: string, progress?: Stage["progress"]) {
  patch(scanId, (job) => {
    const target = job.stages.find((s) => s.id === id);
    if (!target) return;
    target.state = state;
    if (detail !== undefined) target.detail = detail;
    if (progress !== undefined) target.progress = progress;
    if (state === "running" && !target.startedAt) target.startedAt = new Date().toISOString();
    if (state === "complete" || state === "failed") target.endedAt = new Date().toISOString();
  });
}

function fail(scanId: string, code: string, message: string) {
  patch(scanId, (job) => {
    job.status = "failed";
    job.endedAt = new Date().toISOString();
    job.error = { code, message };
    for (const s of job.stages) if (s.state === "running") s.state = "failed";
  });
  log(scanId, "reason", "error", message);
}

/** Run the whole scan. Never throws to the caller: failure is recorded in the job file
 * so the UI can render it, because an unhandled rejection in a detached async function
 * would leave the scan stuck at "running" forever. */
export async function runScan(scanId: string): Promise<void> {
  try {
    const initial = loadScan(scanId);
    if (!initial) return;

    patch(scanId, (job) => {
      job.status = "running";
    });

    // ── resolve ──────────────────────────────────────────────────────────────
    stage(scanId, "resolve", "running");
    const { ownChannel, competitors, videosPerChannel, withTranscripts, sortVideosBy } =
      initial.input;

    let ownUrl: string;
    let rivalUrls: string[];
    try {
      ownUrl = toChannelVideosUrl(ownChannel);
      rivalUrls = competitors.filter((c) => c.trim()).map(toChannelVideosUrl);
    } catch (error) {
      stage(scanId, "resolve", "failed");
      fail(scanId, "invalid_channel", error instanceof Error ? error.message : String(error));
      return;
    }

    const allUrls = [ownUrl, ...rivalUrls];
    log(scanId, "resolve", "success", `Locked ${allUrls.length} channels`);
    for (const url of allUrls) log(scanId, "resolve", "info", `Target: ${url}`);
    stage(scanId, "resolve", "complete", `${allUrls.length} channels`);

    // One scout per channel. They are spawned before the harvest because the scrape is a
    // single batched actor call covering every channel — the scouts represent the
    // per-channel work that follows it, and showing them early is what makes the fan-out
    // legible rather than a single opaque wait.
    const scoutIds = allUrls.map((url, index) =>
      spawnAgent(scanId, {
        id: `scout_${index}`,
        kind: "scout",
        label: index === 0 ? `Scout · your channel` : `Scout · rival ${index}`,
        detail: `Assigned ${url.replace("https://www.youtube.com/", "")}`,
        state: "spawning",
        total: videosPerChannel,
      }),
    );

    // ── harvest ──────────────────────────────────────────────────────────────
    stage(scanId, "harvest", "running", "Contacting scraper…", { done: 0, total: allUrls.length });
    for (const id of scoutIds) {
      updateAgent(scanId, id, (agent) => {
        agent.state = "working";
        agent.detail = "Harvesting channel corpus…";
      });
    }

    if (!apifyConfigured()) {
      stage(scanId, "harvest", "failed");
      fail(
        scanId,
        "apify_not_configured",
        "APIFY_API_TOKEN is not set. Competitive scans need it; no fixture is substituted.",
      );
      return;
    }

    const key = cacheKey([
      "scrape",
      ...allUrls.map((u) => u.replace(/^https?:\/\/(www\.)?youtube\.com\//, "")),
      videosPerChannel,
      withTranscripts,
      // Part of the key: a POPULAR and a NEWEST scrape of the same channels are different
      // corpora, and serving one for the other would silently change what every number
      // in the report means.
      sortVideosBy,
    ]);

    let rawItems = readCache<Awaited<ReturnType<typeof runScrape>>["items"]>(key, CACHE_TTL_MS);
    if (rawItems) {
      log(scanId, "harvest", "success", `Reused cached corpus (${rawItems.length} items) — no scrape cost`);
      stage(scanId, "harvest", "complete", `${rawItems.length} items (cached)`, {
        done: allUrls.length,
        total: allUrls.length,
      });
    } else {
      try {
        const result = await runScrape(
          allUrls,
          {
            maxResults: videosPerChannel,
            downloadSubtitles: withTranscripts,
              sortVideosBy,
            timeoutMs: 8 * 60_000,
          },
          (status, elapsed) => {
            stage(
              scanId,
              "harvest",
              "running",
              `Scraper ${status.toLowerCase()} · ${Math.round(elapsed / 1000)}s`,
              { done: 0, total: allUrls.length },
            );
          },
        );
        rawItems = result.items;
        writeCache(key, rawItems);
        log(scanId, "harvest", "success", `Scraped ${rawItems.length} items across ${allUrls.length} channels`);
        stage(scanId, "harvest", "complete", `${rawItems.length} items`, {
          done: allUrls.length,
          total: allUrls.length,
        });
      } catch (error) {
        stage(scanId, "harvest", "failed");
        const message =
          error instanceof ApifyError ? error.message : `Scrape failed: ${String(error)}`;
        fail(scanId, error instanceof ApifyError ? error.code : "scrape_failed", message);
        return;
      }
    }

    // ── measure ──────────────────────────────────────────────────────────────
    stage(scanId, "measure", "running");
    const grouped = groupByChannel(rawItems);
    const channels: ChannelRecord[] = [];

    // Match each scraped group back to the input that produced it. `inputChannelUrl` is
    // the reliable link; handle matching is the fallback for error items which carry no
    // channel metadata at all.
    const matchInput = (items: typeof rawItems, url: string) =>
      items.some(
        (item) =>
          item.inputChannelUrl === url ||
          item.fromYTUrl === url ||
          (item.input && url.includes(item.input)) ||
          (item.channelUsername && url.toLowerCase().includes(item.channelUsername.toLowerCase())),
      );

    for (const [index, url] of allUrls.entries()) {
      const role = index === 0 ? ("own" as const) : ("competitor" as const);
      const entry = [...grouped.entries()].find(([, items]) => matchInput(items, url));
      if (!entry) {
        log(scanId, "measure", "warn", `No results matched ${url}`);
        channels.push(
          toChannelRecord(
            [{ error: "NO_RESULTS", note: "The scraper returned no items for this channel." }],
            role,
            url,
          ),
        );
        continue;
      }
      const record = toChannelRecord(entry[1], role, url, new Date(), {
        cadenceMeasurable: cadenceMeasurable(sortVideosBy),
      });
      channels.push(record);
      if (record.error) {
        log(scanId, "measure", "warn", `${url}: ${record.error.code} — ${record.error.note}`);
        finishAgent(scanId, scoutIds[index], "failed", record.error.note || record.error.code);
      } else {
        log(
          scanId,
          "measure",
          "success",
          `${record.name}: ${record.videos.length} videos, median ${record.stats.medianViews.toLocaleString()} views`,
        );
        const best = [...record.videos].sort((a, b) => b.outlierMultiple - a.outlierMultiple)[0];
        updateAgent(scanId, scoutIds[index], (agent) => {
          agent.label = `Scout · ${record.name}`;
          agent.channelId = record.channelId;
          agent.total = record.videos.length;
          agent.processed = record.videos.length;
          agent.findings = [
            `${record.videos.length} videos · median ${record.stats.medianViews.toLocaleString()} views`,
            `Hit rate ${(record.stats.hitRate * 100).toFixed(0)}% · volatility ${record.stats.volatility.toFixed(2)}`,
            ...(best ? [`Top: “${best.title.slice(0, 54)}” at ${best.outlierMultiple.toFixed(1)}x`] : []),
          ];
        });
        finishAgent(scanId, scoutIds[index], "done", `${record.videos.length} videos measured`);
      }
    }

    const allVideos = channels.flatMap((c) => c.videos);
    const withVideos = channels.filter((c) => c.videos.length > 0);

    /* Reject a corpus too thin to analyse, with a message naming the actual problem.
     *
     * Without this the model is handed a one-video corpus, cannot honestly produce the
     * findings asked of it, and the failure surfaces as a schema error. The operator sees
     * "expected array to have >=1 items" when what they need to be told is which handles
     * came back empty. The per-channel warnings above already say which; this states the
     * conclusion. */
    if (allVideos.length === 0) {
      stage(scanId, "measure", "failed");
      const failed = channels.filter((c) => c.error).map((c) => c.name);
      fail(
        scanId,
        "empty_corpus",
        `No videos were scraped for any channel${failed.length ? ` (${failed.join(", ")})` : ""}. Check the handles are correct, public, and have uploads.`,
      );
      return;
    }
    if (allVideos.length < 4 || withVideos.length < 2) {
      stage(scanId, "measure", "failed");
      const failed = channels.filter((c) => c.error);
      fail(
        scanId,
        "corpus_too_thin",
        `Only ${allVideos.length} video(s) across ${withVideos.length} channel(s) were scraped — too little to compare. ` +
          (failed.length
            ? `These returned nothing: ${failed.map((c) => `${c.name} (${c.error?.code})`).join(", ")}. `
            : "") +
          "Check the handles and raise videos per channel.",
      );
      return;
    }

    const lifts = featureLifts(allVideos);
    patch(scanId, (job) => {
      job.channels = channels;
      job.featureLifts = lifts;
      job.cost = {
        videosScraped: allVideos.length,
        estimatedUsd: Number((allVideos.length * USD_PER_RESULT).toFixed(3)),
      };
    });
    stage(scanId, "measure", "complete", `${allVideos.length} videos · ${lifts.filter((l) => l.reliable).length} reliable signals`);

    // ── watch ────────────────────────────────────────────────────────────────
    stage(scanId, "watch", "running", undefined, { done: 0, total: allVideos.length });
    const transcripts = allVideos.filter((v) => v.transcript).length;

    // One watcher per channel with videos. The read itself is fast — the corpus is
    // already in memory — so watchers step through their videos on a short tick. That
    // pacing is presentational; the counts, titles and transcript flags they report are
    // real. Documented in docs/intel/INTELLIGENCE.md under "paced for legibility".
    const watchable = channels.filter((c) => c.videos.length > 0);
    const watcherIds = watchable.map((channel, index) =>
      spawnAgent(scanId, {
        id: `watcher_${index}`,
        kind: "watcher",
        label: `Watcher · ${channel.name}`,
        detail: "Opening corpus…",
        state: "working",
        channelId: channel.channelId,
        total: channel.videos.length,
      }),
    );

    const maxSteps = Math.max(...watchable.map((c) => c.videos.length), 0);
    for (let step = 0; step < maxSteps; step += 1) {
      for (const [index, channel] of watchable.entries()) {
        const video = channel.videos[step];
        if (!video) continue;
        updateAgent(scanId, watcherIds[index], (agent) => {
          agent.processed = step + 1;
          agent.detail = `Reading “${video.title.slice(0, 46)}”`;
          if (video.transcript && agent.findings.length < 4) {
            agent.findings.push(`Transcript read · ${video.transcript.split(" ").length} words`);
          } else if (video.outlierMultiple >= 2 && agent.findings.length < 4) {
            agent.findings.push(`${video.outlierMultiple.toFixed(1)}x outlier · ${video.features.length} packaging signals`);
          }
        });
      }
      stage(scanId, "watch", "running", `Reading video ${step + 1} of ${maxSteps}`, {
        done: Math.min(allVideos.length, (step + 1) * watchable.length),
        total: allVideos.length,
      });
      // Bounded total: 12 ticks max regardless of corpus size, so a 90-video scan does
      // not sit in a cosmetic loop for a minute.
      if (step < 12) await new Promise((resolve) => setTimeout(resolve, 110));
    }

    for (const [index, channel] of watchable.entries()) {
      const read = channel.videos.filter((v) => v.transcript).length;
      finishAgent(
        scanId,
        watcherIds[index],
        "done",
        `${channel.videos.length} read · ${read} transcripts`,
      );
    }
    log(
      scanId,
      "watch",
      transcripts > 0 ? "success" : "warn",
      transcripts > 0
        ? `Read ${transcripts} transcripts and ${allVideos.length} titles/descriptions`
        : `No transcripts were available; read ${allVideos.length} titles and descriptions`,
    );
    stage(scanId, "watch", "complete", `${transcripts}/${allVideos.length} transcripts`, {
      done: allVideos.length,
      total: allVideos.length,
    });

    // ── reason ───────────────────────────────────────────────────────────────
    stage(scanId, "reason", "running", "Model is reasoning over the corpus…");
    const memoryBefore = loadMemory(initial.creatorId);
    const prior = activeBeliefs(memoryBefore);
    if (prior.length) {
      log(scanId, "reason", "info", `Carrying ${prior.length} standing beliefs into this scan`);
    }

    const analystId = spawnAgent(scanId, {
      id: "analyst_0",
      kind: "analyst",
      label: "Analyst · cross-channel synthesis",
      detail: `Reasoning over ${allVideos.length} videos and ${prior.length} standing beliefs`,
      state: "working",
      total: allVideos.length,
      processed: allVideos.length,
    });

    let analysis: IntelAnalysis;
    try {
      const result = await analyzeCorpus(channels, lifts, prior, sortVideosBy);
      analysis = result.analysis;
      if (result.stripped > 0) {
        log(
          scanId,
          "reason",
          "warn",
          `Stripped ${result.stripped} unresolvable citations (e.g. ${result.strippedExamples.slice(0, 3).join(", ")})`,
        );
      }
      if (result.dropped > 0) {
        log(scanId, "reason", "warn", `Dropped ${result.dropped} findings left with no valid evidence`);
      }
      log(scanId, "reason", "success", `${result.model}: ${analysis.headline}`);
      updateAgent(scanId, analystId, (agent) => {
        agent.findings = [
          analysis.headline,
          `${analysis.working.length} strengths · ${analysis.notWorking.length} gaps`,
          `${analysis.parallels.length} head-to-head parallels drawn`,
        ];
      });
      finishAgent(scanId, analystId, "done", `${result.model}`);
    } catch (error) {
      finishAgent(scanId, analystId, "failed", "Reasoning failed");
      stage(scanId, "reason", "failed");
      const message = error instanceof AnalystError ? error.message : String(error);
      fail(scanId, error instanceof AnalystError ? error.code : "analysis_failed", message);
      return;
    }

    patch(scanId, (job) => {
      job.analysis = analysis;
    });
    stage(
      scanId,
      "reason",
      "complete",
      `${analysis.working.length} strengths · ${analysis.notWorking.length} gaps · ${analysis.recommendations.length} moves`,
    );

    // ── remember ─────────────────────────────────────────────────────────────
    stage(scanId, "remember", "running");
    const observations = analysisToObservations(analysis, channels);
    const consolidatorId = spawnAgent(scanId, {
      id: "consolidator_0",
      kind: "consolidator",
      label: "Consolidator · memory merge",
      detail: `Folding findings into ${prior.length} standing beliefs`,
      state: "working",
      total: observations.length,
    });

    const finished = loadScan(scanId);
    if (!finished) return;
    const { delta } = commitScanToMemory(finished, observations);
    updateAgent(scanId, consolidatorId, (agent) => {
      agent.findings = [
        `${delta.newBeliefs} new beliefs formed`,
        `${delta.confirmed} reconfirmed, gaining confidence`,
        ...(delta.weakened ? [`${delta.weakened} weakening from absence`] : []),
      ];
    });
    finishAgent(scanId, consolidatorId, "done", `${delta.newBeliefs + delta.confirmed} beliefs touched`);
    log(
      scanId,
      "remember",
      "success",
      `${delta.newBeliefs} new · ${delta.confirmed} reconfirmed · ${delta.weakened} weakening`,
    );
    stage(scanId, "remember", "complete", `${delta.newBeliefs + delta.confirmed} beliefs touched`);

    patch(scanId, (job) => {
      job.status = "complete";
      job.endedAt = new Date().toISOString();
      job.memoryDelta = delta;
    });
  } catch (error) {
    // Last line of defence. Without it a bug anywhere above leaves the scan "running"
    // and the UI spinning forever.
    try {
      fail(scanId, "unexpected_error", error instanceof Error ? error.message : String(error));
    } catch {
      /* the job file is gone; nothing more to do */
    }
  }
}

export function startScan(input: StartScanInput): ScanJob {
  const job = createScanJob(input);
  saveScan(job);
  // Detached on purpose: the route returns immediately and the UI polls. Errors are
  // captured inside runScan, so this cannot reject.
  void runScan(job.scanId);
  return job;
}
