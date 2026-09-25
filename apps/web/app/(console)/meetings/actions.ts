"use server";

import { revalidatePath } from "next/cache";
import { meetingInstant, readTeamEvent } from "@camp404/core";
import {
  ActionItemToTaskInput,
  EditMeetingNoteInput,
  NewMeetingNoteInput,
  Team,
} from "@camp404/types";
import { getUpcomingEvents } from "@/lib/camp-calendar";
import { activeTeams, getTeamsConfig } from "@/lib/camp-config";
import { captainActionGate } from "@/lib/captain-gate";
import { runAction, type ActionResult } from "@/lib/action-result";
import { CALENDAR_PAGE_RANGE } from "@/lib/google-calendar";
import {
  createMeetingNote,
  editMeetingNote,
  turnActionItemIntoTask,
} from "@/lib/meeting-notes";

// Meeting notes' writes (#268). Any approved member may ask; whether THIS
// member may write THIS team's notes (its members this year and captains), and
// whether they may put an action item on the task board (the board's own rule:
// a captain or a lead of the team), is decided inside each write's
// transaction, in @camp404/db/meeting-notes.

const TEAM_OFF = "That team isn't active any more. Pick another team.";

function firstIssue(error: { issues: readonly { message: string }[] }): string {
  return error.issues[0]?.message ?? "Check the note and try again.";
}

/**
 * The calendar event a note names, as the camp calendar has it. The title is
 * null when the calendar does not list it (it has passed, or the calendar is
 * out of reach): the write keeps it only if the note already names it.
 */
async function findCalendarEvent(
  eventId: string | null,
): Promise<{ id: string; title: string | null } | null> {
  if (!eventId) return null;
  const [calendar, config] = await Promise.all([
    getUpcomingEvents(CALENDAR_PAGE_RANGE),
    getTeamsConfig(),
  ]);
  const event =
    calendar.status === "ok"
      ? calendar.events.find((e) => e.id === eventId)
      : undefined;
  if (!event) return { id: eventId, title: null };
  const teams = config.teams.map((t) => ({ key: t.key, label: t.label }));
  return {
    id: eventId,
    title: readTeamEvent(event.title, event.teamTag, teams).title,
  };
}

function revalidateNote(team: string | null, noteId?: string) {
  revalidatePath("/meetings");
  if (noteId) revalidatePath(`/meetings/${noteId}`);
  if (team) revalidatePath(`/teams/${team}`);
}

/** Write a new meeting note for a team, or for the whole camp. */
export async function createMeetingNoteAction(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  return runAction("createMeetingNoteAction", async () => {
    const gate = await captainActionGate("camp_member");
    if (!gate.ok) return gate;

    const parsed = NewMeetingNoteInput.safeParse(input);
    if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
    const note = parsed.data;
    if (note.team) {
      const active = activeTeams(await getTeamsConfig()).map((t) => t.key);
      if (!active.includes(note.team)) return { ok: false, error: TEAM_OFF };
    }

    const result = await createMeetingNote({
      actorId: gate.campUser.id,
      team: note.team,
      title: note.title,
      heldAt: meetingInstant(note.date, note.time),
      calendarEvent: await findCalendarEvent(note.calendarEventId),
      agenda: note.agenda,
      notes: note.notes,
      attendeeIds: note.attendeeIds,
      decisions: note.decisions,
      actionItems: note.actionItems.map((item) => ({
        id: null,
        text: item.text,
        assigneeId: item.assigneeId,
        dueOn: item.due,
      })),
    });
    if (!result.ok) return result;
    revalidateNote(note.team, result.id);
    return { ok: true, data: { id: result.id } };
  });
}

/** Save changes to a meeting note. */
export async function editMeetingNoteAction(
  input: unknown,
): Promise<ActionResult> {
  return runAction("editMeetingNoteAction", async () => {
    const gate = await captainActionGate("camp_member");
    if (!gate.ok) return gate;

    const parsed = EditMeetingNoteInput.safeParse(input);
    if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
    const note = parsed.data;

    const result = await editMeetingNote({
      actorId: gate.campUser.id,
      noteId: note.noteId,
      version: note.version,
      title: note.title,
      heldAt: meetingInstant(note.date, note.time),
      calendarEvent: await findCalendarEvent(note.calendarEventId),
      agenda: note.agenda,
      notes: note.notes,
      attendeeIds: note.attendeeIds,
      decisions: note.decisions,
      actionItems: note.actionItems.map((item) => ({
        id: item.id,
        text: item.text,
        assigneeId: item.assigneeId,
        dueOn: item.due,
      })),
    });
    if (!result.ok) return result;
    revalidatePath("/meetings");
    revalidatePath(`/meetings/${note.noteId}`);
    return { ok: true };
  });
}

/** Put one action item on the task board. */
export async function actionItemToTaskAction(
  input: unknown,
): Promise<ActionResult<{ taskId: string }>> {
  return runAction("actionItemToTaskAction", async () => {
    const gate = await captainActionGate("camp_member");
    if (!gate.ok) return gate;

    const parsed = ActionItemToTaskInput.safeParse(input);
    if (!parsed.success) {
      return {
        ok: false,
        error: "That action item isn't on the note any more.",
      };
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
    revalidatePath(`/meetings/${result.noteId}`);
    return { ok: true, data: { taskId: result.taskId } };
  });
}
