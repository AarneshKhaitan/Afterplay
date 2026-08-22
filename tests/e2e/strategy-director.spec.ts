import { expect, type APIRequestContext, test } from "@playwright/test";

const evidenceRefs = ["evidence_format_gap", "evidence_return_gap", "evidence_chat"];

async function inputForActiveCreator(request: APIRequestContext) {
  const response = await request.get("/api/creator");
  expect(response.ok()).toBe(true);
  const body = await response.json();
  return {
    creatorId: body.active.id as string,
    objective: "Increase returning audience without optimizing for raw reach alone.",
    evidenceRefs,
  };
}

test("demo strategy is deterministic and schema-validated", async ({ request }) => {
  const input = await inputForActiveCreator(request);
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
  const input = await inputForActiveCreator(request);
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

test("live strategy rejects a creator outside the active workspace", async ({ request }) => {
  const input = await inputForActiveCreator(request);
  const response = await request.post("/api/strategy/plan", {
    data: { mode: "live", input: { ...input, creatorId: "foreign_creator" } },
  });

  expect(response.status()).toBe(403);
  expect(await response.json()).toMatchObject({
    error: {
      code: "creator_scope_mismatch",
      message: "The strategy request does not belong to the active creator workspace.",
    },
    meta: { mode: "live", fallbackUsed: false },
  });
});
