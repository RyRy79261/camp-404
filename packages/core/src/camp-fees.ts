import type {
  CampBillRepeat,
  FeeTiming,
  ParticipationStatus,
} from "@camp404/types";
import type { Instalment } from "./dues";
import { sumMinor } from "./money";
import { isComingThisYear } from "./participation";

// Camp fees (owner, 2026-10-27): a member's pledge and when they can pay it,
// the instalment they pay next, the scale's names, the camp's bills and the
// money forecast. Pure: no DB, no session, no next/*. Both dues stores (the
// database and the E2E test store) and the screens read these.
//
// A BURN YEAR is the camp's cycle (2027 for AfrikaBurn in April 2027). Its fees
// fall due before it: end of November and end of December of the year before,
// and 15 January of the burn year.
//
// MONEY. Whole rand cents, ZAR only (./money).

// --- When a member can pay ---------------------------------------------------

/** AfrikaBurn ends by the end of April: a day after it looks to next year's. */
const BURN_OVER_AFTER = "04-30";

/**
 * The burn year a camp's fees are for: its cycle once a captain set the year
 * (the cycle IS the burn year, 2027), else the next AfrikaBurn after `today`
 * (late April: from May on, next year's). A camp with no year set has the
 * cycle sentinel 1, which would put the fees in year 0. Every fee caller goes
 * through this: feeFigures does itself, and a screen or total that takes a
 * burn year asks it first. `today` is YYYY-MM-DD.
 */
export function feeBurnYear(cycle: number, today: string): number {
  if (cycle >= 1000) return cycle;
  const year = Number(today.slice(0, 4));
  return today.slice(5) > BURN_OVER_AFTER ? year + 1 : year;
}

/** The day each step of the fee calendar falls on, for a burn year. */
export function feeTimingDays(burnYear: number): {
  endNov: string;
  endDec: string;
  jan15: string;
} {
  // Four-digit years, so a day is always a valid YYYY-MM-DD (a camp that
  // has not named its founding year is on the sentinel year 1).
  const year = (y: number) => String(y).padStart(4, "0");
  return {
    endNov: `${year(burnYear - 1)}-11-30`,
    endDec: `${year(burnYear - 1)}-12-31`,
    jan15: `${year(burnYear)}-01-15`,
  };
}

/** The question's words for each timing (the member's form, My dues). */
export function feeTimingLabel(timing: FeeTiming, burnYear: number): string {
  switch (timing) {
    case "all_by_end_nov":
      return "All of it by the end of November";
    case "all_by_end_dec":
      return "All of it by the end of December";
    case "part_by_end_nov":
      return "Part by the end of November and the rest later";
    case "part_by_end_dec":
      return "Part by the end of December and the rest later";
    case "all_by_15_jan":
      return `All of it by 15 January ${burnYear}`;
    case "talk_to_captain":
      return "I'll talk to a captain";
  }
}

/** The short words a table row shows ("When they can pay"). */
export function feeTimingShortLabel(
  timing: FeeTiming | null,
  burnYear: number,
): string {
  switch (timing) {
    case null:
      return "Not answered";
    case "all_by_end_nov":
      return "Full by end Nov";
    case "all_by_end_dec":
      return "Full by end Dec";
    case "part_by_end_nov":
      return "Part by end Nov";
    case "part_by_end_dec":
      return "Part by end Dec";
    case "all_by_15_jan":
      return `Full by 15 Jan ${burnYear}`;
    case "talk_to_captain":
      return "Will talk to a captain";
  }
}

/**
 * The instalments a timing means for an amount: all on one day, or "part" as
 * half on the first day (rounded up to the rand) and the rest at the next
 * step (end Nov then end Dec; end Dec then 15 Jan). "I'll talk to a captain"
 * has no days. Nothing for R0.
 */
