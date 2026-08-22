import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const forbiddenFixtureCopy = /Mika Rao|One More Rule|Rivetfall/i;
const coldRoutes = [
  { path: "/", heading: "No live growth diagnosis yet" },
  { path: "/audience", heading: "No live audience result yet" },
  {
    path: "/experiments/exp_one_more_rule",
    heading: "No live experiment has been created",
  },
] as const;

test("an empty live workspace starts with no copied creator fixture", async ({ request }) => {
  const response = await request.get("/api/creator");
  expect(response.ok()).toBe(true);

  const body = await response.json();
  expect(body.active).toMatchObject({
    id: "guest",
    displayName: "Guest",
    threads: 0,
    streams: 0,
    hasMemory: false,
  });
  expect(body.creators).toContainEqual(body.active);
  expect(JSON.stringify(body)).not.toMatch(forbiddenFixtureCopy);
});

for (const route of coldRoutes) {
  test(`${route.path} renders a truthful, accessible live cold state`, async ({ page }) => {
    await page.goto(route.path);

    await expect(page.getByRole("heading", { name: route.heading })).toBeVisible();
    await expect(page.locator(".topbar .sample-badge").filter({ hasText: "Live workspace" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Open setup" })).toBeVisible();
    await expect(page.locator(".truth-footer")).toContainText(/does not substitute|not substituted|available only in demo mode/);
    expect(await page.locator("body").innerText()).not.toMatch(forbiddenFixtureCopy);

    const accessibility = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    expect(accessibility.violations.map((violation) => ({
      id: violation.id,
      targets: violation.nodes.map((node) => node.target.join(" ")),
    }))).toEqual([]);
  });
}

test("live cold states do not overflow a 390px viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });

  for (const route of coldRoutes) {
    await page.goto(route.path);
    const dimensions = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      content: document.documentElement.scrollWidth,
    }));
    expect(dimensions.content, `${route.path} overflows horizontally`)
      .toBeLessThanOrEqual(dimensions.viewport);
    expect(await page.locator("body").innerText()).not.toMatch(forbiddenFixtureCopy);
  }
});
