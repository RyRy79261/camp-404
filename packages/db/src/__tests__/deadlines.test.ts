import { readFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { LOGISTICS_TEAM } from "@camp404/core";
import type { Team } from "@camp404/types";
import type { CampConfig } from "../camp-config";
import {
  DEADLINE_CHANGED,
  NOT_A_DEADLINE_KEEPER,
  addDeadline,
  editDeadline,
  listDeadlines,
  markDeadlineCalendarSynced,
  removeDeadline,
  setDeadlineDone,
} from "../deadlines";
import { setFoundingYear } from "../cycle-rollover";
import * as schema from "../schema";
import { assignTeam, setLead } from "../team-memberships";
import { useTestDb } from "./_harness";
import { makeUser } from "./_factories";

// The year's AfrikaBurn deadlines (owner, 2026-09-30) on a real Postgres
// (PGlite): only a captain writes, checked inside the write, audited in the
// same transaction, each change a compare-and-set; a dated deadline claims
// ONE calendar event id for life; a removed one keeps its row only until its
// event is off the calendar. Plus migration 0080, which marks the phases
// already on the calendar for a rewrite with plain titles.

type DB = ReturnType<ReturnType<typeof useTestDb>["db"]>;

async function campYear(db: DB, year: number) {
  const cycles: CampConfig["cycles"] = [
    { year, startedAt: `${year}-01-01T00:00:00.000Z`, endedAt: null },
  ];
  await db
    .insert(schema.campSettings)
    .values({ id: true, config: { cycles } as never })
    .onConflictDoUpdate({
      target: schema.campSettings.id,
      set: { config: { cycles } as never },
    });
}

const REGISTRATION = {
  title: "Theme camp registration closes",
  dueDate: "2027-01-15",
  note: "Fill in the form on the AfrikaBurn site.",
};

describe("AfrikaBurn deadlines", () => {
  const h = useTestDb();

  async function leadOf(team: Team) {
    const user = await makeUser(h.db());
    await assignTeam({ userId: user.id, team });
    await setLead({ userId: user.id, team, isLead: true });
    return user;
  }

  async function audits(action: string) {
    return h
      .db()
      .select()
      .from(schema.auditLog)
      .where(eq(schema.auditLog.action, action));
  }

  it("a captain adds one, audited, claiming an event id only when it has a date", async () => {
    await campYear(h.db(), 2027);
    const captain = await makeUser(h.db(), { rank: "captain" });
    const dated = await addDeadline({
      ...REGISTRATION,
      actorId: captain.id,
      newEventId: "deadline001",
    });
    expect(dated.ok && dated.row).toMatchObject({
      cycle: 2027,
      title: REGISTRATION.title,
      dueDate: "2027-01-15",
      done: false,
      calendarEventId: "deadline001",
      version: 1,
    });
    const undated = await addDeadline({
      title: "DDT sale opens",
      dueDate: null,
      note: null,
      actorId: captain.id,
      newEventId: "deadline002",
    });
    expect(undated.ok && undated.row.calendarEventId).toBeNull();
    // Soonest first; no date last.
    expect((await listDeadlines()).map((d) => d.title)).toEqual([
      REGISTRATION.title,
      "DDT sale opens",
    ]);
    const rows = await audits("logistics.deadline_added");
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.actorId === captain.id)).toBe(true);
  });

  it("refuses a Transport and Logistics lead, a lead of another team and a member", async () => {
    await campYear(h.db(), 2027);
    const actors = [
      await leadOf(LOGISTICS_TEAM as Team),
      await leadOf("kitchen"),
      await makeUser(h.db()),
    ];
    for (const actor of actors) {
      expect(
        await addDeadline({
          ...REGISTRATION,
          actorId: actor.id,
          newEventId: "nope00001",
        }),
      ).toEqual({ ok: false, error: NOT_A_DEADLINE_KEEPER });
    }
    expect(await listDeadlines()).toEqual([]);
    expect(await audits("logistics.deadline_added")).toEqual([]);
  });

  it("refuses a captain demoted before the write", async () => {
    await campYear(h.db(), 2027);
    const captain = await makeUser(h.db(), { rank: "captain" });
    const added = await addDeadline({
      ...REGISTRATION,
      actorId: captain.id,
      newEventId: "deadline001",
    });
    await h
      .db()
      .update(schema.users)
      .set({ rank: "member" })
      .where(eq(schema.users.id, captain.id));
    expect(
      await setDeadlineDone({
        actorId: captain.id,
        id: added.ok ? added.row.id : "",
        done: true,
        expectedVersion: 1,
      }),
    ).toEqual({ ok: false, error: NOT_A_DEADLINE_KEEPER });
  });

  it("keeps the first event id on every change, and a stale version loses", async () => {
    await campYear(h.db(), 2027);
    const captain = await makeUser(h.db(), { rank: "captain" });
    const added = await addDeadline({
      title: "WAP applications",
      dueDate: null,
      note: null,
      actorId: captain.id,
      newEventId: "unused001",
    });
    if (!added.ok) throw new Error(added.error);
    const id = added.row.id;
    // The date becomes known: the deadline claims an id now.
    const dated = await editDeadline({
      id,
      title: "WAP applications",
      dueDate: "2027-03-01",
      note: null,
      expectedVersion: 1,
      actorId: captain.id,
      newEventId: "claimed001",
    });
    expect(dated.ok && dated.row).toMatchObject({
      version: 2,
      calendarEventId: "claimed001",
    });
    const moved = await editDeadline({
      id,
      title: "WAP applications",
      dueDate: "2027-03-02",
      note: null,
      expectedVersion: 2,
      actorId: captain.id,
      newEventId: "different1",
    });
    expect(moved.ok && moved.row.calendarEventId).toBe("claimed001");
    // Someone else's older screen.
    expect(
      await setDeadlineDone({
        id,
        done: true,
        expectedVersion: 2,
        actorId: captain.id,
      }),
    ).toEqual({ ok: false, error: DEADLINE_CHANGED });
    const ticked = await setDeadlineDone({
      id,
      done: true,
      expectedVersion: 3,
      actorId: captain.id,
    });
    expect(ticked.ok && ticked.row).toMatchObject({ done: true, version: 4 });
    expect(await audits("logistics.deadline_changed")).toHaveLength(2);
    expect(await audits("logistics.deadline_done")).toHaveLength(1);
  });

  it("removes one with no event at once; one with an event waits for Google", async () => {
    await campYear(h.db(), 2027);
    const captain = await makeUser(h.db(), { rank: "captain" });
    const undated = await addDeadline({
      title: "Grant applications",
      dueDate: null,
      note: null,
      actorId: captain.id,
      newEventId: "unused001",
    });
    const dated = await addDeadline({
      ...REGISTRATION,
      actorId: captain.id,
      newEventId: "deadline001",
    });
    if (!undated.ok || !dated.ok) throw new Error("add failed");

    await removeDeadline({
      id: undated.row.id,
      expectedVersion: 1,
      actorId: captain.id,
    });
    const gone = await removeDeadline({
      id: dated.row.id,
      expectedVersion: 1,
      actorId: captain.id,
    });
    expect(gone.ok && gone.row).toMatchObject({
      version: 2,
      calendarEventId: "deadline001",
    });
    expect(gone.ok && gone.row.removedAt).not.toBeNull();
    // Members see neither; the catch-up still sees the one on Google.
    expect(await listDeadlines()).toEqual([]);
    expect(
      (await listDeadlines(2027, { withRemoved: true })).map((d) => d.id),
    ).toEqual([dated.row.id]);
    // A removed deadline cannot be changed.
    expect(
      await setDeadlineDone({
        id: dated.row.id,
        done: true,
        expectedVersion: 2,
        actorId: captain.id,
      }),
    ).toEqual({ ok: false, error: DEADLINE_CHANGED });
    // Google took the event off: the row goes for good.
    expect(
      await markDeadlineCalendarSynced({
        id: dated.row.id,
        version: 2,
        removed: true,
      }),
    ).toBe(true);
    expect(await listDeadlines(2027, { withRemoved: true })).toEqual([]);
    expect(await audits("logistics.deadline_removed")).toHaveLength(2);
  });

  it("marks the calendar synced only for the version it wrote", async () => {
    await campYear(h.db(), 2027);
    const captain = await makeUser(h.db(), { rank: "captain" });
    const added = await addDeadline({
      ...REGISTRATION,
      actorId: captain.id,
      newEventId: "deadline001",
    });
    if (!added.ok) throw new Error(added.error);
    await setDeadlineDone({
      id: added.row.id,
      done: true,
      expectedVersion: 1,
      actorId: captain.id,
    });
    expect(
      await markDeadlineCalendarSynced({
        id: added.row.id,
        version: 1,
        removed: false,
      }),
    ).toBe(false);
    expect(
      await markDeadlineCalendarSynced({
        id: added.row.id,
        version: 2,
        removed: false,
      }),
    ).toBe(true);
    expect((await listDeadlines())[0]!.calendarSyncedVersion).toBe(2);
  });

  it("is adopted by the founding year, with the logistics days and answers", async () => {
    const captain = await makeUser(h.db(), { rank: "captain" });
    const member = await makeUser(h.db());
    // No year yet: written under the sentinel.
    const added = await addDeadline({
      ...REGISTRATION,
      actorId: captain.id,
      newEventId: "deadline001",
    });
    expect(added.ok && added.row.cycle).toBe(1);
    await h.db().insert(schema.logisticsPhases).values({
      cycle: 1,
      phase: "pack",
      startDate: "2027-04-20",
      endDate: "2027-04-20",
    });
    await h.db().insert(schema.logisticsAttendance).values({
      cycle: 1,
      phase: "pack",
      userId: member.id,
      answer: "going",
    });
    expect(
      (await setFoundingYear({ year: 2027, actorUserId: captain.id })).ok,
    ).toBe(true);
    expect((await listDeadlines(2027)).map((d) => d.title)).toEqual([
      REGISTRATION.title,
    ]);
    const [phase] = await h.db().select().from(schema.logisticsPhases);
    const [answer] = await h.db().select().from(schema.logisticsAttendance);
    expect(phase!.cycle).toBe(2027);
    expect(answer!.cycle).toBe(2027);
  });
});

