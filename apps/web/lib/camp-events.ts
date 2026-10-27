import "server-only";

import {
  CAMP_TIME_ZONE,
  campEventCalendarStep,
  nextCampDay,
  plainTextWithLists,
  teamEventTitle,
} from "@camp404/core";
import * as db from "@camp404/db/camp-events";
import type {
  CampEventFields,
  CampEventRow,
  CampEventWriteResult,
} from "@camp404/db/camp-events";
import type {
  EditCampEventInput,
  NewCampEventInput,
  RemoveCampEventInput,
} from "@camp404/types";
import {
  mirror,
  type CalendarMirrorOutcome,
  type MirrorTarget,
} from "./calendar-mirror";
import { getTeamsConfig } from "./camp-config";
import {
  newCalendarEventId,
  TEAM_PROPERTY,
  type CalendarEventBody,
} from "./google-calendar";
import { campEventsTestStore } from "./test-store-camp-events";
import { twin } from "./twin";

// The Calendar's own events and meetings (owner, 2026-10-10: "you make events
// in the calendar app"), from the database or, under E2E, the test store; each
// one mirrored onto the camp's shared Google Calendar by ./calendar-mirror,
// the logistics phases' path: the row (the rule, the compare-and-set, the
// audit row and its claimed Google id) first, then Google with no transaction
// open, then the mark. A Google failure loses nothing: the catch-up on a later
// page load puts it right under the same id. Only production writes to Google.
// Who may manage an event (campEventRefusal, campEventChangeRefusal), what an
// event is (campEventKindFor), its stored days (storedCampEventWhen) and
// whether a meeting has minutes (hasMinutes) live once in @camp404/core;
// lib/__tests__/camp-events-agreement.test.ts holds the rest equal.

export type { CampEventRow, CampEventWriteResult };

const events = twin(db, campEventsTestStore, [
  "listCampEvents",
  "getCampEvent",
  "getCampEventRow",
  "listCampEventsToSync",
  "linkUnlinkedMeetingNotes",
  "markCampEventCalendarSynced",
  "createCampEvent",
  "editCampEvent",
  "removeCampEvent",
]);

const APP_NOTE =
  "Made in the Camp 404 app, under Calendar. Change it there, not here.";
const MEETING_NOTE =
  "A meeting: its agenda and minutes are in the Camp 404 app, under Calendar.";

/**
 * The most a Google event's details hold here. Google does not document a cap
 * on `description`, but one about 8,192 characters is widely reported, and a
 * details field over it would fail the mirror on every catch-up. The app keeps
 * up to 10,000 (the agenda), so Google's copy is cut below that.
 */
export const GOOGLE_DETAILS_MAX = 8_000;
const CUT_NOTE = "… the rest is in the Camp 404 app, under Calendar.";

/**
 * The details Google shows: a meeting's agenda as plain text (the owner's
 * mock-up: Markdown markers mean nothing in Google Calendar; numbers, bullets
 * and line breaks stay), then the notes, cut so the whole stays under
 * GOOGLE_DETAILS_MAX.
 */
function googleDetails(row: CampEventRow): string {
  const tail = [row.kind === "meeting" ? MEETING_NOTE : null, APP_NOTE]
    .filter(Boolean)
    .join("\n\n");
  // A pasted call link goes first, where people in Google look for it.
  const call = row.callUrl ? `Join the call: ${row.callUrl}\n\n` : "";
  let details = row.description
    ? row.kind === "meeting"
      ? plainTextWithLists(row.description)
      : row.description.trim()
    : "";
  if (!details) return `${call}${tail}`;
  const room = GOOGLE_DETAILS_MAX - call.length - tail.length - 2;
  if (details.length > room) {
    details = `${details.slice(0, room - CUT_NOTE.length - 1).trimEnd()}\n${CUT_NOTE}`;
  }
  return `${call}${details}\n\n${tail}`;
}

/**
 * The Google event for one of the Calendar's events. A team's goes on twice,
 * as every event the app makes: in the title, in the camp's convention
 * ("Kitchen Team - Planning"), for people reading Google Calendar, and as the
 * private team property, for the app. An all-day event ends the day after its
 * last day (Google's end is exclusive); a timed one is written at the camp's
 * fixed +02:00 (Johannesburg has no daylight saving).
 */
export function campEventBody(
  row: CampEventRow,
  teamLabel: string | null,
): CalendarEventBody {
  const time = (hhmm: string) => ({
    dateTime: `${row.startDate}T${hhmm}:00+02:00`,
    timeZone: CAMP_TIME_ZONE,
  });
  const description = googleDetails(row);
  return {
    summary: teamEventTitle(
      row.team ? (teamLabel ?? row.team) : null,
      row.title,
    ),
    description,
    ...(row.place ? { location: row.place } : {}),
    start: row.allDay
      ? { date: row.startDate }
      : time(row.startTime ?? "00:00"),
    end: row.allDay
      ? { date: nextCampDay(row.endDate) }
      : time(row.endTime ?? row.startTime ?? "00:00"),
    extendedProperties: {
      private: {
        ...(row.team ? { [TEAM_PROPERTY]: row.team } : {}),
        camp404Event: row.id,
        camp404Kind: row.kind,
      },
    },
  };
}

