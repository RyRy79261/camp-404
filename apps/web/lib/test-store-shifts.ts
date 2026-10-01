import "server-only";

import { randomUUID } from "node:crypto";
import {
  SHIFTS_ACTION_KEY,
  SHIFTS_ACTION_TITLE,
  SHIFTS_REF_TYPE,
  campDayKey,
  canAskForShifts,
  canManageShifts,
  isAskedForShifts,
  shiftChangesOpen,
  shiftDays,
  shiftsAskNotification,
} from "@camp404/core";
import { reachRank } from "@camp404/db/power";
import {
  NOT_A_SHIFT_ASKER,
  NOT_A_SHIFT_KEEPER,
  NO_BURN_DAYS,
  SHIFT_ALREADY_ON,
  SHIFT_CLOSED,
  SHIFT_DAY_HAS_PEOPLE,
  SHIFT_FULL,
  SHIFT_GONE,
  SHIFT_HAS_PEOPLE,
  SHIFT_MEMBER_ALREADY_ON,
  SHIFT_MEMBER_NOT_ON,
  SHIFT_NOT_A_MEMBER,
  SHIFT_NOT_NEEDED,
  SHIFT_NOT_ON,
  SHIFT_SLOT_CHANGED,
  SHIFT_TYPE_CHANGED,
  TOO_MANY_SHIFT_TYPES,
  TOO_MANY_VOLUNTEER_SHIFTS,
  VOLUNTEER_SHIFT_GONE,
  placesBelowTaken,
  type ShiftRosterRead,
  type ShiftSlotRow,
  type ShiftTypeRow,
  type ShiftWriteResult,
  type VolunteerShiftRow,
} from "@camp404/db/shifts";
import {
  MAX_SHIFT_TYPES,
  MAX_VOLUNTEER_SHIFTS,
  SHIFT_MINIMUM,
  type Team,
} from "@camp404/types";
import { testStore } from "./test-store";

// The in-memory twin of the shift roster (@camp404/db/shifts), for
// E2E_TEST_MODE. The same rules, sentences and results over the store's own
// rows: a captain or a lead of the shift's team sets shifts up; every approved
// member takes an open place until the slot's day starts; the last place goes
// to one member; the minimum is a nudge through the store's shared nudge. The
// store keeps no audit log and is one synchronous process, so there is
// nothing to lock. Kept apart from test-store.ts, which calls in here only to
// reset.

interface Signup {
  slotId: string;
  userId: string;
  addedByUserId: string | null;
  at: number;
}

interface ShiftsState {
  types: ShiftTypeRow[];
  slots: ShiftSlotRow[];
  signups: Signup[];
  volunteers: (VolunteerShiftRow & { userId: string; cycle: number })[];
  serial: number;
}

const KEY = "__camp404ShiftsTestStore__";

function state(): ShiftsState {
  const g = globalThis as Record<string, unknown>;
  g[KEY] ??= {
    types: [],
    slots: [],
    signups: [],
    volunteers: [],
    serial: 0,
  } satisfies ShiftsState;
  return g[KEY] as ShiftsState;
}

/** Clear the roster (testStore.reset calls this). */
export function resetShiftsStore(): void {
  const s = state();
  s.types.length = 0;
  s.slots.length = 0;
  s.signups.length = 0;
  s.volunteers.length = 0;
  s.serial = 0;
}

const nameOf = (userId: string) =>
  testStore.findUserById(userId)?.displayName?.trim() || "Unnamed burner";

const isMember = (userId: string) =>
  testStore.findUserById(userId)?.approvalStatus === "approved";

function keeperOf(actorId: string): { rank: string; led: readonly string[] } {
  if (!testStore.findUserById(actorId)) return { rank: "", led: [] };
  const reach = testStore.senderReach(actorId);
  return { rank: reachRank(reach), led: reach ?? [] };
}

