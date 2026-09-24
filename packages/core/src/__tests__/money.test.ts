import { describe, expect, it } from "vitest";
import {
  CURRENCIES,
  DEFAULT_CURRENCY,
  decimalToMinor,
  FOREIGN_CURRENCIES,
  formatForeignEquivalent,
  formatMoney,
  isCurrency,
  parseMoneyToMinor,
  sumMinor,
  UnknownCurrencyError,
} from "../money";

// Money is in rands only: one currency, one formatter, plain rand totals, and
// a foreign amount only as a label. Amounts here are made up.

// Intl puts a no-break space (or a narrow one) where a person sees a space.
const S = "[\\s\\u00a0\\u202f]";
const money = (pattern: string) =>
  new RegExp(`^${pattern.replaceAll(" ", `${S}?`)}$`);

describe("the currency list", () => {
  it("is ZAR alone, and ZAR is the default", () => {
    expect([...CURRENCIES]).toEqual(["ZAR"]);
    expect(DEFAULT_CURRENCY).toBe("ZAR");
  });

  it("accepts only the exact code", () => {
    expect(isCurrency("ZAR")).toBe(true);
    for (const bad of [
      "USD",
      "EUR",
      "GBP",
      "zar",
      " ZAR",
      "ZAR ",
      "",
      null,
      1,
    ]) {
      expect(isCurrency(bad)).toBe(false);
    }
  });
});

describe("formatMoney", () => {
  it("formats rands the South African way", () => {
    expect(formatMoney(123450)).toMatch(money("R 1 234,50"));
    expect(formatMoney(1234, "ZAR")).toMatch(money("R 12,34"));
    expect(formatMoney(0)).toMatch(money("R 0,00"));
  });

  it("refuses to print another currency's amount as rands", () => {
    for (const code of ["USD", "EUR", "GBP", "zar"]) {
      expect(() => formatMoney(999, code)).toThrow(UnknownCurrencyError);
    }
  });

  it("refuses an amount that is not whole cents", () => {
    expect(() => formatMoney(12.5)).toThrow(RangeError);
    expect(() => formatMoney(Number.NaN)).toThrow(RangeError);
  });
});

describe("parseMoneyToMinor", () => {
  it("reads rands the way a captain types them", () => {
    expect(parseMoneyToMinor("1250")).toBe(125000);
    expect(parseMoneyToMinor("1 250,5")).toBe(125050);
    expect(parseMoneyToMinor("1\u00a0250,50")).toBe(125050);
    expect(parseMoneyToMinor("R\u202f12,34")).toBe(1234);
    expect(parseMoneyToMinor("R1250.05")).toBe(125005);
    expect(parseMoneyToMinor("ZAR 12,34")).toBe(1234);
    expect(parseMoneyToMinor("0")).toBe(0);
  });

  it("refuses a dollar or euro amount rather than read it as rands", () => {
    for (const foreign of ["US$12", "$12", "USD 12", "€12", "EUR 12"]) {
      expect(parseMoneyToMinor(foreign)).toBeNull();
    }
  });

  it("refuses what is not an amount", () => {
    for (const bad of [
      "",
      "-5",
      "12.345",
      "ten",
      "1,2,3",
      "R",
      "9".repeat(20),
    ]) {
      expect(parseMoneyToMinor(bad)).toBeNull();
    }
  });
});

describe("decimalToMinor", () => {
  it("reads a numeric(12,2) value", () => {
    expect(decimalToMinor("12.34")).toBe(1234);
    expect(decimalToMinor("999")).toBe(99900);
    expect(decimalToMinor("5.5")).toBe(550);
  });

  it("refuses anything else", () => {
    for (const bad of ["", "-5.00", "1,50", "12.345", "abc"]) {
      expect(decimalToMinor(bad)).toBeNull();
    }
  });
});

describe("sumMinor", () => {
  it("adds cents into one rand total", () => {
    expect(sumMinor([1234, 99900, 500])).toBe(101634);
    expect(sumMinor([])).toBe(0);
  });

  it("refuses a fractional amount even when the total comes out whole", () => {
    expect(() => sumMinor([0.5, 0.5])).toThrow(RangeError);
  });

  it("refuses a total that is no longer a safe integer", () => {
    expect(() => sumMinor([Number.MAX_SAFE_INTEGER, 1])).toThrow(RangeError);
  });
});

describe("formatForeignEquivalent", () => {
  // Numbers are grouped with no-break spaces, so the label never wraps
  // inside an amount; `plain` swaps them for spaces to compare.
  const plain = (s: string) => s.replaceAll("\u00a0", " ");

  it("says a rand amount in dollars at the rate and day a captain typed", () => {
    expect(
      plain(
        formatForeignEquivalent({
          amountZarMinor: 630000,
          currency: "USD",
          ratePerUnit: 18,
          rateDate: "2026-09-24",
        }),
      ),
    ).toBe("R6 300 ≈ US$350 at R18.00 on 24 Sep 2026");
  });

  it("keeps the numbers together with no-break spaces", () => {
    expect(
      formatForeignEquivalent({
        amountZarMinor: 630000,
        currency: "USD",
        ratePerUnit: 18,
        rateDate: "2026-09-24",
      }),
    ).toContain("R6\u00a0300 ");
  });

  it("says it in euros, and shows cents only when there are some", () => {
    expect(
      plain(
        formatForeignEquivalent({
          amountZarMinor: 123450,
          currency: "EUR",
          ratePerUnit: 20.5,
          rateDate: "2026-01-05",
        }),
      ),
    ).toBe("R1 234.50 ≈ €60.22 at R20.50 on 5 Jan 2026");
  });

  it("rounds the foreign figure to the cent and keeps a rate's own precision", () => {
    expect(
      plain(
        formatForeignEquivalent({
          amountZarMinor: 100000,
          currency: "USD",
          ratePerUnit: 17.8325,
          rateDate: "2026-12-31",
        }),
      ),
    ).toBe("R1 000 ≈ US$56.08 at R17.8325 on 31 Dec 2026");
  });

  it("labels only USD and EUR", () => {
    expect([...FOREIGN_CURRENCIES]).toEqual(["USD", "EUR"]);
    for (const currency of ["ZAR", "GBP", "usd"]) {
      expect(() =>
        formatForeignEquivalent({
          amountZarMinor: 999,
          currency: currency as never,
          ratePerUnit: 18,
          rateDate: "2026-09-24",
        }),
      ).toThrow(UnknownCurrencyError);
    }
  });

  it("refuses an amount, rate or day it cannot label honestly", () => {
    const ok = {
      amountZarMinor: 999,
      currency: "USD" as const,
      ratePerUnit: 18,
      rateDate: "2026-09-24",
    };
    for (const amountZarMinor of [-1, 12.5, Number.NaN]) {
      expect(() => formatForeignEquivalent({ ...ok, amountZarMinor })).toThrow(
        RangeError,
      );
    }
    for (const ratePerUnit of [0, -18, Number.NaN, Infinity]) {
      expect(() => formatForeignEquivalent({ ...ok, ratePerUnit })).toThrow(
        RangeError,
      );
    }
    for (const rateDate of ["2026-02-30", "24 Sep 2026", "2026-9-24", ""]) {
      expect(() => formatForeignEquivalent({ ...ok, rateDate })).toThrow(
        RangeError,
      );
    }
  });
});
