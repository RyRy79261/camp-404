import { and, count, desc, eq, isNull, ne, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import {
  type Currency,
  formatMemberRefCode,
  isCurrency,
  paymentReference,
  type PaymentStatus,
  UnknownCurrencyError,
} from "@camp404/core";
import type { PaymentMethod, PaymentSource } from "@camp404/types";
import { writeAuditEvent } from "./audit";
import { currentCycleNumber } from "./cycles";
import {
  lockMoneyKeeper,
  MoneyRefused,
  NOT_A_MONEY_KEEPER,
  REFUND_HOLDS_PAYMENT,
} from "./dues";
import { createHttpDb, withTransaction } from "./index";
import * as schema from "./schema";

// The payments ledger (owner's call, 2026-09-16). The app never moves money:
// a member pays the camp by EFT quoting their reference, and a captain records
// what the bank statement shows. Every write leaves an audit row in the same
// transaction. The Finance team (captains and Finance leads, canManageMoney)
// records and moves payments, and each write re-checks that inside its own
// transaction (lockMoneyKeeper); a member may add only their own pending
// payment, with a proof file (#240).

/** Postgres unique_violation, which drizzle may nest under `.cause`. */
function isUniqueViolation(err: unknown): boolean {
  for (let e = err as { code?: string; cause?: unknown } | undefined; e; ) {
    if (e.code === "23505") return true;
    e = e.cause as typeof e;
  }
  return false;
}

/** How many times a write retries after losing a numbering race. */
const RETRIES = 5;

/**
 * The member's payment reference, giving them the next one first if they have
 * none (members who joined after migration 0032). Null for the system account,
 * an erased account, or no such member. Two members asking at once can pick
 * the same number; the unique index refuses the second, which tries again.
 */
export async function ensureMemberRefCode(
  userId: string,
): Promise<string | null> {
  const db = createHttpDb();
  // One more read than writes, so the last write is always read back.
  for (let attempt = 0; attempt <= RETRIES; attempt++) {
    const [user] = await db
      .select({
        refCode: schema.users.refCode,
        isSystem: schema.users.isSystem,
        sanitised: schema.users.sanitised,
      })
      .from(schema.users)
      .where(eq(schema.users.id, userId))
      .limit(1);
    if (!user || user.isSystem || user.sanitised) return null;
    if (user.refCode) return user.refCode;
    if (attempt === RETRIES) break;

    const [taken] = await db
      .select({
        max: sql<
          number | null
        >`max(substring(${schema.users.refCode} from '^C404-M([0-9]+)$')::int)`,
      })
      .from(schema.users);
    const code = formatMemberRefCode((taken?.max ?? 0) + 1);
    try {
      await db
        .update(schema.users)
        .set({ refCode: code })
        .where(and(eq(schema.users.id, userId), isNull(schema.users.refCode)));
      // Read back: a concurrent call may have set a different code first.
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
    }
  }
  throw new Error("ensureMemberRefCode: could not give out a reference");
}

export interface RecordPaymentInput {
  userId: string;
  /** Whole cents. */
  amountCents: number;
  /** Always ZAR: the camp records money in rands only, and any other code is
   *  refused before any read or write. */
  currency: Currency;
  status: PaymentStatus;
  /** What the captain saw, e.g. the bank statement line. */
  note?: string | null;
  recordedByUserId: string;
  /**
   * Who put it on the ledger; `captain` (the Finance team) when left out. A
   * `member` payment is the member's own, pending, with a proof file.
   */
  source?: PaymentSource;
  method?: PaymentMethod | null;
  /** The day it was paid, YYYY-MM-DD. */
  paidOn?: string | null;
  proofPathname?: string | null;
  proofContentType?: string | null;
}

/**
 * Record a payment for this year. The reference is the member's reference,
 * the year, and their payment count that year (`C404-M017-2027-2`).
 */
export async function recordPayment(
  input: RecordPaymentInput,
): Promise<{ id: string; reference: string }> {
  // Checked here as well as at the action: the database is the last caller's
  // guard, and a payment in another currency would be added to a rand total.
  if (!isCurrency(input.currency)) {
    throw new UnknownCurrencyError(input.currency);
  }
  if (!Number.isSafeInteger(input.amountCents) || input.amountCents < 0) {
    throw new Error(
      "recordPayment: the amount must be whole cents, not negative",
    );
  }
  const refCode = await ensureMemberRefCode(input.userId);
  if (!refCode) throw new Error("recordPayment: no such member");
  // Resolved before the transaction; see team-memberships.ts.
  const cycle = await currentCycleNumber();
  const note = input.note?.trim() || null;
  const source = input.source ?? "captain";
  if (
    source === "member" &&
    (input.recordedByUserId !== input.userId || input.status !== "pending")
  ) {
    throw new MoneyRefused(NOT_A_MONEY_KEEPER);
  }

  for (let attempt = 0; attempt < RETRIES; attempt++) {
    try {
      return await withTransaction(async (tx) => {
        if (
          source !== "member" &&
          !(await lockMoneyKeeper(tx, input.recordedByUserId))
        ) {
          throw new MoneyRefused(NOT_A_MONEY_KEEPER);
        }
        const [existing] = await tx
          .select({ n: count() })
          .from(schema.payments)
          .where(
            and(
              eq(schema.payments.userId, input.userId),
              eq(schema.payments.cycle, cycle),
            ),
          );
        const reference = paymentReference(
          refCode,
          cycle,
          (existing?.n ?? 0) + 1,
        );
        const [row] = await tx
          .insert(schema.payments)
          .values({
            userId: input.userId,
            cycle,
            amountCents: input.amountCents,
            currency: input.currency,
            reference,
            status: input.status,
            note,
            recordedByUserId: input.recordedByUserId,
            source,
            method: input.method ?? null,
            paidOn: input.paidOn ?? null,
            proofPathname: input.proofPathname ?? null,
            proofContentType: input.proofContentType ?? null,
          })
          .returning({ id: schema.payments.id });
        await writeAuditEvent(tx, {
          actorId: input.recordedByUserId,
          action: "payment.recorded",
          target: input.userId,
          metadata: {
            reference,
            cycle,
            amountCents: input.amountCents,
            currency: input.currency,
            status: input.status,
            source,
          },
        });
        return { id: row!.id, reference };
      });
    } catch (err) {
      // Two captains recording the same member's payment at once can build
      // the same reference; the loser counts again.
      if (!isUniqueViolation(err)) throw err;
    }
  }
  throw new Error("recordPayment: could not number the payment");
}

/**
 * Move a payment between statuses (received, waived, or back to pending).
 * Compare-and-set on `from`, the status the captain saw: false when it had
 * already moved, so a captain on a stale page is told instead of overwriting.
 * Throws MoneyRefused for anyone but a captain or a Finance lead, and when a
 * received payment with a refund still waiting for a decision would leave
 * `reconciled`: the member would then owe the payment again while the refund
 * could still be paid out.
 */
export async function setPaymentStatus(input: {
  paymentId: string;
  from: PaymentStatus;
  to: PaymentStatus;
  actorId: string;
}): Promise<boolean> {
  if (input.from === input.to) return false;
  return withTransaction(async (tx) => {
    if (!(await lockMoneyKeeper(tx, input.actorId))) {
      throw new MoneyRefused(NOT_A_MONEY_KEEPER);
    }
    // Lock the payment before looking at its refunds. requestRefund and
    // decideRefund lock the same row first, so a refund asked for (or paid
    // out) at the same moment waits for this, and this sees it.
    const [current] = await tx
      .select({ status: schema.payments.status })
      .from(schema.payments)
      .where(eq(schema.payments.id, input.paymentId))
      .for("update");
    if (!current || current.status !== input.from) return false;
    if (input.from === "reconciled") {
      const [open] = await tx
        .select({ id: schema.paymentRefunds.id })
        .from(schema.paymentRefunds)
        .where(
          and(
            eq(schema.paymentRefunds.paymentId, input.paymentId),
            eq(schema.paymentRefunds.status, "requested"),
          ),
        )
        .limit(1);
      if (open) throw new MoneyRefused(REFUND_HOLDS_PAYMENT);
    }
    const [row] = await tx
      .update(schema.payments)
      .set({ status: input.to, updatedAt: new Date() })
      .where(
        and(
          eq(schema.payments.id, input.paymentId),
          eq(schema.payments.status, input.from),
        ),
      )
      .returning({
        userId: schema.payments.userId,
        reference: schema.payments.reference,
      });
    if (!row) return false;
    await writeAuditEvent(tx, {
      actorId: input.actorId,
      action: "payment.status_changed",
      target: row.userId,
      metadata: { reference: row.reference, from: input.from, to: input.to },
    });
    return true;
  });
}

export interface PaymentRow {
  id: string;
  userId: string;
  memberName: string | null;
  memberRefCode: string | null;
  cycle: number;
  amountCents: number;
  currency: string;
  reference: string;
  status: PaymentStatus;
  note: string | null;
  recordedByName: string | null;
  source: PaymentSource;
  method: PaymentMethod | null;
  paidOn: string | null;
  /** A proof file is attached (read through /api/payment-proof). */
  hasProof: boolean;
  /** Its refund's state, when one was asked for and not declined. */
  refundStatus: "requested" | "refunded" | null;
  createdAt: Date;
}

/** Every payment in one burn year, newest first. */
export async function listPayments(cycle: number): Promise<PaymentRow[]> {
  const db = createHttpDb();
  const member = alias(schema.users, "member");
  const recorder = alias(schema.users, "recorder");
  const rows = await db
    .select({
      id: schema.payments.id,
      userId: schema.payments.userId,
      memberName: member.displayName,
      memberRefCode: member.refCode,
      cycle: schema.payments.cycle,
      amountCents: schema.payments.amountCents,
      currency: schema.payments.currency,
      reference: schema.payments.reference,
      status: schema.payments.status,
      note: schema.payments.note,
      recordedByName: recorder.displayName,
      source: schema.payments.source,
      method: schema.payments.method,
      paidOn: schema.payments.paidOn,
      proofPathname: schema.payments.proofPathname,
      refundStatus: schema.paymentRefunds.status,
      createdAt: schema.payments.createdAt,
    })
    .from(schema.payments)
    .innerJoin(member, eq(member.id, schema.payments.userId))
    .leftJoin(recorder, eq(recorder.id, schema.payments.recordedByUserId))
    // At most one refund per payment is not declined (payment_refunds_one_live_idx).
    .leftJoin(
      schema.paymentRefunds,
      and(
        eq(schema.paymentRefunds.paymentId, schema.payments.id),
        ne(schema.paymentRefunds.status, "declined"),
      ),
    )
    .where(eq(schema.payments.cycle, cycle))
    .orderBy(desc(schema.payments.createdAt), desc(schema.payments.id));
  return rows.map(({ proofPathname, refundStatus, ...row }) => ({
    ...row,
    hasProof: proofPathname !== null,
    refundStatus:
      refundStatus === "requested" || refundStatus === "refunded"
        ? refundStatus
        : null,
  }));
}

/**
 * The rands that came in for one burn year, in cents. Only payments seen in
 * the bank (`reconciled`) count. A waived payment settles dues but brings in
 * no money, and a pending one has not arrived yet. Every payment is in ZAR
 * (payments_currency_check), so this is a plain rand total.
 */
export async function receivedTotal(cycle: number): Promise<number> {
  const db = createHttpDb();
  const [row] = await db
    .select({
      // bigint comes back as a string; a camp's year fits a safe integer.
      amountMinor: sql<string>`coalesce(sum(${schema.payments.amountCents}), 0)`,
    })
    .from(schema.payments)
    .where(
      and(
        eq(schema.payments.cycle, cycle),
        eq(schema.payments.status, "reconciled"),
      ),
    );
  return Number(row?.amountMinor ?? 0);
}

/**
 * SQL for "this member's dues are settled for `cycle`", the same rule as
 * duesSettled in @camp404/core: with live charges (#240), the balance is paid
 * down to zero or below; with none, any payment that year received or waived.
 * The roster and the member panel both read this.
 */
export function duesSettledSql(userId: typeof schema.users.id, cycle: number) {
  return sql<boolean>`case
    when exists (
      select 1 from dues_charges c
      where c.user_id = ${userId} and c.cycle = ${cycle} and c.cancelled_at is null
    ) then (
      coalesce((
        select sum(c.amount_cents) from dues_charges c
        where c.user_id = ${userId} and c.cycle = ${cycle} and c.cancelled_at is null
      ), 0)
      - coalesce((
        select sum(p.amount_cents) from payments p
        where p.user_id = ${userId} and p.cycle = ${cycle}
          and p.status in ('reconciled', 'waived')
      ), 0)
      + coalesce((
        select sum(r.amount_cents) from payment_refunds r
        where r.user_id = ${userId} and r.cycle = ${cycle} and r.status = 'refunded'
      ), 0)
    ) <= 0
    else exists (
      select 1 from payments p
      where p.user_id = ${userId} and p.cycle = ${cycle}
        and p.status in ('reconciled', 'waived')
    )
  end`;
}
