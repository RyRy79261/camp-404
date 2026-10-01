import { and, eq } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";
import {
  CLEANING_TEAM,
  SHIFTS_ACTION_KEY,
  SHIFTS_REF_TYPE,
} from "@camp404/core";
import {
  SHIFT_MINIMUM,
  type ParticipationStatus,
  type Team,
} from "@camp404/types";
import type { CampConfig } from "../camp-config";
import * as schema from "../schema";
import {
  NOT_A_SHIFT_ASKER,
  NOT_A_SHIFT_KEEPER,
  NO_BURN_DAYS,
  SHIFT_ALREADY_ON,
  SHIFT_CLOSED,
  SHIFT_DAY_HAS_PEOPLE,
  SHIFT_FULL,
  SHIFT_HAS_PEOPLE,
  SHIFT_NOT_A_MEMBER,
  SHIFT_NOT_NEEDED,
  SHIFT_NOT_ON,
  SHIFT_SLOT_CHANGED,
  SHIFT_TYPE_CHANGED,
  VOLUNTEER_SHIFT_GONE,
  addVolunteerShift,
  askForShifts,
  fillShiftDays,
  leaveShift,
  listMyVolunteerShifts,
  placeMemberOnShift,
  placesBelowTaken,
  readShiftRoster,
  removeShiftType,
  removeVolunteerShift,
  saveShiftType,
  setSlotNeeded,
  signUpForShift,
  takeMemberOffShift,
} from "../shifts";
import { sanitiseAccount } from "../account";
import { setUserApproval } from "../burner-profile";
import { assignTeam, setLead } from "../team-memberships";
import { useTestDb } from "./_harness";
import { makeUser } from "./_factories";

// The shift roster (#248) on a real Postgres (PGlite). What matters: a
// captain or a lead OF THE SHIFT'S TEAM sets shifts up, checked inside the
// write, and a lead of another team and a member are refused; every member
// takes an open place, and the last place goes to one member only; changes
// stop when the slot's day starts (paper on site); the minimum is a nudge,
// never a block; and erasure takes a member off every shift.

type DB = ReturnType<ReturnType<typeof useTestDb>["db"]>;
type Harness = ReturnType<typeof useTestDb>;

const YEAR = 2027;
const BURN = { start: "2027-04-27", end: "2027-05-03" };
const BEFORE = new Date("2027-04-01T08:00:00Z");
/** 10:00 on the Burn's first day, camp time. */
const ON_THE_DAY = new Date("2027-04-27T08:00:00Z");

async function campYear(db: DB, year: number) {
  const cycles: CampConfig["cycles"] = [
    { year, startedAt: `${year}-01-01T00:00:00.000Z`, endedAt: null },
  ];
  await db
    .insert(schema.campSettings)
    .values({ id: true })
    .onConflictDoNothing({ target: schema.campSettings.id });
  const [row] = await db
    .select({ config: schema.campSettings.config })
    .from(schema.campSettings)
    .limit(1);
  await db
    .update(schema.campSettings)
    .set({ config: { ...row!.config, cycles } })
    .where(eq(schema.campSettings.id, true));
}

async function burnDays(db: DB, start: string, end: string) {
  await db
    .insert(schema.logisticsPhases)
    .values({
      cycle: YEAR,
      phase: "burn",
      startDate: start,
      endDate: end,
    })
    .onConflictDoUpdate({
      target: [schema.logisticsPhases.cycle, schema.logisticsPhases.phase],
      set: { startDate: start, endDate: end },
    });
}

const CLEANING = {
  team: CLEANING_TEAM as Team,
  name: "Morning clean",
  startMinute: 8 * 60,
  durationMinutes: 120,
  places: 2,
  note: "Dishes, surfaces, trash.",
  expectedVersion: 0,
};

