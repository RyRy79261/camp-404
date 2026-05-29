import { defineConfig, devices } from "@playwright/test";

// When running against an external preview (Vercel preview URL, staging,
// etc.), set PLAYWRIGHT_BASE_URL and PLAYWRIGHT_SKIP_WEB_SERVER=1 so
// Playwright doesn't try to spin up its own dev server.
const skipWebServer = process.env.PLAYWRIGHT_SKIP_WEB_SERVER === "1";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60_000,
  // MUST stay serial. The E2E_TEST_MODE harness backs auth + DB with a
  // single process-wide in-memory store (apps/web/lib/test-store.ts) shared
  // by the one `next dev` server every worker hits. Parallel workers would
  // race it — one test's `resetTestState`/`seed-invite` clobbers another's
  // mid-flight. One worker, no intra-file parallelism.
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 2 : 0,
  // In CI: `list` for a readable per-test log, `github` for inline
  // annotations on failures, and `html` for a downloadable report artifact.
  reporter: process.env.CI
    ? [["list"], ["github"], ["html", { open: "never" }]]
    : "list",
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
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
          // bootstrap code so the /signup spec can submit it; everything
          // else stays on the in-repo placeholder fallbacks. E2E_TEST_MODE
          // enables /api/test/login + the in-memory user store so we can
          // drive authenticated flows without a real Neon Auth session.
          E2E_TEST_MODE: "1",
          INVITE_CODES: "TEST-INVITE",
          GOD_EMAILS: "god@example.com",
        },
      },
});