export function feeTimingSchedule(
  timing: FeeTiming,
  totalCents: number,
  burnYear: number,
): Instalment[] {
  if (totalCents <= 0) return [];
  const { endNov, endDec, jan15 } = feeTimingDays(burnYear);
  const half = (first: string, then: string): Instalment[] => {
    const firstCents = Math.min(totalCents, Math.ceil(totalCents / 200) * 100);
    const rest = totalCents - firstCents;
    return rest > 0
      ? [
          { dueOn: first, amountCents: firstCents },
          { dueOn: then, amountCents: rest },
        ]
      : [{ dueOn: first, amountCents: firstCents }];
  };
  switch (timing) {
    case "all_by_end_nov":
      return [{ dueOn: endNov, amountCents: totalCents }];
    case "all_by_end_dec":
      return [{ dueOn: endDec, amountCents: totalCents }];
    case "part_by_end_nov":
      return half(endNov, endDec);
    case "part_by_end_dec":
      return half(endDec, jan15);
    case "all_by_15_jan":
      return [{ dueOn: jan15, amountCents: totalCents }];
    case "talk_to_captain":
      return [];
  }
}

/** What a member's fee needs to work out what they pay and when. */
export interface FeeAccount {
  /** What the fee is: the live camp fee when charged, else the pledge. */
  totalCents: number;
  /** Payments received or waived this year. */
  paidCents: number;
  payBy: FeeTiming | null;
  /** A payment plan the Finance team set (dues_instalments): it wins. */
  plan: readonly Instalment[];
}

/** Where a fee's days come from. */
export type FeeScheduleSource = "plan" | "pledge" | "none";

/**
 * The fee instalments still to pay: the Finance team's plan when there is one,
 * else the pledge's "by when", with what is paid filling the oldest first.
 * `undatedCents` is what is owed with no day to it ("I'll talk to a captain",
 * no answer yet, or more than the plan covers).
 */
export function feeInstalmentsLeft(
  account: FeeAccount,
  burnYear: number,
): { source: FeeScheduleSource; dated: Instalment[]; undatedCents: number } {
  const source: FeeScheduleSource =
    account.plan.length > 0 ? "plan" : account.payBy ? "pledge" : "none";
  const schedule = (
    source === "plan"
      ? [...account.plan]
      : source === "pledge"
        ? feeTimingSchedule(account.payBy!, account.totalCents, burnYear)
        : []
  ).sort((a, b) => a.dueOn.localeCompare(b.dueOn));
  let covered = Math.max(0, account.paidCents);
  const dated: Instalment[] = [];
  for (const instalment of schedule) {
    if (covered >= instalment.amountCents) {
      covered -= instalment.amountCents;
      continue;
    }
    dated.push({
      dueOn: instalment.dueOn,
      amountCents: instalment.amountCents - covered,
    });
    covered = 0;
  }
  const owing = Math.max(0, account.totalCents - account.paidCents);
  const datedCents = sumMinor(dated.map((i) => i.amountCents));
  return { source, dated, undatedCents: Math.max(0, owing - datedCents) };
}

/** What a member pays next, in the words a screen needs. */
export type NextFeePayment =
  | {
      kind: "due";
      dueOn: string;
      /** What is still to pay of this instalment. */
      amountCents: number;
      overdue: boolean;
      /** Nothing is paid yet and this is the first instalment. */
      first: boolean;
      source: "plan" | "pledge";
    }
  /** Owes money with no day to it ("No date yet"). */
  | { kind: "no_date"; amountCents: number }
  /** Asked for a subsidy and has no day to pay ("After a talk"). */
  | { kind: "subsidy" }
  | { kind: "paid_up" }
  /** No pledge, no fee and no plan. */
  | { kind: "no_pledge" };

/**
 * The member's next fee payment: the first instalment not yet covered (plan
 * first, else the pledge's "by when"), else what is owed with no day, else
 * paid up. A member who asked for a subsidy and has no day to pay reads
 * "subsidy". `today` is YYYY-MM-DD.
 */
