import { describe, expect, it } from "vitest";
import { meetsRequiredVersion, nextBuilderVersion } from "../versions";

// Pure unit tests — no DB harness needed.
describe("nextBuilderVersion", () => {
  it("mints <key>-v1 on the first publish", () => {
    expect(nextBuilderVersion("feedback", null)).toBe("feedback-v1");
  });

  it("bumps the counter on each breaking publish", () => {
    expect(nextBuilderVersion("feedback", "feedback-v1")).toBe("feedback-v2");
    expect(nextBuilderVersion("feedback", "feedback-v9")).toBe("feedback-v10");
  });

  it("stays monotonic past v9 under meetsRequiredVersion (the numeric path)", () => {
    const v9 = nextBuilderVersion("feedback", "feedback-v8");
    const v10 = nextBuilderVersion("feedback", v9);
    expect(v9).toBe("feedback-v9");
    expect(v10).toBe("feedback-v10");
    // a v10 completion satisfies a v9 requirement; a v9 completion does not satisfy v10
    expect(meetsRequiredVersion("feedback-v9", "feedback-v10")).toBe(true);
    expect(meetsRequiredVersion("feedback-v10", "feedback-v9")).toBe(false);
  });

  it("falls back to <key>-v1 for a non-conforming latest", () => {
    expect(nextBuilderVersion("feedback", "garbage")).toBe("feedback-v1");
  });

  it("keys with hyphens still parse to a clean counter", () => {
    expect(nextBuilderVersion("camp-feedback-2", "camp-feedback-2-v3")).toBe(
      "camp-feedback-2-v4",
    );
  });
});
