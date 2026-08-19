import { expect, test } from "@playwright/test";
import { rmSync } from "node:fs";
import { join } from "node:path";

import { TEST_CLIPPER_WORKDIR } from "./clipper-workdir";

test.setTimeout(120_000);

const stages = [
  { id: "resolve", label: "Resolving the source", truth: "Reads metadata.", state: "complete" },
  { id: "transcript", label: "Reading the transcript", truth: "Reads captions.", state: "complete" },
  { id: "memory", label: "Searching channel memory", truth: "Ranks moments.", state: "running", detail: "Ranking candidate moments." },
  { id: "render", label: "Cutting and reframing", truth: "Renders clips.", state: "pending" },
  { id: "done", label: "Manifest written", truth: "Hands clips to Studio.", state: "pending" },
] as const;

function mockedJob(state: "running" | "cancelling" | "cancelled") {
  return {
    jobId: "ui_poll_demo",
    creatorId: "creator_mika_rigged",
    state,
    message: state === "cancelled" ? "Cancelled by the creator."
      : state === "cancelling" ? "Stopping the clipper process tree."
        : "Ranking moments.",
    stages: stages.map((stage) => ({
      ...stage,
      state: stage.id === "memory" && state === "cancelled" ? "cancelled" : stage.state,
    })),
    log: [],
    clips: [],
  };
}

test("a real local clipper process reaches the public cancelled terminal state", async ({ request }) => {
  const configResponse = await request.get("/api/ingest");
  expect(configResponse.ok()).toBe(true);
  const config = await configResponse.json() as {
    creatorDefault: string;
    sources: Array<{ id: string; mode: "local" | "replay" }>;
  };
  const source = config.sources.find((candidate) => candidate.mode === "local");
  expect(source, "The cancellation drill requires one prepared local demo source.").toBeTruthy();
  if (!source) {
    return;
  }

  let jobId: string | undefined;
  try {
    const startInput = {
      source: { kind: "cached", id: source.id },
      creator: config.creatorDefault,
      clips: 1,
      platforms: "shorts",
      memory: false,
    };
    const started = await request.post("/api/ingest", { data: startInput });
    expect(started.status()).toBe(202);
    const startPayload = await started.json();
    jobId = startPayload.jobId;
    expect(startPayload.job).toMatchObject({
      jobId,
      creatorId: config.creatorDefault,
      state: "started",
    });
    expect(startPayload.job.stages[0]).toMatchObject({ id: "resolve", state: "running" });

    const concurrent = await request.post("/api/ingest", { data: startInput });
    expect(concurrent.status()).toBe(409);
    expect(await concurrent.json()).toMatchObject({
      error: { code: "ingest_rejected", message: "An ingest job is already running for this creator." },
    });

    const stopped = await request.delete(`/api/ingest/${jobId}`);
    const stopPayload = await stopped.json();
    expect(stopped.ok(), JSON.stringify(stopPayload)).toBe(true);
    expect(stopPayload).toMatchObject({
      job: { jobId, creatorId: config.creatorDefault, state: "cancelled" },
    });

    const polled = await request.get(`/api/ingest/${jobId}`);
    expect(polled.ok()).toBe(true);
    const polledJob = (await polled.json()).job as {
      state: string;
      stages: Array<{ id: string; state: string }>;
    };
    expect(polledJob.state).toBe("cancelled");
    const cancelledIndex = polledJob.stages.findIndex((stage) => stage.state === "cancelled");
    expect(cancelledIndex).toBeGreaterThanOrEqual(0);
    expect(polledJob.stages.filter((stage) => stage.state === "cancelled")).toHaveLength(1);
    expect(polledJob.stages.slice(0, cancelledIndex).every((stage) => stage.state === "complete")).toBe(true);
    expect(polledJob.stages.slice(cancelledIndex + 1).every((stage) => stage.state === "pending")).toBe(true);

    const repeated = await request.delete(`/api/ingest/${jobId}`);
    expect(repeated.ok()).toBe(true);
    expect(await repeated.json()).toMatchObject({ job: { state: "cancelled" } });
  } finally {
    if (jobId) {
      await request.delete(`/api/ingest/${jobId}`).catch(() => undefined);
      rmSync(join(TEST_CLIPPER_WORKDIR, jobId), { recursive: true, force: true });
    }
  }
});

test("poll failure is announced, retries recover, and Stop renders cancellation", async ({ page }) => {
  let polls = 0;
  let stopAttempts = 0;
  let stopInFlight = false;
  await page.route("**/api/ingest", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    await route.fulfill({
      status: 202,
      contentType: "application/json",
      body: JSON.stringify({
        jobId: "ui_poll_demo",
        network: "Mocked local run.",
        job: mockedJob("running"),
      }),
    });
  });
  await page.route("**/api/ingest/ui_poll_demo", async (route) => {
    if (route.request().method() === "DELETE") {
      stopAttempts += 1;
      if (stopAttempts === 1) {
        stopInFlight = true;
        await new Promise((resolve) => setTimeout(resolve, 1_800));
        stopInFlight = false;
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ error: { message: "The host refused the first Stop request." } }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ job: mockedJob("cancelled") }),
      });
      return;
    }
    polls += 1;
    if (polls === 1) {
      await route.abort("failed");
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ job: mockedJob(stopInFlight ? "cancelling" : "running") }),
    });
  });

  await page.goto("/ingest", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("textbox", { name: /^Creator/ })).toHaveValue("creator_mika_rigged");
  await page.getByRole("radio", { name: /YouTube URL/ }).click();
  await page.getByLabel("YouTube URL").fill("https://www.youtube.com/watch?v=poll_test");
  await page.getByRole("button", { name: "Start clipping" }).click();

  const progress = page.getByRole("region", { name: "Run progress" });
  const pollAlert = page.locator(".ingest-error").filter({ hasText: "Status connection lost" });
  await expect(progress).toHaveAttribute("aria-live", "polite");
  await expect(progress.getByText("ui_poll_demo")).toBeVisible();
  await expect(pollAlert).toBeVisible();
  await expect(pollAlert).toHaveCount(0, { timeout: 10_000 });
  await expect(progress.getByText("Ranking candidate moments.")).toBeVisible();

  await progress.getByRole("button", { name: "Stop run" }).click();
  await expect(progress.getByRole("button", { name: "Stopping…" })).toBeVisible();
  await expect(page.locator(".ingest-error").filter({ hasText: "host refused the first Stop" })).toBeVisible();
  await expect(progress.getByRole("button", { name: "Stop run" })).toBeEnabled({ timeout: 10_000 });
  await progress.getByRole("button", { name: "Stop run" }).click();
  await expect(progress.getByRole("status")).toContainText("Cancelled by the creator.");
  await expect(progress.getByRole("button", { name: "Stop run" })).toHaveCount(0);

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(progress.getByRole("status")).toBeVisible();
  const widths = await page.evaluate(() => ({
    viewport: window.innerWidth,
    document: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
  }));
  expect(widths).toEqual({ viewport: 390, document: 390, body: 390 });
});
