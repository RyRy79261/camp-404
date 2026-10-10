import "server-only";

import {
  calendarWriteConfig,
  deleteCalendarEvent,
  forgetCalendarCache,
  putCalendarEvent,
  type CalendarEventBody,
} from "./google-calendar";
import { usesTestStore } from "./test-mode";
import { testStore } from "./test-store";

// Making the camp's shared Google Calendar match a row the app saved: a
// logistics phase, an AfrikaBurn date (#247), or an event made in the
// Calendar. The row is saved first (the rule, the compare-and-set and the
// audit row, in one transaction that also claims the row's Google event id).
// Then, with no transaction open, the event is put under that id (an update,
// or a create when Google has none), or, for a row that lost its date or was
// removed, deleted. A save is never lost to a Google failure: the catch-up on
// a later page load (catchUpCampCalendar, no cron) puts it right, under the
// same id, so nothing is duplicated.
//
// Only production writes to Google (calendarWriteConfig, mayContactMembers).
// Under E2E the store's own event list stands in for Google.

/** How the camp calendar stands after a save. */
export type CalendarMirrorOutcome =
  /** The camp calendar matches the row. */
  | "synced"
  /** There is no camp calendar to write to: it is in the app only. */
  | "not_connected"
  /** Google did not take the change; the catch-up retries. */
  | "failed";

/** One row, as the mirror needs it. */
export interface MirrorTarget {
  step: "put" | "remove" | "none";
  eventId: string | null;
  /** The event to put, when the step is `put`. */
  event: { body: CalendarEventBody } | null;
  /** Record that the calendar matches this version. False: a newer one landed. */
  mark: (removed: boolean) => Promise<boolean> | boolean;
  /** The row as it stands now, to follow a newer save. */
  latest: () => Promise<MirrorTarget | undefined>;
}

/** Whether there is a camp calendar to write to. */
export function isCampCalendarWritable(): boolean {
  return usesTestStore() || calendarWriteConfig(process.env) !== null;
}

/** How many times a sync follows a newer save before it gives up. */
const MAX_SYNC_ROUNDS = 3;

async function removeEvent(id: string): Promise<boolean> {
  return usesTestStore()
    ? testStore.deleteCalendarEvent(id)
    : deleteCalendarEvent(process.env, id);
}

/**
 * Make the camp calendar match a row as saved. Never throws.
 *
 * Google is written with no lock held, so two saves close together can reach
 * Google in the wrong order. The mark is a compare-and-set on the version:
 * when it misses, a newer save has landed, and what this step just wrote may
 * be stale. So it reads the row again and makes Google match that instead,
 * first taking off an event it put under an id the row no longer holds.
 * Whichever step finishes last therefore leaves Google matching the newest
 * save.
 */
export async function mirror(
  target: MirrorTarget,
  actorId: string | null,
  round = 1,
): Promise<CalendarMirrorOutcome> {
  if (!isCampCalendarWritable()) return "not_connected";
  const { step, eventId } = target;
  try {
    let marked = true;
    if (step === "put" && eventId && target.event) {
      if (usesTestStore()) {
        testStore.putCalendarEvent({
          id: eventId,
          body: target.event.body,
          actorId: actorId ?? "",
        });
      } else {
        await putCalendarEvent(process.env, eventId, target.event.body);
      }
      marked = await target.mark(false);
    } else if (step === "remove" && eventId) {
      if (!(await removeEvent(eventId))) return "failed";
      marked = await target.mark(true);
    }
    forgetCalendarCache();
    if (marked) return "synced";

    // A newer save landed while this step was at Google.
    const latest = await target.latest();
    if (
      step === "put" &&
      eventId &&
      latest?.eventId !== eventId &&
      !(await removeEvent(eventId))
    ) {
      return "failed";
    }
    if (!latest || round >= MAX_SYNC_ROUNDS) return "failed";
    return await mirror(latest, actorId, round + 1);
  } catch {
    // putCalendarEvent has logged the HTTP status, and nothing secret.
    return "failed";
  }
}
