import { expect, test } from "@playwright/test";

test.beforeEach(async ({ request }) => {
  const reset = await request.post("/api/demo/reset");
  expect(reset.ok()).toBe(true);
});

test("the public workspace contract exposes an honest current briefing", async ({ request }) => {
  const response = await request.get("/api/workspace");

  expect(response.ok()).toBe(true);
  expect(await response.json()).toMatchObject({
    meta: {
      mode: "demo",
      disclosure: "synthetic_sample_data",
    },
    workspace: {
      creator: {
        displayName: "Mika Rao",
        handle: "mika_rigged",
      },
      diagnosis: {
        title: "New viewers watch, but few come back",
      },
      activeExperiment: {
        id: "exp_one_more_rule",
        name: "One More Rule",
        status: "awaiting_approval",
      },
    },
  });
});

test("a judge can understand the product from Growth HQ", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { level: 1, name: "New viewers watch, but few come back" })).toBeVisible();
  await expect(page.getByText("One More Rule", { exact: true })).toBeVisible();
  await expect(page.getByText("Approval needed", { exact: true })).toBeVisible();
  await expect(page.getByText("Sample workspace", { exact: true })).toBeVisible();

  // The workspace names the creator it is actually configured for. Asserting a fixture
  // name here is what let "Mika Rao" stay hardcoded in nine places while
  // AFTERPLAY_CREATOR_ID was ignored, so assert the control works instead.
  const switcher = page.getByRole("button", { name: "Creator workspace" });
  await expect(switcher).toBeVisible();
  await expect(switcher).toContainText(/threads? remembered/);
  await switcher.click();
  await expect(page.getByRole("listbox", { name: "Creator workspaces" })).toBeVisible();
  await expect(page.getByRole("option").first()).toBeVisible();

  const navigation = page.getByRole("navigation", { name: "Product" });
  for (const label of ["HQ", "Intel", "Experiments", "Riff live", "Ingest", "Studio", "Audience", "Memory", "Integrations"]) {
    await expect(navigation.getByRole("link", { name: label, exact: true })).toBeVisible();
  }
});
