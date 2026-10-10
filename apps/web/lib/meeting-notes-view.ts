import { CAMP_TIME_ZONE, campDayKey, meetingTimeKey } from "@camp404/core";
import { calendarHref } from "./calendar-month";

// What the meeting-notes pages show, decided from plain data (#268). Pure: the
// pages read the notes and the calendar, and this words and shapes them.

/** How many notes a team's page lists before "See all meetings". */
export const TEAM_MEETING_LIMIT = 5;

/** The `?team=` value that asks for whole-camp meetings only. */
export const WHOLE_CAMP_MEETINGS = "camp";

/**
 * The meetings list (the Calendar's past meetings since 2026-10-10), for one
 * team, the whole camp, or everyone.
 */
export function meetingsHref(team?: string | null, today = campDayKey(new Date())): string {
  return calendarHref({
    view: "list",
    month: today.slice(0, 7),
    when: "past",
    team: team === undefined ? null : (team ?? WHOLE_CAMP_MEETINGS),
    type: "meetings",
    event: null,
    newOn: null,
  });
}

/**
 * Where "New meeting" goes: the Calendar's New event form on today, over one
 * team's (or the whole camp's) meetings.
 */
export function newMeetingHref(team: string | null, today = campDayKey(new Date())): string {
  return calendarHref({
    view: "month",
    month: today.slice(0, 7),
    when: "upcoming",
    team: team ?? WHOLE_CAMP_MEETINGS,
    type: "meetings",
    event: null,
    newOn: today,
  });
}

/** One meeting, open in the Calendar on its month. */
export function meetingHref(note: {
  calendarEventId: string | null;
  heldAt: Date;
}): string {
  if (!note.calendarEventId) return meetingsHref();
  return calendarHref({
    view: "month",
    month: campDayKey(note.heldAt).slice(0, 7),
    when: "upcoming",
    team: null,
    type: "all",
    event: note.calendarEventId,
    newOn: null,
  });
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

/**
 * A picked camp day (YYYY-MM-DD) in words, "Thu 1 Oct 2026", said under a
 * date box: the box itself follows the browser's locale, where 10/01 may read
 * as 10 January. Null for an empty or broken value.
 */
export function campDayLabel(day: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const at = new Date(`${day}T12:00:00+02:00`);
  if (Number.isNaN(at.getTime())) return null;
  return WHEN.format(at).replace(",", "");
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

/**
 * "3 people there · 2 decisions · 1 action item", or null when there is none
 * of it. Who was there leads, when the list knows.
 */
export function meetingCounts(input: {
  decisions: number;
  actionItems: number;
  attendees?: number;
}): string | null {
  const parts = [
    input.attendees
      ? `${input.attendees} ${input.attendees === 1 ? "person" : "people"} there`
      : null,
    input.decisions > 0
      ? `${input.decisions} decision${input.decisions === 1 ? "" : "s"}`
      : null,
    input.actionItems > 0
      ? `${input.actionItems} action item${input.actionItems === 1 ? "" : "s"}`
      : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : null;
}
