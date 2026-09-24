import "server-only";

import { addCampCalendarEvent } from "@camp404/db/calendar-events";
import type { AddCalendarEventInput } from "@camp404/types";
import {
  calendarConfig,
  createCalendarEvent,
  deleteCalendarEvent,
  eventRequestBody,
  forgetCalendarCache,
  getUpcomingEvents as readGoogleCalendar,
  type CalendarResult,
} from "./google-calendar";
import { usesTestStore } from "./test-mode";
import { testStore } from "./test-store";

// The camp calendar as the pages see it: Google, or under E2E the test store,
// which stands in for a connected calendar that starts empty.
//
// Adding an event touches two systems that cannot share a transaction: Google
// holds the event, the database holds the rule and the audit row. The order is
// rule, then Google, then the audit row, all inside one database transaction
// (addCampCalendarEvent). If that transaction fails after Google said yes, the
// event is taken off Google again, so no event stays on the calendar without
// its audit row.

export type { CalendarResult };

export const CALENDAR_NOT_CONNECTED = "The camp calendar isn't connected yet.";
export const CALENDAR_UNREACHABLE =
  "Couldn't reach the camp calendar. Try again.";
export const CALENDAR_NOT_RECORDED =
  "Couldn't record the event, so it wasn't added. Try again.";

/** The next events on the camp calendar, for Home's "Coming up". */
export async function getUpcomingEvents(): Promise<CalendarResult> {
  return usesTestStore()
    ? testStore.listCalendarEvents(new Date())
    : readGoogleCalendar();
}

/** Whether the add-event page can write anywhere. */
export function isCalendarConnected(): boolean {
  return usesTestStore() || calendarConfig(process.env) !== null;
}

export type AddCalendarEventOutcome =
  | { ok: true; eventId: string }
  | { ok: false; error: string };

/**
 * Put an event on the camp calendar as `actorId`, if they may add it for its
 * team, and record it. `teamLabel` is the team's name as members read it,
 * which goes on the Google title.
 */
export async function addCalendarEvent(input: {
  actorId: string;
  input: AddCalendarEventInput;
  teamLabel: string | null;
}): Promise<AddCalendarEventOutcome> {
  const { actorId, input: event } = input;
  if (usesTestStore()) {
    return testStore.addCalendarEvent({
      actorId,
      team: event.team,
      title: event.title,
      date: event.date,
      allDay: event.allDay,
      start: event.start,
    });
  }

  const env = process.env;
  if (!calendarConfig(env)) return { ok: false, error: CALENDAR_NOT_CONNECTED };

  const body = eventRequestBody({
    title: event.title,
    description: event.description,
    team: event.team
      ? { key: event.team, label: input.teamLabel ?? event.team }
      : null,
    date: event.date,
    allDay: event.allDay,
    start: event.start,
    end: event.end,
  });

  // Set from inside `create`, read after the transaction: a holder object,
  // because a closure's assignment to a plain `let` is invisible to narrowing.
  const created: { id: string | null; googleFailed: boolean } = {
    id: null,
    googleFailed: false,
  };
  try {
    const result = await addCampCalendarEvent({
      actorId,
      team: event.team,
      title: event.title,
      date: event.date,
      allDay: event.allDay,
      create: async () => {
        try {
          created.id = await createCalendarEvent(env, body);
        } catch (error) {
          created.googleFailed = true;
          throw error;
        }
        return created.id;
      },
    });
    if (!result.ok) return result;
    forgetCalendarCache();
    return result;
  } catch (error) {
    if (created.id) {
      // Best effort: deleteCalendarEvent never throws, and logs its own
      // failure by HTTP status.
      await deleteCalendarEvent(env, created.id);
      console.error("camp calendar event not recorded, so it was taken off");
      return { ok: false, error: CALENDAR_NOT_RECORDED };
    }
    if (created.googleFailed) return { ok: false, error: CALENDAR_UNREACHABLE };
    throw error;
  }
}
