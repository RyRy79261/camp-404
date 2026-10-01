import {
  ViewerRank,
  type ChargeKind,
  type PaymentMethod,
  type PaymentSource,
  type RefundStatus,
} from "@camp404/types";
import { isCurrency, sumMinor, UnknownCurrencyError } from "./money";
import type { PaymentStatus } from "./payment-references";

// Dues (#240): who may keep the camp's money, a member's balance, the
// settle-up split, the refund schedule and the bank statement import. Pure: no
// DB, no session, no next/*.
//
// WHO MAY KEEP THE MONEY. Clearance stays global (AGENTS.md): a lead of ANY
// team stands on the `team_lead` rung everywhere. Team identity decides only
// who works in the Finance tools: a captain, or a lead of the Finance team.
// Nobody else reads another member's dues, not even a lead of another team.
// It fails closed on a rank this module does not know. Each write re-reads the
// actor's rank and led teams inside its own transaction and passes those here;
// it never takes a team list from the caller.
//
// MONEY. Whole rand cents, ZAR only (packages/core/src/money.ts). A balance is
// a plain rand total: any row in another currency throws rather than be added
// in as rands.

/** The team whose leads keep the camp's money with the captains. */
export const FINANCE_TEAM = "finance";

function isViewerRank(rank: string): rank is ViewerRank {
  return ViewerRank.safeParse(rank).success;
}

/**
 * Whether someone may work in the Finance tools (dues, payments, refunds,
 * the statement import and the settle-up), and read every member's dues: a
 * captain, or a lead of Finance. `ledTeams` are the team keys they lead this
 * year.
 */
export function canManageMoney(
  rank: string,
  ledTeams: readonly string[],
): boolean {
  if (!isViewerRank(rank)) return false;
  if (rank === "captain") return true;
  if (rank === "team_lead") return ledTeams.includes(FINANCE_TEAM);
  return false;
}

// --- Words -------------------------------------------------------------------

export const CHARGE_KIND_LABELS: Readonly<Record<ChargeKind, string>> = {
  fee: "Camp fee",
  rental: "Rental",
  settle_up: "Settle-up",
  other: "Other",
};

export const PAYMENT_METHOD_LABELS: Readonly<Record<PaymentMethod, string>> = {
  bank_transfer: "Bank transfer",
  international_transfer: "International transfer",
  cash: "Cash",
  other: "Other",
};

export const REFUND_STATUS_LABELS: Readonly<Record<RefundStatus, string>> = {
  requested: "Refund asked for",
  refunded: "Refunded",
  declined: "Refund declined",
};

/** The only moves a refund can make. Refunded and declined are final. */
export const REFUND_MOVES: Readonly<
  Record<RefundStatus, readonly RefundStatus[]>
> = {
  requested: ["refunded", "declined"],
  refunded: [],
  declined: [],
};

// --- Balance -----------------------------------------------------------------

export interface BalanceCharge {
  /** Cents; a settle-up refund is negative (money back to the member). */
  amountCents: number;
  currency: string;
}

export interface BalancePayment {
  amountCents: number;
  currency: string;
  status: PaymentStatus;
}

export interface BalanceRefund {
  /** The amount paid back; only a `refunded` refund has one that counts. */
  amountCents: number | null;
  currency: string;
  status: RefundStatus;
}

export interface DuesBalance {
  /** Everything charged this year (live charges only). */
  chargedCents: number;
  /** Payments received or waived: they settle what is owed. */
  paidCents: number;
  /** Payments the member says they made, not seen in the bank yet. */
  pendingCents: number;
  /** Money paid back to the member. */
  refundedCents: number;
  /** What the member still owes; below zero, the camp owes them. */
  balanceCents: number;
}

function inRands(currency: string): void {
  if (!isCurrency(currency)) throw new UnknownCurrencyError(currency);
}

/**
 * The year's payments in the Finance team's words, kept apart so no figure
 * means two things: money seen in the bank, dues excused (waived: settles what
 * is owed, brings nothing in), proofs a member sent in waiting to be checked,
 * and payments recorded by hand as promised but not in the bank yet.
 */
