import { defineConfig, devices } from "@playwright/test";

// Smoke tests for the static site. They run against `next dev` on 3404, the
// port apps/web does not use, so both suites can run on one machine.
export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "**/*.spec.ts",
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [["list"], ["github"]] : "list",
  use: {
    baseURL: "http://localhost:3404",
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
    command: "pnpm next dev --port 3404",
    url: "http://localhost:3404",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
