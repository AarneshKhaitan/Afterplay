import { defineConfig, devices } from "@playwright/test";

import { TEST_CLIPPER_WORKDIR } from "./tests/e2e/clipper-workdir";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://127.0.0.1:3100",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm run dev -- --hostname 127.0.0.1 --port 3100",
    url: "http://127.0.0.1:3100/api/workspace",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    // Keep test fixtures out of the real clipper workdir so a test run never
    // becomes the manifest Studio serves. See tests/e2e/clipper-workdir.ts.
    env: { AFTERPLAY_CLIPPER_WORKDIR: TEST_CLIPPER_WORKDIR },
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
