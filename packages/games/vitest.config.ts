import { defineConfig } from "vitest/config";

// The games' rules and scoreboards are pure modules, tested without a
// browser (node). The cats and Shadow Work also have rendered tests
// (*.test.tsx), which ask for jsdom in their first line; the setup file
// fills jsdom's gaps. INKBLOT's canvas and views are checked by the apps'
// browser tests (Join's smoke suite plays INKBLOT.EXE to the end).
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}"],
    setupFiles: ["./vitest.setup.ts"],
    // Shadow Work's rendered tests hand-crank its loop through React, one
    // act() per frame (a grab runs about 150). Alone the slowest takes 0.3 s;
    // under a full uncached turbo run it passed 5 s and failed. A stuck loop
    // still fails: framesUntilIdle stops at a minute of frames. As apps/web.
    testTimeout: 15_000,
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
