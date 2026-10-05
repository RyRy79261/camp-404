import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/__tests__/**/*.test.ts"],
    // `pnpm test:coverage` (CI). The floors are the coverage measured on
    // 2026-10-05 minus 3 points, as core does, so coverage can drift down only
    // a little before CI says so. The two files that guard who may sign in
    // where (the unconfirmed-email guards and the preview OAuth proxy) are
    // pinned at what they reach today.
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/**/__tests__/**"],
      reporter: ["text-summary", "json-summary"],
      thresholds: {
        statements: 90,
        branches: 85,
        functions: 91,
        lines: 92,
        "src/email-proof.ts": {
          statements: 100,
          branches: 90,
          functions: 100,
          lines: 100,
        },
        "src/oauth-proxy.ts": {
          statements: 91,
          branches: 86,
          functions: 100,
          lines: 100,
        },
      },
    },
  },
});