async function teamLabels(): Promise<Record<string, string>> {
  const config = await getTeamsConfig();
  return Object.fromEntries(config.teams.map((t) => [t.key, t.label]));
}

/** One event row as a mirror target. */
function target(
  row: CampEventRow,
  labels: Record<string, string>,
): MirrorTarget {
  const removed = row.removedAt !== null;
  return {
    step: campEventCalendarStep({
      removed,
      calendarEventId: row.calendarEventId,
    }),
    eventId: row.calendarEventId,
    event: removed
      ? null
      : {
          body: campEventBody(
            row,
            row.team ? (labels[row.team] ?? null) : null,
          ),
        },
    mark: (gone: boolean) =>
      events.markCampEventCalendarSynced({
        id: row.id,
        version: row.version,
        removed: gone,
      }),
    // The row as it stands, synced or not, removed or not: a newer save that
    // another step already put on Google is put again (the mark matches it),
    // never mistaken for a row that is gone.
    latest: async () => {
      const now = await events.getCampEventRow(row.id);
      return now ? target(now, labels) : undefined;
    },
  };
}

/** Every event row as a mirror target, with the camp's team names. */
export async function campEventTargets(
  rows: readonly CampEventRow[],
): Promise<{ row: CampEventRow; target: MirrorTarget }[]> {
  if (rows.length === 0) return [];
  const labels = await teamLabels();
  return rows.map((row) => ({ row, target: target(row, labels) }));
}

// --- Reads -------------------------------------------------------------------

/** The events the app made that touch the camp days `from`..`to`. */
export const listCampEvents = events.listCampEvents;

/** One event the app made, by its Google id. */
export const getCampEvent = events.getCampEvent;

/**
 * Give every meeting note with no calendar event its own meeting event (as
 * migration 0108 did), so a note written while a deploy rolled out still
 * shows in the Calendar. The catch-up runs it first.
 */
export const linkUnlinkedMeetingNotes = events.linkUnlinkedMeetingNotes;

/** The events the camp calendar may not match yet, for the catch-up. */
export const listCampEventsToSync = events.listCampEventsToSync;

// --- Writes ------------------------------------------------------------------

type Saved<T = object> = CampEventWriteResult<
  T & { row: CampEventRow; calendar: CalendarMirrorOutcome }
>;

function fieldsOf(
  input: Pick<
    NewCampEventInput,
    | "team"
    | "audience"
    | "people"
    | "callUrl"
    | "title"
    | "allDay"
    | "date"
    | "endDate"
    | "start"
    | "end"
    | "place"
    | "description"
  >,
): CampEventFields {
  return {
    team: input.team,
    audience: input.audience,
    people: input.people,
    callUrl: input.callUrl,
    title: input.title,
    allDay: input.allDay,
    startDate: input.date,
    endDate: input.allDay ? (input.endDate ?? input.date) : input.date,
    startTime: input.allDay ? null : (input.start ?? null),
    endTime: input.allDay ? null : (input.end ?? null),
    place: input.place,
    description: input.description,
  };
}

async function afterWrite<T extends object>(
  saved: CampEventWriteResult<T & { row: CampEventRow }>,
  actorId: string,
): Promise<Saved<Omit<T, "row">>> {
  if (!saved.ok) return saved;
  const labels = await teamLabels();
  return {
    ...saved,
    calendar: await mirror(target(saved.row, labels), actorId),
  };
}

/** Make an event or a meeting as `actorId`, if they may, and put it on Google. */
export async function createCampEvent(
  actorId: string,
  input: NewCampEventInput,
): Promise<Saved<{ noteId: string | null }>> {
  // The composer's Details is the Agenda (owner, 2026-10-11): the Google
  // event's details carry it, and an event with one is a meeting whose note
  // starts with the same agenda (campEventKindFor, in the write).
  const fields = fieldsOf(input);
  const args = {
    ...fields,
    description: fields.description ?? (input.agenda || null),
    actorId,
    kind: input.kind,
    agenda: input.agenda,
    newEventId: newCalendarEventId(),
  };
  const saved = await events.createCampEvent(args);
  return afterWrite(saved, actorId);
}

/** Change an event the app made, as `actorId`, if they may; Google follows. */
export async function editCampEvent(
  actorId: string,
  input: EditCampEventInput,
): Promise<Saved> {
  const args = {
    ...fieldsOf(input),
    actorId,
    calendarEventId: input.eventId,
    expectedVersion: input.version,
  };
  const saved = await events.editCampEvent(args);
  return afterWrite(saved, actorId);
}

/** Take an event the app made off the calendar, as `actorId`, if they may. */
export async function removeCampEvent(
  actorId: string,
  input: RemoveCampEventInput,
): Promise<Saved> {
  const args = {
    actorId,
    calendarEventId: input.eventId,
    expectedVersion: input.version,
  };
  const saved = await events.removeCampEvent(args);
  return afterWrite(saved, actorId);
}
