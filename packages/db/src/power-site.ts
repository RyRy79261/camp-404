import {
  aliasedTable,
  and,
  asc,
  desc,
  eq,
  gte,
  lt,
  max,
  sql,
} from "drizzle-orm";
import { campLocalInstant } from "@camp404/core";
import type {
  AddFuelCansInput,
  CanLocation,
  CorrectRefuelInput,
  EditFuelCanInput,
  RefuelInput,
  StrikeRefuelInput,
} from "@camp404/types";
import type { DbOrTx } from "./audit";
import { currentCycleNumber } from "./cycles";
import { createHttpDb, type Tx } from "./index";
import {
  UUID,
  assertPowerEditor,
  refuse,
  write,
  type PowerWriteResult,
} from "./power";
import * as schema from "./schema";

// Fuel on site (#255): the year's cans and the refuelling log.
//
//  - Anyone in the camp reads them; only a captain or a Power & Lighting lead
//    writes (assertPowerEditor, re-read inside each write's transaction). A
//    caller passes who is acting, never a rank or a team list.
//  - Both are the year's, stamped with currentCycleNumber() inside the write.
//  - The log is APPEND-ONLY: nothing here updates or deletes an entry. A
//    correction or a strike-out is a new row naming the one it replaces; the
//    unique index on corrects_entry_id lets each entry be replaced once.
//  - A refuelling that names its can takes the litres out of that can in the
//    same transaction; a correction or strike-out puts them back first.
//  - A can's edit is a compare-and-set on its version.
//
// No audit_log rows: team planning data, like the load list. No money.
// PGlite has one connection: inside a transaction, only `tx`.

export const CAN_GONE =
  "That can isn't in the stock any more. Reload the page.";
export const CAN_CHANGED = "Someone changed this can first. Reload the page.";
export const ENTRY_GONE =
  "That entry isn't in this year's log. Reload the page.";
export const ENTRY_ALREADY_CORRECTED =
  "Someone corrected this entry first. Reload the page.";
export const ENTRY_STRUCK_OUT =
  "A strike-out can't be corrected. Log the refuelling again instead.";
export const NOT_A_CAMP_MEMBER = "Pick a camp member for who filled it.";
export const REFUEL_IN_FUTURE = "That time is still to come. Check the time.";
export const REFUEL_GENERATOR_GONE =
  "That generator isn't there any more. Reload the page.";

/** "That can holds only 4 L." */
export function canHoldsOnly(litres: number): string {
  const shown = Math.round(litres * 10) / 10;
  return `That can holds only ${shown} L.`;
}

/** How far ahead of the server's clock a refuelling may be timed. */
const FUTURE_SLACK_MS = 10 * 60_000;

// --- Shapes ------------------------------------------------------------------

export interface FuelCanRow {
  id: string;
  cycle: number;
  label: string;
  capacityLitres: number;
  litres: number;
  location: CanLocation;
  sort: number;
  version: number;
}

/** One entry of the log, with the names people read. */
export interface RefuelEntryRow {
  id: string;
  cycle: number;
  generatorId: string;
  generatorModel: string | null;
  refuelledAt: Date;
  litres: number;
  fromCanId: string | null;
  fromCanLabel: string | null;
  doneByUserId: string | null;
  doneByName: string | null;
  hourMeter: number | null;
  note: string | null;
  fromPaper: boolean;
  correctsEntryId: string | null;
  voided: boolean;
  createdAt: Date;
}

const CAN_COLUMNS = {
  id: schema.fuelCans.id,
  cycle: schema.fuelCans.cycle,
  label: schema.fuelCans.label,
  capacityLitres: schema.fuelCans.capacityLitres,
  litres: schema.fuelCans.litres,
  location: schema.fuelCans.location,
  sort: schema.fuelCans.sort,
  version: schema.fuelCans.version,
};

// --- Reads -------------------------------------------------------------------

/** A year's cans (this year by default), in the order they were added. */
export async function listFuelCans(cycle?: number): Promise<FuelCanRow[]> {
  const db = createHttpDb();
  const year = cycle ?? (await currentCycleNumber(db));
  return db
    .select(CAN_COLUMNS)
    .from(schema.fuelCans)
    .where(eq(schema.fuelCans.cycle, year))
    .orderBy(asc(schema.fuelCans.sort), asc(schema.fuelCans.createdAt));
}

