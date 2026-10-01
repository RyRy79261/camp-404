import "server-only";

import {
  campDayKey,
  canAskForShifts,
  canManageShifts,
  isAskedForShifts as isComingForShifts,
  shiftChangesOpen,
  shiftClashes,
  shiftDayLabel,
  shiftDayLong,
  shiftDayTab,
  shiftFairness,
  shiftReminderText,
  shiftTimeText,
  type ShiftFairnessRow,
} from "@camp404/core";
import * as db from "@camp404/db/shifts";
import type {
  ShiftRosterRead,
  ShiftSlotRow,
  ShiftTypeRow,
  ShiftWriteResult,
  VolunteerShiftRow,
} from "@camp404/db/shifts";
import type {
  AddVolunteerShiftInput,
  FillShiftDaysInput,
  RemoveShiftTypeInput,
  RemoveVolunteerShiftInput,
  SaveShiftTypeInput,
  SetSlotNeededInput,
  ShiftMemberInput,
  ShiftSlotInput,
  ShiftSlotStatus,
  Team,
  ViewerRank,
} from "@camp404/types";
import { getCampSettings } from "./camp-config";
import { getMyParticipation } from "./participations";
import { printName } from "./lounge-copy";
import { usesTestStore } from "./test-mode";
import { shiftsTestStore } from "./test-store-shifts";

// The shift roster (#248): from the database or, under E2E, the test store.
// Every approved member reads the roster; what each viewer gets is decided
// HERE, on the server, never hidden in the UI:
//
//  - Who is on a shift reaches every member as a first name and a surname
//    initial ("Dee M."), the way the printed roster shows it. A member's id
//    reaches only a viewer who may set up that shift's team (to take them
//    off), and the viewer's own place is a flag.
//  - The fairness view (shifts per member who is coming, and who is below the
//    minimum) is for leads and captains: whether someone is coming reads at
//    team lead (MEMBER_FIELD_READERS).
//  - A member's AfrikaBurn volunteer shifts reach only that member.

export type { ShiftWriteResult };

/** One day's slot of one shift type, as a viewer may see it. */
export interface ShiftSlotView {
  id: string;
  typeId: string;
  day: string;
  status: ShiftSlotStatus;
  version: number;
  taken: number;
  /** Who is on it, as the print shows them, in sign-up order. */
  names: string[];
  /** The same, without the viewer (the screen says "You" for them). */
  others: string[];
  /** Who is on it with their ids: only for a viewer who manages the team. */
  people: { userId: string; name: string; you: boolean }[] | null;
  /** The viewer is on it. */
  mine: boolean;
  /** Still takes changes: its day has not started. */
  open: boolean;
}

export interface ShiftTypeView {
  id: string;
  team: Team;
  teamLabel: string;
  name: string;
  startMinute: number;
  durationMinutes: number;
  places: number;
  note: string | null;
  version: number;
  timeText: string;
  /** The viewer may set this shift up. */
  canManage: boolean;
  /** Burn days this shift has no slot for yet. */
  missingDays: number;
  /** Anyone is on any of its days. */
  hasPeople: boolean;
}

export interface ShiftDayView {
  day: string;
  /** "Wed 29 Apr" */
  label: string;
  /** "Wed 29", for the day tabs. */
  tab: string;
  /** "Wednesday 29 April", for the day's heading. */
  longLabel: string;
  /** A day with slots that is no longer one of the Burn's days. */
  outsideBurn: boolean;
  slots: (ShiftSlotView & { type: ShiftTypeView })[];
  /** Open places left that day, counting open slots only. */
  openPlaces: number;
}

export interface ShiftsView {
  cycle: number;
  burnDays: string[];
  days: ShiftDayView[];
  types: ShiftTypeView[];
  /** How many shifts the viewer is on this year. */
  myCount: number;
  /** The minimum's reminder for the viewer, or null. */
  reminder: string | null;
  /** The teams the viewer may add shifts for. */
  teams: { key: Team; label: string }[];
  canAsk: boolean;
  /** Leads and captains: shifts per member who is coming. */
  fairness: ShiftFairnessRow[] | null;
  /** Viewers who manage a team: every approved member, to put one on. */
  members: { userId: string; name: string }[] | null;
}

