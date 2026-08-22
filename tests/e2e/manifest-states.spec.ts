import { expect, test } from "@playwright/test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { TEST_CLIPPER_WORKDIR } from "./clipper-workdir";

/** A run can be stale AND degraded at once, and both matter to the operator.
 *
 * These states were chained with `? :`, so the stale banner hid the degraded one: the
 * reviewer saw that a newer job had not finished, but not that the run they were looking
 * at had a broken memory pass. A panel that exists to stop states being hidden must not
 * hide one behind another.
 */

const COMPLETE = join(TEST_CLIPPER_WORKDIR, "states_complete");
const NEWER_INCOMPLETE = join(TEST_CLIPPER_WORKDIR, "states_running");

test.afterAll(() => {
  for (const dir of [COMPLETE, NEWER_INCOMPLETE]) rmSync(dir, { recursive: true, force: true });
});

test.beforeAll(() => {
  mkdirSync(COMPLETE, { recursive: true });
  const clipPath = join(COMPLETE, "clip01_shorts.mp4");
  writeFileSync(clipPath, Buffer.from("not-a-real-mp4"));
  writeFileSync(join(COMPLETE, "manifest.json"), JSON.stringify({
    job_id: "states_complete",
    creator_id: "creator_mika_rigged",
    source: { title: "Degraded run", url: null, duration: 90 },
    clips: [{ clip_id: "clip01_shorts", platform: "shorts", start: 10, end: 32,
              duration: 22, path: clipPath, ok: true, why: "standalone" }],
    memory: {
      enabled: true, degraded: true,
      reason: "thread lookup failed (AuthenticationError: 401 invalid_api_key)",
      threads_considered: 0, callback_found: false, callbacks_ranked_out: 0,
    },
    message: "Creator memory degraded: thread lookup failed (401 invalid_api_key)",
    encoder: "h264_qsv",
  }), "utf-8");
  writeFileSync(join(COMPLETE, "status.json"),
    JSON.stringify({ creator_id: "creator_mika_rigged", state: "complete", updated: Date.now() / 1000 }), "utf-8");

  // A newer job that died before writing a manifest — the G20 case.
  mkdirSync(NEWER_INCOMPLETE, { recursive: true });
  writeFileSync(join(NEWER_INCOMPLETE, "status.json"),
    JSON.stringify({ creator_id: "creator_mika_rigged", state: "started", updated: Date.now() / 1000 + 60,
                     message: "Job started." }), "utf-8");
});

test("a killed newer run does not silently replace the last complete one", async ({ request }) => {
  const { manifest } = await (await request.get("/api/clips/latest")).json();
  expect(manifest.job_id).toBe("states_complete");
  expect(manifest.stale).toBe(true);
  expect(manifest.staleReason).toBeTruthy();
});

test("stale and degraded are both shown, not one behind the other", async ({ page }) => {
  await page.goto("/studio");
  const panel = page.getByRole("region", { name: "Latest clipper manifest" });

  await expect(panel.getByText("Showing latest complete run")).toBeVisible();
  await expect(panel.getByText("Creator memory degraded")).toBeVisible();

  // A degraded run must never be presented as a successful no-callback outcome.
  await expect(panel.getByText("No callback found")).toHaveCount(0);
  await expect(panel.getByText("invalid_api_key").first()).toBeVisible();
});
