import { and, asc, count, eq, inArray, sql } from "drizzle-orm";
import {
  SHIFTS_ACTION_KEY,
  SHIFTS_ACTION_TITLE,
  SHIFTS_REF_TYPE,
  campDayKey,
  canAskForShifts,
  canManageShifts,
  shiftChangesOpen,
  shiftDays,
  shiftsAskNotification,
} from "@camp404/core";
import {
  MAX_SHIFT_TYPES,
  MAX_VOLUNTEER_SHIFTS,
  SHIFT_MINIMUM,
  type ShiftSlotStatus,
  type Team,
} from "@camp404/types";
import { writeAuditEvent, type DbOrTx } from "./audit";
import { lockSenderReach } from "./broadcasts";
import { currentCycleNumber } from "./cycles";
import { createHttpDb, withTransaction, type Tx } from "./index";
import { comingMembers } from "./logistics";
import { closeNudge, openNudges } from "./nudges";
import { reachRank } from "./power";
import * as schema from "./schema";

// The shift roster (#248). The data layer.
//
//  - Members sign up in the app before the burn; the roster is printed for
//    site and changed there on paper, never typed back in (owner,
//    2026-09-30). So a slot takes changes only until its day starts
//    (shiftChangesOpen), for everyone, leads and captains too.
//  - A shift type belongs to one team. A captain or a lead of THAT team sets
//    it up and puts members on or takes them off (canManageShifts). Every
//    write re-reads the actor's rank and the teams they lead this year INSIDE
//    its own transaction (lockSenderReach), so a demotion that committed
//    first is seen and one that comes later waits. A caller passes only who
//    is acting, never a rank or a team list.
//  - Taking a place locks the slot's row and counts who is on it, so two
//    members can never take the last place.
//  - Changes to shift types and days, and a lead putting someone on or
//    taking them off, are audited in the same transaction. A member's own
//    sign-up is not: it is theirs.
//  - The minimum (SHIFT_MINIMUM) is a reminder only. A captain's "Ask
//    everyone" opens the shared nudge; reaching the minimum closes it.
//
// PGlite has ONE connection: everything inside a transaction goes through
// `tx`, never createHttpDb().

export type ShiftWriteResult<T = object> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

export const NOT_A_SHIFT_KEEPER =
  "Only captains and that team's leads can set up its shifts.";
export const SHIFT_TYPE_CHANGED =
  "Someone changed this shift first. Reload the page.";
export const SHIFT_SLOT_CHANGED =
  "Someone changed this day first. Reload the page.";
export const SHIFT_GONE = "That shift isn't there any more. Reload the page.";
export const SHIFT_FULL = "That shift is full. Pick another one.";
export const SHIFT_NOT_NEEDED = "That shift isn't needed that day.";
export const SHIFT_ALREADY_ON = "You're already on this shift.";
export const SHIFT_MEMBER_ALREADY_ON = "They're already on this shift.";
export const SHIFT_NOT_ON =
  "You're not on this shift any more. Reload the page.";
export const SHIFT_MEMBER_NOT_ON =
  "They're not on this shift any more. Reload the page.";
export const SHIFT_CLOSED =
  "That day has started. Change the printed roster instead.";
export const SHIFT_NOT_A_MEMBER = "Only approved camp members can take shifts.";
export const SHIFT_HAS_PEOPLE =
  "People are on this shift. Take them off first.";
export const SHIFT_DAY_HAS_PEOPLE =
  "People are on this day. Take them off first.";
export const NO_BURN_DAYS = "Set the Burn's days on Logistics first.";
export const TOO_MANY_SHIFT_TYPES = `The roster holds ${MAX_SHIFT_TYPES} shifts at most. Remove one first.`;
export const NOT_A_SHIFT_ASKER = "Only captains can ask everyone about shifts.";
export const TOO_MANY_VOLUNTEER_SHIFTS = `You can list ${MAX_VOLUNTEER_SHIFTS} AfrikaBurn shifts at most.`;
export const VOLUNTEER_SHIFT_GONE =
  "That AfrikaBurn shift isn't there any more. Reload the page.";

