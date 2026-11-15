import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import {
  campDayStart,
  canWorkInTeam,
  MEETING_NOTE_PRIVACY_REMINDER,
  meetingInstant,
} from "@camp404/core";
import { MINUTES_STARTED, NOTE_EDITED } from "@camp404/db/meeting-notes";
import { MeetingMinutesInput, Team } from "@camp404/types";
import { activeTeams, getTeamsConfig } from "../../camp-config";
import { findCalendarEntry } from "../../calendar-page";
import {
  createMeetingNote,
  editMeetingNote,
  getMeetingNoteByEvent,
  type MeetingNote,
} from "../../meeting-notes";
import { siteUrl } from "../capabilities";
import type { McpScope } from "../scope";
import { runTool, ToolError } from "../tool-utils";

// A meeting's minutes over MCP, as the Calendar's minutes editor saves them
// (saveMinutesAction → lib/meeting-notes.ts → @camp404/db/meeting-notes),
// beyond what update_meeting_notes does: the first minutes of an event made
// in Google, who was there, and the action items.
//
//  - The meeting is its calendar event (findCalendarEntry, the action's own
//    read): its title, team and time are the event's, never the caller's. Only
//    a meeting has minutes, or an event made in Google that has none yet
//    (writing them makes it a meeting), as on the page.
//  - Who may write is the editor's rule (canWorkInTeam: the meeting's team's
//    members this year, and captains; a whole-camp meeting's are captains'),
//    decided inside the write's transaction on the actor it re-reads.
//  - A save over existing minutes is a compare-and-set on the version the
//    caller read (`expectedVersion`); the first minutes take null, and if
//    someone started them meanwhile the save is refused in the page's words.
//    What is left out is sent back as read (agenda, notes, who was there,
//    decisions), so it is that version's; the action items are left exactly
//    as they are unless `actionItems` is given.
//  - `actionItems` is the editor's whole list. Each new or changed item not on
//    the board yet goes on the task board in the SAME transaction (putOnBoard),
//    as the editor's Save does; one on the board keeps its words (a save that
//    changes them is refused, ON_THE_BOARD), and one left out of the list
//    stays on the note at the end. An item not on the board that is left out
//    is taken off the note.
//  - Making, changing and removing calendar events, and Claude's "Find
//    decisions and action items" (it spends money), stay on the website. No
//    audit row: the site writes none for team planning data.

const NOT_ON_CALENDAR = "That meeting isn't on the calendar any more.";
const NOT_A_MEETING = "Only a meeting has minutes.";
const TEAM_OFF = "That team isn't active any more. Pick another team.";

const minutesPath = (eventId: string) => `/calendar/${eventId}/minutes`;

/** The calendar event and its note, as the minutes editor reads them. */
export async function findMeeting(eventId: string) {
  const config = await getTeamsConfig();
  const teams = config.teams.map((t) => ({ key: t.key, label: t.label }));
  const found = await findCalendarEntry(eventId, teams);
  if (!found) return null;
  const { entry, note } = found;
  const hasMinutes =
    entry.kind === "meeting" || (entry.source === "google" && note === null);
  // A note's team is the meeting's; before the first minutes, the event's.
  const team = note ? note.team : (entry.team?.key ?? null);
  return { config, entry, note, hasMinutes, team };
}

function canWrite(scope: McpScope, team: string | null): boolean {
  return canWorkInTeam(scope.viewerRank, scope.memberTeams, team);
}

function presentMinutes(
  scope: McpScope,
  found: NonNullable<Awaited<ReturnType<typeof findMeeting>>>,
  version?: number,
) {
  const { config, entry, note, hasMinutes, team } = found;
  const labels = Object.fromEntries(config.teams.map((t) => [t.key, t.label]));
  const label = (key: string | null) =>
    key ? (labels[key] ?? key) : "Whole camp";
  return {
    eventId: entry.id,
    meetingId: note?.id ?? null,
    title: entry.title,
    day: entry.startDay,
    startTime: entry.startTime,
    team,
    teamLabel: label(team),
    hasMinutes,
    // null: no minutes yet, so the first save passes expectedVersion null.
    version: version ?? note?.version ?? null,
    agenda: note?.agenda ?? "",
    notes: note?.notes ?? "",
    attendees: (note?.attendees ?? []).map((a) => ({
      userId: a.id,
      name: a.displayName,
    })),
    decisions: (note?.decisions ?? []).map((d) => d.text),
    actionItems: (note?.actionItems ?? []).map((item) => ({
      id: item.id,
      text: item.text,
      assigneeId: item.assigneeId,
      assigneeName: item.assigneeName,
      team: item.team,
      teamLabel: label(item.team),
      due: item.dueOn,
      onTheBoard: item.task !== null,
      taskStatus: item.task?.status ?? null,
    })),
    canEdit: hasMinutes && canWrite(scope, team),
    url: siteUrl(minutesPath(entry.id)),
  };
}

const ActionItemArg = z.object({
  id: z
    .string()
    .uuid()
    .nullable()
    .optional()
    .describe("An item already on the note, as read; leave out for a new one."),
  text: z.string().max(120),
  assigneeId: z.string().uuid().nullable().optional(),
  team: Team.nullable()
    .optional()
    .describe(
      "Where its task is filed; left out, the meeting's team. null is the whole camp.",
    ),
  due: z.string().nullable().optional().describe("A day, YYYY-MM-DD."),
});

