import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/__tests__/**/*.test.ts"],
    // Each integration file boots its own in-process PGlite and injects it via
    // __setDbOverride. Vitest isolates files in separate module registries, so
    // that module-global override never leaks across files. Within a file tests
    // run serially and truncate between each (see _harness.ts).
    //
    // Booting PGlite + replaying every committed migration in beforeAll is the
    // cold cost; under concurrent CI load (turbo runs other suites alongside) it
    // can exceed vitest's default 10s hook timeout. Give the lifecycle hooks and
    // per-test work generous headroom — a genuinely stuck case still fails, just
    // later. The migration replay happens once per file, not per test.
    hookTimeout: 60_000,
    testTimeout: 30_000,
  },
});