/** Fewer places than people already on one of its days. */
export function placesBelowTaken(taken: number): string {
  return `${taken} people are already on one of its days. Keep at least ${taken} places, or take someone off first.`;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// --- Rows --------------------------------------------------------------------

export interface ShiftTypeRow {
  id: string;
  cycle: number;
  team: Team;
  name: string;
  startMinute: number;
  durationMinutes: number;
  places: number;
  note: string | null;
  version: number;
}

export interface ShiftSlotRow {
  id: string;
  typeId: string;
  day: string;
  status: ShiftSlotStatus;
  version: number;
}

export interface ShiftSignupRow {
  slotId: string;
  userId: string;
  name: string;
  /** The lead or captain who put them on; null when they signed up. */
  addedByUserId: string | null;
}

/** The year's roster: its shift types, their days, and who is on each. */
export interface ShiftRosterRead {
  types: ShiftTypeRow[];
  slots: ShiftSlotRow[];
  signups: ShiftSignupRow[];
}

export interface VolunteerShiftRow {
  id: string;
  department: string;
  day: string;
  startMinute: number;
  durationMinutes: number;
}

const TYPE_COLUMNS = {
  id: schema.shiftTypes.id,
  cycle: schema.shiftTypes.cycle,
  team: schema.shiftTypes.team,
  name: schema.shiftTypes.name,
  startMinute: schema.shiftTypes.startMinute,
  durationMinutes: schema.shiftTypes.durationMinutes,
  places: schema.shiftTypes.places,
  note: schema.shiftTypes.note,
  version: schema.shiftTypes.version,
};

const SLOT_COLUMNS = {
  id: schema.shiftSlots.id,
  typeId: schema.shiftSlots.typeId,
  day: schema.shiftSlots.day,
  status: schema.shiftSlots.status,
  version: schema.shiftSlots.version,
};

const nameOf = (name: string | null) => name?.trim() || "Unnamed burner";

/** Approved, real, not erased: a member who may be on a shift. */
const realMember = and(
  eq(schema.users.isSystem, false),
  eq(schema.users.sanitised, false),
  eq(schema.users.approvalStatus, "approved"),
);

// --- Transactions ------------------------------------------------------------

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
): Promise<ShiftWriteResult<T>> {
  try {
    const value = await withTransaction(fn);
    return { ok: true, ...value };
  } catch (error) {
    if (error instanceof Refused) return { ok: false, error: error.sentence };
    throw error;
  }
}

/** The actor's rank and led teams, read and locked inside the write. */
async function lockKeeper(
  tx: Tx,
  actorId: string,
): Promise<{ rank: string; led: readonly string[] }> {
  if (!UUID.test(actorId)) refuse(NOT_A_SHIFT_KEEPER);
  const reach = await lockSenderReach(tx, actorId);
  return { rank: reachRank(reach), led: reach ?? [] };
}

function assertKeeper(
  keeper: { rank: string; led: readonly string[] },
  team: string,
): void {
  if (!canManageShifts(keeper.rank, keeper.led, team)) {
    refuse(NOT_A_SHIFT_KEEPER);
  }
}

/** This year's Burn days, from the logistics calendar's Burn phase. */
async function burnDaysIn(db: DbOrTx, cycle: number): Promise<string[]> {
  const [burn] = await db
    .select({
      start: schema.logisticsPhases.startDate,
      end: schema.logisticsPhases.endDate,
    })
    .from(schema.logisticsPhases)
    .where(
      and(
        eq(schema.logisticsPhases.cycle, cycle),
        eq(schema.logisticsPhases.phase, "burn"),
      ),
    );
  return shiftDays(burn ?? null);
}

/** Give a type a slot on each of `days` it has none for. Returns how many. */
async function addMissingSlots(
  tx: Tx,
  typeId: string,
  days: readonly string[],
): Promise<number> {
  if (days.length === 0) return 0;
  const added = await tx
    .insert(schema.shiftSlots)
    .values(days.map((day) => ({ typeId, day })))
    .onConflictDoNothing({
      target: [schema.shiftSlots.typeId, schema.shiftSlots.day],
    })
    .returning({ id: schema.shiftSlots.id });
  return added.length;
}

/** A shift type of this year, locked for the write. */
async function lockType(
  tx: Tx,
  id: string,
  cycle: number,
): Promise<ShiftTypeRow | undefined> {
  if (!UUID.test(id)) return undefined;
  const [row] = await tx
    .select(TYPE_COLUMNS)
    .from(schema.shiftTypes)
    .where(
      and(eq(schema.shiftTypes.id, id), eq(schema.shiftTypes.cycle, cycle)),
    )
    .for("update");
  return row;
}

