// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ATTENDEE_NOT_A_MEMBER,
  EVENT_NOT_ON_CALENDAR,
  MINUTES_STARTED,
  NOTE_EDITED,
  NOTE_GONE,
  NOT_A_CAMP_NOTE_WRITER,
  NOT_A_NOTE_WRITER,
} from "@camp404/db/meeting-notes";
import { Team } from "@camp404/types";
import { useTestDb } from "../../../../packages/db/src/__tests__/_harness";
import { bothWays } from "./_agreement";

// Meeting notes (#268), through lib/meeting-notes.ts, on the database and on
// the E2E store: a team's notes are written by its members this year and
// captains (meetingNoteRefusal, canWorkInTeam in @camp404/core), a camp
// meeting's by captains; one note per calendar event; each edit a
// compare-and-set on the version. The notes are the Kitchen's, so the
// Kitchen lead writes them and the Finance lead (a lead of ANOTHER team, not
// on Kitchen) is refused. Action items (the task board's) are not written
// here. See _agreement.ts.

const mode = vi.hoisted(() => ({ on: false }));
vi.mock("@/lib/test-mode", () => ({
  isE2ETestMode: () => mode.on,
  usesTestStore: () => mode.on,
  TEST_USER_COOKIE: "camp404_test_user",
}));

import { testStore } from "../test-store";
import {
  createMeetingNote,
  editMeetingNote,
  getMeetingNote,
  getMeetingNoteByEvent,
  listMeetingNotes,
} from "../meeting-notes";

const KITCHEN = Team.enum.kitchen;
const FINANCE = Team.enum.finance;
const HELD = new Date("2027-03-01T17:00:00Z");

const note = (
  actorId: string,
  team: Team | null,
  extra: Partial<Parameters<typeof createMeetingNote>[0]> = {},
) => ({
  actorId,
  team,
  title: "Menu night",
  heldAt: HELD,
  calendarEvent: null,
  agenda: "Dinners",
  notes: "",
  attendeeIds: [],
  decisions: [],
  activeTeams: [KITCHEN, FINANCE],
  ...extra,
});

/** What a reader sees of one note, people by persona. */
async function read(id: string) {
  const n = await getMeetingNote(id);
  return (
    n && {
      title: n.title,
      team: n.team,
      agenda: n.agenda,
      notes: n.notes,
      version: n.version,
      attendees: n.attendees.map((a) => a.id),
      decisions: n.decisions,
      onEvent: n.calendarEventId === "evt-1",
      createdByName: n.createdByName,
    }
  );
}

describe("meeting notes: the database and the test store agree", () => {
  const h = useTestDb();
  beforeEach(() => {
    mode.on = false;
    testStore.reset();
  });

  it("lets the team's members and captains write its notes, once per event, and refuses everyone else", async () => {
    const { db, store } = await bothWays(mode, h, async (p, seed) => {
      await seed.join(p.member, KITCHEN);
      const late = await seed.user("Late", { approval: "pending" });
      const lead = await createMeetingNote(
        note(p.kitchenLead, KITCHEN, {
          attendeeIds: [p.member],
          decisions: ["Soup on Monday"],
          calendarEvent: { id: "evt-1", title: "Menu night" },
        }),
      );
      const member = await createMeetingNote(note(p.member, KITCHEN));
      const otherLead = await createMeetingNote(note(p.financeLead, KITCHEN));
      const leadCamp = await createMeetingNote(note(p.kitchenLead, null));
      const captainCamp = await createMeetingNote(note(p.captain, null));
      const pendingAttendee = await createMeetingNote(
        note(p.captain, KITCHEN, { attendeeIds: [late] }),
      );
      const lostEvent = await createMeetingNote(
        note(p.captain, KITCHEN, {
          calendarEvent: { id: "evt-2", title: null },
        }),
      );
      const sameEvent = await createMeetingNote(
        note(p.captain, KITCHEN, {
          calendarEvent: { id: "evt-1", title: "Menu night" },
        }),
      );
      const sameEventBadAttendee = await createMeetingNote(
        note(p.captain, KITCHEN, {
          calendarEvent: { id: "evt-1", title: "Menu night" },
          attendeeIds: [late],
        }),
      );
      const id = lead.ok ? lead.id : "";
      return {
        lead: lead.ok,
        member: member.ok,
        otherLead,
        leadCamp,
        captainCamp: captainCamp.ok,
        pendingAttendee,
        lostEvent,
        sameEvent,
        sameEventBadAttendee,
        note: await read(id),
        byEvent: (await getMeetingNoteByEvent("evt-1"))?.title ?? null,
        noEvent: await getMeetingNoteByEvent("evt-9"),
        list: (await listMeetingNotes()).map((n) => ({
          title: n.title,
          team: n.team,
        })),
        kitchenOnly: (await listMeetingNotes({ team: KITCHEN })).length,
      };
    });
    const refused = (error: string) => ({ ok: false, error });
    expect(db).toMatchObject({
      lead: true,
      member: true,
      otherLead: refused(NOT_A_NOTE_WRITER),
      leadCamp: refused(NOT_A_CAMP_NOTE_WRITER),
      captainCamp: true,
      pendingAttendee: refused(ATTENDEE_NOT_A_MEMBER),
      lostEvent: refused(EVENT_NOT_ON_CALENDAR),
      sameEvent: refused(MINUTES_STARTED),
      sameEventBadAttendee: refused(ATTENDEE_NOT_A_MEMBER),
      note: {
        team: KITCHEN,
        version: 1,
        attendees: ["@member"],
        onEvent: true,
      },
      byEvent: "Menu night",
      noEvent: null,
    });
    expect(store).toEqual(db);
  });

  it("edits a note once from the version seen, by the same people", async () => {
    const { db, store } = await bothWays(mode, h, async (p) => {
      const made = await createMeetingNote(note(p.kitchenLead, KITCHEN));
      const id = made.ok ? made.id : "";
      const edit = (actorId: string, version: number, notes: string) =>
        editMeetingNote({
          ...note(actorId, KITCHEN, { notes }),
          noteId: id,
          version,
        });
      const captain = await edit(p.captain, 1, "We agreed soup.");
      const stale = await edit(p.kitchenLead, 1, "Old words.");
      const otherLead = await edit(p.financeLead, 2, "Mine.");
      const gone = await editMeetingNote({
        ...note(p.captain, KITCHEN),
        noteId: "00000000-0000-4000-8000-000000000000",
        version: 1,
      });
      return {
        captain,
        stale,
        otherLead,
        gone,
        note: await read(id),
      };
    });
    const refused = (error: string) => ({ ok: false, error });
    expect(db).toMatchObject({
      captain: { ok: true, version: 2 },
      stale: refused(NOTE_EDITED),
      otherLead: refused(NOT_A_NOTE_WRITER),
      gone: refused(NOTE_GONE),
      note: { version: 2, notes: "We agreed soup.", createdByName: "Cook" },
    });
    expect(store).toEqual(db);
  });
});
