import { describe, it, expect } from "vitest";
import { meetsRequiredVersion } from "@camp404/db/versions";

describe("meetsRequiredVersion", () => {
  it("treats an equal version as satisfying", () => {
    expect(meetsRequiredVersion("2026.05.29-v8", "2026.05.29-v8")).toBe(true);
  });

  it("treats a newer numeric suffix as satisfying", () => {
    expect(meetsRequiredVersion("2026.05.29-v8", "2026.05.29-v9")).toBe(true);
  });

  it("does NOT let an older completion satisfy (v9 does not meet v10)", () => {
    // The lexicographic bug: "v9" sorts after "v10" as a string, but 9 < 10.
    expect(meetsRequiredVersion("2026.05.29-v10", "2026.05.29-v9")).toBe(false);
  });

  it("treats v10 as satisfying v9", () => {
    expect(meetsRequiredVersion("2026.05.29-v9", "2026.05.29-v10")).toBe(true);
  });

  it("falls back to string comparison across different bases", () => {
    expect(meetsRequiredVersion("2026.05.29-v1", "2026.06.01-v1")).toBe(true);
    expect(meetsRequiredVersion("2026.06.01-v1", "2026.05.29-v1")).toBe(false);
  });
});