/**
 * A slot of this year and its type, for a write: the type's row locked FOR
 * SHARE, then the slot's row FOR UPDATE. The share lock makes a sign-up and
 * a change to the type (fewer places, or removing it, both FOR UPDATE on the
 * type) wait for each other, so neither counts sign-ups the other is still
 * writing. Type before slot, the same order saveShiftType and removeShiftType
 * take, so the two cannot deadlock.
 */
async function lockSlot(
  tx: Tx,
  slotId: string,
  cycle: number,
): Promise<{ slot: ShiftSlotRow; type: ShiftTypeRow } | undefined> {
  if (!UUID.test(slotId)) return undefined;
  // A slot never changes type, so its type can be read before the lock.
  const [owner] = await tx
    .select({ typeId: schema.shiftSlots.typeId })
    .from(schema.shiftSlots)
    .where(eq(schema.shiftSlots.id, slotId));
  if (!owner) return undefined;
  const [type] = await tx
    .select(TYPE_COLUMNS)
    .from(schema.shiftTypes)
    .where(
      and(
        eq(schema.shiftTypes.id, owner.typeId),
        eq(schema.shiftTypes.cycle, cycle),
      ),
    )
    .for("share");
  if (!type) return undefined;
  const [slot] = await tx
    .select(SLOT_COLUMNS)
    .from(schema.shiftSlots)
    .where(eq(schema.shiftSlots.id, slotId))
    .for("update");
  return slot ? { slot, type } : undefined;
}

async function takenOn(tx: Tx, slotId: string): Promise<number> {
  const [row] = await tx
    .select({ n: count() })
    .from(schema.shiftSignups)
    .where(eq(schema.shiftSignups.slotId, slotId));
  return row?.n ?? 0;
}

/** How many shifts a member is on this year. */
async function shiftsOf(
  db: DbOrTx,
  userId: string,
  cycle: number,
): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(schema.shiftSignups)
    .innerJoin(
      schema.shiftSlots,
      eq(schema.shiftSlots.id, schema.shiftSignups.slotId),
    )
    .innerJoin(
      schema.shiftTypes,
      eq(schema.shiftTypes.id, schema.shiftSlots.typeId),
    )
    .where(
      and(
        eq(schema.shiftSignups.userId, userId),
        eq(schema.shiftTypes.cycle, cycle),
      ),
    );
  return row?.n ?? 0;
}

async function isRealMember(tx: Tx, userId: string): Promise<boolean> {
  if (!UUID.test(userId)) return false;
  const [member] = await tx
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(and(eq(schema.users.id, userId), realMember))
    .for("share");
  return Boolean(member);
}

/** Close the member's "Ask everyone" nudge once they have enough shifts. */
async function closeIfEnough(
  tx: Tx,
  userId: string,
  cycle: number,
  now: Date,
): Promise<number> {
  const mine = await shiftsOf(tx, userId, cycle);
  if (mine >= SHIFT_MINIMUM) {
    await closeNudge(tx, {
      userId,
      actionKey: SHIFTS_ACTION_KEY,
      refType: SHIFTS_REF_TYPE,
      now,
    });
  }
  return mine;
}

// --- Reads -------------------------------------------------------------------

/** The year's roster. Every approved member reads it. */
export async function readShiftRoster(cycle: number): Promise<ShiftRosterRead> {
  const db = createHttpDb();
  const [types, slots, signups] = await Promise.all([
    db
      .select(TYPE_COLUMNS)
      .from(schema.shiftTypes)
      .where(eq(schema.shiftTypes.cycle, cycle))
      .orderBy(asc(schema.shiftTypes.startMinute), asc(schema.shiftTypes.name)),
    db
      .select(SLOT_COLUMNS)
      .from(schema.shiftSlots)
      .innerJoin(
        schema.shiftTypes,
        eq(schema.shiftTypes.id, schema.shiftSlots.typeId),
      )
      .where(eq(schema.shiftTypes.cycle, cycle))
      .orderBy(asc(schema.shiftSlots.day)),
    db
      .select({
        slotId: schema.shiftSignups.slotId,
        userId: schema.shiftSignups.userId,
        name: schema.users.displayName,
        addedByUserId: schema.shiftSignups.addedByUserId,
      })
      .from(schema.shiftSignups)
      .innerJoin(
        schema.shiftSlots,
        eq(schema.shiftSlots.id, schema.shiftSignups.slotId),
      )
      .innerJoin(
        schema.shiftTypes,
        eq(schema.shiftTypes.id, schema.shiftSlots.typeId),
      )
      .innerJoin(schema.users, eq(schema.users.id, schema.shiftSignups.userId))
      .where(and(eq(schema.shiftTypes.cycle, cycle), realMember))
      .orderBy(asc(schema.shiftSignups.createdAt)),
  ]);
  return {
    types,
    slots,
    signups: signups.map((s) => ({ ...s, name: nameOf(s.name) })),
  };
}