function helpers(h: Harness) {
  async function leadOf(team: Team, displayName: string) {
    const user = await makeUser(h.db(), { displayName });
    await assignTeam({ userId: user.id, team });
    expect(await setLead({ userId: user.id, team, isLead: true })).toEqual({
      ok: true,
      changed: true,
    });
    return user;
  }

  async function people(withBurn = true) {
    await campYear(h.db(), YEAR);
    if (withBurn) await burnDays(h.db(), BURN.start, BURN.end);
    const captain = await makeUser(h.db(), {
      rank: "captain",
      displayName: "Cap Tain",
    });
    const sanitationLead = await leadOf(CLEANING_TEAM as Team, "San Lead");
    const kitchenLead = await leadOf("kitchen", "Kit Lead");
    const dee = await makeUser(h.db(), { displayName: "Dee Member" });
    const sam = await makeUser(h.db(), { displayName: "Sam Other" });
    return { captain, sanitationLead, kitchenLead, dee, sam };
  }

  async function audits(action: string) {
    return h
      .db()
      .select()
      .from(schema.auditLog)
      .where(eq(schema.auditLog.action, action));
  }

  /** A cleaning shift made by the Sanitation lead, and its first day's slot. */
  async function cleaning(actorId: string, places = CLEANING.places) {
    const saved = await saveShiftType({ ...CLEANING, places, actorId });
    if (!saved.ok) throw new Error(saved.error);
    const roster = await readShiftRoster(YEAR);
    const slots = roster.slots.filter((s) => s.typeId === saved.type.id);
    return { type: saved.type, slots, first: slots[0]! };
  }

  async function place(userId: string, status: ParticipationStatus) {
    await h
      .db()
      .insert(schema.campParticipations)
      .values({ userId, cycle: YEAR, status, intent: "yes" });
  }

  async function nudge(userId: string) {
    const [row] = await h
      .db()
      .select()
      .from(schema.requiredActions)
      .where(
        and(
          eq(schema.requiredActions.userId, userId),
          eq(schema.requiredActions.actionKey, SHIFTS_ACTION_KEY),
        ),
      );
    return row;
  }

  async function notices(userId: string) {
    return h
      .db()
      .select()
      .from(schema.notificationDeliveries)
      .where(
        and(
          eq(schema.notificationDeliveries.userId, userId),
          eq(schema.notificationDeliveries.refType, SHIFTS_REF_TYPE),
        ),
      );
  }

  return { people, audits, cleaning, place, nudge, notices };
}

