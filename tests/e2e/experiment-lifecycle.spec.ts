import { expect, test } from "@playwright/test";

const experimentUrl = "/api/experiments/exp_one_more_rule";

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
