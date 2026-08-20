import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const fixtureNames = /Mika Rao|One More Rule|Rivetfall/i;

test("a channel workspace can be created, selected, renamed, and kept cold without external calls", async ({ page }) => {
  const created = await page.request.put("/api/creator", {
    data: {
      id: "live_channel_test",
      channelId: "UC_LIVE_CHANNEL_TEST",
      displayName: "Live Channel Test",
      handle: "@livechanneltest",
    },
  });
  expect(created.status()).toBe(200);
  expect(await created.json()).toMatchObject({
    id: "live_channel_test",
    workspace: {
      id: "live_channel_test",
      channelId: "UC_LIVE_CHANNEL_TEST",
      displayName: "Live Channel Test",
      handle: "@livechanneltest",
    },
  });

  const selected = await page.request.get("/api/creator");
  const selectedBody = await selected.json();
  expect(selectedBody.active).toMatchObject({
    id: "live_channel_test",
    displayName: "Live Channel Test",
    threads: 0,
    streams: 0,
    hasMemory: false,
  });

  const renamed = await page.request.patch("/api/creator", {
    data: { id: "live_channel_test", displayName: "Renamed Live Channel" },
  });
  expect(renamed.status()).toBe(200);
  expect(await renamed.json()).toMatchObject({
    workspace: { id: "live_channel_test", displayName: "Renamed Live Channel" },
  });

  const collision = await page.request.put("/api/creator", {
    data: {
      id: "live_channel_test",
      channelId: "UC_DIFFERENT_CHANNEL",
      displayName: "Wrong Channel",
    },
  });
  expect(collision.status()).toBe(409);
  expect(await collision.json()).toMatchObject({ error: { code: "creator_id_collision" } });

  await page.goto("/memory");
  await expect(page.getByRole("heading", {
    name: "What Afterplay remembers about Renamed Live Channel",
  })).toBeVisible();
  await expect(page.getByText("No channel memory for")).toBeVisible();
  expect(await page.locator("body").innerText()).not.toMatch(fixtureNames);

  const accessibility = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(accessibility.violations.map((violation) => violation.id)).toEqual([]);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    content: document.documentElement.scrollWidth,
  }));
  expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport);
});
