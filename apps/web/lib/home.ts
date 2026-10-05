import { CAMP_TIME_ZONE, campDayKey, readTeamEvent } from "@camp404/core";
import type { MyLift } from "@camp404/db/cars";
import type { MyOpenTask } from "@camp404/db/tasks";
import type { CalendarResult } from "./google-calendar";

// What a member's home page shows, decided from their own profile and status
// and nothing else (owner, 2026-09-23: "The dashboard should be built off of
// what that person's profile has … so that we're not overloading them with
// information they don't need or that they don't have a decision on").
//
// Pure: the page gathers the facts, this decides. A card that does not apply
// to the person is not in the model at all, rather than shown empty.

export interface HomeInput {
  now: Date;
  approval: "pending" | "approved";
  /** The keys of every team they are on this year. */
  teamKeys: readonly string[];
  pending: readonly {
    activationId: string;
    title: string;
    blocking: boolean;
    dueAt: Date | null;
  }[];
  /**
   * The tasks this person is responsible for and has not finished: the first
   * few (listMyOpenTasks) and how many there are in all.
   */
  myTasks: { items: readonly MyOpenTask[]; total: number };
  lift: MyLift | null;
  calendar: CalendarResult | null;
  /**
   * Every team in the camp config by key, archived ones too, so a calendar
   * event tagged with a team's key or its name finds the team.
   */
  teamLabels: Readonly<Record<string, string>>;
  /** Two-factor or a passkey is on. Null when it could not be read. */
  secured: boolean | null;
}

export interface HomeTodo {
  id: string;
  label: string;
  href: string;
  /** "Due in 3 days", "Overdue", … or null for no deadline. */
  due: string | null;
  urgent: boolean;
}

/** One of the member's own tasks on the "Your tasks" card. */
export interface HomeTask {
  id: string;
  label: string;
  href: string;
  /** "Due tomorrow", "Overdue", … or null for no deadline. */
  due: string | null;
  /** Due today, tomorrow or already overdue. */
  urgent: boolean;
  /** In the Doing column. */
  doing: boolean;
}

export interface HomeUpcoming {
  id: string;
  title: string;
  /** "Sat 25 Apr", with a time for a timed event. */
  when: string;
  /** "Today", "Tomorrow", "In 12 days". */
  relative: string;
  location: string | null;
  kind: "event" | "travel";
  sortKey: string;
  /**
   * The team a calendar event is for, and whether the viewer is on it this
   * year. Null for a camp-wide event, an event tagged with no known team, and
   * travel.
   */
  team: { label: string; mine: boolean } | null;
}

export interface HomeLift {
  heading: string;
  lines: string[];
}

export interface HomeModel {
  waitingForApproval: boolean;
  todos: HomeTodo[];
  /** At most HOME_TASK_LIMIT of the member's open tasks, soonest first. */
  tasks: HomeTask[];
  /** How many more open tasks they have than the card shows. */
  tasksMore: number;
  upcoming: HomeUpcoming[];
  /** Why "coming up" may be short: the calendar is off or unreachable. */
  calendarState: CalendarResult["status"] | null;
  lift: HomeLift | null;
  checklist: { label: string; done: boolean }[];
  allDone: boolean;
}

const DAY_MS = 86_400_000;

/** The most tasks the "Your tasks" card lists; the rest are on /tasks. */
export const HOME_TASK_LIMIT = 5;

/** Whole days from one YYYY-MM-DD to another (UTC round-trip, no clock drift). */
export function daysBetween(fromKey: string, toKey: string): number {
  return Math.round(
    (Date.parse(`${toKey}T00:00:00Z`) - Date.parse(`${fromKey}T00:00:00Z`)) /
      DAY_MS,
  );
}

/** "Today", "Tomorrow", "In 12 days", "Yesterday", "3 days ago". */
export function relativeDay(days: number): string {
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days > 1) return `In ${days} days`;
  if (days === -1) return "Yesterday";
  return `${-days} days ago`;
}

/** "Overdue", "Due today", "Due tomorrow", "Due in 3 days". */
export function dueLabel(days: number): string {
  if (days < 0) return "Overdue";
  if (days === 0) return "Due today";
  if (days === 1) return "Due tomorrow";
  return `Due in ${days} days`;
}

const DATE = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "short",
  timeZone: CAMP_TIME_ZONE,
});
const DATE_UTC = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});
const TIME = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: CAMP_TIME_ZONE,
});

/** "Sat 25 Apr" without the comma Intl puts after the weekday. */
function tidy(text: string): string {
  return text.replace(",", "");
}

function upcomingFromCalendar(
  calendar: CalendarResult | null,
  today: string,
  teamLabels: Readonly<Record<string, string>>,
  myTeams: ReadonlySet<string>,
): HomeUpcoming[] {
  if (calendar?.status !== "ok") return [];
  const teams = Object.entries(teamLabels).map(([key, label]) => ({
    key,
    label,
  }));
  return calendar.events.map((event) => {
    // The team's prefix comes off the title ("Kitchen Team - Briefing", or the
    // older "[Kitchen] Briefing") only when it names a camp team; the badge
    // says whose it is. "[Cancelled] ..." is the author's word and stays.
    const read = readTeamEvent(event.title, event.teamTag, teams);
    const title = read.title;
    const team = read.team
      ? { label: read.team.label, mine: myTeams.has(read.team.key) }
      : null;
    if (event.allDay) {
      // An all-day event is a date, not an instant: shown as that date in
      // every time zone.
      const day = event.start.slice(0, 10);
      return {
        id: `event:${event.id}`,
        title,
        when: tidy(DATE_UTC.format(new Date(`${day}T00:00:00Z`))),
        relative: relativeDay(daysBetween(today, day)),
        location: event.location,
        kind: "event" as const,
        sortKey: `${day}T00:00`,
        team,
      };
    }
    const at = new Date(event.start);
    const day = campDayKey(at);
    return {
      id: `event:${event.id}`,
      title,
      when: `${tidy(DATE.format(at))} · ${TIME.format(at)}`,
      relative: relativeDay(daysBetween(today, day)),
      location: event.location,
      kind: "event" as const,
      sortKey: `${day}T${TIME.format(at)}`,
      team,
    };
  });
}

