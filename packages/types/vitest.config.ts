import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/__tests__/**/*.test.ts"],
    // `pnpm test:coverage` (CI). The floors are the coverage measured on
    // 2026-09-16 minus 3 points, so coverage can drift down only a little
    // before CI says so.
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/**/__tests__/**", "src/**/*.stories.tsx"],
      reporter: ["text-summary", "json-summary"],
      thresholds: {
        statements: 86,
        branches: 84,
        functions: 94,
        lines: 87,
      },
    },
  },
});
