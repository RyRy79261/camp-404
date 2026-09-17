import { defineConfig, devices } from "@playwright/test";

// The real-database e2e run (owner's call E2E-DB, 2026-09-16: "a real Postgres
// per run"). The test login and the outside-service stubs stay on, but every
// query goes to the local stack in docker-compose.local.yml, so the
// questionnaire engine and the year rollover run exactly as in production.
//
//   pnpm db:local:up && pnpm db:local:migrate      (from the repo root)
//   pnpm --filter @camp404/web test:e2e:db
//
// Specs live in tests/e2e-db. /api/test/reset empties the local database
// before each one. Port 3100, so it never reuses the store run's server.

const DATABASE_URL = "postgres://postgres:postgres@db.localtest.me:5432/main";

export default defineConfig({
  testDir: "./tests/e2e-db",
  testMatch: "**/*.spec.ts",
  timeout: 120_000,
  // One database, one worker: specs reset it.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  expect: { timeout: 15_000 },
  reporter: process.env.CI
    ? [
        ["list"],
        ["github"],
        ["html", { open: "never", outputFolder: "playwright-report-db" }],
      ]
    : "list",
  use: {
    baseURL: "http://localhost:3100",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: devices["Desktop Chrome"] }],
  webServer: {
    command: "pnpm next dev --port 3100",
    url: "http://localhost:3100/api/health",
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: {
      E2E_TEST_MODE: "1",
      E2E_DATABASE: "real",
      NEON_LOCAL_PROXY: "1",
      DATABASE_URL,
      PGCRYPTO_KEY: "e2e-local-only-pgcrypto-key-0123456789",
      INVITE_CODES: "test-invite-e2e-only-code",
      GOD_EMAILS: "god@example.com",
    },
  },
});
