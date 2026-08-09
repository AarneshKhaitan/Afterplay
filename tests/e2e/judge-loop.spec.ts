import { expect, test } from "@playwright/test";

test.beforeEach(async ({ request }) => {
  const reset = await request.post("/api/demo/reset");
  expect(reset.ok()).toBe(true);
});

test("a creator can approve work and carry one experiment into learning", async ({ page }) => {
  await page.goto("/experiments/exp_one_more_rule");

  await expect(page.getByRole("heading", { level: 1, name: "One More Rule" })).toBeVisible();
  await expect(page.getByText("Confidence", { exact: true })).toBeVisible();
  await expect(page.getByText("72%", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Evidence for this test" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Uncertainty" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Alternatives considered" })).toBeVisible();

  await page.getByRole("link", { name: "Review 3 outputs" }).click();
  await expect(page).toHaveURL(/\/studio$/);
  await expect(page.getByRole("heading", { level: 1, name: "Review the package" })).toBeVisible();
  await expect(page.getByRole("article", { name: "The machine gets one more rule" })).toBeVisible();
  await expect(page.getByRole("article", { name: "Chat chooses the impossible constraint" })).toBeVisible();
  await expect(page.getByRole("article", { name: "Next rule enters Tuesday" })).toBeVisible();

  await page.getByRole("button", { name: "Approve current revision" }).click();
  await expect(page.getByText("Approved by Mika", { exact: true })).toBeVisible();
  await expect(page.getByText("Nothing has been posted yet.", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Run simulated distribution" }).click();
  await expect(page.getByRole("heading", { name: "Simulated distribution complete" })).toBeVisible();
  await expect(page.getByText("SIMULATED", { exact: true })).toHaveCount(3);

  await page.getByRole("link", { name: "View sample results" }).click();
  await expect(page).toHaveURL(/\/audience$/);
  await expect(page.getByRole("heading", { level: 1, name: "Return behavior after the test" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Sample results are not loaded" })).toBeVisible();

  await page.getByRole("button", { name: "Load labelled sample results" }).click();
  await expect(page.getByText("Synthetic sample result", { exact: true })).toBeVisible();
  await expect(page.getByText("13.6%", { exact: true })).toBeVisible();
  await expect(page.getByText("No causal claim", { exact: true })).toBeVisible();
  await expect(page.getByText("The named format earned a cautious second test.", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Name the Builder" })).toBeVisible();

  await page.getByRole("link", { name: "Afterplay home" }).click();
  await expect(page.getByRole("heading", { name: "Experiment 04 learned" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Name the Builder" })).toBeVisible();
});
