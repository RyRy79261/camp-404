// @vitest-environment node
import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  NOT_A_SHIFT_ASKER,
  NOT_A_SHIFT_KEEPER,
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
  TOO_MANY_VOLUNTEER_SHIFTS,
  VOLUNTEER_SHIFT_GONE,
  placesBelowTaken,
} from "@camp404/db/shifts";
import {
  LogisticsPhase,
  MAX_VOLUNTEER_SHIFTS,
  PARTICIPATION_STATUSES,
  SHIFT_MINIMUM,
  Team,
  ViewerRank,
  type SaveShiftTypeInput,
} from "@camp404/types";
import { useTestDb } from "../../../../packages/db/src/__tests__/_harness";
import { bothWays, type People, type Seed } from "./_agreement";
import { phaseDays } from "./_kitchen";

// The shift roster (#248), through lib/shifts.ts, on the database and on the
// E2E store: the same people, the same writes, the same answers and refusal
// sentences. Who sets a shift up is one rule (canManageShifts), and the checks
// on taking a place, a day's "not needed" and changing or removing a shift
// one function each in @camp404/core; this holds the rest equal. The shifts
// are the Kitchen's, so the Kitchen lead is this domain's lead and the
// Finance lead a lead of ANOTHER team, refused. See _agreement.ts.
//
// A slot takes changes until its day starts (shiftChangesOpen), by the
// server's clock: each case pins the clock (Date only) so both sides read the
// same camp day. A pinned clock stamps every row at the same moment, so two
// shifts in one case start at different times (the roster's order).

const mode = vi.hoisted(() => ({ on: false }));
vi.mock("@/lib/test-mode", () => ({
  isE2ETestMode: () => mode.on,
  usesTestStore: () => mode.on,
  TEST_USER_COOKIE: "camp404_test_user",
}));

import { testStore } from "../test-store";
import {
  addVolunteerShift,
  askForShifts,
  fillShiftDays,
  getMyShifts,
  getShiftsView,
  isAskedForShifts,
  leaveShift,
  placeMemberOnShift,
  removeShiftType,
  removeVolunteerShift,
  saveShiftType,
  setSlotNeeded,
  signUpForShift,
  takeMemberOffShift,
} from "../shifts";

/** Before the Burn: every day takes changes. */
const BEFORE = new Date("2027-03-01T10:00:00Z");
/** Noon on the Burn's second day: its first two days are on paper. */
const DURING = new Date("2027-04-27T10:00:00Z");
const BURN = ["2027-04-26", "2027-04-27", "2027-04-28"] as const;
const [, , ACCEPTED, , NOT_ATTENDING] = PARTICIPATION_STATUSES;

const shift = (
  input: Partial<SaveShiftTypeInput> = {},
): SaveShiftTypeInput => ({
  team: Team.enum.kitchen,
  name: "Dinner dishes",
  startMinute: 19 * 60,
  durationMinutes: 120,
  places: 2,
  note: null,
  expectedVersion: 0,
  ...input,
});

/** The Burn's days, through each side's own Logistics writer. */
const burn = (seed: Seed, p: People) =>
  phaseDays(seed, p, LogisticsPhase.enum.burn, BURN[0], BURN[2]);

/** The roster as the Kitchen lead sees it. */
const leadView = (p: People, now = BEFORE) =>
  getShiftsView({
    userId: p.kitchenLead,
    rank: ViewerRank.enum.team_lead,
    ledTeams: [Team.enum.kitchen],
    now,
  });

/** A new Kitchen shift, its id and its slot on each Burn day. */
async function kitchenShift(
  p: People,
  input: Partial<SaveShiftTypeInput> = {},
): Promise<{ typeId: string; slots: string[] }> {
  const saved = await saveShiftType(p.kitchenLead, shift(input));
  if (!saved.ok) throw new Error(saved.error);
  const view = await leadView(p);
  const name = input.name ?? shift().name;
  const type = view.types.find((t) => t.name === name)!;
  return {
    typeId: type.id,
    slots: view.days.map((d) => d.slots.find((s) => s.typeId === type.id)!.id),
  };
}

