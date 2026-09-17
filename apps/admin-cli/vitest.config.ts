import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/__tests__/**/*.test.ts"],
    // `pnpm test:coverage` (CI). The floors are the coverage measured on
    // 2026-09-16 (this package: 2026-09-17, after the seed tests) minus 3
    // points, so coverage can drift down only a little
    // before CI says so.
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/**/__tests__/**", "src/**/*.stories.tsx"],
      reporter: ["text-summary", "json-summary"],
      thresholds: {
        statements: 49,
        branches: 53,
        functions: 52,
        lines: 48,
      },
    },
  },
});
