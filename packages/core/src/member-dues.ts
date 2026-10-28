import type {
  ChargeKind,
  FeeTiming,
  ParticipationStatus,
  PaymentMethod,
  PaymentSource,
  RefundStatus,
} from "@camp404/types";
import { feeFigures, type NextFeePayment } from "./camp-fees";
import {
  duesBalance,
  isFeeConcession,
  nextInstalment,
  paymentFigures,
  type DuesBalance,
  type Instalment,
  type NextInstalment,
  type PaymentFigures,
} from "./dues";
import { campDayKey } from "./notification-days";
import type { PaymentStatus } from "./payment-references";

// A member's dues record (#240): one member's year of charges, payments,
// refunds, pledge and plan, built from plain rows. Both dues stores (the
// database and the E2E test store) fetch the rows and call memberDues, so the
// record, and what the Finance team keeps to itself, is decided once. Pure:
// no DB, no session, no next/*.

// --- The rows a store fetches ---------------------------------------------------

export interface MemberDuesChargeIn {
  id: string;
  kind: ChargeKind;
  description: string;
  amountCents: number;
  currency: string;
  standardAmountCents: number | null;
  concessionReason: string | null;
  cancelledAt: Date | null;
  createdAt: Date;
}

export interface MemberDuesPaymentIn {
  id: string;
  reference: string;
  amountCents: number;
  currency: string;
  status: PaymentStatus;
  source: PaymentSource;
  method: PaymentMethod | null;
  paidOn: string | null;
  proofPathname: string | null;
  note: string | null;
  createdAt: Date;
}

export interface MemberDuesRefundIn {
  id: string;
  paymentId: string;
  status: RefundStatus;
  proposedCents: number | null;
  amountCents: number;
  currency: string;
  note: string | null;
  declineReason: string | null;
  decidedAt: Date | null;
  createdAt: Date;
}

/**
 * One member's rows for one year. The store puts them in the order the record
 * shows them: charges oldest first, payments and refunds newest first,
 * instalments by day.
 */
export interface MemberDuesRows {
  userId: string;
  cycle: number;
  /** Their display name as stored (blank reads "Unnamed burner"). */
  name: string | null;
  refCode: string | null;
  /** Their dues account this year, or null when they have none. */
  account: {
    tierId: string | null;
    tierLabel: string | null;
    amountCents: number | null;
    pledgedAt: Date | null;
    payBy: FeeTiming | null;
    subsidy: boolean;
    planVersion: number;
  } | null;
  /** Every charge, cancelled ones too. */
  charges: readonly MemberDuesChargeIn[];
  payments: readonly MemberDuesPaymentIn[];
  refunds: readonly MemberDuesRefundIn[];
  instalments: readonly Instalment[];
  /** Their place this year, or null when they have not answered. */
  participation: { status: ParticipationStatus; updatedAt: Date } | null;
}

/** Who is looking: the Finance team, or the member themselves. */
export interface DuesViewer {
  /** A captain or a Finance lead (MONEY_KEEPER), not the member's own read. */
  forFinance: boolean;
  /** The camp day (YYYY-MM-DD) the next payment is counted from. */
  today: string;
}

// --- The record -------------------------------------------------------------------

/** A member's fee pledge (see GLOSSARY.md, "Fee pledge"). */
export interface Pledge {
  /** Only a pledge made on a fee tier before 2026-10-27 has one. */
  tierId: string | null;
  /** That tier's label, else null (a pledge of the member's own amount). */
  tierLabel: string | null;
  amountCents: number;
  pledgedAt: Date | null;
}

export interface DuesChargeRow {
  id: string;
  kind: ChargeKind;
  description: string;
  amountCents: number;
  currency: string;
  /** A fee's pledged amount, when a concession set it lower. Finance only. */
  standardAmountCents: number | null;
  /** The concession's reason. Always null on a member's own read. */
  concessionReason: string | null;
  /** True when the fee was lowered or given with a reason. Finance only. */
  concession: boolean;
  cancelled: boolean;
  createdAt: Date;
}

export interface DuesRefundRow {
  id: string;
  paymentId: string;
  status: RefundStatus;
  proposedCents: number | null;
  amountCents: number;
  currency: string;
  /** The Finance team's note. Null on a member's own read. */
  note: string | null;
  declineReason: string | null;
  decidedAt: Date | null;
  createdAt: Date;
}

