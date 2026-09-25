import { defineConfig } from "vitest/config";

// The games' rules and scoreboards are pure modules, tested without a
// browser; their canvases and views are checked by the apps' browser tests
// (Join's smoke suite plays INKBLOT.EXE to the end).
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts"],
      reporter: ["text-summary", "json-summary"],
      // Measured on 2026-09-26 minus 3 points, as apps/web does.
      thresholds: { statements: 76, branches: 77, functions: 73, lines: 79 },
    },
  },
});