export interface PaymentFigures {
  inBankCents: number;
  excusedCents: number;
  toCheckCents: number;
  toCheckCount: number;
  promisedCents: number;
  promisedCount: number;
}

export function paymentFigures(
  payments: readonly {
    amountCents: number;
    status: PaymentStatus;
    source: PaymentSource;
  }[],
): PaymentFigures {
  const sum = (rows: readonly { amountCents: number }[]) =>
    sumMinor(rows.map((p) => p.amountCents));
  const toCheck = payments.filter(
    (p) => p.status === "pending" && p.source === "member",
  );
  const promised = payments.filter(
    (p) => p.status === "pending" && p.source !== "member",
  );
  return {
    inBankCents: sum(payments.filter((p) => p.status === "reconciled")),
    excusedCents: sum(payments.filter((p) => p.status === "waived")),
    toCheckCents: sum(toCheck),
    toCheckCount: toCheck.length,
    promisedCents: sum(promised),
    promisedCount: promised.length,
  };
}

/**
 * A member's balance for one year: charges, less payments received or waived,
 * plus refunds paid out (money going back out). Pass live charges only (not
 * cancelled ones). Throws on a row in any currency but ZAR.
 */
export function duesBalance(input: {
  charges: readonly BalanceCharge[];
  payments: readonly BalancePayment[];
  refunds?: readonly BalanceRefund[];
}): DuesBalance {
  for (const row of [
    ...input.charges,
    ...input.payments,
    ...(input.refunds ?? []),
  ]) {
    inRands(row.currency);
  }
  const chargedCents = sumMinor(input.charges.map((c) => c.amountCents));
  const paidCents = sumMinor(
    input.payments
      .filter((p) => p.status === "reconciled" || p.status === "waived")
      .map((p) => p.amountCents),
  );
  const pendingCents = sumMinor(
    input.payments
      .filter((p) => p.status === "pending")
      .map((p) => p.amountCents),
  );
  const refundedCents = sumMinor(
    (input.refunds ?? [])
      .filter((r) => r.status === "refunded")
      .map((r) => r.amountCents ?? 0),
  );
  return {
    chargedCents,
    paidCents,
    pendingCents,
    refundedCents,
    balanceCents: chargedCents - paidCents + refundedCents,
  };
}

/**
 * Whether a member's dues count as settled for the year. With charges, the
 * balance must be paid down to zero or below. With none (a member the Finance
 * team has not charged yet), any payment received or waived still counts, the
 * ledger's older rule, so no one who paid before charges existed reads as
 * unpaid.
 */
export function duesSettled(input: {
  charges: readonly BalanceCharge[];
  payments: readonly BalancePayment[];
  refunds?: readonly BalanceRefund[];
}): boolean {
  if (input.charges.length === 0) {
    return input.payments.some(
      (p) => p.status === "reconciled" || p.status === "waived",
    );
  }
  return duesBalance(input).balanceCents <= 0;
}

// --- Payment plans -------------------------------------------------------------

export interface Instalment {
  /** YYYY-MM-DD. */
  dueOn: string;
  amountCents: number;
}

export interface NextInstalment {
  dueOn: string;
  /** What is still to pay of this instalment. */
  amountCents: number;
  overdue: boolean;
}

/**
 * The instalment a member pays next: the payments counted so far fill the
 * instalments in date order, and the first one they do not cover is next.
 * Null when there is no plan or it is paid. `today` is YYYY-MM-DD.
 */
export function nextInstalment(
  instalments: readonly Instalment[],
  paidCents: number,
  today: string,
): NextInstalment | null {
  const ordered = [...instalments].sort((a, b) =>
    a.dueOn.localeCompare(b.dueOn),
  );
  let covered = Math.max(0, paidCents);
  for (const instalment of ordered) {
    if (covered >= instalment.amountCents) {
      covered -= instalment.amountCents;
      continue;
    }
    return {
      dueOn: instalment.dueOn,
      amountCents: instalment.amountCents - covered,
      overdue: instalment.dueOn < today,
    };
  }
  return null;
}

