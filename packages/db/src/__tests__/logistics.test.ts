import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import {
  ATTENDANCE_ACTION_KEY,
  ATTENDANCE_REF_TYPE,
  LOGISTICS_TEAM,
} from "@camp404/core";
import type { ParticipationStatus, Team } from "@camp404/types";
import type { CampConfig } from "../camp-config";
import * as schema from "../schema";
import {
  ATTENDANCE_CHANGED,
  ATTENDANCE_NOT_A_MEMBER,
  NOT_AN_ATTENDANCE_ASKER,
  NOT_A_LOGISTICS_EDITOR,
  PHASE_CHANGED,
  askForAttendance,
  attendanceClosed,
  clearLogisticsPhase,
  listAttendance,
  listLogisticsPhases,
  markLogisticsCalendarSynced,
  setLogisticsPhase,
  setMyAttendance,
} from "../logistics";
import { sanitiseAccount } from "../account";
import { assignTeam, setLead } from "../team-memberships";
import { useTestDb } from "./_harness";
import { makeUser } from "./_factories";

// The logistics calendar (#247) on a real Postgres (PGlite). What matters:
// only a captain or a Transport and Logistics lead writes, checked inside the
// write; a lead of another team and a member are refused; each write is a
// compare-and-set and audited in the same transaction; and a phase claims ONE
// Google event id for life, so re-saving never makes a second event.

type DB = ReturnType<ReturnType<typeof useTestDb>["db"]>;

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

const BUILD = {
  phase: "build" as const,
  startDate: "2027-04-24",
  endDate: "2027-04-26",
  place: "On site",
  note: null,
};

type Harness = ReturnType<typeof useTestDb>;

/** A captain, a lead of each of two teams and a member; the audit rows. */
function helpers(h: Harness) {
  async function leadOf(team: Team) {
    const user = await makeUser(h.db());
    await assignTeam({ userId: user.id, team });
    expect(await setLead({ userId: user.id, team, isLead: true })).toEqual({
      ok: true,
      changed: true,
    });
    return user;
  }

  async function people() {
    await campYear(h.db(), 2027);
    const captain = await makeUser(h.db(), { rank: "captain" });
    const logisticsLead = await leadOf(LOGISTICS_TEAM as Team);
    const kitchenLead = await leadOf("kitchen");
    const member = await makeUser(h.db());
    return { captain, logisticsLead, kitchenLead, member };
  }

  async function audits(action: string) {
    return h
      .db()
      .select()
      .from(schema.auditLog)
      .where(eq(schema.auditLog.action, action));
  }

  return { people, audits };
}

