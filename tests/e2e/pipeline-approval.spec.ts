import { expect, test } from "@playwright/test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { TEST_CLIPPER_WORKDIR } from "./clipper-workdir";

test.setTimeout(90_000);

/** G7: real clipper clips must ride the approval loop, not sit beside it.
 *
 * The curated three-card package stays immutable — an earlier attempt replaced it with
 * manifest clips and collapsed Studio to one raw card. Pipeline clips are additive, but
 * they must be approved and dispatched with everything else, or the loop is still open.
 */

const experimentUrl = "/api/experiments/exp_one_more_rule";
const JOB_DIR = join(TEST_CLIPPER_WORKDIR, "ui_pipeline_approval");

function writeManifest(
  jobId = "ui_pipeline_approval",
  clipPrefix = "clip",
  rights = "permission_granted",
) {
  const clip = (n: number) => {
    const path = join(JOB_DIR, `clip0${n}_shorts.mp4`);
    writeFileSync(path, Buffer.from("not-a-real-mp4"));
    return {
      clip_id: `${clipPrefix}0${n}_shorts`, platform: "shorts", start: 100 * n, end: 100 * n + 20,
      duration: 20, path, score: 3 - n * 0.1, why: `pipeline clip ${n}`, ok: true,
      decision_window: { start: 100 * n, end: 100 * n + 20 },
      text_for_copy: `Transcript excerpt ${n}.`,
    };
  };
  writeFileSync(join(JOB_DIR, "manifest.json"), JSON.stringify({
    schema: "afterplay.clip-manifest",
    schema_version: 2,
    job_id: jobId,
    creator_id: "creator_mika_rigged",
    source: {
      title: "Pipeline approval stream", url: "https://youtu.be/testid", duration: 600,
      footage_rights: rights,
      transcript_language: "en", transcript_source: "youtube_manual", subtitle_track: "en",
    },
    clips: [clip(1), clip(2)],
    encoder: "h264_qsv",
  }), "utf-8");
}

test.afterAll(() => {
  // Same rule as callback-manifest.spec.ts: the newest manifest wins globally, so a
  // fixture left behind changes what every later spec (and any demo) sees.
  rmSync(JOB_DIR, { recursive: true, force: true });
});

test.beforeAll(() => {
  mkdirSync(JOB_DIR, { recursive: true });
  writeManifest();
});

test.beforeEach(async ({ request }) => {
  writeManifest();
  const reset = await request.post("/api/demo/reset");
  expect(reset.ok()).toBe(true);
});

test("pipeline clips are approved and dispatched with the curated package", async ({ request }) => {
  const initial = await (await request.get(experimentUrl)).json();
  const revision = initial.experiment.revision;

  expect(initial.experiment.outputs).toHaveLength(3);
  expect(initial.experiment.pipelineOutputs).toHaveLength(2);
  // Never infer from the URL: this exact value came from the v2 manifest attestation.
  for (const output of initial.experiment.pipelineOutputs) {
    expect(output.provenance).toMatchObject({
      media: "pipeline_manifest",
      rights: "permission_granted",
    });
    expect(output.status).toBe("ready");
  }

  const approved = await (await request.post(`${experimentUrl}/decisions`, {
    data: { action: "approve", revision },
  })).json();

  // The mutation response must carry the projection too. Attaching it only in
  // `getExperiment` meant a client that replaced its state from this response lost the
  // pipeline section the moment the creator approved.
  expect(approved.experiment.pipelineOutputs).toHaveLength(2);
  expect(approved.experiment.pipelineOutputs.map((o: { status: string }) => o.status))
    .toEqual(["approved", "approved"]);
  expect(approved.decision.pipelineBinding).toMatchObject({
    manifestJobId: "ui_pipeline_approval",
    clipIds: ["clip01_shorts", "clip02_shorts"],
  });
  expect(approved.decision.pipelineBinding.manifestDigest).toMatch(/^[a-f0-9]{64}$/);

  const dispatched = await (await request.post(`${experimentUrl}/dispatch`, {
    data: { revision },
  })).json();

  expect(dispatched.experiment.pipelineOutputs).toHaveLength(2);
  expect(dispatched.receipts.map((r: { outputId: string }) => r.outputId)).toEqual([
    "output_premise", "output_community", "output_return", "clip01_shorts", "clip02_shorts",
  ]);

  // Every receipt needs a real slot. The schedule was once a fixed three-entry array, so
  // the two pipeline receipts carried `scheduledFor: undefined` — a value the
  // DistributionReceipt type forbids and indexed access does not catch.
  for (const receipt of dispatched.receipts) {
    expect(receipt.simulated).toBe(true);
    expect(typeof receipt.scheduledFor).toBe("string");
    expect(Number.isNaN(Date.parse(receipt.scheduledFor))).toBe(false);
  }
});

test("dispatch rejects in-place media replacement after approval", async ({ request }) => {
  const initial = await (await request.get(experimentUrl)).json();
  const revision = initial.experiment.revision;
  const approval = await request.post(`${experimentUrl}/decisions`, {
    data: { action: "approve", revision },
  });
  expect(approval.ok()).toBe(true);

  // Manifest, job, clip identity, and media path are unchanged; the byte digest must catch this.
  writeFileSync(join(JOB_DIR, "clip01_shorts.mp4"), Buffer.from("replacement-media"));

  const changed = await request.get(experimentUrl);
  expect((await changed.json()).experiment.pipelineOutputs).toEqual([]);
  const dispatch = await request.post(`${experimentUrl}/dispatch`, { data: { revision } });
  expect(dispatch.status()).toBe(409);
  expect(await dispatch.json()).toMatchObject({
    error: { code: "approved_outputs_changed" },
  });
});

test("Studio shows pipeline clips as a separate section, not in place of the package", async ({ page }) => {
  await page.goto("/studio");

  // The curated package survives intact.
  await expect(page.getByRole("heading", { name: "The machine gets one more rule" })).toBeVisible();

  const section = page.getByRole("region", { name: "Pipeline clips in this approval" });
  await expect(section).toBeVisible();
  await expect(section.locator(".clip-id")).toHaveText(["clip01_shorts", "clip02_shorts"]);
  await expect(section.getByText("permission granted").first()).toBeVisible();

  // The row already prints the clip id as its identifier; the heading must not repeat it.
  await expect(section.locator("strong").filter({ hasText: /^clip0\d_shorts$/ })).toHaveCount(0);
});
