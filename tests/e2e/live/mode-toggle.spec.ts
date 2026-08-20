import { expect, test } from "@playwright/test";

import { resolveWorkspaceMode } from "../../../src/domain/mode";

test("workspace mode follows the selected creator", async ({ page }) => {
  const initial = await page.request.get("/api/mode");
  expect(initial.ok()).toBe(true);
  expect(await initial.json()).toMatchObject({
    data: { mode: "live" },
    meta: {
      mode: "live",
      defaultMode: "live",
      locked: false,
      source: "workspace",
    },
  });

  const selectedDemo = await page.request.put("/api/creator", {
    data: {
      id: "workspace_mode_demo",
      channelId: "UC_MODE_DEMO",
      displayName: "Workspace Mode Demo",
      handle: "@modedemo",
      mode: "demo",
    },
  });
  expect(selectedDemo.ok()).toBe(true);

  const demoMode = await page.request.get("/api/mode");
  expect(await demoMode.json()).toMatchObject({
    data: { mode: "demo" },
    meta: {
      mode: "demo",
      locked: false,
      source: "workspace",
    },
  });

  await page.goto("/");
  await expect(page.locator(".topbar .sample-badge").filter({ hasText: "Demo workspace" }))
    .toBeVisible();

  const restored = await page.request.post("/api/creator", {
    data: { id: "guest" },
  });
  expect(restored.ok()).toBe(true);

  const liveMode = await page.request.get("/api/mode");
  expect(await liveMode.json()).toMatchObject({
    data: { mode: "live" },
    meta: {
      mode: "live",
      locked: false,
      source: "workspace",
    },
  });
});

test("a mode lock still overrides the selected workspace", () => {
  expect(resolveWorkspaceMode({
    workspaceMode: "demo",
    configuredDefault: "live",
    lock: "true",
  })).toEqual({
    mode: "live",
    defaultMode: "live",
    locked: true,
    source: "lock",
  });
});
