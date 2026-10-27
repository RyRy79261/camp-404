import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import {
  MEETING_HAS_MINUTES,
  NOT_AN_EVENT_MAKER,
  NOT_YOUR_EVENT_TEAM,
  WHOLE_CAMP_EVENTS_ARE_CAPTAINS,
} from "@camp404/core";
import * as schema from "../schema";
import {
  EVENT_CHANGED,
  EVENT_GONE,
  createCampEvent,
  editCampEvent,
  getCampEvent,
  getCampEventRow,
  linkUnlinkedMeetingNotes,
  listCampEvents,
  listCampEventsToSync,
  markCampEventCalendarSynced,
  PICK_SOMEONE,
  removeCampEvent,
  type CampEventFields,
} from "../camp-events";
import {
  MINUTES_STARTED,
  createMeetingNote,
  getMeetingNoteByEvent,
  listMeetingNotes,
} from "../meeting-notes";
import { useTestDb } from "./_harness";
import { makeMembership, makeUser } from "./_factories";

// The Calendar's own events and meetings on a real Postgres (PGlite). What
// matters: who may make, change and remove which team's events (captains any,
// a lead only a team they lead, whole camp captains only), checked inside the
// write; every change a compare-and-set with its audit row; a meeting's note
// made and kept in step with its event; a meeting with minutes never removed;
// and the mirror's mark a compare-and-set on the version.

function fields(overrides: Partial<CampEventFields> = {}): CampEventFields {
  return {
    team: "kitchen",
    title: "Kitchen planning",
    allDay: false,
    startDate: "2026-10-15",
    endDate: "2026-10-15",
    startTime: "19:00",
    endTime: "20:30",
    place: "Online",
    description: "The week's menu.",
    ...overrides,
  };
}

let serial = 0;
const newId = () => `evt${++serial}${"0".repeat(20)}`;

