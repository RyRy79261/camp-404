import { z } from "zod";
import { Team } from "./roles";

// What a captain or team lead types to put an event or a meeting on the camp
// calendar, in the Calendar's New event form (owner, 2026-10-10: "you make
// events in the calendar app"). Who may pick which team is the server's rule
// (canManageCampEvent in @camp404/core), not this shape's.
//
// An all-day event runs from its date to its end date, both counted (one day
// when they are the same). A timed event starts and ends on the same camp day:
// an event across midnight is not something the form offers.

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

/** An empty time box is no time, not a bad one. */
const optionalTime = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v ? v : undefined))
  .pipe(z.string().regex(TIME, "Use a time like 18:30.").optional());

/** An empty box is null; anything else is trimmed text. */
const optionalText = (max: number, message: string) =>
  z
    .string()
    .trim()
    .max(max, message)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null));

export const CAMP_EVENT_KIND_VALUES = ["event", "meeting"] as const;
export const CampEventKindInput = z.enum(CAMP_EVENT_KIND_VALUES);

/** How long an all-day event may run: two weeks is a long build. */
export const CAMP_EVENT_MAX_DAYS = 31;

const eventFields = {
  title: z
    .string()
    .trim()
    .min(1, "Give the event a title.")
    .max(120, "Keep the title under 120 characters."),
  description: optionalText(
    2000,
    "Keep the description under 2000 characters.",
  ),
  place: optionalText(200, "Keep the place under 200 characters."),
  team: Team.nullable(),
  date: day("Pick a date for the event."),
  /** The last day of an all-day event, counted; empty for one day. */
  endDate: z
    .string()
    .trim()
    .optional()
    .nullable()
    .transform((v) => (v ? v : null))
    .pipe(day("Pick the last day, or leave it empty.").nullable()),
  allDay: z.boolean(),
  start: optionalTime,
  end: optionalTime,
};

type EventFields = {
  date: string;
  endDate: string | null;
  allDay: boolean;
  start?: string;
  end?: string;
};

function checkWhen(value: EventFields, ctx: z.RefinementCtx): void {
  if (value.allDay) {
    if (value.endDate && value.endDate < value.date) {
      ctx.addIssue({
        code: "custom",
        path: ["endDate"],
        message: "The last day can't be before the first.",
      });
      return;
    }
    if (value.endDate) {
      const days =
        (Date.parse(`${value.endDate}T00:00:00Z`) -
          Date.parse(`${value.date}T00:00:00Z`)) /
          86_400_000 +
        1;
      if (days > CAMP_EVENT_MAX_DAYS) {
        ctx.addIssue({
          code: "custom",
          path: ["endDate"],
          message: `An event can run ${CAMP_EVENT_MAX_DAYS} days at most.`,
        });
      }
    }
    return;
  }
  if (!value.start) {
    ctx.addIssue({
      code: "custom",
      path: ["start"],
      message: "Pick a start time, or make it all day.",
    });
    return;
  }
  if (!value.end) {
    ctx.addIssue({
      code: "custom",
      path: ["end"],
      message: "Pick an end time, or make it all day.",
    });
    return;
  }
  // HH:MM strings compare in time order.
  if (value.end <= value.start) {
    ctx.addIssue({
      code: "custom",
      path: ["end"],
      message: "The event must end after it starts, on the same day.",
    });
  }
}

/** A new event, or a new meeting with its agenda. */
export const NewCampEventInput = z
  .object({
    kind: CampEventKindInput,
    ...eventFields,
    /** A meeting's agenda, in Markdown; ignored for an event. */
    agenda: z
      .string()
      .trim()
      .max(10_000, "Keep the agenda under 10,000 characters.")
      .optional()
      .transform((v) => v ?? ""),
  })
  .superRefine(checkWhen);
export type NewCampEventInput = z.infer<typeof NewCampEventInput>;

/**
 * A change to an event the app made. It carries the version the form opened,
 * so a second editor cannot silently overwrite the first. Its type stays.
 */
export const EditCampEventInput = z
  .object({
    eventId: z.string().min(1).max(200),
    version: z.number().int().min(1),
    ...eventFields,
  })
  .superRefine(checkWhen);
export type EditCampEventInput = z.infer<typeof EditCampEventInput>;

/** Take an event the app made off the calendar. */
export const RemoveCampEventInput = z.object({
  eventId: z.string().min(1).max(200),
  version: z.number().int().min(1),
});
export type RemoveCampEventInput = z.infer<typeof RemoveCampEventInput>;
