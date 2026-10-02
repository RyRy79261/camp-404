import { aliasedTable, and, asc, eq, max, sql } from "drizzle-orm";
import type {
  CanMaterial,
  EditFuelCanInput,
  FuelCanInput,
  RemoveFuelCanInput,
} from "@camp404/types";
import { writeAuditEvent } from "./audit";
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

// The fuel can register (#255; owner, 2026-10-02): the list of this year's
// jerry cans that Power prints as the can sheet. The camp never refills them
// at the burn, and the sheet's four ticks are made on paper on site, so the
// app keeps only the list: owner, size, material, the car it travels with,
// and a note.
//
//  - Anyone in the camp reads it; only a captain or a Power & Lighting lead
//    writes (assertPowerEditor, re-read inside each write's transaction). A
//    caller passes who is acting, never a rank or a team list.
//  - Year-scoped: stamped with currentCycleNumber() inside the write.
//  - Who fills a can is never stored: it is the driver of the car it travels
//    with (fillingCar in @camp404/core). The read names a car only while its
//    driver drives THIS year, as the trailer list does.
//  - A change or a removal is a compare-and-set on the can's version.
//  - Each write leaves an audit_log row in the same transaction: a can names
//    a member as its owner and a member's car.
// PGlite has one connection: inside a transaction, only `tx`.

export const CAN_GONE = "That can isn't on the list any more. Reload the page.";
export const CAN_CHANGED = "Someone changed this can first. Reload the page.";
export const CAN_OWNER_NOT_MEMBER =
  "Pick a camp member, or Camp, for who owns it.";
export const CAN_CAR_GONE =
  "That car isn't driving this year any more. Reload the page.";

// --- Shapes ------------------------------------------------------------------

export interface FuelCanRow {
  id: string;
  cycle: number;
  /** Its number on the sheet is its place in this order, from 1. */
  sort: number;
  /** Null is the camp's own can. */
  ownerUserId: string | null;
  ownerName: string | null;
  sizeLitres: number;
  /** Null only on a can listed before the register asked. */
  material: CanMaterial | null;
  /** The car's driver, while they drive this year; else null (no car yet). */
  travelsWithUserId: string | null;
  note: string | null;
  version: number;
}

// --- Reads -------------------------------------------------------------------

/**
 * A year's cans (this year by default), in the sheet's order. A can's car
 * counts only while its driver drives that year, so a can whose driver
 * stopped driving reads as on no car.
 */
export async function listFuelCans(cycle?: number): Promise<FuelCanRow[]> {
  const db = createHttpDb();
  const year = cycle ?? (await currentCycleNumber(db));
  const owner = aliasedTable(schema.users, "owner");
  const driver = aliasedTable(schema.users, "driver");
  const rows = await db
    .select({
      id: schema.fuelCans.id,
      cycle: schema.fuelCans.cycle,
      sort: schema.fuelCans.sort,
      ownerUserId: schema.fuelCans.ownerUserId,
      ownerName: owner.displayName,
      sizeLitres: schema.fuelCans.sizeLitres,
      material: schema.fuelCans.material,
      travelsWithUserId: schema.fuelCans.travelsWithUserId,
      drives: schema.driverProfiles.userId,
      note: schema.fuelCans.note,
      version: schema.fuelCans.version,
    })
    .from(schema.fuelCans)
    .leftJoin(owner, eq(owner.id, schema.fuelCans.ownerUserId))
    .leftJoin(driver, eq(driver.id, schema.fuelCans.travelsWithUserId))
    .leftJoin(
      schema.driverProfiles,
      and(
        eq(schema.driverProfiles.userId, schema.fuelCans.travelsWithUserId),
        eq(schema.driverProfiles.cycle, schema.fuelCans.cycle),
        eq(schema.driverProfiles.intendsToDrive, true),
        eq(driver.sanitised, false),
      ),
    )
    .where(eq(schema.fuelCans.cycle, year))
    .orderBy(
      asc(schema.fuelCans.sort),
      asc(schema.fuelCans.createdAt),
      asc(schema.fuelCans.id),
    );
  return rows.map(({ drives, ...row }) => ({
    ...row,
    travelsWithUserId: drives ? row.travelsWithUserId : null,
  }));
}

// --- Checks ------------------------------------------------------------------

/** An owner must be an approved camp member; null is the camp. */
async function assertOwner(tx: Tx, userId: string | null) {
  if (userId === null) return;
  if (!UUID.test(userId)) refuse(CAN_OWNER_NOT_MEMBER);
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
  if (!row) refuse(CAN_OWNER_NOT_MEMBER);
}