export function nextFeePayment(
  account: FeeAccount & { hasPledge: boolean; subsidy: boolean },
  burnYear: number,
  today: string,
): NextFeePayment {
  if (
    !account.hasPledge &&
    account.plan.length === 0 &&
    account.totalCents === 0
  ) {
    return account.subsidy ? { kind: "subsidy" } : { kind: "no_pledge" };
  }
  const left = feeInstalmentsLeft(account, burnYear);
  const next = left.dated[0];
  if (next && left.source !== "none") {
    return {
      kind: "due",
      dueOn: next.dueOn,
      amountCents: next.amountCents,
      overdue: next.dueOn < today,
      first: account.paidCents <= 0,
      source: left.source,
    };
  }
  if (left.undatedCents > 0) {
    return account.subsidy
      ? { kind: "subsidy" }
      : { kind: "no_date", amountCents: left.undatedCents };
  }
  if (account.subsidy && account.totalCents === 0) return { kind: "subsidy" };
  return { kind: "paid_up" };
}

/**
 * A member's fee figures from their rows, the same in both dues stores: what
 * the fee is (the live camp fee, else the pledge, else 0), what is still owed
 * of it after every payment received or waived, and what they pay next.
 */
export function feeFigures(input: {
  liveFeeCents: number | null;
  pledgedCents: number | null;
  payBy: FeeTiming | null;
  subsidy: boolean;
  paidCents: number;
  plan: readonly Instalment[];
  /** The dues' cycle (the burn year once one is set; feeBurnYear). */
  cycle: number;
  today: string;
}): {
  /** The burn year the fees are for (feeBurnYear), for the screens' words. */
  burnYear: number;
  feeTotalCents: number;
  feeOwingCents: number;
  feeNext: NextFeePayment;
} {
  const feeTotalCents = input.liveFeeCents ?? input.pledgedCents ?? 0;
  const burnYear = feeBurnYear(input.cycle, input.today);
  return {
    burnYear,
    feeTotalCents,
    feeOwingCents: Math.max(0, feeTotalCents - input.paidCents),
    feeNext: nextFeePayment(
      {
        totalCents: feeTotalCents,
        paidCents: input.paidCents,
        payBy: input.payBy,
        plan: input.plan,
        hasPledge: input.pledgedCents !== null || input.liveFeeCents !== null,
        subsidy: input.subsidy,
      },
      burnYear,
      input.today,
    ),
  };
}

// --- The pledge -----------------------------------------------------------------

export const FEE_ALREADY_SET =
  "Your camp fee is already set. Ask the Finance team if it needs to change.";

/**
 * Whether a member may save this pledge. Once their fee is charged its amount
 * is the Finance team's to change, so a new amount is refused; the same amount
 * with another "by when" or subsidy answer is fine. A refusal is a sentence.
 */
export function pledgeRefusal(input: {
  /** The live camp fee's amount, or null when none is charged. */
  feeCents: number | null;
  /** The amount already pledged, or null. */
  pledgedCents: number | null;
  amountCents: number;
}): string | null {
  if (input.feeCents === null) return null;
  return input.amountCents === (input.pledgedCents ?? input.feeCents)
    ? null
    : FEE_ALREADY_SET;
}

// --- The Join site's scale ------------------------------------------------------

/** The point the scale marks as Recommended, in US dollars (owner). */
export const RECOMMENDED_USD = 450;

/** The scale as the Join site's fee config holds it (whole rands). */
export interface FeeScale {
  tiers: readonly { key: string; name: string; rands: number }[];
  subsidy: { name: string };
  usdRate: { randsPerDollar: number };
}

/**
 * The Recommended amount: about US$450 at the rate a captain typed, rounded to
 * the nearest R100, in cents. A label's maths, never a stored amount.
 */
export function recommendedPledgeCents(
  scale: Pick<FeeScale, "usdRate">,
): number {
  const rands = RECOMMENDED_USD * scale.usdRate.randsPerDollar;
  return Math.round(rands / 100) * 100 * 100;
}

/**
 * The scale's name nearest a pledge ("Ideal", or "near Ideal" when it is not
 * exactly on the mark): R0 is the subsidy's name. A tie goes to the lower.
 */
