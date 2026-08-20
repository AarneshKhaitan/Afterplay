import { expect, test } from "@playwright/test";

import { resolveWorkspaceMode } from "../../../src/domain/mode";

test("live mode is the isolated default and the browser profile can toggle modes", async ({ page }) => {
  const initial = await page.request.get("/api/mode");
  expect(initial.ok()).toBe(true);
  expect(await initial.json()).toEqual({
    data: { mode: "live" },
    meta: {
      mode: "live",
      defaultMode: "live",
      locked: false,
      source: "environment",
    },
  });

  await page.goto("/");
  await expect(page.getByRole("button", { name: "Switch to demo workspace" })).toBeEnabled();
  await page.getByRole("button", { name: "Switch to demo workspace" }).click();
  await expect(page.locator(".topbar .sample-badge").filter({ hasText: "Demo workspace" }))
    .toBeVisible();

  const demo = await page.request.get("/api/mode");
  expect((await demo.json()).meta).toMatchObject({
    mode: "demo",
    locked: false,
    source: "cookie",
  });

  await page.getByRole("button", { name: "Switch to live workspace" }).click();
  await expect(page.getByRole("heading", { name: "No live growth diagnosis yet" })).toBeVisible();
  const restored = await page.request.get("/api/mode");
  expect((await restored.json()).meta).toMatchObject({
    mode: "live",
    locked: false,
    source: "cookie",
  });
});

test("a mode lock overrides a browser cookie", () => {
  expect(resolveWorkspaceMode({
    cookie: "live",
    configuredDefault: "demo",
    lock: "true",
  })).toEqual({
    mode: "demo",
    defaultMode: "demo",
    locked: true,
    source: "lock",
  });
});
