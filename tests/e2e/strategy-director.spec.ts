import { expect, test } from "@playwright/test";

const input = {
  creatorId: "creator_mika_rigged",
  objective: "Increase returning audience without optimizing for raw reach alone.",
  evidenceRefs: ["evidence_format_gap", "evidence_return_gap", "evidence_chat"],
};

test("demo strategy is deterministic and schema-validated", async ({ request }) => {
  const first = await request.post("/api/strategy/plan", { data: { mode: "demo", input } });
  const second = await request.post("/api/strategy/plan", { data: { mode: "demo", input } });

  expect(first.ok()).toBe(true);
  expect(second.ok()).toBe(true);

  const firstBody = await first.json();
  const secondBody = await second.json();
  expect(firstBody).toEqual(secondBody);
  expect(firstBody).toMatchObject({
    meta: { mode: "demo", model: null, validated: true, fallbackUsed: false },
    proposal: {
      name: "One More Rule",
      confidence: 72,
      evidenceRefs: input.evidenceRefs,
      alternatives: expect.any(Array),
      uncertainty: expect.any(String),
      falsifier: expect.any(String),
    },
  });
});

test("unconfigured live mode fails visibly instead of returning fixture success", async ({ request }) => {
  const response = await request.post("/api/strategy/plan", { data: { mode: "live", input } });

  expect(response.status()).toBe(503);
  const body = await response.json();
  expect(body).toMatchObject({
    error: {
      code: "live_mode_not_configured",
      message: "Live AI requires explicit server configuration.",
    },
    meta: { mode: "live", fallbackUsed: false },
  });
  expect(body).not.toHaveProperty("proposal");
});