export interface DuesPaymentRow {
  id: string;
  reference: string;
  amountCents: number;
  currency: string;
  status: PaymentStatus;
  source: PaymentSource;
  method: PaymentMethod | null;
  paidOn: string | null;
  hasProof: boolean;
  /** The ledger note. Null on a member's own read. */
  note: string | null;
  createdAt: Date;
  /** Its refund, when one was asked for (the latest). */
  refund: DuesRefundRow | null;
}

export interface MemberDues {
  userId: string;
  cycle: number;
  name: string;
  refCode: string | null;
  pledge: Pledge | null;
  /** When they said they can pay (their pledge, or a fee_timing answer). */
  payBy: FeeTiming | null;
  /** They asked for a subsidy: talk to them; no fee reminders. */
  subsidy: boolean;
  planVersion: number;
  instalments: Instalment[];
  charges: DuesChargeRow[];
  payments: DuesPaymentRow[];
  participation: {
    status: ParticipationStatus;
    /** The camp day they said No after holding a place, else null. */
    withdrewOn: string | null;
  } | null;
  balance: DuesBalance;
  next: NextInstalment | null;
  /** The burn year the fees are for (feeBurnYear: the cycle, or the next
   * AfrikaBurn when no year is set). Name a "by when" with it. */
  burnYear: number;
  /** What the fee is: the live camp fee, else the pledge, else 0. */
  feeTotalCents: number;
  /** What is still owed of it after every payment received or waived. */
  feeOwingCents: number;
  /** Their next fee payment: the plan's, else the pledge's "by when". */
  feeNext: NextFeePayment;
}

/** A blank display name, in every dues screen's words. */
export function duesMemberName(name: string | null | undefined): string {
  return name?.trim() || "Unnamed burner";
}

/**
 * One member's dues record from their rows. A member's own read
 * (`forFinance` false) leaves out what the Finance team keeps to itself: a
 * concession (its reason, the standard amount, the flag) and the ledger's and
 * refunds' notes. Throws on a row in any currency but ZAR (duesBalance).
 */
export function memberDues(
  rows: MemberDuesRows,
  viewer: DuesViewer,
): MemberDues {
  const finance = viewer.forFinance;
  const refunds: DuesRefundRow[] = rows.refunds.map((r) => ({
    id: r.id,
    paymentId: r.paymentId,
    status: r.status,
    proposedCents: r.proposedCents,
    amountCents: r.amountCents,
    currency: r.currency,
    note: finance ? r.note : null,
    declineReason: r.declineReason,
    decidedAt: r.decidedAt,
    createdAt: r.createdAt,
  }));
  const charges: DuesChargeRow[] = rows.charges.map((c) => ({
    id: c.id,
    kind: c.kind,
    description: c.description,
    amountCents: c.amountCents,
    currency: c.currency,
    standardAmountCents: finance ? c.standardAmountCents : null,
    concessionReason: finance ? c.concessionReason : null,
    concession: finance ? isFeeConcession(c) : false,
    cancelled: c.cancelledAt !== null,
    createdAt: c.createdAt,
  }));
  const payments: DuesPaymentRow[] = rows.payments.map((p) => ({
    id: p.id,
    reference: p.reference,
    amountCents: p.amountCents,
    currency: p.currency,
    status: p.status,
    source: p.source,
    method: p.method,
    paidOn: p.paidOn,
    hasProof: p.proofPathname !== null,
    note: finance ? p.note : null,
    createdAt: p.createdAt,
    refund: refunds.find((r) => r.paymentId === p.id) ?? null,
  }));
  const live = rows.charges.filter((c) => c.cancelledAt === null);
  const balance = duesBalance({
    charges: live,
    payments: rows.payments,
    refunds: rows.refunds,
  });
  const account = rows.account;
  const instalments = rows.instalments.map((i) => ({
    dueOn: i.dueOn,
    amountCents: i.amountCents,
  }));
  const place = rows.participation;
  return {
    userId: rows.userId,
    cycle: rows.cycle,
    name: duesMemberName(rows.name),
    refCode: rows.refCode,
    pledge:
      account && account.amountCents !== null
        ? {
            tierId: account.tierId,
            tierLabel: account.tierLabel,
            amountCents: account.amountCents,
            pledgedAt: account.pledgedAt,
          }
        : null,
    payBy: account?.payBy ?? null,
    subsidy: account?.subsidy ?? false,
    planVersion: account?.planVersion ?? 0,
    instalments,
    charges,
    payments,
    participation: place
      ? {
          status: place.status,
          withdrewOn:
            place.status === "not_attending"
              ? campDayKey(place.updatedAt)
              : null,
        }
      : null,
    balance,
    next: nextInstalment(instalments, balance.paidCents, viewer.today),
    ...feeFigures({
      liveFeeCents: live.find((c) => c.kind === "fee")?.amountCents ?? null,
      pledgedCents: account?.amountCents ?? null,
      payBy: account?.payBy ?? null,
      subsidy: account?.subsidy ?? false,
      paidCents: balance.paidCents,
      plan: instalments,
      cycle: rows.cycle,
      today: viewer.today,
    }),
  };
}

