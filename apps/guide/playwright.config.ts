import { defineConfig, devices } from "@playwright/test";

// survival-guide.camp-404.com's tests. They run against `next dev` on 3405
// (apps/web uses 3000 and join 3404) with E2E_TEST_MODE=1, which serves the
// fixture chapters in lib/fixtures.ts through the same public funnel as the
// database (toPublicChapter in @camp404/core), so no database is needed.
export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "**/*.spec.ts",
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [["list"], ["github"]] : "list",
  use: {
    baseURL: "http://localhost:3405",
    trace: "on-first-retry",
  },
  projects: [
    { name: "chromium", use: devices["Desktop Chrome"] },
    {
      name: "phone",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 390, height: 844 },
        hasTouch: true,
      },
    },
  ],
  webServer: {
    command: "pnpm next dev --port 3405",
    url: "http://localhost:3405",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: { E2E_TEST_MODE: "1" },
  },
});
