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
import { testStore } from "./test-store";
import { twin } from "./twin";

// The camp's shared Google Calendar as the pages read it: Google, or under E2E
// the test store, which stands in for a connected calendar that starts empty.
// Adding, changing and removing an event is the Calendar's own
// (./camp-events), mirrored onto Google by ./calendar-mirror.

export type { CalendarResult };

const calendar = twin(
  {
    listCalendarEvents: (now: Date, range?: CalendarRange) =>
      readGoogleCalendar(process.env, now, undefined, range),
    listCalendarRange: (range: { from: string; to: string }) =>
      readCalendarRange(range),
    getCalendarEvent: (eventId: string) => readCalendarEvent(eventId),
  },
  testStore,
  ["listCalendarEvents", "listCalendarRange", "getCalendarEvent"],
);

/**
 * The next events on the camp calendar: by default Home's "Coming up" (the
 * next CALENDAR_WINDOW_DAYS, a handful); the team pages pass
 * CALENDAR_PAGE_RANGE.
 */
export async function getUpcomingEvents(
  range: CalendarRange = HOME_RANGE,
): Promise<CalendarResult> {
  return calendar.listCalendarEvents(new Date(), range);
}

/**
 * Every event on the camp calendar touching the camp days `from`..`to`, the
 * past included: the Calendar's month and list.
 */
export async function getCalendarRange(range: {
  from: string;
  to: string;
}): Promise<CalendarResult> {
  return calendar.listCalendarRange(range);
}

/** One event on the camp calendar by its id, for a link to it. */
export async function getCalendarEventById(
  eventId: string,
): Promise<CalendarEvent | null | "unavailable"> {
  return calendar.getCalendarEvent(eventId);
}