// --- Settle-up -------------------------------------------------------------------

/**
 * A total shared out in whole cents across people, so the shares add up to the
 * total exactly: everyone gets the same floor, and the cents left over go one
 * each to the first people in id order (so a re-preview gives the same answer).
 * Empty for no one.
 */
export function splitEvenly(
  totalCents: number,
  ids: readonly string[],
): Map<string, number> {
  if (!Number.isSafeInteger(totalCents) || totalCents < 0) {
    throw new RangeError("splitEvenly: the total must be whole cents.");
  }
  const people = [...new Set(ids)].sort();
  const shares = new Map<string, number>();
  if (people.length === 0) return shares;
  const floor = Math.floor(totalCents / people.length);
  const leftOver = totalCents - floor * people.length;
  people.forEach((id, i) => shares.set(id, floor + (i < leftOver ? 1 : 0)));
  return shares;
}

// --- Refunds -------------------------------------------------------------------

export interface RefundSchedule {
  /** A full refund for a withdrawal up to and including this day. */
  fullRefundUntil: string | null;
  /** A partial refund up to and including this day. */
  partialRefundUntil: string | null;
  /** The percentage a partial refund pays back, 1 to 99. */
  partialRefundPct: number | null;
}

export type RefundRule = "full" | "partial" | "none" | "no_schedule";

/**
 * What the year's schedule pays back of `paidCents` for a member who withdrew
 * on `withdrewOn` (YYYY-MM-DD): all of it up to the full-refund day, the
 * percentage up to the partial day (rounded down to the cent), nothing after.
 * With no schedule set, nothing is proposed and the Finance team types it.
 */
export function proposeRefund(
  paidCents: number,
  withdrewOn: string,
  schedule: RefundSchedule,
): { amountCents: number | null; rule: RefundRule } {
  const { fullRefundUntil, partialRefundUntil, partialRefundPct } = schedule;
  if (fullRefundUntil === null && partialRefundUntil === null) {
    return { amountCents: null, rule: "no_schedule" };
  }
  if (fullRefundUntil !== null && withdrewOn <= fullRefundUntil) {
    return { amountCents: paidCents, rule: "full" };
  }
  if (
    partialRefundUntil !== null &&
    partialRefundPct !== null &&
    withdrewOn <= partialRefundUntil
  ) {
    return {
      amountCents: Math.floor((paidCents * partialRefundPct) / 100),
      rule: "partial",
    };
  }
  return { amountCents: 0, rule: "none" };
}

// --- The bank statement import ------------------------------------------------------
//
// A statement file from the bank or the transfer service, read in memory on
// the server and never stored. Only money coming in is kept: each line with a
// date, an amount above zero and the text the payer wrote. The member
// reference (`C404-M017`) is looked for in that text, with or without its
// hyphen, and a payment reference (`C404-M017-2027-1`) names its member too.

/** The largest statement file the import reads. */
export const STATEMENT_MAX_BYTES = 512 * 1024;
/** The most lines the import reads from one file. */
export const STATEMENT_MAX_LINES = 5000;

export interface StatementLine {
  /** The line's row number in the file, from 1. */
  row: number;
  /** YYYY-MM-DD. */
  date: string;
  amountCents: number;
  /** The payer's text, trimmed to a line. */
  description: string;
  /** The member reference found in it, like `C404-M017`, or null. */
  memberRef: string | null;
}

export type StatementParse =
  | {
      ok: true;
      lines: StatementLine[];
      /** Money going out, which the import leaves alone. */
      skippedOutgoing: number;
      /** Lines with no readable date or amount, or in another currency. */
      skippedUnreadable: number;
    }
  | { ok: false; error: string };

const NO_COLUMNS =
  "We couldn't find the date and amount columns in that file. Download the statement from your bank as a CSV file and try again.";

