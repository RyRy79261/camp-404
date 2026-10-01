import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import {
  campDayKey,
  canManageMoney,
  duesBalance,
  nextInstalment,
  paymentFigures,
  proposeRefund,
  splitEvenly,
  type DuesBalance,
  type NextInstalment,
  type PaymentFigures,
  type RefundRule,
} from "@camp404/core";
import type {
  ChargeKind,
  ChargeInput,
  DuesYearInput,
  FeeTierInput,
  ParticipationStatus,
  PaymentMethod,
  PaymentPlanInput,
  PaymentSource,
  PledgeInput,
  RefundStatus,
  SetFeeInput,
  SettleUpInput,
} from "@camp404/types";
import { writeAuditEvent, type DbOrTx } from "./audit";
import { lockSenderReach } from "./broadcasts";
import { createHttpDb, withTransaction, type Tx } from "./index";
import { reachRank } from "./power";
import * as schema from "./schema";
import type { PaymentStatus } from "@camp404/core";

// Dues (#240): the data layer for what each member owes the camp for a year.
//
//  - A member reads only their own account (getMemberDues with forFinance
//    false leaves out what the Finance team keeps to itself: a concession's
//    reason and the ledger notes).
//  - The Finance team (captains and Finance leads, canManageMoney) reads every
//    account and writes them. Every Finance write re-reads the actor's rank and
//    the teams they lead INSIDE its own transaction (lockMoneyKeeper, through
//    lockSenderReach), so a demotion that committed first is seen and one
//    that comes later waits. A caller passes only who is acting.
//  - Every Finance write leaves its audit row in the same transaction. Each
//    decision is a compare-and-set on the state the actor saw, and a lost race
//    says so in a sentence.
//  - Money is whole rand cents, ZAR only; each table's CHECK is the last guard.
//
// PGlite has ONE connection: everything inside a transaction goes through
// `tx`, never createHttpDb().

export type MoneyResult<T = object> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

export const NOT_A_MONEY_KEEPER =
  "Only captains and Finance leads can change the camp's dues.";
export const YEAR_CHANGED =
  "Someone changed this year's dues dates first. Reload the page.";
export const TIER_GONE = "That fee tier isn't there any more. Reload the page.";
export const TOO_MANY_TIERS = "A year has at most 12 fee tiers.";
export const NO_TIERS_YET =
  "The Finance team hasn't set this year's fees yet. Check back soon.";
export const PLEDGE_NOT_BELOW =
  "A pledge below the lowest tier must be less than it. Otherwise pick a tier.";
export const FEE_ALREADY_SET =
  "Your camp fee is already set. Ask the Finance team if it needs to change.";
export const FEE_CHANGED =
  "Someone changed this member's fee first. Reload the page.";
export const CHARGE_GONE =
  "That charge was already cancelled. Reload the page.";
export const PLAN_CHANGED =
  "Someone changed this member's plan first. Reload the page.";
export const NO_SUCH_MEMBER = "That member isn't in the camp.";
export const SETTLE_UP_CHANGED =
  "The members to share it across changed. Preview it again.";
export const SETTLE_UP_NOBODY =
  "Nobody has a camp fee this year to share it across.";
export const REFUND_NOT_RECEIVED =
  "Only a payment the camp has received can be refunded.";
export const REFUND_ALREADY_OPEN =
  "This payment already has a refund. Reload the page.";
export const REFUND_TOO_LARGE = "A refund can't be more than the payment.";
export const REFUND_CHANGED =
  "Someone already decided this refund. Reload the page.";
export const NOT_YOUR_PAYMENT = "That isn't one of your payments.";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// --- Transactions ------------------------------------------------------------

/** A refusal thrown inside a transaction, so it rolls back everything. */
export class MoneyRefused extends Error {
  constructor(readonly sentence: string) {
    super(sentence);
    this.name = "MoneyRefused";
  }
}

function refuse(sentence: string): never {
  throw new MoneyRefused(sentence);
}

/** Postgres unique_violation, which drizzle may nest under `.cause`. */
function isUniqueViolation(err: unknown): boolean {
  for (let e = err as { code?: string; cause?: unknown } | undefined; e; ) {
    if (e.code === "23505") return true;
    e = e.cause as typeof e;
  }
  return false;
}

async function write<T extends object>(
  fn: (tx: Tx) => Promise<T>,
  onUnique?: string,
): Promise<MoneyResult<T>> {
  try {
    const value = await withTransaction(fn);
    return { ok: true, ...value };
  } catch (error) {
    if (error instanceof MoneyRefused)
      return { ok: false, error: error.sentence };
    if (onUnique && isUniqueViolation(error)) {
      return { ok: false, error: onUnique };
    }
    throw error;
  }
}

/**
 * Whether the actor may keep the camp's money, read and locked inside the
 * write's own transaction: a captain, or a lead of Finance this year.
 */
export async function lockMoneyKeeper(
  tx: DbOrTx,
  actorId: string,
): Promise<boolean> {
  if (!UUID.test(actorId)) return false;
  const reach = await lockSenderReach(tx, actorId);
  return canManageMoney(reachRank(reach), reach ?? []);
}

async function assertMoneyKeeper(tx: Tx, actorId: string): Promise<void> {
  if (!(await lockMoneyKeeper(tx, actorId))) refuse(NOT_A_MONEY_KEEPER);
}

/** A real, not erased, camp member, or a refusal. */
async function assertMember(tx: Tx, userId: string): Promise<void> {
  if (!UUID.test(userId)) refuse(NO_SUCH_MEMBER);
  const [row] = await tx
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(
      and(
        eq(schema.users.id, userId),
        eq(schema.users.isSystem, false),
        eq(schema.users.sanitised, false),
      ),
    )
    .limit(1);
  if (!row) refuse(NO_SUCH_MEMBER);
}

// --- The year's settings -----------------------------------------------------------

