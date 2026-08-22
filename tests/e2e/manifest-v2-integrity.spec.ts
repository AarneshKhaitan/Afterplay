import { expect, test } from "@playwright/test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { TEST_CLIPPER_WORKDIR } from "./clipper-workdir";

test.setTimeout(90_000);

const CREATOR = "creator_mika_rigged";
const ROOT = join(TEST_CLIPPER_WORKDIR, "manifest_v2_integrity");
const FALLBACK = join(ROOT, "fallback");
const NEWER = join(ROOT, "newer");
const CALLBACK_JOB = join(TEST_CLIPPER_WORKDIR, "incomplete_callback_audit");
const INVALID_JOB = join(TEST_CLIPPER_WORKDIR, "incomplete_ablation");
const ALL_FAILED_JOB = join(TEST_CLIPPER_WORKDIR, "all_failed");

function source(rights = "project_owned") {
  return {
    title: "Manifest integrity stream",
    url: null,
    duration: 60,
    footage_rights: rights,
    transcript_language: "en",
    transcript_source: "provided_vtt",
    subtitle_track: "fixture.en.vtt",
  };
}

function clip(dir: string, id: string, overrides: Record<string, unknown> = {}) {
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `${id}.mp4`);
  writeFileSync(path, Buffer.from(`media:${id}`));
  return {
    clip_id: id,
    platform: "shorts",
    start: 5,
    end: 20,
    duration: 15,
    decision_window: { start: 5, end: 20 },
    path,
    ok: true,
    ...overrides,
  };
}

function writeManifest(dir: string, body: Record<string, unknown>, statusCreator?: string) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "manifest.json"), JSON.stringify(body), "utf-8");
  if (statusCreator) {
    writeFileSync(join(dir, "status.json"), JSON.stringify({
      creator_id: statusCreator,
      state: "complete",
    }), "utf-8");
  }
}

function writeFallback() {
  mkdirSync(FALLBACK, { recursive: true });
  writeManifest(FALLBACK, {
    schema: "afterplay.clip-manifest",
    schema_version: 2,
    creator_id: CREATOR,
    job_id: "integrity_fallback",
    status: "complete",
    source: source(),
    clips: [clip(FALLBACK, "integrity_fallback_clip")],
  }, CREATOR);
}

test.beforeEach(async () => {
  rmSync(ROOT, { recursive: true, force: true });
  rmSync(CALLBACK_JOB, { recursive: true, force: true });
  rmSync(INVALID_JOB, { recursive: true, force: true });
  rmSync(ALL_FAILED_JOB, { recursive: true, force: true });
  writeFallback();
  await new Promise((resolve) => setTimeout(resolve, 20));
  mkdirSync(NEWER, { recursive: true });
});

test.afterAll(() => {
  rmSync(ROOT, { recursive: true, force: true });
  rmSync(CALLBACK_JOB, { recursive: true, force: true });
  rmSync(INVALID_JOB, { recursive: true, force: true });
  rmSync(ALL_FAILED_JOB, { recursive: true, force: true });
});

test("incomplete ablation proof is rejected in favor of the disclosed fallback", async ({ request }) => {
  writeManifest(INVALID_JOB, {
    schema: "afterplay.clip-manifest",
    schema_version: 2,
    creator_id: CREATOR,
    job_id: "incomplete_ablation",
    status: "complete",
    source: source(),
    clips: [clip(INVALID_JOB, "incomplete_ablation_clip")],
    ablation: {
      schema_version: 1,
      available: true,
      unavailable_reason: null,
      comparison_point: "post_scoring_pre_sponsor_pre_analytics",
      candidate_count: 2,
      moments: [{
        start: 5, end: 20, baseline_rank: 2, memory_rank: 1, rank_delta: 1,
        base_percentile: 0, base_score: 1, final_score: 2, boost: 1,
        score_scale: "cold_start_points_plus_additive_memory_boost",
        baseline_selected: false, memory_selected: true, callback: false,
      }],
    },
  }, CREATOR);

  const payload = await (await request.get("/api/clips/latest")).json();
  expect(payload.manifest).toMatchObject({
    job_id: "integrity_fallback",
    stale: true,
  });
  const ingest = await (await request.get("/api/ingest/incomplete_ablation")).json();
  expect(ingest.job).toMatchObject({
    state: "failed",
    message: "The clipper wrote an invalid manifest. Its outputs are excluded from review.",
    clips: [],
  });
  expect(ingest.job.stages).toContainEqual(expect.objectContaining({ id: "done", state: "failed" }));
});

test("duplicate v2 clip identities are rejected", async ({ request }) => {
  const repeated = clip(NEWER, "duplicate_clip");
  writeManifest(NEWER, {
    schema: "afterplay.clip-manifest",
    schema_version: 2,
    creator_id: CREATOR,
    job_id: "duplicate_clips",
    status: "complete",
    source: source(),
    clips: [repeated, { ...repeated }],
  });

  const payload = await (await request.get("/api/clips/latest")).json();
  expect(payload.manifest).toMatchObject({ job_id: "integrity_fallback", stale: true });
});

