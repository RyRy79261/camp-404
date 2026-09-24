// Money. Owner's call (2026-09-24): "Everything should be in South African
// rands. I don't want to deal with other currencies other than just being able
// to say what it is." So the camp records and totals money in ZAR only.
// Amounts are whole cents in the ledger; the numeric(12,2) columns
// (reimbursements, team budgets) come through decimalToMinor.
//
// The rules this module holds, so no screen or write path has its own:
// - a currency code is "ZAR" exactly: "zar", " ZAR" or "USD" is refused, never
//   quietly fixed up or converted;
// - money is formatted only by formatMoney, the South African way
//   ("R 1 234,50");
// - a total is a plain sum of cents (sumMinor), so it is a rand total;
// - a foreign amount is a LABEL only (formatForeignEquivalent), worked out
//   from a rate a captain typed. The app never fetches a rate and never stores
//   a foreign amount. Pure.

import { CURRENCY_CODES, type Currency } from "@camp404/types";

export type { Currency };

/** Every currency the camp records money in: rands only. */
export const CURRENCIES = CURRENCY_CODES;

/** The camp's one currency. */
export const DEFAULT_CURRENCY: Currency = "ZAR";

/** The camp's currency code. Strict: case and spaces must match. */
export function isCurrency(value: unknown): value is Currency {
  return (
    typeof value === "string" &&
    (CURRENCIES as readonly string[]).includes(value)
  );
}

/** Thrown by every money write path, and by formatMoney, for any code but ZAR. */
export class UnknownCurrencyError extends Error {
  constructor(readonly currency: unknown) {
    super(
      `Unknown currency ${JSON.stringify(currency)}: the camp records money in ZAR only.`,
    );
    this.name = "UnknownCurrencyError";
  }
}

const rands = new Intl.NumberFormat("en-ZA", {
  style: "currency",
  currency: "ZAR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * Cents as rands, the way a South African reads them: `R 1 234,50` (the
 * spaces are no-break spaces). `currency` is the stored code, when the caller
 * has one: anything but ZAR throws rather than print a foreign amount as
 * rands. Throws too for an amount that is not whole cents.
 */
export function formatMoney(
  amountMinor: number,
  currency: string = DEFAULT_CURRENCY,
): string {
  if (!isCurrency(currency)) throw new UnknownCurrencyError(currency);
  if (!Number.isSafeInteger(amountMinor)) {
    throw new RangeError(
      `formatMoney: ${amountMinor} is not a whole number of cents.`,
    );
  }
  return rands.format(amountMinor / 100);
}

/**
 * Rands a person typed ("1250", "1 250,50", "R1250.5", "ZAR 12,34") as whole
 * cents, or null when it is not an amount. Only "R" or "ZAR" may lead, so a
 * dollar or euro amount is refused rather than read as rands. At most two
 * decimals, never negative.
 */
export function parseMoneyToMinor(input: string): number | null {
  let rest = input.trim();
  const upper = rest.toUpperCase();
  const prefix = ["ZAR", "R"].find((p) => upper.startsWith(p));
  if (prefix) rest = rest.slice(prefix.length);
  // \s covers the no-break spaces Intl writes, so a pasted amount parses.
  const cleaned = rest.replace(/\s/g, "");
  if (!/^\d+([.,]\d{1,2})?$/.test(cleaned)) return null;
  const [whole = "", fraction = ""] = cleaned.replace(",", ".").split(".");
  const minor = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(minor) ? minor : null;
}

/**
 * A numeric(12,2) column's value ("12.34", "999") as cents, or null when it
 * is not a plain non-negative decimal with at most two places.
 */
export function decimalToMinor(amount: string): number | null {
  if (typeof amount !== "string" || !/^\d+(\.\d{1,2})?$/.test(amount)) {
    return null;
  }
  const [whole = "", fraction = ""] = amount.split(".");
  const minor = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(minor) ? minor : null;
}

/**
 * The rand total of some amounts in cents. Each amount must be whole cents
 * before it is added, because two halves can sum to a whole and hide a bad
 * row; the total must stay a safe integer.
 */
export function sumMinor(amounts: readonly number[]): number {
  let total = 0;
  for (const amount of amounts) {
    if (!Number.isSafeInteger(amount)) {
      throw new RangeError("sumMinor: an amount is not whole cents.");
    }
    total += amount;
    if (!Number.isSafeInteger(total)) {
      throw new RangeError("sumMinor: the total is not whole cents.");
    }
  }
  return total;
}

// --- A foreign amount, as a label only -----------------------------------

/** The currencies a rand amount may be LABELLED in. Nothing is stored in them. */
export const FOREIGN_CURRENCIES = ["USD", "EUR"] as const;
export type ForeignCurrency = (typeof FOREIGN_CURRENCIES)[number];

const FOREIGN_SYMBOLS: Readonly<Record<ForeignCurrency, string>> = {
  USD: "US$",
  EUR: "€",
};

// No-break spaces group the thousands, so a label never wraps inside a number.
const NBSP = "\u00a0";

/** A plain number with thousands grouped by no-break spaces and a "." point. */
function grouped(value: number, minDecimals: number, maxDecimals: number) {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: minDecimals,
    maximumFractionDigits: maxDecimals,
    useGrouping: true,
  })
    .format(value)
    .replaceAll(",", NBSP);
}

