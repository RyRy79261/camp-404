import { z } from "zod";
import { CalendarEventId } from "./calendar";
import { Team } from "./roles";

// What a team member types to record a meeting (#268). Who may write for which
// team is the server's rule (canWorkInTeam), not this shape's.

const DAY = /^\d{4}-\d{2}-\d{2}$/;

const day = (message: string) =>
  z
    .string()
    .regex(DAY, message)
    .refine(
      (v) =>
        !Number.isNaN(Date.parse(`${v}T00:00:00Z`)) &&
        new Date(`${v}T00:00:00Z`).toISOString().startsWith(v),
      message,
    );

/** How many lines a note may hold of each list. */
export const MEETING_NOTE_LIST_MAX = 50;

/**
 * One action item as the editor sends it. `id` names one already saved. Every
 * action item is a task on the board (owner, 2026-10-11): `team` is where the
 * task is filed (the meeting's team by default; null is the whole camp). An
 * item already on the board keeps its words, person, team and deadline there:
 * the editor sends them back as it read them, and a changed text is refused.
 */
export const MeetingActionItemInput = z.object({
  id: z.string().min(1).max(100).nullable(),
  text: z
    .string()
    .trim()
    .min(1, "Write what needs doing, or remove the empty action item.")
    .max(120, "Keep each action item under 120 characters."),
  assigneeId: z.string().min(1).max(100).nullable(),
  team: Team.nullable(),
  due: day("Pick a date for the action item's deadline.").nullable(),
});
export type MeetingActionItemInput = z.infer<typeof MeetingActionItemInput>;

/**
 * A meeting's agenda and minutes, as the minutes editor sends them (owner,
 * 2026-10-10: a meeting is an event on the calendar, with an agenda before and
 * minutes after). The meeting's title, team and time are its calendar
 * event's, never the editor's. `version` is the note's version the editor
 * opened, or null when the meeting has no note yet (an event made in Google,
 * given minutes for the first time).
 */
export const MeetingMinutesInput = z.object({
  /** The meeting's calendar event id. */
  eventId: CalendarEventId,
  version: z.number().int().min(1).nullable(),
  agenda: z
    .string()
    .trim()
    .max(10_000, "Keep the agenda under 10,000 characters."),
  notes: z
    .string()
    .trim()
    .max(20_000, "Keep the notes under 20,000 characters."),
  attendeeIds: z
    .array(z.string().min(1).max(100))
    .max(200)
    .transform((ids) => [...new Set(ids)]),
  decisions: z
    .array(
      z
        .string()
        .trim()
        .min(1, "Write the decision, or remove the empty line.")
        .max(500, "Keep each decision under 500 characters."),
    )
    .max(MEETING_NOTE_LIST_MAX, "That's a lot of decisions: at most 50."),
  actionItems: z
    .array(MeetingActionItemInput)
    .max(MEETING_NOTE_LIST_MAX, "That's a lot of action items: at most 50."),
});
export type MeetingMinutesInput = z.infer<typeof MeetingMinutesInput>;

/**
 * "Find decisions and action items" (owner, 2026-10-11): what the editor sends
 * for Claude to read. Nothing here is stored; the meeting is its calendar
 * event, and the server reads its team, date and people itself.
 */
export const MeetingSuggestInput = z.object({
  eventId: CalendarEventId,
  agenda: z.string().max(10_000, "Keep the agenda under 10,000 characters."),
  notes: z.string().max(20_000, "Keep the notes under 20,000 characters."),
  /** Who is ticked as there now, in the open editor. */
  attendeeIds: z.array(z.string().min(1).max(100)).max(200),
  /** What the editor holds already, so Claude does not propose it again. */
  decisions: z.array(z.string().max(500)).max(MEETING_NOTE_LIST_MAX),
  actionItems: z.array(z.string().max(120)).max(MEETING_NOTE_LIST_MAX),
});
export type MeetingSuggestInput = z.infer<typeof MeetingSuggestInput>;

/**
 * Claude's answer, as its tool returns it: checked with this shape before the
 * server reads a word of it. Lengths are generous here; the server trims each
 * line to what the editor allows.
 */
export const MeetingSuggestionAnswer = z.object({
  decisions: z
    .array(
      z.object({
        text: z.string().min(1).max(2_000),
        already_listed: z.boolean(),
      }),
    )
    .max(100),
  action_items: z
    .array(
      z.object({
        text: z.string().min(1).max(2_000),
        /** The person in the notes' own words; null when nobody is named. */
        person: z.string().max(200).nullable(),
        /** A team key from the list sent; null for the whole camp or none. */
        team: z.string().max(100).nullable(),
        /** YYYY-MM-DD, or null when the notes give no deadline. */
        due: z.string().max(40).nullable(),
        /** The notes' words the date came from; null with no date. */
        due_said: z.string().max(200).nullable(),
        already_listed: z.boolean(),
      }),
    )
    .max(100),
});
export type MeetingSuggestionAnswer = z.infer<typeof MeetingSuggestionAnswer>;