test("ablation selection must agree with the returned clip", async ({ request }) => {
  writeManifest(NEWER, {
    schema: "afterplay.clip-manifest",
    schema_version: 2,
    creator_id: CREATOR,
    job_id: "contradictory_ablation",
    status: "complete",
    source: source(),
    clips: [clip(NEWER, "contradictory_ablation_clip")],
    ablation: {
      schema_version: 1,
      available: true,
      unavailable_reason: null,
      comparison_point: "post_scoring_pre_sponsor_pre_analytics",
      candidate_count: 1,
      moments: [{
        start: 5, end: 20, baseline_rank: 1, memory_rank: 1, rank_delta: 0,
        base_percentile: 100, base_score: 1, final_score: 1, boost: 0,
        score_scale: "cold_start_points_plus_additive_memory_boost",
        baseline_selected: true, memory_selected: false, callback: false,
      }],
    },
  });

  const payload = await (await request.get("/api/clips/latest")).json();
  expect(payload.manifest).toMatchObject({ job_id: "integrity_fallback", stale: true });
});

test("out-of-job media and unsupported dispatch platforms remain review-only", async ({ request }) => {
  writeManifest(NEWER, {
    schema: "afterplay.clip-manifest",
    schema_version: 2,
    creator_id: CREATOR,
    job_id: "unapprovable_media",
    status: "complete",
    source: source(),
    clips: [{
      clip_id: "unapprovable_clip",
      platform: "linkedin",
      start: 5,
      end: 20,
      duration: 15,
      decision_window: { start: 5, end: 20 },
      path: join(FALLBACK, "integrity_fallback_clip.mp4"),
      ok: true,
    }],
  });

  const payload = await (await request.get("/api/clips/latest")).json();
  expect(payload.manifest).toMatchObject({
    job_id: "unapprovable_media",
    approvalReady: false,
    approvalBlockedReasons: [
      "A successful clip has no readable media inside its job directory.",
      "A successful clip targets a platform this approval workflow cannot dispatch.",
    ],
  });
  const experiment = await (await request.get("/api/experiments/exp_one_more_rule")).json();
  expect(experiment.experiment.pipelineOutputs).toEqual([]);
  expect((await request.get("/api/clips/unapprovable_clip/media")).status()).toBe(404);
});

test("failed clips are visibly excluded and an all-failed manifest cannot be approved", async ({ page, request }) => {
  writeManifest(ALL_FAILED_JOB, {
    schema: "afterplay.clip-manifest",
    schema_version: 2,
    creator_id: CREATOR,
    job_id: "all_failed",
    status: "complete",
    source: source(),
    clips: [clip(ALL_FAILED_JOB, "failed_clip", {
      ok: false,
      error: "QC still failing after repairs",
    })],
  }, CREATOR);

  const payload = await (await request.get("/api/clips/latest")).json();
  expect(payload.manifest).toMatchObject({
    job_id: "all_failed",
    approvalReady: false,
    approvalBlockedReasons: ["No clip passed quality checks; there is nothing to approve."],
  });
  const ingest = await (await request.get("/api/ingest/all_failed")).json();
  expect(ingest.job).toMatchObject({
    state: "complete",
    clips: [{ clipId: "failed_clip", ok: false, callback: false }],
  });

  await page.goto("/studio", { waitUntil: "domcontentloaded" });
  const card = page.getByRole("article", { name: "failed_clip", exact: true });
  await expect(card.getByText("failed clip", { exact: true })).toBeVisible();
  await expect(card.getByText("QC still failing after repairs")).toBeVisible();
  await expect(card.getByText("Failed quality gate · excluded from approval")).toBeVisible();
});

test("a callback flag without the verified-mention audit trail is suppressed", async ({ request }) => {
  writeManifest(CALLBACK_JOB, {
    schema: "afterplay.clip-manifest",
    schema_version: 2,
    creator_id: CREATOR,
    job_id: "incomplete_callback_audit",
    status: "complete",
    source: source(),
    clips: [clip(CALLBACK_JOB, "incomplete_callback_clip", {
      why: "callback[old rivalry]: payoff",
      signals: {
        callback: true,
        citation_verified: true,
        thread_label: "old rivalry",
        source_stream: "prior_stream",
        source_t: 12,
        source_quote: "the verified-looking quote",
      },
    })],
  }, CREATOR);

  const payload = await (await request.get("/api/clips/latest")).json();
  expect(payload.manifest).toMatchObject({
    job_id: "incomplete_callback_audit",
    approvalReady: false,
    clips: [{
      callback: false,
      citationVerified: false,
      why: "Standalone clip; an unverified callback claim was omitted.",
    }],
  });
  expect(payload.manifest.approvalBlockedReasons.join(" ")).toContain(
    "lacks complete verified citation metadata",
  );
  const ingest = await (await request.get("/api/ingest/incomplete_callback_audit")).json();
  expect(ingest.job).toMatchObject({
    callbackFound: false,
    clips: [{ clipId: "incomplete_callback_clip", callback: false }],
  });
});

test("status and manifest creator disagreement fails closed for both workspaces", async ({ request }) => {
  writeManifest(NEWER, {
    schema: "afterplay.clip-manifest",
    schema_version: 2,
    creator_id: "guest",
    job_id: "owner_conflict",
    status: "complete",
    source: source(),
    clips: [clip(NEWER, "owner_conflict_clip")],
  }, CREATOR);

  const configured = await (await request.get("/api/clips/latest")).json();
  expect(configured.manifest).toMatchObject({ job_id: "integrity_fallback", stale: true });
  const guest = await (await request.get("/api/clips/latest", {
    headers: { cookie: "afterplay_creator=guest" },
  })).json();
  expect(guest.manifest).toBeNull();
});
