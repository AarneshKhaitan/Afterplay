import { expect, test } from "@playwright/test";

test("all six product areas are populated and navigable", async ({ page, request }) => {
  await request.post("/api/demo/reset");

  const areas = [
    { path: "/", heading: "New viewers watch, but few come back" },
    { path: "/experiments", heading: "One More Rule" },
    { path: "/studio", heading: "Review the package" },
    { path: "/audience", heading: "Return behavior after the test" },
    { path: "/memory", heading: "What the team knows about Mika" },
    { path: "/integrations", heading: "Connections and permissions" },
  ];

  for (const area of areas) {
    await page.goto(area.path);
    await expect(page.getByRole("heading", { level: 1, name: area.heading })).toBeVisible();
    await expect(page.getByText("Sample workspace", { exact: true })).toBeVisible();
  }
});

test("Memory exposes durable identity, boundaries, and learned updates", async ({ page }) => {
  await page.goto("/memory");

  await expect(page.getByRole("heading", { name: "Mika Rao" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Working beliefs" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Approval rules" })).toBeVisible();
  await expect(page.getByText("Never publish, contact, spend, or change an account without approval.", { exact: true })).toBeVisible();
  await expect(page.getByText("Viewer ingenuity beats creator perfection", { exact: true })).toBeVisible();
});

test("Integrations makes mode, permissions, and simulation visible", async ({ page }) => {
  await page.goto("/integrations");

  await expect(page.getByText("Deterministic demo", { exact: true })).toBeVisible();
  await expect(page.getByText("Optional live AI", { exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Strategy mode" }).getByText("Not configured", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Who can do what" })).toBeVisible();
  await expect(page.getByText("Approval required", { exact: true })).toHaveCount(3);
  await expect(page.getByText("Simulation", { exact: true })).toBeVisible();
});

test("the creator can reset the deterministic demo from Integrations", async ({ page, request }) => {
  await request.post("/api/demo/reset");
  await request.post("/api/experiments/exp_one_more_rule/decisions", {
    data: { action: "approve", revision: 2 },
  });

  await page.goto("/integrations");
  await page.getByRole("button", { name: "Reset demo workspace" }).click();
  await expect(page.getByText("Demo workspace reset", { exact: true })).toBeVisible();

  const response = await request.get("/api/experiments/exp_one_more_rule");
  expect(await response.json()).toMatchObject({
    experiment: { status: "awaiting_approval", revision: 2 },
  });
});
