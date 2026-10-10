import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { canWorkInTeam, MEETING_NOTE_PRIVACY_REMINDER } from "@camp404/core";
import { MeetingMinutesInput, Team } from "@camp404/types";
import { getTeamsConfig } from "../../camp-config";
import {
  editMeetingNote,
  getMeetingNote,
  listMeetingNotes,
  type MeetingNote,
} from "../../meeting-notes";
import { meetingHref, WHOLE_CAMP_MEETINGS } from "../../meeting-notes-view";
import { siteUrl } from "../capabilities";
import type { McpScope } from "../scope";
import { notFound, runTool, ToolError } from "../tool-utils";

// Meetings over MCP (#268). A meeting is an event on the Calendar since
// 2026-10-10 (owner: "Meetings is a type of calendar item"), with its agenda
// and minutes in a meeting note, through the Calendar's own functions
// (lib/meeting-notes.ts → @camp404/db/meeting-notes).
//
//  - Every approved member reads every meeting, as on the Calendar.
//  - Changing a meeting's agenda, notes or decisions is the minutes editor's
//    Save: editMeetingNote, which re-reads the actor inside its transaction (a
//    member of the meeting's team this year, or a captain; whole-camp
//    meetings are captains'), and saves only on the version the person read
//    (a compare-and-set: someone else's save in between is refused with the
//    editor's sentence). The editor sends the whole note, so the parts not
//    given here are sent back exactly as read: who was there and the action
//    items. The meeting's title and time are its calendar event's.
//  - Making a meeting (it goes on the camp's shared Google Calendar, so it is
//    website-only), the first minutes of an event made in Google, ticking
//    attendees, action items and putting one on the task board stay on the
//    Calendar. No audit row: the site writes none for team planning data.

const MeetingFilter = z.union([Team, z.literal(WHOLE_CAMP_MEETINGS)]);

function canEdit(scope: McpScope, note: Pick<MeetingNote, "team">): boolean {
  return canWorkInTeam(scope.viewerRank, scope.memberTeams, note.team);
}

async function labelsOf(): Promise<Record<string, string>> {
  const config = await getTeamsConfig();
  return Object.fromEntries(config.teams.map((t) => [t.key, t.label]));
}

function presentNote(
  note: MeetingNote,
  scope: McpScope,
  labels: Record<string, string>,
) {
  return {
    id: note.id,
    team: note.team,
    teamLabel: note.team ? (labels[note.team] ?? note.team) : "Whole camp",
    title: note.title,
    heldAt: note.heldAt,
    eventId: note.calendarEventId,
    agenda: note.agenda,
    notes: note.notes,
    attendees: note.attendees.map((a) => a.displayName),
    decisions: note.decisions.map((d) => d.text),
    actionItems: note.actionItems.map((item) => ({
      text: item.text,
      assigneeName: item.assigneeName,
      due: item.dueOn,
      taskStatus: item.task?.status ?? null,
    })),
    writtenBy: note.createdByName,
    updatedAt: note.updatedAt,
    version: note.version,
    canEdit: canEdit(scope, note),
    url: siteUrl(meetingHref(note)),
  };
}

