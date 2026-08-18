import { expect, test } from "@playwright/test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { TEST_INTEL_DIR } from "./intel-dir";

/** Browser behaviour of the intelligence console, against a deterministic fixture store.
 *
 * The fixture is written into an isolated `AFTERPLAY_INTEL_DIR` (see `intel-dir.ts`) so a
 * test run can never become the report or the memory a demo would show. It is shaped
 * exactly like a real scan file — same schema the pipeline writes — so these assertions
 * hold against real output too.
 */

const CREATOR = "creator_mika_rigged";

function video(overrides: Record<string, unknown>) {
  return {
    id: "vid_default",
    title: "Untitled",
    url: "https://www.youtube.com/watch?v=vid_default",
    thumbnailUrl: null,
    publishedAt: "2026-07-01T00:00:00.000Z",
    viewCount: 1000,
    likes: 50,
    commentsCount: 10,
    durationSeconds: 600,
    durationLabel: "10:00",
    hashtags: [],
    description: "",
    format: "video",
    channelId: "ch_own",
    channelName: "Your Channel",
    transcript: null,
    engagementRate: 0.06,
    viewsPerSubscriber: 0.1,
    outlierMultiple: 1,
    ageDays: 39,
    features: [],
    ...overrides,
  };
}

test.beforeAll(() => {
  rmSync(TEST_INTEL_DIR, { recursive: true, force: true });
  mkdirSync(join(TEST_INTEL_DIR, "scans"), { recursive: true });
  mkdirSync(join(TEST_INTEL_DIR, "memory"), { recursive: true });

  const ownVideos = [
    video({
      id: "own_hit",
      title: "I rebuilt the bridge with ONE rule",
      channelId: "ch_own",
      channelName: "Your Channel",
      viewCount: 5000,
      outlierMultiple: 2.5,
      features: ["title_number", "title_caps"],
      transcript: "today we are rebuilding the bridge with a single constraint",
    }),
    video({ id: "own_flop", title: "Casual stream highlights", viewCount: 400, outlierMultiple: 0.2 }),
  ];
  const rivalVideos = [
    video({
      id: "rival_hit",
      title: "Can I survive 100 days? (INSANE)",
      channelId: "ch_rival",
      channelName: "Rival Channel",
      viewCount: 90000,
      outlierMultiple: 3.1,
      features: ["title_question", "title_number", "title_bracket"],
    }),
  ];

  const scan = {
    scanId: "scan_fixture",
    creatorId: CREATOR,
    status: "complete",
    startedAt: "2026-08-08T10:00:00.000Z",
    endedAt: "2026-08-08T10:03:00.000Z",
    stages: [],
    log: [],
    input: { ownChannel: "@you", competitors: ["@rival"], videosPerChannel: 8, withTranscripts: true },
    agents: [],
    channels: [
      {
        channelId: "ch_own",
        handle: "@you",
        name: "Your Channel",
        url: "https://www.youtube.com/@you",
        avatarUrl: null,
        subscribers: 50000,
        totalVideos: 120,
        totalViews: 900000,
        verified: false,
        role: "own",
        videos: ownVideos,
        stats: {
          medianViews: 2000, meanViews: 2700, maxViews: 5000, medianEngagement: 0.05,
          medianDurationSeconds: 600, uploadsPerWeek: 1.2, hitRate: 0.5, volatility: 0.8,
          formatMix: { video: 2, short: 0, stream: 0 }, sampledVideos: 2,
        },
      },
      {
        channelId: "ch_rival",
        handle: "@rival",
        name: "Rival Channel",
        url: "https://www.youtube.com/@rival",
        avatarUrl: null,
        subscribers: 400000,
        totalVideos: 300,
        totalViews: 50000000,
        verified: true,
        role: "competitor",
        videos: rivalVideos,
        stats: {
          medianViews: 29000, meanViews: 29000, maxViews: 90000, medianEngagement: 0.08,
          medianDurationSeconds: 900, uploadsPerWeek: 3.4, hitRate: 0.8, volatility: 0.4,
          formatMix: { video: 1, short: 0, stream: 0 }, sampledVideos: 1,
        },
      },
    ],
    featureLifts: [
      {
        feature: "title_question", label: "Question in title", withMedian: 2.4, withoutMedian: 0.9,
        lift: 2.67, sampleWith: 4, sampleWithout: 6, reliable: true, exampleVideoIds: ["rival_hit"],
      },
      {
        feature: "title_emoji", label: "Emoji in title", withMedian: 1.1, withoutMedian: 1.0,
        lift: 1.1, sampleWith: 1, sampleWithout: 9, reliable: false, exampleVideoIds: [],
      },
    ],
    analysis: {
      headline: "You convert better than they do, but publish a third as often.",
      positioning: "Your best work outperforms theirs per subscriber; cadence is the constraint.",
      working: [
        { key: "constraint-format-works", title: "Constraint framing carries your best videos", detail: "Your top video uses an explicit rule.", evidence: ["own_hit"], confidence: 0.8, impact: "high" },
      ],
      notWorking: [
        { key: "untitled-highlights-fail", title: "Undifferentiated highlight uploads underperform", detail: "Generic highlight titles land far below your median.", evidence: ["own_flop"], confidence: 0.7, impact: "medium" },
      ],
      whitespace: [
        { key: "survival-challenge-lane", title: "Long-form survival challenges are unattempted", detail: "They run this lane and you do not.", evidence: ["rival_hit"], confidence: 0.6, impact: "high" },
      ],
      parallels: [
        { competitorVideoId: "rival_hit", ownVideoId: "own_hit", theme: "Constraint challenges", whatTheyDid: "Framed a long survival run as a question.", whatYouDid: "Framed a build as a single rule.", gap: "Theirs promises a journey; yours promises a moment.", opportunity: "Run a multi-episode constraint arc." },
      ],
      recommendations: [
        { key: "raise-cadence", title: "Publish twice a week for a month", rationale: "Cadence is the clearest structural gap.", action: "Ship two constraint videos a week for four weeks.", evidence: ["Question in title"], effort: "medium", expectedSignal: "Median views rise without engagement falling.", confidence: 0.72 },
        { key: "adopt-question-titles", title: "Test question-framed titles", rationale: "Question titles carry a 2.67x lift in this set.", action: "Frame the next three titles as a question.", evidence: ["rival_hit", "Question in title"], effort: "low", expectedSignal: "Outlier multiple above 1.5 on at least one.", confidence: 0.65 },
      ],
      blindSpots: ["Public data cannot show retention or click-through rate."],
    },
    memoryDelta: { newBeliefs: 1, confirmed: 2, weakened: 0 },
    cost: { videosScraped: 3, estimatedUsd: 0.015 },
  };

  writeFileSync(join(TEST_INTEL_DIR, "scans", "scan_fixture.json"), JSON.stringify(scan), "utf-8");

  const memory = {
    creatorId: CREATOR,
    beliefs: [
      {
        key: "constraint-format-works", scope: "own",
        statement: "Constraint framing carries your best videos",
        detail: "Held across three scans.", confidence: 0.82, observations: 3,
        firstSeen: "2026-06-01T00:00:00.000Z", lastConfirmed: "2026-08-08T10:00:00.000Z",
        lastScanId: "scan_fixture", status: "confirmed", evidence: ["own_hit"], lastDelta: 0.12,
        supportingChannelIds: ["ch_own"],
        history: [
          { scanId: "s1", at: "2026-06-01T00:00:00.000Z", confidence: 0.55 },
          { scanId: "s2", at: "2026-07-01T00:00:00.000Z", confidence: 0.7 },
          { scanId: "scan_fixture", at: "2026-08-08T10:00:00.000Z", confidence: 0.82 },
        ],
      },
      {
        key: "shorts-are-the-answer", scope: "market",
        statement: "Shorts were going to be the growth lever",
        detail: "Not re-observed since the first scan.", confidence: 0.18, observations: 1,
        firstSeen: "2026-06-01T00:00:00.000Z", lastConfirmed: "2026-06-01T00:00:00.000Z",
        lastScanId: "scan_fixture", status: "weakening", evidence: ["own_flop"], lastDelta: -0.12,
        supportingChannelIds: ["ch_own", "ch_rival"],
        history: [
          { scanId: "s1", at: "2026-06-01T00:00:00.000Z", confidence: 0.55 },
          { scanId: "scan_fixture", at: "2026-08-08T10:00:00.000Z", confidence: 0.18 },
        ],
      },
    ],
    events: [
      { at: "2026-08-08T10:03:00.000Z", scanId: "scan_fixture", kind: "belief_confirmed", summary: "Reconfirmed (3x): Constraint framing carries your best videos", detail: "Confidence 70% → 82%" },
      { at: "2026-08-08T10:03:00.000Z", scanId: "scan_fixture", kind: "belief_weakened", summary: "Weakening: Shorts were going to be the growth lever" },
      { at: "2026-08-08T10:03:00.000Z", scanId: "scan_fixture", kind: "scan", summary: "Scanned 2 channels · 3 videos" },
    ],
    scans: [{ scanId: "scan_fixture", at: "2026-08-08T10:03:00.000Z", channels: ["ch_own", "ch_rival"], videosAnalyzed: 3, beliefsAfter: 2 }],
    totals: { scans: 3, videosAnalyzed: 72, transcriptsRead: 60, channelsTracked: 2 },
  };

  writeFileSync(join(TEST_INTEL_DIR, "memory", `${CREATOR}.json`), JSON.stringify(memory), "utf-8");
});