describe("shift types", () => {
  const h = useTestDb();
  const { people, audits, cleaning } = helpers(h);

  it("a Sanitation lead sets up a cleaning shift, with a slot on every Burn day, audited", async () => {
    const { sanitationLead } = await people();
    const saved = await saveShiftType({
      ...CLEANING,
      actorId: sanitationLead.id,
    });
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;
    expect(saved.daysAdded).toBe(7);
    expect(saved.type).toMatchObject({
      cycle: YEAR,
      team: CLEANING_TEAM,
      name: "Morning clean",
      places: 2,
      version: 1,
    });
    const roster = await readShiftRoster(YEAR);
    expect(roster.slots.map((s) => s.day)).toEqual([
      "2027-04-27",
      "2027-04-28",
      "2027-04-29",
      "2027-04-30",
      "2027-05-01",
      "2027-05-02",
      "2027-05-03",
    ]);
    expect(roster.slots.every((s) => s.status === "open")).toBe(true);
    const rows = await audits("shifts.type_added");
    expect(rows).toHaveLength(1);
    expect(rows[0]!.actorId).toBe(sanitationLead.id);
  });

  it("refuses a lead of another team, and a member, inside the write", async () => {
    const { kitchenLead, dee, sanitationLead } = await people();
    for (const actorId of [kitchenLead.id, dee.id, "not-a-uuid"]) {
      expect(await saveShiftType({ ...CLEANING, actorId })).toEqual({
        ok: false,
        error: NOT_A_SHIFT_KEEPER,
      });
    }
    // A Kitchen lead can neither change nor take over a cleaning shift.
    const { type } = await cleaning(sanitationLead.id);
    expect(
      await saveShiftType({
        ...CLEANING,
        id: type.id,
        team: "kitchen",
        expectedVersion: 1,
        actorId: kitchenLead.id,
      }),
    ).toEqual({ ok: false, error: NOT_A_SHIFT_KEEPER });
    expect(
      await removeShiftType({
        id: type.id,
        expectedVersion: 1,
        actorId: kitchenLead.id,
      }),
    ).toEqual({ ok: false, error: NOT_A_SHIFT_KEEPER });
    expect(await audits("shifts.type_added")).toHaveLength(1);
  });

  it("a captain sets up any team's shifts", async () => {
    const { captain } = await people();
    const saved = await saveShiftType({
      ...CLEANING,
      team: "power_and_lighting",
      name: "Generator watch",
      startMinute: 0,
      durationMinutes: 480,
      places: 1,
      actorId: captain.id,
    });
    expect(saved.ok).toBe(true);
  });

  it("two shifts at the same time keep the order they were added in, not the alphabet", async () => {
    const { captain } = await people();
    for (const name of ["Brunch: head chef", "Brunch: cooks"]) {
      const saved = await saveShiftType({
        ...CLEANING,
        team: "kitchen",
        name,
        startMinute: 9 * 60,
        actorId: captain.id,
      });
      expect(saved.ok).toBe(true);
    }
    const early = await saveShiftType({
      ...CLEANING,
      name: "Morning clean",
      actorId: captain.id,
    });
    expect(early.ok).toBe(true);
    expect((await readShiftRoster(YEAR)).types.map((t) => t.name)).toEqual([
      "Morning clean",
      "Brunch: head chef",
      "Brunch: cooks",
    ]);
  });

  it("a change is a compare-and-set, and keeps places for who is already on", async () => {
    const { sanitationLead, dee, sam } = await people();
    const { type, first } = await cleaning(sanitationLead.id);
    expect(
      (await signUpForShift({ userId: dee.id, slotId: first.id, now: BEFORE }))
        .ok,
    ).toBe(true);
    expect(
      (await signUpForShift({ userId: sam.id, slotId: first.id, now: BEFORE }))
        .ok,
    ).toBe(true);

    const change = { ...CLEANING, id: type.id, actorId: sanitationLead.id };
    expect(
      await saveShiftType({ ...change, places: 1, expectedVersion: 1 }),
    ).toEqual({
      ok: false,
      error: placesBelowTaken(2),
    });
    const moved = await saveShiftType({
      ...change,
      startMinute: 9 * 60,
      expectedVersion: 1,
    });
    expect(moved.ok && moved.type.version).toBe(2);
    expect(
      await saveShiftType({
        ...change,
        startMinute: 7 * 60,
        expectedVersion: 1,
      }),
    ).toEqual({ ok: false, error: SHIFT_TYPE_CHANGED });
    expect(await audits("shifts.type_changed")).toHaveLength(1);
  });

  it("removes a shift only while nobody is on it", async () => {
    const { sanitationLead, dee } = await people();
    const { type, first } = await cleaning(sanitationLead.id);
    await signUpForShift({ userId: dee.id, slotId: first.id, now: BEFORE });
    const remove = {
      id: type.id,
      expectedVersion: 1,
      actorId: sanitationLead.id,
    };
    expect(await removeShiftType(remove)).toEqual({
      ok: false,
      error: SHIFT_HAS_PEOPLE,
    });
    await leaveShift({ userId: dee.id, slotId: first.id, now: BEFORE });
    expect(await removeShiftType(remove)).toEqual({ ok: true });
    expect((await readShiftRoster(YEAR)).slots).toHaveLength(0);
    expect(await audits("shifts.type_removed")).toHaveLength(1);
  });

  it("adds the Burn days a shift lacks, once the Burn has days", async () => {
    const { sanitationLead } = await people(false);
    const saved = await saveShiftType({
      ...CLEANING,
      actorId: sanitationLead.id,
    });
    expect(saved.ok && saved.daysAdded).toBe(0);
    if (!saved.ok) return;
    expect(
      await fillShiftDays({
        actorId: sanitationLead.id,
        typeId: saved.type.id,
      }),
    ).toEqual({ ok: false, error: NO_BURN_DAYS });
    await burnDays(h.db(), "2027-04-27", "2027-04-29");
    expect(
      await fillShiftDays({
        actorId: sanitationLead.id,
        typeId: saved.type.id,
      }),
    ).toEqual({ ok: true, daysAdded: 3 });
    await burnDays(h.db(), "2027-04-27", "2027-04-30");
    expect(
      await fillShiftDays({
        actorId: sanitationLead.id,
        typeId: saved.type.id,
      }),
    ).toEqual({ ok: true, daysAdded: 1 });
    expect(await audits("shifts.days_added")).toHaveLength(2);
  });
});

