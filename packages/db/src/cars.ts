import { and, asc, eq } from "drizzle-orm";
import { currentCycleNumber } from "./cycles";
import { createHttpDb } from "./index";
import * as schema from "./schema";

// A member's own lift for THIS YEAR: the car they drive, or the car they ride
// in. Seats are written and the car list is read by @camp404/db/transport
// (#270), on the Transport page's rules; this module only answers "my lift"
// for the home page, the My lift program and the Claude connector.

interface CarRider {
  userId: string;
  name: string | null;
  addedAt: Date;
}

/**
 * This year's riders in one driver's car. `cycle` is for a caller that already
 * read the camp's current year; leave it out and it is read here.
 */
async function listCarRiders(
  driverUserId: string,
  cycle?: number,
): Promise<CarRider[]> {
  cycle ??= await currentCycleNumber();
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

/**
 * `cycle` is the camp's current year, for a caller that already read it (the
 * web app's request-cached settings); leave it out and it is read here.
 */
export async function getMyLift(
  userId: string,
  cycle?: number,
): Promise<MyLift | null> {
  cycle ??= await currentCycleNumber();
  const db = createHttpDb();
  // All three reads at once (a lift shows on every console page, through the
  // manifest): whether they drive, the car they ride in, and their riders.
  // Only one of the answers is used; the others are cheap and empty.
  const [[driving], [riding], riders] = await Promise.all([
    db
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
      .limit(1),
    db
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
          // A driver who has since switched off driving keeps their seat rows
          // (nothing deletes them), but there is no car to ride in.
          eq(schema.driverProfiles.intendsToDrive, true),
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
      .limit(1),
    listCarRiders(userId, cycle),
  ]);
  if (driving) {
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
