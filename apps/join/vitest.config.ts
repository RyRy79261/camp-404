import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["**/*.test.ts"],
    exclude: ["node_modules/**", "tests/e2e/**"],
    coverage: {
      provider: "v8",
      include: ["lib/**/*.ts"],
      exclude: ["**/*.test.ts"],
      reporter: ["text-summary", "json-summary"],
      // Measured on 2026-09-25 minus 3 points, as apps/web does.
      thresholds: { statements: 75, branches: 69, functions: 71, lines: 77 },
    },
  },
});