/** A year's refuelling log (this year by default), newest first. */
export async function listRefuelEntries(
  cycle?: number,
): Promise<RefuelEntryRow[]> {
  const db = createHttpDb();
  const year = cycle ?? (await currentCycleNumber(db));
  const doneBy = aliasedTable(schema.users, "done_by");
  return db
    .select({
      id: schema.refuelEntries.id,
      cycle: schema.refuelEntries.cycle,
      generatorId: schema.refuelEntries.generatorId,
      generatorModel: schema.generators.model,
      refuelledAt: schema.refuelEntries.refuelledAt,
      litres: schema.refuelEntries.litres,
      fromCanId: schema.refuelEntries.fromCanId,
      fromCanLabel: schema.fuelCans.label,
      doneByUserId: schema.refuelEntries.doneByUserId,
      doneByName: doneBy.displayName,
      hourMeter: schema.refuelEntries.hourMeter,
      note: schema.refuelEntries.note,
      fromPaper: schema.refuelEntries.fromPaper,
      correctsEntryId: schema.refuelEntries.correctsEntryId,
      voided: schema.refuelEntries.voided,
      createdAt: schema.refuelEntries.createdAt,
    })
    .from(schema.refuelEntries)
    .leftJoin(
      schema.generators,
      eq(schema.generators.id, schema.refuelEntries.generatorId),
    )
    .leftJoin(
      schema.fuelCans,
      eq(schema.fuelCans.id, schema.refuelEntries.fromCanId),
    )
    .leftJoin(doneBy, eq(doneBy.id, schema.refuelEntries.doneByUserId))
    .where(eq(schema.refuelEntries.cycle, year))
    .orderBy(
      desc(schema.refuelEntries.refuelledAt),
      desc(schema.refuelEntries.createdAt),
    );
}

/** The latest year before this one with a refuelling logged, or null. */
export async function previousRefuelCycle(): Promise<number | null> {
  const db = createHttpDb();
  const cycle = await currentCycleNumber(db);
  const [row] = await db
    .select({ cycle: max(schema.refuelEntries.cycle) })
    .from(schema.refuelEntries)
    .where(lt(schema.refuelEntries.cycle, cycle));
  return row?.cycle ?? null;
}

// --- Cans --------------------------------------------------------------------

/** The next number for "Can N" in a year: one past the highest "Can N". */
async function nextCanNumber(tx: Tx, cycle: number): Promise<number> {
  const [row] = await tx
    .select({
      n: sql<
        number | null
      >`max(substring(${schema.fuelCans.label} from '^Can ([0-9]{1,6})$')::int)`,
    })
    .from(schema.fuelCans)
    .where(eq(schema.fuelCans.cycle, cycle));
  return (row?.n ?? 0) + 1;
}

/**
 * Adds cans to this year's stock, all alike, named "Can 1", "Can 2" and on.
 * Two adds at once queue on a lock for the year, so the names do not clash.
 */
