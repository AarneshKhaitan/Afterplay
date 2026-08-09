import { defineConfig, devices } from "@playwright/test";

import { TEST_CLIPPER_WORKDIR } from "./tests/e2e/clipper-workdir";
import { TEST_INTEL_DIR } from "./tests/e2e/intel-dir";

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
    //
    // Live AI is pinned off: `strategy-director.spec.ts` asserts that an unconfigured
    // live mode fails visibly, and a developer with AFTERPLAY_ENABLE_LIVE_AI=true in
    // their local .env would otherwise turn that assertion red. Tests must not depend
    // on local machine configuration.
    env: {
      AFTERPLAY_CLIPPER_WORKDIR: TEST_CLIPPER_WORKDIR,
      AFTERPLAY_ENABLE_LIVE_AI: "false",
      // Keep the intelligence store out of the real `.intel/`: its belief memory is
      // cumulative, so test pollution there compounds instead of being overwritten.
      AFTERPLAY_INTEL_DIR: TEST_INTEL_DIR,
      // Pinned empty so the "scraper not configured" path is what the suite asserts on,
      // and so no test run can ever spend money on a real scrape.
      APIFY_API_TOKEN: "",
    },
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
