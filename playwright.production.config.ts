import base from "./playwright.config";
import { defineConfig } from "@playwright/test";

import { TEST_CLIPPER_WORKDIR } from "./tests/e2e/clipper-workdir";
import { TEST_INTEL_DIR } from "./tests/e2e/intel-dir";

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
      AFTERPLAY_CLIPPER_WORKDIR: TEST_CLIPPER_WORKDIR,
      // Pinned off so the "unconfigured live mode fails visibly" assertion does not
      // depend on whether the developer enabled live AI in their local .env.
      AFTERPLAY_ENABLE_LIVE_AI: "false",
      // Pinned so the suite does not depend on which creators happen to be backfilled
      // on the developer's machine, and so the intel fixtures resolve to one creator.
      AFTERPLAY_CREATOR_ID: "creator_mika_rigged",
      AFTERPLAY_INTEL_DIR: TEST_INTEL_DIR,
      APIFY_API_TOKEN: "",
    },
  },
});