export function registerMeetingsMoreTools(server: McpServer): void {
  server.registerTool(
    "get_meeting_minutes",
    {
      title: "Read a meeting's minutes to edit them",
      description:
        "A meeting's minutes as the minutes editor opens them, by its calendar event id (eventId from list_calendar_events or get_meeting): agenda, notes, who was there (userIds), decisions, action items (ids, person, team, deadline, whether each is on the task board), its `version` (null before the first minutes) and whether you may write them (`canEdit`).",
      inputSchema: z.object({ eventId: z.string().min(1).max(1024) }),
    },
    async (args, extra) =>
      runTool({
        toolName: "get_meeting_minutes",
        extra,
        argsForAudit: args,
        handler: async ({ scope }) => {
          const found = await findMeeting(args.eventId);
          if (!found) throw new ToolError(NOT_ON_CALENDAR);
          return presentMinutes(scope, found);
        },
      }),
  );

  server.registerTool(
    "save_meeting_minutes",
    {
      title: "Save a meeting's minutes",
      description: `Saves a meeting's minutes as the minutes editor's Save does, by eventId: the first minutes (expectedVersion null) or a change (the version from get_meeting_minutes). Give only what changes; lists replace the whole list. attendeeIds: who was there. actionItems: each new or changed one goes on the task board; send kept ones back with their id. The meeting's team's members and captains may. ${MEETING_NOTE_PRIVACY_REMINDER}`,
      inputSchema: z.object({
        eventId: z.string().min(1).max(1024),
        expectedVersion: z.number().int().min(1).nullable(),
        agenda: z.string().max(10_000).optional(),
        notes: z.string().max(20_000).optional(),
        attendeeIds: z.array(z.string().uuid()).max(200).optional(),
        decisions: z.array(z.string().max(500)).max(50).optional(),
        actionItems: z.array(ActionItemArg).max(50).optional(),
      }),
    },
    async (args, extra) =>
      runTool({
        toolName: "save_meeting_minutes",
        extra,
        // Which parts changed, never the words.
        argsForAudit: {
          eventId: args.eventId,
          expectedVersion: args.expectedVersion,
          fields: (
            [
              "agenda",
              "notes",
              "attendeeIds",
              "decisions",
              "actionItems",
            ] as const
          ).filter((k) => args[k] !== undefined),
        },
        handler: async ({ scope }) => {
          const found = await findMeeting(args.eventId);
          if (!found) throw new ToolError(NOT_ON_CALENDAR);
          const { config, entry, note, hasMinutes } = found;
          if (!hasMinutes) throw new ToolError(NOT_A_MEETING);
          if (note && args.expectedVersion === null) {
            throw new ToolError(MINUTES_STARTED);
          }
          // The parts left out are filled from this read, so it must be the
          // version the caller read; the write checks it again.
          if (note && note.version !== args.expectedVersion) {
            throw new ToolError(NOTE_EDITED);
          }
          const parsed = MeetingMinutesInput.safeParse({
            eventId: entry.id,
            version: note ? args.expectedVersion : null,
            agenda: args.agenda ?? note?.agenda ?? "",
            notes: args.notes ?? note?.notes ?? "",
            attendeeIds:
              args.attendeeIds ?? (note?.attendees ?? []).map((a) => a.id),
            decisions:
              args.decisions ?? (note?.decisions ?? []).map((d) => d.text),
            actionItems: (args.actionItems ?? []).map((item) => ({
              id: item.id ?? null,
              text: item.text,
              assigneeId: item.assigneeId ?? null,
              team: item.team !== undefined ? item.team : found.team,
              due: item.due ?? null,
            })),
          });
          if (!parsed.success) {
            throw new ToolError(
              parsed.error.issues[0]?.message ??
                "Check the minutes and try again.",
            );
          }
          const minutes = parsed.data;
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
            activeTeams: activeTeams(config)
              .map((t) => t.key)
              .filter((key): key is Team => Team.safeParse(key).success),
          };
          const actionItems = (withIds: boolean) =>
            minutes.actionItems.map((item) => ({
              id: withIds ? item.id : null,
              text: item.text,
              assigneeId: item.assigneeId,
              team: item.team,
              dueOn: item.due,
            }));

          let version: number;
          if (note) {
            const result = await editMeetingNote({
              ...fields,
              actorId: scope.campUserId,
              noteId: note.id,
              version: note.version,
              // Left out: the write keeps the action items exactly as they are.
              actionItems:
                args.actionItems === undefined ? undefined : actionItems(true),
            });
            if (!result.ok) throw new ToolError(result.error);
            version = result.version;
          } else {
            const team = found.team;
            if (team !== null && !Team.safeParse(team).success) {
              throw new ToolError(TEAM_OFF);
            }
            const result = await createMeetingNote({
              ...fields,
              actorId: scope.campUserId,
              team: team as Team | null,
              actionItems: actionItems(false),
            });
            if (!result.ok) throw new ToolError(result.error);
            version = 1;
          }
          const saved = await getMeetingNoteByEvent(entry.id);
          // `version` is the one THIS save made, never a later re-read's.
          return presentMinutes(
            scope,
            { ...found, note: (saved ?? note) as MeetingNote | null },
            version,
          );
        },
      }),
  );
}