describe("logistics phases", () => {
  const h = useTestDb();

  const { people, audits } = helpers(h);

  it("lets a captain and a Transport and Logistics lead set the days, audited", async () => {
    const { captain, logisticsLead } = await people();
    const first = await setLogisticsPhase({
      ...BUILD,
      actorId: logisticsLead.id,
      expectedVersion: 0,
      newEventId: "event0001",
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.row).toMatchObject({
      cycle: 2027,
      phase: "build",
      startDate: "2027-04-24",
      endDate: "2027-04-26",
      place: "On site",
      calendarEventId: "event0001",
      calendarSyncedVersion: null,
      version: 1,
    });

    const second = await setLogisticsPhase({
      ...BUILD,
      endDate: "2027-04-27",
      actorId: captain.id,
      expectedVersion: 1,
      newEventId: "event0002",
    });
    expect(second.ok && second.row.version).toBe(2);

    const rows = await audits("logistics.phase_set");
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.actorId).sort()).toEqual(
      [captain.id, logisticsLead.id].sort(),
    );
    expect(rows[0]!.target).toBe("logistics_phase:2027:build");
  });

  it("keeps the first Google event id on every later save", async () => {
    const { captain } = await people();
    await setLogisticsPhase({
      ...BUILD,
      actorId: captain.id,
      expectedVersion: 0,
      newEventId: "keepme001",
    });
    const again = await setLogisticsPhase({
      ...BUILD,
      startDate: "2027-04-23",
      actorId: captain.id,
      expectedVersion: 1,
      newEventId: "different1",
    });
    expect(again.ok && again.row.calendarEventId).toBe("keepme001");
    const phases = await listLogisticsPhases();
    expect(phases).toHaveLength(1);
    expect(phases[0]!.startDate).toBe("2027-04-23");
  });

  it("refuses a lead of another team and a plain member, and writes nothing", async () => {
    const { kitchenLead, member } = await people();
    for (const actor of [kitchenLead, member]) {
      expect(
        await setLogisticsPhase({
          ...BUILD,
          actorId: actor.id,
          expectedVersion: 0,
          newEventId: "nope00001",
        }),
      ).toEqual({ ok: false, error: NOT_A_LOGISTICS_EDITOR });
    }
    expect(await listLogisticsPhases()).toEqual([]);
    expect(await audits("logistics.phase_set")).toHaveLength(0);
  });

  it("refuses a lead who lost the role before the write", async () => {
    const { logisticsLead } = await people();
    await setLead({
      userId: logisticsLead.id,
      team: LOGISTICS_TEAM as Team,
      isLead: false,
    });
    expect(
      await setLogisticsPhase({
        ...BUILD,
        actorId: logisticsLead.id,
        expectedVersion: 0,
        newEventId: "late00001",
      }),
    ).toEqual({ ok: false, error: NOT_A_LOGISTICS_EDITOR });
  });

  it("says so when someone saved first, on insert and on update", async () => {
    const { captain, logisticsLead } = await people();
    await setLogisticsPhase({
      ...BUILD,
      actorId: captain.id,
      expectedVersion: 0,
      newEventId: "first0001",
    });
    // A second editor who also saw no row.
    expect(
      await setLogisticsPhase({
        ...BUILD,
        actorId: logisticsLead.id,
        expectedVersion: 0,
        newEventId: "second001",
      }),
    ).toEqual({ ok: false, error: PHASE_CHANGED });
    // An editor who saw version 1 after it moved on.
    await setLogisticsPhase({
      ...BUILD,
      actorId: captain.id,
      expectedVersion: 1,
      newEventId: "x00000001",
    });
    expect(
      await setLogisticsPhase({
        ...BUILD,
        actorId: logisticsLead.id,
        expectedVersion: 1,
        newEventId: "x00000002",
      }),
    ).toEqual({ ok: false, error: PHASE_CHANGED });
    const [row] = await listLogisticsPhases();
    expect(row!.calendarEventId).toBe("first0001");
    expect(await audits("logistics.phase_set")).toHaveLength(2);
  });

  it("clears the days but keeps the event id until the calendar lets go", async () => {
    const { captain, kitchenLead } = await people();
    await setLogisticsPhase({
      ...BUILD,
      actorId: captain.id,
      expectedVersion: 0,
      newEventId: "clear0001",
    });
    expect(
      await clearLogisticsPhase({
        actorId: kitchenLead.id,
        phase: "build",
        expectedVersion: 1,
      }),
    ).toEqual({ ok: false, error: NOT_A_LOGISTICS_EDITOR });

    const cleared = await clearLogisticsPhase({
      actorId: captain.id,
      phase: "build",
      expectedVersion: 1,
    });
    expect(cleared.ok && cleared.row).toMatchObject({
      startDate: null,
      endDate: null,
      place: null,
      calendarEventId: "clear0001",
      version: 2,
    });
    expect(await audits("logistics.phase_cleared")).toHaveLength(1);

    // The event came off Google: the phase lets go of the id.
    expect(
      await markLogisticsCalendarSynced({
        cycle: 2027,
        phase: "build",
        version: 2,
        removed: true,
      }),
    ).toBe(true);
    const [row] = await listLogisticsPhases();
    expect(row).toMatchObject({
      calendarEventId: null,
      calendarSyncedVersion: 2,
    });

    // New days claim a new event.
    const back = await setLogisticsPhase({
      ...BUILD,
      actorId: captain.id,
      expectedVersion: 2,
      newEventId: "fresh0001",
    });
    expect(back.ok && back.row.calendarEventId).toBe("fresh0001");
  });

  it("marks the calendar in step only for the version it wrote", async () => {
    const { captain } = await people();
    await setLogisticsPhase({
      ...BUILD,
      actorId: captain.id,
      expectedVersion: 0,
      newEventId: "sync00001",
    });
    await setLogisticsPhase({
      ...BUILD,
      endDate: "2027-04-28",
      actorId: captain.id,
      expectedVersion: 1,
      newEventId: "sync00002",
    });
    // A step for version 1 that finished after version 2 was saved.
    expect(
      await markLogisticsCalendarSynced({
        cycle: 2027,
        phase: "build",
        version: 1,
        removed: false,
      }),
    ).toBe(false);
    expect(
      await markLogisticsCalendarSynced({
        cycle: 2027,
        phase: "build",
        version: 2,
        removed: false,
      }),
    ).toBe(true);
    const [row] = await h
      .db()
      .select()
      .from(schema.logisticsPhases)
      .where(
        and(
          eq(schema.logisticsPhases.cycle, 2027),
          eq(schema.logisticsPhases.phase, "build"),
        ),
      );
    expect(row).toMatchObject({
      calendarSyncedVersion: 2,
      calendarEventId: "sync00001",
    });
  });

  it("lists the year's phases in the camp's order", async () => {
    const { captain } = await people();
    for (const phase of ["unpack", "pack", "burn"] as const) {
      await setLogisticsPhase({
        ...BUILD,
        phase,
        actorId: captain.id,
        expectedVersion: 0,
        newEventId: `order${phase}`,
      });
    }
    expect((await listLogisticsPhases()).map((p) => p.phase)).toEqual([
      "pack",
      "burn",
      "unpack",
    ]);
    expect(await listLogisticsPhases(2026)).toEqual([]);
  });

  it("refuses an end before the start in the database too", async () => {
    await campYear(h.db(), 2027);
    await expect(
      h.db().insert(schema.logisticsPhases).values({
        cycle: 2027,
        phase: "pack",
        startDate: "2027-04-20",
        endDate: "2027-04-19",
      }),
    ).rejects.toThrow();
    await expect(
      h.db().insert(schema.logisticsPhases).values({
        cycle: 2027,
        phase: "pack",
        startDate: "2027-04-20",
        endDate: null,
      }),
    ).rejects.toThrow();
  });
});