describe("taking places", () => {
  const h = useTestDb();
  const { people, audits, cleaning } = helpers(h);

  it("the last place goes to one member; the next is told it is full", async () => {
    const { sanitationLead, dee, sam } = await people();
    const { first } = await cleaning(sanitationLead.id, 1);
    expect(
      await signUpForShift({ userId: dee.id, slotId: first.id, now: BEFORE }),
    ).toEqual({ ok: true, mine: 1 });
    expect(
      await signUpForShift({ userId: sam.id, slotId: first.id, now: BEFORE }),
    ).toEqual({ ok: false, error: SHIFT_FULL });
    expect(
      await signUpForShift({ userId: dee.id, slotId: first.id, now: BEFORE }),
    ).toEqual({ ok: false, error: SHIFT_ALREADY_ON });
    const roster = await readShiftRoster(YEAR);
    expect(roster.signups).toEqual([
      {
        slotId: first.id,
        userId: dee.id,
        name: "Dee Member",
        addedByUserId: null,
      },
    ]);
    // A member's own sign-up is theirs: not audited.
    expect(await audits("shifts.member_placed")).toHaveLength(0);
  });

  it("stops taking changes when the day starts: the paper is the roster then", async () => {
    const { sanitationLead, dee, sam } = await people();
    const { first, slots } = await cleaning(sanitationLead.id);
    await signUpForShift({ userId: dee.id, slotId: first.id, now: BEFORE });
    expect(
      await signUpForShift({
        userId: sam.id,
        slotId: first.id,
        now: ON_THE_DAY,
      }),
    ).toEqual({ ok: false, error: SHIFT_CLOSED });
    expect(
      await leaveShift({ userId: dee.id, slotId: first.id, now: ON_THE_DAY }),
    ).toEqual({ ok: false, error: SHIFT_CLOSED });
    expect(
      await takeMemberOffShift({
        actorId: sanitationLead.id,
        slotId: first.id,
        userId: dee.id,
        now: ON_THE_DAY,
      }),
    ).toEqual({ ok: false, error: SHIFT_CLOSED });
    // A change to the shift reaches the day that has started, so it is
    // refused too.
    expect(
      await saveShiftType({
        ...CLEANING,
        id: first.typeId,
        note: "Bins too.",
        expectedVersion: 1,
        actorId: sanitationLead.id,
        now: ON_THE_DAY,
      }),
    ).toEqual({ ok: false, error: SHIFT_CLOSED });
    // The next day still takes sign-ups.
    expect(
      (
        await signUpForShift({
          userId: sam.id,
          slotId: slots[1]!.id,
          now: ON_THE_DAY,
        })
      ).ok,
    ).toBe(true);
  });

  it("refuses a member who is not approved", async () => {
    const { sanitationLead } = await people();
    const { first } = await cleaning(sanitationLead.id);
    const waiting = await makeUser(h.db(), { approvalStatus: "pending" });
    expect(
      await signUpForShift({
        userId: waiting.id,
        slotId: first.id,
        now: BEFORE,
      }),
    ).toEqual({ ok: false, error: SHIFT_NOT_A_MEMBER });
  });

  it("a member leaves their own place, once", async () => {
    const { sanitationLead, dee } = await people();
    const { first } = await cleaning(sanitationLead.id);
    await signUpForShift({ userId: dee.id, slotId: first.id, now: BEFORE });
    expect(
      await leaveShift({ userId: dee.id, slotId: first.id, now: BEFORE }),
    ).toEqual({ ok: true, mine: 0 });
    expect(
      await leaveShift({ userId: dee.id, slotId: first.id, now: BEFORE }),
    ).toEqual({ ok: false, error: SHIFT_NOT_ON });
  });

  it("a day marked not needed takes nobody, and cannot be marked while people are on it", async () => {
    const { sanitationLead, kitchenLead, dee, sam } = await people();
    const { first } = await cleaning(sanitationLead.id);
    await signUpForShift({ userId: dee.id, slotId: first.id, now: BEFORE });
    const mark = {
      actorId: sanitationLead.id,
      slotId: first.id,
      needed: false,
      expectedVersion: 1,
      now: BEFORE,
    };
    expect(await setSlotNeeded(mark)).toEqual({
      ok: false,
      error: SHIFT_DAY_HAS_PEOPLE,
    });
    expect(await setSlotNeeded({ ...mark, actorId: kitchenLead.id })).toEqual({
      ok: false,
      error: NOT_A_SHIFT_KEEPER,
    });
    await leaveShift({ userId: dee.id, slotId: first.id, now: BEFORE });
    const marked = await setSlotNeeded(mark);
    expect(marked.ok && marked.slot.status).toBe("not_needed");
    expect(await setSlotNeeded(mark)).toEqual({
      ok: false,
      error: SHIFT_SLOT_CHANGED,
    });
    expect(
      await signUpForShift({ userId: sam.id, slotId: first.id, now: BEFORE }),
    ).toEqual({ ok: false, error: SHIFT_NOT_NEEDED });
    expect(await audits("shifts.slot_needed_set")).toHaveLength(1);
  });

  it("a lead of the shift's team puts a member on and takes them off, audited; another team's lead is refused", async () => {
    const { sanitationLead, kitchenLead, dee } = await people();
    const { first } = await cleaning(sanitationLead.id);
    const put = { slotId: first.id, userId: dee.id, now: BEFORE };
    expect(
      await placeMemberOnShift({ ...put, actorId: kitchenLead.id }),
    ).toEqual({ ok: false, error: NOT_A_SHIFT_KEEPER });
    expect(
      await placeMemberOnShift({ ...put, actorId: sanitationLead.id }),
    ).toEqual({ ok: true });
    const roster = await readShiftRoster(YEAR);
    expect(roster.signups[0]!.addedByUserId).toBe(sanitationLead.id);
    expect(
      await takeMemberOffShift({ ...put, actorId: kitchenLead.id }),
    ).toEqual({ ok: false, error: NOT_A_SHIFT_KEEPER });
    expect(
      await takeMemberOffShift({ ...put, actorId: sanitationLead.id }),
    ).toEqual({ ok: true });
    expect(await audits("shifts.member_placed")).toHaveLength(1);
    expect(await audits("shifts.member_removed")).toHaveLength(1);
  });

  it("erasure takes a member off every shift and drops their AfrikaBurn shifts", async () => {
    const { sanitationLead, dee } = await people();
    const { first } = await cleaning(sanitationLead.id);
    await signUpForShift({ userId: dee.id, slotId: first.id, now: BEFORE });
    await addVolunteerShift({
      userId: dee.id,
      department: "Rangers",
      day: "2027-04-28",
      startMinute: 600,
      durationMinutes: 240,
    });
    expect((await sanitiseAccount(dee.id)).ok).toBe(true);
    expect((await readShiftRoster(YEAR)).signups).toHaveLength(0);
    expect(await h.db().select().from(schema.volunteerShifts)).toHaveLength(0);
  });
});

