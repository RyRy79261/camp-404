import { CAMP_TIME_ZONE, campDayKey } from "@camp404/core";
import type { MyLift } from "@camp404/db/cars";
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
  firstName: string | null;
  isCaptain: boolean;
  teams: readonly { key: string; label: string; isLead: boolean }[];
  pending: readonly {
    activationId: string;
    title: string;
    blocking: boolean;
    dueAt: Date | null;
  }[];
  unread: number;
  lift: MyLift | null;
  calendar: CalendarResult | null;
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
}

export interface HomeShortcut {
  id: string;
  href: string;
  label: string;
  detail: string | null;
  badge: number | null;
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
  upcoming: HomeUpcoming[];
  /** Why "coming up" may be short: the calendar is off or unreachable. */
  calendarState: CalendarResult["status"] | null;
  lift: HomeLift | null;
  shortcuts: HomeShortcut[];
  checklist: { label: string; done: boolean }[];
  allDone: boolean;
}

const DAY_MS = 86_400_000;

/** Whole days from one YYYY-MM-DD to another (UTC round-trip, no clock drift). */
function daysBetween(fromKey: string, toKey: string): number {
  return Math.round(
    (Date.parse(`${toKey}T00:00:00Z`) - Date.parse(`${fromKey}T00:00:00Z`)) /
      DAY_MS,
  );
}

function relativeDay(days: number): string {
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days > 1) return `In ${days} days`;
  if (days === -1) return "Yesterday";
  return `${-days} days ago`;
}

function dueLabel(days: number): string {
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
): HomeUpcoming[] {
  if (calendar?.status !== "ok") return [];
  return calendar.events.map((event) => {
    if (event.allDay) {
      // An all-day event is a date, not an instant: shown as that date in
      // every time zone.
      const day = event.start.slice(0, 10);
      return {
        id: `event:${event.id}`,
        title: event.title,
        when: tidy(DATE_UTC.format(new Date(`${day}T00:00:00Z`))),
        relative: relativeDay(daysBetween(today, day)),
        location: event.location,
        kind: "event" as const,
        sortKey: `${day}T00:00`,
      };
    }
    const at = new Date(event.start);
    const day = campDayKey(at);
    return {
      id: `event:${event.id}`,
      title: event.title,
      when: `${tidy(DATE.format(at))} · ${TIME.format(at)}`,
      relative: relativeDay(daysBetween(today, day)),
      location: event.location,
      kind: "event" as const,
      sortKey: `${day}T${TIME.format(at)}`,
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
    });
  };
  add("travel:arrive", "You arrive at camp", lift.arrivalAt);
  add("travel:leave", "You leave camp", lift.departureAt);
  return out;
}

function liftCard(lift: MyLift | null): HomeLift | null {
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

export function buildHome(input: HomeInput): HomeModel {
  const today = campDayKey(input.now);
  const approved = input.approval === "approved";

  const chips: string[] = [];
  if (!approved) chips.push("Waiting for approval");
  else if (input.isCaptain) chips.push("Captain");
  else chips.push("Member");
  for (const team of input.teams) {
    chips.push(team.isLead ? `${team.label} lead` : team.label);
  }
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

  // Coming up: the camp calendar and your own travel dates, soonest first.
  const upcoming = approved
    ? [
        ...upcomingFromCalendar(input.calendar, today),
        ...upcomingFromLift(input.lift, today),
      ]
        .sort((a, b) => a.sortKey.localeCompare(b.sortKey))
        .slice(0, 6)
    : [];

  const shortcuts: HomeShortcut[] = [
    {
      id: "announcements",
      href: "/notifications",
      label: "Announcements",
      detail: input.unread > 0 ? null : "Nothing new",
      badge: input.unread > 0 ? input.unread : null,
    },
  ];
  if (approved) {
    shortcuts.push({
      id: "forms",
      href: "/tools/forms",
      label: "My forms",
      detail: "Your answers",
      badge: null,
    });
    for (const team of input.teams) {
      shortcuts.push({
        id: `team:${team.key}`,
        href: `/captains/camp-management?team=${encodeURIComponent(team.key)}`,
        label: team.isLead ? `Your team: ${team.label}` : team.label,
        detail: team.isLead ? "You lead this team" : "Your team",
        badge: null,
      });
    }
    // A lead may post and send forms, but only to a team they lead; a captain
    // to anyone (canSendToAudience in @camp404/core). The pages enforce the
    // scope; these only say where to start.
    if (input.teams.some((t) => t.isLead) || input.isCaptain) {
      shortcuts.push({
        id: "message",
        href: "/captains/announcements",
        label: input.isCaptain ? "Post an announcement" : "Message your team",
        detail: null,
        badge: null,
      });
      shortcuts.push({
        id: "form",
        href: "/captains/questionnaires",
        label: input.isCaptain ? "Send a form" : "Send your team a form",
        detail: null,
        badge: null,
      });
    }
    if (input.isCaptain) {
      shortcuts.push({
        id: "overview",
        href: "/captains/overview",
        label: "Camp overview",
        detail: "The whole camp at a glance",
        badge: null,
      });
    }
  }

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
    upcoming,
    calendarState: approved ? (input.calendar?.status ?? null) : null,
    lift: approved ? liftCard(input.lift) : null,
    shortcuts,
    checklist,
    allDone: checklist.every((c) => c.done),
  };
}