/** Cents as a short amount: whole units drop the decimals ("6 300"). */
function shortAmount(minor: number): string {
  return minor % 100 === 0
    ? grouped(minor / 100, 0, 0)
    : grouped(minor / 100, 2, 2);
}

const month = new Intl.DateTimeFormat("en-US", {
  month: "short",
  timeZone: "UTC",
});

/** A YYYY-MM-DD calendar date as "24 Sep 2026", or throws when it is not one. */
function rateDay(rateDate: string): string {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(rateDate)
    ? new Date(`${rateDate}T00:00:00.000Z`)
    : null;
  // The UTC round trip refuses a day that does not exist ("2026-02-30").
  if (!date || Number.isNaN(date.getTime())) {
    throw new RangeError(`${JSON.stringify(rateDate)} is not a date.`);
  }
  if (date.toISOString().slice(0, 10) !== rateDate) {
    throw new RangeError(`${JSON.stringify(rateDate)} is not a date.`);
  }
  return `${date.getUTCDate()} ${month.format(date)} ${date.getUTCFullYear()}`;
}

export interface ForeignEquivalentInput {
  /** The rand amount, in cents. */
  amountZarMinor: number;
  /** The currency to say it in. */
  currency: ForeignCurrency;
  /** Rands per one unit of `currency`, as a captain typed it (18 for R18.00). */
  ratePerUnit: number;
  /** The day of that rate, YYYY-MM-DD. */
  rateDate: string;
}

/**
 * A rand amount with what it comes to in dollars or euros, at a rate a captain
 * typed: `R6 300 ≈ US$350 at R18.00 on 24 Sep 2026`. A label only: the rand
 * amount is the money, and the foreign figure is rounded to the cent. The app
 * never fetches a rate. Throws for a currency other than USD or EUR, an amount
 * that is not whole non-negative cents, a rate that is not a positive number,
 * or a date that is not a YYYY-MM-DD day.
 */
export function formatForeignEquivalent(input: ForeignEquivalentInput): string {
  const { amountZarMinor, currency, ratePerUnit, rateDate } = input;
  if (!(FOREIGN_CURRENCIES as readonly string[]).includes(currency)) {
    throw new UnknownCurrencyError(currency);
  }
  if (!Number.isSafeInteger(amountZarMinor) || amountZarMinor < 0) {
    throw new RangeError(
      `formatForeignEquivalent: ${amountZarMinor} is not whole cents.`,
    );
  }
  if (!Number.isFinite(ratePerUnit) || ratePerUnit <= 0) {
    throw new RangeError(
      `formatForeignEquivalent: the rate ${ratePerUnit} is not a positive number.`,
    );
  }
  const foreignMinor = Math.round(amountZarMinor / ratePerUnit);
  const rate = grouped(ratePerUnit, 2, 4);
  return (
    `R${shortAmount(amountZarMinor)} ≈ ` +
    `${FOREIGN_SYMBOLS[currency]}${shortAmount(foreignMinor)} ` +
    `at R${rate} on ${rateDay(rateDate)}`
  );
}