describe("leaving approved", () => {
  const h = useTestDb();
  const { people, audits, cleaning } = helpers(h);

  it("a member who is rejected or re-opened comes off this year's shifts, so the place is free again", async () => {
    const { captain, sanitationLead, dee, sam } = await people();
    const { type, first } = await cleaning(sanitationLead.id, 1);
    for (const to of ["rejected", "pending"] as const) {
      await h
        .db()
        .update(schema.users)
        .set({ approvalStatus: "approved" })
        .where(eq(schema.users.id, dee.id));
      expect(
        await signUpForShift({ userId: dee.id, slotId: first.id, now: BEFORE }),
      ).toEqual({ ok: true, mine: 1 });
      expect(
        await setUserApproval({
          userId: dee.id,
          from: "approved",
          to,
          decidedByUserId: captain.id,
        }),
      ).toBe(true);
      expect(
        await h
          .db()
          .select()
          .from(schema.shiftSignups)
          .where(eq(schema.shiftSignups.userId, dee.id)),
      ).toHaveLength(0);
    }
    expect(await audits("shifts.member_removed")).toHaveLength(2);
    // The place is free, and the shift can go.
    expect(
      await signUpForShift({ userId: sam.id, slotId: first.id, now: BEFORE }),
    ).toEqual({ ok: true, mine: 1 });
    await leaveShift({ userId: sam.id, slotId: first.id, now: BEFORE });
    expect(
      await removeShiftType({
        id: type.id,
        expectedVersion: 1,
        actorId: sanitationLead.id,
      }),
    ).toEqual({ ok: true });
  });
});

