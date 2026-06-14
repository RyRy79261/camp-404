import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// Two kinds of tests live here: pure store/helper logic (toast, cn) and — since
// the jsdom/RTL harness was added — rendered component tests (*.test.tsx). jsdom
// is a superset of node for the logic tests, so both run under one config. The
// setup file stubs the jsdom gaps the Radix-based leaf components reach for.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    include: ["src/**/__tests__/**/*.test.{ts,tsx}"],
    setupFiles: ["./vitest.setup.ts"],
  },
});