export interface DuesYear {
  cycle: number;
  deadline: string | null;
  fullRefundUntil: string | null;
  partialRefundUntil: string | null;
  partialRefundPct: number | null;
  /** 0 before anyone saved the year. */
  version: number;
}

function emptyYear(cycle: number): DuesYear {
  return {
    cycle,
    deadline: null,
    fullRefundUntil: null,
    partialRefundUntil: null,
    partialRefundPct: null,
    version: 0,
  };
}

/** The year's deadline and refund schedule; all empty when none is set. */
export async function getDuesYear(
  cycle: number,
  db: DbOrTx = createHttpDb(),
): Promise<DuesYear> {
  const [row] = await db
    .select()
    .from(schema.duesYears)
    .where(eq(schema.duesYears.cycle, cycle))
    .limit(1);
  if (!row) return emptyYear(cycle);
  return {
    cycle,
    deadline: row.deadline,
    fullRefundUntil: row.fullRefundUntil,
    partialRefundUntil: row.partialRefundUntil,
    partialRefundPct: row.partialRefundPct,
    version: row.version,
  };
}

/** Save the year's dates. A compare-and-set on the version the actor saw. */
export async function saveDuesYear(
  input: DuesYearInput & { cycle: number; actorId: string },
): Promise<MoneyResult<{ version: number }>> {
  return write(async (tx) => {
    await assertMoneyKeeper(tx, input.actorId);
    const now = new Date();
    const values = {
      deadline: input.deadline,
      fullRefundUntil: input.fullRefundUntil,
      partialRefundUntil: input.partialRefundUntil,
      partialRefundPct: input.partialRefundPct,
      updatedByUserId: input.actorId,
      updatedAt: now,
    };
    const next = input.expectedVersion + 1;
    const rows =
      input.expectedVersion === 0
        ? await tx
            .insert(schema.duesYears)
            .values({ cycle: input.cycle, ...values, version: next })
            .onConflictDoNothing({ target: schema.duesYears.cycle })
            .returning({ version: schema.duesYears.version })
        : await tx
            .update(schema.duesYears)
            .set({ ...values, version: next })
            .where(
              and(
                eq(schema.duesYears.cycle, input.cycle),
                eq(schema.duesYears.version, input.expectedVersion),
              ),
            )
            .returning({ version: schema.duesYears.version });
    if (rows.length === 0) refuse(YEAR_CHANGED);
    await writeAuditEvent(tx, {
      actorId: input.actorId,
      action: "dues.year_saved",
      target: String(input.cycle),
      metadata: {
        cycle: input.cycle,
        deadline: input.deadline,
        fullRefundUntil: input.fullRefundUntil,
        partialRefundUntil: input.partialRefundUntil,
        partialRefundPct: input.partialRefundPct,
      },
    });
    return { version: next };
  });
}

export interface FeeTier {
  id: string;
  label: string;
  amountCents: number;
  currency: string;
  archived: boolean;
}

/** The year's fee tiers, cheapest first. Archived ones only when asked. */
export async function listFeeTiers(
  cycle: number,
  options: { includeArchived?: boolean } = {},
  db: DbOrTx = createHttpDb(),
): Promise<FeeTier[]> {
  const rows = await db
    .select()
    .from(schema.feeTiers)
    .where(
      and(
        eq(schema.feeTiers.cycle, cycle),
        options.includeArchived
          ? undefined
          : isNull(schema.feeTiers.archivedAt),
      ),
    )
    .orderBy(asc(schema.feeTiers.amountCents), asc(schema.feeTiers.label));
  return rows.map((t) => ({
    id: t.id,
    label: t.label,
    amountCents: t.amountCents,
    currency: t.currency,
    archived: t.archivedAt !== null,
  }));
}

/** Add a fee tier to the year. */
export async function addFeeTier(
  input: FeeTierInput & { cycle: number; actorId: string },
): Promise<MoneyResult<{ id: string }>> {
  return write(async (tx) => {
    await assertMoneyKeeper(tx, input.actorId);
    const live = await listFeeTiers(input.cycle, {}, tx);
    if (live.length >= 12) refuse(TOO_MANY_TIERS);
    const [row] = await tx
      .insert(schema.feeTiers)
      .values({
        cycle: input.cycle,
        label: input.label,
        amountCents: input.amountCents,
      })
      .returning({ id: schema.feeTiers.id });
    await writeAuditEvent(tx, {
      actorId: input.actorId,
      action: "dues.tier_added",
      target: row!.id,
      metadata: {
        cycle: input.cycle,
        label: input.label,
        amountCents: input.amountCents,
      },
    });
    return { id: row!.id };
  });
}

/**
 * Rename or re-price a live tier. A pledge already made keeps the amount it
 * was made at (dues_accounts keeps it), and so does a fee already charged.
 */
export async function editFeeTier(
  input: FeeTierInput & { tierId: string; actorId: string },
): Promise<MoneyResult> {
  return write(async (tx) => {
    await assertMoneyKeeper(tx, input.actorId);
    if (!UUID.test(input.tierId)) refuse(TIER_GONE);
    const rows = await tx
      .update(schema.feeTiers)
      .set({
        label: input.label,
        amountCents: input.amountCents,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.feeTiers.id, input.tierId),
          isNull(schema.feeTiers.archivedAt),
        ),
      )
      .returning({ cycle: schema.feeTiers.cycle });
    if (rows.length === 0) refuse(TIER_GONE);
    await writeAuditEvent(tx, {
      actorId: input.actorId,
      action: "dues.tier_changed",
      target: input.tierId,
      metadata: {
        cycle: rows[0]!.cycle,
        label: input.label,
        amountCents: input.amountCents,
      },
    });
    return {};
  });
}

