import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// The window engine's pure rules (window-manager, the terminal's engine) and
// its rendered parts (the window frame's Esc rule against a real Radix
// Select), under one jsdom config. The setup file stubs the jsdom gaps Radix
// reaches for.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}"],
    setupFiles: ["./vitest.setup.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/**/*.test.{ts,tsx}"],
      reporter: ["text-summary", "json-summary"],
      // Measured on 2026-09-26 minus 3 points, as apps/web does.
      thresholds: { statements: 57, branches: 58, functions: 54, lines: 57 },
    },
  },
});