export function nearestScaleName(
  amountCents: number,
  scale: Pick<FeeScale, "tiers" | "subsidy">,
): { name: string; exact: boolean } {
  if (amountCents <= 0 || scale.tiers.length === 0) {
    return { name: scale.subsidy.name, exact: amountCents <= 0 };
  }
  let best = scale.tiers[0]!;
  for (const tier of scale.tiers) {
    const d = Math.abs(tier.rands * 100 - amountCents);
    const bestD = Math.abs(best.rands * 100 - amountCents);
    if (d < bestD || (d === bestD && tier.rands < best.rands)) best = tier;
  }
  return { name: best.name, exact: best.rands * 100 === amountCents };
}

// --- The camp's bills -------------------------------------------------------------

export const BILL_GONE = "That bill isn't there any more. Reload the page.";
export const BILL_CHANGED = "Someone changed this bill first. Reload the page.";
export const BILL_ALREADY_PAID = "That bill is already paid. Reload the page.";
export const BALANCE_CHANGED =
  "Someone typed a newer bank balance first. Reload the page.";
export const BANK_DETAILS_CHANGED =
  "Someone changed the bank details first. Reload the page.";
export const COLLECTING_CHANGED =
  "Someone switched collecting fees first. Reload the page.";
export const BILL_TIMES_BELOW_PAID =
  "That bill has more payments marked paid than that. Keep at least as many.";

/** A bill as the forecast and the screens read it. */
export interface CampBillLike {
  id: string;
  name: string;
  payee: string | null;
  amountCents: number;
  /** The first (or only) day it is due, YYYY-MM-DD. */
  dueOn: string;
  repeat: CampBillRepeat;
  /** How many times it is paid: 1 for a one-time bill. */
  times: number;
  /** How many of them are paid. */
  paidCount: number;
  planned: boolean;
}

export type CampBillState = "planned" | "not_paid" | "paid";

export const CAMP_BILL_STATE_LABELS: Readonly<Record<CampBillState, string>> = {
  planned: "Planned",
  not_paid: "Not paid",
  paid: "Paid",
};

/** Paid once every payment is, else planned or not paid as Finance set it. */
export function campBillState(
  bill: Pick<CampBillLike, "times" | "paidCount" | "planned">,
): CampBillState {
  if (bill.paidCount >= bill.times) return "paid";
  return bill.planned ? "planned" : "not_paid";
}

/**
 * A day some months on, kept in its month: 31 Jan plus one month is the last
 * day of February. The platform's UTC dates do the calendar.
 */
export function addMonthsToDay(day: string, months: number): string {
  const [y, m, d] = day.split("-").map(Number) as [number, number, number];
  const last = new Date(Date.UTC(y, m - 1 + months + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m - 1 + months, Math.min(d, last)))
    .toISOString()
    .slice(0, 10);
}

/** The bill's payments still to make: each one's day and its number (from 0). */
export function campBillPaymentsLeft(
  bill: Pick<CampBillLike, "dueOn" | "repeat" | "times" | "paidCount">,
): { dueOn: string; index: number }[] {
  const out: { dueOn: string; index: number }[] = [];
  for (let i = Math.max(0, bill.paidCount); i < bill.times; i++) {
    out.push({
      dueOn:
        bill.repeat === "monthly" ? addMonthsToDay(bill.dueOn, i) : bill.dueOn,
      index: i,
    });
  }
  return out;
}

// --- Who owes what, and the forecast --------------------------------------------------

/** One member's fee, for the totals and the forecast. */
export interface FeeMember extends FeeAccount {
  userId: string;
  name: string;
  participation: ParticipationStatus | null;
  subsidy: boolean;
}

/** Whether a member's fee counts as money still to come: said Coming, no subsidy. */
export function countsTowardFees(
  m: Pick<FeeMember, "participation" | "subsidy">,
): boolean {
  return isComingThisYear(m.participation) && !m.subsidy;
}

export interface FeeTotals {
  /** Members who said Coming (applied or accepted). */
  comingCount: number;
  maybeCount: number;
  /** Coming members who asked for a subsidy. */
  subsidyCount: number;
  /** What the Coming members pledged (their fee once charged). */
  pledgedCents: number;
  paidCents: number;
  paidUpCount: number;
  partPaidCount: number;
  /** What Coming members without a subsidy still owe. */
  stillExpectedCents: number;
  owingCount: number;
  /** The next day fees fall due, what is due by it, and from how many. */
  nextDue: { dueOn: string; amountCents: number; count: number } | null;
}

