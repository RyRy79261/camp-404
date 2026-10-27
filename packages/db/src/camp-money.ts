import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import {
  BALANCE_CHANGED,
  BANK_DETAILS_CHANGED,
  BILL_ALREADY_PAID,
  BILL_CHANGED,
  BILL_GONE,
  BILL_TIMES_BELOW_PAID,
  campBillState,
  type CampBillState,
} from "@camp404/core";
import {
  CampBankDetails,
  EMPTY_CAMP_BANK_DETAILS,
  type CampBalanceInput,
  type CampBillInput,
  type CampBillRepeat,
  type MarkCampBillPaidInput,
} from "@camp404/types";
import { writeAuditEvent, type DbOrTx } from "./audit";
import { assertMoneyKeeper, refuse, write, type MoneyResult } from "./dues";
import { createHttpDb, type Tx } from "./index";
import * as schema from "./schema";

// The camp's own money (camp fees sprint, owner 2026-10-27): the bank details
// members pay into, the bank balance Finance types in (every one kept), and
// the camp's bills. The forecast that reads them is pure, in @camp404/core
// (campForecast).
//
//  - Every member who owes reads the bank details (the pay guide); everything
//    else here is the Finance team's (captains and Finance leads,
//    MONEY_KEEPER), and the screens gate it.
//  - Every write re-reads the actor inside its own transaction
//    (assertMoneyKeeper: lockAllowed with MONEY_KEEPER), is a compare-and-set
//    on what the actor saw, and writes its audit row in the same transaction.
//  - Money is whole rand cents, ZAR only; each table's CHECK is the last guard.
//
// PGlite has ONE connection: inside a transaction everything goes through `tx`.

