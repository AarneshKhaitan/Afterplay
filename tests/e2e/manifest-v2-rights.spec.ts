import { expect, test } from "@playwright/test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { TEST_CLIPPER_WORKDIR } from "./clipper-workdir";

const VALID_DIR = join(TEST_CLIPPER_WORKDIR, "rights_not_cleared");
const INVALID_DIR = join(TEST_CLIPPER_WORKDIR, "rights_invalid");

function manifest(jobId: string, footageRights: string) {
  const dir = jobId === "rights_not_cleared" ? VALID_DIR : INVALID_DIR;
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `${jobId}.mp4`);
  writeFileSync(path, Buffer.from("review-only-media"));
  writeFileSync(join(dir, "manifest.json"), JSON.stringify({
    schema: "afterplay.clip-manifest",
    schema_version: 2,
    creator_id: "creator_mika_rigged",
    job_id: jobId,
    source: {
      title: "Rights review stream",
      url: "https://youtu.be/rights-review",
      duration: 60,
      footage_rights: footageRights,
      transcript_language: "en",
      transcript_source: "youtube_manual",
      subtitle_track: "en",
    },
    clips: [{
      clip_id: jobId,
      platform: "shorts",
      start: 5,
      end: 20,
      duration: 15,
      decision_window: { start: 5, end: 20 },
      path,
      ok: true,
    }],
    status: "complete",
  }), "utf-8");
}

test.beforeAll(async () => {
  manifest("rights_not_cleared", "not_cleared");
  await new Promise((resolve) => setTimeout(resolve, 20));
  manifest("rights_invalid", "invented_rights");
});

test.afterAll(() => {
  rmSync(VALID_DIR, { recursive: true, force: true });
  rmSync(INVALID_DIR, { recursive: true, force: true });
});

test("invalid rights are rejected and uncleared v2 clips remain review-only", async ({ page, request }) => {
  const latest = await request.get("/api/clips/latest");
  expect(latest.ok()).toBe(true);
  expect(await latest.json()).toMatchObject({
    manifest: {
      job_id: "rights_not_cleared",
      source: { footage_rights: "not_cleared" },
      stale: true,
      staleReason: "A newer manifest was rejected by the manifest-v2 contract; showing the latest valid manifest.",
      approvalReady: false,
      approvalBlockedReasons: [
        "Footage is marked not cleared; clips are available for analysis only.",
        "A newer run is incomplete or invalid; review is blocked until it produces a valid manifest.",
      ],
    },
  });

  const experiment = await (await request.get("/api/experiments/exp_one_more_rule")).json();
  expect(experiment.experiment.pipelineOutputs).toEqual([]);

  await page.goto("/studio", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("article", { name: "rights_not_cleared", exact: true })).toBeVisible();
  await expect(page.getByText("Review only — approval blocked")).toBeVisible();
  await expect(page.getByText(/newer manifest was rejected/)).toBeVisible();
  await expect(page.getByText(/analysis only/)).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  const width = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(width).toBe(390);
});