/** The Who owes what figures, over the members who said Coming. */
export function feeTotals(
  members: readonly FeeMember[],
  burnYear: number,
  today: string,
): FeeTotals {
  const coming = members.filter((m) => isComingThisYear(m.participation));
  const counted = coming.filter((m) => !m.subsidy);
  const owing = (m: FeeMember) => Math.max(0, m.totalCents - m.paidCents);
  const byDay = new Map<string, { amountCents: number; count: number }>();
  for (const m of counted) {
    const left = feeInstalmentsLeft(m, burnYear);
    const first = left.dated[0];
    if (!first) continue;
    // Everything due on or before the member's next day counts toward it.
    const due = sumMinor(
      left.dated
        .filter((i) => i.dueOn <= first.dueOn)
        .map((i) => i.amountCents),
    );
    const day = first.dueOn < today ? today : first.dueOn;
    const row = byDay.get(day) ?? { amountCents: 0, count: 0 };
    row.amountCents += due;
    row.count += 1;
    byDay.set(day, row);
  }
  const firstDay = [...byDay.keys()].sort()[0];
  return {
    comingCount: coming.length,
    maybeCount: members.filter((m) => m.participation === "maybe").length,
    subsidyCount: coming.filter((m) => m.subsidy).length,
    pledgedCents: sumMinor(coming.map((m) => m.totalCents)),
    paidCents: sumMinor(coming.map((m) => m.paidCents)),
    paidUpCount: coming.filter((m) => m.totalCents > 0 && owing(m) === 0)
      .length,
    partPaidCount: coming.filter((m) => m.paidCents > 0 && owing(m) > 0).length,
    stillExpectedCents: sumMinor(counted.map(owing)),
    owingCount: counted.filter((m) => owing(m) > 0).length,
    nextDue: firstDay ? { dueOn: firstDay, ...byDay.get(firstDay)! } : null,
  };
}

export type ForecastLine =
  | {
      kind: "bill";
      dueOn: string;
      billId: string;
      /** Which of the bill's payments (from 0). */
      index: number;
      name: string;
      payee: string | null;
      monthly: boolean;
      /** For a monthly bill: payments left after this one. */
      leftAfter: number;
      planned: boolean;
      /** Signed: money out is below zero. */
      amountCents: number;
      moneyAfterCents: number;
    }
  | {
      kind: "fees";
      dueOn: string;
      people: { userId: string; name: string }[];
      amountCents: number;
      moneyAfterCents: number;
    }
  | {
      kind: "fees_no_date";
      dueOn: null;
      people: { userId: string; name: string }[];
      amountCents: number;
      moneyAfterCents: number;
    }
  | {
      kind: "budgets";
      dueOn: null;
      amountCents: number;
      moneyAfterCents: number;
    };

export interface CampForecast {
  inBank: { amountCents: number; asOf: string } | null;
  /** Fees still to come from members who said Coming (no subsidy). */
  feesExpectedCents: number;
  feesFromCount: number;
  comingCount: number;
  /** Bill payments not paid yet (planned ones too). */
  billsDueCents: number;
  billsDueCount: number;
  budgetsUnspentCents: number;
  /** Bank + fees still to come - bills still due - budgets not spent. */
  moneyLeftCents: number;
  /** Date by date, with the money after each line. */
  lines: ForecastLine[];
}

/** What the teams' budgets have not spent yet: each team's left, never below 0. */
export function budgetsUnspentCents(
  totals: readonly { leftCents: number | null }[],
): number {
  return sumMinor(totals.map((t) => Math.max(0, t.leftCents ?? 0)));
}

/**
 * The camp's money: the bank balance, plus the fees still to come (each
 * Coming member's remaining instalments, without subsidy members), less every
 * bill payment still due (monthly ones one line a month) and what the teams'
 * budgets have not spent. Lines are by day (money out before money in on the
 * same day, older bills first), then fees with no day yet, then the budgets.
 */