export {
  BALANCE_CHANGED,
  BANK_DETAILS_CHANGED,
  BILL_ALREADY_PAID,
  BILL_CHANGED,
  BILL_GONE,
  BILL_TIMES_BELOW_PAID,
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// --- Bank details ---------------------------------------------------------------

export interface CampBankDetailsRow {
  details: CampBankDetails;
  /** 0 before anyone saved them. */
  version: number;
}

/** Where members pay the camp; every field empty before Finance types them. */
export async function getCampBankDetails(
  db: DbOrTx = createHttpDb(),
): Promise<CampBankDetailsRow> {
  const [row] = await db
    .select({
      details: schema.campBankDetails.details,
      version: schema.campBankDetails.version,
    })
    .from(schema.campBankDetails)
    .limit(1);
  if (!row) return { details: EMPTY_CAMP_BANK_DETAILS, version: 0 };
  const parsed = CampBankDetails.safeParse(row.details);
  return {
    details: parsed.success ? parsed.data : EMPTY_CAMP_BANK_DETAILS,
    version: row.version,
  };
}

/** Save the bank details: a compare-and-set on the version Finance saw. */
export async function saveCampBankDetails(input: {
  details: CampBankDetails;
  expectedVersion: number;
  actorId: string;
}): Promise<MoneyResult<{ version: number }>> {
  const details = CampBankDetails.parse(input.details);
  return write(async (tx) => {
    await assertMoneyKeeper(tx, input.actorId);
    const next = input.expectedVersion + 1;
    const values = {
      details,
      version: next,
      updatedByUserId: input.actorId,
      updatedAt: new Date(),
    };
    const rows =
      input.expectedVersion === 0
        ? await tx
            .insert(schema.campBankDetails)
            .values({ id: true, ...values })
            .onConflictDoNothing({ target: schema.campBankDetails.id })
            .returning({ version: schema.campBankDetails.version })
        : await tx
            .update(schema.campBankDetails)
            .set(values)
            .where(
              and(
                eq(schema.campBankDetails.id, true),
                eq(schema.campBankDetails.version, input.expectedVersion),
              ),
            )
            .returning({ version: schema.campBankDetails.version });
    if (rows.length === 0) refuse(BANK_DETAILS_CHANGED);
    await writeAuditEvent(tx, {
      actorId: input.actorId,
      action: "camp_money.bank_details_saved",
      target: "camp_bank_details",
      metadata: { version: next },
    });
    return { version: next };
  });
}

// --- The bank balance -------------------------------------------------------------

export interface CampBalanceRow {
  id: string;
  amountCents: number;
  /** The day the bank showed it, YYYY-MM-DD. */
  asOf: string;
  /** Who typed it, by name; null once they are gone. */
  recordedBy: string | null;
  createdAt: Date;
}

/** Every balance typed in, the latest first (by its day, then when typed). */
export async function listCampBalances(
  db: DbOrTx = createHttpDb(),
): Promise<CampBalanceRow[]> {
  const rows = await db
    .select({
      id: schema.campBalances.id,
      amountCents: schema.campBalances.amountCents,
      asOf: schema.campBalances.asOf,
      recordedBy: schema.users.displayName,
      createdAt: schema.campBalances.createdAt,
    })
    .from(schema.campBalances)
    .leftJoin(
      schema.users,
      eq(schema.users.id, schema.campBalances.recordedByUserId),
    )
    .orderBy(
      desc(schema.campBalances.asOf),
      desc(schema.campBalances.createdAt),
      desc(schema.campBalances.id),
    );
  return rows.map((r) => ({ ...r, recordedBy: r.recordedBy?.trim() || null }));
}

/** Serialise balance writes, so "the latest" is a compare-and-set. */
async function lockBalances(tx: Tx): Promise<void> {
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtext('camp_balances'))`,
  );
}

/**
 * Type in what the bank shows on a day. Kept beside every earlier one. A
 * compare-and-set on the latest balance the actor saw (null: none yet).
 */
export async function recordCampBalance(
  input: CampBalanceInput & { actorId: string },
): Promise<MoneyResult<{ id: string }>> {
  return write(async (tx) => {
    await assertMoneyKeeper(tx, input.actorId);
    await lockBalances(tx);
    const [latest] = await listCampBalances(tx);
    if ((latest?.id ?? null) !== input.expectedLatestId) {
      refuse(BALANCE_CHANGED);
    }
    const [row] = await tx
      .insert(schema.campBalances)
      .values({
        amountCents: input.amountCents,
        asOf: input.asOf,
        recordedByUserId: input.actorId,
      })
      .returning({ id: schema.campBalances.id });
    await writeAuditEvent(tx, {
      actorId: input.actorId,
      action: "camp_money.balance_recorded",
      target: row!.id,
      metadata: { amountCents: input.amountCents, asOf: input.asOf },
    });
    return { id: row!.id };
  });
}

// --- Bills ----------------------------------------------------------------------------

export interface CampBillRow {
  id: string;
  name: string;
  payee: string | null;
  amountCents: number;
  dueOn: string;
  repeat: CampBillRepeat;
  times: number;
  paidCount: number;
  /** The day its latest payment was made. */
  paidOn: string | null;
  planned: boolean;
  state: CampBillState;
  version: number;
}

/** The camp's bills (not removed), by the day they are first due. */
export async function listCampBills(
  db: DbOrTx = createHttpDb(),
): Promise<CampBillRow[]> {
  const rows = await db
    .select()
    .from(schema.campBills)
    .where(isNull(schema.campBills.removedAt))
    .orderBy(
      asc(schema.campBills.dueOn),
      asc(schema.campBills.name),
      asc(schema.campBills.id),
    );
  return rows.map((b) => ({
    id: b.id,
    name: b.name,
    payee: b.payee,
    amountCents: b.amountCents,
    dueOn: b.dueOn,
    repeat: b.repeat,
    times: b.times,
    paidCount: b.paidCount,
    paidOn: b.paidOn,
    planned: b.planned,
    state: campBillState(b),
    version: b.version,
  }));
}

function billAudit(input: CampBillInput) {
  return {
    name: input.name,
    payee: input.payee,
    amountCents: input.amountCents,
    dueOn: input.dueOn,
    repeat: input.repeat,
    times: input.times,
    planned: input.planned,
  };
}

/** Add a bill the camp must pay. */
export async function addCampBill(
  input: CampBillInput & { actorId: string },
): Promise<MoneyResult<{ id: string }>> {
  return write(async (tx) => {
    await assertMoneyKeeper(tx, input.actorId);
    const [row] = await tx
      .insert(schema.campBills)
      .values({
        name: input.name,
        payee: input.payee,
        amountCents: input.amountCents,
        dueOn: input.dueOn,
        repeat: input.repeat,
        times: input.times,
        planned: input.planned,
        createdByUserId: input.actorId,
        updatedByUserId: input.actorId,
      })
      .returning({ id: schema.campBills.id });
    await writeAuditEvent(tx, {
      actorId: input.actorId,
      action: "camp_money.bill_added",
      target: row!.id,
      metadata: billAudit(input),
    });
    return { id: row!.id };
  });
}

async function lockBill(tx: Tx, billId: string) {
  if (!UUID.test(billId)) refuse(BILL_GONE);
  const [row] = await tx
    .select()
    .from(schema.campBills)
    .where(
      and(eq(schema.campBills.id, billId), isNull(schema.campBills.removedAt)),
    )
    .limit(1)
    .for("update");
  if (!row) refuse(BILL_GONE);
  return row;
}

/**
 * Change a bill: a compare-and-set on the version the actor saw. A monthly
 * bill keeps at least as many months as are already paid.
 */
export async function updateCampBill(
  input: CampBillInput & {
    billId: string;
    expectedVersion: number;
    actorId: string;
  },
): Promise<MoneyResult<{ version: number }>> {
  return write(async (tx) => {
    await assertMoneyKeeper(tx, input.actorId);
    const bill = await lockBill(tx, input.billId);
    if (bill.version !== input.expectedVersion) refuse(BILL_CHANGED);
    if (input.times < bill.paidCount) refuse(BILL_TIMES_BELOW_PAID);
    const next = bill.version + 1;
    await tx
      .update(schema.campBills)
      .set({
        name: input.name,
        payee: input.payee,
        amountCents: input.amountCents,
        dueOn: input.dueOn,
        repeat: input.repeat,
        times: input.times,
        planned: input.planned,
        version: next,
        updatedByUserId: input.actorId,
        updatedAt: new Date(),
      })
      .where(eq(schema.campBills.id, bill.id));
    await writeAuditEvent(tx, {
      actorId: input.actorId,
      action: "camp_money.bill_changed",
      target: bill.id,
      metadata: billAudit(input),
    });
    return { version: next };
  });
}

/**
 * Mark a bill's next payment paid (a one-time bill's only one, a monthly
 * bill's next month). A compare-and-set on how many were paid when the actor
 * looked, so a double press marks one month, not two.
 */
export async function markCampBillPaid(
  input: MarkCampBillPaidInput & { actorId: string },
): Promise<MoneyResult<{ paidCount: number }>> {
  return write(async (tx) => {
    await assertMoneyKeeper(tx, input.actorId);
    const bill = await lockBill(tx, input.billId);
    if (bill.paidCount >= bill.times) refuse(BILL_ALREADY_PAID);
    if (bill.paidCount !== input.expectedPaidCount) refuse(BILL_CHANGED);
    const paidCount = bill.paidCount + 1;
    await tx
      .update(schema.campBills)
      .set({
        paidCount,
        paidOn: input.paidOn,
        version: bill.version + 1,
        updatedByUserId: input.actorId,
        updatedAt: new Date(),
      })
      .where(eq(schema.campBills.id, bill.id));
    await writeAuditEvent(tx, {
      actorId: input.actorId,
      action: "camp_money.bill_paid",
      target: bill.id,
      metadata: {
        name: bill.name,
        amountCents: bill.amountCents,
        paidOn: input.paidOn,
        index: bill.paidCount,
      },
    });
    return { paidCount };
  });
}

/** Take a bill off the list (kept, so its audit rows still name it). */
export async function removeCampBill(input: {
  billId: string;
  expectedVersion: number;
  actorId: string;
}): Promise<MoneyResult> {
  return write(async (tx) => {
    await assertMoneyKeeper(tx, input.actorId);
    const bill = await lockBill(tx, input.billId);
    if (bill.version !== input.expectedVersion) refuse(BILL_CHANGED);
    await tx
      .update(schema.campBills)
      .set({
        removedAt: new Date(),
        version: bill.version + 1,
        updatedByUserId: input.actorId,
        updatedAt: new Date(),
      })
      .where(eq(schema.campBills.id, bill.id));
    await writeAuditEvent(tx, {
      actorId: input.actorId,
      action: "camp_money.bill_removed",
      target: bill.id,
      metadata: { name: bill.name, amountCents: bill.amountCents },
    });
    return {};
  });
}
