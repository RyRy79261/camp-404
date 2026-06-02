import { describe, expect, it } from "vitest";

import { CORE_PACKAGE } from "../index";

describe("@camp404/core scaffold", () => {
  it("is wired and importable", () => {
    expect(CORE_PACKAGE).toBe("@camp404/core");
  });
});
