import "server-only";

import { campDayStart, nextCampDay, type CalendarTeam } from "@camp404/core";
import { getCalendarEventById, getCalendarRange } from "./camp-calendar";
import { getCampEvent, listCampEvents } from "./camp-events";
import {
  appEntry,
  googleEntry,
  listRange,
  mergeCalendar,
  monthGridRange,
  noteEntry,
  type CalendarEntry,
  type CalendarState,
  type NoteLike,
} from "./calendar-month";
import {
  getMeetingNoteByEvent,
  listMeetingNotes,
  type MeetingNote,
} from "./meeting-notes";

// What the Calendar page reads, on the server: the camp's Google Calendar for
// the days on screen (the past included), the events the app made for those
// days, and the meeting notes of the meetings among them, merged
// (mergeCalendar). The page gates first; nothing here decides access.

export type CalendarReadStatus = "ok" | "not_configured" | "unavailable";

/** A full note, in brief, as the merge reads notes. */
export function noteSummary(note: MeetingNote): NoteLike {
  return {
    id: note.id,
    calendarEventId: note.calendarEventId,
    team: note.team,
    title: note.title,
    heldAt: note.heldAt,
    notesWritten: note.notes.trim().length > 0,
    decisions: note.decisions.length,
    actionItems: note.actionItems.length,
    openActionItems: note.actionItems.filter(
      (i) =>
        !i.task || i.task.status === "open" || i.task.status === "in_progress",
    ).length,
    attendees: note.attendees.length,
    firstDecision: note.decisions[0]?.text ?? null,
  };
}

/**
 * One thing on the calendar by its id, wherever it is: an event the app made,
 * an event on Google, or a meeting known only from its note. Null when none
 * has it. Its note comes with it.
 */
export async function findCalendarEntry(
  id: string,
  teams: readonly CalendarTeam[],
): Promise<{ entry: CalendarEntry; note: MeetingNote | null } | null> {
  const [row, note] = await Promise.all([
    getCampEvent(id),
    getMeetingNoteByEvent(id),
  ]);
  const summary = note ? noteSummary(note) : undefined;
  if (row) return { entry: appEntry(row, summary, teams), note };
  const google = await getCalendarEventById(id);
  if (google && google !== "unavailable") {
    return { entry: googleEntry(google, summary, teams), note };
  }
  if (summary) {
    const entry = noteEntry(summary, teams);
    if (entry) return { entry, note };
  }
  return null;
}

/** The days a state shows: the month's grid, or the list's year. */
export function stateRange(
  state: Pick<CalendarState, "view" | "month" | "when">,
  today: string,
): { from: string; to: string } {
  return state.view === "month"
    ? monthGridRange(state.month)
    : listRange(state.when, today);
}

/** Everything on the calendar for the camp days `from`..`to`. */
export async function readCalendarDays(
  range: { from: string; to: string },
  teams: readonly CalendarTeam[],
): Promise<{ status: CalendarReadStatus; entries: CalendarEntry[] }> {
  const [google, app] = await Promise.all([
    getCalendarRange(range),
    listCampEvents(range),
  ]);
  const googleEvents = google.status === "ok" ? google.events : [];
  const notes = await listMeetingNotes({
    eventIds: [
      ...app.map((r) => r.calendarEventId),
      ...googleEvents.map((e) => e.id),
    ],
    heldFrom: campDayStart(range.from),
    heldTo: campDayStart(nextCampDay(range.to)),
  });
  return {
    status: google.status,
    entries: mergeCalendar({ google: googleEvents, app, notes, teams }),
  };
}
