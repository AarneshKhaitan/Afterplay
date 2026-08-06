import { expect, test } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

test.beforeAll(() => {
  const jobDir = join(process.cwd(), "services", "video-clipper", ".work", "ui_callback");
  const clipPath = join(jobDir, "clip01_shorts.mp4");
  mkdirSync(jobDir, { recursive: true });
  writeFileSync(clipPath, Buffer.from("not-a-real-mp4"));
  writeFileSync(
    join(jobDir, "manifest.json"),
    JSON.stringify({
      job_id: "ui_callback",
      source: { title: "Callback smoke stream", url: null, duration: 52 },
      clips: [{
        clip_id: "clip01_shorts",
        platform: "shorts",
        start: 20,
        end: 32,
        duration: 12,
        path: clipPath,
        score: 2.88,
        why: "callback[the cursed sniper]: payoff line",
        ok: true,
        text_for_copy: "Ravi finally hits the shot.",
        signals: {
          callback: true,
          thread_id: "thread_1",
          thread_label: "the cursed sniper",
          confidence: 0.91,
          source_stream: "prior_001",
          source_t: 12,
          source_quote: "bro Ravi is the cursed sniper, he cannot hit anything",
        },
      }],
      encoder: "h264_qsv",
    }),
    "utf-8",
  );
});

test("Studio renders callback citation and media route from latest manifest", async ({ page, request }) => {
  const latest = await request.get("/api/clips/latest");
  expect(latest.ok()).toBe(true);
  expect(await latest.json()).toMatchObject({
    manifest: {
      job_id: "ui_callback",
      clips: [{
        clip_id: "clip01_shorts",
        callback: true,
        sourceStream: "prior_001",
        sourceT: 12,
        sourceQuote: "bro Ravi is the cursed sniper, he cannot hit anything",
      }],
    },
  });

  const media = await request.get("/api/clips/clip01_shorts/media");
  expect(media.status()).toBe(200);
  expect(media.headers()["content-type"]).toContain("video/mp4");

  await page.goto("/studio", { waitUntil: "domcontentloaded" });
  await expect(page.getByLabel("Latest clipper manifest")).toBeVisible();
  await expect(page.getByText("Callback smoke stream")).toBeVisible();
  await expect(page.getByText("the cursed sniper · confidence 0.91")).toBeVisible();
  await expect(page.getByText("prior_001 · 0:12")).toBeVisible();
  await expect(page.getByText("bro Ravi is the cursed sniper, he cannot hit anything")).toBeVisible();
  await expect(page.locator('video[aria-label="clip01_shorts preview"]')).toHaveAttribute(
    "src",
    /\/api\/clips\/clip01_shorts\/media/,
  );
});
