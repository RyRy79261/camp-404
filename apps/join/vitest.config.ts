import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    include: ["**/*.test.{ts,tsx}"],
    exclude: ["**/node_modules/**", "**/.next/**"],
    coverage: {
      provider: "v8",
      include: ["{lib,app,components}/**/*.{ts,tsx}"],
      exclude: ["**/*.test.{ts,tsx}"],
      reporter: ["text-summary", "json-summary"],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