/** Take a tier off the list. Pledges made on it keep their label and amount. */
export async function archiveFeeTier(input: {
  tierId: string;
  actorId: string;
}): Promise<MoneyResult> {
  return write(async (tx) => {
    await assertMoneyKeeper(tx, input.actorId);
    if (!UUID.test(input.tierId)) refuse(TIER_GONE);
    const rows = await tx
      .update(schema.feeTiers)
      .set({ archivedAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(schema.feeTiers.id, input.tierId),
          isNull(schema.feeTiers.archivedAt),
        ),
      )
      .returning({
        cycle: schema.feeTiers.cycle,
        label: schema.feeTiers.label,
      });
    if (rows.length === 0) refuse(TIER_GONE);
    await writeAuditEvent(tx, {
      actorId: input.actorId,
      action: "dues.tier_archived",
      target: input.tierId,
      metadata: { cycle: rows[0]!.cycle, label: rows[0]!.label },
    });
    return {};
  });
}

// --- A member's account --------------------------------------------------------------

export interface Pledge {
  tierId: string | null;
  /** The tier's label, or null for a pledge below the lowest tier. */
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
  /** A fee's pledged amount, when a concession set it lower. */
  standardAmountCents: number | null;
  /** The concession's reason. Always null on a member's own read. */
  concessionReason: string | null;
  /** True when the fee was lowered or given with a reason. */
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
  planVersion: number;
  instalments: { dueOn: string; amountCents: number }[];
  charges: DuesChargeRow[];
  payments: DuesPaymentRow[];
  participation: {
    status: ParticipationStatus;
    /** The camp day they said No after holding a place, else null. */
    withdrewOn: string | null;
  } | null;
  balance: DuesBalance;
  next: NextInstalment | null;
}

function isConcession(c: {
  kind: ChargeKind;
  standardAmountCents: number | null;
  amountCents: number;
  concessionReason: string | null;
}): boolean {
  if (c.kind !== "fee") return false;
  return (
    c.concessionReason !== null ||
    (c.standardAmountCents !== null && c.amountCents < c.standardAmountCents)
  );
}

/**
 * One member's dues for a year, or null when there is no such member. A
 * member's own read (`forFinance` false) leaves out the concession reason and
 * the ledger notes, which the Finance team keeps to itself.
 */
export async function getMemberDues(
  userId: string,
  cycle: number,
  options: { forFinance: boolean; today?: string },
): Promise<MemberDues | null> {
  if (!UUID.test(userId)) return null;
  const db = createHttpDb();
  const [users, accounts, charges, payments, refunds, instalments, places] =
    await Promise.all([
      db
        .select({
          id: schema.users.id,
          name: schema.users.displayName,
          refCode: schema.users.refCode,
        })
        .from(schema.users)
        .where(
          and(eq(schema.users.id, userId), eq(schema.users.isSystem, false)),
        )
        .limit(1),
      db
        .select({
          tierId: schema.duesAccounts.pledgedTierId,
          tierLabel: schema.feeTiers.label,
          amountCents: schema.duesAccounts.pledgedAmountCents,
          pledgedAt: schema.duesAccounts.pledgedAt,
          planVersion: schema.duesAccounts.planVersion,
        })
        .from(schema.duesAccounts)
        .leftJoin(
          schema.feeTiers,
          eq(schema.feeTiers.id, schema.duesAccounts.pledgedTierId),
        )
        .where(
          and(
            eq(schema.duesAccounts.userId, userId),
            eq(schema.duesAccounts.cycle, cycle),
          ),
        )
        .limit(1),
      db
        .select()
        .from(schema.duesCharges)
        .where(
          and(
            eq(schema.duesCharges.userId, userId),
            eq(schema.duesCharges.cycle, cycle),
          ),
        )
        .orderBy(asc(schema.duesCharges.createdAt), asc(schema.duesCharges.id)),
      db
        .select()
        .from(schema.payments)
        .where(
          and(
            eq(schema.payments.userId, userId),
            eq(schema.payments.cycle, cycle),
          ),
        )
        .orderBy(desc(schema.payments.createdAt), desc(schema.payments.id)),
      db
        .select()
        .from(schema.paymentRefunds)
        .where(
          and(
            eq(schema.paymentRefunds.userId, userId),
            eq(schema.paymentRefunds.cycle, cycle),
          ),
        )
        .orderBy(desc(schema.paymentRefunds.createdAt)),
      db
        .select({
          dueOn: schema.duesInstalments.dueOn,
          amountCents: schema.duesInstalments.amountCents,
        })
        .from(schema.duesInstalments)
        .where(
          and(
            eq(schema.duesInstalments.userId, userId),
            eq(schema.duesInstalments.cycle, cycle),
          ),
        )
        .orderBy(asc(schema.duesInstalments.dueOn)),
      db
        .select({
          status: schema.campParticipations.status,
          updatedAt: schema.campParticipations.updatedAt,
        })
        .from(schema.campParticipations)
        .where(
          and(
            eq(schema.campParticipations.userId, userId),
            eq(schema.campParticipations.cycle, cycle),
          ),
        )
        .limit(1),
    ]);
  const user = users[0];
  if (!user) return null;
  const account = accounts[0];

  const refundRows: DuesRefundRow[] = refunds.map((r) => ({
    id: r.id,
    paymentId: r.paymentId,
    status: r.status,
    proposedCents: r.proposedCents,
    amountCents: r.amountCents,
    currency: r.currency,
    note: options.forFinance ? r.note : null,
    declineReason: r.declineReason,
    decidedAt: r.decidedAt,
    createdAt: r.createdAt,
  }));
  const chargeRows: DuesChargeRow[] = charges.map((c) => ({
    id: c.id,
    kind: c.kind,
    description: c.description,
    amountCents: c.amountCents,
    currency: c.currency,
    standardAmountCents: options.forFinance ? c.standardAmountCents : null,
    concessionReason: options.forFinance ? c.concessionReason : null,
    concession: options.forFinance ? isConcession(c) : false,
    cancelled: c.cancelledAt !== null,
    createdAt: c.createdAt,
  }));
  const paymentRows: DuesPaymentRow[] = payments.map((p) => ({
    id: p.id,
    reference: p.reference,
    amountCents: p.amountCents,
    currency: p.currency,
    status: p.status,
    source: p.source,
    method: p.method,
    paidOn: p.paidOn,
    hasProof: p.proofPathname !== null,
    note: options.forFinance ? p.note : null,
    createdAt: p.createdAt,
    refund: refundRows.find((r) => r.paymentId === p.id) ?? null,
  }));
  const balance = duesBalance({
    charges: charges.filter((c) => c.cancelledAt === null),
    payments,
    refunds,
  });
  const place = places[0];
  const today = options.today ?? campDayKey(new Date());
  return {
    userId,
    cycle,
    name: user.name?.trim() || "Unnamed burner",
    refCode: user.refCode,
    pledge:
      account && account.amountCents !== null
        ? {
            tierId: account.tierId,
            tierLabel: account.tierLabel,
            amountCents: account.amountCents,
            pledgedAt: account.pledgedAt,
          }
        : null,
    planVersion: account?.planVersion ?? 0,
    instalments,
    charges: chargeRows,
    payments: paymentRows,
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
    next: nextInstalment(instalments, balance.paidCents, today),
  };
}

