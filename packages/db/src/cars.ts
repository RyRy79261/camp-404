import { and, asc, count, eq, sql } from "drizzle-orm";
import { writeAuditEvent } from "./audit";
import { currentCycleNumber } from "./cycles";
import { createHttpDb, withTransaction } from "./index";
import * as schema from "./schema";

// Lifts for THIS YEAR: who is driving, and who rides in whose car. Driver
// details are captain-read in the field-access list (travel logistics), so
// who may read or change which car is the caller's check. This module keeps
// the seat count true under concurrent writes.

export interface DriverSummary {
  userId: string;
  name: string | null;
  vehicleMake: string | null;
  vehicleModel: string | null;
  seatsTotal: number | null;
  seatsOffered: number | null;
  canOfferLifts: boolean;
  departureCity: string | null;
  arrivalAt: Date | null;
  departureAt: Date | null;
  riders: number;
}

/** This year's drivers (intends to drive), by name, with their rider count. */
export async function listDrivers(): Promise<DriverSummary[]> {
  const cycle = await currentCycleNumber();
  const riders = createHttpDb()
    .select({
      driverUserId: schema.carMembers.driverUserId,
      riders: count().as("riders"),
    })
    .from(schema.carMembers)
    .where(eq(schema.carMembers.cycle, cycle))
    .groupBy(schema.carMembers.driverUserId)
    .as("riders");
  const rows = await createHttpDb()
    .select({
      userId: schema.driverProfiles.userId,
      name: schema.users.displayName,
      vehicleMake: schema.driverProfiles.vehicleMake,
      vehicleModel: schema.driverProfiles.vehicleModel,
      seatsTotal: schema.driverProfiles.seatsTotal,
      seatsOffered: schema.driverProfiles.seatsOffered,
      canOfferLifts: schema.driverProfiles.canOfferLifts,
      departureCity: schema.driverProfiles.departureCity,
      arrivalAt: schema.driverProfiles.arrivalAt,
      departureAt: schema.driverProfiles.departureAt,
      riders: sql<number>`coalesce(${riders.riders}, 0)::int`,
    })
    .from(schema.driverProfiles)
    .innerJoin(schema.users, eq(schema.users.id, schema.driverProfiles.userId))
    .leftJoin(riders, eq(riders.driverUserId, schema.driverProfiles.userId))
    .where(
      and(
        eq(schema.driverProfiles.cycle, cycle),
        eq(schema.driverProfiles.intendsToDrive, true),
        eq(schema.users.sanitised, false),
      ),
    )
    .orderBy(asc(schema.users.displayName));
  return rows;
}

export interface CarRider {
  userId: string;
  name: string | null;
  addedAt: Date;
}

/** This year's riders in one driver's car. */
export async function listCarRiders(driverUserId: string): Promise<CarRider[]> {
  const cycle = await currentCycleNumber();
  return createHttpDb()
    .select({
      userId: schema.carMembers.memberUserId,
      name: schema.users.displayName,
      addedAt: schema.carMembers.createdAt,
    })
    .from(schema.carMembers)
    .innerJoin(
      schema.users,
      eq(schema.users.id, schema.carMembers.memberUserId),
    )
    .where(
      and(
        eq(schema.carMembers.driverUserId, driverUserId),
        eq(schema.carMembers.cycle, cycle),
      ),
    )
    .orderBy(asc(schema.carMembers.createdAt));
}

/**
 * One member's own lift this year, for their home page: the car they drive, or
 * the car they ride in. Null when they are in neither.
 *
 * WHO SEES WHAT. Driver details are captain-read in the field-access list, and
 * this does not widen that for anyone else: it is only ever called for the
 * signed-in member about their own seat. A rider gets the car they share (the
 * driver's name, the vehicle and the travel dates), which they need to travel
 * together; a driver gets their own details and their riders' names, which
 * the roster already shows.
 */
export type MyLift =
  | {
      role: "driver";
      vehicle: string | null;
      seatsOffered: number | null;
      riders: string[];
      departureCity: string | null;
      arrivalAt: Date | null;
      departureAt: Date | null;
    }
  | {
      role: "rider";
      driverName: string | null;
      vehicle: string | null;
      departureCity: string | null;
      arrivalAt: Date | null;
      departureAt: Date | null;
    };

function vehicleName(make: string | null, model: string | null): string | null {
  const name = [make, model]
    .filter((p) => p?.trim())
    .join(" ")
    .trim();
  return name || null;
}

