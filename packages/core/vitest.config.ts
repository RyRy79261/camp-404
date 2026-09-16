import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/__tests__/**/*.test.ts"],
    // `pnpm test:coverage` (CI). The floors are the coverage measured on
    // 2026-09-16 minus 3 points, so coverage can drift down only a little
    // before CI says so. Files that guard secrets, IDs and access stay at 100%.
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/**/__tests__/**", "src/**/*.stories.tsx"],
      reporter: ["text-summary", "json-summary"],
      thresholds: {
        statements: 92,
        branches: 85,
        functions: 94,
        lines: 92,
        "src/text-redaction.ts": {
          statements: 100,
          branches: 100,
          functions: 100,
          lines: 100,
        },
        "src/access.ts": {
          statements: 100,
          branches: 100,
          functions: 100,
          lines: 100,
        },
        "src/id-validation.ts": {
          statements: 100,
          branches: 100,
          functions: 100,
          lines: 100,
        },
        "src/promotion.ts": {
          statements: 100,
          branches: 100,
          functions: 100,
          lines: 100,
        },
      },
    },
  },
});
