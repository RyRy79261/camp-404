// Words and shapes for a member's own camp fee (camp fees sprint, owner
// 2026-10-27): the "What can you commit?" scale (mock-up step 3), the pay
// guide (step 4 A) and My dues' "Next payment" (step 5). Pure, and safe in a
// browser: it decides nothing about who may see what, and stores nothing.
//
// The scale's amounts are the Join site's (`fee` in its config, whole rands);
// the pledge is whole-rand cents. A dollar figure is a label at the rate a
// captain typed, never an amount.

import {
  feeTimingLabel,
  feeTimingSchedule,
  formatForeignAmount,
  formatMoney,
  nearestScaleName,
  parseMoneyToMinor,
  recommendedPledgeCents,
  type NextFeePayment,
} from "@camp404/core";
import type { FeeScaleMark } from "@camp404/os";
import type {
  CampBankDetails,
  FeeTiming,
  JoinSiteContent,
} from "@camp404/types";

/** The scale as the pledge step reads it: the Join site's `fee` config. */
export type PledgeScale = Pick<
  JoinSiteContent["fee"],
  "tiers" | "subsidy" | "usdRate"
>;

/** "≈ US$450.00" for an amount in cents, at the rate a captain typed. */
export function usdLabel(cents: number, scale: PledgeScale): string {
  return `≈ ${formatForeignAmount({
    amountZarMinor: Math.max(0, cents),
    currency: "USD",
    ratePerUnit: scale.usdRate.randsPerDollar,
  })}`;
}

/**
 * The marks under and over the slider, as the approved mock-up places them:
 * the scale's names alternate above and below (the last always above, so it
 * clears the Recommended mark), and the Recommended point sits below, lit.
 * Each carries its amount and dollar label for a wide window.
 */
export function pledgeMarks(scale: PledgeScale): FeeScaleMark[] {
  const last = scale.tiers.length - 1;
  const marks: FeeScaleMark[] = scale.tiers.map((t, i) => ({
    key: t.key,
    name: t.name,
    rands: t.rands,
    detail: markDetail(t.rands * 100, scale),
    side: i === last || i % 2 === 0 ? "above" : "below",
  }));
  const recommended = recommendedPledgeCents(scale);
  marks.push({
    key: "recommended",
    name: "★ Recommended",
    rands: recommended / 100,
    detail: markDetail(recommended, scale),
    side: "below",
    // Its own row under Reasonable's: R1,200 apart, the two labels collide.
    row: 2,
    lit: true,
  });
  return marks;
}

/** "R3 500 · ≈ US$219": a mark's dollars to the whole dollar, as the mock-up. */
function markDetail(cents: number, scale: PledgeScale): string {
  const rate = scale.usdRate.randsPerDollar;
  const wholeDollarCents = Math.round(
    Math.round(cents / (rate * 100)) * rate * 100,
  );
  return `${formatMoney(cents, "ZAR", { wholeRands: true })} · ${usdLabel(wholeDollarCents, scale)}`;
}

/**
 * The tag beside the amount: "Recommended" on the Recommended point, the
 * subsidy's name at R0, a scale name when the amount is on its mark, else
 * "Near Ideal".
 */
export function pledgeTag(cents: number, scale: PledgeScale): string {
  if (cents === recommendedPledgeCents(scale) && cents > 0) {
    return "Recommended";
  }
  const near = nearestScaleName(cents, scale);
  return near.exact ? near.name : `Near ${near.name}`;
}

/** "R7 200,00 (near Ideal)": a saved pledge, the way My dues says it. */
export function pledgeWithScale(cents: number, scale: PledgeScale): string {
  const near = nearestScaleName(cents, scale);
  return `${formatMoney(cents)} (${near.exact ? near.name : `near ${near.name}`})`;
}

/** The one line under the amount: the Recommended's reason, else a mark's note. */
export function pledgeNote(cents: number, scale: PledgeScale): string | null {
  const recommended = recommendedPledgeCents(scale);
  if (cents === recommended && cents > 0) {
    return `About ${usdLabel(recommended, scale).replace("≈ ", "")}: what we suggest if you can.`;
  }
  const near = nearestScaleName(cents, scale);
  if (!near.exact) return null;
  const tier = scale.tiers.find((t) => t.name === near.name);
  return tier?.note ?? null;
}

export const WHOLE_RANDS = "Type a whole number of rands, like 7200.";

/**
 * What the member typed in "Or type it (R)", as whole-rand cents, or a
 * sentence to show beside the box. Blank is R0 (fine only with a subsidy; the
 * server says so).
 */
export function readPledgeAmount(
  text: string,
): { ok: true; cents: number } | { ok: false; error: string } {
  if (text.trim() === "") return { ok: true, cents: 0 };
  const cents = parseMoneyToMinor(text);
  if (cents === null || cents % 100 !== 0) {
    return { ok: false, error: WHOLE_RANDS };
  }
  return { ok: true, cents };
}

/**
 * The six "By when can you pay it?" choices, as option cards: a "part" one
 * reads "Part by the end of November" with "and the rest later" under it, as
 * the mock-up draws them.
 */