export function campForecast(input: {
  balance: { amountCents: number; asOf: string } | null;
  members: readonly FeeMember[];
  bills: readonly CampBillLike[];
  budgetsUnspentCents: number;
  burnYear: number;
}): CampForecast {
  type Dated = Exclude<ForecastLine, { dueOn: null }>;
  type Unrun<T> = T extends unknown ? Omit<T, "moneyAfterCents"> : never;
  const dated: Unrun<Dated>[] = [];
  let billsDueCount = 0;
  for (const bill of input.bills) {
    const left = campBillPaymentsLeft(bill);
    billsDueCount += left.length;
    for (const p of left) {
      dated.push({
        kind: "bill",
        dueOn: p.dueOn,
        billId: bill.id,
        index: p.index,
        name: bill.name,
        payee: bill.payee,
        monthly: bill.repeat === "monthly",
        leftAfter: bill.times - p.index - 1,
        planned: bill.planned,
        amountCents: -bill.amountCents,
      });
    }
  }
  const feesByDay = new Map<
    string,
    { people: { userId: string; name: string }[]; amountCents: number }
  >();
  const noDate: {
    people: { userId: string; name: string }[];
    amountCents: number;
  } = { people: [], amountCents: 0 };
  const counted = input.members.filter(countsTowardFees);
  for (const m of counted) {
    const left = feeInstalmentsLeft(m, input.burnYear);
    const who = { userId: m.userId, name: m.name };
    for (const i of left.dated) {
      const day = feesByDay.get(i.dueOn) ?? { people: [], amountCents: 0 };
      day.amountCents += i.amountCents;
      day.people.push(who);
      feesByDay.set(i.dueOn, day);
    }
    if (left.undatedCents > 0) {
      noDate.amountCents += left.undatedCents;
      noDate.people.push(who);
    }
  }
  for (const [dueOn, day] of feesByDay) {
    dated.push({ kind: "fees", dueOn, ...day });
  }
  // By day; on one day money out first, and older bills before newer ones.
  const firstDue = new Map(input.bills.map((b) => [b.id, b.dueOn]));
  dated.sort((a, b) => {
    const byDay = a.dueOn.localeCompare(b.dueOn);
    if (byDay !== 0) return byDay;
    if (a.kind !== b.kind) return a.kind === "bill" ? -1 : 1;
    if (a.kind === "bill" && b.kind === "bill") {
      return (
        firstDue.get(a.billId)!.localeCompare(firstDue.get(b.billId)!) ||
        a.name.localeCompare(b.name)
      );
    }
    return 0;
  });

  let money = input.balance?.amountCents ?? 0;
  const lines: ForecastLine[] = dated.map((line) => {
    money += line.amountCents;
    return { ...line, moneyAfterCents: money } as ForecastLine;
  });
  if (noDate.amountCents > 0) {
    money += noDate.amountCents;
    lines.push({
      kind: "fees_no_date",
      dueOn: null,
      ...noDate,
      moneyAfterCents: money,
    });
  }
  if (input.budgetsUnspentCents > 0) {
    money -= input.budgetsUnspentCents;
    lines.push({
      kind: "budgets",
      dueOn: null,
      amountCents: -input.budgetsUnspentCents,
      moneyAfterCents: money,
    });
  }
  const feesExpectedCents = sumMinor(
    counted.map((m) => Math.max(0, m.totalCents - m.paidCents)),
  );
  const billsDueCents = sumMinor(
    lines.filter((l) => l.kind === "bill").map((l) => -l.amountCents),
  );
  return {
    inBank: input.balance,
    feesExpectedCents,
    feesFromCount: counted.filter((m) => m.totalCents > m.paidCents).length,
    comingCount: input.members.filter((m) => isComingThisYear(m.participation))
      .length,
    billsDueCents,
    billsDueCount,
    budgetsUnspentCents: input.budgetsUnspentCents,
    moneyLeftCents: money,
    lines,
  };
}

