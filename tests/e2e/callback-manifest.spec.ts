import { expect, test } from "@playwright/test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { TEST_CLIPPER_WORKDIR } from "./clipper-workdir";

const JOB_DIR = join(TEST_CLIPPER_WORKDIR, "ui_callback");

/** Remove the fixture manifest after this file finishes.
 *
 * The experiment's approval package is projected from the latest manifest when one
 * exists, so leaving this fixture behind replaces the seeded outputs that
 * `judge-loop.spec.ts` and `experiment-lifecycle.spec.ts` assert on, and they fail with
 * "The machine gets one more rule" not found. Tests run with `workers: 1`, so cleaning
 * up here makes the suite order-independent. */
test.afterAll(() => {
  rmSync(JOB_DIR, { recursive: true, force: true });
});

test.beforeAll(() => {
  const jobDir = JOB_DIR;
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
          citation_verified: true,
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
        citationVerified: true,
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

test("clip video controls are clickable and not covered by the card overlay", async ({ page }) => {
  // `.output-preview::after` is a decorative gradient stretched over the whole
  // preview. Without pointer-events:none it paints above the <video> and eats
  // every click, so the native play button and scrub bar cannot be used at all
  // even though the media itself loads fine.
  await page.goto("/studio", { waitUntil: "domcontentloaded" });
  const video = page.locator('video[aria-label="clip01_shorts preview"]');
  await video.scrollIntoViewIfNeeded();

  const hits = await video.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const at = (x: number, y: number) => document.elementFromPoint(x, y)?.tagName.toLowerCase();
    return {
      centre: at(r.left + r.width / 2, r.top + r.height / 2),
      controls: at(r.left + 26, r.bottom - 42),
      scrubBar: at(r.left + r.width / 2, r.bottom - 14),
    };
  });

  expect(hits.centre).toBe("video");
  expect(hits.controls).toBe("video");
  expect(hits.scrubBar).toBe("video");
});

test("clip media serves byte ranges so a browser can start and seek playback", async ({ request }) => {
  // A <video> element opens media with `Range: bytes=0-`. Answering 200 without
  // Accept-Ranges makes the element treat the source as non-seekable and playback
  // never starts, so these status codes are the actual playability contract.
  const full = await request.get("/api/clips/clip01_shorts/media");
  expect(full.status()).toBe(200);
  expect(full.headers()["accept-ranges"]).toBe("bytes");

  const size = Number(full.headers()["content-length"]);
  expect(size).toBeGreaterThan(0);

  const opening = await request.get("/api/clips/clip01_shorts/media", {
    headers: { Range: "bytes=0-" },
  });
  expect(opening.status()).toBe(206);
  expect(opening.headers()["content-range"]).toBe(`bytes 0-${size - 1}/${size}`);

  const seek = await request.get("/api/clips/clip01_shorts/media", {
    headers: { Range: "bytes=2-5" },
  });
  expect(seek.status()).toBe(206);
  expect(seek.headers()["content-range"]).toBe(`bytes 2-5/${size}`);
  expect((await seek.body()).length).toBe(4);

  const unsatisfiable = await request.get("/api/clips/clip01_shorts/media", {
    headers: { Range: `bytes=${size + 1000}-` },
  });
  expect(unsatisfiable.status()).toBe(416);
  expect(unsatisfiable.headers()["content-range"]).toBe(`bytes */${size}`);
});