export async function addFuelCans(
  input: AddFuelCansInput & { actorId: string },
): Promise<PowerWriteResult<{ count: number }>> {
  return write(async (tx) => {
    await assertPowerEditor(tx, input.actorId);
    const cycle = await currentCycleNumber(tx);
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext('fuel_cans'), ${cycle})`,
    );
    const first = await nextCanNumber(tx, cycle);
    const [last] = await tx
      .select({ sort: max(schema.fuelCans.sort) })
      .from(schema.fuelCans)
      .where(eq(schema.fuelCans.cycle, cycle));
    const base = (last?.sort ?? -1) + 1;
    await tx.insert(schema.fuelCans).values(
      Array.from({ length: input.count }, (_, i) => ({
        cycle,
        label: `Can ${first + i}`,
        capacityLitres: input.capacityLitres,
        litres: input.litres,
        location: input.location,
        sort: base + i,
        createdByUserId: input.actorId,
      })),
    );
    return { count: input.count };
  });
}

async function canLoss(tx: Tx, canId: string, cycle: number): Promise<never> {
  const [row] = await tx
    .select({ id: schema.fuelCans.id })
    .from(schema.fuelCans)
    .where(
      and(eq(schema.fuelCans.id, canId), eq(schema.fuelCans.cycle, cycle)),
    );
  refuse(row ? CAN_CHANGED : CAN_GONE);
}

/** A stock-take of one can: its name, size, litres and place. */
export async function updateFuelCan(
  input: EditFuelCanInput & { actorId: string },
): Promise<PowerWriteResult> {
  return write(async (tx) => {
    await assertPowerEditor(tx, input.actorId);
    if (!UUID.test(input.canId)) refuse(CAN_GONE);
    const cycle = await currentCycleNumber(tx);
    const [row] = await tx
      .update(schema.fuelCans)
      .set({
        label: input.label,
        capacityLitres: input.capacityLitres,
        litres: input.litres,
        location: input.location,
        version: sql`${schema.fuelCans.version} + 1`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.fuelCans.id, input.canId),
          eq(schema.fuelCans.cycle, cycle),
          eq(schema.fuelCans.version, input.expectedVersion),
        ),
      )
      .returning({ id: schema.fuelCans.id });
    if (!row) await canLoss(tx, input.canId, cycle);
    return {};
  });
}

/**
 * Takes a can out of the stock, if nobody changed it first. Log entries that
 * came from it keep their litres; they no longer name the can.
 */
export async function removeFuelCan(input: {
  actorId: string;
  canId: string;
  expectedVersion: number;
}): Promise<PowerWriteResult> {
  return write(async (tx) => {
    await assertPowerEditor(tx, input.actorId);
    if (!UUID.test(input.canId)) refuse(CAN_GONE);
    const cycle = await currentCycleNumber(tx);
    const [row] = await tx
      .delete(schema.fuelCans)
      .where(
        and(
          eq(schema.fuelCans.id, input.canId),
          eq(schema.fuelCans.cycle, cycle),
          eq(schema.fuelCans.version, input.expectedVersion),
        ),
      )
      .returning({ id: schema.fuelCans.id });
    if (!row) await canLoss(tx, input.canId, cycle);
    return {};
  });
}

/** Takes `litres` out of one of this year's cans, or refuses with a sentence. */
async function takeFromCan(
  tx: Tx,
  cycle: number,
  canId: string,
  litres: number,
) {
  if (!UUID.test(canId)) refuse(CAN_GONE);
  const [row] = await tx
    .update(schema.fuelCans)
    .set({
      litres: sql`greatest(0, ${schema.fuelCans.litres} - ${litres})`,
      version: sql`${schema.fuelCans.version} + 1`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(schema.fuelCans.id, canId),
        eq(schema.fuelCans.cycle, cycle),
        // A hair of slack, so 20 L out of a 20 L can is never refused for
        // floating point.
        gte(schema.fuelCans.litres, litres - 1e-9),
      ),
    )
    .returning({ id: schema.fuelCans.id });
  if (row) return;
  const [can] = await tx
    .select({ litres: schema.fuelCans.litres })
    .from(schema.fuelCans)
    .where(
      and(eq(schema.fuelCans.id, canId), eq(schema.fuelCans.cycle, cycle)),
    );
  refuse(can ? canHoldsOnly(can.litres) : CAN_GONE);
}

/** Puts litres back into a can, up to its size; a can since removed is skipped. */
async function returnToCan(tx: Tx, canId: string, litres: number) {
  await tx
    .update(schema.fuelCans)
    .set({
      litres: sql`least(${schema.fuelCans.capacityLitres}, ${schema.fuelCans.litres} + ${litres})`,
      version: sql`${schema.fuelCans.version} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(schema.fuelCans.id, canId));
}

// --- The log -----------------------------------------------------------------

/** The member who filled it must be an approved camp member. */
async function assertCampMember(tx: DbOrTx, userId: string) {
  if (!UUID.test(userId)) refuse(NOT_A_CAMP_MEMBER);
  const [row] = await tx
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(
      and(
        eq(schema.users.id, userId),
        eq(schema.users.isSystem, false),
        eq(schema.users.sanitised, false),
        eq(schema.users.approvalStatus, "approved"),
      ),
    );
  if (!row) refuse(NOT_A_CAMP_MEMBER);
}

async function assertGenerator(tx: Tx, generatorId: string) {
  if (!UUID.test(generatorId)) refuse(REFUEL_GENERATOR_GONE);
  const [row] = await tx
    .select({ id: schema.generators.id })
    .from(schema.generators)
    .where(eq(schema.generators.id, generatorId));
  if (!row) refuse(REFUEL_GENERATOR_GONE);
}

/** The checks every new entry passes, and the litres out of its can. */
async function prepareEntry(
  tx: Tx,
  cycle: number,
  input: RefuelInput,
  now: Date,
) {
  const at = campLocalInstant(input.refuelledAt);
  if (at.getTime() > now.getTime() + FUTURE_SLACK_MS) refuse(REFUEL_IN_FUTURE);
  await assertGenerator(tx, input.generatorId);
  await assertCampMember(tx, input.doneByUserId);
  if (input.fromCanId) {
    await takeFromCan(tx, cycle, input.fromCanId, input.litres);
  }
  return {
    cycle,
    generatorId: input.generatorId,
    refuelledAt: at,
    litres: input.litres,
    fromCanId: input.fromCanId,
    doneByUserId: input.doneByUserId,
    hourMeter: input.hourMeter,
    note: input.note,
    fromPaper: input.fromPaper,
  };
}

