import { expect, test } from "@playwright/test";
import { readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { TEST_EXPERIMENT_DIR } from "./experiment-dir";

const experimentUrl = "/api/experiments/exp_one_more_rule";
const configuredCreator = "creator_mika_rigged";
const guestHeaders = { cookie: "afterplay_creator=guest" };

function onlyStateFile(): string {
  const files = readdirSync(TEST_EXPERIMENT_DIR).filter((file) => file.endsWith(".json"));
  expect(files).toHaveLength(1);
  return join(TEST_EXPERIMENT_DIR, files[0]);
}

test.beforeAll(() => {
  rmSync(TEST_EXPERIMENT_DIR, { recursive: true, force: true });
});

test.afterAll(() => {
  rmSync(TEST_EXPERIMENT_DIR, { recursive: true, force: true });
});

test.beforeEach(async ({ request }) => {
  const reset = await request.post("/api/demo/reset");
  expect(reset.ok()).toBe(true);
});

test("external distribution fails closed before creator approval", async ({ request }) => {
  const response = await request.post(`${experimentUrl}/dispatch`, {
    data: { revision: 2 },
  });

  expect(response.status()).toBe(409);
  expect(await response.json()).toMatchObject({
    error: {
      code: "approval_required",
      message: "The current revision must be approved before distribution.",
    },
  });
});

test("the public contract completes one truthful experiment loop", async ({ request }) => {
  const initial = await request.get(experimentUrl);
  expect(initial.ok()).toBe(true);
  expect(await initial.json()).toMatchObject({
    experiment: {
      id: "exp_one_more_rule",
      revision: 2,
      status: "awaiting_approval",
      evidence: expect.any(Array),
      alternatives: expect.any(Array),
      uncertainty: expect.any(String),
      outputs: [
        { id: "output_premise", status: "ready" },
        { id: "output_community", status: "ready" },
        { id: "output_return", status: "ready" },
      ],
    },
  });

  const staleApproval = await request.post(`${experimentUrl}/decisions`, {
    data: { action: "approve", revision: 1 },
  });
  expect(staleApproval.status()).toBe(409);
  expect(await staleApproval.json()).toMatchObject({ error: { code: "stale_revision" } });

  const approval = await request.post(`${experimentUrl}/decisions`, {
    data: { action: "approve", revision: 2 },
  });
  expect(approval.ok()).toBe(true);
  expect(await approval.json()).toMatchObject({
    experiment: { status: "approved" },
    decision: { action: "approve", revision: 2 },
  });

  const dispatch = await request.post(`${experimentUrl}/dispatch`, {
    data: { revision: 2 },
  });
  expect(dispatch.ok()).toBe(true);
  const dispatched = await dispatch.json();
  expect(dispatched).toMatchObject({
    experiment: { status: "distributed" },
    receipts: [
      { outputId: "output_premise", simulated: true, platform: "YouTube Shorts" },
      { outputId: "output_community", simulated: true, platform: "TikTok" },
      { outputId: "output_return", simulated: true, platform: "Instagram Reels" },
    ],
  });

  const duplicateDispatch = await request.post(`${experimentUrl}/dispatch`, {
    data: { revision: 2 },
  });
  expect(duplicateDispatch.ok()).toBe(true);
  expect((await duplicateDispatch.json()).receipts).toEqual(dispatched.receipts);

  const results = await request.post(`${experimentUrl}/results`, {
    data: {
      disclosure: "synthetic_sample_data",
      metrics: {
        views: 1284,
        returningViewerRate: 13.6,
        repeatCommenters: 7,
        trackedLiveVisits: 9,
        nextStreamAverageConcurrency: 4.6,
      },
    },
  });

  expect(results.ok()).toBe(true);
  expect(await results.json()).toMatchObject({
    experiment: { status: "learned" },
    result: {
      disclosure: "synthetic_sample_data",
      causalClaim: false,
    },
    learning: {
      conclusion: "The named format earned a cautious second test.",
      confidence: expect.any(Number),
      limitations: expect.any(Array),
    },
    nextExperiment: {
      id: "exp_name_the_builder",
      status: "proposed",
    },
  });
});

test("result analysis reflects failed submitted metrics", async ({ request }) => {
  await request.post(`${experimentUrl}/decisions`, {
    data: { action: "approve", revision: 2 },
  });
  await request.post(`${experimentUrl}/dispatch`, {
    data: { revision: 2 },
  });

  const results = await request.post(`${experimentUrl}/results`, {
    data: {
      disclosure: "synthetic_sample_data",
      metrics: {
        views: 900,
        returningViewerRate: 0,
        repeatCommenters: 0,
        trackedLiveVisits: 0,
        nextStreamAverageConcurrency: 0,
      },
    },
  });

  expect(results.ok()).toBe(true);
  const body = await results.json();
  expect(body.learning.conclusion).toBe("The result contradicted the return-cue hypothesis.");
  expect(body.learning.evidence).toEqual(expect.arrayContaining([
    "Returning-viewer rate moved from 8.2% to 0% (-8.2pt).",
    "Repeat commenters moved from 2 to 0 (-2).",
    "Tracked live visits moved from 3 to 0 (-3).",
  ]));
  expect(body.learning.evidence.join(" ")).not.toContain("13.6%");
});

test("missing state is initialized as a creator-scoped versioned document", async ({ request }) => {
  rmSync(TEST_EXPERIMENT_DIR, { recursive: true, force: true });

  const response = await request.get(experimentUrl);
  expect(response.ok()).toBe(true);
  expect(await response.json()).toMatchObject({
    experiment: { status: "awaiting_approval", revision: 2 },
  });

  const persisted = JSON.parse(readFileSync(onlyStateFile(), "utf-8"));
  expect(persisted).toMatchObject({
    _afterplay: {
      format: "afterplay.versioned-json",
      schema: "afterplay.experiment-store",
      version: 1,
    },
    value: {
      creatorId: configuredCreator,
      experiment: { id: "exp_one_more_rule", status: "awaiting_approval" },
    },
  });
});

test("legacy raw experiment state is adopted and rewritten without losing lifecycle data", async ({
  request,
}) => {
  const statePath = onlyStateFile();
  const current = JSON.parse(readFileSync(statePath, "utf-8"));
  current.value.experiment.stage = "Legacy stage retained";
  writeFileSync(statePath, JSON.stringify({ experiment: current.value.experiment }), "utf-8");

  const response = await request.get(experimentUrl);
  expect(response.ok()).toBe(true);
  expect(await response.json()).toMatchObject({
    experiment: { stage: "Legacy stage retained", status: "awaiting_approval" },
  });

  const migrated = JSON.parse(readFileSync(statePath, "utf-8"));
  expect(migrated).toMatchObject({
    _afterplay: { schema: "afterplay.experiment-store", version: 1 },
    value: {
      creatorId: configuredCreator,
      experiment: { stage: "Legacy stage retained" },
    },
  });
});

test("corrupt state fails visibly and is not silently replaced", async ({ request }) => {
  const statePath = onlyStateFile();
  writeFileSync(statePath, "{not-json", "utf-8");

  const response = await request.get(experimentUrl);
  expect(response.status()).toBe(500);
  expect(await response.json()).toEqual({
    error: {
      code: "experiment_state_corrupt",
      message: "The saved experiment state is invalid and was not reset.",
    },
  });
  expect(readFileSync(statePath, "utf-8")).toBe("{not-json");
});

test("each creator has an isolated durable lifecycle", async ({ request }) => {
  await request.post("/api/demo/reset", { headers: guestHeaders });

  const approval = await request.post(`${experimentUrl}/decisions`, {
    data: { action: "approve", revision: 2 },
  });
  expect(approval.ok()).toBe(true);

  const configured = await request.get(experimentUrl);
  const guest = await request.get(experimentUrl, { headers: guestHeaders });
  expect(await configured.json()).toMatchObject({ experiment: { status: "approved" } });
  expect(await guest.json()).toMatchObject({ experiment: { status: "awaiting_approval" } });

  const creators = readdirSync(TEST_EXPERIMENT_DIR)
    .filter((file) => file.endsWith(".json"))
    .map((file) => JSON.parse(readFileSync(join(TEST_EXPERIMENT_DIR, file), "utf-8")).value.creatorId);
  expect(creators.sort()).toEqual([configuredCreator, "guest"].sort());
});