describe("the shift roster: the database and the test store agree", () => {
  const h = useTestDb();
  beforeEach(() => {
    mode.on = false;
    testStore.reset();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(BEFORE);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("sets a team's shifts up for a captain or that team's lead only, compare-and-set on the version", async () => {
    const { db, store } = await bothWays(mode, h, async (p, seed) => {
      const noDays = await saveShiftType(
        p.kitchenLead,
        shift({ name: "Early", startMinute: 5 * 60 }),
      );
      await burn(seed, p);
      const otherLead = await saveShiftType(p.financeLead, shift());
      const member = await saveShiftType(p.member, shift());
      const added = await saveShiftType(p.kitchenLead, shift());
      const breakfast = { name: "Breakfast", startMinute: 7 * 60 };
      const { typeId } = await kitchenShift(p, breakfast);
      const early = (await leadView(p)).types.find((t) => t.name === "Early")!;
      const filled = await fillShiftDays(p.kitchenLead, { typeId: early.id });
      const filledAgain = await fillShiftDays(p.kitchenLead, {
        typeId: early.id,
      });
      const fillOtherLead = await fillShiftDays(p.financeLead, {
        typeId: early.id,
      });
      const change = (actorId: string, input: Partial<SaveShiftTypeInput>) =>
        saveShiftType(actorId, shift({ id: typeId, ...breakfast, ...input }));
      const staleNew = await change(p.kitchenLead, { expectedVersion: 0 });
      const moveToFinance = await change(p.kitchenLead, {
        team: Team.enum.finance,
        expectedVersion: 1,
      });
      const changed = await change(p.captain, {
        places: 4,
        expectedVersion: 1,
      });
      const stale = await change(p.kitchenLead, { expectedVersion: 1 });
      const gone = await change(p.captain, {
        id: randomUUID(),
        expectedVersion: 1,
      });
      const removeOtherLead = await removeShiftType(p.financeLead, {
        id: early.id,
        expectedVersion: 1,
      });
      const removeStale = await removeShiftType(p.kitchenLead, {
        id: early.id,
        expectedVersion: 2,
      });
      const removed = await removeShiftType(p.kitchenLead, {
        id: early.id,
        expectedVersion: 1,
      });
      const view = await leadView(p);
      return {
        noDays,
        otherLead,
        member,
        added,
        filled,
        filledAgain,
        fillOtherLead,
        staleNew,
        moveToFinance,
        changed,
        stale,
        gone,
        removeOtherLead,
        removeStale,
        removed,
        view,
      };
    });
    const refused = (error: string) => ({ ok: false, error });
    expect(db).toMatchObject({
      noDays: { ok: true, daysAdded: 0 },
      otherLead: refused(NOT_A_SHIFT_KEEPER),
      member: refused(NOT_A_SHIFT_KEEPER),
      added: { ok: true, daysAdded: BURN.length },
      filled: { ok: true, daysAdded: BURN.length },
      filledAgain: { ok: true, daysAdded: 0 },
      fillOtherLead: refused(NOT_A_SHIFT_KEEPER),
      staleNew: refused(SHIFT_TYPE_CHANGED),
      moveToFinance: refused(NOT_A_SHIFT_KEEPER),
      changed: { ok: true, daysAdded: 0 },
      stale: refused(SHIFT_TYPE_CHANGED),
      gone: refused(SHIFT_GONE),
      removeOtherLead: refused(NOT_A_SHIFT_KEEPER),
      removeStale: refused(SHIFT_TYPE_CHANGED),
      removed: { ok: true },
      view: {
        burnDays: [...BURN],
        types: [
          { name: "Breakfast", places: 4, version: 2, canManage: true },
          { name: "Dinner dishes", places: 2, version: 1, missingDays: 0 },
        ],
      },
    });
    expect(store).toEqual(db);
  });

  it("gives the last place to one member, and lets the team's lead put people on and take them off", async () => {
    const { db, store } = await bothWays(mode, h, async (p, seed) => {
      await burn(seed, p);
      const pending = await seed.user("Late", { approval: "pending" });
      const { typeId, slots } = await kitchenShift(p);
      const [first, second, third] = slots as [string, string, string];
      const signedUp = await signUpForShift(p.member, { slotId: first });
      const twice = await signUpForShift(p.member, { slotId: first });
      const otherToo = await signUpForShift(p.other, { slotId: first });
      const full = await signUpForShift(p.captain, { slotId: first });
      const notApproved = await signUpForShift(pending, { slotId: second });
      const gone = await signUpForShift(p.member, { slotId: randomUUID() });
      const placeOtherLead = await placeMemberOnShift(p.financeLead, {
        slotId: second,
        userId: p.member,
      });
      const placed = await placeMemberOnShift(p.kitchenLead, {
        slotId: second,
        userId: p.member,
      });
      const placedTwice = await placeMemberOnShift(p.kitchenLead, {
        slotId: second,
        userId: p.member,
      });
      const fewerPlaces = await saveShiftType(
        p.kitchenLead,
        shift({ id: typeId, places: 1, expectedVersion: 1 }),
      );
      const removeWithPeople = await removeShiftType(p.kitchenLead, {
        id: typeId,
        expectedVersion: 1,
      });
      const left = await leaveShift(p.other, { slotId: first });
      const leftAgain = await leaveShift(p.other, { slotId: first });
      const offOtherLead = await takeMemberOffShift(p.financeLead, {
        slotId: second,
        userId: p.member,
      });
      const takenOff = await takeMemberOffShift(p.kitchenLead, {
        slotId: second,
        userId: p.member,
      });
      const takenOffAgain = await takeMemberOffShift(p.kitchenLead, {
        slotId: second,
        userId: p.member,
      });
      await signUpForShift(p.other, { slotId: third });
      const dayWithPeople = await setSlotNeeded(p.kitchenLead, {
        slotId: third,
        needed: false,
        expectedVersion: 1,
      });
      const notNeeded = await setSlotNeeded(p.kitchenLead, {
        slotId: second,
        needed: false,
        expectedVersion: 1,
      });
      const staleDay = await setSlotNeeded(p.captain, {
        slotId: second,
        needed: true,
        expectedVersion: 1,
      });
      const onNotNeeded = await signUpForShift(p.member, { slotId: second });
      const memberView = await getShiftsView({
        userId: p.member,
        rank: ViewerRank.enum.camp_member,
        ledTeams: [],
        now: BEFORE,
      });
      const lead = await leadView(p);
      return {
        signedUp,
        twice,
        otherToo,
        full,
        notApproved,
        gone,
        placeOtherLead,
        placed,
        placedTwice,
        fewerPlaces,
        removeWithPeople,
        left,
        leftAgain,
        offOtherLead,
        takenOff,
        takenOffAgain,
        dayWithPeople,
        notNeeded,
        staleDay,
        onNotNeeded,
        memberView: {
          myCount: memberView.myCount,
          reminder: memberView.reminder,
          fairness: memberView.fairness,
          members: memberView.members,
          days: memberView.days,
        },
        leadPeople: lead.days.map((d) => d.slots.map((s) => s.people)),
        leadMembers: lead.members,
        leadFairness: lead.fairness,
      };
    });
    const refused = (error: string) => ({ ok: false, error });
    expect(db).toMatchObject({
      signedUp: { ok: true, mine: 1 },
      twice: refused(SHIFT_ALREADY_ON),
      otherToo: { ok: true, mine: 1 },
      full: refused(SHIFT_FULL),
      notApproved: refused(SHIFT_NOT_A_MEMBER),
      gone: refused(SHIFT_GONE),
      placeOtherLead: refused(NOT_A_SHIFT_KEEPER),
      placed: { ok: true },
      placedTwice: refused(SHIFT_MEMBER_ALREADY_ON),
      fewerPlaces: refused(placesBelowTaken(2)),
      removeWithPeople: refused(SHIFT_HAS_PEOPLE),
      left: { ok: true, mine: 0 },
      leftAgain: refused(SHIFT_NOT_ON),
      offOtherLead: refused(NOT_A_SHIFT_KEEPER),
      takenOff: { ok: true },
      takenOffAgain: refused(SHIFT_MEMBER_NOT_ON),
      dayWithPeople: refused(SHIFT_DAY_HAS_PEOPLE),
      notNeeded: { ok: true },
      staleDay: refused(SHIFT_SLOT_CHANGED),
      onNotNeeded: refused(SHIFT_NOT_NEEDED),
      leadMembers: [
        { userId: "@captain", name: "Cap" },
        { userId: "@kitchenLead", name: "Cook" },
        { userId: "@financeLead", name: "Fin" },
        { userId: "@member", name: "Nova" },
        { userId: "@other", name: "Zed" },
      ],
      leadFairness: [],
      memberView: {
        myCount: 1,
        fairness: null,
        members: null,
        days: [
          { slots: [{ names: ["Nova"], mine: true, people: null }] },
          { slots: [{ status: "not_needed", taken: 0 }] },
          { slots: [{ names: ["Zed"], mine: false }] },
        ],
      },
    });
    expect(store).toEqual(db);
  });

  it("stops taking changes once a day has started, for leads and captains too", async () => {
    const { db, store } = await bothWays(mode, h, async (p, seed) => {
      vi.setSystemTime(BEFORE);
      await burn(seed, p);
      const { typeId, slots } = await kitchenShift(p);
      const [first, second, third] = slots as [string, string, string];
      await signUpForShift(p.member, { slotId: first });
      await signUpForShift(p.member, { slotId: second });
      vi.setSystemTime(DURING);
      const leaveStarted = await leaveShift(p.member, { slotId: first });
      const signUpToday = await signUpForShift(p.other, { slotId: second });
      const signUpTomorrow = await signUpForShift(p.other, { slotId: third });
      const placeStarted = await placeMemberOnShift(p.captain, {
        slotId: first,
        userId: p.other,
      });
      const offStarted = await takeMemberOffShift(p.kitchenLead, {
        slotId: second,
        userId: p.member,
      });
      const dayStarted = await setSlotNeeded(p.kitchenLead, {
        slotId: first,
        needed: false,
        expectedVersion: 1,
      });
      const changeStarted = await saveShiftType(
        p.captain,
        shift({ id: typeId, places: 3, expectedVersion: 1 }),
      );
      const removeStarted = await removeShiftType(p.captain, {
        id: typeId,
        expectedVersion: 1,
      });
      const fill = await fillShiftDays(p.kitchenLead, { typeId });
      const late = await saveShiftType(
        p.kitchenLead,
        shift({ name: "Late", startMinute: 22 * 60 }),
      );
      const view = await leadView(p, DURING);
      const mine = await getMyShifts(p.member, DURING);
      return {
        leaveStarted,
        signUpToday,
        signUpTomorrow,
        placeStarted,
        offStarted,
        dayStarted,
        changeStarted,
        removeStarted,
        fill,
        late,
        open: view.days.map((d) => d.slots.map((s) => [s.type.name, s.open])),
        mine: mine.shifts.map((s) => [s.day, s.open]),
      };
    });
    const refused = (error: string) => ({ ok: false, error });
    expect(db).toMatchObject({
      leaveStarted: refused(SHIFT_CLOSED),
      signUpToday: refused(SHIFT_CLOSED),
      signUpTomorrow: { ok: true, mine: 1 },
      placeStarted: refused(SHIFT_CLOSED),
      offStarted: refused(SHIFT_CLOSED),
      dayStarted: refused(SHIFT_CLOSED),
      changeStarted: refused(SHIFT_CLOSED),
      removeStarted: refused(SHIFT_CLOSED),
      fill: { ok: true, daysAdded: 0 },
      late: { ok: true, daysAdded: 1 },
      open: [
        [["Dinner dishes", false]],
        [["Dinner dishes", false]],
        [
          ["Dinner dishes", true],
          ["Late", true],
        ],
      ],
      mine: [
        [BURN[0], false],
        [BURN[1], false],
      ],
    });
    expect(store).toEqual(db);
  });

  it("asks only who is coming and below the minimum, a captain only, and closes the ask at the minimum", async () => {
    const { db, store } = await bothWays(mode, h, async (p, seed) => {
      await burn(seed, p);
      await seed.participation(p.member, ACCEPTED);
      await seed.participation(p.other, NOT_ATTENDING);
      const { slots } = await kitchenShift(p, { places: 5 });
      const leadAsks = await askForShifts(p.kitchenLead);
      const asked = await askForShifts(p.captain);
      const askedAgain = await askForShifts(p.captain);
      const open = await isAskedForShifts(p.member);
      const otherOpen = await isAskedForShifts(p.other);
      const counts: unknown[] = [];
      for (const slotId of slots.slice(0, SHIFT_MINIMUM)) {
        counts.push(await signUpForShift(p.member, { slotId }));
      }
      const closed = await isAskedForShifts(p.member);
      const fairness = (await leadView(p)).fairness;
      return {
        leadAsks,
        asked,
        askedAgain,
        open,
        otherOpen,
        counts,
        closed,
        fairness,
      };
    });
    expect(db).toMatchObject({
      leadAsks: { ok: false, error: NOT_A_SHIFT_ASKER },
      asked: { ok: true, asked: 1, notified: 1 },
      askedAgain: { ok: true, asked: 1, notified: 0 },
      open: true,
      otherOpen: false,
      counts: [{ mine: 1 }, { mine: 2 }, { mine: SHIFT_MINIMUM }],
      closed: false,
      fairness: [{ userId: "@member", count: SHIFT_MINIMUM, below: false }],
    });
    expect(store).toEqual(db);
  });

  it("keeps a member's AfrikaBurn shifts their own, up to the limit, and shows what clashes", async () => {
    const { db, store } = await bothWays(mode, h, async (p, seed) => {
      await burn(seed, p);
      const pending = await seed.user("Late", { approval: "pending" });
      const { slots } = await kitchenShift(p);
      await signUpForShift(p.member, { slotId: slots[0]! });
      const volunteer = (userId: string, startMinute = 20 * 60) =>
        addVolunteerShift(userId, {
          department: "Rangers",
          day: BURN[0],
          startMinute,
          durationMinutes: 120,
        });
      const notApproved = await volunteer(pending);
      const first = await volunteer(p.member);
      const results = [first];
      for (let i = 1; i < MAX_VOLUNTEER_SHIFTS; i++) {
        results.push(await volunteer(p.member, 6 * 60));
      }
      const tooMany = await volunteer(p.member);
      const firstId = first.ok ? first.id : "";
      const notTheirs = await removeVolunteerShift(p.other, { id: firstId });
      const othersView = await getMyShifts(p.other, BEFORE);
      const mineBefore = await getMyShifts(p.member, BEFORE);
      const removed = await removeVolunteerShift(p.member, { id: firstId });
      const removedAgain = await removeVolunteerShift(p.member, {
        id: firstId,
      });
      const mineAfter = await getMyShifts(p.member, BEFORE);
      return {
        notApproved,
        added: results.filter((r) => r.ok).length,
        tooMany,
        notTheirs,
        othersVolunteer: othersView.volunteer,
        clash: mineBefore.shifts[0]!.clashesWith,
        removed,
        removedAgain,
        afterCount: mineAfter.volunteer.length,
        afterClash: mineAfter.shifts[0]!.clashesWith,
      };
    });
    expect(db).toMatchObject({
      notApproved: { ok: false, error: SHIFT_NOT_A_MEMBER },
      added: MAX_VOLUNTEER_SHIFTS,
      tooMany: { ok: false, error: TOO_MANY_VOLUNTEER_SHIFTS },
      notTheirs: { ok: false, error: VOLUNTEER_SHIFT_GONE },
      othersVolunteer: [],
      clash: ["Rangers (AfrikaBurn)"],
      removed: { ok: true },
      removedAgain: { ok: false, error: VOLUNTEER_SHIFT_GONE },
      afterCount: MAX_VOLUNTEER_SHIFTS - 1,
      afterClash: [],
    });
    expect(store).toEqual(db);
  });
});