/** Whether an error is Postgres refusing a duplicate (drizzle nests it). */
function isUniqueViolation(error: unknown): boolean {
  const e = error as { code?: string; cause?: { code?: string } } | null;
  return e?.code === "23505" || e?.cause?.code === "23505";
}

/** Logs a refuelling in this year's log. */
export async function logRefuel(
  input: RefuelInput & { actorId: string; now?: Date },
): Promise<PowerWriteResult<{ id: string }>> {
  return write(async (tx) => {
    await assertPowerEditor(tx, input.actorId);
    const cycle = await currentCycleNumber(tx);
    const values = await prepareEntry(
      tx,
      cycle,
      input,
      input.now ?? new Date(),
    );
    const [row] = await tx
      .insert(schema.refuelEntries)
      .values({ ...values, createdByUserId: input.actorId })
      .returning({ id: schema.refuelEntries.id });
    return { id: row!.id };
  });
}

/**
 * The entry a correction or strike-out replaces, locked: it must be this
 * year's, not a strike-out, and not replaced already. Its litres go back into
 * its can, since the new entry says what really happened.
 */
async function claimForReplacement(tx: Tx, cycle: number, entryId: string) {
  if (!UUID.test(entryId)) refuse(ENTRY_GONE);
  const [old] = await tx
    .select()
    .from(schema.refuelEntries)
    .where(
      and(
        eq(schema.refuelEntries.id, entryId),
        eq(schema.refuelEntries.cycle, cycle),
      ),
    )
    .for("update");
  if (!old) refuse(ENTRY_GONE);
  if (old.voided) refuse(ENTRY_STRUCK_OUT);
  const [later] = await tx
    .select({ id: schema.refuelEntries.id })
    .from(schema.refuelEntries)
    .where(eq(schema.refuelEntries.correctsEntryId, entryId));
  if (later) refuse(ENTRY_ALREADY_CORRECTED);
  if (old.fromCanId) await returnToCan(tx, old.fromCanId, old.litres);
  return old;
}

/** Inserts a replacing entry; a second replacement of one entry is refused. */
async function insertReplacement(
  tx: Tx,
  values: typeof schema.refuelEntries.$inferInsert,
): Promise<string> {
  try {
    const [row] = await tx
      .insert(schema.refuelEntries)
      .values(values)
      .returning({ id: schema.refuelEntries.id });
    return row!.id;
  } catch (error) {
    if (isUniqueViolation(error)) refuse(ENTRY_ALREADY_CORRECTED);
    throw error;
  }
}

/**
 * Corrects an entry: a new entry with the right figures that replaces it. The
 * old one stays in the log, marked as replaced.
 */
export async function correctRefuel(
  input: CorrectRefuelInput & { actorId: string; now?: Date },
): Promise<PowerWriteResult<{ id: string }>> {
  return write(async (tx) => {
    await assertPowerEditor(tx, input.actorId);
    const cycle = await currentCycleNumber(tx);
    await claimForReplacement(tx, cycle, input.correctsEntryId);
    const values = await prepareEntry(
      tx,
      cycle,
      input,
      input.now ?? new Date(),
    );
    const id = await insertReplacement(tx, {
      ...values,
      correctsEntryId: input.correctsEntryId,
      createdByUserId: input.actorId,
    });
    return { id };
  });
}

/**
 * Strikes an entry out: a new entry saying it never happened. It keeps the
 * old one's figures so the log reads plainly, and puts its litres back.
 */
export async function strikeRefuel(
  input: StrikeRefuelInput & { actorId: string },
): Promise<PowerWriteResult<{ id: string }>> {
  return write(async (tx) => {
    await assertPowerEditor(tx, input.actorId);
    const cycle = await currentCycleNumber(tx);
    const old = await claimForReplacement(tx, cycle, input.entryId);
    const id = await insertReplacement(tx, {
      cycle,
      generatorId: old.generatorId,
      refuelledAt: old.refuelledAt,
      litres: old.litres,
      fromCanId: null,
      doneByUserId: old.doneByUserId,
      hourMeter: old.hourMeter,
      note: input.note,
      fromPaper: old.fromPaper,
      correctsEntryId: old.id,
      voided: true,
      createdByUserId: input.actorId,
    });
    return { id };
  });
}
