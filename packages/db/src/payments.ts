import { and, count, desc, eq, isNull, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import {
  formatMemberRefCode,
  paymentReference,
  type PaymentStatus,
} from "@camp404/core";
import { writeAuditEvent } from "./audit";
import { currentCycleNumber } from "./cycles";
import { createHttpDb, withTransaction } from "./index";
import * as schema from "./schema";

// The payments ledger (owner's call, 2026-09-16). The app never moves money:
// a member pays the camp by EFT quoting their reference, and a captain records
// what the bank statement shows. Every write leaves an audit row in the same
// transaction. Captain-gated by every caller.

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
  amountCents: number;
  status: PaymentStatus;
  /** What the captain saw, e.g. the bank statement line. */
  note?: string | null;
  recordedByUserId: string;
}

/**
 * Record a payment for this year. The reference is the member's reference,
 * the year, and their payment count that year (`C404-M017-2027-2`).
 */
export async function recordPayment(
  input: RecordPaymentInput,
): Promise<{ id: string; reference: string }> {
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

  for (let attempt = 0; attempt < RETRIES; attempt++) {
    try {
      return await withTransaction(async (tx) => {
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
            reference,
            status: input.status,
            note,
            recordedByUserId: input.recordedByUserId,
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
            status: input.status,
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
 */
export async function setPaymentStatus(input: {
  paymentId: string;
  from: PaymentStatus;
  to: PaymentStatus;
  actorId: string;
}): Promise<boolean> {
  if (input.from === input.to) return false;
  return withTransaction(async (tx) => {
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
  createdAt: Date;
}

/** Every payment in one burn year, newest first. */
export async function listPayments(cycle: number): Promise<PaymentRow[]> {
  const db = createHttpDb();
  const member = alias(schema.users, "member");
  const recorder = alias(schema.users, "recorder");
  return db
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
      createdAt: schema.payments.createdAt,
    })
    .from(schema.payments)
    .innerJoin(member, eq(member.id, schema.payments.userId))
    .leftJoin(recorder, eq(recorder.id, schema.payments.recordedByUserId))
    .where(eq(schema.payments.cycle, cycle))
    .orderBy(desc(schema.payments.createdAt), desc(schema.payments.id));
}

/**
 * SQL for "this member's dues are settled for `cycle`": any payment that year
 * reconciled or waived. The roster and the member panel both read this.
 */
export function duesSettledSql(userId: typeof schema.users.id, cycle: number) {
  return sql<boolean>`exists (
    select 1 from payments p
    where p.user_id = ${userId} and p.cycle = ${cycle}
      and p.status in ('reconciled', 'waived')
  )`;
}
