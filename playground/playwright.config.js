import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 60000,
  workers: 1,
  use: { baseURL: "http://localhost:4400", viewport: { width: 1400, height: 900 } },
  globalSetup: "./e2e/global-setup.mjs",
  webServer: { command: "pnpm dev", url: "http://localhost:4400/admin/", reuseExistingServer: true, timeout: 120000 },
});
