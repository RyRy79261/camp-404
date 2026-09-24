import { z } from "zod";
import { Team } from "./roles";

// What a captain or team lead types to put an event on the camp calendar. Who
// may pick which team is the server's rule, not this shape's. A timed event
// starts and ends on the same camp day: an event across midnight is not
// something the form offers.

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/** An empty time box is no time, not a bad one. */
const optionalTime = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v ? v : undefined))
  .pipe(z.string().regex(TIME, "Use a time like 18:30.").optional());

export const AddCalendarEventInput = z
  .object({
    title: z
      .string()
      .trim()
      .min(1, "Give the event a title.")
      .max(120, "Keep the title under 120 characters."),
    description: z
      .string()
      .trim()
      .max(2000, "Keep the details under 2000 characters.")
      .optional()
      .transform((v) => (v ? v : null)),
    team: Team.nullable(),
    date: z
      .string()
      .regex(DAY, "Pick a date for the event.")
      .refine(
        (v) =>
          !Number.isNaN(Date.parse(`${v}T00:00:00Z`)) &&
          new Date(`${v}T00:00:00Z`).toISOString().startsWith(v),
        "Pick a date for the event.",
      ),
    allDay: z.boolean(),
    start: optionalTime,
    end: optionalTime,
  })
  .superRefine((value, ctx) => {
    if (value.allDay) return;
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
  });
export type AddCalendarEventInput = z.infer<typeof AddCalendarEventInput>;