/** This year's Burn days, as the roster runs them. */
export async function readBurnDays(cycle: number): Promise<string[]> {
  return burnDaysIn(createHttpDb(), cycle);
}

/** Every approved member, for a lead putting someone on a shift. */
export async function listShiftMembers(): Promise<
  { userId: string; name: string }[]
> {
  const rows = await createHttpDb()
    .select({ userId: schema.users.id, name: schema.users.displayName })
    .from(schema.users)
    .where(realMember);
  return rows
    .map((r) => ({ userId: r.userId, name: nameOf(r.name) }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** The members who are coming this year: the ones asked for the minimum. */
export async function listComingForShifts(
  cycle: number,
): Promise<{ userId: string; name: string }[]> {
  return comingMembers(createHttpDb(), cycle);
}

/** Whether the member's "Ask everyone" nudge about shifts is still open. */
export async function hasOpenShiftAsk(userId: string): Promise<boolean> {
  if (!UUID.test(userId)) return false;
  const rows = await createHttpDb()
    .select({ id: schema.requiredActions.id })
    .from(schema.requiredActions)
    .where(
      and(
        eq(schema.requiredActions.userId, userId),
        eq(schema.requiredActions.actionKey, SHIFTS_ACTION_KEY),
        eq(schema.requiredActions.status, "pending"),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

/** The member's own AfrikaBurn volunteer shifts this year, in time order. */
export async function listMyVolunteerShifts(
  userId: string,
  cycle: number,
): Promise<VolunteerShiftRow[]> {
  if (!UUID.test(userId)) return [];
  return createHttpDb()
    .select({
      id: schema.volunteerShifts.id,
      department: schema.volunteerShifts.department,
      day: schema.volunteerShifts.day,
      startMinute: schema.volunteerShifts.startMinute,
      durationMinutes: schema.volunteerShifts.durationMinutes,
    })
    .from(schema.volunteerShifts)
    .where(
      and(
        eq(schema.volunteerShifts.userId, userId),
        eq(schema.volunteerShifts.cycle, cycle),
      ),
    )
    .orderBy(
      asc(schema.volunteerShifts.day),
      asc(schema.volunteerShifts.startMinute),
    );
}

// --- Shift types ---------------------------------------------------------------

/**
 * Add a shift type (`id` absent, `expectedVersion` 0) or change one, as a
 * captain or a lead of its team (of both teams, when it moves team). A new
 * type gets a slot on every Burn day; a changed one gets the days it lacks.
 * Fewer places than people already on one of its days is refused.
 */
export async function saveShiftType(input: {
  actorId: string;
  id?: string | null;
  team: Team;
  name: string;
  startMinute: number;
  durationMinutes: number;
  places: number;
  note: string | null;
  expectedVersion: number;
}): Promise<ShiftWriteResult<{ type: ShiftTypeRow; daysAdded: number }>> {
  return write(async (tx) => {
    const keeper = await lockKeeper(tx, input.actorId);
    assertKeeper(keeper, input.team);
    const cycle = await currentCycleNumber(tx);
    const now = new Date();
    const fields = {
      team: input.team,
      name: input.name,
      startMinute: input.startMinute,
      durationMinutes: input.durationMinutes,
      places: input.places,
      note: input.note,
      updatedByUserId: input.actorId,
      updatedAt: now,
    };
    let type: ShiftTypeRow | undefined;
    let action: "shifts.type_added" | "shifts.type_changed";
    if (!input.id) {
      if (input.expectedVersion !== 0) refuse(SHIFT_TYPE_CHANGED);
      // Serialise adds for the year, so the cap holds under two editors.
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext('shift_types'), ${cycle})`,
      );
      const [existing] = await tx
        .select({ n: count() })
        .from(schema.shiftTypes)
        .where(eq(schema.shiftTypes.cycle, cycle));
      if ((existing?.n ?? 0) >= MAX_SHIFT_TYPES) refuse(TOO_MANY_SHIFT_TYPES);
      [type] = await tx
        .insert(schema.shiftTypes)
        .values({ ...fields, cycle, createdByUserId: input.actorId })
        .returning(TYPE_COLUMNS);
      action = "shifts.type_added";
    } else {
      const current = await lockType(tx, input.id, cycle);
      if (!current) refuse(SHIFT_GONE);
      assertKeeper(keeper, current.team);
      if (current.version !== input.expectedVersion) refuse(SHIFT_TYPE_CHANGED);
      const [most] = await tx
        .select({ n: count() })
        .from(schema.shiftSignups)
        .innerJoin(
          schema.shiftSlots,
          eq(schema.shiftSlots.id, schema.shiftSignups.slotId),
        )
        .where(eq(schema.shiftSlots.typeId, current.id))
        .groupBy(schema.shiftSignups.slotId)
        .orderBy(sql`count(*) desc`)
        .limit(1);
      if (most && most.n > input.places) refuse(placesBelowTaken(most.n));
      [type] = await tx
        .update(schema.shiftTypes)
        .set({ ...fields, version: sql`${schema.shiftTypes.version} + 1` })
        .where(eq(schema.shiftTypes.id, current.id))
        .returning(TYPE_COLUMNS);
      action = "shifts.type_changed";
    }
    if (!type) refuse(SHIFT_TYPE_CHANGED);
    const daysAdded = await addMissingSlots(
      tx,
      type.id,
      await burnDaysIn(tx, cycle),
    );
    await writeAuditEvent(tx, {
      actorId: input.actorId,
      action,
      target: `shift_type:${type.id}`,
      metadata: {
        cycle,
        name: type.name,
        team: type.team,
        startMinute: type.startMinute,
        durationMinutes: type.durationMinutes,
        places: type.places,
        daysAdded,
      },
    });
    return { type, daysAdded };
  });
}

/** Remove a shift type and its days, only while nobody is on it. */
export async function removeShiftType(input: {
  actorId: string;
  id: string;
  expectedVersion: number;
}): Promise<ShiftWriteResult> {
  return write(async (tx) => {
    const keeper = await lockKeeper(tx, input.actorId);
    const cycle = await currentCycleNumber(tx);
    const current = await lockType(tx, input.id, cycle);
    if (!current) refuse(SHIFT_GONE);
    assertKeeper(keeper, current.team);
    if (current.version !== input.expectedVersion) refuse(SHIFT_TYPE_CHANGED);
    const [people] = await tx
      .select({ n: count() })
      .from(schema.shiftSignups)
      .innerJoin(
        schema.shiftSlots,
        eq(schema.shiftSlots.id, schema.shiftSignups.slotId),
      )
      .where(eq(schema.shiftSlots.typeId, current.id));
    if ((people?.n ?? 0) > 0) refuse(SHIFT_HAS_PEOPLE);
    await tx
      .delete(schema.shiftTypes)
      .where(eq(schema.shiftTypes.id, current.id));
    await writeAuditEvent(tx, {
      actorId: input.actorId,
      action: "shifts.type_removed",
      target: `shift_type:${current.id}`,
      metadata: { cycle, name: current.name, team: current.team },
    });
    return {};
  });
}

/** Give a shift type a slot on each Burn day it has none for yet. */
export async function fillShiftDays(input: {
  actorId: string;
  typeId: string;
}): Promise<ShiftWriteResult<{ daysAdded: number }>> {
  return write(async (tx) => {
    const keeper = await lockKeeper(tx, input.actorId);
    const cycle = await currentCycleNumber(tx);
    const current = await lockType(tx, input.typeId, cycle);
    if (!current) refuse(SHIFT_GONE);
    assertKeeper(keeper, current.team);
    const days = await burnDaysIn(tx, cycle);
    if (days.length === 0) refuse(NO_BURN_DAYS);
    const daysAdded = await addMissingSlots(tx, current.id, days);
    if (daysAdded > 0) {
      await writeAuditEvent(tx, {
        actorId: input.actorId,
        action: "shifts.days_added",
        target: `shift_type:${current.id}`,
        metadata: { cycle, name: current.name, daysAdded },
      });
    }
    return { daysAdded };
  });
}

/**
 * Mark one day's slot not needed, or needed again. Not needed only while
 * nobody is on it. A compare-and-set on the slot's version; until its day.
 */
export async function setSlotNeeded(input: {
  actorId: string;
  slotId: string;
  needed: boolean;
  expectedVersion: number;
  now?: Date;
}): Promise<ShiftWriteResult<{ slot: ShiftSlotRow }>> {
  return write(async (tx) => {
    const keeper = await lockKeeper(tx, input.actorId);
    const cycle = await currentCycleNumber(tx);
    const found = await lockSlot(tx, input.slotId, cycle);
    if (!found) refuse(SHIFT_GONE);
    assertKeeper(keeper, found.type.team);
    if (found.slot.version !== input.expectedVersion)
      refuse(SHIFT_SLOT_CHANGED);
    const now = input.now ?? new Date();
    if (!shiftChangesOpen(found.slot.day, campDayKey(now)))
      refuse(SHIFT_CLOSED);
    if (!input.needed && (await takenOn(tx, found.slot.id)) > 0) {
      refuse(SHIFT_DAY_HAS_PEOPLE);
    }
    const [slot] = await tx
      .update(schema.shiftSlots)
      .set({
        status: input.needed ? "open" : "not_needed",
        version: sql`${schema.shiftSlots.version} + 1`,
        updatedAt: now,
      })
      .where(eq(schema.shiftSlots.id, found.slot.id))
      .returning(SLOT_COLUMNS);
    if (!slot) refuse(SHIFT_SLOT_CHANGED);
    await writeAuditEvent(tx, {
      actorId: input.actorId,
      action: "shifts.slot_needed_set",
      target: `shift_slot:${slot.id}`,
      metadata: {
        cycle,
        name: found.type.name,
        day: slot.day,
        needed: input.needed,
      },
    });
    return { slot };
  });
}

// --- Taking places ---------------------------------------------------------------

/** Put `userId` on a slot under its row lock; the checks every path shares. */
async function takePlace(
  tx: Tx,
  input: {
    slotId: string;
    userId: string;
    addedByUserId: string | null;
    cycle: number;
    now: Date;
    keeper?: { rank: string; led: readonly string[] };
  },
): Promise<{ slot: ShiftSlotRow; type: ShiftTypeRow }> {
  const found = await lockSlot(tx, input.slotId, input.cycle);
  if (!found) refuse(SHIFT_GONE);
  if (input.keeper) assertKeeper(input.keeper, found.type.team);
  if (!shiftChangesOpen(found.slot.day, campDayKey(input.now))) {
    refuse(SHIFT_CLOSED);
  }
  if (found.slot.status !== "open") refuse(SHIFT_NOT_NEEDED);
  if (!(await isRealMember(tx, input.userId))) refuse(SHIFT_NOT_A_MEMBER);
  const [already] = await tx
    .select({ userId: schema.shiftSignups.userId })
    .from(schema.shiftSignups)
    .where(
      and(
        eq(schema.shiftSignups.slotId, found.slot.id),
        eq(schema.shiftSignups.userId, input.userId),
      ),
    );
  if (already) {
    refuse(input.addedByUserId ? SHIFT_MEMBER_ALREADY_ON : SHIFT_ALREADY_ON);
  }
  if ((await takenOn(tx, found.slot.id)) >= found.type.places) {
    refuse(SHIFT_FULL);
  }
  await tx.insert(schema.shiftSignups).values({
    slotId: found.slot.id,
    userId: input.userId,
    addedByUserId: input.addedByUserId,
    createdAt: input.now,
  });
  return found;
}

/**
 * The signed-in member takes a place on a slot: an approved member, on an
 * open slot, until its day starts, while it has a place. Reaching the
 * minimum closes their "Ask everyone" nudge. Returns how many shifts they
 * are on now.
 */
export async function signUpForShift(input: {
  userId: string;
  slotId: string;
  now?: Date;
}): Promise<ShiftWriteResult<{ mine: number }>> {
  return write(async (tx) => {
    const cycle = await currentCycleNumber(tx);
    const now = input.now ?? new Date();
    await takePlace(tx, {
      slotId: input.slotId,
      userId: input.userId,
      addedByUserId: null,
      cycle,
      now,
    });
    return { mine: await closeIfEnough(tx, input.userId, cycle, now) };
  });
}

/** The signed-in member leaves a slot, until its day starts. */
export async function leaveShift(input: {
  userId: string;
  slotId: string;
  now?: Date;
}): Promise<ShiftWriteResult<{ mine: number }>> {
  return write(async (tx) => {
    const cycle = await currentCycleNumber(tx);
    const now = input.now ?? new Date();
    if (!UUID.test(input.userId)) refuse(SHIFT_NOT_ON);
    const found = await lockSlot(tx, input.slotId, cycle);
    if (!found) refuse(SHIFT_GONE);
    if (!shiftChangesOpen(found.slot.day, campDayKey(now))) {
      refuse(SHIFT_CLOSED);
    }
    const gone = await tx
      .delete(schema.shiftSignups)
      .where(
        and(
          eq(schema.shiftSignups.slotId, found.slot.id),
          eq(schema.shiftSignups.userId, input.userId),
        ),
      )
      .returning({ userId: schema.shiftSignups.userId });
    if (gone.length === 0) refuse(SHIFT_NOT_ON);
    return { mine: await shiftsOf(tx, input.userId, cycle) };
  });
}

/**
 * A captain or a lead of the shift's team puts a member on a slot, with the
 * same checks as signing up. Audited.
 */
export async function placeMemberOnShift(input: {
  actorId: string;
  slotId: string;
  userId: string;
  now?: Date;
}): Promise<ShiftWriteResult> {
  return write(async (tx) => {
    const keeper = await lockKeeper(tx, input.actorId);
    const cycle = await currentCycleNumber(tx);
    const now = input.now ?? new Date();
    const { slot, type } = await takePlace(tx, {
      slotId: input.slotId,
      userId: input.userId,
      addedByUserId: input.actorId,
      cycle,
      now,
      keeper,
    });
    await closeIfEnough(tx, input.userId, cycle, now);
    await writeAuditEvent(tx, {
      actorId: input.actorId,
      action: "shifts.member_placed",
      target: input.userId,
      metadata: { cycle, slotId: slot.id, name: type.name, day: slot.day },
    });
    return {};
  });
}

/** A captain or a lead of the shift's team takes a member off a slot. Audited. */
export async function takeMemberOffShift(input: {
  actorId: string;
  slotId: string;
  userId: string;
  now?: Date;
}): Promise<ShiftWriteResult> {
  return write(async (tx) => {
    const keeper = await lockKeeper(tx, input.actorId);
    const cycle = await currentCycleNumber(tx);
    const found = await lockSlot(tx, input.slotId, cycle);
    if (!found) refuse(SHIFT_GONE);
    assertKeeper(keeper, found.type.team);
    if (
      !shiftChangesOpen(found.slot.day, campDayKey(input.now ?? new Date()))
    ) {
      refuse(SHIFT_CLOSED);
    }
    if (!UUID.test(input.userId)) refuse(SHIFT_MEMBER_NOT_ON);
    const gone = await tx
      .delete(schema.shiftSignups)
      .where(
        and(
          eq(schema.shiftSignups.slotId, found.slot.id),
          eq(schema.shiftSignups.userId, input.userId),
        ),
      )
      .returning({ userId: schema.shiftSignups.userId });
    if (gone.length === 0) refuse(SHIFT_MEMBER_NOT_ON);
    await writeAuditEvent(tx, {
      actorId: input.actorId,
      action: "shifts.member_removed",
      target: input.userId,
      metadata: {
        cycle,
        slotId: found.slot.id,
        name: found.type.name,
        day: found.slot.day,
      },
    });
    return {};
  });
}

// --- The minimum, as a reminder --------------------------------------------------

/**
 * "Ask everyone": nudge each member who is coming this year and is on fewer
 * than SHIFT_MINIMUM shifts. A nudge, never a block (the shared nudge: one
 * non-blocking required action, one notice, no second while the first is
 * unread). A captain only (canAskForShifts), checked inside the write.
 * Audited.
 */
export async function askForShifts(input: {
  actorId: string;
  now?: Date;
}): Promise<ShiftWriteResult<{ asked: number; notified: number }>> {
  return write(async (tx) => {
    if (!UUID.test(input.actorId)) refuse(NOT_A_SHIFT_ASKER);
    const reach = await lockSenderReach(tx, input.actorId);
    if (!canAskForShifts(reachRank(reach))) refuse(NOT_A_SHIFT_ASKER);
    const cycle = await currentCycleNumber(tx);
    const now = input.now ?? new Date();
    const coming = await comingMembers(tx, cycle);
    const counts =
      coming.length === 0
        ? []
        : await tx
            .select({ userId: schema.shiftSignups.userId, n: count() })
            .from(schema.shiftSignups)
            .innerJoin(
              schema.shiftSlots,
              eq(schema.shiftSlots.id, schema.shiftSignups.slotId),
            )
            .innerJoin(
              schema.shiftTypes,
              eq(schema.shiftTypes.id, schema.shiftSlots.typeId),
            )
            .where(
              and(
                eq(schema.shiftTypes.cycle, cycle),
                inArray(
                  schema.shiftSignups.userId,
                  coming.map((m) => m.userId),
                ),
              ),
            )
            .groupBy(schema.shiftSignups.userId);
    const have = new Map(counts.map((c) => [c.userId, c.n]));
    const targets = coming.filter(
      (m) => (have.get(m.userId) ?? 0) < SHIFT_MINIMUM,
    );
    const notified = await openNudges(tx, {
      userIds: targets.map((t) => t.userId),
      actionKey: SHIFTS_ACTION_KEY,
      title: SHIFTS_ACTION_TITLE,
      refType: SHIFTS_REF_TYPE,
      notice: (requiredActionId) => shiftsAskNotification({ requiredActionId }),
      now,
    });
    if (targets.length > 0) {
      await writeAuditEvent(tx, {
        actorId: input.actorId,
        action: "shifts.asked",
        target: String(cycle),
        metadata: { cycle, asked: targets.length, notified },
      });
    }
    return { asked: targets.length, notified };
  });
}

// --- AfrikaBurn volunteer shifts --------------------------------------------------

/** The member lists one of their own AfrikaBurn volunteer shifts. */
export async function addVolunteerShift(input: {
  userId: string;
  department: string;
  day: string;
  startMinute: number;
  durationMinutes: number;
}): Promise<ShiftWriteResult<{ id: string }>> {
  return write(async (tx) => {
    if (!(await isRealMember(tx, input.userId))) refuse(SHIFT_NOT_A_MEMBER);
    const cycle = await currentCycleNumber(tx);
    const [have] = await tx
      .select({ n: count() })
      .from(schema.volunteerShifts)
      .where(
        and(
          eq(schema.volunteerShifts.userId, input.userId),
          eq(schema.volunteerShifts.cycle, cycle),
        ),
      );
    if ((have?.n ?? 0) >= MAX_VOLUNTEER_SHIFTS) {
      refuse(TOO_MANY_VOLUNTEER_SHIFTS);
    }
    const [row] = await tx
      .insert(schema.volunteerShifts)
      .values({
        cycle,
        userId: input.userId,
        department: input.department,
        day: input.day,
        startMinute: input.startMinute,
        durationMinutes: input.durationMinutes,
      })
      .returning({ id: schema.volunteerShifts.id });
    if (!row) refuse(VOLUNTEER_SHIFT_GONE);
    return { id: row.id };
  });
}

/** The member removes one of their own AfrikaBurn volunteer shifts. */
export async function removeVolunteerShift(input: {
  userId: string;
  id: string;
}): Promise<ShiftWriteResult> {
  return write(async (tx) => {
    if (!UUID.test(input.userId) || !UUID.test(input.id)) {
      refuse(VOLUNTEER_SHIFT_GONE);
    }
    const gone = await tx
      .delete(schema.volunteerShifts)
      .where(
        and(
          eq(schema.volunteerShifts.id, input.id),
          eq(schema.volunteerShifts.userId, input.userId),
        ),
      )
      .returning({ id: schema.volunteerShifts.id });
    if (gone.length === 0) refuse(VOLUNTEER_SHIFT_GONE);
    return {};
  });
}
