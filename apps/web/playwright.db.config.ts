import { defineConfig, devices } from "@playwright/test";
import { AUTH_EMAIL_CAPTURE_FILE } from "./tests/e2e-db/_mail";

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

// E2E_SERVE_BUILD=1 serves a production build (`next start`) instead of
// `next dev`, as the store run does (playwright.config.ts); build first with
// the store run's env (E2E_TEST_MODE, INVITE_CODES, GOD_EMAILS). The database
// env below is read at request time, so the same build serves both runs. CI
// does this: under `next dev` every page load on the runner took seconds, and
// the longest spec (desktop.spec.ts, two blocking sends) went from 1.9 of its
// 2 minutes to over them once the 404 OS desktop grew. Locally the default
// stays `next dev`; `next start` also needs CI set (lib/env.ts).
const serveBuild = process.env.E2E_SERVE_BUILD === "1";

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
    command: serveBuild
      ? "pnpm next start --port 3100"
      : "pnpm next dev --port 3100",
    url: "http://localhost:3100/api/health",
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: {
      E2E_TEST_MODE: "1",
      E2E_DATABASE: "real",
      NEON_LOCAL_PROXY: "1",
      DATABASE_URL,
      // The origin the app is served on. Plain http, so Better Auth drops the
      // Secure flag and its `__Secure-` prefix (packages/auth/src/env.ts):
      // without it a production build (E2E_SERVE_BUILD) names its session
      // cookie `__Secure-camp404.session_token`, which sign-in.spec.ts's
      // cookie check does not see.
      BETTER_AUTH_URL: "http://localhost:3100",
      // Better Auth rate-limits only in production, and sign-in.spec.ts signs
      // in five times in a minute: raise the ceiling (the knob a test
      // deployment uses) rather than turn the limit off.
      AUTH_RATE_LIMIT_MAX: "100",
      PGCRYPTO_KEY: "e2e-local-only-pgcrypto-key-0123456789",
      INVITE_CODES: "test-invite-e2e-only-code",
      GOD_EMAILS: "god@example.com",
      // Auth emails land in a file instead of being sent (tests/e2e-db/_mail.ts).
      AUTH_EMAIL_CAPTURE_FILE,
    },
  },
});
