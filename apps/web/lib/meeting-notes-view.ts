import {
  CAMP_TIME_ZONE,
  campDayKey,
  meetingTimeKey,
  readTeamEvent,
  type CalendarTeam,
} from "@camp404/core";
import type { CalendarEvent } from "./google-calendar";

// What the meeting-notes pages show, decided from plain data (#268). Pure: the
// pages read the notes and the calendar, and this words and shapes them.

/** How many notes a team's page lists before "See all meetings". */
export const TEAM_MEETING_LIMIT = 5;

/** The `?team=` value that asks for whole-camp meetings only. */
export const WHOLE_CAMP_MEETINGS = "camp";

/** The meetings list, for one team, the whole camp, or everyone. */
export function meetingsHref(team?: string | null): string {
  if (team === undefined) return "/meetings";
  return `/meetings?team=${encodeURIComponent(team ?? WHOLE_CAMP_MEETINGS)}`;
}

/** Where "New meeting" goes, for one team or the whole camp. */
export function newMeetingHref(team: string | null): string {
  return `/meetings/new?team=${encodeURIComponent(team ?? WHOLE_CAMP_MEETINGS)}`;
}

const WHEN = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: CAMP_TIME_ZONE,
});

const SHORT_DAY = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "short",
  timeZone: CAMP_TIME_ZONE,
});

/** "Fri 2 Oct 2026 · 18:30", in camp time. */
export function meetingWhen(heldAt: Date): string {
  return `${WHEN.format(heldAt).replace(",", "")} · ${meetingTimeKey(heldAt)}`;
}

/** An action item's deadline, "Due Fri 9 Oct", from its camp day. */
export function actionItemDue(dueOn: string): string {
  return `Due ${SHORT_DAY.format(new Date(`${dueOn}T12:00:00+02:00`)).replace(",", "")}`;
}

/** What the note says about the task an action item became. */
export const TASK_STATUS_LABEL = {
  open: "To do",
  in_progress: "Doing",
  done: "Done",
  cancelled: "Taken off the board",
} as const;

/** "2 decisions · 1 action item", or null when there are neither. */
export function meetingCounts(input: {
  decisions: number;
  actionItems: number;
}): string | null {
  const parts = [
    input.decisions > 0
      ? `${input.decisions} decision${input.decisions === 1 ? "" : "s"}`
      : null,
    input.actionItems > 0
      ? `${input.actionItems} action item${input.actionItems === 1 ? "" : "s"}`
      : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : null;
}

/** An event on the camp calendar the editor offers to link a note to. */
export interface MeetingEventOption {
  id: string;
  /** The event's title without its team's prefix. */
  title: string;
  /** Its team's key; null for a whole-camp event. */
  team: string | null;
  /** The camp day, YYYY-MM-DD, and the start time (null for all day). */
  date: string;
  time: string | null;
  /** "Fri 2 Oct · 18:00 · Kitchen kickoff". */
  label: string;
}

/**
 * The calendar's events as the editor offers them, soonest first, each with
 * its team read the way the Calendar page reads it.
 */
export function meetingEventOptions(
  events: readonly CalendarEvent[],
  teams: readonly CalendarTeam[],
): MeetingEventOption[] {
  return events.map((event) => {
    const { team, title } = readTeamEvent(event.title, event.teamTag, teams);
    const start = event.allDay
      ? new Date(`${event.start}T12:00:00+02:00`)
      : new Date(event.start);
    const date = event.allDay ? event.start : campDayKey(start);
    const time = event.allDay ? null : meetingTimeKey(start);
    const day = SHORT_DAY.format(start).replace(",", "");
    return {
      id: event.id,
      title,
      team: team?.key ?? null,
      date,
      time,
      label: [day, time ?? "All day", title].join(" · "),
    };
  });
}