async function readRoster(cycle: number): Promise<ShiftRosterRead> {
  return usesTestStore()
    ? shiftsTestStore.readShiftRoster(cycle)
    : db.readShiftRoster(cycle);
}

async function readBurnDays(cycle: number): Promise<string[]> {
  return usesTestStore()
    ? shiftsTestStore.readBurnDays(cycle)
    : db.readBurnDays(cycle);
}

function slotView(
  slot: ShiftSlotRow,
  roster: ShiftRosterRead,
  viewerId: string,
  manage: boolean,
  today: string,
): ShiftSlotView {
  const on = roster.signups.filter((s) => s.slotId === slot.id);
  return {
    id: slot.id,
    typeId: slot.typeId,
    day: slot.day,
    status: slot.status,
    version: slot.version,
    taken: on.length,
    names: on.map((s) => printName(s.name)),
    others: on
      .filter((s) => s.userId !== viewerId)
      .map((s) => printName(s.name)),
    people: manage
      ? on.map((s) => ({
          userId: s.userId,
          name: printName(s.name),
          you: s.userId === viewerId,
        }))
      : null,
    mine: on.some((s) => s.userId === viewerId),
    open: shiftChangesOpen(slot.day, today),
  };
}

/**
 * The roster as `viewer` may see it. `ledTeams` are the teams they lead this
 * year (empty for a captain or a member).
 */
export async function getShiftsView(viewer: {
  userId: string;
  rank: ViewerRank;
  ledTeams: readonly string[];
  now?: Date;
}): Promise<ShiftsView> {
  const camp = await getCampSettings();
  const cycle = camp.cycleNumber;
  const lead = viewer.rank !== "camp_member";
  const [roster, burnDays, place, coming] = await Promise.all([
    readRoster(cycle),
    readBurnDays(cycle),
    getMyParticipation(viewer.userId),
    lead
      ? usesTestStore()
        ? shiftsTestStore.listComingForShifts(cycle)
        : db.listComingForShifts(cycle)
      : Promise.resolve(null),
  ]);
  const today = campDayKey(viewer.now ?? new Date());
  const labels = new Map(camp.teams.teams.map((t) => [t.key, t.label]));
  const teams = camp.teams.teams
    .filter(
      (t) =>
        !t.archived && canManageShifts(viewer.rank, viewer.ledTeams, t.key),
    )
    .map((t) => ({ key: t.key as Team, label: t.label }));
  const managesAny = teams.length > 0 || viewer.rank === "captain";
  const members = managesAny
    ? await (usesTestStore()
        ? shiftsTestStore.listShiftMembers()
        : db.listShiftMembers())
    : null;

  const taken = new Set(roster.signups.map((s) => s.slotId));
  const types: ShiftTypeView[] = roster.types.map((t: ShiftTypeRow) => {
    const own = roster.slots.filter((s) => s.typeId === t.id);
    const have = new Set(own.map((s) => s.day));
    return {
      id: t.id,
      team: t.team,
      teamLabel: labels.get(t.team) ?? t.team,
      name: t.name,
      startMinute: t.startMinute,
      durationMinutes: t.durationMinutes,
      places: t.places,
      note: t.note,
      version: t.version,
      timeText: shiftTimeText(t.startMinute, t.durationMinutes),
      canManage: canManageShifts(viewer.rank, viewer.ledTeams, t.team),
      missingDays: burnDays.filter((d) => !have.has(d)).length,
      hasPeople: own.some((s) => taken.has(s.id)),
    };
  });
  const typeById = new Map(types.map((t) => [t.id, t]));

  const dayKeys = [
    ...new Set([...burnDays, ...roster.slots.map((s) => s.day)]),
  ].sort();
  const burn = new Set(burnDays);
  const days: ShiftDayView[] = dayKeys.map((day) => {
    const slots = roster.slots
      .filter((s) => s.day === day && typeById.has(s.typeId))
      .map((s) => {
        const type = typeById.get(s.typeId)!;
        return {
          ...slotView(s, roster, viewer.userId, type.canManage, today),
          type,
        };
      })
      // By start time; two at the same time keep the order they were added
      // in (the roster's order), so a lead puts "head chef" before "cooks".
      .sort((a, b) => a.type.startMinute - b.type.startMinute);
    return {
      day,
      label: shiftDayLabel(day),
      tab: shiftDayTab(day),
      longLabel: shiftDayLong(day),
      outsideBurn: !burn.has(day),
      slots,
      openPlaces: slots
        .filter((s) => s.status === "open")
        .reduce((n, s) => n + Math.max(0, s.type.places - s.taken), 0),
    };
  });

  const myCount = roster.signups.filter(
    (s) => s.userId === viewer.userId,
  ).length;
  return {
    cycle,
    burnDays,
    days,
    types,
    myCount,
    reminder: reminderFor(place, myCount),
    teams,
    canAsk: canAskForShifts(viewer.rank),
    fairness: coming
      ? shiftFairness(
          coming,
          roster.signups.map((s) => s.userId),
        )
      : null,
    members,
  };
}

