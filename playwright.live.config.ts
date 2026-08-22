import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { defineConfig, devices } from "@playwright/test";

const port = 3133;
const liveRoot = join(tmpdir(), "afterplay-playwright-live");
const memoryDir = join(liveRoot, "memory");
const workDir = join(liveRoot, "work");
const experimentDir = join(liveRoot, "experiments");
const intelDir = join(liveRoot, "intel");

// A live verification run must begin without any developer or demo artifacts.
rmSync(liveRoot, { recursive: true, force: true });
for (const directory of [memoryDir, workDir, experimentDir, intelDir]) {
  mkdirSync(directory, { recursive: true });
}

export default defineConfig({
  testDir: "./tests/e2e/live",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  outputDir: "test-results-live",
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report-live" }]],
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    trace: "retain-on-failure",
  },
  webServer: {
    command: `node ./node_modules/next/dist/bin/next dev -H 127.0.0.1 -p ${port}`,
    url: `http://127.0.0.1:${port}/api/workspace`,
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      AFTERPLAY_MODE: "live",
      AFTERPLAY_MODE_LOCK: "false",
      AFTERPLAY_MEMORY: memoryDir,
      AFTERPLAY_CLIPPER_WORKDIR: workDir,
      AFTERPLAY_WORKDIR: workDir,
      AFTERPLAY_EXPERIMENT_DIR: experimentDir,
      AFTERPLAY_INTEL_DIR: intelDir,
      AFTERPLAY_CREATOR_ID: "guest",
      AFTERPLAY_ENABLE_LIVE_AI: "false",
      OPENAI_API_KEY: "",
      APIFY_API_TOKEN: "",
    },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