test.afterAll(() => {
  rmSync(TEST_INTEL_DIR, { recursive: true, force: true });
});

test("the console leads with the finding and shows what it is built from", async ({ page }) => {
  await page.goto("/intel");

  await expect(page.getByRole("heading", { name: "The channel brain" })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: /You convert better than they do/ }),
  ).toBeVisible();

  // Memory totals are the claim that this accumulates; they must be on screen at once.
  await expect(page.getByText("72 videos analysed")).toBeVisible();
  await expect(page.getByText("60 transcripts read")).toBeVisible();
  await expect(page.getByText(/Directional sample: 2 of 2 channels/)).toBeVisible();
  await expect(page.getByText("What to test next")).toBeVisible();
  await expect(page.getByText("Directional hypotheses from a thin public-data sample")).toBeVisible();

  // Both sides of the picture, not just the flattering one.
  await expect(page.getByText("Constraint framing carries your best videos").first()).toBeVisible();
  await expect(page.getByText("Undifferentiated highlight uploads underperform")).toBeVisible();

  // A recommendation is only useful if it says what to actually do.
  await expect(page.getByText("Ship two constraint videos a week for four weeks.")).toBeVisible();
  await expect(page.getByText("n=2 yours vs n=1 competitor videos").first()).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Sample" })).toBeVisible();
});