class Refused extends Error {
  constructor(readonly sentence: string) {
    super(sentence);
  }
}

function refuse(sentence: string): never {
  throw new Refused(sentence);
}

function run<T extends object>(fn: () => T): ShiftWriteResult<T> {
  try {
    return { ok: true, ...fn() };
  } catch (error) {
    if (error instanceof Refused) return { ok: false, error: error.sentence };
    throw error;
  }
}

function burnDays(cycle: number): string[] {
  const burn = testStore
    .listLogisticsPhases(cycle)
    .find((p) => p.phase === "burn");
  return shiftDays(burn ? { start: burn.startDate, end: burn.endDate } : null);
}

function addMissingSlots(typeId: string, days: readonly string[]): number {
  let added = 0;
  for (const day of days) {
    if (state().slots.some((s) => s.typeId === typeId && s.day === day)) {
      continue;
    }
    state().slots.push({
      id: randomUUID(),
      typeId,
      day,
      status: "open",
      version: 1,
    });
    added += 1;
  }
  return added;
}

function typeOf(id: string, cycle: number): ShiftTypeRow | undefined {
  return state().types.find((t) => t.id === id && t.cycle === cycle);
}

function slotOf(
  slotId: string,
  cycle: number,
): { slot: ShiftSlotRow; type: ShiftTypeRow } | undefined {
  const slot = state().slots.find((s) => s.id === slotId);
  const type = slot ? typeOf(slot.typeId, cycle) : undefined;
  return slot && type ? { slot, type } : undefined;
}

const takenOn = (slotId: string) =>
  state().signups.filter((s) => s.slotId === slotId).length;

function shiftsOf(userId: string, cycle: number): number {
  return state().signups.filter(
    (s) => s.userId === userId && slotOf(s.slotId, cycle),
  ).length;
}

function closeIfEnough(userId: string, cycle: number): number {
  const mine = shiftsOf(userId, cycle);
  if (mine >= SHIFT_MINIMUM) {
    testStore.satisfyRequiredAction(userId, SHIFTS_ACTION_KEY);
    testStore.readNotices(userId, SHIFTS_REF_TYPE);
  }
  return mine;
}

function assertKeeper(
  keeper: { rank: string; led: readonly string[] },
  team: string,
): void {
  if (!canManageShifts(keeper.rank, keeper.led, team)) {
    refuse(NOT_A_SHIFT_KEEPER);
  }
}

function takePlace(input: {
  slotId: string;
  userId: string;
  addedByUserId: string | null;
  cycle: number;
  now: Date;
  keeper?: { rank: string; led: readonly string[] };
}): { slot: ShiftSlotRow; type: ShiftTypeRow } {
  const found = slotOf(input.slotId, input.cycle);
  if (!found) refuse(SHIFT_GONE);
  if (input.keeper) assertKeeper(input.keeper, found.type.team);
  if (!shiftChangesOpen(found.slot.day, campDayKey(input.now))) {
    refuse(SHIFT_CLOSED);
  }
  if (found.slot.status !== "open") refuse(SHIFT_NOT_NEEDED);
  if (!isMember(input.userId)) refuse(SHIFT_NOT_A_MEMBER);
  if (
    state().signups.some(
      (s) => s.slotId === found.slot.id && s.userId === input.userId,
    )
  ) {
    refuse(input.addedByUserId ? SHIFT_MEMBER_ALREADY_ON : SHIFT_ALREADY_ON);
  }
  if (takenOn(found.slot.id) >= found.type.places) refuse(SHIFT_FULL);
  state().signups.push({
    slotId: found.slot.id,
    userId: input.userId,
    addedByUserId: input.addedByUserId,
    at: (state().serial += 1),
  });
  return found;
}

function dropPlace(slotId: string, userId: string): boolean {
  const list = state().signups;
  const at = list.findIndex((s) => s.slotId === slotId && s.userId === userId);
  if (at < 0) return false;
  list.splice(at, 1);
  return true;
}

