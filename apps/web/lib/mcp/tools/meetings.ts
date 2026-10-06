import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import {
  campDayKey,
  canWorkInTeam,
  meetingInstant,
  meetingTimeKey,
  MEETING_NOTE_PRIVACY_REMINDER,
} from "@camp404/core";
import { EditMeetingNoteInput, Team } from "@camp404/types";
import { getTeamsConfig } from "../../camp-config";
import {
  editMeetingNote,
  getMeetingNote,
  listMeetingNotes,
  type MeetingNote,
} from "../../meeting-notes";
import { WHOLE_CAMP_MEETINGS } from "../../meeting-notes-view";
import { siteUrl } from "../capabilities";
import type { McpScope } from "../scope";
import { notFound, runTool, ToolError } from "../tool-utils";

// Meeting notes over MCP (#268), through the Meetings pages' own functions
// (lib/meeting-notes.ts → @camp404/db/meeting-notes).
//
//  - Every approved member reads every note, as on the pages.
//  - Changing a note's text is the editor's Save: editMeetingNote, which
//    re-reads the actor inside its transaction (a member of the note's team
//    this year, or a captain; whole-camp notes are captains'), and saves only
//    on the version the person read (a compare-and-set: someone else's save
//    in between is refused with the editor's sentence). The editor sends the
//    whole note, so the parts not given here are sent back exactly as read:
//    the date, the calendar event, who was there and the action items.
//  - Writing a new note, ticking attendees, action items and putting one on
//    the task board stay on the page. No audit row: the site writes none for
//    team planning data.

const MEETINGS_PATH = "/meetings";

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
    calendarEvent: note.calendarEventTitle,
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
    url: siteUrl(`${MEETINGS_PATH}/${note.id}`),
  };
}

export function registerMeetingTools(server: McpServer): void {
  server.registerTool(
    "list_meetings",
    {
      title: "List meetings",
      description:
        'Meeting notes, newest meeting first, as the Meetings page lists them: the team (or the whole camp), title, when, how many decisions, action items and people, and the first decision. `team` is a team key, or "camp" for whole-camp meetings.',
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
              decisions: n.decisions,
              actionItems: n.actionItems,
              attendees: n.attendees,
              firstDecision: n.firstDecision,
              canEdit: canEdit(scope, n),
              url: siteUrl(`${MEETINGS_PATH}/${n.id}`),
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
        "One meeting in full, as its page shows it: the agenda, the notes, who was there, the decisions and the action items (with the task each became). `version` is what update_meeting_notes needs; `canEdit` says whether you may change it (its team's members this year, and captains).",
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
      description: `Changes a meeting's title, agenda, notes or decisions, as the editor's Save does. Give \`expectedVersion\`: the \`version\` from get_meeting. If someone saved since, nothing changes and you are told to read it again. What you leave out stays as it is; \`decisions\` replaces the whole list. Who was there and the action items stay as they are (change them on the page). ${MEETING_NOTE_PRIVACY_REMINDER}`,
      inputSchema: z.object({
        meetingId: z.string().uuid(),
        expectedVersion: z.number().int().min(1),
        title: z.string().max(120).optional(),
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
          fields: ["title", "agenda", "notes", "decisions"].filter(
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
          const parsed = EditMeetingNoteInput.safeParse({
            noteId: note.id,
            version: args.expectedVersion,
            title: args.title ?? note.title,
            date: campDayKey(note.heldAt),
            time: meetingTimeKey(note.heldAt),
            calendarEventId: note.calendarEventId,
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
            noteId: input.noteId,
            version: input.version,
            title: input.title,
            heldAt: meetingInstant(input.date, input.time),
            // The note's own event, kept as it is (the write keeps its title).
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
          return saved
            ? presentNote(saved, scope, await labelsOf())
            : { id: note.id };
        },
      }),
  );
}
