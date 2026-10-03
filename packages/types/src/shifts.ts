import { z } from "zod";
import { Team } from "./roles";

// The shift roster (#248). Members sign up in the app BEFORE the burn; the
// roster is printed for site, and changes on site are written on the paper
// (owner, 2026-09-30). There is no internet at the burn, so nothing here is
// needed during it. Who may set shifts up is the server's rule
// (canManageShifts in @camp404/core), never this shape's.

/**
 * How many shifts each member is asked to take in burn week. A reminder
 * only: it never blocks anything (owner, 2026-09-30).
 */
export const SHIFT_MINIMUM = 3;

/** A slot is open to sign-ups, or a lead marked it not needed that day. */
export const SHIFT_SLOT_STATUSES = ["open", "not_needed"] as const;
export const ShiftSlotStatus = z.enum(SHIFT_SLOT_STATUSES);
export type ShiftSlotStatus = z.infer<typeof ShiftSlotStatus>;

export const SHIFT_NAME_MAX = 60;
export const SHIFT_NOTE_MAX = 300;
/** The most people one shift takes on one day. */
export const SHIFT_MAX_PLACES = 20;
/** The shortest and longest shift, in minutes. */
export const SHIFT_MIN_MINUTES = 15;
export const SHIFT_MAX_MINUTES = 12 * 60;
/** A guard against a runaway list: shift types per year. */
export const MAX_SHIFT_TYPES = 60;
/** The most days a burn's roster runs: a guard against a mistyped year. */
export const MAX_SHIFT_DAYS = 14;

export const VOLUNTEER_DEPARTMENT_MAX = 60;
/** A member's own AfrikaBurn volunteer shifts, at most. */
export const MAX_VOLUNTEER_SHIFTS = 20;

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** A real calendar day as YYYY-MM-DD. */
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

/** Minutes after midnight, on a quarter hour. */
const startMinute = z
  .number({ message: "Pick a start time." })
  .int("Pick a start time.")
  .min(0, "Pick a start time.")
  .max(24 * 60 - 15, "Pick a start time.")
  .refine((v) => v % 15 === 0, "Start on the hour or a quarter past.");

const durationMinutes = z
  .number({ message: "Say how long it is." })
  .int("Say how long it is.")
  .min(SHIFT_MIN_MINUTES, `A shift is at least ${SHIFT_MIN_MINUTES} minutes.`)
  .max(SHIFT_MAX_MINUTES, `A shift is ${SHIFT_MAX_MINUTES / 60} hours at most.`)
  .refine((v) => v % 15 === 0, "Use whole quarter hours.");

/**
 * Row ids. Postgres accepts any 8-4-4-4-12 hex string as a uuid, and so does
 * this; z.uuid() would also demand the RFC version bits.
 */
const uuid = z.guid();
/** A member's id. The database checks it is a uuid; the E2E store's are not. */
const memberId = z.string().min(1).max(100);

/** Adding (no `id`) or changing one shift type of this year. */
export const SaveShiftTypeInput = z.object({
  id: uuid.nullable().optional(),
  team: Team,
  name: z
    .string()
    .trim()
    .min(1, "Give the shift a name.")
    .max(SHIFT_NAME_MAX, `Keep the name under ${SHIFT_NAME_MAX} characters.`),
  startMinute,
  durationMinutes,
  places: z
    .number({ message: "Say how many people it needs." })
    .int("Say how many people it needs.")
    .min(1, "A shift needs at least 1 person.")
    .max(SHIFT_MAX_PLACES, `A shift takes ${SHIFT_MAX_PLACES} people at most.`),
  note: z
    .string()
    .trim()
    .max(SHIFT_NOTE_MAX, `Keep the note under ${SHIFT_NOTE_MAX} characters.`)
    .nullable()
    .optional()
    .transform((v) => (v ? v : null)),
  /**
   * The Survival Guide duty card for this shift (#250): an id, or null for
   * none. Left out, a change keeps its card and a new shift takes last year's
   * card for a shift of the same name.
   */
  dutyCardId: uuid.nullable().optional(),
  /** The version the editor saw; 0 for a new shift. */
  expectedVersion: z.number().int().min(0),
});
export type SaveShiftTypeInput = z.infer<typeof SaveShiftTypeInput>;

/** Removing a shift type (only while nobody is on it). */
export const RemoveShiftTypeInput = z.object({
  id: uuid,
  expectedVersion: z.number().int().min(1),
});
export type RemoveShiftTypeInput = z.infer<typeof RemoveShiftTypeInput>;

/** Adding the Burn days a shift type has no slot for yet. */
export const FillShiftDaysInput = z.object({ typeId: uuid });
export type FillShiftDaysInput = z.infer<typeof FillShiftDaysInput>;

/** Marking one day's slot needed again, or not needed. */
export const SetSlotNeededInput = z.object({
  slotId: uuid,
  needed: z.boolean(),
  expectedVersion: z.number().int().min(1),
});
export type SetSlotNeededInput = z.infer<typeof SetSlotNeededInput>;

/** The signed-in member taking, or leaving, one slot. */
export const ShiftSlotInput = z.object({ slotId: uuid });
export type ShiftSlotInput = z.infer<typeof ShiftSlotInput>;

/** A lead or a captain putting a member on a slot, or taking them off. */
export const ShiftMemberInput = z.object({ slotId: uuid, userId: memberId });
export type ShiftMemberInput = z.infer<typeof ShiftMemberInput>;

/**
 * One of the member's own AfrikaBurn volunteer shifts (Rangers, Greeters,
 * Sanctuary): not ours to fill, only so their camp shifts do not clash.
 */
export const AddVolunteerShiftInput = z.object({
  department: z
    .string()
    .trim()
    .min(1, "Say which department it is.")
    .max(
      VOLUNTEER_DEPARTMENT_MAX,
      `Keep it under ${VOLUNTEER_DEPARTMENT_MAX} characters.`,
    ),
  day: day("Pick the day."),
  startMinute,
  durationMinutes,
});
export type AddVolunteerShiftInput = z.infer<typeof AddVolunteerShiftInput>;

export const RemoveVolunteerShiftInput = z.object({ id: uuid });
export type RemoveVolunteerShiftInput = z.infer<
  typeof RemoveVolunteerShiftInput
>;
