import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": new URL("./", import.meta.url).pathname } },
  // The pets package holds a .tsx component; the tsconfig keeps JSX for Next.
  esbuild: { jsx: "automatic" },
  test: {
    include: ["**/*.test.{ts,tsx}"],
    exclude: ["node_modules/**", "tests/e2e/**", ".next/**"],
    coverage: {
      provider: "v8",
      include: ["lib/**/*.ts"],
      exclude: ["**/*.test.ts"],
      reporter: ["text-summary", "json-summary"],
    },
  },
});
