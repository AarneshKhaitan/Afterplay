import { expect, test, type APIRequestContext } from "@playwright/test";

const guardedRequests = [
  {
    name: "demo reset",
    send: (request: APIRequestContext) =>
      request.post("/api/demo/reset"),
  },
  {
    name: "simulated dispatch",
    send: (request: APIRequestContext) =>
      request.post("/api/experiments/exp_one_more_rule/dispatch", {
        data: { revision: 1 },
      }),
  },
  {
    name: "synthetic results",
    send: (request: APIRequestContext) =>
      request.post("/api/experiments/exp_one_more_rule/results", { data: {} }),
  },
] as const;

for (const guarded of guardedRequests) {
  test(`${guarded.name} is rejected before payload handling in live mode`, async ({ request }) => {
    const response = await guarded.send(request);
    expect(response.status()).toBe(409);
    expect(await response.json()).toMatchObject({
      error: { code: "demo_only" },
      meta: { mode: "live", locked: false },
    });
  });
}
