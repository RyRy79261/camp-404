import { describe, expect, it } from "vitest";
import {
  CURRENCIES,
  CURRENCY_INFO,
  DEFAULT_CURRENCY,
  decimalToMinor,
  formatMoney,
  formatMoneyTotals,
  isCurrency,
  parseMoneyToMinor,
  sumByCurrency,
  UnknownCurrencyError,
} from "../money";

// The one currency list, the one money formatter, and totals that never mix
// currencies. Amounts here are made up.

// Intl puts a no-break space (or a narrow one) where a person sees a space.
const S = "[\\s\\u00a0\\u202f]";
const money = (pattern: string) =>
  new RegExp(`^${pattern.replaceAll(" ", `${S}?`)}$`);

describe("the currency list", () => {
  it("is ZAR, USD and EUR, with ZAR the default", () => {
    expect([...CURRENCIES]).toEqual(["ZAR", "USD", "EUR"]);
    expect(DEFAULT_CURRENCY).toBe("ZAR");
    expect(CURRENCY_INFO.ZAR.symbol).toBe("R");
    expect(CURRENCY_INFO.USD.symbol).toBe("US$");
    expect(CURRENCY_INFO.EUR.symbol).toBe("€");
    for (const c of CURRENCIES) expect(CURRENCY_INFO[c].decimals).toBe(2);
  });

  it("accepts only the exact codes", () => {
    for (const c of ["ZAR", "USD", "EUR"]) expect(isCurrency(c)).toBe(true);
    for (const bad of ["GBP", "zar", " ZAR", "ZAR ", "Usd", "", null, 1]) {
      expect(isCurrency(bad)).toBe(false);
    }
  });
});

describe("formatMoney", () => {
  it("formats each currency the South African way", () => {
    expect(formatMoney(123450, "ZAR")).toMatch(money("R 1 234,50"));
    expect(formatMoney(1234, "USD")).toMatch(money("US\\$12,34"));
    expect(formatMoney(1234, "EUR")).toMatch(money("€12,34"));
    expect(formatMoney(0, "ZAR")).toMatch(money("R 0,00"));
  });

  it("refuses an unknown or lower-case code", () => {
    expect(() => formatMoney(999, "GBP")).toThrow(UnknownCurrencyError);
    expect(() => formatMoney(999, "zar")).toThrow(UnknownCurrencyError);
  });

  it("refuses an amount that is not whole minor units", () => {
    expect(() => formatMoney(12.5, "ZAR")).toThrow(RangeError);
    expect(() => formatMoney(Number.NaN, "ZAR")).toThrow(RangeError);
  });
});

describe("parseMoneyToMinor", () => {
  it("reads rands the way a captain types them", () => {
    expect(parseMoneyToMinor("1250", "ZAR")).toBe(125000);
    expect(parseMoneyToMinor("1 250,5", "ZAR")).toBe(125050);
    expect(parseMoneyToMinor("1\u00a0250,50", "ZAR")).toBe(125050);
    expect(parseMoneyToMinor("R\u202f12,34", "ZAR")).toBe(1234);
    expect(parseMoneyToMinor("R1250.05", "ZAR")).toBe(125005);
    expect(parseMoneyToMinor("ZAR 12,34", "ZAR")).toBe(1234);
    expect(parseMoneyToMinor("0", "ZAR")).toBe(0);
  });

  it("reads dollars and euros with their own symbol or code", () => {
    expect(parseMoneyToMinor("US$12,34", "USD")).toBe(1234);
    expect(parseMoneyToMinor("$ 999", "USD")).toBe(99900);
    expect(parseMoneyToMinor("USD 5.00", "USD")).toBe(500);
    expect(parseMoneyToMinor("€12,34", "EUR")).toBe(1234);
    expect(parseMoneyToMinor("EUR 5", "EUR")).toBe(500);
  });

  it("refuses another currency's symbol", () => {
    expect(parseMoneyToMinor("€12", "ZAR")).toBeNull();
    expect(parseMoneyToMinor("R12", "USD")).toBeNull();
    expect(parseMoneyToMinor("US$12", "EUR")).toBeNull();
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
      expect(parseMoneyToMinor(bad, "ZAR")).toBeNull();
    }
  });

  it("refuses a currency the camp does not handle", () => {
    expect(parseMoneyToMinor("12", "GBP" as never)).toBeNull();
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

describe("sumByCurrency", () => {
  it("keeps ZAR and USD apart, in the list's order", () => {
    expect(
      sumByCurrency([
        { amountMinor: 500, currency: "USD" },
        { amountMinor: 1234, currency: "ZAR" },
        { amountMinor: 99900, currency: "ZAR" },
      ]),
    ).toEqual([
      { currency: "ZAR", amountMinor: 101134 },
      { currency: "USD", amountMinor: 500 },
    ]);
    expect(sumByCurrency([])).toEqual([]);
  });

  it("refuses a fractional amount even when the total comes out whole", () => {
    expect(() =>
      sumByCurrency([
        { amountMinor: 0.5, currency: "ZAR" },
        { amountMinor: 0.5, currency: "ZAR" },
      ]),
    ).toThrow(RangeError);
  });

  it("throws on an unknown code rather than drop or mix it", () => {
    expect(() =>
      sumByCurrency([
        { amountMinor: 500, currency: "ZAR" },
        { amountMinor: 500, currency: "GBP" },
      ]),
    ).toThrow(UnknownCurrencyError);
  });
});

describe("formatMoneyTotals", () => {
  it("joins one figure per currency, or shows nothing owed as R 0,00", () => {
    expect(
      formatMoneyTotals([
        { currency: "ZAR", amountMinor: 1234 },
        { currency: "USD", amountMinor: 500 },
      ]),
    ).toMatch(money("R 12,34 · US\\$5,00"));
    expect(formatMoneyTotals([])).toMatch(money("R 0,00"));
  });
});
