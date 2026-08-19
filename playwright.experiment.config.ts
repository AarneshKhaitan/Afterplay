import { defineConfig, devices } from "@playwright/test";

import { TEST_CLIPPER_WORKDIR } from "./tests/e2e/clipper-workdir";
import { TEST_EXPERIMENT_DIR } from "./tests/e2e/experiment-dir";
import { TEST_INTEL_DIR } from "./tests/e2e/intel-dir";

const port = 3112;

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "experiment-lifecycle.spec.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 90_000,
  reporter: "list",
  use: { baseURL: `http://127.0.0.1:${port}`, trace: "retain-on-failure" },
  webServer: {
    command: `npm run dev -- --hostname 127.0.0.1 --port ${port}`,
    url: `http://127.0.0.1:${port}/api/workspace`,
    reuseExistingServer: false,
    timeout: 300_000,
    env: {
      AFTERPLAY_CLIPPER_WORKDIR: TEST_CLIPPER_WORKDIR,
      AFTERPLAY_WORKDIR: TEST_CLIPPER_WORKDIR,
      AFTERPLAY_CREATOR_ID: "creator_mika_rigged",
      AFTERPLAY_ENABLE_LIVE_AI: "false",
      AFTERPLAY_EXPERIMENT_DIR: TEST_EXPERIMENT_DIR,
      AFTERPLAY_INTEL_DIR: TEST_INTEL_DIR,
      APIFY_API_TOKEN: "",
    },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