/** A car must be one of this year's: its driver drives this year. */
async function assertCar(tx: Tx, cycle: number, driverId: string | null) {
  if (driverId === null) return;
  if (!UUID.test(driverId)) refuse(CAN_CAR_GONE);
  const [row] = await tx
    .select({ id: schema.driverProfiles.userId })
    .from(schema.driverProfiles)
    .innerJoin(schema.users, eq(schema.users.id, schema.driverProfiles.userId))
    .where(
      and(
        eq(schema.driverProfiles.userId, driverId),
        eq(schema.driverProfiles.cycle, cycle),
        eq(schema.driverProfiles.intendsToDrive, true),
        eq(schema.users.sanitised, false),
      ),
    );
  if (!row) refuse(CAN_CAR_GONE);
}

/** The can's number on the sheet now: its place in the year's order, from 1. */
async function canNumber(tx: Tx, cycle: number, canId: string) {
  const rows = await tx
    .select({ id: schema.fuelCans.id })
    .from(schema.fuelCans)
    .where(eq(schema.fuelCans.cycle, cycle))
    .orderBy(
      asc(schema.fuelCans.sort),
      asc(schema.fuelCans.createdAt),
      asc(schema.fuelCans.id),
    );
  return rows.findIndex((r) => r.id === canId) + 1;
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

function fields(input: FuelCanInput) {
  return {
    ownerUserId: input.ownerUserId,
    sizeLitres: input.sizeLitres,
    material: input.material,
    travelsWithUserId: input.travelsWithUserId,
    note: input.note,
  };
}

function auditMetadata(cycle: number, number: number, input: FuelCanInput) {
  return {
    cycle,
    number,
    sizeLitres: input.sizeLitres,
    material: input.material,
    ownerUserId: input.ownerUserId,
    travelsWithUserId: input.travelsWithUserId,
  };
}

// --- Writes ------------------------------------------------------------------

/**
 * Adds a can at the end of this year's list. Two adds at once queue on a lock
 * for the year, so each gets its own place on the sheet.
 */
export async function addFuelCan(
  input: FuelCanInput & { actorId: string },
): Promise<PowerWriteResult<{ id: string; number: number }>> {
  return write(async (tx) => {
    await assertPowerEditor(tx, input.actorId);
    const cycle = await currentCycleNumber(tx);
    await assertOwner(tx, input.ownerUserId);
    await assertCar(tx, cycle, input.travelsWithUserId);
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext('fuel_cans'), ${cycle})`,
    );
    const [last] = await tx
      .select({ sort: max(schema.fuelCans.sort) })
      .from(schema.fuelCans)
      .where(eq(schema.fuelCans.cycle, cycle));
    const [row] = await tx
      .insert(schema.fuelCans)
      .values({
        cycle,
        ...fields(input),
        sort: (last?.sort ?? -1) + 1,
        createdByUserId: input.actorId,
      })
      .returning({ id: schema.fuelCans.id });
    const number = await canNumber(tx, cycle, row!.id);
    await writeAuditEvent(tx, {
      actorId: input.actorId,
      action: "power.fuel_can_added",
      target: row!.id,
      metadata: auditMetadata(cycle, number, input),
    });
    return { id: row!.id, number };
  });
}

/** Changes a can, if nobody changed it first. */
export async function updateFuelCan(
  input: EditFuelCanInput & { actorId: string },
): Promise<PowerWriteResult> {
  return write(async (tx) => {
    await assertPowerEditor(tx, input.actorId);
    if (!UUID.test(input.canId)) refuse(CAN_GONE);
    const cycle = await currentCycleNumber(tx);
    await assertOwner(tx, input.ownerUserId);
    await assertCar(tx, cycle, input.travelsWithUserId);
    const [row] = await tx
      .update(schema.fuelCans)
      .set({
        ...fields(input),
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
    await writeAuditEvent(tx, {
      actorId: input.actorId,
      action: "power.fuel_can_changed",
      target: input.canId,
      metadata: auditMetadata(
        cycle,
        await canNumber(tx, cycle, input.canId),
        input,
      ),
    });
    return {};
  });
}

/** Takes a can off the list, if nobody changed it first. */
export async function removeFuelCan(
  input: RemoveFuelCanInput & { actorId: string },
): Promise<PowerWriteResult> {
  return write(async (tx) => {
    await assertPowerEditor(tx, input.actorId);
    if (!UUID.test(input.canId)) refuse(CAN_GONE);
    const cycle = await currentCycleNumber(tx);
    const number = await canNumber(tx, cycle, input.canId);
    const [row] = await tx
      .delete(schema.fuelCans)
      .where(
        and(
          eq(schema.fuelCans.id, input.canId),
          eq(schema.fuelCans.cycle, cycle),
          eq(schema.fuelCans.version, input.expectedVersion),
        ),
      )
      .returning({
        sizeLitres: schema.fuelCans.sizeLitres,
        material: schema.fuelCans.material,
        ownerUserId: schema.fuelCans.ownerUserId,
        travelsWithUserId: schema.fuelCans.travelsWithUserId,
      });
    if (!row) await canLoss(tx, input.canId, cycle);
    await writeAuditEvent(tx, {
      actorId: input.actorId,
      action: "power.fuel_can_removed",
      target: input.canId,
      metadata: { cycle, number, ...row! },
    });
    return {};
  });
}
