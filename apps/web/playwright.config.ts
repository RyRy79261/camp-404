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
  // by the one Next server every worker hits. Parallel workers would
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
        // Production build (`next build && next start`), NOT `next dev`.
        // `next dev` compiles each route/server-action on first hit, so the
        // first invocation of a heavy server action (announcement publish +
        // fan-out) cold-compiles its whole module graph and overruns the
        // assertion — a deterministic fail-then-pass-on-retry flake. A
        // prebuilt server has no on-demand compilation, so every test runs
        // warm and deterministic. `next build` needs no extra env (the CI
        // build job builds env-free), and the E2E_TEST_MODE seam is
        // runtime-gated, so it survives the prod build and stays enabled.
        // Locally, `reuseExistingServer` means a running `pnpm dev` is reused
        // and this build step is skipped.
        command: "pnpm next build && pnpm next start --port 3000",
        url: "http://localhost:3000/api/health",
        reuseExistingServer: !process.env.CI,
        // Cold `next build` (~50-60s, no .next cache in the e2e job) + start.
        timeout: 240_000,
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
