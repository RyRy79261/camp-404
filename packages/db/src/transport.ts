import { and, asc, count, eq, inArray, ne, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import {
  canEditTransport,
  canManageCar,
  canRemoveRider,
  canSendToAudience,
  carMessageNotification,
  vehicleLabel,
} from "@camp404/core";
import { writeAuditEvent, type DbOrTx } from "./audit";
import { lockSenderReach, resolveAudience } from "./broadcasts";
import { currentCycleNumber } from "./cycles";
import { deliveryValues } from "./deliveries";
import { createHttpDb, withTransaction, type Tx } from "./index";
import { reachRank } from "./power";
import * as schema from "./schema";

// Transport (#270): this year's cars, who rides in them, lift requests, the
// camp's trailers, and a driver's message to their car.
//
//  - Reads: the car list is for every approved member (names and cars only,
//    the fields MEMBER_FIELD_READERS opens). Lift requests and the members
//    without a seat are the caller's to filter by viewer; this module returns
//    the facts.
//  - Writes re-read the actor inside their own transaction (lockSenderReach:
//    rank and led teams, held FOR SHARE) and ask @camp404/core
//    (canEditTransport, canManageCar, canRemoveRider). A caller passes only
//    who is acting, never a rank or a team list.
//  - A seat is written under a lock on the driver's profile row (FOR UPDATE),
//    so two riders cannot take the last seat together and seats cannot drop
//    below the riders already in.
//  - The car message never takes a car from its caller. The car is the
//    sender's own; canSendToAudience's `car` scope decides; the riders are
//    read inside the same transaction that writes the deliveries.
//
// PGlite has ONE connection: everything inside a transaction goes through
// `tx`, never createHttpDb().

export type TransportResult<T = object> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

export const NOT_A_TRANSPORT_EDITOR =
  "Only captains and Transport & Logistics leads can do that.";
export const NOT_YOUR_CAR =
  "Only the driver, a captain or a Transport & Logistics lead can change this car.";
export const NOT_DRIVING =
  "That car isn't driving this year any more. Reload the page.";
export const NOT_A_MEMBER = "That person isn't an approved camp member.";
export const OWN_CAR = "A driver can't ride in their own car.";
export const IS_DRIVING = "They're driving their own car this year.";
export const CAR_FULL = "That car is full: every seat offered is taken.";
export const ALREADY_SEATED = "They already have a seat in a car this year.";
export const NOT_IN_CAR = "They aren't in that car any more. Reload the page.";
export const SEATS_BELOW_RIDERS =
  "More people already ride in this car. Take someone out first.";
export const REQUEST_GONE =
  "That lift request isn't there any more. Reload the page.";
export const YOU_ARE_DRIVING =
  "You're driving this year, so you don't need a lift.";
export const YOU_HAVE_A_SEAT = "You already have a seat in a car this year.";
export const TRAILER_GONE =
  "That trailer isn't there any more. Reload the page.";
export const TRAILER_CHANGED =
  "Someone changed this trailer first. Reload the page.";
export const CANNOT_TOW = "That car can't tow a trailer.";
export const ALREADY_TOWING = "That car already tows a trailer.";
export const CAR_MESSAGE_REFUSED =
  "Only a driver can write to their car, and only while they're driving this year.";
export const CAR_EMPTY =
  "Nobody rides in your car yet, so there's no one to tell.";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// --- Transactions ------------------------------------------------------------

/** A refusal thrown inside a transaction, so it rolls back everything. */
class Refused extends Error {
  constructor(readonly sentence: string) {
    super(sentence);
    this.name = "Refused";
  }
}

function refuse(sentence: string): never {
  throw new Refused(sentence);
}

async function write<T extends object>(
  fn: (tx: Tx) => Promise<T>,
): Promise<TransportResult<T>> {
  try {
    const value = await withTransaction(fn);
    return { ok: true, ...value };
  } catch (error) {
    if (error instanceof Refused) return { ok: false, error: error.sentence };
    throw error;
  }
}

interface LockedActor {
  rank: "captain" | "team_lead" | "camp_member";
  ledTeams: readonly string[];
  cycle: number;
}

/**
 * The actor's rank and led teams, read and held inside the write's own
 * transaction, and the camp's year as the transaction sees it.
 */
async function lockActor(tx: Tx, actorId: string): Promise<LockedActor> {
  if (!UUID.test(actorId)) refuse(NOT_A_TRANSPORT_EDITOR);
  const reach = await lockSenderReach(tx, actorId);
  const cycle = await currentCycleNumber(tx);
  return { rank: reachRank(reach), ledTeams: reach ?? [], cycle };
}

/**
 * An approved, real (not system, not erased) member, or null. `lock` holds
 * their row FOR UPDATE, so two seats for one member (in two cars, whose
 * driver rows are different locks) cannot both be written.
 */
async function approvedMember(tx: Tx, userId: string, lock = false) {
  if (!UUID.test(userId)) return null;
  const query = tx
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(
      and(
        eq(schema.users.id, userId),
        eq(schema.users.isSystem, false),
        eq(schema.users.sanitised, false),
        eq(schema.users.approvalStatus, "approved"),
      ),
    )
    .limit(1);
  const [row] = lock ? await query.for("update") : await query;
  return row ?? null;
}

/** The driver's profile this year, locked FOR UPDATE, if they are driving. */
async function lockDrivingProfile(tx: Tx, driverUserId: string, cycle: number) {
  if (!UUID.test(driverUserId)) return null;
  const [row] = await tx
    .select({
      intendsToDrive: schema.driverProfiles.intendsToDrive,
      seatsOffered: schema.driverProfiles.seatsOffered,
      canTow: schema.driverProfiles.canTow,
    })
    .from(schema.driverProfiles)
    .where(
      and(
        eq(schema.driverProfiles.userId, driverUserId),
        eq(schema.driverProfiles.cycle, cycle),
      ),
    )
    .for("update");
  return row?.intendsToDrive ? row : null;
}

async function isDriving(db: DbOrTx, userId: string, cycle: number) {
  if (!UUID.test(userId)) return false;
  const [row] = await db
    .select({ userId: schema.driverProfiles.userId })
    .from(schema.driverProfiles)
    .where(
      and(
        eq(schema.driverProfiles.userId, userId),
        eq(schema.driverProfiles.cycle, cycle),
        eq(schema.driverProfiles.intendsToDrive, true),
      ),
    )
    .limit(1);
  return Boolean(row);
}

/** The car this member rides in this year (whose driver still drives), if any. */
async function seatOf(db: DbOrTx, memberUserId: string, cycle: number) {
  if (!UUID.test(memberUserId)) return null;
  const [row] = await db
    .select({ driverUserId: schema.carMembers.driverUserId })
    .from(schema.carMembers)
    .innerJoin(
      schema.driverProfiles,
      and(
        eq(schema.driverProfiles.userId, schema.carMembers.driverUserId),
        eq(schema.driverProfiles.cycle, schema.carMembers.cycle),
        eq(schema.driverProfiles.intendsToDrive, true),
      ),
    )
    .where(
      and(
        eq(schema.carMembers.memberUserId, memberUserId),
        eq(schema.carMembers.cycle, cycle),
      ),
    )
    .limit(1);
  return row ?? null;
}

async function ridersIn(tx: Tx, driverUserId: string, cycle: number) {
  const [row] = await tx
    .select({ riders: count() })
    .from(schema.carMembers)
    .where(
      and(
        eq(schema.carMembers.driverUserId, driverUserId),
        eq(schema.carMembers.cycle, cycle),
      ),
    );
  return row?.riders ?? 0;
}

/**
 * Seat a member in a car, with every check, inside `tx`: the car drives this
 * year (locked), the member is approved, not driving, not the driver, not
 * already seated in any car this year, and a seat is free. Their lift
 * request, if any, is spent in the same transaction.
 */
async function seat(
  tx: Tx,
  input: {
    actorId: string;
    driverUserId: string;
    memberUserId: string;
    cycle: number;
  },
): Promise<void> {
  const { driverUserId, memberUserId, cycle } = input;
  if (driverUserId === memberUserId) refuse(OWN_CAR);
  const driver = await lockDrivingProfile(tx, driverUserId, cycle);
  if (!driver) refuse(NOT_DRIVING);
  if (!(await approvedMember(tx, memberUserId, true))) refuse(NOT_A_MEMBER);
  if (await isDriving(tx, memberUserId, cycle)) refuse(IS_DRIVING);
  // A seat in a car whose driver stopped driving is no seat: every read
  // (seatOf, the board, the unseated list) already ignores it, and nobody can
  // see that car to take the member out. Drop it here, so the member can be
  // seated again and cannot end up in two cars if the old driver drives
  // again. The member's own row is locked above, so this cannot race.
  await tx.delete(schema.carMembers).where(
    and(
      eq(schema.carMembers.memberUserId, memberUserId),
      eq(schema.carMembers.cycle, cycle),
      sql`${schema.carMembers.driverUserId} not in (
          select ${schema.driverProfiles.userId} from ${schema.driverProfiles}
          where ${schema.driverProfiles.cycle} = ${cycle}
            and ${schema.driverProfiles.intendsToDrive} = true
        )`,
    ),
  );
  if (await seatOf(tx, memberUserId, cycle)) refuse(ALREADY_SEATED);
  if (
    driver.seatsOffered !== null &&
    (await ridersIn(tx, driverUserId, cycle)) >= driver.seatsOffered
  ) {
    refuse(CAR_FULL);
  }
  await tx
    .insert(schema.carMembers)
    .values({ driverUserId, memberUserId, cycle });
  await tx
    .delete(schema.liftRequests)
    .where(
      and(
        eq(schema.liftRequests.userId, memberUserId),
        eq(schema.liftRequests.cycle, cycle),
      ),
    );
  await writeAuditEvent(tx, {
    actorId: input.actorId,
    action: "car.rider_added",
    target: memberUserId,
    metadata: { driverUserId, cycle },
  });
}

// --- Reads -------------------------------------------------------------------

export interface TransportRider {
  userId: string;
  name: string | null;
}

/** One car driving this year, as every member may read it. */
export interface TransportCar {
  driverUserId: string;
  driverName: string | null;
  vehicle: string | null;
  departureCity: string | null;
  seatsOffered: number | null;
  canTow: boolean;
  riders: TransportRider[];
  /** The trailer it tows this year, if any. */
  trailer: { id: string; name: string } | null;
}

export interface TrailerRow {
  id: string;
  name: string;
  notes: string | null;
  version: number;
  /** The car towing it, while its driver drives this year; else null. */
  towedByUserId: string | null;
  towedByName: string | null;
}

export interface TransportBoard {
  cycle: number;
  cars: TransportCar[];
  trailers: TrailerRow[];
}

/**
 * This year's cars (drivers who intend to drive, erased members left out),
 * their riders and trailers, and the trailer list. Four reads at once.
 */
export async function getTransportBoard(
  cycle?: number,
): Promise<TransportBoard> {
  cycle ??= await currentCycleNumber();
  const db = createHttpDb();
  const rider = alias(schema.users, "rider");
  const [drivers, seats, trailers] = await Promise.all([
    db
      .select({
        userId: schema.driverProfiles.userId,
        name: schema.users.displayName,
        vehicleMake: schema.driverProfiles.vehicleMake,
        vehicleModel: schema.driverProfiles.vehicleModel,
        departureCity: schema.driverProfiles.departureCity,
        seatsOffered: schema.driverProfiles.seatsOffered,
        canTow: schema.driverProfiles.canTow,
      })
      .from(schema.driverProfiles)
      .innerJoin(
        schema.users,
        eq(schema.users.id, schema.driverProfiles.userId),
      )
      .where(
        and(
          eq(schema.driverProfiles.cycle, cycle),
          eq(schema.driverProfiles.intendsToDrive, true),
          eq(schema.users.sanitised, false),
          eq(schema.users.isSystem, false),
        ),
      )
      .orderBy(asc(schema.users.displayName), asc(schema.users.id)),
    db
      .select({
        driverUserId: schema.carMembers.driverUserId,
        userId: schema.carMembers.memberUserId,
        name: rider.displayName,
      })
      .from(schema.carMembers)
      .innerJoin(rider, eq(rider.id, schema.carMembers.memberUserId))
      .where(
        and(eq(schema.carMembers.cycle, cycle), eq(rider.sanitised, false)),
      )
      .orderBy(asc(schema.carMembers.createdAt), asc(rider.id)),
    db
      .select({
        id: schema.transportTrailers.id,
        name: schema.transportTrailers.name,
        notes: schema.transportTrailers.notes,
        version: schema.transportTrailers.version,
        towedByUserId: schema.transportTrailers.towedByUserId,
      })
      .from(schema.transportTrailers)
      .where(eq(schema.transportTrailers.cycle, cycle))
      .orderBy(
        asc(schema.transportTrailers.name),
        asc(schema.transportTrailers.id),
      ),
  ]);

  const driverById = new Map(drivers.map((d) => [d.userId, d]));
  const trailerRows: TrailerRow[] = trailers.map((t) => {
    const driver = t.towedByUserId ? driverById.get(t.towedByUserId) : null;
    return {
      id: t.id,
      name: t.name,
      notes: t.notes,
      version: t.version,
      towedByUserId: driver ? driver.userId : null,
      towedByName: driver ? driver.name : null,
    };
  });
  const cars: TransportCar[] = drivers.map((d) => {
    const trailer = trailerRows.find((t) => t.towedByUserId === d.userId);
    return {
      driverUserId: d.userId,
      driverName: d.name,
      vehicle: vehicleLabel(d.vehicleMake, d.vehicleModel),
      departureCity: d.departureCity,
      seatsOffered: d.seatsOffered,
      canTow: d.canTow,
      riders: seats
        .filter((s) => s.driverUserId === d.userId)
        .map((s) => ({ userId: s.userId, name: s.name })),
      trailer: trailer ? { id: trailer.id, name: trailer.name } : null,
    };
  });
  return { cycle, cars, trailers: trailerRows };
}

export interface LiftRequestRow {
  userId: string;
  name: string | null;
  /** The car asked for, while its driver drives this year; null is any car. */
  driverUserId: string | null;
  createdAt: Date;
}

/**
 * Every open lift request this year, oldest first. Who may see which is the
 * caller's filter (liftRequestsFor in the web app): a transport editor all of
 * them, a driver the ones for their car, a member their own.
 */
export async function listLiftRequests(
  cycle?: number,
): Promise<LiftRequestRow[]> {
  cycle ??= await currentCycleNumber();
  const db = createHttpDb();
  const rows = await db
    .select({
      userId: schema.liftRequests.userId,
      name: schema.users.displayName,
      driverUserId: schema.liftRequests.driverUserId,
      driving: schema.driverProfiles.intendsToDrive,
      createdAt: schema.liftRequests.createdAt,
    })
    .from(schema.liftRequests)
    .innerJoin(schema.users, eq(schema.users.id, schema.liftRequests.userId))
    .leftJoin(
      schema.driverProfiles,
      and(
        eq(schema.driverProfiles.userId, schema.liftRequests.driverUserId),
        eq(schema.driverProfiles.cycle, schema.liftRequests.cycle),
      ),
    )
    .where(
      and(
        eq(schema.liftRequests.cycle, cycle),
        eq(schema.users.sanitised, false),
      ),
    )
    .orderBy(asc(schema.liftRequests.createdAt), asc(schema.users.id));
  return rows.map((r) => ({
    userId: r.userId,
    name: r.name,
    driverUserId: r.driving ? r.driverUserId : null,
    createdAt: r.createdAt,
  }));
}

export interface UnseatedMember {
  userId: string;
  name: string | null;
}

/**
 * Approved members coming this year (said Yes or Maybe, or accepted) who
 * neither drive nor have a seat: the people the transport team still has to
 * match. Built on the attendance status, which only team leads and captains
 * read (MEMBER_FIELD_READERS), so the page shows it to transport editors only.
 */
export async function listUnseated(cycle?: number): Promise<UnseatedMember[]> {
  cycle ??= await currentCycleNumber();
  const db = createHttpDb();
  const seated = db
    .select({ userId: schema.carMembers.memberUserId })
    .from(schema.carMembers)
    .innerJoin(
      schema.driverProfiles,
      and(
        eq(schema.driverProfiles.userId, schema.carMembers.driverUserId),
        eq(schema.driverProfiles.cycle, schema.carMembers.cycle),
        eq(schema.driverProfiles.intendsToDrive, true),
      ),
    )
    .where(eq(schema.carMembers.cycle, cycle));
  const driving = db
    .select({ userId: schema.driverProfiles.userId })
    .from(schema.driverProfiles)
    .where(
      and(
        eq(schema.driverProfiles.cycle, cycle),
        eq(schema.driverProfiles.intendsToDrive, true),
      ),
    );
  return db
    .select({ userId: schema.users.id, name: schema.users.displayName })
    .from(schema.campParticipations)
    .innerJoin(
      schema.users,
      eq(schema.users.id, schema.campParticipations.userId),
    )
    .where(
      and(
        eq(schema.campParticipations.cycle, cycle),
        inArray(schema.campParticipations.status, [
          "applied",
          "maybe",
          "accepted",
        ]),
        eq(schema.users.approvalStatus, "approved"),
        eq(schema.users.sanitised, false),
        eq(schema.users.isSystem, false),
        sql`${schema.users.id} not in ${seated}`,
        sql`${schema.users.id} not in ${driving}`,
      ),
    )
    .orderBy(asc(schema.users.displayName), asc(schema.users.id));
}

// --- Seats -------------------------------------------------------------------

/** Put a member in a car: the car's driver, or a transport editor. */
export async function addRider(input: {
  actorId: string;
  driverUserId: string;
  memberUserId: string;
}): Promise<TransportResult> {
  return write(async (tx) => {
    const actor = await lockActor(tx, input.actorId);
    if (
      !canManageCar(
        actor.rank,
        actor.ledTeams,
        input.actorId,
        input.driverUserId,
      )
    ) {
      refuse(NOT_YOUR_CAR);
    }
    await seat(tx, { ...input, cycle: actor.cycle });
    return {};
  });
}

/**
 * Take a member out of a car: the car's driver, a transport editor, or the
 * rider themself.
 */
export async function removeRider(input: {
  actorId: string;
  driverUserId: string;
  memberUserId: string;
}): Promise<TransportResult> {
  return write(async (tx) => {
    const actor = await lockActor(tx, input.actorId);
    if (
      !canRemoveRider(
        actor.rank,
        actor.ledTeams,
        input.actorId,
        input.driverUserId,
        input.memberUserId,
      )
    ) {
      refuse(NOT_YOUR_CAR);
    }
    if (!UUID.test(input.driverUserId) || !UUID.test(input.memberUserId)) {
      refuse(NOT_IN_CAR);
    }
    const removed = await tx
      .delete(schema.carMembers)
      .where(
        and(
          eq(schema.carMembers.driverUserId, input.driverUserId),
          eq(schema.carMembers.memberUserId, input.memberUserId),
          eq(schema.carMembers.cycle, actor.cycle),
        ),
      )
      .returning({ memberUserId: schema.carMembers.memberUserId });
    if (removed.length === 0) refuse(NOT_IN_CAR);
    await writeAuditEvent(tx, {
      actorId: input.actorId,
      action: "car.rider_removed",
      target: input.memberUserId,
      metadata: { driverUserId: input.driverUserId, cycle: actor.cycle },
    });
    return {};
  });
}

/**
 * How many seats a car offers: the car's driver, or a transport editor. Never
 * below the riders already in it. Audited: it is the driver's own profile.
 */
export async function setSeatsOffered(input: {
  actorId: string;
  driverUserId: string;
  seatsOffered: number;
}): Promise<TransportResult> {
  return write(async (tx) => {
    const actor = await lockActor(tx, input.actorId);
    if (
      !canManageCar(
        actor.rank,
        actor.ledTeams,
        input.actorId,
        input.driverUserId,
      )
    ) {
      refuse(NOT_YOUR_CAR);
    }
    const driver = await lockDrivingProfile(
      tx,
      input.driverUserId,
      actor.cycle,
    );
    if (!driver) refuse(NOT_DRIVING);
    if (
      (await ridersIn(tx, input.driverUserId, actor.cycle)) > input.seatsOffered
    ) {
      refuse(SEATS_BELOW_RIDERS);
    }
    await tx
      .update(schema.driverProfiles)
      .set({ seatsOffered: input.seatsOffered, updatedAt: new Date() })
      .where(
        and(
          eq(schema.driverProfiles.userId, input.driverUserId),
          eq(schema.driverProfiles.cycle, actor.cycle),
        ),
      );
    await writeAuditEvent(tx, {
      actorId: input.actorId,
      action: "car.seats_set",
      target: input.driverUserId,
      metadata: {
        cycle: actor.cycle,
        from: driver.seatsOffered,
        to: input.seatsOffered,
      },
    });
    return {};
  });
}

// --- Lift requests -----------------------------------------------------------

/**
 * The signed-in member asks for a lift this year, in one car or in any car. A
 * second ask replaces the first. Refused to a driver and to a member who
 * already has a seat.
 */
export async function requestLift(input: {
  actorId: string;
  driverUserId: string | null;
}): Promise<TransportResult> {
  return write(async (tx) => {
    const actor = await lockActor(tx, input.actorId);
    if (!(await approvedMember(tx, input.actorId))) refuse(NOT_A_MEMBER);
    if (await isDriving(tx, input.actorId, actor.cycle))
      refuse(YOU_ARE_DRIVING);
    if (await seatOf(tx, input.actorId, actor.cycle)) refuse(YOU_HAVE_A_SEAT);
    if (input.driverUserId !== null) {
      if (input.driverUserId === input.actorId) refuse(OWN_CAR);
      if (!(await isDriving(tx, input.driverUserId, actor.cycle))) {
        refuse(NOT_DRIVING);
      }
    }
    await tx
      .insert(schema.liftRequests)
      .values({
        userId: input.actorId,
        cycle: actor.cycle,
        driverUserId: input.driverUserId,
      })
      .onConflictDoUpdate({
        target: [schema.liftRequests.userId, schema.liftRequests.cycle],
        set: { driverUserId: input.driverUserId, createdAt: new Date() },
      });
    return {};
  });
}

/** The signed-in member takes back their own lift request. */
export async function withdrawLiftRequest(input: {
  actorId: string;
}): Promise<TransportResult> {
  return write(async (tx) => {
    const actor = await lockActor(tx, input.actorId);
    const gone = await tx
      .delete(schema.liftRequests)
      .where(
        and(
          eq(schema.liftRequests.userId, input.actorId),
          eq(schema.liftRequests.cycle, actor.cycle),
        ),
      )
      .returning({ userId: schema.liftRequests.userId });
    if (gone.length === 0) refuse(REQUEST_GONE);
    return {};
  });
}

/**
 * Answer a member's lift request. Accepting seats them in the car they asked
 * for, and only that car's driver or a transport editor may; a request for
 * "any car" is matched by a transport editor putting them in a car
 * (addRider). Declining deletes the request: the asked driver, or a
 * transport editor for any request.
 */
export async function answerLiftRequest(input: {
  actorId: string;
  memberUserId: string;
  accept: boolean;
}): Promise<TransportResult> {
  return write(async (tx) => {
    const actor = await lockActor(tx, input.actorId);
    if (!UUID.test(input.memberUserId)) refuse(REQUEST_GONE);
    const [request] = await tx
      .select({ driverUserId: schema.liftRequests.driverUserId })
      .from(schema.liftRequests)
      .where(
        and(
          eq(schema.liftRequests.userId, input.memberUserId),
          eq(schema.liftRequests.cycle, actor.cycle),
        ),
      )
      .for("update");
    if (!request) refuse(REQUEST_GONE);
    const editor = canEditTransport(actor.rank, actor.ledTeams);
    const car = request.driverUserId;
    const mayAnswer =
      car !== null
        ? canManageCar(actor.rank, actor.ledTeams, input.actorId, car)
        : editor;
    if (!mayAnswer) refuse(NOT_YOUR_CAR);
    if (input.accept) {
      if (car === null) refuse(REQUEST_GONE);
      // seat() spends the request in the same transaction.
      await seat(tx, {
        actorId: input.actorId,
        driverUserId: car,
        memberUserId: input.memberUserId,
        cycle: actor.cycle,
      });
      return {};
    }
    await tx
      .delete(schema.liftRequests)
      .where(
        and(
          eq(schema.liftRequests.userId, input.memberUserId),
          eq(schema.liftRequests.cycle, actor.cycle),
        ),
      );
    return {};
  });
}

// --- Trailers ----------------------------------------------------------------

async function assertEditor(tx: Tx, actorId: string): Promise<LockedActor> {
  const actor = await lockActor(tx, actorId);
  if (!canEditTransport(actor.rank, actor.ledTeams)) {
    refuse(NOT_A_TRANSPORT_EDITOR);
  }
  return actor;
}

/** Add a trailer to this year's list. */
export async function addTrailer(input: {
  actorId: string;
  name: string;
  notes: string | null;
}): Promise<TransportResult<{ id: string }>> {
  return write(async (tx) => {
    const actor = await assertEditor(tx, input.actorId);
    const [row] = await tx
      .insert(schema.transportTrailers)
      .values({ cycle: actor.cycle, name: input.name, notes: input.notes })
      .returning({ id: schema.transportTrailers.id });
    return { id: row!.id };
  });
}

/** The version-checked claim on one of this year's trailers. */
function trailerClaim(trailerId: string, cycle: number, version: number) {
  return and(
    eq(schema.transportTrailers.id, trailerId),
    eq(schema.transportTrailers.cycle, cycle),
    eq(schema.transportTrailers.version, version),
  );
}

/** Why a trailer claim wrote nothing: gone, or changed first. */
async function trailerRefusal(tx: Tx, trailerId: string, cycle: number) {
  const [row] = await tx
    .select({ id: schema.transportTrailers.id })
    .from(schema.transportTrailers)
    .where(
      and(
        eq(schema.transportTrailers.id, trailerId),
        eq(schema.transportTrailers.cycle, cycle),
      ),
    );
  return row ? TRAILER_CHANGED : TRAILER_GONE;
}

/** Rename a trailer or change its notes, on the version the editor saw. */
export async function updateTrailer(input: {
  actorId: string;
  trailerId: string;
  name: string;
  notes: string | null;
  expectedVersion: number;
}): Promise<TransportResult> {
  return write(async (tx) => {
    const actor = await assertEditor(tx, input.actorId);
    if (!UUID.test(input.trailerId)) refuse(TRAILER_GONE);
    const rows = await tx
      .update(schema.transportTrailers)
      .set({
        name: input.name,
        notes: input.notes,
        version: sql`${schema.transportTrailers.version} + 1`,
        updatedAt: new Date(),
      })
      .where(trailerClaim(input.trailerId, actor.cycle, input.expectedVersion))
      .returning({ id: schema.transportTrailers.id });
    if (rows.length === 0) {
      refuse(await trailerRefusal(tx, input.trailerId, actor.cycle));
    }
    return {};
  });
}

/**
 * Which car tows a trailer (null: none). The car must drive this year, be
 * able to tow, and tow no other trailer this year.
 */
export async function setTrailerTow(input: {
  actorId: string;
  trailerId: string;
  driverUserId: string | null;
  expectedVersion: number;
}): Promise<TransportResult> {
  return write(async (tx) => {
    const actor = await assertEditor(tx, input.actorId);
    if (!UUID.test(input.trailerId)) refuse(TRAILER_GONE);
    if (input.driverUserId !== null) {
      const driver = await lockDrivingProfile(
        tx,
        input.driverUserId,
        actor.cycle,
      );
      if (!driver) refuse(NOT_DRIVING);
      if (!driver.canTow) refuse(CANNOT_TOW);
      const [other] = await tx
        .select({ id: schema.transportTrailers.id })
        .from(schema.transportTrailers)
        .where(
          and(
            eq(schema.transportTrailers.towedByUserId, input.driverUserId),
            eq(schema.transportTrailers.cycle, actor.cycle),
            ne(schema.transportTrailers.id, input.trailerId),
          ),
        );
      if (other) refuse(ALREADY_TOWING);
    }
    const rows = await tx
      .update(schema.transportTrailers)
      .set({
        towedByUserId: input.driverUserId,
        version: sql`${schema.transportTrailers.version} + 1`,
        updatedAt: new Date(),
      })
      .where(trailerClaim(input.trailerId, actor.cycle, input.expectedVersion))
      .returning({ id: schema.transportTrailers.id });
    if (rows.length === 0) {
      refuse(await trailerRefusal(tx, input.trailerId, actor.cycle));
    }
    return {};
  });
}

/** Take a trailer off this year's list, on the version the editor saw. */
export async function removeTrailer(input: {
  actorId: string;
  trailerId: string;
  expectedVersion: number;
}): Promise<TransportResult> {
  return write(async (tx) => {
    const actor = await assertEditor(tx, input.actorId);
    if (!UUID.test(input.trailerId)) refuse(TRAILER_GONE);
    const rows = await tx
      .delete(schema.transportTrailers)
      .where(trailerClaim(input.trailerId, actor.cycle, input.expectedVersion))
      .returning({ id: schema.transportTrailers.id });
    if (rows.length === 0) {
      refuse(await trailerRefusal(tx, input.trailerId, actor.cycle));
    }
    return {};
  });
}

// --- The car message -----------------------------------------------------------

/**
 * A driver writes to the people riding in their car this year.
 *
 * In ONE transaction: the sender's rank is re-read and held (lockSenderReach),
 * their own driver profile for this year is locked, canSendToAudience decides
 * on the `car` scope for THEIR car, the riders are read through the shared
 * resolver (the same one every broadcast uses), and the broadcast and one
 * delivery per rider are written. There is no car parameter: a caller cannot
 * name another car, and a rider list is never taken from outside.
 *
 * Refused when the sender is not driving this year, and when nobody rides
 * with them (no empty broadcast is written).
 */
export async function sendCarMessage(input: {
  senderId: string;
  title: string;
  body: string;
}): Promise<TransportResult<{ broadcastId: string; recipientCount: number }>> {
  return write(async (tx) => {
    if (!UUID.test(input.senderId)) refuse(CAR_MESSAGE_REFUSED);
    const reach = await lockSenderReach(tx, input.senderId);
    const cycle = await currentCycleNumber(tx);
    // FOR UPDATE on the driver's row: a seat added or taken away (both lock
    // this row first) waits for the message, so the riders read below are
    // the car as the message leaves.
    const driver = await lockDrivingProfile(tx, input.senderId, cycle);
    const allowed = canSendToAudience(
      {
        rank: reachRank(reach),
        leadTeams: reach ?? [],
        userId: input.senderId,
        drivesCar: driver !== null,
      },
      { scope: "car", driverUserId: input.senderId },
    );
    if (!allowed) refuse(CAR_MESSAGE_REFUSED);

    const recipientIds = await resolveAudience(
      { id: "", scope: "car", team: null },
      input.senderId,
      tx,
    );
    if (recipientIds.length === 0) refuse(CAR_EMPTY);

    const now = new Date();
    const [broadcast] = await tx
      .insert(schema.broadcasts)
      .values({
        senderId: input.senderId,
        kind: "car_message",
        scope: "car",
        title: input.title,
        body: input.body,
        channel: "both",
        presentation: "feed",
        refType: "car_message",
        publishedAt: now,
        // Fanned out right here, so the scheduled drain never picks it up.
        dispatchedAt: now,
      })
      .returning({ id: schema.broadcasts.id });
    const payload = carMessageNotification({
      broadcastId: broadcast!.id,
      title: input.title,
      body: input.body,
    });
    await tx
      .insert(schema.notificationDeliveries)
      .values(
        recipientIds.map((userId) =>
          deliveryValues(payload, {
            userId,
            broadcastId: broadcast!.id,
            channel: "both",
            presentation: "feed",
          }),
        ),
      )
      .onConflictDoNothing();
    return { broadcastId: broadcast!.id, recipientCount: recipientIds.length };
  });
}

/** Whether a member drives this year: the car message's screen gate. */
export async function drivesThisYear(
  userId: string,
  cycle?: number,
): Promise<boolean> {
  cycle ??= await currentCycleNumber();
  return isDriving(createHttpDb(), userId, cycle);
}
