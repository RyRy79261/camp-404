import { eq } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";
import * as schema from "../schema";
import {
  NOT_AN_EVENT_AUTHOR,
  NOT_YOUR_EVENT_TEAM,
  PICK_YOUR_EVENT_TEAM,
  addCampCalendarEvent,
} from "../calendar-events";
import { useTestDb } from "./_harness";
import { makeMembership, makeUser } from "./_factories";

// Adding a camp calendar event on a real Postgres (PGlite). What matters: who
// may add for which team, that Google is never called for a refused author,
// and that the audit row lands with the event or not at all.

describe("addCampCalendarEvent", () => {
  const h = useTestDb();

  async function people() {
    const db = h.db();
    const captain = await makeUser(db, { rank: "captain" });
    const lead = await makeUser(db);
    await makeMembership(db, {
      userId: lead.id,
      team: "kitchen",
      isLead: true,
    });
    const member = await makeUser(db);
    await makeMembership(db, { userId: member.id, team: "kitchen" });
    return { captain, lead, member };
  }

  async function auditRows() {
    return h
      .db()
      .select()
      .from(schema.auditLog)
      .where(eq(schema.auditLog.action, "calendar.event_created"));
  }

  const event = {
    title: "Kitchen briefing",
    date: "2026-10-01",
    allDay: false,
  };

  it("lets a captain add a whole-camp event, and records it", async () => {
    const { captain } = await people();
    const create = vi.fn(async () => "google-1");
    const result = await addCampCalendarEvent({
      actorId: captain.id,
      team: null,
      ...event,
      title: "Build day",
      allDay: true,
      create,
    });
    expect(result).toEqual({ ok: true, eventId: "google-1" });
    expect(create).toHaveBeenCalledTimes(1);

    const rows = await auditRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      actorId: captain.id,
      action: "calendar.event_created",
      target: "calendar_event:google-1",
      metadata: {
        title: "Build day",
        team: null,
        date: "2026-10-01",
        allDay: true,
      },
    });
  });

  it("lets a lead add an event for their own team", async () => {
    const { lead } = await people();
    const create = vi.fn(async () => "google-2");
    expect(
      await addCampCalendarEvent({
        actorId: lead.id,
        team: "kitchen",
        ...event,
        create,
      }),
    ).toEqual({ ok: true, eventId: "google-2" });
    const rows = await auditRows();
    expect(rows.map((r) => r.metadata)).toEqual([
      { team: "kitchen", ...event },
    ]);
  });

  it("refuses a lead for another team or no team, and a member, without calling Google", async () => {
    const { lead, member } = await people();
    const create = vi.fn(async () => "never");

    expect(
      await addCampCalendarEvent({
        actorId: lead.id,
        team: "finance",
        ...event,
        create,
      }),
    ).toEqual({ ok: false, error: NOT_YOUR_EVENT_TEAM });
    expect(
      await addCampCalendarEvent({
        actorId: lead.id,
        team: null,
        ...event,
        create,
      }),
    ).toEqual({ ok: false, error: PICK_YOUR_EVENT_TEAM });
    expect(
      await addCampCalendarEvent({
        actorId: member.id,
        team: "kitchen",
        ...event,
        create,
      }),
    ).toEqual({ ok: false, error: NOT_AN_EVENT_AUTHOR });

    expect(create).not.toHaveBeenCalled();
    expect(await auditRows()).toHaveLength(0);
  });

  it("refuses a lead of last year's team: the rule reads this year's leads", async () => {
    const db = h.db();
    const former = await makeUser(db);
    await makeMembership(db, {
      userId: former.id,
      team: "kitchen",
      isLead: true,
      cycle: 1990,
    });
    const create = vi.fn(async () => "never");
    expect(
      await addCampCalendarEvent({
        actorId: former.id,
        team: "kitchen",
        ...event,
        create,
      }),
    ).toEqual({ ok: false, error: NOT_AN_EVENT_AUTHOR });
    expect(create).not.toHaveBeenCalled();
  });

  it("writes no audit row when Google refuses the event", async () => {
    const { captain } = await people();
    await expect(
      addCampCalendarEvent({
        actorId: captain.id,
        team: null,
        ...event,
        create: async () => {
          throw new Error("create 403");
        },
      }),
    ).rejects.toThrow("create 403");
    expect(await auditRows()).toHaveLength(0);
  });
});
