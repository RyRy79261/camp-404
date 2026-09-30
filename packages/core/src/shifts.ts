import {
  MAX_SHIFT_DAYS,
  SHIFT_MINIMUM,
  type NotificationPayload,
  type ParticipationStatus,
} from "@camp404/types";
import { clockText } from "./lounge";
import { isComingThisYear } from "./participation";
import { canEditTeamProgram } from "./team-programs";

// The shift roster (#248). Pure: no DB, no session, no next/*.
//
// THE OWNER'S RULINGS (2026-09-30). Members sign up in the app BEFORE the
// burn; the roster is printed for site; changes on site are written on the
// paper and nobody types them back in. There is no internet at the burn, so
// nothing here may need the app during it: a slot stops taking changes when
// its day starts (shiftChangesOpen), and from then on the paper is the roster.
// Each member is asked for at least SHIFT_MINIMUM shifts, as a reminder only,
// never a block.
//
// WHO MAY SET SHIFTS UP. A shift type belongs to one team. A captain, or a
// lead OF THAT TEAM this year, adds it, changes it, marks a day not needed,
// and puts members on it or takes them off (the team-program rule,
// canEditTeamProgram). Cleaning shifts belong to Sanitation (owner: "Sanitation
// leads and captains set up cleaning shifts"). Every approved member takes any
// open shift. Clearance stays global (AGENTS.md); team identity decides only
// which team's shifts a lead may set up. It fails closed on a rank or a team
// this module does not know. The write re-reads the actor's rank and led teams
// inside its own transaction and passes those here; it never takes a team list
// from the caller.

/** The team whose leads set up the cleaning shifts. */
export const CLEANING_TEAM = "sanitation_and_water";

/**
 * Whether someone may set up `team`'s shifts: add, change or remove a shift
 * type, mark a day not needed, and put members on or take them off. A captain,
 * or a lead of that team this year.
 */
export function canManageShifts(
  rank: string,
  ledTeams: readonly string[],
  team: string,
): boolean {
  return canEditTeamProgram(rank, ledTeams, team);
}

/** The teams, of `teams`, whose shifts someone may set up. */
export function shiftTeamsFor(
  rank: string,
  ledTeams: readonly string[],
  teams: readonly string[],
): string[] {
  return teams.filter((t) => canManageShifts(rank, ledTeams, t));
}

/**
 * Whether someone may press "Ask everyone" about shifts: a captain. It sends
 * a notice to every member who is coming, and a lead's reach is one team
 * (canSendToAudience), as for the logistics days. Fails closed.
 */
export function canAskForShifts(rank: string): boolean {
  return rank === "captain";
}

/**
 * Whether a slot on `day` still takes sign-ups and changes on `today` (both
 * camp days, YYYY-MM-DD): until its day starts. From then on the printed
 * roster and the pen are the tool (owner: no internet on site).
 */
export function shiftChangesOpen(day: string, today: string): boolean {
  return today < day;
}

// --- Days and times ------------------------------------------------------------

const DAY_MS = 86_400_000;
const DAY_MINUTES = 24 * 60;

function utcDay(isoDate: string): number | null {
  const ms = Date.parse(`${isoDate}T00:00:00Z`);
  return Number.isNaN(ms) ? null : Math.round(ms / DAY_MS);
}

/**
 * The roster's days: every day of the Burn, from the logistics calendar's
 * Burn phase (at most MAX_SHIFT_DAYS). Empty when its days are not set.
 */
export function shiftDays(
  burn: { start: string | null; end: string | null } | null,
): string[] {
  const start = burn?.start ? utcDay(burn.start) : null;
  const end = burn?.end ? utcDay(burn.end) : null;
  if (start === null || end === null || end < start) return [];
  const count = Math.min(end - start + 1, MAX_SHIFT_DAYS);
  return Array.from({ length: count }, (_, i) =>
    new Date((start + i) * DAY_MS).toISOString().slice(0, 10),
  );
}

const DAY_LABEL = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "short",
  // A UTC midnight standing for a calendar day, so read in UTC.
  timeZone: "UTC",
});

/** A camp day as "Wed 29 Apr". */
export function shiftDayLabel(day: string): string {
  const at = utcDay(day);
  return at === null ? day : DAY_LABEL.format(new Date(at * DAY_MS));
}