const PLAIN_TITLES_SQL = readFileSync(
  new URL("../../migrations/0080_logistics_plain_titles.sql", import.meta.url),
  "utf8",
);

describe("0080_logistics_plain_titles", () => {
  const h = useTestDb();

  it("marks every phase on the calendar for a rewrite, and only those, twice over", async () => {
    await h
      .db()
      .insert(schema.logisticsPhases)
      .values([
        // On the calendar under the old title.
        {
          cycle: 2027,
          phase: "build",
          startDate: "2027-04-24",
          endDate: "2027-04-26",
          calendarEventId: "claimed001",
          calendarSyncedVersion: 3,
          version: 3,
        },
        // Cleared, and its event already taken off.
        {
          cycle: 2027,
          phase: "pack",
          calendarEventId: null,
          calendarSyncedVersion: 2,
          version: 2,
        },
      ]);
    for (let run = 0; run < 2; run += 1) {
      await h.client().exec(PLAIN_TITLES_SQL);
      const rows = await h
        .db()
        .select({
          phase: schema.logisticsPhases.phase,
          eventId: schema.logisticsPhases.calendarEventId,
          synced: schema.logisticsPhases.calendarSyncedVersion,
        })
        .from(schema.logisticsPhases)
        .orderBy(schema.logisticsPhases.phase);
      expect(rows).toEqual([
        { phase: "pack", eventId: null, synced: 2 },
        // The same event id: the catch-up updates it in place.
        { phase: "build", eventId: "claimed001", synced: null },
      ]);
    }
  });
});
