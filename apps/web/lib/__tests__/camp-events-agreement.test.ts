// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CAMP_EVENT_KINDS,
  MEETING_HAS_MINUTES,
  NOT_AN_EVENT_MAKER,
  NOT_YOUR_EVENT_TEAM,
  WHOLE_CAMP_EVENTS_ARE_CAPTAINS,
  type CampEventKind,
} from "@camp404/core";
import { EVENT_CHANGED, EVENT_GONE } from "@camp404/db/camp-events";
import { Team, type NewCampEventInput } from "@camp404/types";
import { useTestDb } from "../../../../packages/db/src/__tests__/_harness";
import type * as CalendarMirror from "../calendar-mirror";
import { YEAR, bothWays } from "./_agreement";

// The Calendar's own events and meetings, through lib/camp-events.ts, on the
// database and on the E2E store: the same people, the same writes, the same
// answers and refusal sentences. Who may manage an event (campEventRefusal,
// campEventChangeRefusal), what an event is (campEventKindFor), its stored
// days (storedCampEventWhen) and whether a meeting has minutes (hasMinutes)
// live once in @camp404/core; this holds the rest equal. A Kitchen lead is
// this domain's lead; the Finance lead is a lead of ANOTHER team, refused on
// Kitchen's events. See _agreement.ts.
//
// The camp calendar mirror is out of scope here: it is stubbed to "not
// connected" on both sides, so neither writes to Google and no row is marked
// synced behind the suite's back. The catch-up's reads are compared through
// their own facade calls, and a mark through the event's own mirror target.
//
// The catch-up reads the oldest change first, by the server's clock: each
// case pins the clock (Date only) and moves it between writes.

const mode = vi.hoisted(() => ({ on: false }));
vi.mock("@/lib/test-mode", () => ({
  isE2ETestMode: () => mode.on,
  usesTestStore: () => mode.on,
  TEST_USER_COOKIE: "camp404_test_user",
}));
vi.mock("../calendar-mirror", async (importOriginal) => ({
  ...(await importOriginal<typeof CalendarMirror>()),
  isCampCalendarWritable: () => false,
  mirror: async () => "not_connected" as const,
}));

import { testStore } from "../test-store";
import {
  campEventTargets,
  createCampEvent,
  editCampEvent,
  getCampEvent,
  linkUnlinkedMeetingNotes,
  listCampEvents,
  listCampEventsToSync,
  removeCampEvent,
} from "../camp-events";
import {
  createMeetingNote,
  editMeetingNote,
  getMeetingNoteByEvent,
} from "../meeting-notes";

const START = new Date("2027-03-01T10:00:00Z");
const [EVENT, MEETING] = CAMP_EVENT_KINDS as [CampEventKind, CampEventKind];
const KITCHEN = Team.enum.kitchen;
const FINANCE = Team.enum.finance;
const RANGE = { from: "2027-04-01", to: "2027-04-30" };

/** A one-hour event on 20 April, or an all-day one. */
const event = (
  team: Team | null,
  title: string,
  overrides: Partial<NewCampEventInput> = {},
): NewCampEventInput => ({
  kind: EVENT,
  team,
  title,
  allDay: false,
  date: "2027-04-20",
  endDate: null,
  start: "19:00",
  end: "20:00",
  place: null,
  description: null,
  agenda: "",
  ...overrides,
});

const edit = (
  eventId: string,
  version: number,
  team: Team | null,
  title: string,
  overrides: Partial<NewCampEventInput> = {},
) => {
  const {
    kind: _kind,
    agenda: _agenda,
    ...fields
  } = event(team, title, overrides);
  return { eventId, version, ...fields };
};

/** The event a write answered with, or a throw: the case needs it. */
function made<T extends { ok: boolean }>(saved: T): Extract<T, { ok: true }> {
  if (!saved.ok) throw new Error(JSON.stringify(saved));
  return saved as Extract<T, { ok: true }>;
}

/** A tick of the clock, so each write has its own time. */
let at = START.getTime();
const tick = () => {
  at += 60_000;
  vi.setSystemTime(new Date(at));
};

