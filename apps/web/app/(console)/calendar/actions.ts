"use server";

import { revalidatePath } from "next/cache";
import {
  campDayStart,
  canWorkInTeam,
  meetingInstant,
  NOT_AN_EVENT_MAKER,
  type MeetingSuggestions,
} from "@camp404/core";
import {
  EditCampEventInput,
  MeetingMinutesInput,
  MeetingSuggestInput,
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
import { createMeetingNote, editMeetingNote } from "@/lib/meeting-notes";
import { findMeetingSuggestions } from "@/lib/meeting-suggestions";
import { rateLimiter } from "@/lib/rate-limit";
import { listTeamPeople } from "@/lib/roster";
import { listAssignableMembers } from "@/lib/tasks";
import { getMyTeams } from "@/lib/users";

// The Calendar's writes. The gate here answers the screen; the rules are
// checked again inside each write's own transaction: who may make, change
// and remove an event (a captain, or a lead of its team; whole camp is
// captains'), and who may write a meeting's agenda and minutes (its team's
// members this year, and captains). An event's Google copy follows its row
// (lib/calendar-mirror.ts), on production only. Saving the minutes puts every
// action item on the task board in the same transaction (owner, 2026-10-11).

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
        error:
          parsed.error.issues[0]?.message ?? "Check the minutes and try again.",
      };
    }
    const minutes = parsed.data;
    const config = await getTeamsConfig();
    const teams = config.teams.map((t) => ({ key: t.key, label: t.label }));
    const found = await findCalendarEntry(minutes.eventId, teams);
    if (!found) {
      return {
        ok: false,
        error: "That meeting isn't on the calendar any more.",
      };
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
      activeTeams: activeTeamKeys(config),
    };
    const actionItems = (withIds: boolean) =>
      minutes.actionItems.map((item) => ({
        id: withIds ? item.id : null,
        text: item.text,
        assigneeId: item.assigneeId,
        team: item.team,
        dueOn: item.due,
      }));

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
        actionItems: actionItems(true),
      });
      if (!result.ok) return result;
      revalidateCalendar([note.team]);
      revalidatePath("/tasks");
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
      actionItems: actionItems(false),
    });
    if (!result.ok) return result;
    revalidateCalendar([team]);
    revalidatePath("/tasks");
    return { ok: true, data: { version: 1 } };
  });
}

/** The keys of the camp's active teams, as the writes take them. */
function activeTeamKeys(config: Awaited<ReturnType<typeof getTeamsConfig>>) {
  return activeTeams(config)
    .map((t) => t.key)
    .filter((key): key is Team => Team.safeParse(key).success);
}

/** How many times a member may ask Claude to read notes in a day. */
const SUGGESTIONS_PER_DAY = 20;

/**
 * "Find decisions and action items": Claude reads the meeting's agenda and
 * notes, as the editor holds them now, and proposes. Nothing is stored. Gated
 * exactly as writing the minutes is (the meeting's team's members this year,
 * and captains; a whole-camp meeting's are captains'), and limited per member
 * per day, so nobody runs up the bill.
 */
export async function suggestMeetingItemsAction(
  input: unknown,
): Promise<ActionResult<MeetingSuggestions>> {
  return runAction("suggestMeetingItemsAction", async () => {
    const gate = await captainActionGate("camp_member");
    if (!gate.ok) return gate;
    const parsed = MeetingSuggestInput.safeParse(input);
    if (!parsed.success) {
      return {
        ok: false,
        error:
          parsed.error.issues[0]?.message ?? "Check the notes and try again.",
      };
    }
    const asked = parsed.data;
    if (!asked.notes.trim() && !asked.agenda.trim()) {
      return {
        ok: false,
        error: "Write the notes first: Claude reads the agenda and the notes.",
      };
    }
    const config = await getTeamsConfig();
    const teams = config.teams.map((t) => ({ key: t.key, label: t.label }));
    const [found, memberships] = await Promise.all([
      findCalendarEntry(asked.eventId, teams),
      getMyTeams(gate.campUser.id),
    ]);
    if (!found) {
      return {
        ok: false,
        error: "That meeting isn't on the calendar any more.",
      };
    }
    const { entry, note } = found;
    if (
      entry.kind !== "meeting" &&
      (entry.source !== "google" || note !== null)
    ) {
      return { ok: false, error: "Only a meeting has minutes." };
    }
    const teamKey = entry.team?.key ?? null;
    if (
      !canWorkInTeam(
        gate.rank,
        memberships.map((m) => m.team),
        teamKey,
      )
    ) {
      return {
        ok: false,
        error: teamKey
          ? "Only this team's members and captains can write its meeting notes."
          : "Only captains can write whole-camp meeting notes.",
      };
    }
    const limit = await rateLimiter.limit(
      `meeting-suggestions:${gate.campUser.id}`,
      { limit: SUGGESTIONS_PER_DAY, windowMs: 86_400_000 },
    );
    if (!limit.ok) {
      return {
        ok: false,
        error: `Claude has read notes for you ${SUGGESTIONS_PER_DAY} times today. Try again tomorrow, or write them in by hand.`,
      };
    }

    // Who a person may be matched to: the meeting's team this year, whoever
    // is ticked as there, and the captains. Names only go to Claude.
    const [approved, teamPeople] = await Promise.all([
      listAssignableMembers(),
      teamKey && Team.safeParse(teamKey).success
        ? listTeamPeople(teamKey as Team)
        : Promise.resolve([]),
    ]);
    const onTeam = new Set(teamPeople.map((p) => p.id));
    const there = new Set(asked.attendeeIds);
    const members = approved
      .filter(
        (m) => m.rank === "captain" || onTeam.has(m.id) || there.has(m.id),
      )
      .map((m) => ({ id: m.id, displayName: m.displayName }));
    const active = activeTeams(config).map((t) => ({
      key: t.key,
      label: t.label,
    }));

    const outcome = await findMeetingSuggestions({
      title: entry.title,
      heldOn: entry.startDay,
      teamKey,
      teamLabel: entry.team?.label ?? null,
      agenda: asked.agenda,
      notes: asked.notes,
      members,
      everyone: approved.map((m) => ({ id: m.id, displayName: m.displayName })),
      teams: active,
      existing: {
        decisions: asked.decisions,
        actionItems: asked.actionItems,
      },
    });
    if (!outcome.ok) return outcome;
    return { ok: true, data: outcome.suggestions };
  });
}