test("head-to-head puts a real competitor video against the creator's own", async ({ page }) => {
  await page.goto("/intel");
  const parallel = page.locator(".parallel-card").first();
  await expect(parallel).toContainText("Can I survive 100 days?");
  await expect(parallel).toContainText("I rebuilt the bridge with ONE rule");
  await expect(parallel).toContainText("Theirs promises a journey");
});

test("the corpus is searchable, filterable and sortable", async ({ page }) => {
  await page.goto("/intel");
  await page.getByRole("button", { name: "Video explorer" }).click();

  await expect(page.getByText("Showing 3 of 3 scraped videos")).toBeVisible();

  // Transcript search is the point of the explorer: this phrase appears only in a
  // transcript, never in a title or description.
  await page.getByRole("searchbox", { name: "Search the corpus" }).fill("single constraint");
  await expect(page.getByText(/Showing 1 of 3 scraped videos/)).toBeVisible();
  await expect(page.getByRole("link", { name: /I rebuilt the bridge/ })).toBeVisible();

  await page.getByRole("searchbox", { name: "Search the corpus" }).fill("");
  await page.getByLabel("Filter by channel").selectOption("ch_rival");
  await expect(page.getByText("Showing 1 of 3 scraped videos")).toBeVisible();
  await expect(page.getByRole("link", { name: /Can I survive 100 days/ })).toBeVisible();

  await page.getByLabel("Filter by channel").selectOption("all");
  await page.getByRole("button", { name: "Outliers only" }).click();
  await expect(page.getByText("Showing 2 of 3 scraped videos")).toBeVisible();
});

test("the packaging lab separates reliable rows from low-sample ones", async ({ page }) => {
  await page.goto("/intel");
  await page.getByRole("button", { name: "Packaging lab" }).click();

  await expect(page.getByText("Question in title")).toBeVisible();
  await expect(page.getByText("2.67x")).toBeVisible();
  // A low-sample row must not be silently hidden — that would imply it was never tested.
  await expect(page.getByText("Emoji in title")).toBeHidden();
  await page.getByRole("button", { name: /Showing .* reliable rows/ }).click();
  await expect(page.getByText("Emoji in title")).toBeVisible();
  await expect(page.getByText("low sample")).toBeVisible();
});

test("memory shows beliefs strengthening and decaying, not a flat list", async ({ page }) => {
  await page.goto("/intel");
  await page.getByRole("button", { name: /Memory/ }).click();

  await expect(page.getByText("Constraint framing carries your best videos").first()).toBeVisible();
  await expect(page.locator(".belief-status--confirmed")).toBeVisible();

  // The decaying belief is the proof that memory is not append-only. It appears twice —
  // as a belief and as a timeline event — so scope to the belief heading.
  await expect(
    page.getByRole("heading", { name: "Shorts were going to be the growth lever" }),
  ).toBeVisible();
  await expect(page.locator(".belief-status--weakening")).toBeVisible();
  await expect(page.getByText("1 supporting channel")).toBeVisible();
  await expect(page.getByText(/Confidence 70% → 82%/)).toBeVisible();

  await page.getByLabel("Filter by status").selectOption("weakening");
  await expect(page.getByText("1 of 2")).toBeVisible();
});

test("an unconfigured scraper is stated plainly and no sample report is faked", async ({ page }) => {
  await page.goto("/intel");
  await expect(page.getByText("Scraper not configured")).toBeVisible();
  await expect(page.getByText(/No sample report is substituted/)).toBeVisible();
});
