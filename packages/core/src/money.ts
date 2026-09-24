// Money (#237). Members pay from several countries, so every amount the camp
// keeps says its currency, and the app only ever handles ZAR, USD and EUR.
// Amounts are whole minor units (cents) in the ledger; the numeric(12,2)
// columns (reimbursements, team budgets) come through decimalToMinor.
//
// The rules this module holds, so no screen or write path has its own:
// - a code is one of CURRENCIES exactly: "zar" or " ZAR" is refused, never
//   quietly fixed up;
// - money is formatted only by formatMoney, the South African way
//   ("R 1 234,50", "US$12,34", "€12,34");
// - totals are one per currency (sumByCurrency). No FX: amounts in different
//   currencies are never added together. Pure.

import { CURRENCY_CODES, type Currency } from "@camp404/types";

export type { Currency };

/** Every currency the camp handles, ZAR first. */
export const CURRENCIES = CURRENCY_CODES;

/** The camp's home currency: what an amount is in when nobody says. */
export const DEFAULT_CURRENCY: Currency = "ZAR";

export interface CurrencyInfo {
  /** What a person types or reads in front of the amount. */
  symbol: string;
  /** Minor units per major unit, as a power of ten. */
  decimals: 2;
  name: string;
}

export const CURRENCY_INFO: Readonly<Record<Currency, CurrencyInfo>> = {
  ZAR: { symbol: "R", decimals: 2, name: "South African rand" },
  USD: { symbol: "US$", decimals: 2, name: "US dollar" },
  EUR: { symbol: "€", decimals: 2, name: "Euro" },
};

/** A currency code the camp handles. Strict: case and spaces must match. */
export function isCurrency(value: unknown): value is Currency {
  return (
    typeof value === "string" &&
    (CURRENCIES as readonly string[]).includes(value)
  );
}

/** Thrown by every money write path, and by formatMoney, for a code not in CURRENCIES. */
export class UnknownCurrencyError extends Error {
  constructor(readonly currency: unknown) {
    super(
      `Unknown currency ${JSON.stringify(currency)}: must be ${CURRENCIES.join(", ")}.`,
    );
    this.name = "UnknownCurrencyError";
  }
}

const formatters = new Map<Currency, Intl.NumberFormat>();

function formatterFor(currency: Currency): Intl.NumberFormat {
  let formatter = formatters.get(currency);
  if (!formatter) {
    formatter = new Intl.NumberFormat("en-ZA", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    formatters.set(currency, formatter);
  }
  return formatter;
}

/**
 * Minor units as money, the way a South African reads it: `R 1 234,50`,
 * `US$12,34`, `€12,34` (the spaces are no-break spaces). Throws for a currency
 * the camp does not handle, and for an amount that is not whole minor units.
 */
export function formatMoney(amountMinor: number, currency: string): string {
  if (!isCurrency(currency)) throw new UnknownCurrencyError(currency);
  if (!Number.isSafeInteger(amountMinor)) {
    throw new RangeError(
      `formatMoney: ${amountMinor} is not a whole number of minor units.`,
    );
  }
  return formatterFor(currency).format(amountMinor / 100);
}

/** What may stand in front of a typed amount, longest first. */
const PREFIXES: Readonly<Record<Currency, readonly string[]>> = {
  ZAR: ["ZAR", "R"],
  USD: ["USD", "US$", "$"],
  EUR: ["EUR", "€"],
};

/**
 * An amount a person typed ("1250", "1 250,50", "R1250.5", "US$ 12,34") as
 * whole minor units of `currency`, or null when it is not one. Only that
 * currency's own symbol or code may lead. At most two decimals, never
 * negative.
 */
export function parseMoneyToMinor(
  input: string,
  currency: Currency,
): number | null {
  if (!isCurrency(currency)) return null;
  let rest = input.trim();
  const upper = rest.toUpperCase();
  const prefix = PREFIXES[currency].find((p) => upper.startsWith(p));
  if (prefix) rest = rest.slice(prefix.length);
  // \s covers the no-break spaces Intl writes, so a pasted amount parses.
  const cleaned = rest.replace(/\s/g, "");
  if (!/^\d+([.,]\d{1,2})?$/.test(cleaned)) return null;
  const [whole = "", fraction = ""] = cleaned.replace(",", ".").split(".");
  const minor = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(minor) ? minor : null;
}

/**
 * A numeric(12,2) column's value ("12.34", "999") as minor units, or null
 * when it is not a plain non-negative decimal with at most two places.
 */
export function decimalToMinor(amount: string): number | null {
  if (typeof amount !== "string" || !/^\d+(\.\d{1,2})?$/.test(amount)) {
    return null;
  }
  const [whole = "", fraction = ""] = amount.split(".");
  const minor = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(minor) ? minor : null;
}

export interface MoneyTotal {
  currency: Currency;
  amountMinor: number;
}

/**
 * One total per currency, in CURRENCIES order, only for the currencies
 * present. Never adds across currencies. Throws for an unknown code.
 */
export function sumByCurrency(
  rows: readonly { amountMinor: number; currency: string }[],
): MoneyTotal[] {
  const totals = new Map<Currency, number>();
  for (const row of rows) {
    if (!isCurrency(row.currency)) throw new UnknownCurrencyError(row.currency);
    // Checked per row as well as on the total, so the error names the amount.
    if (!Number.isSafeInteger(row.amountMinor)) {
      throw new RangeError(
        "sumByCurrency: an amount is not whole minor units.",
      );
    }
    const sum = (totals.get(row.currency) ?? 0) + row.amountMinor;
    if (!Number.isSafeInteger(sum)) {
      throw new RangeError(
        "sumByCurrency: the total is not whole minor units.",
      );
    }
    totals.set(row.currency, sum);
  }
  return CURRENCIES.filter((c) => totals.has(c)).map((currency) => ({
    currency,
    amountMinor: totals.get(currency)!,
  }));
}

/** Totals for a screen: `R 12,34 · US$5,00`, or `R 0,00` when there are none. */
export function formatMoneyTotals(totals: readonly MoneyTotal[]): string {
  if (totals.length === 0) return formatMoney(0, DEFAULT_CURRENCY);
  return totals.map((t) => formatMoney(t.amountMinor, t.currency)).join(" · ");
}
