"use server";

import { revalidatePath } from "next/cache";
import {
  campDayStart,
  meetingInstant,
  NOT_AN_EVENT_MAKER,
} from "@camp404/core";
import {
  ActionItemToTaskInput,
  EditCampEventInput,
  MeetingMinutesInput,
  NewCampEventInput,
  RemoveCampEventInput,
  Team,
} from "@camp404/types";
import { runAction, type ActionResult } from "@/lib/action-result";
import { activeTeams, getTeamsConfig } from "@/lib/camp-config";
import {
  createCampEvent,
  editCampEvent,
  removeCampEvent,
} from "@/lib/camp-events";
import { captainActionGate } from "@/lib/captain-gate";
import { findCalendarEntry } from "@/lib/calendar-page";
import type { CalendarMirrorOutcome } from "@/lib/calendar-mirror";
import {
  createMeetingNote,
  editMeetingNote,
  turnActionItemIntoTask,
} from "@/lib/meeting-notes";

// The Calendar's writes. The gate here answers the screen; the rules are
// checked again inside each write's own transaction: who may make, change
// and remove an event (a captain, or a lead of its team; whole camp is
// captains'), and who may write a meeting's agenda and minutes (its team's
// members this year, and captains). An event's Google copy follows its row
// (lib/calendar-mirror.ts), on production only.

const TEAM_OFF = "That team isn't active any more. Pick another team.";

function firstIssue(error: { issues: readonly { message: string }[] }): string {
  return error.issues[0]?.message ?? "Check the event and try again.";
}

/** What the page says about Google after a save. */
export interface CalendarSaved {
  eventId: string;
  /** The month the event starts in, YYYY-MM, to show it. */
  month: string;
  calendar: CalendarMirrorOutcome;
}

async function teamIsActive(team: string | null): Promise<boolean> {
  if (!team) return true;
  return activeTeams(await getTeamsConfig()).some((t) => t.key === team);
}

function revalidateCalendar(teams: readonly (string | null)[]) {
  // Home's "Coming up", the Calendar and the teams' pages all list events.
  revalidatePath("/");
  revalidatePath("/calendar");
  for (const team of new Set(teams)) {
    if (team) revalidatePath(`/teams/${team}`);
  }
}

/** Put an event or a meeting on the camp calendar. */
export async function createCampEventAction(
  input: unknown,
): Promise<ActionResult<CalendarSaved>> {
  return runAction("createCampEventAction", async () => {
    const gate = await captainActionGate("team_lead", NOT_AN_EVENT_MAKER);
    if (!gate.ok) return gate;
    const parsed = NewCampEventInput.safeParse(input);
    if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
    if (!(await teamIsActive(parsed.data.team))) {
      return { ok: false, error: TEAM_OFF };
    }
    const saved = await createCampEvent(gate.campUser.id, parsed.data);
    if (!saved.ok) return saved;
    revalidateCalendar([saved.row.team]);
    return {
      ok: true,
      data: {
        eventId: saved.row.calendarEventId,
        month: saved.row.startDate.slice(0, 7),
        calendar: saved.calendar,
      },
    };
  });
}

/** Change an event the app made. */
export async function editCampEventAction(
  input: unknown,
): Promise<ActionResult<CalendarSaved>> {
  return runAction("editCampEventAction", async () => {
    const gate = await captainActionGate("team_lead", NOT_AN_EVENT_MAKER);
    if (!gate.ok) return gate;
    const parsed = EditCampEventInput.safeParse(input);
    if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
    if (!(await teamIsActive(parsed.data.team))) {
      return { ok: false, error: TEAM_OFF };
    }
    const saved = await editCampEvent(gate.campUser.id, parsed.data);
    if (!saved.ok) return saved;
    revalidateCalendar([saved.row.team, parsed.data.team]);
    return {
      ok: true,
      data: {
        eventId: saved.row.calendarEventId,
        month: saved.row.startDate.slice(0, 7),
        calendar: saved.calendar,
      },
    };
  });
}