/** Split CSV text into rows of cells (quoted cells, doubled quotes). */
export function parseCsvRows(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        cell += ch;
      }
      continue;
    }
    if (ch === '"' && cell.trim() === "") {
      quoted = true;
      cell = "";
    } else if (ch === delimiter) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += ch;
    }
  }
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

function guessDelimiter(text: string): string {
  const sample = text.split(/\r?\n/).slice(0, 20).join("\n");
  const counts = [",", ";", "\t"].map((d) => ({
    d,
    n: sample.split(d).length - 1,
  }));
  counts.sort((a, b) => b.n - a.n);
  return counts[0]!.n > 0 ? counts[0]!.d : ",";
}

const MONTHS: Readonly<Record<string, number>> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

function isoDay(year: number, month: number, day: number): string | null {
  const text = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const date = new Date(`${text}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10) === text ? text : null;
}

/**
 * A statement's date as YYYY-MM-DD, or null. Reads year-first dates
 * (2027-01-15, 2027/01/15, 20270115), day-first ones as South African banks
 * write them (15/01/2027, 15-01-2027, 15.01.2027) and month names
 * (15 Jan 2027, 15-January-2027). A time after the date is ignored.
 */
export function parseStatementDate(raw: string): string | null {
  const value = raw.trim();
  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T\s].*)?$/.exec(value);
  if (m) return isoDay(Number(m[1]), Number(m[2]), Number(m[3]));
  m = /^(\d{4})(\d{2})(\d{2})$/.exec(value);
  if (m) return isoDay(Number(m[1]), Number(m[2]), Number(m[3]));
  m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})(?:\s.*)?$/.exec(value);
  if (m) return isoDay(Number(m[3]), Number(m[2]), Number(m[1]));
  m = /^(\d{1,2})[\s-]+([A-Za-z]{3,})[\s-]+(\d{4})(?:\s.*)?$/.exec(value);
  if (m) {
    const month = MONTHS[m[2]!.slice(0, 3).toLowerCase()];
    return month ? isoDay(Number(m[3]), month, Number(m[1])) : null;
  }
  return null;
}

/**
 * A statement's amount as signed cents, or null. Reads "1250.00", "1 250,00",
 * "1,250.00", "R1250", "-500.00", "(500.00)" and "500.00 DR" (the last two
 * are money going out).
 */
export function parseStatementAmount(raw: string): number | null {
  let value = raw.replace(/\s/g, "").toUpperCase();
  if (value === "") return null;
  let negative = false;
  if (value.startsWith("(") && value.endsWith(")")) {
    negative = true;
    value = value.slice(1, -1);
  }
  if (value.endsWith("DR")) {
    negative = true;
    value = value.slice(0, -2);
  } else if (value.endsWith("CR")) {
    value = value.slice(0, -2);
  }
  if (value.startsWith("-")) {
    negative = !negative;
    value = value.slice(1);
  } else if (value.startsWith("+")) {
    value = value.slice(1);
  }
  value = value.replace(/^(ZAR|R)/, "");
  if (!/^[\d.,]+$/.test(value) || !/\d/.test(value)) return null;
  const lastDot = value.lastIndexOf(".");
  const lastComma = value.lastIndexOf(",");
  let whole = value;
  let fraction = "";
  const decimalAt =
    lastDot >= 0 && lastComma >= 0
      ? Math.max(lastDot, lastComma)
      : [lastDot, lastComma].find(
          (at) => at >= 0 && value.length - at - 1 <= 2,
        );
  if (decimalAt !== undefined && decimalAt >= 0) {
    whole = value.slice(0, decimalAt);
    fraction = value.slice(decimalAt + 1);
  }
  whole = whole.replace(/[.,]/g, "");
  if (!/^\d*$/.test(whole) || !/^\d{0,2}$/.test(fraction)) return null;
  const cents = Number(whole || "0") * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(cents)) return null;
  return negative ? -cents : cents;
}

const MEMBER_REF_IN_TEXT = /C\s*404\s*[-_ ]?\s*M\s*(\d{3,})(?!\d)/i;

/** The member reference in a payer's text, as `C404-M017`, or null. */
export function findMemberRef(text: string): string | null {
  const m = MEMBER_REF_IN_TEXT.exec(text);
  if (!m) return null;
  const digits = String(Number(m[1]));
  return `C404-M${digits.padStart(3, "0")}`;
}

type Column = "date" | "amount" | "credit" | "debit" | "text" | "currency";

function columnOf(header: string): Column | null {
  const h = header.trim().toLowerCase();
  if (h === "") return null;
  if (h.includes("date")) return "date";
  if (h === "currency" || h === "ccy") return "currency";
  if (h.includes("balance")) return null;
  if (
    h.includes("credit") ||
    h.includes("money in") ||
    h.includes("paid in") ||
    h.includes("deposit")
  ) {
    return "credit";
  }
  if (
    h.includes("debit") ||
    h.includes("money out") ||
    h.includes("paid out") ||
    h.includes("withdrawal")
  ) {
    return "debit";
  }
  if (h.includes("amount")) return "amount";
  if (
    h.includes("description") ||
    h.includes("reference") ||
    h.includes("details") ||
    h.includes("narrative") ||
    h.includes("payer") ||
    h.includes("memo")
  ) {
    return "text";
  }
  return null;
}

/**
 * Read a bank or transfer-service statement (CSV text) into the lines of money
 * coming in. The header row is found among the first rows (banks put a few
 * lines of account details above it). Never stores anything.
 */
export function parseStatement(text: string): StatementParse {
  const body = text.replace(/^\uFEFF/, "");
  if (body.trim() === "") {
    return { ok: false, error: "That file is empty." };
  }
  const rows = parseCsvRows(body, guessDelimiter(body));
  let headerAt = -1;
  let columns: (Column | null)[] = [];
  for (let i = 0; i < Math.min(rows.length, 30); i++) {
    const cols = rows[i]!.map(columnOf);
    const hasDate = cols.includes("date");
    const hasMoney = cols.includes("amount") || cols.includes("credit");
    if (hasDate && hasMoney) {
      headerAt = i;
      columns = cols;
      break;
    }
  }
  if (headerAt < 0) return { ok: false, error: NO_COLUMNS };
  if (rows.length - headerAt - 1 > STATEMENT_MAX_LINES) {
    return {
      ok: false,
      error: `That statement has more than ${STATEMENT_MAX_LINES} lines. Download a shorter date range.`,
    };
  }

  const dateAt = columns.indexOf("date");
  const amountAt = columns.indexOf("amount");
  const creditAt = columns.indexOf("credit");
  const currencyAt = columns.indexOf("currency");
  const textAt = columns
    .map((c, i) => (c === "text" ? i : -1))
    .filter((i) => i >= 0);

  const lines: StatementLine[] = [];
  let skippedOutgoing = 0;
  let skippedUnreadable = 0;
  for (let i = headerAt + 1; i < rows.length; i++) {
    const cells = rows[i]!;
    if (cells.every((c) => c.trim() === "")) continue;
    const date = parseStatementDate(cells[dateAt] ?? "");
    const rawAmount =
      creditAt >= 0 && (cells[creditAt] ?? "").trim() !== ""
        ? cells[creditAt]!
        : amountAt >= 0
          ? (cells[amountAt] ?? "")
          : "";
    const amount =
      rawAmount.trim() === "" ? null : parseStatementAmount(rawAmount);
    if (
      creditAt >= 0 &&
      amountAt < 0 &&
      (cells[creditAt] ?? "").trim() === ""
    ) {
      // A statement with separate columns: no credit means money going out.
      skippedOutgoing++;
      continue;
    }
    const currency =
      currencyAt >= 0 ? (cells[currencyAt] ?? "").trim().toUpperCase() : "ZAR";
    if (
      date === null ||
      amount === null ||
      (currency !== "" && !isCurrency(currency))
    ) {
      skippedUnreadable++;
      continue;
    }
    if (amount <= 0) {
      skippedOutgoing++;
      continue;
    }
    const description = textAt
      .map((at) => (cells[at] ?? "").trim())
      .filter(Boolean)
      .join(" · ")
      .replace(/\s+/g, " ")
      .slice(0, 200);
    lines.push({
      row: i + 1,
      date,
      amountCents: amount,
      description,
      memberRef: findMemberRef(description),
    });
  }
  return { ok: true, lines, skippedOutgoing, skippedUnreadable };
}

export interface StatementMember {
  id: string;
  name: string;
  refCode: string | null;
}

export interface StatementLedgerPayment {
  id: string;
  userId: string;
  amountCents: number;
  status: PaymentStatus;
  /** The day the money was paid, YYYY-MM-DD, when known. */
  paidOn: string | null;
}

export interface StatementProposal extends StatementLine {
  /** The member the reference names (or suggested), or null when none. */
  member: { id: string; name: string; refCode: string } | null;
  /**
   * How the member was found: by the reference on the line, or only
   * suggested because one pending payment has the same amount (the Finance
   * team checks before confirming), or not at all.
   */
  matchedBy: "reference" | "amount" | null;
  /** The member's own pending payment for the same amount, to mark received. */
  pendingPaymentId: string | null;
  /** A payment for the same member, amount and day is already on the ledger. */
  alreadyRecorded: boolean;
}

/**
 * What the import proposes for each line: the member its reference names,
 * and whether it is the member's pending payment (mark it received) or
 * already on the ledger (leave it). The Finance team confirms each one.
 */
export function proposeStatementMatches(
  lines: readonly StatementLine[],
  members: readonly StatementMember[],
  payments: readonly StatementLedgerPayment[],
): StatementProposal[] {
  const byRef = new Map(
    members
      .filter((m): m is StatementMember & { refCode: string } => !!m.refCode)
      .map((m) => [m.refCode, m]),
  );
  const byId = new Map(members.map((m) => [m.id, m]));
  const claimed = new Set<string>();
  // First the lines whose reference names a member, so a suggestion never
  // takes a payment a referenced line accounts for.
  const proposals: StatementProposal[] = lines.map((line) => {
    const found = line.memberRef ? byRef.get(line.memberRef) : undefined;
    const member = found
      ? { id: found.id, name: found.name, refCode: found.refCode }
      : null;
    if (!member) {
      return {
        ...line,
        member,
        matchedBy: null,
        pendingPaymentId: null,
        alreadyRecorded: false,
      };
    }
    const theirs = payments.filter(
      (p) => p.userId === member.id && p.amountCents === line.amountCents,
    );
    const alreadyRecorded = theirs.some(
      (p) => p.status !== "pending" && p.paidOn === line.date,
    );
    const pending = alreadyRecorded
      ? undefined
      : theirs.find((p) => p.status === "pending" && !claimed.has(p.id));
    if (pending) claimed.add(pending.id);
    return {
      ...line,
      member,
      matchedBy: "reference",
      pendingPaymentId: pending?.id ?? null,
      alreadyRecorded,
    };
  });
  // Then a line with no reference: when exactly one pending payment left has
  // the same amount, suggest its member (someone who forgot the reference).
  return proposals.map((proposal) => {
    if (proposal.member) return proposal;
    const same = payments.filter(
      (p) =>
        p.status === "pending" &&
        p.amountCents === proposal.amountCents &&
        !claimed.has(p.id),
    );
    const only = same.length === 1 ? same[0]! : null;
    const who = only ? byId.get(only.userId) : undefined;
    if (!only || !who?.refCode) return proposal;
    claimed.add(only.id);
    return {
      ...proposal,
      member: { id: who.id, name: who.name, refCode: who.refCode },
      matchedBy: "amount",
      pendingPaymentId: only.id,
    };
  });
}
