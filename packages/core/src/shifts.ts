import {
  MAX_SHIFT_DAYS,
  SHIFT_MINIMUM,
  type NotificationPayload,
  type ParticipationStatus,
} from "@camp404/types";
import { CAPTAIN_ONLY, allowsRank, type Rule } from "./actor";
import { clockText } from "./lounge";
import { isComingThisYear } from "./participation";
import { teamProgramEditor } from "./team-programs";

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

/** Who may set up `team`'s shifts: the team program's editors. */
export function shiftKeeper(team: string): Rule {
  return teamProgramEditor(team);
}

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
  return allowsRank(shiftKeeper(team), rank, ledTeams);
}

/** The teams, of `teams`, whose shifts someone may set up. */
export function shiftTeamsFor(
  rank: string,
  ledTeams: readonly string[],
  teams: readonly string[],
): string[] {
  return teams.filter((t) => canManageShifts(rank, ledTeams, t));
}

/** Who may press "Ask everyone" about shifts: a captain. */
export const SHIFT_ASKER: Rule = CAPTAIN_ONLY;

/**
 * Whether someone may press "Ask everyone" about shifts: a captain. It sends
 * a notice to every member who is coming, and a lead's reach is one team
 * (canSendToAudience), as for the logistics days. Fails closed.
 */
export function canAskForShifts(rank: string): boolean {
  return allowsRank(SHIFT_ASKER, rank);
}

/**
 * Whether a slot on `day` still takes sign-ups and changes on `today` (both
 * camp days, YYYY-MM-DD): until its day starts. From then on the printed
 * roster and the pen are the tool (owner: no internet on site).
 */
export function shiftChangesOpen(day: string, today: string): boolean {
  return today < day;
}

// --- Refusals the database and the store share ---------------------------------

export const SHIFT_TYPE_CHANGED =
  "Someone changed this shift first. Reload the page.";
export const SHIFT_SLOT_CHANGED =
  "Someone changed this day first. Reload the page.";
export const SHIFT_FULL = "That shift is full. Pick another one.";
export const SHIFT_NOT_NEEDED = "That shift isn't needed that day.";
export const SHIFT_ALREADY_ON = "You're already on this shift.";
export const SHIFT_MEMBER_ALREADY_ON = "They're already on this shift.";
export const SHIFT_CLOSED =
  "That day has started. Change the printed roster instead.";
export const SHIFT_NOT_A_MEMBER = "Only approved camp members can take shifts.";
export const SHIFT_HAS_PEOPLE =
  "People are on this shift. Take them off first.";
export const SHIFT_DAY_HAS_PEOPLE =
  "People are on this day. Take them off first.";

/** Fewer places than people already on one of its days. */
export function placesBelowTaken(taken: number): string {
  return `${taken} people are already on one of its days. Keep at least ${taken} places, or take someone off first.`;
}

/** What taking a place decides on, read under the slot's lock. */
export interface PlaceAsk {
  /** The slot's day and the camp's today (YYYY-MM-DD). */
  day: string;
  today: string;
  status: string;
  /** The person is an approved camp member. */
  member: boolean;
  /** They are on this slot already. */
  already: boolean;
  /** A lead or a captain is putting them on (not their own sign-up). */
  placed: boolean;
  /** Who is on it now, and how many it takes. */
  taken: number;
  places: number;
}

/**
 * Why a place on a slot may not be taken, in the order the database checks
 * (takePlace in @camp404/db/shifts, and the store's twin): the day has
 * started, the day is not needed, not a member, on it already, full. Null
 * when the place may be taken.
 */
export function placeProblem(ask: PlaceAsk): string | null {
  if (!shiftChangesOpen(ask.day, ask.today)) return SHIFT_CLOSED;
  if (ask.status !== "open") return SHIFT_NOT_NEEDED;
  if (!ask.member) return SHIFT_NOT_A_MEMBER;
  if (ask.already)
    return ask.placed ? SHIFT_MEMBER_ALREADY_ON : SHIFT_ALREADY_ON;
  if (ask.taken >= ask.places) return SHIFT_FULL;
  return null;
}