describe("locks", () => {
  const h = useTestDb();
  const { people, cleaning } = helpers(h);

  /** The SQL each write's transaction sends, in order. */
  function recordTransactionSql(): string[] {
    const client = h.client();
    const seen: string[] = [];
    const original = client.transaction.bind(client);
    vi.spyOn(client, "transaction").mockImplementation((async (
      fn: (tx: Parameters<Parameters<typeof original>[0]>[0]) => unknown,
    ) =>
      original(async (tx) => {
        const query = tx.query.bind(tx);
        tx.query = ((text: string, ...rest: unknown[]) => {
          seen.push(text.toLowerCase());
          return (query as (...a: unknown[]) => unknown)(text, ...rest);
        }) as typeof tx.query;
        return fn(tx);
      })) as typeof client.transaction);
    return seen;
  }

  it("a sign-up holds the shift type's row FOR SHARE before it locks the slot, so a change to places waits for it", async () => {
    const { sanitationLead, dee } = await people();
    const { first } = await cleaning(sanitationLead.id);
    const seen = recordTransactionSql();
    try {
      expect(
        (
          await signUpForShift({
            userId: dee.id,
            slotId: first.id,
            now: BEFORE,
          })
        ).ok,
      ).toBe(true);
    } finally {
      vi.restoreAllMocks();
    }
    const typeShare = seen.findIndex(
      (q) => q.includes('from "shift_types"') && q.endsWith("for share"),
    );
    const slotUpdate = seen.findIndex(
      (q) => q.includes('from "shift_slots"') && q.endsWith("for update"),
    );
    expect(typeShare).toBeGreaterThanOrEqual(0);
    expect(slotUpdate).toBeGreaterThan(typeShare);
  });
});

describe("the minimum, as a reminder", () => {
  const h = useTestDb();
  const { people, audits, cleaning, place, nudge, notices } = helpers(h);

  it("a captain asks who is coming and short of the minimum; reaching it closes the ask", async () => {
    const { captain, sanitationLead, kitchenLead, dee, sam } = await people();
    const maybe = await makeUser(h.db(), { displayName: "Mo Maybe" });
    await place(dee.id, "applied");
    await place(sam.id, "accepted");
    await place(maybe.id, "maybe");
    const { slots } = await cleaning(sanitationLead.id);
    // Sam already has the minimum.
    for (const slot of slots.slice(0, SHIFT_MINIMUM)) {
      await signUpForShift({ userId: sam.id, slotId: slot.id, now: BEFORE });
    }

    expect(await askForShifts({ actorId: sanitationLead.id })).toEqual({
      ok: false,
      error: NOT_A_SHIFT_ASKER,
    });
    expect(await askForShifts({ actorId: kitchenLead.id })).toEqual({
      ok: false,
      error: NOT_A_SHIFT_ASKER,
    });
    expect(await askForShifts({ actorId: captain.id, now: BEFORE })).toEqual({
      ok: true,
      asked: 1,
      notified: 1,
    });
    expect((await nudge(dee.id))?.status).toBe("pending");
    expect((await nudge(dee.id))?.blocking).toBe(false);
    expect(await nudge(sam.id)).toBeUndefined();
    expect(await nudge(maybe.id)).toBeUndefined();
    // No second notice while the first is unread.
    expect(await askForShifts({ actorId: captain.id, now: BEFORE })).toEqual({
      ok: true,
      asked: 1,
      notified: 0,
    });
    expect(await notices(dee.id)).toHaveLength(1);

    for (const [i, slot] of slots.slice(0, SHIFT_MINIMUM).entries()) {
      const r = await signUpForShift({
        userId: dee.id,
        slotId: slot.id,
        now: BEFORE,
      });
      expect(r).toEqual({ ok: true, mine: i + 1 });
      expect((await nudge(dee.id))?.status).toBe(
        i + 1 < SHIFT_MINIMUM ? "pending" : "completed",
      );
    }
    expect((await notices(dee.id))[0]!.readAt).not.toBeNull();
    expect(await audits("shifts.asked")).toHaveLength(2);
  });
});

describe("AfrikaBurn volunteer shifts", () => {
  const h = useTestDb();
  const { people } = helpers(h);

  it("a member lists and removes only their own", async () => {
    const { dee, sam } = await people();
    const added = await addVolunteerShift({
      userId: dee.id,
      department: "Rangers",
      day: "2027-04-28",
      startMinute: 600,
      durationMinutes: 240,
    });
    expect(added.ok).toBe(true);
    if (!added.ok) return;
    expect(await listMyVolunteerShifts(dee.id, YEAR)).toEqual([
      {
        id: added.id,
        department: "Rangers",
        day: "2027-04-28",
        startMinute: 600,
        durationMinutes: 240,
      },
    ]);
    expect(await listMyVolunteerShifts(sam.id, YEAR)).toEqual([]);
    expect(
      await removeVolunteerShift({ userId: sam.id, id: added.id }),
    ).toEqual({
      ok: false,
      error: VOLUNTEER_SHIFT_GONE,
    });
    expect(
      await removeVolunteerShift({ userId: dee.id, id: added.id }),
    ).toEqual({
      ok: true,
    });
    expect(await listMyVolunteerShifts(dee.id, YEAR)).toEqual([]);
  });
});
