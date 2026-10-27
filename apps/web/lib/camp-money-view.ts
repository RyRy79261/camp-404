import {
  addMonthsToDay,
  type CampForecast,
  type ForecastLine,
} from "@camp404/core";
import type { CampBillInput, CampBillRepeat } from "@camp404/types";

// Camp money's rows, in the words the approved mock-up (step 1, Option B)
// uses, from the forecast @camp404/core works out. Pure, and safe in a
// browser: the page builds them on the server and the table draws them.

const SHORT_DAY = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

/** A YYYY-MM-DD day as "15 Nov". */
export function shortDay(day: string): string {
  const date = new Date(`${day}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? day : SHORT_DAY.format(date);
}

/** A bill as its edit form needs it back. */
export interface BillForEdit extends CampBillInput {
  id: string;
  version: number;
  paidCount: number;
}

/** A bill as the camp money read hands it over. */
export interface BillLike {
  id: string;
  name: string;
  payee: string | null;
  amountCents: number;
  dueOn: string;
  repeat: CampBillRepeat;
  times: number;
  paidCount: number;
  paidOn: string | null;
  planned: boolean;
  version: number;
}

export function billForEdit(bill: BillLike): BillForEdit {
  return {
    id: bill.id,
    version: bill.version,
    paidCount: bill.paidCount,
    name: bill.name,
    payee: bill.payee,
    amountCents: bill.amountCents,
    dueOn: bill.dueOn,
    repeat: bill.repeat,
    times: bill.times,
    planned: bill.planned,
  };
}

/** One row of "Date by date". */
export interface MoneyLineRow {
  key: string;
  /** "15 Nov", "No date" or "—". */
  day: string;
  name: string;
  /** The muted words after the name. */
  detail: string | null;
  planned: boolean;
  /** Signed: money out is below zero. */
  amountCents: number;
  moneyAfterCents: number;
  /** A fee line (money in). */
  incoming: boolean;
  /** The largest bill still due: its row is marked, as the mock-up's. */
  highlight: boolean;
  /**
   * The bill this row is a payment of, and whether it is the bill's next
   * payment (only that one can be marked paid).
   */
  bill: { edit: BillForEdit; next: boolean } | null;
}

/** "Lerato, Sam and Thabo", or "4 members" past three names. */
function people(list: readonly { name: string }[]): string {
  if (list.length > 3) return `${list.length} members`;
  if (list.length <= 1) return list[0]?.name ?? "";
  return `${list
    .slice(0, -1)
    .map((p) => p.name)
    .join(", ")} and ${list.at(-1)!.name}`;
}

/** The largest bill payment still due: "the next big bill". */
export function nextBigBill(
  forecast: CampForecast,
): Extract<ForecastLine, { kind: "bill" }> | null {
  let best: Extract<ForecastLine, { kind: "bill" }> | null = null;
  for (const line of forecast.lines) {
    if (line.kind !== "bill") continue;
    if (!best || -line.amountCents > -best.amountCents) best = line;
  }
  return best;
}

/** The forecast's lines as "Date by date" rows (Still due). */
export function forecastRows(
  forecast: CampForecast,
  bills: readonly BillLike[],
): MoneyLineRow[] {
  const byId = new Map(bills.map((b) => [b.id, b]));
  const big = nextBigBill(forecast);
  // A monthly bill says "monthly · payee" on its first row only.
  const seen = new Set<string>();
  return forecast.lines.map((line, i): MoneyLineRow => {
    const base = {
      key: `${line.kind}-${i}`,
      amountCents: line.amountCents,
      moneyAfterCents: line.moneyAfterCents,
      planned: false,
      highlight: false,
      bill: null,
    };
    switch (line.kind) {
      case "bill": {
        const bill = byId.get(line.billId);
        const first = !seen.has(line.billId);
        seen.add(line.billId);
        const detail = line.monthly
          ? first
            ? ["monthly", line.payee].filter(Boolean).join(" · ")
            : line.leftAfter === 0
              ? "last one"
              : null
          : line.payee;
        return {
          ...base,
          key: `bill-${line.billId}-${line.index}`,
          day: shortDay(line.dueOn),
          name: line.name,
          detail,
          planned: line.planned,
          incoming: false,
          highlight:
            big !== null &&
            big.billId === line.billId &&
            big.index === line.index,
          bill: bill
            ? { edit: billForEdit(bill), next: line.index === bill.paidCount }
            : null,
        };
      }
      case "fees":
        return {
          ...base,
          day: shortDay(line.dueOn),
          name: "Fees due",
          detail: people(line.people),
          incoming: true,
        };
      case "fees_no_date":
        return {
          ...base,
          day: "No date",
          name: "Fees with no date yet",
          detail: people(line.people),
          incoming: true,
        };
      case "budgets":
        return {
          ...base,
          day: "—",
          name: "Team budgets not spent",
          detail: null,
          incoming: false,
        };
    }
  });
}

/** One bill payment already made (Paid). */
export interface PaidLineRow {
  key: string;
  day: string;
  name: string;
  payee: string | null;
  amountCents: number;
  /** The day it was paid, for the latest payment of a bill. */
  paidOn: string | null;
}

/** Every payment of every bill marked paid, the latest first. */
export function paidRows(bills: readonly BillLike[]): PaidLineRow[] {
  const rows: (PaidLineRow & { sort: string })[] = [];
  for (const bill of bills) {
    for (let i = 0; i < bill.paidCount; i++) {
      const due =
        bill.repeat === "monthly" ? addMonthsToDay(bill.dueOn, i) : bill.dueOn;
      rows.push({
        key: `${bill.id}-${i}`,
        day: shortDay(due),
        name: bill.name,
        payee: bill.payee,
        amountCents: bill.amountCents,
        paidOn: i === bill.paidCount - 1 ? bill.paidOn : null,
        sort: due,
      });
    }
  }
  return rows
    .sort((a, b) => b.sort.localeCompare(a.sort))
    .map(({ sort: _sort, ...row }) => row);
}

/** How many payments of the bills are marked paid. */
export function paidCount(bills: readonly BillLike[]): number {
  return bills.reduce((n, b) => n + b.paidCount, 0);
}
