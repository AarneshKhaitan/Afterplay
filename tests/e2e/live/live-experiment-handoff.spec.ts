import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { expect, test } from "@playwright/test";

const liveRoot = join(tmpdir(), "afterplay-playwright-live");
const intelRoot = process.env.AFTERPLAY_INTEL_DIR ?? join(liveRoot, "intel");
const scanId = "scan_live_recommendation";

function writeVersionedScan(creatorId: string) {
  const dir = join(intelRoot, "scans");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${scanId}.json`), JSON.stringify({
    _afterplay: {
      format: "afterplay.versioned-json",
      schema: "intel.scan",
      version: 1,
    },
    value: {
      scanId,
      creatorId,
      status: "complete",
      startedAt: "2026-08-20T00:00:00.000Z",
      stages: [],
      log: [],
      input: {
        ownChannel: "@creator",
        competitors: ["@rival"],
        videosPerChannel: 3,
        withTranscripts: true,
        sortVideosBy: "NEWEST",
      },
      agents: [],
      channels: [],
      featureLifts: [],
    },
  }), "utf-8");
}

test("an Intel recommendation creates a persisted live experiment for the active creator", async ({ page }) => {
  writeVersionedScan("guest");

  const created = await page.request.post("/api/experiments/live", {
    data: {
      recommendation: {
        scanId,
        key: "test-return-hook",
        title: "Test a named return hook",
        action: "Open the next stream by naming the same audience challenge.",
        rationale: "Competitive clips with named repeatable hooks show stronger returning-comment signals.",
        expectedSignal: "Repeat commenters and return visits rise during the next stream window.",
        confidence: 0.74,
        effort: "low",
        evidence: ["video_1", "metric_return_commenters"],
      },
    },
  });
  expect(created.status()).toBe(201);
  expect(await created.json()).toMatchObject({
    experiment: {
      id: "live_current",
      creatorId: "guest",
      source: {
        kind: "intel_recommendation",
        scanId,
        recommendationKey: "test-return-hook",
      },
      title: "Test a named return hook",
      confidence: 74,
      evidenceRefs: ["video_1", "metric_return_commenters"],
      status: "draft",
    },
  });

  await page.goto("/experiments/live_current");
  await expect(page.getByRole("heading", { name: "Test a named return hook" })).toBeVisible();
  await expect(page.getByText("Live experiment draft")).toBeVisible();
  await expect(page.getByText("video_1")).toBeVisible();
  await expect(page.locator("body")).not.toContainText("One More Rule");
});

test("a recommendation from another creator cannot create a live experiment", async ({ request }) => {
  writeVersionedScan("other_creator");

  const response = await request.post("/api/experiments/live", {
    data: {
      recommendation: {
        scanId,
        key: "foreign",
        title: "Foreign creator rec",
        action: "Use a different creator's corpus.",
        rationale: "This should be rejected before persistence.",
        expectedSignal: "No experiment should be created.",
        confidence: 0.8,
        effort: "medium",
        evidence: ["foreign_video"],
      },
    },
  });

  expect(response.status()).toBe(403);
  expect(await response.json()).toMatchObject({
    error: { code: "scan_creator_mismatch" },
  });
});
