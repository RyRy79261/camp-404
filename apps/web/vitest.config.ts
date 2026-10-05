import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

/** The .test.ts files that need a DOM (window, document, Element, …). */
const DOM_TS_TESTS = [
  "components/guide/__tests__/markdown-round-trip.test.ts",
  "components/markdown/__tests__/paragraph-text.test.ts",
  "components/os/__tests__/window-storage.test.ts",
  "lib/__tests__/client-errors.test.ts",
  "lib/__tests__/image.test.ts",
  "lib/__tests__/os-skin.test.ts",
  "lib/__tests__/program-search.test.ts",
];

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    setupFiles: ["./tests/vitest-setup.ts"],
    // Two projects (tests-ci-5): a .test.ts runs in plain Node, which starts
    // far faster than jsdom; a .test.tsx, and the .test.ts files below that
    // touch the DOM, run in jsdom. The list was found by running every
    // .test.ts under Node (2026-10-05): these seven failed there. A new .ts
    // test that needs the DOM goes on the list, or says
    // `@vitest-environment jsdom` in its docblock.
    projects: [
      {
        extends: true,
        test: {
          name: "node",
          environment: "node",
          include: ["**/*.test.ts"],
          exclude: ["node_modules/**", ...DOM_TS_TESTS],
        },
      },
      {
        extends: true,
        test: {
          name: "jsdom",
          environment: "jsdom",
          include: ["**/*.test.tsx", ...DOM_TS_TESTS],
          exclude: ["node_modules/**"],
        },
      },
    ],
    // The rendered UI tests drive real clicks through Radix dialogs. Alone they
    // take 1-3 s; under a full turbo run with coverage on, the slowest pass
    // 5 s. A stuck test still fails, just later.
    testTimeout: 15_000,
    // The two tests that read real Postgres (lib/__tests__/lifts.test.ts and
    // memberships-agreement.test.ts) start PGlite and run every migration in
    // `beforeAll`. Under a full turbo run that took over the 10 s default and
    // failed both; packages/db, whose harness it is, allows 60 s.
    hookTimeout: 60_000,
    // `pnpm test:coverage` (CI). The floors are the coverage measured on
    // 2026-09-16 minus 3 points, so coverage can drift down only a little
    // before CI says so.
    coverage: {
      provider: "v8",
      include: ["{lib,app,components,hooks}/**/*.{ts,tsx}"],
      exclude: ["**/*.test.{ts,tsx}", "**/__tests__/**", "tests/**"],
      reporter: ["text-summary", "json-summary"],
      thresholds: {
        statements: 56,
        branches: 54,
        functions: 51,
        lines: 57,
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
      // `import "server-only"` throws outside a React Server Component, which
      // would make every module under lib/ that guards itself untestable.
      // Point it at the package's own empty build — the same file Next resolves
      // under the `react-server` condition — so the guard is inert under vitest
      // without each test file having to `vi.mock("server-only", …)`.
      "server-only": path.resolve(
        __dirname,
        "node_modules/server-only/empty.js",
      ),
    },
  },
});