// --- Reminders ----------------------------------------------------------------------
//
// Finance's "Ask everyone to pledge" and "Remind who still owes" are nudges on
// the gate spine (packages/db/src/nudges.ts), never a block: one NON-blocking
// `required_actions` row per member and one notice, never a second while the
// first is unread. Each notice is about the member's OWN pledge or next
// payment. The camp's Telegram chats get only a general post that names nobody
// and shows no amount (owner, 2026-10-27, 2A). Nobody who said Not coming this
// year is asked or reminded, and nobody who asked for a subsidy is reminded.

/** The `required_actions.action_key` of the ask to pledge. */
export const FEE_PLEDGE_ACTION_KEY = "fee_pledge";
export const FEE_PLEDGE_ACTION_TITLE = "Say what you can put in to camp fees";
/** The `ref_type` of its notice, which opens My dues. */
export const FEE_PLEDGE_REF_TYPE = "fee_pledge";

/** The `required_actions.action_key` of the reminder to pay. */
export const FEE_PAYMENT_ACTION_KEY = "fee_payment";
export const FEE_PAYMENT_ACTION_TITLE = "Pay your camp fee";
/** The `ref_type` of a payment reminder (by Finance or automatic). */
export const FEE_PAYMENT_REF_TYPE = "fee_payment";

export const REMINDERS_NEED_COLLECTING =
  "Switch on Collecting fees before you remind anyone.";

/** The general post in the camp's Telegram chats: nobody named, no amounts. */
export const FEE_TELEGRAM_TITLE = "Camp fees are coming due";
export const FEE_TELEGRAM_BODY =
  "Check My dues in Camp 404 to see what you owe and how to pay.";
export const FEE_TELEGRAM_BUTTON = "Open My dues";

/** How many days before an instalment is due its automatic reminder goes. */
export const FEE_REMINDER_DAYS_AHEAD = 3;

/** One member's fee, as the reminders read it. */
export interface FeeReminderMember {
  userId: string;
  name: string;
  participation: ParticipationStatus | null;
  subsidy: boolean;
  feeOwingCents: number;
  feeNext: NextFeePayment;
  /** A pledge or a charged fee. */
  hasPledge: boolean;
}

export interface FeeReminderAudience<M> {
  /** Who it reaches. */
  reach: M[];
  /** Who it would have reached but said Not coming this year. */
  notComing: M[];
  /** Who asked for a subsidy and is not reminded. */
  subsidy: M[];
}

/** Whether a member said Not coming this year. */
function saidNotComing(m: { participation: ParticipationStatus | null }) {
  return m.participation === "not_attending";
}

/**
 * Who "Remind who still owes" reaches: everyone who owes money on their fee,
 * did not ask for a subsidy and did not say Not coming this year. A Maybe who
 * pledged is reminded too (group sends leave out only Not coming).
 */
export function feeReminderAudience<M extends FeeReminderMember>(
  members: readonly M[],
): FeeReminderAudience<M> {
  const owing = members.filter((m) => m.feeOwingCents > 0);
  return {
    reach: owing.filter((m) => !m.subsidy && !saidNotComing(m)),
    notComing: members.filter(saidNotComing),
    subsidy: members.filter((m) => m.subsidy && !saidNotComing(m)),
  };
}

/**
 * Who "Ask everyone to pledge" reaches: everyone with no pledge and no fee
 * yet, who did not ask for a subsidy and did not say Not coming this year.
 */
export function pledgeAskAudience<M extends FeeReminderMember>(
  members: readonly M[],
): FeeReminderAudience<M> {
  return {
    reach: members.filter(
      (m) => !m.hasPledge && !m.subsidy && !saidNotComing(m),
    ),
    notComing: members.filter(saidNotComing),
    subsidy: [],
  };
}

/** Days from `from` to `to` (both YYYY-MM-DD), by the platform's UTC dates. */
function daysBetween(from: string, to: string): number {
  return Math.round(
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) /
      86_400_000,
  );
}

/**
 * Whether a member's next instalment is near enough for its automatic
 * reminder: within FEE_REMINDER_DAYS_AHEAD days, or already due. The caller
 * sends it once per instalment day.
 */
export function feeReminderDue(next: NextFeePayment, today: string): boolean {
  if (next.kind !== "due") return false;
  return daysBetween(today, next.dueOn) <= FEE_REMINDER_DAYS_AHEAD;
}