export const shiftsTestStore = {
  // --- Reads -------------------------------------------------------------------

  readShiftRoster(cycle: number): ShiftRosterRead {
    const types = state()
      .types.filter((t) => t.cycle === cycle)
      // Start time, then the order they were added in (a stable sort over
      // the insertion order), as the database orders them.
      .sort((a, b) => a.startMinute - b.startMinute)
      .map((t) => ({ ...t }));
    const ids = new Set(types.map((t) => t.id));
    const slots = state()
      .slots.filter((s) => ids.has(s.typeId))
      .sort((a, b) => a.day.localeCompare(b.day))
      .map((s) => ({ ...s }));
    const slotIds = new Set(slots.map((s) => s.id));
    const signups = state()
      .signups.filter((s) => slotIds.has(s.slotId) && isMember(s.userId))
      .sort((a, b) => a.at - b.at)
      .map((s) => ({
        slotId: s.slotId,
        userId: s.userId,
        name: nameOf(s.userId),
        addedByUserId: s.addedByUserId,
      }));
    return { types, slots, signups };
  },

  readBurnDays(cycle: number): string[] {
    return burnDays(cycle);
  },

  listShiftMembers(): { userId: string; name: string }[] {
    return testStore
      .allUsers()
      .filter((u) => u.approvalStatus === "approved")
      .map((u) => ({ userId: u.id, name: nameOf(u.id) }))
      .sort((a, b) => a.name.localeCompare(b.name));
  },

  listComingForShifts(cycle: number): { userId: string; name: string }[] {
    return testStore
      .allUsers()
      .filter(
        (u) =>
          u.approvalStatus === "approved" &&
          isAskedForShifts(
            testStore.getParticipation(u.id, cycle)?.status ?? null,
          ),
      )
      .map((u) => ({ userId: u.id, name: nameOf(u.id) }));
  },

  hasOpenShiftAsk(userId: string): boolean {
    return testStore.hasOpenNudge(userId, SHIFTS_ACTION_KEY);
  },

  listMyVolunteerShifts(userId: string, cycle: number): VolunteerShiftRow[] {
    return state()
      .volunteers.filter((v) => v.userId === userId && v.cycle === cycle)
      .sort(
        (a, b) => a.day.localeCompare(b.day) || a.startMinute - b.startMinute,
      )
      .map(({ id, department, day, startMinute, durationMinutes }) => ({
        id,
        department,
        day,
        startMinute,
        durationMinutes,
      }));
  },

  // --- Shift types ---------------------------------------------------------------

  saveShiftType(input: {
    actorId: string;
    id?: string | null;
    team: Team;
    name: string;
    startMinute: number;
    durationMinutes: number;
    places: number;
    note: string | null;
    expectedVersion: number;
  }): ShiftWriteResult<{ type: ShiftTypeRow; daysAdded: number }> {
    return run(() => {
      const keeper = keeperOf(input.actorId);
      assertKeeper(keeper, input.team);
      const cycle = testStore.currentCycleNumber();
      const fields = {
        team: input.team,
        name: input.name,
        startMinute: input.startMinute,
        durationMinutes: input.durationMinutes,
        places: input.places,
        note: input.note,
      };
      let type: ShiftTypeRow;
      if (!input.id) {
        if (input.expectedVersion !== 0) refuse(SHIFT_TYPE_CHANGED);
        const year = state().types.filter((t) => t.cycle === cycle);
        if (year.length >= MAX_SHIFT_TYPES) refuse(TOO_MANY_SHIFT_TYPES);
        type = { id: randomUUID(), cycle, version: 1, ...fields };
        state().types.push(type);
      } else {
        const current = typeOf(input.id, cycle);
        if (!current) refuse(SHIFT_GONE);
        assertKeeper(keeper, current.team);
        if (current.version !== input.expectedVersion) {
          refuse(SHIFT_TYPE_CHANGED);
        }
        const most = Math.max(
          0,
          ...state()
            .slots.filter((s) => s.typeId === current.id)
            .map((s) => takenOn(s.id)),
        );
        if (most > input.places) refuse(placesBelowTaken(most));
        Object.assign(current, fields, { version: current.version + 1 });
        type = current;
      }
      const daysAdded = addMissingSlots(type.id, burnDays(cycle));
      return { type: { ...type }, daysAdded };
    });
  },

  removeShiftType(input: {
    actorId: string;
    id: string;
    expectedVersion: number;
  }): ShiftWriteResult {
    return run(() => {
      const keeper = keeperOf(input.actorId);
      const cycle = testStore.currentCycleNumber();
      const current = typeOf(input.id, cycle);
      if (!current) refuse(SHIFT_GONE);
      assertKeeper(keeper, current.team);
      if (current.version !== input.expectedVersion) refuse(SHIFT_TYPE_CHANGED);
      const slotIds = new Set(
        state()
          .slots.filter((s) => s.typeId === current.id)
          .map((s) => s.id),
      );
      if (state().signups.some((s) => slotIds.has(s.slotId))) {
        refuse(SHIFT_HAS_PEOPLE);
      }
      const s = state();
      s.types.splice(s.types.indexOf(current), 1);
      s.slots = s.slots.filter((slot) => !slotIds.has(slot.id));
      return {};
    });
  },

  fillShiftDays(input: {
    actorId: string;
    typeId: string;
  }): ShiftWriteResult<{ daysAdded: number }> {
    return run(() => {
      const keeper = keeperOf(input.actorId);
      const cycle = testStore.currentCycleNumber();
      const current = typeOf(input.typeId, cycle);
      if (!current) refuse(SHIFT_GONE);
      assertKeeper(keeper, current.team);
      const days = burnDays(cycle);
      if (days.length === 0) refuse(NO_BURN_DAYS);
      return { daysAdded: addMissingSlots(current.id, days) };
    });
  },

  setSlotNeeded(input: {
    actorId: string;
    slotId: string;
    needed: boolean;
    expectedVersion: number;
    now?: Date;
  }): ShiftWriteResult<{ slot: ShiftSlotRow }> {
    return run(() => {
      const keeper = keeperOf(input.actorId);
      const found = slotOf(input.slotId, testStore.currentCycleNumber());
      if (!found) refuse(SHIFT_GONE);
      assertKeeper(keeper, found.type.team);
      if (found.slot.version !== input.expectedVersion) {
        refuse(SHIFT_SLOT_CHANGED);
      }
      if (
        !shiftChangesOpen(found.slot.day, campDayKey(input.now ?? new Date()))
      ) {
        refuse(SHIFT_CLOSED);
      }
      if (!input.needed && takenOn(found.slot.id) > 0) {
        refuse(SHIFT_DAY_HAS_PEOPLE);
      }
      found.slot.status = input.needed ? "open" : "not_needed";
      found.slot.version += 1;
      return { slot: { ...found.slot } };
    });
  },

  // --- Taking places ---------------------------------------------------------------

  signUpForShift(input: {
    userId: string;
    slotId: string;
    now?: Date;
  }): ShiftWriteResult<{ mine: number }> {
    return run(() => {
      const cycle = testStore.currentCycleNumber();
      takePlace({
        slotId: input.slotId,
        userId: input.userId,
        addedByUserId: null,
        cycle,
        now: input.now ?? new Date(),
      });
      return { mine: closeIfEnough(input.userId, cycle) };
    });
  },

  leaveShift(input: {
    userId: string;
    slotId: string;
    now?: Date;
  }): ShiftWriteResult<{ mine: number }> {
    return run(() => {
      const cycle = testStore.currentCycleNumber();
      const found = slotOf(input.slotId, cycle);
      if (!found) refuse(SHIFT_GONE);
      if (
        !shiftChangesOpen(found.slot.day, campDayKey(input.now ?? new Date()))
      ) {
        refuse(SHIFT_CLOSED);
      }
      if (!dropPlace(found.slot.id, input.userId)) refuse(SHIFT_NOT_ON);
      return { mine: shiftsOf(input.userId, cycle) };
    });
  },

  placeMemberOnShift(input: {
    actorId: string;
    slotId: string;
    userId: string;
    now?: Date;
  }): ShiftWriteResult {
    return run(() => {
      const cycle = testStore.currentCycleNumber();
      takePlace({
        slotId: input.slotId,
        userId: input.userId,
        addedByUserId: input.actorId,
        cycle,
        now: input.now ?? new Date(),
        keeper: keeperOf(input.actorId),
      });
      closeIfEnough(input.userId, cycle);
      return {};
    });
  },

  takeMemberOffShift(input: {
    actorId: string;
    slotId: string;
    userId: string;
    now?: Date;
  }): ShiftWriteResult {
    return run(() => {
      const keeper = keeperOf(input.actorId);
      const found = slotOf(input.slotId, testStore.currentCycleNumber());
      if (!found) refuse(SHIFT_GONE);
      assertKeeper(keeper, found.type.team);
      if (
        !shiftChangesOpen(found.slot.day, campDayKey(input.now ?? new Date()))
      ) {
        refuse(SHIFT_CLOSED);
      }
      if (!dropPlace(found.slot.id, input.userId)) refuse(SHIFT_MEMBER_NOT_ON);
      return {};
    });
  },

  // --- The minimum, as a reminder --------------------------------------------------

  askForShifts(input: {
    actorId: string;
  }): ShiftWriteResult<{ asked: number; notified: number }> {
    return run(() => {
      if (!canAskForShifts(keeperOf(input.actorId).rank)) {
        refuse(NOT_A_SHIFT_ASKER);
      }
      const cycle = testStore.currentCycleNumber();
      const targets = shiftsTestStore
        .listComingForShifts(cycle)
        .filter((m) => shiftsOf(m.userId, cycle) < SHIFT_MINIMUM);
      let notified = 0;
      for (const target of targets) {
        testStore.openNudge({
          userId: target.userId,
          actionKey: SHIFTS_ACTION_KEY,
          title: SHIFTS_ACTION_TITLE,
        });
        if (testStore.hasUnreadNotice(target.userId, SHIFTS_REF_TYPE)) continue;
        testStore.pushNotice(
          target.userId,
          shiftsAskNotification({ requiredActionId: null }),
        );
        notified += 1;
      }
      return { asked: targets.length, notified };
    });
  },

  // --- AfrikaBurn volunteer shifts --------------------------------------------------

  addVolunteerShift(input: {
    userId: string;
    department: string;
    day: string;
    startMinute: number;
    durationMinutes: number;
  }): ShiftWriteResult<{ id: string }> {
    return run(() => {
      if (!isMember(input.userId)) refuse(SHIFT_NOT_A_MEMBER);
      const cycle = testStore.currentCycleNumber();
      const mine = state().volunteers.filter(
        (v) => v.userId === input.userId && v.cycle === cycle,
      );
      if (mine.length >= MAX_VOLUNTEER_SHIFTS) {
        refuse(TOO_MANY_VOLUNTEER_SHIFTS);
      }
      const id = randomUUID();
      state().volunteers.push({ ...input, id, cycle });
      return { id };
    });
  },

  removeVolunteerShift(input: {
    userId: string;
    id: string;
  }): ShiftWriteResult {
    return run(() => {
      const list = state().volunteers;
      const at = list.findIndex(
        (v) => v.id === input.id && v.userId === input.userId,
      );
      if (at < 0) refuse(VOLUNTEER_SHIFT_GONE);
      list.splice(at, 1);
      return {};
    });
  },
};