/**
 * Charge the member's camp fee from their pledge, when they have one and no
 * live fee yet. Inside the caller's transaction: a captain accepting the
 * member, or the member pledging once accepted. Idempotent: the partial unique
 * index keeps it to one live fee, and a second call does nothing.
 */
export async function chargeFeeFromPledge(
  tx: Tx,
  input: { userId: string; cycle: number; actorId: string },
): Promise<boolean> {
  const [account] = await tx
    .select({
      amountCents: schema.duesAccounts.pledgedAmountCents,
      tierLabel: schema.feeTiers.label,
    })
    .from(schema.duesAccounts)
    .leftJoin(
      schema.feeTiers,
      eq(schema.feeTiers.id, schema.duesAccounts.pledgedTierId),
    )
    .where(
      and(
        eq(schema.duesAccounts.userId, input.userId),
        eq(schema.duesAccounts.cycle, input.cycle),
      ),
    )
    .limit(1);
  if (!account || account.amountCents === null) return false;
  const description = account.tierLabel
    ? `Camp fee: ${account.tierLabel}`
    : "Camp fee: pledged amount";
  const rows = await tx
    .insert(schema.duesCharges)
    .values({
      userId: input.userId,
      cycle: input.cycle,
      kind: "fee",
      description,
      amountCents: account.amountCents,
      createdByUserId: input.actorId,
    })
    .onConflictDoNothing({
      target: [schema.duesCharges.userId, schema.duesCharges.cycle],
      where: sql`${schema.duesCharges.kind} = 'fee' and ${schema.duesCharges.cancelledAt} is null`,
    })
    .returning({ id: schema.duesCharges.id });
  if (rows.length === 0) return false;
  await writeAuditEvent(tx, {
    actorId: input.actorId,
    action: "dues.fee_charged",
    target: input.userId,
    metadata: {
      cycle: input.cycle,
      description,
      amountCents: account.amountCents,
    },
  });
  return true;
}

/**
 * A member pledges what they can pay this year: a tier, or an amount below the
 * lowest tier. Refused once their fee is charged (the Finance team changes it
 * then). A member already accepted is charged the fee at once.
 */
export async function savePledge(input: {
  userId: string;
  cycle: number;
  pledge: PledgeInput;
}): Promise<MoneyResult<{ charged: boolean }>> {
  return write(async (tx) => {
    await assertMember(tx, input.userId);
    const tiers = await listFeeTiers(input.cycle, {}, tx);
    if (tiers.length === 0) refuse(NO_TIERS_YET);
    let tierId: string | null = null;
    let amountCents: number;
    const pledge = input.pledge;
    if (pledge.kind === "tier") {
      const tier = tiers.find((t) => t.id === pledge.tierId);
      if (!tier) refuse(TIER_GONE);
      tierId = tier.id;
      amountCents = tier.amountCents;
    } else {
      if (pledge.amountCents >= tiers[0]!.amountCents) {
        refuse(PLEDGE_NOT_BELOW);
      }
      amountCents = pledge.amountCents;
    }
    const [fee] = await tx
      .select({ id: schema.duesCharges.id })
      .from(schema.duesCharges)
      .where(
        and(
          eq(schema.duesCharges.userId, input.userId),
          eq(schema.duesCharges.cycle, input.cycle),
          eq(schema.duesCharges.kind, "fee"),
          isNull(schema.duesCharges.cancelledAt),
        ),
      )
      .limit(1)
      .for("update");
    if (fee) refuse(FEE_ALREADY_SET);
    const now = new Date();
    await tx
      .insert(schema.duesAccounts)
      .values({
        userId: input.userId,
        cycle: input.cycle,
        pledgedTierId: tierId,
        pledgedAmountCents: amountCents,
        pledgedAt: now,
      })
      .onConflictDoUpdate({
        target: [schema.duesAccounts.userId, schema.duesAccounts.cycle],
        set: {
          pledgedTierId: tierId,
          pledgedAmountCents: amountCents,
          pledgedAt: now,
          updatedAt: now,
        },
      });
    const [place] = await tx
      .select({ status: schema.campParticipations.status })
      .from(schema.campParticipations)
      .where(
        and(
          eq(schema.campParticipations.userId, input.userId),
          eq(schema.campParticipations.cycle, input.cycle),
        ),
      )
      .limit(1)
      // Locked, so a captain accepting the member at the same moment is
      // serialised with this pledge: whichever commits second sees the other
      // and charges the fee, instead of each missing the other's write.
      .for("update");
    const charged =
      place?.status === "accepted"
        ? await chargeFeeFromPledge(tx, {
            userId: input.userId,
            cycle: input.cycle,
            actorId: input.userId,
          })
        : false;
    return { charged };
  });
}

