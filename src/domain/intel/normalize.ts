/** Turn raw Apify items into the corpus the rest of the engine reasons over.
 *
 * Pure and Node-free so it can be unit-tested and imported anywhere. Every guard here
 * exists because the scraper genuinely returns the shape being guarded against: absent
 * `likes` on older videos, `channelTotalViews` as a comma-formatted string, error items
 * interleaved with real ones, and relative dates ("10 months ago") instead of ISO.
 */

import { toFormat, type RawYouTubeItem } from "./apify";
import { extractFeatures } from "./features";
import type { ChannelRecord, VideoRecord } from "./types";
import { channelStats } from "./metrics";

function num(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    // "1,710,167,563" — the actor formats some totals with separators.
    const parsed = Number(value.replace(/[^0-9.]/g, ""));
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

/** "00:04:08" or "4:08" -> seconds. Returns null for live/unknown durations rather than
 * 0, because 0 would silently classify a stream as a Short. */
export function durationToSeconds(label: string | undefined): number | null {
  if (!label || typeof label !== "string") return null;
  const parts = label.split(":").map((p) => Number(p));
  if (parts.some((p) => !Number.isFinite(p))) return null;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 1) return parts[0];
  return null;
}

/** The actor returns ISO for single videos but relative strings ("10 months ago") for
 * some channel listings. Both must land on a real date or every cadence and recency
 * number downstream is wrong. */
export function parseDate(value: string | undefined, now = new Date()): string | null {
  if (!value) return null;
  const iso = Date.parse(value);
  if (Number.isFinite(iso)) return new Date(iso).toISOString();

  const relative = /^(\d+)\s+(second|minute|hour|day|week|month|year)s?\s+ago$/i.exec(value.trim());
  if (!relative) return null;
  const amount = Number(relative[1]);
  const unit = relative[2].toLowerCase();
  const ms: Record<string, number> = {
    second: 1000,
    minute: 60_000,
    hour: 3_600_000,
    day: 86_400_000,
    week: 604_800_000,
    month: 2_592_000_000, // 30d — approximate by construction, and labelled as such
    year: 31_536_000_000,
  };
  return new Date(now.getTime() - amount * (ms[unit] ?? 0)).toISOString();
}

/** SRT -> plain text. We keep only spoken words: timings and cue indices are noise to a
 * language model and would eat the context budget. */
export function srtToText(srt: string | undefined, maxChars = 6000): string | null {
  if (!srt || typeof srt !== "string") return null;
  const lines = srt
    .split(/\r?\n/)
    .filter((line) => {
      const trimmed = line.trim();
      if (!trimmed) return false;
      if (/^\d+$/.test(trimmed)) return false; // cue index
      if (/-->/.test(trimmed)) return false; // timing
      return true;
    })
    .map((line) => line.replace(/<[^>]+>/g, "").trim());

  // Auto-captions repeat each line as the rolling window advances; collapse consecutive
  // duplicates or the transcript triples in size and reads as a stutter.
  const deduped: string[] = [];
  for (const line of lines) {
    if (line && line !== deduped[deduped.length - 1]) deduped.push(line);
  }
  const text = deduped.join(" ").replace(/\s+/g, " ").trim();
  if (!text) return null;
  return text.length > maxChars ? `${text.slice(0, maxChars)}…` : text;
}

export function isErrorItem(item: RawYouTubeItem): boolean {
  return typeof item.error === "string" && item.error.length > 0;
}

/** Group raw items by the channel they came from.
 *
 * Keyed on `channelId` when present and the input URL otherwise: a channel whose every
 * item is an error item has no channelId, and dropping it would make a failed channel
 * silently vanish from the report instead of showing why it failed.
 */
