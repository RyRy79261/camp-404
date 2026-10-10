import { z } from "zod";

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

/** One action item as the editor sends it. `id` names one already saved. */
export const MeetingActionItemInput = z.object({
  id: z.string().min(1).max(100).nullable(),
  text: z
    .string()
    .trim()
    .min(1, "Write what needs doing, or remove the empty action item.")
    .max(120, "Keep each action item under 120 characters."),
  assigneeId: z.string().min(1).max(100).nullable(),
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
  eventId: z.string().min(1).max(200),
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

/** Turn one action item into a task on the board. */
export const ActionItemToTaskInput = z.object({
  itemId: z.string().min(1).max(100),
});