/**
 * The minimum's reminder for a member, or null. It is for the people the
 * camp asks: nobody who said they are not coming (or only maybe) is told to
 * take shifts. A member who has not answered yet is reminded.
 */
function reminderFor(
  place: Awaited<ReturnType<typeof getMyParticipation>>,
  count: number,
): string | null {
  if (place && !isComingForShifts(place.status)) return null;
  return shiftReminderText(count);
}

// --- My shifts -----------------------------------------------------------------

export interface MyShiftView {
  slotId: string;
  day: string;
  dayLabel: string;
  name: string;
  teamLabel: string;
  timeText: string;
  note: string | null;
  open: boolean;
  /** What else of theirs runs at the same time. */
  clashesWith: string[];
}

export interface MyVolunteerShiftView extends VolunteerShiftRow {
  dayLabel: string;
  timeText: string;
  clashesWith: string[];
}

export interface MyShiftsView {
  shifts: MyShiftView[];
  volunteer: MyVolunteerShiftView[];
  count: number;
  reminder: string | null;
  burnDays: string[];
}

/** The signed-in member's own week: their shifts and AfrikaBurn shifts. */
export async function getMyShifts(
  userId: string,
  now: Date = new Date(),
): Promise<MyShiftsView> {
  const camp = await getCampSettings();
  const cycle = camp.cycleNumber;
  const [roster, volunteer, burnDays, place] = await Promise.all([
    readRoster(cycle),
    usesTestStore()
      ? shiftsTestStore.listMyVolunteerShifts(userId, cycle)
      : db.listMyVolunteerShifts(userId, cycle),
    readBurnDays(cycle),
    getMyParticipation(userId),
  ]);
  const today = campDayKey(now);
  const labels = new Map(camp.teams.teams.map((t) => [t.key, t.label]));
  const types = new Map(roster.types.map((t) => [t.id, t]));
  const mine = new Set(
    roster.signups.filter((s) => s.userId === userId).map((s) => s.slotId),
  );
  const slots = roster.slots
    .filter((s) => mine.has(s.id) && types.has(s.typeId))
    .map((s) => ({ slot: s, type: types.get(s.typeId)! }))
    .sort(
      (a, b) =>
        a.slot.day.localeCompare(b.slot.day) ||
        a.type.startMinute - b.type.startMinute,
    );

  // Clashes: between two of their shifts, or with an AfrikaBurn shift.
  const items = [
    ...slots.map(({ slot, type }) => ({
      key: `s:${slot.id}`,
      label: type.name,
      day: slot.day,
      startMinute: type.startMinute,
      durationMinutes: type.durationMinutes,
    })),
    ...volunteer.map((v) => ({
      key: `v:${v.id}`,
      label: `${v.department} (AfrikaBurn)`,
      day: v.day,
      startMinute: v.startMinute,
      durationMinutes: v.durationMinutes,
    })),
  ];
  const labelOf = new Map(items.map((i) => [i.key, i.label]));
  const clashes = new Map<string, string[]>();
  for (const [a, b] of shiftClashes(items)) {
    clashes.set(a, [...(clashes.get(a) ?? []), labelOf.get(b)!]);
    clashes.set(b, [...(clashes.get(b) ?? []), labelOf.get(a)!]);
  }

  return {
    shifts: slots.map(({ slot, type }) => ({
      slotId: slot.id,
      day: slot.day,
      dayLabel: shiftDayLabel(slot.day),
      name: type.name,
      teamLabel: labels.get(type.team) ?? type.team,
      timeText: shiftTimeText(type.startMinute, type.durationMinutes),
      note: type.note,
      open: shiftChangesOpen(slot.day, today),
      clashesWith: clashes.get(`s:${slot.id}`) ?? [],
    })),
    volunteer: volunteer.map((v) => ({
      ...v,
      dayLabel: shiftDayLabel(v.day),
      timeText: shiftTimeText(v.startMinute, v.durationMinutes),
      clashesWith: clashes.get(`v:${v.id}`) ?? [],
    })),
    count: slots.length,
    reminder: reminderFor(place, slots.length),
    burnDays,
  };
}