// --- Every member, for the Finance team ---------------------------------------------

export interface DuesAccountRow {
  userId: string;
  name: string;
  refCode: string | null;
  participation: ParticipationStatus | null;
  /** The fee tier's label of a pledge made on one before 2026-10-27. */
  pledgeLabel: string | null;
  pledgeCents: number | null;
  payBy: FeeTiming | null;
  subsidy: boolean;
  /** The live camp fee, or null when none is charged. */
  feeCents: number | null;
  /** The live fee was lowered or given with a reason. */
  concession: boolean;
  balance: DuesBalance;
  next: NextInstalment | null;
  /** Payments the member sent in, waiting to be checked against the bank. */
  pendingProofs: number;
  /** Their payments in the Finance team's words (bank, excused, to check, promised). */
  figures: PaymentFigures;
  /** Refunds asked for and not decided. */
  openRefunds: number;
  /** The Finance team's payment plan, by day (empty: none). */
  plan: Instalment[];
  /** The burn year the fees are for (feeBurnYear: the cycle, or the next
   * AfrikaBurn when no year is set). Name a "by when" with it. */
  burnYear: number;
  /** What the fee is: the live camp fee, else the pledge, else 0. */
  feeTotalCents: number;
  feeOwingCents: number;
  feeNext: NextFeePayment;
}

/**
 * One line of the Finance team's list of who owes what, from the same rows
 * as the member's record (read as the Finance team reads it).
 */
export function duesAccountRow(
  rows: MemberDuesRows,
  today: string,
): DuesAccountRow {
  const dues = memberDues(rows, { forFinance: true, today });
  const fee = dues.charges.find((c) => c.kind === "fee" && !c.cancelled);
  return {
    userId: dues.userId,
    name: dues.name,
    refCode: dues.refCode,
    participation: dues.participation?.status ?? null,
    pledgeLabel: dues.pledge?.tierLabel ?? null,
    pledgeCents: dues.pledge?.amountCents ?? null,
    payBy: dues.payBy,
    subsidy: dues.subsidy,
    feeCents: fee?.amountCents ?? null,
    concession: fee?.concession ?? false,
    balance: dues.balance,
    next: dues.next,
    pendingProofs: dues.payments.filter(
      (p) => p.status === "pending" && p.source === "member",
    ).length,
    figures: paymentFigures(dues.payments),
    openRefunds: rows.refunds.filter((r) => r.status === "requested").length,
    plan: dues.instalments,
    burnYear: dues.burnYear,
    feeTotalCents: dues.feeTotalCents,
    feeOwingCents: dues.feeOwingCents,
    feeNext: dues.feeNext,
  };
}

// --- The fee a pledge charges -----------------------------------------------------

/**
 * The camp fee a member's pledge charges when they are accepted (or pledge
 * once accepted): their pledged amount, worded by the tier it was made on.
 * Null when there is nothing to charge: no pledge, or a subsidy pledge of R0
 * (the Finance team sets that fee after the talk). The store still makes sure
 * there is no live fee already.
 */
export function feeChargeFromPledge(
  pledge:
    | { amountCents: number | null; tierLabel: string | null }
    | null
    | undefined,
): { description: string; amountCents: number } | null {
  if (!pledge || pledge.amountCents === null || pledge.amountCents <= 0) {
    return null;
  }
  return {
    description: pledge.tierLabel
      ? `Camp fee: ${pledge.tierLabel}`
      : "Camp fee: pledged amount",
    amountCents: pledge.amountCents,
  };
}
