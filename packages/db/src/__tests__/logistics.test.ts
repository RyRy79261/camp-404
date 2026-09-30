import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { LOGISTICS_TEAM } from "@camp404/core";
import type { Team } from "@camp404/types";
import type { CampConfig } from "../camp-config";
import * as schema from "../schema";
import {
  NOT_A_LOGISTICS_EDITOR,
  PHASE_CHANGED,
  clearLogisticsPhase,
  listLogisticsPhases,
  markLogisticsCalendarSynced,
  setLogisticsPhase,
} from "../logistics";
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

describe("logistics phases", () => {
  const h = useTestDb();

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
