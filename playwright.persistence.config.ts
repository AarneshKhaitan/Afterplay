import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "persistence.spec.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "list",
});
