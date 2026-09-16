import { describe, expect, it } from "vitest";
import { readRate } from "../read-rate";

describe("readRate", () => {
  it("counts who has seen it, as a whole percent", () => {
    expect(readRate(5, 42)).toEqual({ read: 5, of: 42, percent: 12 });
  });

  it("never shows more than everyone, or fewer than no one", () => {
    expect(readRate(50, 42)).toEqual({ read: 42, of: 42, percent: 100 });
    expect(readRate(-3, 42)).toEqual({ read: 0, of: 42, percent: 0 });
  });

  it("is 0% with no recipients", () => {
    expect(readRate(0, 0)).toEqual({ read: 0, of: 0, percent: 0 });
  });
});
