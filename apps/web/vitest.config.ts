import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    include: ["**/*.test.{ts,tsx}"],
    setupFiles: ["./tests/vitest-setup.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
      // `import "server-only"` throws outside a React Server Component, which
      // would make every module under lib/ that guards itself untestable.
      // Point it at the package's own empty build — the same file Next resolves
      // under the `react-server` condition — so the guard is inert under vitest
      // without each test file having to `vi.mock("server-only", …)`.
      "server-only": path.resolve(
        __dirname,
        "node_modules/server-only/empty.js",
      ),
    },
  },
});
