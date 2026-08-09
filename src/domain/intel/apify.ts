/** Apify REST client for `streamers/youtube-scraper`.
 *
 * Written against the REST API rather than the `apify-client` SDK on purpose: we need
 * per-stage progress reporting and hard cost ceilings, and the run/poll/fetch loop is
 * three endpoints. Adding a dependency to wrap three fetches would buy nothing and cost
 * control over timeouts.
 *
 * Cost discipline matters here. The actor bills per result ($5 / 1,000 videos), so every
 * code path that can multiply results is bounded before the run starts, not after.
 */

import type { VideoFormat } from "./types";

const ACTOR_ID = "h7sDV53CddomktSi5"; // streamers/youtube-scraper
const API = "https://api.apify.com/v2";

/** Price per scraped result, from the actor's pricing page (2026-08). Used only to show
 * the operator what a scan cost — it is never used to gate a run, because a stale
 * constant must not be able to block real work. */
export const USD_PER_RESULT = 0.005;

/** Hard ceiling on results per scan, independent of what the caller asks for.
 * A typo in `videosPerChannel` should cost cents, not the whole balance. */
export const MAX_RESULTS_PER_SCAN = 400;

export class ApifyError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "ApifyError";
  }
}

export function apifyToken(): string {
  const token = process.env.APIFY_API_TOKEN;
  if (!token) {
    throw new ApifyError(
      "apify_not_configured",
      "APIFY_API_TOKEN is not set. Competitive scans need it; no fixture is substituted.",
      503,
    );
  }
  return token;
}

export function apifyConfigured(): boolean {
  return Boolean(process.env.APIFY_API_TOKEN);
}

/** Raw shape as it comes off the dataset. Every field optional: the actor omits rather
 * than nulls in places, and a normal item and an error item share the same endpoint. */
export type RawYouTubeItem = {
  id?: string;
  title?: string;
  url?: string;
  thumbnailUrl?: string;
  viewCount?: number;
  date?: string;
  likes?: number;
  commentsCount?: number;
  duration?: string;
  text?: string;
  hashtags?: string[];
  type?: string;
  channelName?: string;
  channelId?: string;
  channelUrl?: string;
  channelUsername?: string;
  channelAvatarUrl?: string;
  channelTotalVideos?: number;
  channelTotalViews?: number | string;
  numberOfSubscribers?: number;
  isChannelVerified?: boolean;
  inputChannelUrl?: string;
  fromYTUrl?: string;
  input?: string;
  subtitles?: Array<{ srt?: string; language?: string; type?: string }> | null;
  isMembersOnly?: boolean;
  // error items
  error?: string;
  note?: string;
};

async function request<T>(path: string, init?: RequestInit & { timeoutMs?: number }): Promise<T> {
  const { timeoutMs = 30_000, ...rest } = init ?? {};
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${API}${path}`, { ...rest, signal: controller.signal });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new ApifyError(
        response.status === 401 ? "apify_unauthorized" : "apify_request_failed",
        `Apify responded ${response.status}: ${body.slice(0, 300)}`,
        response.status === 401 ? 401 : 502,
      );
    }
    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof ApifyError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new ApifyError("apify_timeout", `Apify request timed out after ${timeoutMs}ms.`, 504);
    }
    throw new ApifyError("apify_unreachable", `Apify could not be reached: ${String(error)}`, 502);
  } finally {
    clearTimeout(timer);
  }
}

export type ActorRun = { id: string; defaultDatasetId: string; status: string };

/** Normalise whatever the operator typed into a channel *videos* URL.
 *
 * Accepts `@handle`, a bare handle, a `/channel/UC…` url, or a full `/@handle/videos`
 * url. Getting this wrong is the single most likely cause of an empty scan, so it is
 * pure, exported, and unit-tested rather than inlined at the call site. */
export function toChannelVideosUrl(input: string): string {
  const raw = input.trim();
  if (!raw) throw new ApifyError("invalid_channel", "A channel handle or URL is required.", 400);

  // Already a YouTube URL.
  if (/^https?:\/\//i.test(raw)) {
    const url = raw.replace(/\/+$/, "");
    if (/\/(videos|shorts|streams|about|featured)$/i.test(url)) {
      return url.replace(/\/(about|featured)$/i, "/videos");
    }
    return `${url}/videos`;
  }

  // youtube.com/@handle without protocol
  if (/^(www\.)?youtube\.com\//i.test(raw)) {
    return toChannelVideosUrl(`https://${raw.replace(/^www\./i, "")}`);
  }

  const handle = raw.startsWith("@") ? raw : `@${raw}`;
  return `https://www.youtube.com/${handle}/videos`;
}

export type ScrapeChannelOptions = {
  /** Videos to pull per channel. Bounded by the caller and again by MAX_RESULTS_PER_SCAN. */
  maxResults: number;
  /** Subtitles are what make "the AI read what was actually said" true rather than
   * decorative. They slow the run and cost the same per result, so callers request them
   * only for the channels they will actually read. */
  downloadSubtitles: boolean;
  /** POPULAR surfaces the channel's hits, which is what competitive analysis needs.
   * NEWEST answers "what are they doing lately". Both are useful; the caller picks. */
  sortVideosBy: "POPULAR" | "NEWEST";
  timeoutMs?: number;
};

