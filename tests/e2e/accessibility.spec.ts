import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const routes = [
  "/",
  "/intel",
  "/experiments/exp_one_more_rule",
  "/live",
  "/studio",
  "/audience",
  "/memory",
  "/integrations",
];

for (const route of routes) {
  test(`${route} has no detectable WCAG A or AA violations`, async ({ page }) => {
    await page.goto(route);
    const result = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    expect(result.violations.map((violation) => ({
      id: violation.id,
      targets: violation.nodes.map((node) => node.target.join(" ")),
    }))).toEqual([]);
  });
}

test("mobile layouts do not introduce horizontal page overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });

  for (const route of routes) {
    await page.goto(route);
    const dimensions = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      content: document.documentElement.scrollWidth,
    }));
    expect(dimensions.content, `${route} overflows horizontally`).toBeLessThanOrEqual(dimensions.viewport);
  }
});
