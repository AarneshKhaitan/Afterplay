import { expect, test } from "@playwright/test";
import { mkdirSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { TEST_CLIPPER_WORKDIR } from "./clipper-workdir";

const CONFIGURED = "creator_mika_rigged";
const GUEST = "guest";
test.setTimeout(90_000);
const ROOTS = {
  configured: join(TEST_CLIPPER_WORKDIR, "owner_configured"),
  guest: join(TEST_CLIPPER_WORKDIR, "owner_guest"),
  legacy: join(TEST_CLIPPER_WORKDIR, "owner_legacy_unscoped"),
  guestRunning: join(TEST_CLIPPER_WORKDIR, "owner_guest_running"),
  configuredJob: join(TEST_CLIPPER_WORKDIR, "owner_configured_job"),
  completionRace: join(TEST_CLIPPER_WORKDIR, "owner_completion_race"),
};

function writeManifest(dir: string, creatorId: string | undefined, clipId: string) {
  mkdirSync(dir, { recursive: true });
  const clipPath = join(dir, `${clipId}.mp4`);
  writeFileSync(clipPath, Buffer.from(`media:${clipId}`));
  writeFileSync(join(dir, "manifest.json"), JSON.stringify({
    ...(creatorId ? { creator_id: creatorId } : {}),
    job_id: dir.split(/[\\/]/).at(-1),
    status: "complete",
    source: { title: `${creatorId ?? "legacy"} stream`, url: null, duration: 90 },
    clips: [{
      clip_id: clipId,
      platform: "shorts",
      start: 10,
      end: 30,
      duration: 20,
      path: clipPath,
      ok: true,
      why: "standalone",
    }],
    encoder: "h264_qsv",
  }), "utf-8");
}

test.beforeAll(() => {
  writeManifest(ROOTS.configured, CONFIGURED, "configured_clip");
  writeManifest(ROOTS.guest, GUEST, "guest_clip");
  // Deliberately newest and ownerless. Creator-scoped reads must fail closed instead of
  // adopting a legacy artifact just because it wins the global mtime race.
  writeManifest(ROOTS.legacy, undefined, "legacy_clip");

  mkdirSync(ROOTS.guestRunning, { recursive: true });
  writeFileSync(join(ROOTS.guestRunning, "status.json"), JSON.stringify({
    creator_id: GUEST,
    state: "started",
    updated: Date.now() / 1000 + 60,
    message: "Guest job is running.",
  }), "utf-8");

  mkdirSync(ROOTS.configuredJob, { recursive: true });
  writeFileSync(join(ROOTS.configuredJob, "status.json"), JSON.stringify({
    creator_id: CONFIGURED,
    state: "running",
    stage: "memory",
    detail: "Ranking candidate moments with channel context.",
    updated: Date.now() / 1000,
    message: "Configured job is running.",
  }), "utf-8");
  utimesSync(join(ROOTS.configuredJob, "status.json"), new Date(0), new Date(0));

  writeManifest(ROOTS.completionRace, CONFIGURED, "race_clip");
  writeFileSync(join(ROOTS.completionRace, "status.json"), JSON.stringify({
    creator_id: CONFIGURED,
    state: "running",
    stage: "render",
    detail: "Finishing the render.",
    updated: Date.now() / 1000,
  }), "utf-8");
  utimesSync(join(ROOTS.completionRace, "manifest.json"), new Date(0), new Date(0));
  utimesSync(join(ROOTS.completionRace, "status.json"), new Date(0), new Date(0));
});

test.afterAll(() => {
  for (const dir of Object.values(ROOTS)) rmSync(dir, { recursive: true, force: true });
});

test("creator-owned manifests, media, projections, and job status never cross workspaces", async ({ request }) => {
  const configuredLatest = await (await request.get("/api/clips/latest")).json();
  expect(configuredLatest.manifest).toMatchObject({
    creator_id: CONFIGURED,
    clips: [{ clip_id: "configured_clip" }],
  });
  expect(configuredLatest.manifest.stale).not.toBe(true);

  const guestHeaders = { cookie: "afterplay_creator=guest" };
  const guestLatest = await (await request.get("/api/clips/latest", { headers: guestHeaders })).json();
  expect(guestLatest.manifest).toMatchObject({
    creator_id: GUEST,
    clips: [{ clip_id: "guest_clip" }],
    stale: true,
  });

  expect((await request.get("/api/clips/configured_clip/media")).status()).toBe(200);
  expect((await request.get("/api/clips/guest_clip/media")).status()).toBe(404);
  expect((await request.get("/api/clips/guest_clip/media", { headers: guestHeaders })).status()).toBe(200);
  expect((await request.get("/api/clips/configured_clip/media", { headers: guestHeaders })).status()).toBe(404);

  const configuredExperiment = await (await request.get("/api/experiments/exp_one_more_rule")).json();
  expect(configuredExperiment.experiment.pipelineOutputs.map((row: { id: string }) => row.id))
    .toEqual(["configured_clip"]);
  const guestExperiment = await (await request.get("/api/experiments/exp_one_more_rule", {
    headers: guestHeaders,
  })).json();
  expect(guestExperiment.experiment.pipelineOutputs.map((row: { id: string }) => row.id))
    .toEqual(["guest_clip"]);

  const configuredJob = await request.get("/api/ingest/owner_configured_job");
  expect(configuredJob.status()).toBe(200);
  expect(await configuredJob.json()).toMatchObject({
    job: {
      creatorId: CONFIGURED,
      state: "running",
      stages: [
        { id: "resolve", state: "complete" },
        { id: "transcript", state: "complete" },
        { id: "memory", state: "running", detail: "Ranking candidate moments with channel context." },
        { id: "render", state: "pending" },
        { id: "done", state: "pending" },
      ],
    },
  });
  expect((await request.get("/api/ingest/owner_configured_job", { headers: guestHeaders })).status()).toBe(404);
  expect((await request.delete("/api/ingest/owner_configured_job")).status()).toBe(409);
  expect((await request.delete("/api/ingest/owner_configured_job", { headers: guestHeaders })).status()).toBe(404);

  const duplicateAfterRestart = await request.post("/api/ingest", {
    data: {
      source: { kind: "url", url: "https://www.youtube.com/watch?v=durable_admission" },
      creator: CONFIGURED,
      clips: 1,
      platforms: "shorts",
      memory: false,
    },
  });
  expect(duplicateAfterRestart.status()).toBe(409);
  expect(await duplicateAfterRestart.json()).toMatchObject({
    error: { code: "ingest_rejected", message: /owner_configured_job still reports active/ },
  });

  const completedBeforeStop = await request.get("/api/ingest/owner_completion_race");
  expect(completedBeforeStop.status()).toBe(200);
  expect(await completedBeforeStop.json()).toMatchObject({ job: { state: "complete" } });
  const completedDuringStop = await request.delete("/api/ingest/owner_completion_race");
  expect(completedDuringStop.status()).toBe(200);
  expect(await completedDuringStop.json()).toMatchObject({
    job: {
      creatorId: CONFIGURED,
      state: "complete",
      stages: [{ state: "complete" }, { state: "complete" }, { state: "complete" },
        { state: "complete" }, { state: "complete" }],
    },
  });

  const mismatchedStart = await request.post("/api/ingest", {
    headers: guestHeaders,
    data: {
      source: { kind: "url", url: "https://www.youtube.com/watch?v=creator_scope_test" },
      creator: CONFIGURED,
      clips: 1,
      platforms: "shorts",
      memory: true,
    },
  });
  expect(mismatchedStart.status()).toBe(409);
  expect(await mismatchedStart.json()).toMatchObject({ error: { code: "creator_mismatch" } });
});