describe("camp events", () => {
  const h = useTestDb();

  async function people() {
    const db = h.db();
    const captain = await makeUser(db, { rank: "captain" });
    const lead = await makeUser(db, { displayName: "Kitchen Lead" });
    await makeMembership(db, {
      userId: lead.id,
      team: "kitchen",
      isLead: true,
    });
    const member = await makeUser(db, { displayName: "Kitchen Crew" });
    await makeMembership(db, { userId: member.id, team: "kitchen" });
    return { captain, lead, member };
  }

  async function audits(action: string) {
    return h
      .db()
      .select()
      .from(schema.auditLog)
      .where(eq(schema.auditLog.action, action));
  }

  describe("createCampEvent", () => {
    it("lets a lead make a meeting for their team, with its note and an audit row", async () => {
      const { lead } = await people();
      const id = newId();
      const made = await createCampEvent({
        actorId: lead.id,
        kind: "meeting",
        agenda: "1. Menu",
        newEventId: id,
        ...fields(),
      });
      expect(made.ok).toBe(true);
      if (!made.ok) return;
      expect(made.row.calendarEventId).toBe(id);
      expect(made.row.calendarSyncedVersion).toBeNull();
      expect(made.noteId).not.toBeNull();

      const note = await getMeetingNoteByEvent(id);
      expect(note?.agenda).toBe("1. Menu");
      expect(note?.team).toBe("kitchen");
      expect(note?.heldAt.toISOString()).toBe("2026-10-15T17:00:00.000Z");

      const rows = await audits("calendar.event_created");
      expect(rows).toHaveLength(1);
      expect(rows[0]!.target).toBe(`calendar_event:${id}`);
      expect(rows[0]!.metadata).toMatchObject({
        title: "Kitchen planning",
        kind: "meeting",
      });
    });

    it("makes an event added with an agenda a meeting, its note linked with the same agenda", async () => {
      const { lead } = await people();
      const id = newId();
      const made = await createCampEvent({
        actorId: lead.id,
        kind: "event",
        agenda: "1. Shade budget\n2. Dome trailer",
        newEventId: id,
        ...fields({ description: "1. Shade budget\n2. Dome trailer" }),
      });
      if (!made.ok) throw new Error(made.error);
      expect(made.row.kind).toBe("meeting");
      expect(made.row.description).toBe("1. Shade budget\n2. Dome trailer");
      const note = await getMeetingNoteByEvent(id);
      expect(note).toMatchObject({
        id: made.noteId,
        team: "kitchen",
        title: "Kitchen planning",
        calendarEventId: id,
        calendarEventTitle: "Kitchen planning",
        agenda: "1. Shade budget\n2. Dome trailer",
      });
      expect(
        (await audits("calendar.event_created"))[0]!.metadata,
      ).toMatchObject({ kind: "meeting" });
    });

    it("makes no note for an event, and keeps an all-day event's days", async () => {
      const { captain } = await people();
      const made = await createCampEvent({
        actorId: captain.id,
        kind: "event",
        agenda: "  ",
        newEventId: newId(),
        ...fields({
          team: null,
          allDay: true,
          startDate: "2026-10-23",
          endDate: "2026-10-25",
          startTime: "18:00",
          endTime: "19:00",
        }),
      });
      expect(made.ok).toBe(true);
      if (!made.ok) return;
      expect(made.noteId).toBeNull();
      expect(made.row).toMatchObject({
        endDate: "2026-10-25",
        startTime: null,
        endTime: null,
      });
      expect(await h.db().select().from(schema.meetingNotes)).toHaveLength(0);
    });

    it("refuses a plain member, a lead on another team and a lead on the whole camp, writing nothing", async () => {
      const { lead, member } = await people();
      const base = { kind: "event" as const, agenda: "" };
      expect(
        await createCampEvent({
          ...base,
          actorId: member.id,
          newEventId: newId(),
          ...fields(),
        }),
      ).toEqual({ ok: false, error: NOT_AN_EVENT_MAKER });
      expect(
        await createCampEvent({
          ...base,
          actorId: lead.id,
          newEventId: newId(),
          ...fields({ team: "finance" }),
        }),
      ).toEqual({ ok: false, error: NOT_YOUR_EVENT_TEAM });
      expect(
        await createCampEvent({
          ...base,
          actorId: lead.id,
          newEventId: newId(),
          ...fields({ team: null }),
        }),
      ).toEqual({ ok: false, error: WHOLE_CAMP_EVENTS_ARE_CAPTAINS });
      expect(await h.db().select().from(schema.campEvents)).toHaveLength(0);
      expect(await audits("calendar.event_created")).toHaveLength(0);
    });
  });

  describe("editCampEvent", () => {
    it("changes the event over its version, moves its meeting's note with it, and audits", async () => {
      const { captain } = await people();
      const id = newId();
      await createCampEvent({
        actorId: captain.id,
        kind: "meeting",
        agenda: "",
        newEventId: id,
        ...fields(),
      });
      const changed = await editCampEvent({
        actorId: captain.id,
        calendarEventId: id,
        expectedVersion: 1,
        ...fields({ title: "Menu night", team: "finance", startTime: "18:00" }),
      });
      expect(changed.ok).toBe(true);
      if (!changed.ok) return;
      expect(changed.row.version).toBe(2);
      const note = await getMeetingNoteByEvent(id);
      expect(note).toMatchObject({ title: "Menu night", team: "finance" });
      expect(note?.heldAt.toISOString()).toBe("2026-10-15T16:00:00.000Z");
      const rows = await audits("calendar.event_changed");
      expect(rows[0]!.metadata).toMatchObject({
        team: "finance",
        fromTeam: "kitchen",
      });

      // The version the form opened has moved on: refused, nothing changes.
      expect(
        await editCampEvent({
          actorId: captain.id,
          calendarEventId: id,
          expectedVersion: 1,
          ...fields({ title: "Stale" }),
        }),
      ).toEqual({ ok: false, error: EVENT_CHANGED });
      expect((await getCampEvent(id))?.title).toBe("Menu night");
    });

    it("refuses a lead moving their event to a team they do not lead, and a lead of another team", async () => {
      const { lead } = await people();
      const other = await makeUser(h.db());
      await makeMembership(h.db(), {
        userId: other.id,
        team: "finance",
        isLead: true,
      });
      const id = newId();
      await createCampEvent({
        actorId: lead.id,
        kind: "event",
        agenda: "",
        newEventId: id,
        ...fields(),
      });
      expect(
        await editCampEvent({
          actorId: lead.id,
          calendarEventId: id,
          expectedVersion: 1,
          ...fields({ team: "finance" }),
        }),
      ).toEqual({ ok: false, error: NOT_YOUR_EVENT_TEAM });
      expect(
        await editCampEvent({
          actorId: other.id,
          calendarEventId: id,
          expectedVersion: 1,
          ...fields({ team: "finance" }),
        }),
      ).toEqual({ ok: false, error: NOT_YOUR_EVENT_TEAM });
      expect(
        await editCampEvent({
          actorId: lead.id,
          calendarEventId: "nope",
          expectedVersion: 1,
          ...fields(),
        }),
      ).toEqual({ ok: false, error: EVENT_GONE });
    });
  });

  describe("removeCampEvent", () => {
    it("keeps a meeting with minutes, and takes one with only an agenda off with its note", async () => {
      const { captain, member } = await people();
      const kept = newId();
      await createCampEvent({
        actorId: captain.id,
        kind: "meeting",
        agenda: "1. Menu",
        newEventId: kept,
        ...fields(),
      });
      const note = await getMeetingNoteByEvent(kept);
      await h
        .db()
        .update(schema.meetingNotes)
        .set({ notes: "We met." })
        .where(eq(schema.meetingNotes.id, note!.id));
      expect(
        await removeCampEvent({
          actorId: captain.id,
          calendarEventId: kept,
          expectedVersion: 1,
        }),
      ).toEqual({ ok: false, error: MEETING_HAS_MINUTES });

      const gone = newId();
      await createCampEvent({
        actorId: captain.id,
        kind: "meeting",
        agenda: "1. Menu",
        newEventId: gone,
        ...fields(),
      });
      // A plain member of the team writes minutes, but does not remove events.
      expect(
        await removeCampEvent({
          actorId: member.id,
          calendarEventId: gone,
          expectedVersion: 1,
        }),
      ).toEqual({ ok: false, error: NOT_AN_EVENT_MAKER });
      const removed = await removeCampEvent({
        actorId: captain.id,
        calendarEventId: gone,
        expectedVersion: 1,
      });
      expect(removed.ok).toBe(true);
      if (!removed.ok) return;
      expect(removed.row.removedAt).not.toBeNull();
      expect(await getMeetingNoteByEvent(gone)).toBeNull();
      expect(await getCampEvent(gone)).toBeNull();
      expect(await audits("calendar.event_removed")).toHaveLength(1);

      // The row waits for Google (the mirror still reads it by id); the mark
      // takes it away.
      expect((await getCampEventRow(removed.row.id))?.removedAt).not.toBeNull();
      expect(
        (await listCampEventsToSync()).some((r) => r.calendarEventId === gone),
      ).toBe(true);
      expect(
        await markCampEventCalendarSynced({
          id: removed.row.id,
          version: removed.row.version,
          removed: true,
        }),
      ).toBe(true);
      expect(await getCampEventRow(removed.row.id)).toBeNull();
      expect(
        await listCampEvents({
          from: "2026-10-01",
          to: "2026-10-31",
          withRemoved: true,
        }),
      ).toHaveLength(1);
    });
  });

  it("counts a decision alone, or who came alone, as minutes that keep the meeting", async () => {
    const { captain, member } = await people();
    for (const fill of ["decision", "attendee"] as const) {
      const id = newId();
      await createCampEvent({
        actorId: captain.id,
        kind: "meeting",
        agenda: "",
        newEventId: id,
        ...fields(),
      });
      const note = await getMeetingNoteByEvent(id);
      if (fill === "decision") {
        await h
          .db()
          .insert(schema.meetingNoteDecisions)
          .values({ noteId: note!.id, position: 0, text: "Oats" });
      } else {
        await h
          .db()
          .insert(schema.meetingNoteAttendees)
          .values({ noteId: note!.id, userId: member.id });
      }
      expect(
        await removeCampEvent({
          actorId: captain.id,
          calendarEventId: id,
          expectedVersion: 1,
        }),
      ).toEqual({ ok: false, error: MEETING_HAS_MINUTES });
      expect(await getMeetingNoteByEvent(id)).not.toBeNull();
    }
  });

  describe("the mirror and the reads", () => {
    it("marks only the version Google matched, and lists what touches a range", async () => {
      const { captain } = await people();
      const id = newId();
      const made = await createCampEvent({
        actorId: captain.id,
        kind: "event",
        agenda: "",
        newEventId: id,
        ...fields({
          allDay: true,
          startDate: "2026-09-30",
          endDate: "2026-10-02",
          startTime: null,
          endTime: null,
        }),
      });
      if (!made.ok) throw new Error(made.error);
      await editCampEvent({
        actorId: captain.id,
        calendarEventId: id,
        expectedVersion: 1,
        ...fields({
          allDay: true,
          startDate: "2026-09-30",
          endDate: "2026-10-02",
          startTime: null,
          endTime: null,
          title: "Workshop clean-out",
        }),
      });
      // A late step for version 1 does not mark version 2 as done.
      expect(
        await markCampEventCalendarSynced({
          id: made.row.id,
          version: 1,
          removed: false,
        }),
      ).toBe(false);
      expect(await listCampEventsToSync()).toHaveLength(1);
      expect(
        await markCampEventCalendarSynced({
          id: made.row.id,
          version: 2,
          removed: false,
        }),
      ).toBe(true);
      expect(await listCampEventsToSync()).toHaveLength(0);

      // Touching October from the end of September counts; November does not.
      expect(
        await listCampEvents({ from: "2026-10-01", to: "2026-10-31" }),
      ).toHaveLength(1);
      expect(
        await listCampEvents({ from: "2026-11-01", to: "2026-11-30" }),
      ).toHaveLength(0);
    });
  });

  describe("linkUnlinkedMeetingNotes (the catch-up's first step)", () => {
    it("gives a note written with no event its meeting event, once", async () => {
      const { member } = await people();
      // Written by the old Meetings pages during a deploy: no event.
      const [old] = await h
        .db()
        .insert(schema.meetingNotes)
        .values({
          cycle: 2027,
          team: "kitchen",
          title: "Late kickoff",
          heldAt: new Date("2026-10-02T16:30:00Z"),
          createdByUserId: member.id,
          notes: "We met.",
        })
        .returning();
      // Already linked: left alone.
      await h
        .db()
        .insert(schema.meetingNotes)
        .values({
          cycle: 2027,
          team: "kitchen",
          title: "Linked",
          heldAt: new Date("2026-10-03T16:30:00Z"),
          calendarEventId: "googleEvent9",
        });

      expect(await linkUnlinkedMeetingNotes()).toBe(1);
      expect(await linkUnlinkedMeetingNotes()).toBe(0);

      const note = await getMeetingNoteByEvent(
        (
          await h
            .db()
            .select({ id: schema.meetingNotes.calendarEventId })
            .from(schema.meetingNotes)
            .where(eq(schema.meetingNotes.id, old!.id))
        )[0]!.id!,
      );
      expect(note?.id).toBe(old!.id);
      const events = await h.db().select().from(schema.campEvents);
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        kind: "meeting",
        team: "kitchen",
        title: "Late kickoff",
        cycle: 2027,
        startDate: "2026-10-02",
        startTime: "18:30",
        endTime: "19:30",
        calendarSyncedVersion: null,
        calendarEventId: note!.calendarEventId,
      });
      // So the catch-up puts it on Google.
      expect(
        (await listCampEventsToSync()).map((r) => r.calendarEventId),
      ).toEqual([note!.calendarEventId]);
    });
  });

  describe("minutes on an event made in Google", () => {
    it("links one note per event; a second first-save loses with a sentence", async () => {
      const { member } = await people();
      const base = {
        actorId: member.id,
        team: "kitchen" as const,
        title: "Kitchen sync",
        heldAt: new Date("2026-10-01T17:00:00Z"),
        calendarEvent: { id: "google-made-1", title: "Kitchen sync" },
        agenda: "",
        notes: "We met.",
        attendeeIds: [],
        decisions: [],
        actionItems: [],
        activeTeams: ["kitchen" as const],
      };
      expect((await createMeetingNote(base)).ok).toBe(true);
      expect(await createMeetingNote(base)).toEqual({
        ok: false,
        error: MINUTES_STARTED,
      });
      const listed = await listMeetingNotes({ eventIds: ["google-made-1"] });
      expect(listed).toHaveLength(1);
      expect(listed[0]).toMatchObject({
        calendarEventId: "google-made-1",
        notesWritten: true,
        openActionItems: 0,
      });
      expect(await listMeetingNotes({ eventIds: [] })).toHaveLength(0);
    });
  });

  describe("who an event is for (owner, 2026-10-27)", () => {
    it("lets a captain make one for the team leads, with no team", async () => {
      const { captain } = await people();
      const made = await createCampEvent({
        actorId: captain.id,
        kind: "meeting",
        agenda: "1. Budgets",
        newEventId: newId(),
        ...fields({ team: "kitchen", audience: "team_leads" }),
      });
      expect(made.ok).toBe(true);
      if (!made.ok) return;
      expect(made.row).toMatchObject({
        audience: "team_leads",
        team: null,
        peopleUserIds: [],
      });
      const note = await getMeetingNoteByEvent(made.row.calendarEventId);
      expect(note?.team).toBeNull();
      const rows = await audits("calendar.event_created");
      expect(rows[0]!.metadata).toMatchObject({ audience: "team_leads" });
    });

    it("keeps only approved members who are still here on a people event", async () => {
      const db = h.db();
      const { captain, member } = await people();
      const pending = await makeUser(db, { approvalStatus: "pending" });
      const erased = await makeUser(db, { sanitised: true });
      const made = await createCampEvent({
        actorId: captain.id,
        kind: "event",
        agenda: "",
        newEventId: newId(),
        ...fields({
          audience: "people",
          people: [member.id, member.id, pending.id, erased.id, "nope"],
        }),
      });
      expect(made.ok).toBe(true);
      if (!made.ok) return;
      expect(made.row).toMatchObject({
        audience: "people",
        team: null,
        peopleUserIds: [member.id],
      });
      expect(
        await createCampEvent({
          actorId: captain.id,
          kind: "event",
          agenda: "",
          newEventId: newId(),
          ...fields({ audience: "people", people: [pending.id] }),
        }),
      ).toEqual({ ok: false, error: PICK_SOMEONE });
    });

    it("refuses a lead an event for the team leads or for picked people", async () => {
      const { lead, member } = await people();
      for (const audience of ["team_leads", "people"] as const) {
        expect(
          await createCampEvent({
            actorId: lead.id,
            kind: "event",
            agenda: "",
            newEventId: newId(),
            ...fields({ audience, people: [member.id] }),
          }),
        ).toEqual({ ok: false, error: WHOLE_CAMP_EVENTS_ARE_CAPTAINS });
      }
    });

    it("refuses a lead who moves their team's event to the team leads", async () => {
      const { lead } = await people();
      const made = await createCampEvent({
        actorId: lead.id,
        kind: "event",
        agenda: "",
        newEventId: newId(),
        ...fields(),
      });
      if (!made.ok) throw new Error(made.error);
      expect(
        await editCampEvent({
          actorId: lead.id,
          calendarEventId: made.row.calendarEventId,
          expectedVersion: made.row.version,
          ...fields({ audience: "team_leads" }),
        }),
      ).toEqual({ ok: false, error: WHOLE_CAMP_EVENTS_ARE_CAPTAINS });
    });

    it("makes an older team event its team's (migration 0121), twice over", async () => {
      const db = h.db();
      const { captain } = await people();
      const made = await createCampEvent({
        actorId: captain.id,
        kind: "event",
        agenda: "",
        newEventId: newId(),
        ...fields(),
      });
      const camp = await createCampEvent({
        actorId: captain.id,
        kind: "event",
        agenda: "",
        newEventId: newId(),
        ...fields({ team: null }),
      });
      if (!made.ok || !camp.ok) throw new Error("not made");
      // As a row written before the column: on its default.
      await db
        .update(schema.campEvents)
        .set({ audience: "camp" })
        .where(eq(schema.campEvents.id, made.row.id));
      const dir = path.join(__dirname, "../../migrations");
      const file = readdirSync(dir).find((f) =>
        f.startsWith("0121_camp_event_audience_backfill"),
      )!;
      const fix = readFileSync(path.join(dir, file), "utf8");
      await db.execute(sql.raw(fix));
      await db.execute(sql.raw(fix));
      expect((await getCampEventRow(made.row.id))?.audience).toBe("team");
      expect((await getCampEventRow(camp.row.id))?.audience).toBe("camp");
    });

    it("keeps the Meet link Google gave, and asks no more", async () => {
      const { captain } = await people();
      const made = await createCampEvent({
        actorId: captain.id,
        kind: "event",
        agenda: "",
        newEventId: newId(),
        meet: true,
        ...fields(),
      });
      if (!made.ok) throw new Error(made.error);
      expect(made.row).toMatchObject({ meet: true, meetUrl: null });
      expect(
        await markCampEventCalendarSynced({
          id: made.row.id,
          version: made.row.version,
          removed: false,
          meetUrl: "https://meet.google.com/abc-defg-hij",
        }),
      ).toBe(true);
      expect((await getCampEventRow(made.row.id))?.meetUrl).toBe(
        "https://meet.google.com/abc-defg-hij",
      );
    });
  });
});
