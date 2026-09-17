import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    include: ["**/*.test.{ts,tsx}"],
    setupFiles: ["./tests/vitest-setup.ts"],
    // The rendered UI tests drive real clicks through Radix dialogs. Alone they
    // take 1-3 s; under a full turbo run with coverage on, the slowest pass
    // 5 s. A stuck test still fails, just later.
    testTimeout: 15_000,
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
