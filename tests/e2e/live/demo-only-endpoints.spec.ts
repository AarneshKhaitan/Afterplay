import { expect, test } from "@playwright/test";

/** Resetting the demo workspace is still demo-only: it rewrites a workspace's experiment
 * store back to the seeded package, which would silently discard real decisions in a live
 * workspace. Distribution and sample results are no longer gated by mode -- neither
 * contacts a platform, and both label themselves (SIMULATED receipts, and a required
 * `synthetic_sample_data` disclosure). */
test("demo reset is rejected before payload handling in live mode", async ({ request }) => {
  const response = await request.post("/api/demo/reset");
  expect(response.status()).toBe(409);
  expect(await response.json()).toMatchObject({
    error: { code: "demo_only" },
    meta: { mode: "live", locked: false },
  });
});

const ungatedRequests = [
  {
    name: "simulated dispatch",
    path: "/api/experiments/exp_one_more_rule/dispatch",
    data: { revision: 1 },
  },
  {
    name: "synthetic results",
    path: "/api/experiments/exp_one_more_rule/results",
    data: {},
  },
] as const;

for (const ungated of ungatedRequests) {
  // Asserts only that mode no longer decides. Both payloads are deliberately incomplete
  // for the current experiment state, so the request still fails -- on revision or
  // validation, which is the point. What must not come back is "demo_only".
  test(`${ungated.name} is not blocked by live mode`, async ({ request }) => {
    const response = await request.post(ungated.path, { data: ungated.data });
    const body = await response.json();
    expect(body?.error?.code ?? null).not.toBe("demo_only");
  });
}
