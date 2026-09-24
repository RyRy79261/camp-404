import type { TeamPerson } from "@camp404/db/team-memberships";
import type { CalendarDay, CalendarItem } from "./calendar-view";
import type { TaskCard } from "./task-board";

// What a team's page shows (owner, 2026-09-24: "team overviews that show team
// events"; the first slice of the team dashboards, #267). Pure: the page reads
// the team's people, the calendar and the board, and this decides what goes
// where. Every approved member sees the same page; nothing on it is private
// beyond what the roster, the calendar and the task board already show them.

/** How many events the page lists before "See all on the calendar". */
export const TEAM_EVENT_LIMIT = 8;

export interface TeamPageEvent {
  item: CalendarItem;
  /** The day: "Today", "Tomorrow" or "Fri 2 Oct". */
  day: string;
}

export interface TeamPageModel {
  leads: TeamPerson[];
  members: TeamPerson[];
  /** Whether the viewer is on the team this year, and leads it. */
  viewer: { onTeam: boolean; leads: boolean };
  events: TeamPageEvent[];
  /** How many more events the calendar holds than the page lists. */
  eventsMore: number;
  /** The team's tasks still to do or being done, soonest deadline first. */
  tasks: TaskCard[];
}

export function buildTeamPage(input: {
  viewerId: string;
  people: readonly TeamPerson[];
  /** The team's days on the calendar (buildCalendarDays with its filter). */
  days: readonly CalendarDay[];
  /** Every card on the board, for this viewer. */
  cards: readonly TaskCard[];
  team: string;
}): TeamPageModel {
  const me = input.people.find((p) => p.id === input.viewerId);
  const events = input.days.flatMap((day) =>
    day.items.map((item) => ({
      item,
      day:
        day.relative === "Today" || day.relative === "Tomorrow"
          ? day.relative
          : day.date,
    })),
  );
  return {
    leads: input.people.filter((p) => p.isLead),
    members: input.people.filter((p) => !p.isLead),
    viewer: { onTeam: me !== undefined, leads: me?.isLead ?? false },
    events: events.slice(0, TEAM_EVENT_LIMIT),
    eventsMore: Math.max(0, events.length - TEAM_EVENT_LIMIT),
    // The board lists soonest deadline first; Done is not open work.
    tasks: input.cards.filter(
      (c) => c.team === input.team && c.status !== "done",
    ),
  };
}
