import { logisticsPhaseDays } from "@camp404/types";

// The logistics screen's fixed sentences (#247). A plain module: a "use
// server" file may export only async functions, so the actions and the screen
// share these from here. Pure, so the client dialog imports it too.

export const LOGISTICS_PATH = "/logistics";

/** What anyone who is not an editor is told, on the page and by the action. */
export const LOGISTICS_REFUSAL =
  "Only captains and Transport and Logistics leads can change the logistics days.";
export const CHECK_PHASE = "Check the days and try again.";

/** Who may ask everyone about the logistics days. */
export const ASK_REFUSAL =
  "Only captains can ask everyone about the logistics days.";

/** Who may change the AfrikaBurn deadlines, on the page and by the action. */
export const DEADLINES_REFUSAL =
  "Only captains can change the AfrikaBurn deadlines.";
export const CHECK_DEADLINE = "Check the deadline and try again.";

/** Where captains keep the deadlines: the camp's year. */
export const YEAR_SETTINGS_PATH = "/captains/camp-settings/cycle";

/** A date AfrikaBurn has not given yet. */
export const NOT_ANNOUNCED_YET = "Not announced yet";

/** After a deadline save that Google did not take. */
export const DEADLINE_NOT_ON_CALENDAR =
  "Saved, but it couldn't be put on the camp calendar. It will be tried again.";

/** What the toast says after "Ask everyone" about attendance. */
export function attendanceAskedText(asked: number, notified: number): string {
  if (asked === 0) {
    return "Nobody to ask: everyone who is coming has answered.";
  }
  const people = asked === 1 ? "1 member" : `${asked} members`;
  if (notified === asked) return `Asked ${people}.`;
  const quiet = asked - notified;
  return notified === 0
    ? `${people} already ${asked === 1 ? "has" : "have"} the ask unread. No second notice was sent.`
    : `Asked ${people}. ${quiet} already had the ask unread and got no second notice.`;
}

/** Said once at the top when there is no camp calendar to write to. */
export const CALENDAR_NOT_CONNECTED_NOTE =
  "The camp calendar isn't connected, so these days are only in the app for now.";

/** After a save that Google did not take. */
export const SAVED_NOT_ON_CALENDAR =
  "Saved, but it couldn't be put on the camp calendar. Save again to retry.";

const DAY_FORMAT = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});
const YEAR_FORMAT = new Intl.DateTimeFormat("en-GB", {
  year: "numeric",
  timeZone: "UTC",
});

/** A camp day (YYYY-MM-DD) as "Sat 24 Apr". The day is a date, not a moment. */
function dayText(day: string): string {
  return DAY_FORMAT.format(new Date(`${day}T00:00:00Z`));
}

/**
 * A phase's days in plain words: "Sat 24 Apr 2027, 1 day" or "Sat 24 Apr to
 * Mon 26 Apr 2027, 3 days".
 */
export function phaseDaysText(start: string, end: string): string {
  const days = logisticsPhaseDays(start, end);
  const year = YEAR_FORMAT.format(new Date(`${end}T00:00:00Z`));
  const range =
    start === end
      ? `${dayText(start)} ${year}`
      : `${dayText(start)} to ${dayText(end)} ${year}`;
  return `${range}, ${days} day${days === 1 ? "" : "s"}`;
}

/** A deadline's date in plain words: "Fri 15 Jan 2027". */
export function deadlineDateText(day: string): string {
  return `${dayText(day)} ${YEAR_FORMAT.format(new Date(`${day}T00:00:00Z`))}`;
}