describe("the Calendar's events: the database and the test store agree", () => {
  const h = useTestDb();
  beforeEach(() => {
    mode.on = false;
    testStore.reset();
    vi.useFakeTimers({ toFake: ["Date"] });
    at = START.getTime();
    vi.setSystemTime(START);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("lets a captain make a whole-camp event and a lead make, change and remove their team's, compare-and-set on the version", async () => {
    const { db, store } = await bothWays(mode, h, async (p) => {
      at = START.getTime();
      vi.setSystemTime(START);
      const camp = made(
        await createCampEvent(
          p.captain,
          event(null, "Camp braai", {
            allDay: true,
            endDate: "2027-04-21",
            start: undefined,
            end: undefined,
          }),
        ),
      );
      tick();
      const kitchen = made(
        await createCampEvent(p.kitchenLead, event(KITCHEN, "Menu tasting")),
      );
      tick();
      const leadWholeCamp = await createCampEvent(
        p.kitchenLead,
        event(null, "Everyone"),
      );
      const otherLead = await createCampEvent(
        p.financeLead,
        event(KITCHEN, "Not mine"),
      );
      const member = await createCampEvent(p.member, event(KITCHEN, "Mine?"));
      const id = kitchen.row.calendarEventId;
      const otherLeadEdit = await editCampEvent(
        p.financeLead,
        edit(id, 1, FINANCE, "Moved"),
      );
      const moveAway = await editCampEvent(
        p.kitchenLead,
        edit(id, 1, FINANCE, "Moved"),
      );
      const toWholeCamp = await editCampEvent(
        p.kitchenLead,
        edit(id, 1, null, "Moved"),
      );
      tick();
      const changed = await editCampEvent(
        p.kitchenLead,
        edit(id, 1, KITCHEN, "Menu tasting, round 2", {
          start: "18:00",
          end: "19:30",
          place: "The kitchen",
        }),
      );
      const stale = await editCampEvent(
        p.captain,
        edit(id, 1, KITCHEN, "Too late"),
      );
      const captainMoves = await editCampEvent(
        p.captain,
        edit(camp.row.calendarEventId, 1, KITCHEN, "Camp braai", {
          allDay: true,
          date: "2027-04-20",
          endDate: "2027-04-21",
          start: undefined,
          end: undefined,
        }),
      );
      const listed = await listCampEvents(RANGE);
      const otherLeadRemove = await removeCampEvent(p.financeLead, {
        eventId: id,
        version: 2,
      });
      const staleRemove = await removeCampEvent(p.kitchenLead, {
        eventId: id,
        version: 1,
      });
      tick();
      const removed = await removeCampEvent(p.kitchenLead, {
        eventId: id,
        version: 2,
      });
      const removedAgain = await removeCampEvent(p.kitchenLead, {
        eventId: id,
        version: 3,
      });
      const editRemoved = await editCampEvent(
        p.kitchenLead,
        edit(id, 3, KITCHEN, "Back?"),
      );
      return {
        camp,
        kitchen,
        leadWholeCamp,
        otherLead,
        member,
        otherLeadEdit,
        moveAway,
        toWholeCamp,
        changed,
        stale,
        captainMoves,
        listed,
        otherLeadRemove,
        staleRemove,
        removed,
        removedAgain,
        editRemoved,
        gone: await getCampEvent(id),
        after: await listCampEvents(RANGE),
        withRemoved: await listCampEvents({ ...RANGE, withRemoved: true }),
      };
    });
    const refused = (error: string) => ({ ok: false, error });
    const ok = { ok: true, calendar: "not_connected" };
    expect(db).toMatchObject({
      camp: {
        ...ok,
        noteId: null,
        row: {
          cycle: YEAR,
          kind: EVENT,
          team: null,
          allDay: true,
          startDate: "2027-04-20",
          endDate: "2027-04-21",
          startTime: null,
          endTime: null,
          version: 1,
          removedAt: null,
          createdByUserId: "@captain",
        },
      },
      kitchen: {
        ...ok,
        row: { team: KITCHEN, startTime: "19:00", endTime: "20:00" },
      },
      leadWholeCamp: refused(WHOLE_CAMP_EVENTS_ARE_CAPTAINS),
      otherLead: refused(NOT_YOUR_EVENT_TEAM),
      member: refused(NOT_AN_EVENT_MAKER),
      otherLeadEdit: refused(NOT_YOUR_EVENT_TEAM),
      moveAway: refused(NOT_YOUR_EVENT_TEAM),
      toWholeCamp: refused(WHOLE_CAMP_EVENTS_ARE_CAPTAINS),
      changed: {
        ...ok,
        row: {
          title: "Menu tasting, round 2",
          startTime: "18:00",
          place: "The kitchen",
          version: 2,
        },
      },
      stale: refused(EVENT_CHANGED),
      captainMoves: { ...ok, row: { team: KITCHEN, version: 2 } },
      // The same day: the timed event first, as Postgres sorts a null start
      // time (ASC, NULLS LAST) after a timed one.
      listed: [{ title: "Menu tasting, round 2" }, { title: "Camp braai" }],
      otherLeadRemove: refused(NOT_YOUR_EVENT_TEAM),
      staleRemove: refused(EVENT_CHANGED),
      removed: { ...ok, row: { version: 3, removedAt: "<date>" } },
      removedAgain: refused(EVENT_GONE),
      editRemoved: refused(EVENT_GONE),
      gone: null,
      after: [{ title: "Camp braai" }],
      withRemoved: [
        { title: "Menu tasting, round 2", removedAt: "<date>" },
        { title: "Camp braai" },
      ],
    });
    expect(store).toEqual(db);
  });

  it("says who an event is for: the team leads, or picked people who are still approved", async () => {
    const { db, store } = await bothWays(mode, h, async (p, seed) => {
      const waiting = await seed.user("Waiting", { approval: "pending" });
      const leads = await createCampEvent(
        p.captain,
        event(KITCHEN, "Leads sync", { audience: "team_leads" }),
      );
      tick();
      const picked = await createCampEvent(
        p.captain,
        event(null, "Budget chat", {
          audience: "people",
          people: [p.member, waiting, p.member],
        }),
      );
      const nobody = await createCampEvent(
        p.captain,
        event(null, "Nobody", { audience: "people", people: [waiting] }),
      );
      const byLead = await createCampEvent(
        p.kitchenLead,
        event(null, "Leads only", { audience: "team_leads" }),
      );
      const shape = (r: Awaited<ReturnType<typeof createCampEvent>>) =>
        r.ok
          ? {
              audience: r.row.audience,
              team: r.row.team,
              people: r.row.peopleUserIds,
            }
          : r;
      return {
        leads: shape(leads),
        picked: shape(picked),
        nobody: shape(nobody),
        byLead: shape(byLead),
      };
    });
    expect(store).toEqual(db);
    expect(db).toMatchObject({
      leads: { audience: "team_leads", team: null, people: [] },
      picked: { audience: "people", team: null },
      nobody: { ok: false },
      byLead: { ok: false },
    });
    expect(
      (db as { picked: { people: unknown[] } }).picked.people,
    ).toHaveLength(1);
  });

  it("gives a meeting its note in step with it, and keeps a meeting with minutes on the calendar", async () => {
    const { db, store } = await bothWays(mode, h, async (p) => {
      at = START.getTime();
      vi.setSystemTime(START);
      // An event made with an agenda is a meeting (campEventKindFor).
      const planning = made(
        await createCampEvent(
          p.kitchenLead,
          event(KITCHEN, "Kitchen planning", { agenda: "1. The menu" }),
        ),
      );
      tick();
      const bare = made(
        await createCampEvent(
          p.kitchenLead,
          event(KITCHEN, "Shopping run", { kind: MEETING }),
        ),
      );
      const plain = made(
        await createCampEvent(p.kitchenLead, event(KITCHEN, "Pot wash")),
      );
      const id = planning.row.calendarEventId;
      const noteOf = async (eventId: string) => {
        const note = await getMeetingNoteByEvent(eventId);
        return note
          ? {
              id: note.id,
              team: note.team,
              title: note.title,
              heldAt: note.heldAt.toISOString(),
              agenda: note.agenda,
              notes: note.notes,
            }
          : null;
      };
      const noteAtFirst = await noteOf(id);
      tick();
      made(
        await editCampEvent(
          p.kitchenLead,
          edit(id, 1, KITCHEN, "Kitchen planning, again", { start: "17:00" }),
        ),
      );
      const noteFollows = await noteOf(id);
      const note = (await getMeetingNoteByEvent(id))!;
      const minutes = await editMeetingNote({
        actorId: p.kitchenLead,
        noteId: note.id,
        version: note.version,
        title: note.title,
        heldAt: note.heldAt,
        calendarEvent: { id, title: null },
        agenda: note.agenda,
        notes: "We picked the menu.",
        attendeeIds: [],
        decisions: [],
        activeTeams: [KITCHEN],
      });
      const withMinutes = await removeCampEvent(p.kitchenLead, {
        eventId: id,
        version: 2,
      });
      const agendaOnly = await removeCampEvent(p.kitchenLead, {
        eventId: bare.row.calendarEventId,
        version: 1,
      });
      return {
        planning,
        bare,
        plain,
        noteAtFirst,
        noteFollows,
        minutes: minutes.ok,
        withMinutes,
        stays: (await getCampEvent(id))?.title ?? null,
        agendaOnly,
        bareNote: await noteOf(bare.row.calendarEventId),
      };
    });
    const ok = { ok: true, calendar: "not_connected" };
    expect(db).toMatchObject({
      planning: { ...ok, row: { kind: MEETING } },
      bare: { ...ok, row: { kind: MEETING } },
      plain: { ...ok, noteId: null, row: { kind: EVENT } },
      noteAtFirst: {
        team: KITCHEN,
        title: "Kitchen planning",
        heldAt: "2027-04-20T17:00:00.000Z",
        agenda: "1. The menu",
        notes: "",
      },
      noteFollows: {
        title: "Kitchen planning, again",
        heldAt: "2027-04-20T15:00:00.000Z",
      },
      minutes: true,
      withMinutes: { ok: false, error: MEETING_HAS_MINUTES },
      stays: "Kitchen planning, again",
      agendaOnly: { ...ok, row: { version: 2 } },
      bareNote: null,
    });
    const answer = db as {
      planning: { noteId: string };
      noteAtFirst: { id: string };
    };
    expect(answer.noteAtFirst.id).toBe(answer.planning.noteId);
    expect(store).toEqual(db);
  });

  it("hands the catch-up the events Google may not match, oldest change first, and links a note that names no event", async () => {
    const { db, store } = await bothWays(mode, h, async (p) => {
      at = START.getTime();
      vi.setSystemTime(START);
      const first = made(
        await createCampEvent(p.captain, event(null, "First")),
      );
      tick();
      const second = made(
        await createCampEvent(p.captain, event(null, "Second")),
      );
      // Both changed, so both times come from the server's clock (a new row's
      // comes from Postgres's), the first one last.
      tick();
      const secondEdited = made(
        await editCampEvent(
          p.captain,
          edit(second.row.calendarEventId, 1, null, "Second"),
        ),
      );
      tick();
      made(
        await editCampEvent(
          p.captain,
          edit(first.row.calendarEventId, 1, null, "First, changed"),
        ),
      );
      const toSync = (await listCampEventsToSync()).map((r) => r.title);
      const [secondTarget] = await campEventTargets([secondEdited.row]);
      const marked = await secondTarget!.target.mark(false);
      const markedAgain = await secondTarget!.target.mark(false);
      const afterMark = (await listCampEventsToSync()).map((r) => r.title);
      tick();
      const note = await createMeetingNote({
        actorId: p.kitchenLead,
        team: KITCHEN,
        title: "Old notes",
        heldAt: new Date("2027-04-22T21:30:00Z"),
        calendarEvent: null,
        agenda: "",
        notes: "",
        attendeeIds: [],
        decisions: [],
        activeTeams: [KITCHEN],
      });
      const linked = await linkUnlinkedMeetingNotes();
      const linkedAgain = await linkUnlinkedMeetingNotes();
      return {
        toSync,
        marked,
        markedAgain,
        afterMark,
        note: note.ok,
        linked,
        linkedAgain,
        events: await listCampEvents(RANGE),
      };
    });
    expect(db).toMatchObject({
      toSync: ["Second", "First, changed"],
      marked: true,
      markedAgain: true,
      afterMark: ["First, changed"],
      note: true,
      linked: 1,
      linkedAgain: 0,
      events: [
        { title: "First, changed" },
        { title: "Second", calendarSyncedVersion: 2 },
        {
          kind: MEETING,
          team: KITCHEN,
          title: "Old notes",
          startDate: "2027-04-22",
          endDate: "2027-04-22",
          startTime: "23:30",
          endTime: "23:59",
          calendarSyncedVersion: null,
          createdByUserId: "@kitchenLead",
        },
      ],
    });
    expect(store).toEqual(db);
  });
});