/** Take an event the app made off the camp calendar. */
export async function removeCampEventAction(
  input: unknown,
): Promise<ActionResult> {
  return runAction("removeCampEventAction", async () => {
    const gate = await captainActionGate("team_lead", NOT_AN_EVENT_MAKER);
    if (!gate.ok) return gate;
    const parsed = RemoveCampEventInput.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: "That event isn't on the calendar any more." };
    }
    const saved = await removeCampEvent(gate.campUser.id, parsed.data);
    if (!saved.ok) return saved;
    revalidateCalendar([saved.row.team]);
    return { ok: true };
  });
}

/**
 * Save a meeting's agenda and minutes. The meeting is its calendar event: its
 * title, team and time are the event's, never the editor's. A meeting with no
 * note yet (an event made in Google, given minutes for the first time) gets
 * one; otherwise the note is saved over the version the editor opened.
 */
export async function saveMinutesAction(
  input: unknown,
): Promise<ActionResult<{ version: number }>> {
  return runAction("saveMinutesAction", async () => {
    const gate = await captainActionGate("camp_member");
    if (!gate.ok) return gate;
    const parsed = MeetingMinutesInput.safeParse(input);
    if (!parsed.success) {
      return {
        ok: false,
        error: parsed.error.issues[0]?.message ?? "Check the minutes and try again.",
      };
    }
    const minutes = parsed.data;
    const config = await getTeamsConfig();
    const teams = config.teams.map((t) => ({ key: t.key, label: t.label }));
    const found = await findCalendarEntry(minutes.eventId, teams);
    if (!found) {
      return { ok: false, error: "That meeting isn't on the calendar any more." };
    }
    const { entry, note } = found;
    if (
      entry.kind !== "meeting" &&
      (entry.source !== "google" || note !== null)
    ) {
      return { ok: false, error: "Only a meeting has minutes." };
    }
    const heldAt = entry.startTime
      ? meetingInstant(entry.startDay, entry.startTime)
      : campDayStart(entry.startDay);
    const fields = {
      title: entry.title,
      heldAt,
      calendarEvent: { id: entry.id, title: entry.title },
      agenda: minutes.agenda,
      notes: minutes.notes,
      attendeeIds: minutes.attendeeIds,
      decisions: minutes.decisions,
    };

    if (note) {
      if (minutes.version === null) {
        return {
          ok: false,
          error:
            "Someone started this meeting's minutes a moment ago. Open it again to see them.",
        };
      }
      const result = await editMeetingNote({
        ...fields,
        actorId: gate.campUser.id,
        noteId: note.id,
        version: minutes.version,
        actionItems: minutes.actionItems.map((item) => ({
          id: item.id,
          text: item.text,
          assigneeId: item.assigneeId,
          dueOn: item.due,
        })),
      });
      if (!result.ok) return result;
      revalidateCalendar([note.team]);
      return { ok: true, data: { version: result.version } };
    }

    const team = entry.team?.key ?? null;
    if (team !== null && !Team.safeParse(team).success) {
      return { ok: false, error: TEAM_OFF };
    }
    const result = await createMeetingNote({
      ...fields,
      actorId: gate.campUser.id,
      team: team as Team | null,
      actionItems: minutes.actionItems.map((item) => ({
        id: null,
        text: item.text,
        assigneeId: item.assigneeId,
        dueOn: item.due,
      })),
    });
    if (!result.ok) return result;
    revalidateCalendar([team]);
    return { ok: true, data: { version: 1 } };
  });
}

/** Put one of a meeting's action items on the task board. */
export async function actionItemToTaskAction(
  input: unknown,
): Promise<ActionResult<{ taskId: string }>> {
  return runAction("actionItemToTaskAction", async () => {
    const gate = await captainActionGate("camp_member");
    if (!gate.ok) return gate;
    const parsed = ActionItemToTaskInput.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: "That action item isn't on the note any more." };
    }
    const result = await turnActionItemIntoTask({
      actorId: gate.campUser.id,
      itemId: parsed.data.itemId,
      activeTeams: activeTeams(await getTeamsConfig())
        .map((t) => t.key)
        .filter((key): key is Team => Team.safeParse(key).success),
    });
    if (!result.ok) return result;
    revalidatePath("/tasks");
    revalidatePath("/calendar");
    return { ok: true, data: { taskId: result.taskId } };
  });
}