// --- Attendance ----------------------------------------------------------------
// Every member who is coming is asked going / maybe / can't for Pack, Build,
// Strike and Unpack. A member answers only for themselves, until the phase
// starts, as a compare-and-set; a captain's "Ask everyone" is the shared
// nudge (a non-blocking required action and one notice), never a block.

describe("logistics attendance", () => {
  const h = useTestDb();
  const { people, audits } = helpers(h);
  const BEFORE = new Date("2027-04-01T08:00:00Z");
  const PHASES = ["pack", "build", "strike", "unpack"] as const;

  async function place(userId: string, status: ParticipationStatus) {
    await h
      .db()
      .insert(schema.campParticipations)
      .values({ userId, cycle: 2027, status, intent: "yes" });
  }

  async function nudge(userId: string) {
    const [row] = await h
      .db()
      .select()
      .from(schema.requiredActions)
      .where(
        and(
          eq(schema.requiredActions.userId, userId),
          eq(schema.requiredActions.actionKey, ATTENDANCE_ACTION_KEY),
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
          eq(schema.notificationDeliveries.refType, ATTENDANCE_REF_TYPE),
        ),
      );
  }

  it("a member answers for themselves; a stale answer loses and says so", async () => {
    await campYear(h.db(), 2027);
    const dee = await makeUser(h.db(), { displayName: "Dee" });
    const first = await setMyAttendance({
      userId: dee.id,
      phase: "pack",
      answer: "maybe",
      expected: null,
      now: BEFORE,
    });
    expect(first).toEqual({ ok: true, answer: "maybe" });
    expect(
      await setMyAttendance({
        userId: dee.id,
        phase: "pack",
        answer: "going",
        expected: null,
        now: BEFORE,
      }),
    ).toEqual({ ok: false, error: ATTENDANCE_CHANGED });
    expect(
      await setMyAttendance({
        userId: dee.id,
        phase: "pack",
        answer: "cant",
        expected: "going",
        now: BEFORE,
      }),
    ).toEqual({ ok: false, error: ATTENDANCE_CHANGED });
    expect(
      await setMyAttendance({
        userId: dee.id,
        phase: "pack",
        answer: "going",
        expected: "maybe",
        now: BEFORE,
      }),
    ).toEqual({ ok: true, answer: "going" });
    const read = await listAttendance(2027);
    expect(read.entries).toEqual([
      { phase: "pack", userId: dee.id, name: "Dee", answer: "going" },
    ]);
  });

  it("closes a phase's answers on its first day", async () => {
    const { captain } = await people();
    const dee = await makeUser(h.db());
    await setLogisticsPhase({
      ...BUILD,
      actorId: captain.id,
      expectedVersion: 0,
      newEventId: "event0001",
    });
    const args = {
      userId: dee.id,
      phase: "build" as const,
      answer: "going" as const,
      expected: null,
    };
    // 2027-04-24 00:30 in camp time is already the first day.
    expect(
      await setMyAttendance({
        ...args,
        now: new Date("2027-04-23T22:30:00Z"),
      }),
    ).toEqual({ ok: false, error: attendanceClosed("build") });
    expect(
      await setMyAttendance({
        ...args,
        now: new Date("2027-04-23T21:30:00Z"),
      }),
    ).toEqual({ ok: true, answer: "going" });
  });

  it("refuses travel and the burn, which nobody answers, in the database", async () => {
    await campYear(h.db(), 2027);
    const dee = await makeUser(h.db());
    await expect(
      h.db().insert(schema.logisticsAttendance).values({
        cycle: 2027,
        phase: "burn",
        userId: dee.id,
        answer: "going",
      }),
    ).rejects.toThrow();
  });

  it("refuses a member who is not approved", async () => {
    await campYear(h.db(), 2027);
    const pending = await makeUser(h.db(), { approvalStatus: "pending" });
    expect(
      await setMyAttendance({
        userId: pending.id,
        phase: "pack",
        answer: "going",
        expected: null,
        now: BEFORE,
      }),
    ).toEqual({ ok: false, error: ATTENDANCE_NOT_A_MEMBER });
  });

  it("asks who is coming and has not answered; again, no second notice; answering all closes it", async () => {
    const { captain } = await people();
    const yes = await makeUser(h.db(), { displayName: "Yes" });
    const accepted = await makeUser(h.db(), { displayName: "Acc" });
    const maybe = await makeUser(h.db(), { displayName: "Maybe" });
    const waitlisted = await makeUser(h.db(), { displayName: "Wait" });
    await place(yes.id, "applied");
    await place(accepted.id, "accepted");
    await place(maybe.id, "maybe");
    await place(waitlisted.id, "waitlisted");

    expect(
      await askForAttendance({ actorId: captain.id, now: BEFORE }),
    ).toEqual({ ok: true, asked: 2, notified: 2 });
    for (const u of [yes, accepted]) {
      expect(await nudge(u.id)).toMatchObject({
        status: "pending",
        blocking: false,
      });
      expect(await notices(u.id)).toHaveLength(1);
    }
    for (const u of [maybe, waitlisted]) {
      expect(await nudge(u.id)).toBeUndefined();
    }
    const audit = await audits("logistics.attendance_asked");
    expect(audit).toHaveLength(1);
    expect(audit[0]!.metadata).toMatchObject({ asked: 2, notified: 2 });

    // Pressed again: the same two, and no second notice while unread.
    expect(
      await askForAttendance({ actorId: captain.id, now: BEFORE }),
    ).toEqual({ ok: true, asked: 2, notified: 0 });
    expect(await notices(yes.id)).toHaveLength(1);

    // Yes answers three of four: still asked. The fourth closes it.
    for (const [i, phase] of PHASES.entries()) {
      await setMyAttendance({
        userId: yes.id,
        phase,
        answer: "maybe",
        expected: null,
        now: BEFORE,
      });
      expect((await nudge(yes.id))!.status).toBe(
        i < PHASES.length - 1 ? "pending" : "completed",
      );
    }
    expect((await notices(yes.id))[0]!.readAt).not.toBeNull();
    expect(
      await askForAttendance({ actorId: captain.id, now: BEFORE }),
    ).toEqual({ ok: true, asked: 1, notified: 0 });
  });

  it("refuses the ask from a Transport and Logistics lead, a lead of another team and a member", async () => {
    const { logisticsLead, kitchenLead, member } = await people();
    await place(member.id, "applied");
    for (const actor of [logisticsLead, kitchenLead, member]) {
      expect(
        await askForAttendance({ actorId: actor.id, now: BEFORE }),
      ).toEqual({ ok: false, error: NOT_AN_ATTENDANCE_ASKER });
    }
    expect(await nudge(member.id)).toBeUndefined();
  });

  it("lists who is coming, and leaves out anyone erased or not approved", async () => {
    await campYear(h.db(), 2027);
    const dee = await makeUser(h.db(), { displayName: "Dee" });
    const gone = await makeUser(h.db(), { sanitised: true });
    const pending = await makeUser(h.db(), { approvalStatus: "pending" });
    for (const u of [dee, gone, pending]) await place(u.id, "accepted");
    expect((await listAttendance(2027)).coming).toEqual([
      { userId: dee.id, name: "Dee" },
    ]);
  });

  it("forgets an erased member's answers", async () => {
    await campYear(h.db(), 2027);
    const dee = await makeUser(h.db());
    const kept = await makeUser(h.db());
    for (const u of [dee, kept]) {
      await setMyAttendance({
        userId: u.id,
        phase: "pack",
        answer: "going",
        expected: null,
        now: BEFORE,
      });
    }
    expect((await sanitiseAccount(dee.id)).ok).toBe(true);
    const rows = await h.db().select().from(schema.logisticsAttendance);
    expect(rows.map((r) => r.userId)).toEqual([kept.id]);
  });
});
