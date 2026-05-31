import { defineConfig } from "@playwright/test";
import { fileURLToPath } from "node:url";
import * as path from "node:path";

// This config lives at apps/web/scripts/pencil/. Playwright defaults
// webServer.cwd to the config file's directory, so `next dev` would run there
// and fail to find app/. Pin it back to the apps/web package root.
const APP_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

/**
 * Dedicated Playwright config for the Pencil reference-screenshot capture.
 *
 * Kept separate from playwright.config.ts so `pnpm test:e2e` never runs the
 * capture and `pnpm design:capture` never runs the e2e suite. It reuses the
 * same E2E_TEST_MODE in-memory seam (so we can seed users/ranks/approval
 * deterministically) but overrides the surface for design work:
 *
 *  - MOBILE viewport (the app is a max-w-lg, mobile-first surface). The e2e
 *    config uses Desktop Chrome; capturing there would frame the app wrong.
 *  - DARK colour scheme by default (Camp 404 is dark-only; the OKLCH tokens in
 *    packages/ui/src/styles/globals.css define a single midnight-violet theme).
 *    Flip with CAPTURE_THEME=light to surface the stray `dark:` utilities — they're
 *    media-query (prefers-color-scheme) based, not class-based, so they only show
 *    under a light OS preference. They're slated for removal in a dark-only app
 *    (see design/recommendations.md).
 *  - serviceWorkers blocked so page.route() mocks are never bypassed by a cache.
 *
 * Run via: pnpm --filter @camp404/web design:capture
 *          CAPTURE_THEME=light pnpm --filter @camp404/web design:capture
 */
const skipWebServer = process.env.PLAYWRIGHT_SKIP_WEB_SERVER === "1";

export default defineConfig({
  // testDir + globalSetup resolve relative to THIS config file's directory.
  // (apps/web is `"type": "module"`, so __dirname / require.resolve are
  // unavailable here — use relative paths.)
  testDir: ".",
  testMatch: "capture-screenshots.ts",
  // Clean the in-memory store once before the run (per-context reseeding
  // happens inside the spec). Mirrors the e2e harness but capture-specific.
  globalSetup: "./capture-setup.ts",
  // Single worker, no parallelism: the E2E_TEST_MODE store is a process-wide
  // singleton on the one dev server, exactly as the e2e config requires.
  fullyParallel: false,
  workers: 1,
  // `next dev` cold-compiles routes on first hit and the capture walks ~20
  // pages across several seeded user contexts — give it real headroom.
  timeout: 240_000,
  reporter: "list",
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000",
    // Mobile-first surface (iPhone-class) matching the app's max-w-lg container.
    // NB: we set the viewport manually rather than spreading an
    // `devices["iPhone …"]` descriptor — those force defaultBrowserType:
    // "webkit", and only Chromium is installed here (as in the e2e config).
    viewport: { width: 430, height: 932 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    serviceWorkers: "block",
    colorScheme: (process.env.CAPTURE_THEME as "light" | "dark") ?? "dark",
  },
  webServer: skipWebServer
    ? undefined
    : {
        command: "pnpm next dev --port 3000",
        cwd: APP_DIR,
        url: "http://localhost:3000/api/health",
        reuseExistingServer: !process.env.CI,
        stdout: "pipe",
        stderr: "pipe",
        timeout: 120_000,
        env: {
          // Same seam the e2e suite uses: enables /api/test/* + the in-memory
          // user store and seeds a known invite + god email.
          E2E_TEST_MODE: "1",
          INVITE_CODES: "TEST-INVITE",
          GOD_EMAILS: "god@example.com",
          // Force the non-deterministic integrations off so captures never hit
          // a real API or vary run-to-run. Avatar upload, push registration and
          // feedback submission already short-circuit under E2E_TEST_MODE; these
          // empties are belt-and-braces so nothing reaches Groq/Anthropic/Blob.
          GROQ_API_KEY: "",
          ANTHROPIC_API_KEY: "",
          BLOB_READ_WRITE_TOKEN: "",
          GITHUB_FEEDBACK_TOKEN: "",
        },
      },
});