/** Whether a captain's "Ask everyone" is still open for this member. */
export async function isAskedForShifts(userId: string): Promise<boolean> {
  return usesTestStore()
    ? shiftsTestStore.hasOpenShiftAsk(userId)
    : db.hasOpenShiftAsk(userId);
}

// --- Writes ----------------------------------------------------------------------
// Each passes only who is acting; the rule is checked inside the write.

export async function saveShiftType(
  actorId: string,
  input: SaveShiftTypeInput,
): Promise<ShiftWriteResult<{ daysAdded: number }>> {
  const args = { ...input, actorId };
  const saved = usesTestStore()
    ? shiftsTestStore.saveShiftType(args)
    : await db.saveShiftType(args);
  return saved.ok ? { ok: true, daysAdded: saved.daysAdded } : saved;
}

export async function removeShiftType(
  actorId: string,
  input: RemoveShiftTypeInput,
): Promise<ShiftWriteResult> {
  const args = { ...input, actorId };
  return usesTestStore()
    ? shiftsTestStore.removeShiftType(args)
    : db.removeShiftType(args);
}

export async function fillShiftDays(
  actorId: string,
  input: FillShiftDaysInput,
): Promise<ShiftWriteResult<{ daysAdded: number }>> {
  const args = { ...input, actorId };
  return usesTestStore()
    ? shiftsTestStore.fillShiftDays(args)
    : db.fillShiftDays(args);
}

export async function setSlotNeeded(
  actorId: string,
  input: SetSlotNeededInput,
): Promise<ShiftWriteResult> {
  const args = { ...input, actorId };
  const saved = usesTestStore()
    ? shiftsTestStore.setSlotNeeded(args)
    : await db.setSlotNeeded(args);
  return saved.ok ? { ok: true } : saved;
}

export async function signUpForShift(
  userId: string,
  input: ShiftSlotInput,
): Promise<ShiftWriteResult<{ mine: number }>> {
  const args = { ...input, userId };
  return usesTestStore()
    ? shiftsTestStore.signUpForShift(args)
    : db.signUpForShift(args);
}

export async function leaveShift(
  userId: string,
  input: ShiftSlotInput,
): Promise<ShiftWriteResult<{ mine: number }>> {
  const args = { ...input, userId };
  return usesTestStore()
    ? shiftsTestStore.leaveShift(args)
    : db.leaveShift(args);
}

export async function placeMemberOnShift(
  actorId: string,
  input: ShiftMemberInput,
): Promise<ShiftWriteResult> {
  const args = { ...input, actorId };
  return usesTestStore()
    ? shiftsTestStore.placeMemberOnShift(args)
    : db.placeMemberOnShift(args);
}

export async function takeMemberOffShift(
  actorId: string,
  input: ShiftMemberInput,
): Promise<ShiftWriteResult> {
  const args = { ...input, actorId };
  return usesTestStore()
    ? shiftsTestStore.takeMemberOffShift(args)
    : db.takeMemberOffShift(args);
}

export async function askForShifts(
  actorId: string,
): Promise<ShiftWriteResult<{ asked: number; notified: number }>> {
  return usesTestStore()
    ? shiftsTestStore.askForShifts({ actorId })
    : db.askForShifts({ actorId });
}

export async function addVolunteerShift(
  userId: string,
  input: AddVolunteerShiftInput,
): Promise<ShiftWriteResult<{ id: string }>> {
  const args = { ...input, userId };
  return usesTestStore()
    ? shiftsTestStore.addVolunteerShift(args)
    : db.addVolunteerShift(args);
}

export async function removeVolunteerShift(
  userId: string,
  input: RemoveVolunteerShiftInput,
): Promise<ShiftWriteResult> {
  const args = { ...input, userId };
  return usesTestStore()
    ? shiftsTestStore.removeVolunteerShift(args)
    : db.removeVolunteerShift(args);
}
