import { defineConfig, devices } from "@playwright/test";

// When running against an external preview (Vercel preview URL, staging,
// etc.), set PLAYWRIGHT_BASE_URL and PLAYWRIGHT_SKIP_WEB_SERVER=1 so
// Playwright doesn't try to spin up its own dev server.
const skipWebServer = process.env.PLAYWRIGHT_SKIP_WEB_SERVER === "1";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60_000,
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: devices["Desktop Chrome"] }],
  webServer: skipWebServer
    ? undefined
    : {
        // `next dev` is fine for the breadth of unauth tests we run here.
        // Switch to `next start` against a build if HMR ever interferes.
        command: "pnpm next dev --port 3000",
        url: "http://localhost:3000/api/health",
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        env: {
          // Test fixtures for the gating flows. INVITE_CODES seeds a known
          // code so the /signup spec can submit it; everything else stays
          // on the in-repo placeholder fallbacks.
          INVITE_CODES: "TEST-INVITE",
          GOD_EMAILS: "god@example.com",
        },
      },
});
