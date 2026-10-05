import { describe, expect, it } from "vitest";
import { Currency, CURRENCY_CODES } from "../money";

// Money is in rands only (owner's call, 2026-09-24). The Zod boundary every
// money write path parses through refuses any other code. Amounts are made up.

describe("Currency", () => {
  it("is ZAR alone", () => {
    expect([...CURRENCY_CODES]).toEqual(["ZAR"]);
    expect(Currency.parse("ZAR")).toBe("ZAR");
  });

  it("refuses dollars, euros and a misspelt code, and says why", () => {
    for (const bad of ["USD", "EUR", "GBP", "zar", " ZAR", ""]) {
      const result = Currency.safeParse(bad);
      expect(result.success, bad).toBe(false);
      expect(result.error?.issues[0]?.message).toBe(
        "Money is recorded in rands (ZAR) only.",
      );
    }
  });
});
