import { eq } from "drizzle-orm";
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
  listCampEvents,
  listCampEventsToSync,
  markCampEventCalendarSynced,
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

    it("makes no note for an event, and keeps an all-day event's days", async () => {
      const { captain } = await people();
      const made = await createCampEvent({
        actorId: captain.id,
        kind: "event",
        agenda: "ignored",
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
});