export function buildActorInput(channelUrls: string[], options: ScrapeChannelOptions) {
  return {
    startUrls: channelUrls.map((url) => ({ url })),
    maxResults: options.maxResults,
    // Shorts and streams come back through separate counters. We leave them at 0 and
    // scrape the /videos tab only, so a channel's long-form output is compared against
    // another channel's long-form output rather than a mix of formats.
    maxResultsShorts: 0,
    maxResultStreams: 0,
    sortVideosBy: options.sortVideosBy,
    downloadSubtitles: options.downloadSubtitles,
    subtitlesLanguage: "en",
    subtitlesFormat: "srt",
    preferAutoGeneratedSubtitles: true,
    saveSubsToKVS: false,
    // AI enrichment is billed extra by the actor and we do our own analysis downstream.
    aiVideoDescription: false,
    aiVideoSummary: false,
  };
}

export async function startScrape(
  channelUrls: string[],
  options: ScrapeChannelOptions,
): Promise<ActorRun> {
  const token = apifyToken();
  const totalRequested = channelUrls.length * options.maxResults;
  if (totalRequested > MAX_RESULTS_PER_SCAN) {
    throw new ApifyError(
      "scan_too_large",
      `This scan would request ${totalRequested} results, above the ${MAX_RESULTS_PER_SCAN} ceiling. Reduce channels or videos per channel.`,
      400,
    );
  }

  const body = JSON.stringify(buildActorInput(channelUrls, options));
  const data = await request<{ data: ActorRun }>(`/acts/${ACTOR_ID}/runs?token=${token}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    timeoutMs: 30_000,
  });
  return data.data;
}

export async function getRun(runId: string): Promise<ActorRun> {
  const token = apifyToken();
  const data = await request<{ data: ActorRun }>(`/actor-runs/${runId}?token=${token}`, {
    timeoutMs: 20_000,
  });
  return data.data;
}

export async function getDatasetItems(datasetId: string): Promise<RawYouTubeItem[]> {
  const token = apifyToken();
  return request<RawYouTubeItem[]>(`/datasets/${datasetId}/items?token=${token}&clean=true`, {
    timeoutMs: 60_000,
  });
}

export async function abortRun(runId: string): Promise<void> {
  try {
    const token = apifyToken();
    await request(`/actor-runs/${runId}/abort?token=${token}`, { method: "POST", timeoutMs: 15_000 });
  } catch {
    // Best effort. A leaked run costs the results it already produced and no more.
  }
}

/** Terminal states as reported by the platform. Anything else means keep polling. */
const TERMINAL = new Set(["SUCCEEDED", "FAILED", "ABORTED", "TIMED-OUT", "TIMING-OUT"]);

export function isTerminal(status: string): boolean {
  return TERMINAL.has(status.toUpperCase());
}

/** Run a scrape to completion.
 *
 * `onPoll` exists so the pipeline can surface "still working" to the UI: a scrape of six
 * channels takes 1-3 minutes and a silent spinner for that long reads as a hang.
 */
export async function runScrape(
  channelUrls: string[],
  options: ScrapeChannelOptions,
  onPoll?: (status: string, elapsedMs: number) => void,
): Promise<{ items: RawYouTubeItem[]; runId: string }> {
  const run = await startScrape(channelUrls, options);
  const started = Date.now();
  const budget = options.timeoutMs ?? 6 * 60_000;

  let status = run.status;
  while (!isTerminal(status)) {
    if (Date.now() - started > budget) {
      await abortRun(run.id);
      throw new ApifyError(
        "scrape_timeout",
        `The scrape exceeded ${Math.round(budget / 1000)}s and was aborted. No partial results were used.`,
        504,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 3_000));
    const current = await getRun(run.id);
    status = current.status;
    onPoll?.(status, Date.now() - started);
  }

  if (status.toUpperCase() !== "SUCCEEDED") {
    throw new ApifyError("scrape_failed", `The scrape finished with status ${status}.`, 502);
  }

  const items = await getDatasetItems(run.defaultDatasetId);
  return { items, runId: run.id };
}

/** Map the actor's `type` field onto our format enum. The actor emits "video" for
 * long-form; shorts and streams arrive with their own type strings when enabled. */
export function toFormat(type: string | undefined, durationSeconds: number | null): VideoFormat {
  const value = (type ?? "").toLowerCase();
  if (value.includes("short")) return "short";
  if (value.includes("stream") || value.includes("live")) return "stream";
  // Some items arrive typed "video" but are clearly Shorts by length. Duration is the
  // more reliable signal, and mislabelling a 40s Short as long-form skews every
  // duration-based conclusion downstream.
  if (durationSeconds !== null && durationSeconds > 0 && durationSeconds <= 60) return "short";
  return "video";
}