function upcomingFromLift(lift: MyLift | null, today: string): HomeUpcoming[] {
  if (!lift) return [];
  const out: HomeUpcoming[] = [];
  const add = (id: string, title: string, at: Date | null) => {
    if (!at) return;
    const day = campDayKey(at);
    const days = daysBetween(today, day);
    if (days < 0) return;
    out.push({
      id,
      title,
      when: tidy(DATE.format(at)),
      relative: relativeDay(days),
      location: null,
      kind: "travel",
      sortKey: `${day}T${TIME.format(at)}`,
      team: null,
    });
  };
  add("travel:arrive", "You arrive at camp", lift.arrivalAt);
  add("travel:leave", "You leave camp", lift.departureAt);
  return out;
}

/** The lift card: what Home shows about the member's car or seat. */
export function liftCard(lift: MyLift | null): HomeLift | null {
  if (!lift) return null;
  if (lift.role === "driver") {
    const seats =
      lift.seatsOffered != null
        ? `${lift.riders.length} of ${lift.seatsOffered} seats taken`
        : `${lift.riders.length} riding with you`;
    return {
      heading: "You're driving",
      lines: [
        lift.vehicle,
        seats,
        lift.riders.length > 0 ? `With ${lift.riders.join(", ")}` : null,
        lift.departureCity ? `From ${lift.departureCity}` : null,
      ].filter((l): l is string => Boolean(l)),
    };
  }
  return {
    heading: "Your lift",
    lines: [
      lift.driverName ? `Riding with ${lift.driverName}` : "You have a seat",
      lift.vehicle,
      lift.departureCity ? `From ${lift.departureCity}` : null,
    ].filter((l): l is string => Boolean(l)),
  };
}

/** The Today gadget's model, built from the member's own facts. */
export function buildHome(input: HomeInput): HomeModel {
  const today = campDayKey(input.now);
  const approved = input.approval === "approved";

  // To do: only what this person must act on. Soonest deadline first; a form
  // with no deadline goes after every dated one.
  const todos: HomeTodo[] = approved
    ? [...input.pending]
        .sort((a, b) => {
          if (a.blocking !== b.blocking) return a.blocking ? -1 : 1;
          if (!a.dueAt || !b.dueAt) {
            return a.dueAt ? -1 : b.dueAt ? 1 : 0;
          }
          return a.dueAt.getTime() - b.dueAt.getTime();
        })
        .map((q) => {
          const days = q.dueAt ? daysBetween(today, campDayKey(q.dueAt)) : null;
          return {
            id: `form:${q.activationId}`,
            label: q.title,
            href: `/questionnaires/${q.activationId}`,
            due: days === null ? null : dueLabel(days),
            urgent: q.blocking || (days !== null && days <= 2),
          };
        })
    : [];

  // Your tasks: what they are responsible for on the board. Soonest camp-day
  // deadline first, no deadline last; the board holds the rest.
  const tasks: HomeTask[] = approved
    ? input.myTasks.items
        .map((t) => ({
          task: t,
          days: t.dueAt ? daysBetween(today, campDayKey(t.dueAt)) : null,
        }))
        .sort((a, b) => {
          if (a.days === null || b.days === null) {
            return a.days !== null ? -1 : b.days !== null ? 1 : 0;
          }
          return a.days - b.days;
        })
        .slice(0, HOME_TASK_LIMIT)
        .map(({ task, days }) => ({
          id: `task:${task.id}`,
          label: task.title,
          href: "/tasks",
          due: days === null ? null : dueLabel(days),
          urgent: days !== null && days <= 1,
          doing: task.status === "in_progress",
        }))
    : [];
  const tasksMore = approved
    ? Math.max(0, input.myTasks.total - tasks.length)
    : 0;

  // Coming up: the camp calendar and your own travel dates, soonest first.
  const upcoming = approved
    ? [
        ...upcomingFromCalendar(
          input.calendar,
          today,
          input.teamLabels,
          new Set(input.teamKeys),
        ),
        ...upcomingFromLift(input.lift, today),
      ]
        .sort((a, b) => a.sortKey.localeCompare(b.sortKey))
        .slice(0, 6)
    : [];

  const checklist = [
    { label: "Burner bio", done: true },
    { label: "Approved by a captain", done: approved },
    ...(approved
      ? [{ label: "Forms answered", done: input.pending.length === 0 }]
      : []),
    ...(input.secured === null
      ? []
      : [{ label: "Sign-in secured", done: input.secured }]),
  ];

  return {
    waitingForApproval: !approved,
    todos,
    tasks,
    tasksMore,
    upcoming,
    calendarState: approved ? (input.calendar?.status ?? null) : null,
    lift: approved ? liftCard(input.lift) : null,
    checklist,
    allDone: checklist.every((c) => c.done),
  };
}