/**
 * Set a member's camp fee: the Finance team's override, or a concession (an
 * amount below the pledge, or any amount with a reason). A compare-and-set on
 * the fee the actor saw (`expectedFeeId`, null for none): that fee is
 * cancelled and the new one charged, together.
 */
export async function setFee(
  input: SetFeeInput & {
    cycle: number;
    expectedFeeId: string | null;
    actorId: string;
  },
): Promise<MoneyResult<{ id: string }>> {
  return write(async (tx) => {
    await assertMoneyKeeper(tx, input.actorId);
    await assertMember(tx, input.userId);
    const [live] = await tx
      .select({
        id: schema.duesCharges.id,
        amountCents: schema.duesCharges.amountCents,
        standardAmountCents: schema.duesCharges.standardAmountCents,
      })
      .from(schema.duesCharges)
      .where(
        and(
          eq(schema.duesCharges.userId, input.userId),
          eq(schema.duesCharges.cycle, input.cycle),
          eq(schema.duesCharges.kind, "fee"),
          isNull(schema.duesCharges.cancelledAt),
        ),
      )
      .limit(1)
      .for("update");
    if ((live?.id ?? null) !== input.expectedFeeId) refuse(FEE_CHANGED);
    const [account] = await tx
      .select({ pledged: schema.duesAccounts.pledgedAmountCents })
      .from(schema.duesAccounts)
      .where(
        and(
          eq(schema.duesAccounts.userId, input.userId),
          eq(schema.duesAccounts.cycle, input.cycle),
        ),
      )
      .limit(1);
    const now = new Date();
    if (live) {
      await tx
        .update(schema.duesCharges)
        .set({
          cancelledAt: now,
          cancelledByUserId: input.actorId,
          updatedAt: now,
        })
        .where(eq(schema.duesCharges.id, live.id));
    }
    // What the fee would be without a concession: the pledge, else the fee
    // this one replaces.
    const standard =
      account?.pledged ??
      live?.standardAmountCents ??
      live?.amountCents ??
      null;
    const [row] = await tx
      .insert(schema.duesCharges)
      .values({
        userId: input.userId,
        cycle: input.cycle,
        kind: "fee",
        description: "Camp fee",
        amountCents: input.amountCents,
        standardAmountCents: standard,
        concessionReason: input.concessionReason,
        createdByUserId: input.actorId,
      })
      .returning({ id: schema.duesCharges.id });
    const concession =
      input.concessionReason !== null ||
      (standard !== null && input.amountCents < standard);
    await writeAuditEvent(tx, {
      actorId: input.actorId,
      action: "dues.fee_set",
      target: input.userId,
      // The reason stays on the charge, where only the Finance team reads it.
      metadata: {
        cycle: input.cycle,
        amountCents: input.amountCents,
        concession,
      },
    });
    return { id: row!.id };
  }, FEE_CHANGED);
}

/** Add a rental or other charge to a member's account. */
export async function addCharge(
  input: ChargeInput & { cycle: number; actorId: string },
): Promise<MoneyResult<{ id: string }>> {
  return write(async (tx) => {
    await assertMoneyKeeper(tx, input.actorId);
    await assertMember(tx, input.userId);
    const [row] = await tx
      .insert(schema.duesCharges)
      .values({
        userId: input.userId,
        cycle: input.cycle,
        kind: input.kind,
        description: input.description,
        amountCents: input.amountCents,
        createdByUserId: input.actorId,
      })
      .returning({ id: schema.duesCharges.id });
    await writeAuditEvent(tx, {
      actorId: input.actorId,
      action: "dues.charge_added",
      target: input.userId,
      metadata: {
        cycle: input.cycle,
        kind: input.kind,
        description: input.description,
        amountCents: input.amountCents,
      },
    });
    return { id: row!.id };
  });
}

/** Cancel a live charge. A compare-and-set: refused when already cancelled. */
export async function cancelCharge(input: {
  chargeId: string;
  actorId: string;
}): Promise<MoneyResult> {
  return write(async (tx) => {
    await assertMoneyKeeper(tx, input.actorId);
    if (!UUID.test(input.chargeId)) refuse(CHARGE_GONE);
    const now = new Date();
    const rows = await tx
      .update(schema.duesCharges)
      .set({
        cancelledAt: now,
        cancelledByUserId: input.actorId,
        updatedAt: now,
      })
      .where(
        and(
          eq(schema.duesCharges.id, input.chargeId),
          isNull(schema.duesCharges.cancelledAt),
        ),
      )
      .returning({
        userId: schema.duesCharges.userId,
        cycle: schema.duesCharges.cycle,
        description: schema.duesCharges.description,
        amountCents: schema.duesCharges.amountCents,
      });
    const row = rows[0];
    if (!row) refuse(CHARGE_GONE);
    await writeAuditEvent(tx, {
      actorId: input.actorId,
      action: "dues.charge_cancelled",
      target: row.userId,
      metadata: {
        cycle: row.cycle,
        description: row.description,
        amountCents: row.amountCents,
      },
    });
    return {};
  });
}

/**
 * Replace a member's payment plan. A compare-and-set on the plan version the
 * actor saw; an empty list removes the plan.
 */
