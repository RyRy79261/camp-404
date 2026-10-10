import "server-only";

import {
  getUpcomingEvents as readGoogleCalendar,
  HOME_RANGE,
  readCalendarEvent,
  readCalendarRange,
  type CalendarEvent,
  type CalendarRange,
  type CalendarResult,
} from "./google-calendar";
import { usesTestStore } from "./test-mode";
import { testStore } from "./test-store";

// The camp's shared Google Calendar as the pages read it: Google, or under E2E
// the test store, which stands in for a connected calendar that starts empty.
// Adding, changing and removing an event is the Calendar's own
// (./camp-events), mirrored onto Google by ./calendar-mirror.

export type { CalendarResult };

/**
 * The next events on the camp calendar: by default Home's "Coming up" (the
 * next CALENDAR_WINDOW_DAYS, a handful); the team pages pass
 * CALENDAR_PAGE_RANGE.
 */
export async function getUpcomingEvents(
  range: CalendarRange = HOME_RANGE,
): Promise<CalendarResult> {
  const now = new Date();
  return usesTestStore()
    ? testStore.listCalendarEvents(now, range)
    : readGoogleCalendar(process.env, now, undefined, range);
}

/**
 * Every event on the camp calendar touching the camp days `from`..`to`, the
 * past included: the Calendar's month and list.
 */
export async function getCalendarRange(range: {
  from: string;
  to: string;
}): Promise<CalendarResult> {
  return usesTestStore()
    ? testStore.listCalendarRange(range)
    : readCalendarRange(range);
}

/** One event on the camp calendar by its id, for a link to it. */
export async function getCalendarEventById(
  eventId: string,
): Promise<CalendarEvent | null | "unavailable"> {
  return usesTestStore()
    ? testStore.getCalendarEvent(eventId)
    : readCalendarEvent(eventId);
}