/**
 * Why a day's slot may not be marked needed or not needed, in the database's
 * order: someone changed it first, its day has started, people are on it
 * (only for "not needed"). Null when the change may go ahead.
 */
export function slotNeededProblem(ask: {
  version: number;
  expectedVersion: number;
  day: string;
  today: string;
  needed: boolean;
  taken: number;
}): string | null {
  if (ask.version !== ask.expectedVersion) return SHIFT_SLOT_CHANGED;
  if (!shiftChangesOpen(ask.day, ask.today)) return SHIFT_CLOSED;
  if (!ask.needed && ask.taken > 0) return SHIFT_DAY_HAS_PEOPLE;
  return null;
}

/** What changing or removing a shift type decides on, read under its lock. */
export interface ShiftTypeAsk {
  version: number;
  expectedVersion: number;
  /** The days it has a slot on. */
  days: readonly string[];
  today: string;
}

function typeLocked(ask: ShiftTypeAsk): string | null {
  if (ask.version !== ask.expectedVersion) return SHIFT_TYPE_CHANGED;
  // A change reaches every day of the shift, and a day that has started is
  // on paper now: the printed roster is the record.
  if (ask.days.some((day) => !shiftChangesOpen(day, ask.today))) {
    return SHIFT_CLOSED;
  }
  return null;
}

/**
 * Why a shift type may not be changed to `places`, in the database's order:
 * someone changed it first, one of its days has started, more people are on
 * one of its days (`mostOnADay`) than the new places. Null when it may.
 */
export function shiftTypeChangeProblem(
  ask: ShiftTypeAsk & { places: number; mostOnADay: number },
): string | null {
  const locked = typeLocked(ask);
  if (locked) return locked;
  if (ask.mostOnADay > ask.places) return placesBelowTaken(ask.mostOnADay);
  return null;
}

/**
 * Why a shift type may not be removed, in the database's order: someone
 * changed it first, one of its days has started, people are on it. Null when
 * it may.
 */
export function shiftTypeRemoveProblem(
  ask: ShiftTypeAsk & { people: number },
): string | null {
  return typeLocked(ask) ?? (ask.people > 0 ? SHIFT_HAS_PEOPLE : null);
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

const DAY_TAB = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  timeZone: "UTC",
});
const DAY_LONG = new Intl.DateTimeFormat("en-GB", {
  weekday: "long",
  day: "numeric",
  month: "long",
  timeZone: "UTC",
});

/** A camp day as a day tab says it: "Wed 29". */
export function shiftDayTab(day: string): string {
  const at = utcDay(day);
  return at === null ? day : DAY_TAB.format(new Date(at * DAY_MS));
}

/** A camp day in full, for a heading: "Wednesday 29 April". */
export function shiftDayLong(day: string): string {
  const at = utcDay(day);
  return at === null ? day : DAY_LONG.format(new Date(at * DAY_MS));
}

/** A shift's hours as "08:00–10:00". */
export function shiftTimeText(
  startMinute: number,
  durationMinutes: number,
): string {
  return `${clockText(startMinute)}–${clockText(startMinute + durationMinutes)}`;
}

/**
 * How often a shift runs, for its duty card's page (#250): "every day" when
 * it is needed on each of the Burn's days, else "on N days".
 */
export function shiftDaysText(days: number, burnDays: number): string {
  if (days <= 0) return "on no days yet";
  if (burnDays > 0 && days >= burnDays) return "every day";
  return days === 1 ? "on 1 day" : `on ${days} days`;
}

/**
 * The other shifts that use the same duty card as `typeId`, by name (the
 * set-up's "also on Dinner dishes"). Empty when the card serves none.
 */
export function dutyCardAlsoOn(
  cardId: string,
  typeId: string | null,
  types: readonly { id: string; name: string; dutyCardId: string | null }[],
): string[] {
  return types
    .filter((t) => t.dutyCardId === cardId && t.id !== typeId)
    .map((t) => t.name);
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
