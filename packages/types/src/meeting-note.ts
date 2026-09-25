import { z } from "zod";
import { Team } from "./roles";

// What a team member types to record a meeting (#268). Who may write for which
// team is the server's rule (canWorkInTeam), not this shape's.

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

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

const meetingFields = {
  title: z
    .string()
    .trim()
    .min(1, "Give the meeting a title.")
    .max(120, "Keep the title under 120 characters."),
  date: day("Pick the meeting's date."),
  time: z.string().regex(TIME, "Use a time like 18:30."),
  /** A Google Calendar event id, when the meeting is on the camp calendar. */
  calendarEventId: z.string().min(1).max(200).nullable(),
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
};

/** A new meeting note: a team's, or the whole camp's when `team` is null. */
export const NewMeetingNoteInput = z.object({
  team: Team.nullable(),
  ...meetingFields,
});
export type NewMeetingNoteInput = z.infer<typeof NewMeetingNoteInput>;

/**
 * An edit carries the note and the version the editor opened, so a second
 * editor cannot silently overwrite the first. A note keeps its team.
 */
export const EditMeetingNoteInput = z.object({
  noteId: z.string().min(1).max(100),
  version: z.number().int().min(1),
  ...meetingFields,
});
export type EditMeetingNoteInput = z.infer<typeof EditMeetingNoteInput>;

/** Turn one action item into a task on the board. */
export const ActionItemToTaskInput = z.object({
  itemId: z.string().min(1).max(100),
});