/** A shift's hours as "08:00–10:00". */
export function shiftTimeText(
  startMinute: number,
  durationMinutes: number,
): string {
  return `${clockText(startMinute)}–${clockText(startMinute + durationMinutes)}`;
}

/** Something on a member's week: a shift, or an AfrikaBurn volunteer shift. */
export interface TimedItem {
  key: string;
  day: string;
  startMinute: number;
  durationMinutes: number;
}

/** When an item runs, in minutes since 1970, so a night shift runs on. */
function windowOf(item: TimedItem): { from: number; to: number } | null {
  const d = utcDay(item.day);
  if (d === null) return null;
  const from = d * DAY_MINUTES + item.startMinute;
  return { from, to: from + item.durationMinutes };
}

/**
 * The pairs of items that overlap in time (a shift that ends as the next
 * starts does not clash). Each pair once, in the order given.
 */
export function shiftClashes(items: readonly TimedItem[]): [string, string][] {
  const windows = items.map((item) => ({ item, at: windowOf(item) }));
  const out: [string, string][] = [];
  for (let i = 0; i < windows.length; i++) {
    for (let j = i + 1; j < windows.length; j++) {
      const a = windows[i]!.at;
      const b = windows[j]!.at;
      if (!a || !b) continue;
      if (a.from < b.to && b.from < a.to) {
        out.push([windows[i]!.item.key, windows[j]!.item.key]);
      }
    }
  }
  return out;
}

// --- The minimum, as a reminder ------------------------------------------------

/**
 * The reminder a member reads while they have fewer than SHIFT_MINIMUM
 * shifts, or null once they have enough. Never a block.
 */
export function shiftReminderText(count: number): string | null {
  if (count >= SHIFT_MINIMUM) return null;
  const on =
    count === 0
      ? "You're not on any shifts yet."
      : `You're on ${count} ${count === 1 ? "shift" : "shifts"}.`;
  return `${on} The camp asks everyone for at least ${SHIFT_MINIMUM}.`;
}

/** The nudge's key in `required_actions`. */
export const SHIFTS_ACTION_KEY = "shift_minimum";
/** What the member is asked to do, in their words. */
export const SHIFTS_ACTION_TITLE = `Sign up for at least ${SHIFT_MINIMUM} shifts`;
/** The `ref_type` of the notice, which opens Shifts. */
export const SHIFTS_REF_TYPE = "shift_minimum";

/**
 * Who "Ask everyone" reaches: a member who is coming this year (said Yes, or
 * a captain accepted them), as for the logistics days and the gear rental.
 */
export function isAskedForShifts(status: ParticipationStatus | null): boolean {
  return isComingThisYear(status);
}

/** The notice "Ask everyone" sends. It opens Shifts. */
export function shiftsAskNotification(input: {
  requiredActionId: string | null;
}): NotificationPayload {
  return {
    kind: "questionnaire_reminder",
    title: SHIFTS_ACTION_TITLE,
    body: `The shift roster is open. Open Shifts and take at least ${SHIFT_MINIMUM} before the burn. It gets printed for site.`,
    refType: SHIFTS_REF_TYPE,
    refId: input.requiredActionId,
  };
}

// --- Fairness ------------------------------------------------------------------

/** One member's line in the fairness view. */
export interface ShiftFairnessRow {
  userId: string;
  name: string;
  count: number;
  /** Below SHIFT_MINIMUM. */
  below: boolean;
}

/**
 * Shifts per member who is coming, counted by member id (never by a typed
 * name): fewest first, then by name.
 */
export function shiftFairness(
  coming: readonly { userId: string; name: string }[],
  signedUpUserIds: readonly string[],
): ShiftFairnessRow[] {
  const counts = new Map<string, number>();
  for (const id of signedUpUserIds) counts.set(id, (counts.get(id) ?? 0) + 1);
  return coming
    .map((m) => {
      const count = counts.get(m.userId) ?? 0;
      return {
        userId: m.userId,
        name: m.name,
        count,
        below: count < SHIFT_MINIMUM,
      };
    })
    .sort((a, b) => a.count - b.count || a.name.localeCompare(b.name));
}