export async function setPaymentPlan(
  input: PaymentPlanInput & { cycle: number; actorId: string },
): Promise<MoneyResult<{ version: number }>> {
  return write(async (tx) => {
    await assertMoneyKeeper(tx, input.actorId);
    await assertMember(tx, input.userId);
    await tx
      .insert(schema.duesAccounts)
      .values({ userId: input.userId, cycle: input.cycle })
      .onConflictDoNothing({
        target: [schema.duesAccounts.userId, schema.duesAccounts.cycle],
      });
    const next = input.expectedVersion + 1;
    const moved = await tx
      .update(schema.duesAccounts)
      .set({ planVersion: next, updatedAt: new Date() })
      .where(
        and(
          eq(schema.duesAccounts.userId, input.userId),
          eq(schema.duesAccounts.cycle, input.cycle),
          eq(schema.duesAccounts.planVersion, input.expectedVersion),
        ),
      )
      .returning({ version: schema.duesAccounts.planVersion });
    if (moved.length === 0) refuse(PLAN_CHANGED);
    await tx
      .delete(schema.duesInstalments)
      .where(
        and(
          eq(schema.duesInstalments.userId, input.userId),
          eq(schema.duesInstalments.cycle, input.cycle),
        ),
      );
    if (input.instalments.length > 0) {
      await tx.insert(schema.duesInstalments).values(
        input.instalments.map((i) => ({
          userId: input.userId,
          cycle: input.cycle,
          dueOn: i.dueOn,
          amountCents: i.amountCents,
        })),
      );
    }
    await writeAuditEvent(tx, {
      actorId: input.actorId,
      action: "dues.plan_set",
      target: input.userId,
      metadata: {
        cycle: input.cycle,
        instalments: input.instalments.length,
        totalCents: input.instalments.reduce((s, i) => s + i.amountCents, 0),
      },
    });
    return { version: next };
  });
}

// --- Every member, for the Finance team -------------------------------------------------

export interface DuesAccountRow {
  userId: string;
  name: string;
  refCode: string | null;
  participation: ParticipationStatus | null;
  pledgeLabel: string | null;
  pledgeCents: number | null;
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
}

/**
 * Every member's dues for a year, for the Finance team's list of who owes
 * what: approved, real, not erased. Six reads side by side, joined here.
 */
