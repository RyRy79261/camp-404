import { CAMP_TIME_ZONE, campDayKey, readTeamEvent } from "@camp404/core";
import type { MyLift } from "@camp404/db/cars";
import type { MyOpenTask } from "@camp404/db/tasks";
import type { CalendarResult } from "./google-calendar";
import type { InboxBadge } from "./inbox-badge";
import {
  buildProgramManifest,
  manifestProgramIds,
  type ProgramManifest,
} from "./programs";

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
  firstName: string | null;
  isCaptain: boolean;
  /** Every team they are on this year — there may be several, led or not. */
  teams: readonly {
    key: string;
    label: string;
    isLead: boolean;
    /** Unread announcements sent to this team. */
    unread: number;
  }[];
  pending: readonly {
    activationId: string;
    title: string;
    blocking: boolean;
    dueAt: Date | null;
  }[];
  /**
   * The inbox count from `getInboxBadge`: the Notifications tile shows its
   * total, the same number as the bell.
   */
  inbox: InboxBadge;
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

/** The module tiles. `icon` is a key the view maps to a picture. */
export type HomeModuleIcon =
  | "announcements"
  | "forms"
  | "message"
  | "send-form"
  | "overview"
  | "tasks"
  | "add-event";

export interface HomeModule {
  id: string;
  href: string;
  label: string;
  icon: HomeModuleIcon;
  /** A count of new things, or null for none. */
  badge: number | null;
  /**
   * What the count is, after the number in the tile's accessible name
   * ("Notifications, 2 waiting"). Absent means "new".
   */
  badgeSays?: string;
}

/** One of the member's teams, as an icon with a "new" dot. */
export interface HomeTeam {
  key: string;
  label: string;
  isLead: boolean;
  unread: number;
  href: string;
}

export interface HomeLift {
  heading: string;
  lines: string[];
}

export interface HomeModel {
  greeting: string;
  chips: string[];
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
  modules: HomeModule[];
  teams: HomeTeam[];
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

/**
 * The manifest Home's own facts give, for a caller with no manifest of its
 * own (the unit tests): an applicant is `restricted`, anyone else `full`, at
 * the rank their captaincy and lead flag make them. The page passes the real
 * one (lib/program-manifest.ts).
 */
export function manifestForHome(input: HomeInput): ProgramManifest {
  const lead = input.teams.some((t) => t.isLead);
  const approved = input.approval === "approved";
  return buildProgramManifest({
    mode: approved ? "full" : "restricted",
    approved,
    rank: input.isCaptain ? "captain" : lead ? "team_lead" : "camp_member",
    memberships: input.teams.map((t) => ({ team: t.key, isLead: t.isLead })),
    teams: Object.entries(input.teamLabels).map(([key, label], order) => ({
      key,
      label,
      archived: false,
      order,
    })),
    hasLift: input.lift !== null,
    inbox: input.inbox.total,
    healthWarnings: null,
  });
}

/**
 * Home's model. The module tiles are a VIEW of the member's program manifest
 * (404 OS, PR B): a tile shows when the manifest holds its program, so Home
 * and the header can no longer disagree about what a member may open. Pass the
 * manifest the console built; without one, Home's own facts build it.
 */
export function buildHome(
  input: HomeInput,
  manifest: ProgramManifest = manifestForHome(input),
): HomeModel {
  const today = campDayKey(input.now);
  const approved = input.approval === "approved";

  const chips: string[] = [];
  if (!approved) chips.push("Waiting for approval");
  else if (input.isCaptain) chips.push("Captain");
  else chips.push("Member");
  // Teams are not chips: they have their own icons below.
  if (approved && input.teams.some((t) => t.isLead)) chips.push("Team lead");
  if (input.lift?.role === "driver") chips.push("Driver");

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
          new Set(input.teams.map((t) => t.key)),
        ),
        ...upcomingFromLift(input.lift, today),
      ]
        .sort((a, b) => a.sortKey.localeCompare(b.sortKey))
        .slice(0, 6)
    : [];

  const has = manifestProgramIds(manifest);
  const modules: HomeModule[] = [];
  // The inbox, named as the page it opens and the bell it mirrors: its count
  // (getInboxBadge) holds unread notices of every kind and forms still
  // waiting for an answer, so "Announcements, 1 new" would name the wrong
  // thing when the 1 is a form.
  if (has.has("inbox")) {
    modules.push({
      id: "announcements",
      href: "/notifications",
      label: "Notifications",
      icon: "announcements",
      badge: input.inbox.total > 0 ? input.inbox.total : null,
      badgeSays: "waiting",
    });
  }
  if (has.has("my-forms")) {
    modules.push({
      id: "forms",
      href: "/tools/forms",
      label: "My forms",
      icon: "forms",
      badge: input.pending.length > 0 ? input.pending.length : null,
    });
  }
  // The shared task board, for everyone; the count is the tasks that are
  // theirs and not finished.
  if (has.has("tasks")) {
    modules.push({
      id: "tasks",
      href: "/tasks",
      label: "Tasks",
      icon: "tasks",
      badge: input.myTasks.total > 0 ? input.myTasks.total : null,
      badgeSays: "yours",
    });
  }
  // A lead may post and send forms, but only to a team they lead; a captain
  // to anyone (canSendToAudience in @camp404/core). The pages enforce the
  // scope; these tiles only say where to start.
  if (has.has("announcements")) {
    modules.push({
      id: "message",
      href: "/captains/announcements",
      label: input.isCaptain ? "Announce" : "Message team",
      icon: "message",
      badge: null,
    });
  }
  if (has.has("questionnaires")) {
    modules.push({
      id: "form",
      href: "/captains/questionnaires",
      label: "Send form",
      icon: "send-form",
      badge: null,
    });
  }
  // The camp calendar: a lead adds events for a team they lead, a captain for
  // any team or the whole camp.
  if (has.has("new-event")) {
    modules.push({
      id: "event",
      href: "/captains/calendar",
      label: "Add event",
      icon: "add-event",
      badge: null,
    });
  }
  if (has.has("overview")) {
    modules.push({
      id: "overview",
      href: "/captains/overview",
      label: "Camp overview",
      icon: "overview",
      badge: null,
    });
  }

  // Led teams first, then by name, so the teams someone is responsible for
  // are where the eye lands.
  const teams: HomeTeam[] = approved
    ? [...input.teams]
        .sort(
          (a, b) =>
            Number(b.isLead) - Number(a.isLead) ||
            a.label.localeCompare(b.label),
        )
        .map((t) => ({
          key: t.key,
          label: t.label,
          isLead: t.isLead,
          unread: t.unread,
          // The team's own page: its people, events and open tasks.
          href: `/teams/${encodeURIComponent(t.key)}`,
        }))
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
    greeting: input.firstName ? `Hi ${input.firstName}` : "Hi there",
    chips,
    waitingForApproval: !approved,
    todos,
    tasks,
    tasksMore,
    upcoming,
    calendarState: approved ? (input.calendar?.status ?? null) : null,
    lift: approved ? liftCard(input.lift) : null,
    modules,
    teams,
    checklist,
    allDone: checklist.every((c) => c.done),
  };
}