export function registerMeetingTools(server: McpServer): void {
  server.registerTool(
    "list_meetings",
    {
      title: "List meetings",
      description:
        'Meetings that have notes, newest first, as the Calendar\'s list of meetings shows them: the team (or the whole camp), title, when, how many decisions, action items and people, and the first decision. `team` is a team key, or "camp" for whole-camp meetings. A meeting coming up with only its agenda is listed too; list_calendar_events shows every meeting on the calendar.',
      inputSchema: z.object({
        team: MeetingFilter.optional(),
        limit: z.number().int().min(1).max(200).optional(),
      }),
    },
    async (args, extra) =>
      runTool({
        toolName: "list_meetings",
        extra,
        argsForAudit: args,
        handler: async ({ scope }) => {
          const [notes, labels] = await Promise.all([
            listMeetingNotes({ team: args.team, limit: args.limit }),
            labelsOf(),
          ]);
          return {
            meetings: notes.map((n) => ({
              id: n.id,
              team: n.team,
              teamLabel: n.team ? (labels[n.team] ?? n.team) : "Whole camp",
              title: n.title,
              heldAt: n.heldAt,
              eventId: n.calendarEventId,
              decisions: n.decisions,
              actionItems: n.actionItems,
              attendees: n.attendees,
              firstDecision: n.firstDecision,
              canEdit: canEdit(scope, n),
              url: siteUrl(meetingHref(n)),
            })),
          };
        },
      }),
  );

  server.registerTool(
    "get_meeting",
    {
      title: "Read a meeting's notes",
      description:
        "One meeting in full, as the Calendar shows it: the agenda, the notes, who was there, the decisions and the action items (with the task each became). `version` is what update_meeting_notes needs; `canEdit` says whether you may change it (its team's members this year, and captains).",
      inputSchema: z.object({ meetingId: z.string().uuid() }),
    },
    async (args, extra) =>
      runTool({
        toolName: "get_meeting",
        extra,
        argsForAudit: args,
        handler: async ({ scope }) => {
          const [note, labels] = await Promise.all([
            getMeetingNote(args.meetingId),
            labelsOf(),
          ]);
          if (!note) notFound("That meeting note isn't there any more.");
          return presentNote(note, scope, labels);
        },
      }),
  );

  server.registerTool(
    "update_meeting_notes",
    {
      title: "Change a meeting's notes",
      description: `Changes a meeting's agenda, notes or decisions, as the minutes editor's Save does. Give \`expectedVersion\`: the \`version\` from get_meeting. If someone saved since, nothing changes and you are told to read it again. What you leave out stays as it is; \`decisions\` replaces the whole list. The title and time are the calendar event's, and who was there and the action items stay as they are (change them on the Calendar). ${MEETING_NOTE_PRIVACY_REMINDER}`,
      inputSchema: z.object({
        meetingId: z.string().uuid(),
        expectedVersion: z.number().int().min(1),
        agenda: z.string().max(10_000).optional(),
        notes: z.string().max(20_000).optional(),
        decisions: z.array(z.string().max(500)).max(50).optional(),
      }),
    },
    async (args, extra) =>
      runTool({
        toolName: "update_meeting_notes",
        extra,
        argsForAudit: {
          meetingId: args.meetingId,
          expectedVersion: args.expectedVersion,
          fields: ["agenda", "notes", "decisions"].filter(
            (k) => args[k as keyof typeof args] !== undefined,
          ),
        },
        handler: async ({ scope }) => {
          const note = await getMeetingNote(args.meetingId);
          if (!note) notFound("That meeting note isn't there any more.");
          // The editor's form, filled from the note as read. The write is a
          // compare-and-set on expectedVersion, so a note read at another
          // version is refused here, before anything is sent back.
          if (note.version !== args.expectedVersion) {
            throw new ToolError(
              "Someone else changed this note while you were editing. Open it again to see their changes.",
            );
          }
          const parsed = MeetingMinutesInput.safeParse({
            eventId: note.calendarEventId ?? note.id,
            version: args.expectedVersion,
            agenda: args.agenda ?? note.agenda,
            notes: args.notes ?? note.notes,
            attendeeIds: note.attendees.map((a) => a.id),
            decisions: args.decisions ?? note.decisions.map((d) => d.text),
            actionItems: note.actionItems.map((item) => ({
              id: item.id,
              text: item.text,
              assigneeId: item.assigneeId,
              due: item.dueOn,
            })),
          });
          if (!parsed.success) {
            throw new ToolError(
              parsed.error.issues[0]?.message ??
                "Check the note and try again.",
            );
          }
          const input = parsed.data;
          const result = await editMeetingNote({
            actorId: scope.campUserId,
            noteId: note.id,
            version: args.expectedVersion,
            // The meeting's title and time are its calendar event's, kept as
            // the note has them, and so is its event (the write keeps its
            // title).
            title: note.title,
            heldAt: note.heldAt,
            calendarEvent: note.calendarEventId
              ? { id: note.calendarEventId, title: null }
              : null,
            agenda: input.agenda,
            notes: input.notes,
            attendeeIds: input.attendeeIds,
            decisions: input.decisions,
            actionItems: input.actionItems.map((item) => ({
              id: item.id,
              text: item.text,
              assigneeId: item.assigneeId,
              dueOn: item.due,
            })),
          });
          if (!result.ok) throw new ToolError(result.error);
          const saved = await getMeetingNote(note.id);
          // `version` is the one THIS save made (its own UPDATE ... RETURNING),
          // never the re-read's: someone saving in between must not hand a
          // later row on a voice list their version to pass its check with.
          return saved
            ? {
                ...presentNote(saved, scope, await labelsOf()),
                version: result.version,
              }
            : { id: note.id, version: result.version };
        },
      }),
  );
}
