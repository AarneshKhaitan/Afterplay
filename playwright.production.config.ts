import base from "./playwright.config";
import { defineConfig } from "@playwright/test";

import { TEST_CLIPPER_WORKDIR } from "./tests/e2e/clipper-workdir";
import { TEST_EXPERIMENT_DIR } from "./tests/e2e/experiment-dir";
import { TEST_INTEL_DIR } from "./tests/e2e/intel-dir";
import { TEST_MEMORY_DIR } from "./tests/e2e/workspace-fixture";

export default defineConfig({
  ...base,
  use: {
    ...base.use,
    baseURL: "http://127.0.0.1:3200",
  },
  webServer: {
    command: "npm run start -- --hostname 127.0.0.1 --port 3200",
    url: "http://127.0.0.1:3200/api/workspace",
    reuseExistingServer: false,
    timeout: 60_000,
    env: {
      AFTERPLAY_MODE: "demo",
      AFTERPLAY_MODE_LOCK: "true",
      AFTERPLAY_CLIPPER_WORKDIR: TEST_CLIPPER_WORKDIR,
      AFTERPLAY_WORKDIR: TEST_CLIPPER_WORKDIR,
      AFTERPLAY_MEMORY: TEST_MEMORY_DIR,
      // Pinned off so the "unconfigured live mode fails visibly" assertion does not
      // depend on whether the developer enabled live AI in their local .env.
      AFTERPLAY_ENABLE_LIVE_AI: "false",
      // Was missing here while present in playwright.config.ts: this config replaces
      // webServer wholesale rather than merging, so the persistence root fell back to the
      // real .experiments dir and the durability specs scandir'd a directory that never
      // got created.
      AFTERPLAY_EXPERIMENT_DIR: TEST_EXPERIMENT_DIR,
      AFTERPLAY_INTEL_DIR: TEST_INTEL_DIR,
      APIFY_API_TOKEN: "",
    },
  },
});
