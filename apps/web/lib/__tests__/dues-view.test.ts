import { describe, expect, it } from "vitest";
import { parseMoneyToMinor } from "@camp404/core";
import { typedRands } from "../dues-view";

describe("typedRands", () => {
  it("writes cents back the way a member types rands, with a comma", () => {
    expect(typedRands(125000)).toBe("1250");
    expect(typedRands(125050)).toBe("1250,50");
    expect(typedRands(125005)).toBe("1250,05");
  });

  it("round-trips through the parser the forms use", () => {
    for (const cents of [1, 99, 100, 125050, 999999]) {
      expect(parseMoneyToMinor(typedRands(cents))).toBe(cents);
    }
  });
});