export async function getMyLift(userId: string): Promise<MyLift | null> {
  const cycle = await currentCycleNumber();
  const db = createHttpDb();
  const [driving] = await db
    .select({
      vehicleMake: schema.driverProfiles.vehicleMake,
      vehicleModel: schema.driverProfiles.vehicleModel,
      seatsOffered: schema.driverProfiles.seatsOffered,
      departureCity: schema.driverProfiles.departureCity,
      arrivalAt: schema.driverProfiles.arrivalAt,
      departureAt: schema.driverProfiles.departureAt,
    })
    .from(schema.driverProfiles)
    .where(
      and(
        eq(schema.driverProfiles.userId, userId),
        eq(schema.driverProfiles.cycle, cycle),
        eq(schema.driverProfiles.intendsToDrive, true),
      ),
    )
    .limit(1);
  if (driving) {
    const riders = await listCarRiders(userId);
    return {
      role: "driver",
      vehicle: vehicleName(driving.vehicleMake, driving.vehicleModel),
      seatsOffered: driving.seatsOffered,
      riders: riders.map((r) => r.name ?? "A camp member"),
      departureCity: driving.departureCity,
      arrivalAt: driving.arrivalAt,
      departureAt: driving.departureAt,
    };
  }

  const [riding] = await db
    .select({
      driverName: schema.users.displayName,
      vehicleMake: schema.driverProfiles.vehicleMake,
      vehicleModel: schema.driverProfiles.vehicleModel,
      departureCity: schema.driverProfiles.departureCity,
      arrivalAt: schema.driverProfiles.arrivalAt,
      departureAt: schema.driverProfiles.departureAt,
    })
    .from(schema.carMembers)
    .innerJoin(
      schema.driverProfiles,
      and(
        eq(schema.driverProfiles.userId, schema.carMembers.driverUserId),
        eq(schema.driverProfiles.cycle, schema.carMembers.cycle),
      ),
    )
    .innerJoin(
      schema.users,
      eq(schema.users.id, schema.carMembers.driverUserId),
    )
    .where(
      and(
        eq(schema.carMembers.memberUserId, userId),
        eq(schema.carMembers.cycle, cycle),
      ),
    )
    .orderBy(asc(schema.carMembers.createdAt))
    .limit(1);
  if (!riding) return null;
  return {
    role: "rider",
    driverName: riding.driverName,
    vehicle: vehicleName(riding.vehicleMake, riding.vehicleModel),
    departureCity: riding.departureCity,
    arrivalAt: riding.arrivalAt,
    departureAt: riding.departureAt,
  };
}

export type AddRiderResult =
  | { ok: true }
  | {
      ok: false;
      reason:
        | "not_a_driver"
        | "own_car"
        | "not_a_member"
        | "car_full"
        | "already_in_this_car";
    };

/**
 * Put a member in a driver's car for this year. Refuses a driver who does not
 * intend to drive this year, the driver themself, an erased or unapproved
 * member, and a full car (riders reach seatsOffered). The driver's profile row
 * is locked, so two riders cannot take the last seat together. A rider already
 * in this car is refused; riding in two cars is not, because no rule for it
 * exists yet.
 */
export async function addCarRider(input: {
  driverUserId: string;
  memberUserId: string;
  actorId: string;
}): Promise<AddRiderResult> {
  if (input.driverUserId === input.memberUserId) {
    return { ok: false, reason: "own_car" };
  }
  const cycle = await currentCycleNumber();
  return await withTransaction(async (tx) => {
    const [driver] = await tx
      .select({
        intendsToDrive: schema.driverProfiles.intendsToDrive,
        seatsOffered: schema.driverProfiles.seatsOffered,
      })
      .from(schema.driverProfiles)
      .where(
        and(
          eq(schema.driverProfiles.userId, input.driverUserId),
          eq(schema.driverProfiles.cycle, cycle),
        ),
      )
      .for("update");
    if (!driver?.intendsToDrive) {
      return { ok: false as const, reason: "not_a_driver" as const };
    }
    const [member] = await tx
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(
        and(
          eq(schema.users.id, input.memberUserId),
          eq(schema.users.isSystem, false),
          eq(schema.users.sanitised, false),
          eq(schema.users.approvalStatus, "approved"),
        ),
      )
      .limit(1);
    if (!member) return { ok: false as const, reason: "not_a_member" as const };

    const [seated] = await tx
      .select({ riders: count() })
      .from(schema.carMembers)
      .where(
        and(
          eq(schema.carMembers.driverUserId, input.driverUserId),
          eq(schema.carMembers.cycle, cycle),
        ),
      );
    const [inThisCar] = await tx
      .select({ memberUserId: schema.carMembers.memberUserId })
      .from(schema.carMembers)
      .where(
        and(
          eq(schema.carMembers.driverUserId, input.driverUserId),
          eq(schema.carMembers.memberUserId, input.memberUserId),
          eq(schema.carMembers.cycle, cycle),
        ),
      )
      .limit(1);
    if (inThisCar) {
      return { ok: false as const, reason: "already_in_this_car" as const };
    }
    if (
      driver.seatsOffered !== null &&
      (seated?.riders ?? 0) >= driver.seatsOffered
    ) {
      return { ok: false as const, reason: "car_full" as const };
    }

    await tx.insert(schema.carMembers).values({
      driverUserId: input.driverUserId,
      memberUserId: input.memberUserId,
      cycle,
    });
    await writeAuditEvent(tx, {
      actorId: input.actorId,
      action: "car.rider_added",
      target: input.memberUserId,
      metadata: { driverUserId: input.driverUserId, cycle },
    });
    return { ok: true as const };
  });
}

/** Take a member out of a driver's car for this year. False when they were not in it. */
export async function removeCarRider(input: {
  driverUserId: string;
  memberUserId: string;
  actorId: string;
}): Promise<boolean> {
  const cycle = await currentCycleNumber();
  return await withTransaction(async (tx) => {
    const removed = await tx
      .delete(schema.carMembers)
      .where(
        and(
          eq(schema.carMembers.driverUserId, input.driverUserId),
          eq(schema.carMembers.memberUserId, input.memberUserId),
          eq(schema.carMembers.cycle, cycle),
        ),
      )
      .returning({ memberUserId: schema.carMembers.memberUserId });
    if (removed.length === 0) return false;
    await writeAuditEvent(tx, {
      actorId: input.actorId,
      action: "car.rider_removed",
      target: input.memberUserId,
      metadata: { driverUserId: input.driverUserId, cycle },
    });
    return true;
  });
}