export function feeTimingChoice(
  timing: FeeTiming,
  burnYear: number,
): { value: FeeTiming; label: string; description?: string } {
  const label = feeTimingLabel(timing, burnYear);
  const rest = " and the rest later";
  return label.endsWith(rest)
    ? {
        value: timing,
        label: label.slice(0, -rest.length),
        description: rest.trim(),
      }
    : { value: timing, label };
}

/**
 * A "by when" inside a sentence after the amount: "part by the end of
 * November and the rest later" (only its first letter lowered, so the month
 * keeps its capital), or "and you'll talk to a captain about when".
 */
export function feeTimingPhrase(timing: FeeTiming, burnYear: number): string {
  if (timing === "talk_to_captain") {
    return "and you'll talk to a captain about when";
  }
  const label = feeTimingLabel(timing, burnYear);
  return label.charAt(0).toLowerCase() + label.slice(1);
}

// --- The next payment ------------------------------------------------------

/** What the pay guide shows: the member's own figures and the camp's bank. */
export interface PayGuideData {
  refCode: string | null;
  feeTotalCents: number;
  paidCents: number;
  next: NextFeePayment;
  bank: CampBankDetails;
}

const SHORT_DAY = new Intl.DateTimeFormat("en-ZA", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

/** "30 Nov" for a YYYY-MM-DD day. */
export function shortDay(day: string): string {
  const date = new Date(`${day}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? day : SHORT_DAY.format(date);
}

/** What the pay guide and My dues say about the next payment. */
export interface NextPaymentWords {
  /** "R3 600,00 is due by 30 Nov": the closed card's line. */
  short: string;
  /** "R3 600,00 by 30 Nov": My dues' figure. */
  figure: string;
  /** "Your first payment of R3 600,00 is due by 30 Nov.": the open guide. */
  sentence: string;
  /** "Your first payment." / "Your next payment." / "It was due on 30 Nov." */
  lead: string;
  /** "You have paid R0,00 of R7 200,00." */
  paid: string;
  /** What to put in the guide's Amount row. */
  amountCents: number;
  overdue: boolean;
}

/**
 * The words for a member's next fee payment, or null when there is nothing to
 * pay next (paid up, no pledge, or a subsidy talk first). A payment with no
 * day ("I'll talk to a captain") still says what is owed.
 */
export function nextPaymentWords(
  next: NextFeePayment,
  totals: { paidCents: number; feeTotalCents: number },
): NextPaymentWords | null {
  const paid = `You have paid ${formatMoney(totals.paidCents)} of ${formatMoney(totals.feeTotalCents)}.`;
  if (next.kind === "due") {
    const amount = formatMoney(next.amountCents);
    const day = shortDay(next.dueOn);
    const which = next.first ? "first" : "next";
    return next.overdue
      ? {
          short: `${amount} was due by ${day}`,
          figure: `${amount} by ${day}`,
          sentence: `Your ${which} payment of ${amount} was due by ${day}. Please pay it now.`,
          lead: `It was due by ${day}.`,
          paid,
          amountCents: next.amountCents,
          overdue: true,
        }
      : {
          short: `${amount} is due by ${day}`,
          figure: `${amount} by ${day}`,
          sentence: `Your ${which} payment of ${amount} is due by ${day}.`,
          lead: `Your ${which} payment.`,
          paid,
          amountCents: next.amountCents,
          overdue: false,
        };
  }
  if (next.kind === "no_date") {
    const amount = formatMoney(next.amountCents);
    return {
      short: `You owe ${amount}`,
      figure: amount,
      sentence: `You owe ${amount} for your camp fee.`,
      lead: "No date yet: talk to the Finance team about when.",
      paid,
      amountCents: next.amountCents,
      overdue: false,
    };
  }
  return null;
}

/** One line of "Your payment plan" on My dues. */
export interface PlanRow {
  dueOn: string;
  amountCents: number;
  /** The instalment the member pays next. */
  next: boolean;
}

/**
 * "Your payment plan": the Finance team's plan when there is one, else the
 * instalments the pledge's "by when" means (R7,200 "part by end of Nov" is
 * R3,600 by 30 Nov and R3,600 by 31 Dec), the next one marked. Nothing for
 * "I'll talk to a captain", no answer or R0.
 */
export function paymentPlanRows(input: {
  plan: readonly { dueOn: string; amountCents: number }[];
  payBy: FeeTiming | null;
  feeTotalCents: number;
  burnYear: number;
  next: NextFeePayment;
}): PlanRow[] {
  const schedule =
    input.plan.length > 0
      ? [...input.plan]
      : input.payBy
        ? feeTimingSchedule(input.payBy, input.feeTotalCents, input.burnYear)
        : [];
  const nextDay = input.next.kind === "due" ? input.next.dueOn : null;
  return schedule
    .sort((a, b) => a.dueOn.localeCompare(b.dueOn))
    .map((i) => ({
      dueOn: i.dueOn,
      amountCents: i.amountCents,
      next: i.dueOn === nextDay,
    }));
}
