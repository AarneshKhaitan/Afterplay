import { expect, test } from "@playwright/test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { TEST_CLIPPER_WORKDIR } from "./clipper-workdir";

const JOB_DIR = join(TEST_CLIPPER_WORKDIR, "legacy_unverified_callback");

test.afterAll(() => {
  rmSync(JOB_DIR, { recursive: true, force: true });
});

test.beforeAll(() => {
  mkdirSync(JOB_DIR, { recursive: true });
  const clipPath = join(JOB_DIR, "clip01_shorts.mp4");
  writeFileSync(clipPath, Buffer.from("not-a-real-mp4"));
  writeFileSync(
    join(JOB_DIR, "manifest.json"),
    JSON.stringify({
      job_id: "legacy_unverified_callback",
      creator_id: "creator_mika_rigged",
      source: { title: "Legacy staged callback", url: null, duration: 60 },
      clips: [
        {
          clip_id: "clip01_shorts",
          platform: "shorts",
          start: 10,
          end: 30,
          duration: 20,
          path: clipPath,
          ok: true,
          signals: {
            callback: true,
            thread_label: "authored demo thread",
            confidence: 0.95,
            source_stream: "unprocessed_source",
            source_t: 12,
            source_quote: "a quote that was never verified",
          },
        },
      ],
      memory: { enabled: true, callback_found: true, threads_considered: 4 },
      encoder: "h264_qsv",
    }),
    "utf-8",
  );
});

test("legacy callback claims without verified citations are suppressed", async ({ page, request }) => {
  const response = await request.get("/api/clips/latest");
  expect(response.ok()).toBe(true);
  const { manifest } = await response.json();

  expect(manifest).toMatchObject({
    job_id: "legacy_unverified_callback",
    memory: {
      degraded: true,
      callback_found: false,
    },
    clips: [{ callback: false, citationVerified: false }],
  });
  expect(manifest.memory.reason).toContain("lacks complete verified citation metadata");

  await page.goto("/studio");
  const panel = page.getByRole("region", { name: "Latest clipper manifest" });
  await expect(panel.getByText("Creator memory degraded")).toBeVisible();
  await expect(panel.getByText(/callback claim was omitted/)).toBeVisible();
  await expect(panel.getByText("Callback evidence")).toHaveCount(0);
  await expect(panel.getByText("callback clip")).toHaveCount(0);
});