export async function listDuesAccounts(
  cycle: number,
  today: string,
): Promise<DuesAccountRow[]> {
  const db = createHttpDb();
  const [members, accounts, charges, payments, refunds, instalments] =
    await Promise.all([
      db
        .select({
          id: schema.users.id,
          name: schema.users.displayName,
          refCode: schema.users.refCode,
          status: schema.campParticipations.status,
        })
        .from(schema.users)
        .leftJoin(
          schema.campParticipations,
          and(
            eq(schema.campParticipations.userId, schema.users.id),
            eq(schema.campParticipations.cycle, cycle),
          ),
        )
        .where(
          and(
            eq(schema.users.isSystem, false),
            eq(schema.users.sanitised, false),
            eq(schema.users.approvalStatus, "approved"),
          ),
        ),
      db
        .select({
          userId: schema.duesAccounts.userId,
          label: schema.feeTiers.label,
          amountCents: schema.duesAccounts.pledgedAmountCents,
        })
        .from(schema.duesAccounts)
        .leftJoin(
          schema.feeTiers,
          eq(schema.feeTiers.id, schema.duesAccounts.pledgedTierId),
        )
        .where(eq(schema.duesAccounts.cycle, cycle)),
      db
        .select()
        .from(schema.duesCharges)
        .where(
          and(
            eq(schema.duesCharges.cycle, cycle),
            isNull(schema.duesCharges.cancelledAt),
          ),
        ),
      db
        .select({
          userId: schema.payments.userId,
          amountCents: schema.payments.amountCents,
          currency: schema.payments.currency,
          status: schema.payments.status,
          source: schema.payments.source,
        })
        .from(schema.payments)
        .where(eq(schema.payments.cycle, cycle)),
      db
        .select({
          userId: schema.paymentRefunds.userId,
          amountCents: schema.paymentRefunds.amountCents,
          currency: schema.paymentRefunds.currency,
          status: schema.paymentRefunds.status,
        })
        .from(schema.paymentRefunds)
        .where(eq(schema.paymentRefunds.cycle, cycle)),
      db
        .select({
          userId: schema.duesInstalments.userId,
          dueOn: schema.duesInstalments.dueOn,
          amountCents: schema.duesInstalments.amountCents,
        })
        .from(schema.duesInstalments)
        .where(eq(schema.duesInstalments.cycle, cycle)),
    ]);
  const by = <T extends { userId: string }>(rows: readonly T[]) => {
    const map = new Map<string, T[]>();
    for (const row of rows) {
      const list = map.get(row.userId) ?? [];
      list.push(row);
      map.set(row.userId, list);
    }
    return map;
  };
  const accountOf = new Map(accounts.map((a) => [a.userId, a]));
  const chargesOf = by(charges);
  const paymentsOf = by(payments);
  const refundsOf = by(refunds);
  const plansOf = by(instalments);
  return members
    .map((m) => {
      const mine = chargesOf.get(m.id) ?? [];
      const paid = paymentsOf.get(m.id) ?? [];
      const refunded = refundsOf.get(m.id) ?? [];
      const balance = duesBalance({
        charges: mine,
        payments: paid,
        refunds: refunded,
      });
      const fee = mine.find((c) => c.kind === "fee");
      const account = accountOf.get(m.id);
      return {
        userId: m.id,
        name: m.name?.trim() || "Unnamed burner",
        refCode: m.refCode,
        participation: m.status,
        pledgeLabel:
          account?.amountCents != null ? (account.label ?? null) : null,
        pledgeCents: account?.amountCents ?? null,
        feeCents: fee?.amountCents ?? null,
        concession: fee ? isConcession(fee) : false,
        balance,
        next: nextInstalment(plansOf.get(m.id) ?? [], balance.paidCents, today),
        pendingProofs: paid.filter(
          (p) => p.status === "pending" && p.source === "member",
        ).length,
        figures: paymentFigures(paid),
        openRefunds: refunded.filter((r) => r.status === "requested").length,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

// --- Settle-up ---------------------------------------------------------------------------

export interface SettleUpCandidate {
  userId: string;
  name: string;
  concession: boolean;
}

/** The members a settle-up is shared across: everyone with a live camp fee. */
async function settleUpCandidatesIn(
  db: DbOrTx,
  cycle: number,
): Promise<SettleUpCandidate[]> {
  const rows = await db
    .select({
      userId: schema.duesCharges.userId,
      name: schema.users.displayName,
      kind: schema.duesCharges.kind,
      amountCents: schema.duesCharges.amountCents,
      standardAmountCents: schema.duesCharges.standardAmountCents,
      concessionReason: schema.duesCharges.concessionReason,
    })
    .from(schema.duesCharges)
    .innerJoin(schema.users, eq(schema.users.id, schema.duesCharges.userId))
    .where(
      and(
        eq(schema.duesCharges.cycle, cycle),
        eq(schema.duesCharges.kind, "fee"),
        isNull(schema.duesCharges.cancelledAt),
        eq(schema.users.sanitised, false),
      ),
    );
  return rows
    .map((r) => ({
      userId: r.userId,
      name: r.name?.trim() || "Unnamed burner",
      concession: isConcession(r),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function settleUpCandidates(
  cycle: number,
): Promise<SettleUpCandidate[]> {
  return settleUpCandidatesIn(createHttpDb(), cycle);
}

/**
 * Publish a settle-up: the total shared across the members the actor
 * previewed, as `settle_up` charges (negative for money back), in one
 * transaction with its audit row. Refused when the members to share it across
 * changed since the preview.
 */
export async function publishSettleUp(
  input: SettleUpInput & {
    cycle: number;
    previewedUserIds: readonly string[];
    actorId: string;
  },
): Promise<MoneyResult<{ id: string; members: number }>> {
  return write(async (tx) => {
    await assertMoneyKeeper(tx, input.actorId);
    const candidates = (await settleUpCandidatesIn(tx, input.cycle)).filter(
      (c) => !(input.skipConcessions && c.concession),
    );
    const ids = candidates.map((c) => c.userId).sort();
    const previewed = [...new Set(input.previewedUserIds)].sort();
    if (ids.length === 0) refuse(SETTLE_UP_NOBODY);
    if (ids.join(",") !== previewed.join(",")) refuse(SETTLE_UP_CHANGED);
    const sign = input.direction === "refund" ? -1 : 1;
    const shares = splitEvenly(input.totalCents, ids);
    const [batch] = await tx
      .insert(schema.duesSettleUps)
      .values({
        cycle: input.cycle,
        description: input.description,
        totalCents: sign * input.totalCents,
        memberCount: ids.length,
        createdByUserId: input.actorId,
      })
      .returning({ id: schema.duesSettleUps.id });
    const values = [...shares.entries()]
      .filter(([, cents]) => cents > 0)
      .map(([userId, cents]) => ({
        userId,
        cycle: input.cycle,
        kind: "settle_up" as const,
        description: input.description,
        amountCents: sign * cents,
        settleUpId: batch!.id,
        createdByUserId: input.actorId,
      }));
    if (values.length > 0) await tx.insert(schema.duesCharges).values(values);
    await writeAuditEvent(tx, {
      actorId: input.actorId,
      action: "dues.settle_up_published",
      target: batch!.id,
      metadata: {
        cycle: input.cycle,
        description: input.description,
        totalCents: sign * input.totalCents,
        members: ids.length,
        skipConcessions: input.skipConcessions,
      },
    });
    return { id: batch!.id, members: ids.length };
  });
}

// --- Refunds ------------------------------------------------------------------------------

export interface RefundProposal {
  amountCents: number | null;
  rule: RefundRule;
  /** The day the proposal is worked out from: the withdrawal, else today. */
  onDay: string;
}

/**
 * What the year's schedule proposes to pay back of a received payment: from
 * the day the member withdrew, or today when they have not.
 */
async function proposalFor(
  db: DbOrTx,
  payment: { userId: string; cycle: number; amountCents: number },
  today: string,
): Promise<RefundProposal> {
  // One after the other: inside a transaction they share one connection.
  const year = await getDuesYear(payment.cycle, db);
  const [place] = await db
    .select({
      status: schema.campParticipations.status,
      updatedAt: schema.campParticipations.updatedAt,
    })
    .from(schema.campParticipations)
    .where(
      and(
        eq(schema.campParticipations.userId, payment.userId),
        eq(schema.campParticipations.cycle, payment.cycle),
      ),
    )
    .limit(1);
  const onDay =
    place?.status === "not_attending" ? campDayKey(place.updatedAt) : today;
  return { ...proposeRefund(payment.amountCents, onDay, year), onDay };
}

/** The schedule's proposal for one payment, for the refund form. */
export async function proposeRefundFor(
  paymentId: string,
  today: string,
): Promise<RefundProposal | null> {
  if (!UUID.test(paymentId)) return null;
  const db = createHttpDb();
  const [payment] = await db
    .select({
      userId: schema.payments.userId,
      cycle: schema.payments.cycle,
      amountCents: schema.payments.amountCents,
    })
    .from(schema.payments)
    .where(eq(schema.payments.id, paymentId))
    .limit(1);
  return payment ? proposalFor(db, payment, today) : null;
}

/**
 * Ask for a refund of a received payment. The Finance team names the amount
 * (the schedule's proposal, or their own); a member asking for their own gets
 * the schedule's proposal (the whole payment when the year has none, for the
 * Finance team to change). One refund per payment that is not declined.
 */
export async function requestRefund(input: {
  paymentId: string;
  /** Null: a member's own request, at the schedule's amount. */
  amountCents: number | null;
  note: string | null;
  actorId: string;
  today: string;
}): Promise<MoneyResult<{ id: string }>> {
  return write(async (tx) => {
    if (!UUID.test(input.paymentId)) refuse(REFUND_NOT_RECEIVED);
    const [payment] = await tx
      .select({
        userId: schema.payments.userId,
        cycle: schema.payments.cycle,
        amountCents: schema.payments.amountCents,
        status: schema.payments.status,
        reference: schema.payments.reference,
      })
      .from(schema.payments)
      .where(eq(schema.payments.id, input.paymentId))
      .limit(1)
      .for("update");
    if (!payment) refuse(REFUND_NOT_RECEIVED);
    const asMember = input.amountCents === null;
    if (asMember) {
      if (payment.userId !== input.actorId) refuse(NOT_YOUR_PAYMENT);
    } else {
      await assertMoneyKeeper(tx, input.actorId);
    }
    if (payment.status !== "reconciled") refuse(REFUND_NOT_RECEIVED);
    const proposal = await proposalFor(tx, payment, input.today);
    const amountCents = asMember
      ? (proposal.amountCents ?? payment.amountCents)
      : input.amountCents!;
    if (amountCents > payment.amountCents) refuse(REFUND_TOO_LARGE);
    const [row] = await tx
      .insert(schema.paymentRefunds)
      .values({
        paymentId: input.paymentId,
        userId: payment.userId,
        cycle: payment.cycle,
        proposedCents: proposal.amountCents,
        amountCents,
        note: input.note,
        requestedByUserId: input.actorId,
      })
      .returning({ id: schema.paymentRefunds.id });
    await writeAuditEvent(tx, {
      actorId: input.actorId,
      action: "payment.refund_requested",
      target: payment.userId,
      metadata: {
        reference: payment.reference,
        cycle: payment.cycle,
        amountCents,
        proposedCents: proposal.amountCents,
      },
    });
    return { id: row!.id };
  }, REFUND_ALREADY_OPEN);
}

/**
 * The Finance team's answer to a refund: paid out (at the amount they name),
 * or declined with a reason. A compare-and-set on `requested`.
 */
export async function decideRefund(
  input: (
    | { to: "refunded"; amountCents: number }
    | { to: "declined"; reason: string }
  ) & { refundId: string; actorId: string },
): Promise<MoneyResult> {
  return write(async (tx) => {
    await assertMoneyKeeper(tx, input.actorId);
    if (!UUID.test(input.refundId)) refuse(REFUND_CHANGED);
    const now = new Date();
    if (input.to === "refunded") {
      const [open] = await tx
        .select({ paid: schema.payments.amountCents })
        .from(schema.paymentRefunds)
        .innerJoin(
          schema.payments,
          eq(schema.payments.id, schema.paymentRefunds.paymentId),
        )
        .where(eq(schema.paymentRefunds.id, input.refundId))
        .limit(1);
      if (open && input.amountCents > open.paid) refuse(REFUND_TOO_LARGE);
    }
    const rows = await tx
      .update(schema.paymentRefunds)
      .set({
        status: input.to,
        ...(input.to === "refunded"
          ? { amountCents: input.amountCents }
          : { declineReason: input.reason }),
        decidedByUserId: input.actorId,
        decidedAt: now,
        updatedAt: now,
      })
      .where(
        and(
          eq(schema.paymentRefunds.id, input.refundId),
          eq(schema.paymentRefunds.status, "requested"),
        ),
      )
      .returning({
        userId: schema.paymentRefunds.userId,
        paymentId: schema.paymentRefunds.paymentId,
        amountCents: schema.paymentRefunds.amountCents,
        cycle: schema.paymentRefunds.cycle,
      });
    const row = rows[0];
    if (!row) refuse(REFUND_CHANGED);
    const [payment] = await tx
      .select({ reference: schema.payments.reference })
      .from(schema.payments)
      .where(eq(schema.payments.id, row.paymentId))
      .limit(1);
    await writeAuditEvent(tx, {
      actorId: input.actorId,
      action:
        input.to === "refunded"
          ? "payment.refunded"
          : "payment.refund_declined",
      target: row.userId,
      metadata: {
        reference: payment?.reference ?? null,
        cycle: row.cycle,
        ...(input.to === "refunded" ? { amountCents: row.amountCents } : {}),
      },
    });
    return {};
  });
}

// --- Proofs and the statement import ----------------------------------------------------

/** Where a payment's proof file is, and whose payment it is. */
export async function getPaymentProof(paymentId: string): Promise<{
  userId: string;
  reference: string;
  pathname: string;
  contentType: string;
} | null> {
  if (!UUID.test(paymentId)) return null;
  const [row] = await createHttpDb()
    .select({
      userId: schema.payments.userId,
      reference: schema.payments.reference,
      pathname: schema.payments.proofPathname,
      contentType: schema.payments.proofContentType,
    })
    .from(schema.payments)
    .where(eq(schema.payments.id, paymentId))
    .limit(1);
  if (!row?.pathname || !row.contentType) return null;
  return {
    userId: row.userId,
    reference: row.reference,
    pathname: row.pathname,
    contentType: row.contentType,
  };
}

/** What the statement import matches lines against: references and the year's ledger. */
export async function statementContext(cycle: number): Promise<{
  members: { id: string; name: string; refCode: string | null }[];
  payments: {
    id: string;
    userId: string;
    amountCents: number;
    status: PaymentStatus;
    paidOn: string | null;
  }[];
}> {
  const db = createHttpDb();
  const [members, payments] = await Promise.all([
    db
      .select({
        id: schema.users.id,
        name: schema.users.displayName,
        refCode: schema.users.refCode,
      })
      .from(schema.users)
      .where(
        and(
          eq(schema.users.isSystem, false),
          eq(schema.users.sanitised, false),
        ),
      ),
    db
      .select({
        id: schema.payments.id,
        userId: schema.payments.userId,
        amountCents: schema.payments.amountCents,
        status: schema.payments.status,
        paidOn: schema.payments.paidOn,
      })
      .from(schema.payments)
      .where(eq(schema.payments.cycle, cycle)),
  ]);
  return {
    members: members.map((m) => ({
      id: m.id,
      name: m.name?.trim() || "Unnamed burner",
      refCode: m.refCode,
    })),
    payments,
  };
}
