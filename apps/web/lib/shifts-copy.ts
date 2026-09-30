import { SHIFT_MINIMUM } from "@camp404/types";

// The shift roster's fixed sentences (#248). A plain module: a "use server"
// file may export only async functions, so the actions and the screens share
// these from here. Pure, so the client components import it too.

export const SHIFTS_PATH = "/shifts";
export const MY_SHIFTS_PATH = "/shifts/mine";
export const SHIFTS_PRINT_PATH = "/print/shifts";
export const MY_SHIFTS_PRINT_PATH = "/print/shifts/mine";
export const LOGISTICS_PATH = "/logistics";

/** What anyone who may not set shifts up is told, on the page. */
export const SHIFTS_REFUSAL =
  "Captains and each team's leads set up that team's shifts. Sanitation sets up the cleaning. Anyone can sign up.";
/** What the action says to someone who may set up no team's shifts. */
export const SHIFTS_ACTION_REFUSAL =
  "Only captains and that team's leads can set up its shifts.";
export const ASK_SHIFTS_REFUSAL =
  "Only captains can ask everyone about shifts.";
export const CHECK_SHIFT = "Check the shift and try again.";
export const RELOAD = "Reload the page and try again.";

/** How the roster works, said once near the top. */
export const PAPER_NOTE = `Sign up here before the burn. The roster gets printed for site, and changes on site go on the paper. There is no internet out there. Everyone takes at least ${SHIFT_MINIMUM} shifts.`;

/** What the toast says after "Ask everyone" about shifts. */
export function shiftsAskedText(asked: number, notified: number): string {
  if (asked === 0) {
    return `Nobody to ask: everyone who is coming has ${SHIFT_MINIMUM} shifts.`;
  }
  const people = asked === 1 ? "1 member" : `${asked} members`;
  if (notified === asked) return `Asked ${people}.`;
  const quiet = asked - notified;
  return notified === 0
    ? `${people} already ${asked === 1 ? "has" : "have"} the ask unread. No second notice was sent.`
    : `Asked ${people}. ${quiet} already had the ask unread and got no second notice.`;
}

/** "2 of 4 places" */
export function placesText(taken: number, places: number): string {
  return `${taken} of ${places} ${places === 1 ? "place" : "places"}`;
}

/** Hours and minutes typed as "08:30" into minutes after midnight. */
export function minutesFromClock(value: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/** Minutes after midnight as "08:30", for a time input. */
export function clockFromMinutes(minutes: number): string {
  const h = String(Math.floor(minutes / 60)).padStart(2, "0");
  const m = String(minutes % 60).padStart(2, "0");
  return `${h}:${m}`;
}