export function groupByChannel(items: RawYouTubeItem[]): Map<string, RawYouTubeItem[]> {
  const groups = new Map<string, RawYouTubeItem[]>();
  for (const item of items) {
    const key =
      item.channelId ||
      item.inputChannelUrl ||
      item.fromYTUrl ||
      item.input ||
      item.channelUrl ||
      "unknown";
    const bucket = groups.get(key);
    if (bucket) bucket.push(item);
    else groups.set(key, [item]);
  }
  return groups;
}

function handleFromUrl(url: string | undefined): string | null {
  if (!url) return null;
  const match = /@([A-Za-z0-9._-]+)/.exec(url);
  return match ? `@${match[1]}` : null;
}

/** Build one channel record, including the per-video derived metrics.
 *
 * `subscribers` and the channel totals are repeated on every item by the actor, so we
 * take them from the first item that has them rather than trusting index 0 — the first
 * item is occasionally an error item or a members-only entry with the fields absent.
 */
export function toChannelRecord(
  rawItems: RawYouTubeItem[],
  role: ChannelRecord["role"],
  inputLabel: string,
  now = new Date(),
  { cadenceMeasurable = false }: { cadenceMeasurable?: boolean } = {},
): ChannelRecord {
  const errorItem = rawItems.find(isErrorItem);
  const videosRaw = rawItems.filter((item) => !isErrorItem(item) && item.id);

  const meta =
    videosRaw.find((item) => item.channelId || item.numberOfSubscribers) ?? videosRaw[0] ?? {};

  const subscribers = num(meta.numberOfSubscribers);
  const channelId = meta.channelId || inputLabel;
  const channelName = meta.channelName || handleFromUrl(inputLabel) || inputLabel;

  // Views are needed before per-video metrics, because outlierMultiple is relative to
  // the channel's own median.
  const views = videosRaw.map((item) => num(item.viewCount)).filter((v) => v > 0);
  const medianViews = views.length ? median(views) : 0;

  const videos: VideoRecord[] = videosRaw.map((item) => {
    const viewCount = num(item.viewCount);
    const likes = num(item.likes);
    const comments = num(item.commentsCount);
    const durationSeconds = durationToSeconds(item.duration);
    const publishedAt = parseDate(item.date, now);
    const transcript = srtToText(item.subtitles?.[0]?.srt);
    const title = item.title ?? "Untitled";
    const description = item.text ?? "";

    return {
      id: item.id as string,
      title,
      url: item.url ?? `https://www.youtube.com/watch?v=${item.id}`,
      thumbnailUrl: item.thumbnailUrl ?? null,
      publishedAt,
      viewCount,
      likes,
      commentsCount: comments,
      durationSeconds,
      durationLabel: item.duration ?? null,
      hashtags: Array.isArray(item.hashtags) ? item.hashtags.slice(0, 12) : [],
      description: description.slice(0, 1200),
      format: toFormat(item.type, durationSeconds),
      channelId,
      channelName,
      transcript,
      engagementRate: viewCount > 0 ? (likes + comments) / viewCount : 0,
      viewsPerSubscriber: subscribers > 0 ? viewCount / subscribers : 0,
      outlierMultiple: medianViews > 0 ? viewCount / medianViews : 0,
      ageDays: publishedAt
        ? Math.max(0, Math.round((now.getTime() - Date.parse(publishedAt)) / 86_400_000))
        : null,
      features: extractFeatures(title, description, durationSeconds),
    };
  });

  return {
    channelId,
    handle: meta.channelUsername ? `@${meta.channelUsername}` : handleFromUrl(inputLabel),
    name: channelName,
    url: meta.channelUrl ?? inputLabel,
    avatarUrl: meta.channelAvatarUrl ?? null,
    subscribers,
    totalVideos: num(meta.channelTotalVideos),
    totalViews: num(meta.channelTotalViews),
    verified: Boolean(meta.isChannelVerified),
    role,
    videos,
    stats: channelStats(videos, { cadenceMeasurable }),
    ...(errorItem && videos.length === 0
      ? { error: { code: errorItem.error as string, note: errorItem.note ?? "" } }
      : {}),
  };
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}
