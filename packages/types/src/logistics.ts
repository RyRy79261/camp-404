import { z } from "zod";

// The logistics calendar (#247): the year's big days, from packing at the
// storage unit to unpacking there again. Each phase is a run of whole camp
// days with an optional place and note. Who may set them is the server's rule
// (canEditLogistics in @camp404/core), never this shape's.

/** The phases, in the order the camp lives them. */
export const LOGISTICS_PHASES = [
  "pack",
  "travel",
  "build",
  "burn",
  "strike",
  "unpack",
] as const;
export const LogisticsPhase = z.enum(LOGISTICS_PHASES);
export type LogisticsPhase = z.infer<typeof LogisticsPhase>;

/** Each phase's name, on the page and on the camp's Google Calendar. */
export const LOGISTICS_PHASE_LABELS: Readonly<Record<LogisticsPhase, string>> =
  {
    pack: "Pack",
    travel: "Travel",
    build: "Build",
    burn: "Burn",
    strike: "Strike",
    unpack: "Unpack",
  };

/** What each phase is, in plain words. */
export const LOGISTICS_PHASE_HINTS: Readonly<Record<LogisticsPhase, string>> = {
  pack: "Load the trailer and the truck at the storage unit.",
  travel: "Drive to site.",
  build: "Set up camp.",
  burn: "The burn itself.",
  strike: "Take camp down and pack the truck.",
  unpack: "Unload at the storage unit.",
};

export const LOGISTICS_PLACE_MAX = 120;
export const LOGISTICS_NOTE_MAX = 500;
/** The longest a phase may run, in days: a guard against a mistyped year. */
export const LOGISTICS_MAX_DAYS = 31;

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

/** An empty box is no value. */
const optionalText = (max: number, message: string) =>
  z
    .string()
    .trim()
    .max(max, message)
    .nullable()
    .optional()
    .transform((v) => (v ? v : null));

/** Whole days from `start` to `end`, both counted. */
export function logisticsPhaseDays(start: string, end: string): number {
  const ms = Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`);
  return Math.round(ms / 86_400_000) + 1;
}

/** Setting one phase's days (and place and note) for this year. */
export const SetLogisticsPhaseInput = z
  .object({
    phase: LogisticsPhase,
    startDate: day("Pick the first day."),
    endDate: day("Pick the last day."),
    place: optionalText(
      LOGISTICS_PLACE_MAX,
      `Keep the place under ${LOGISTICS_PLACE_MAX} characters.`,
    ),
    note: optionalText(
      LOGISTICS_NOTE_MAX,
      `Keep the note under ${LOGISTICS_NOTE_MAX} characters.`,
    ),
    /** The version the editor saw; 0 when the phase has no row yet. */
    expectedVersion: z.number().int().min(0),
  })
  .superRefine((value, ctx) => {
    if (value.endDate < value.startDate) {
      ctx.addIssue({
        code: "custom",
        path: ["endDate"],
        message: "The last day can't be before the first.",
      });
      return;
    }
    if (
      logisticsPhaseDays(value.startDate, value.endDate) > LOGISTICS_MAX_DAYS
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["endDate"],
        message: `A phase can run ${LOGISTICS_MAX_DAYS} days at most.`,
      });
    }
  });
export type SetLogisticsPhaseInput = z.infer<typeof SetLogisticsPhaseInput>;

/** Clearing one phase's days: it comes off the camp calendar. */
export const ClearLogisticsPhaseInput = z.object({
  phase: LogisticsPhase,
  expectedVersion: z.number().int().min(1),
});
export type ClearLogisticsPhaseInput = z.infer<typeof ClearLogisticsPhaseInput>;

// --- Attendance (#247 follow-up) ---------------------------------------------
// Every member who is coming is asked whether they can help on the days that
// need hands (owner, 2026-09-30: "It's a standard attendance thing that the
// whole camp must be involved"). Travel and the Burn itself need no answer:
// everyone travels, and the Burn is the burn.

/** The phases that need hands, in the camp's order. */
export const ATTENDANCE_PHASES = ["pack", "build", "strike", "unpack"] as const;
export const AttendancePhase = z.enum(ATTENDANCE_PHASES);
export type AttendancePhase = z.infer<typeof AttendancePhase>;

/** Whether a logistics phase is one members say they can help with. */
export function isAttendancePhase(phase: string): phase is AttendancePhase {
  return (ATTENDANCE_PHASES as readonly string[]).includes(phase);
}

/** A member's answer for one phase. Maybe is a real answer. */
export const ATTENDANCE_ANSWERS = ["going", "maybe", "cant"] as const;
export const AttendanceAnswer = z.enum(ATTENDANCE_ANSWERS);
export type AttendanceAnswer = z.infer<typeof AttendanceAnswer>;

export const ATTENDANCE_ANSWER_LABELS: Readonly<
  Record<AttendanceAnswer, string>
> = {
  going: "Going",
  maybe: "Maybe",
  cant: "Can't",
};

/** A member's own answer for one phase. */
export const SetAttendanceInput = z.object({
  phase: AttendancePhase,
  answer: AttendanceAnswer,
  /** The answer the member saw; null when they had not answered. */
  expected: AttendanceAnswer.nullable(),
});
export type SetAttendanceInput = z.infer<typeof SetAttendanceInput>;

// --- AfrikaBurn deadlines ----------------------------------------------------
// The year's dates AfrikaBurn sets (grant applications, theme camp
// registration, DDT sales, WAP and vehicle passes). Captains add them one at a
// time, because they are not all known at once (owner, 2026-09-30). A date is
// optional until it is known; one with a date goes onto the camp calendar.

export const DEADLINE_TITLE_MAX = 120;
export const DEADLINE_NOTE_MAX = 500;

/** The words of a deadline, as a captain types them. */
const deadlineFields = {
  title: z
    .string()
    .trim()
    .min(1, "Give the date a name.")
    .max(
      DEADLINE_TITLE_MAX,
      `Keep the title under ${DEADLINE_TITLE_MAX} characters.`,
    ),
  /** YYYY-MM-DD, or empty while the date is not known. */
  dueDate: z
    .union([day("Pick a real date."), z.literal("")])
    .nullable()
    .optional()
    .transform((v) => (v ? v : null)),
  note: optionalText(
    DEADLINE_NOTE_MAX,
    `Keep the note under ${DEADLINE_NOTE_MAX} characters.`,
  ),
};

/** A new deadline. */
export const AddDeadlineInput = z.object(deadlineFields);
export type AddDeadlineInput = z.infer<typeof AddDeadlineInput>;

const deadlineId = z.guid("That deadline isn't there any more.");

/** A deadline's words and date, changed; the done tick too, when sent. */
export const EditDeadlineInput = z.object({
  ...deadlineFields,
  id: deadlineId,
  expectedVersion: z.number().int().min(1),
  done: z.boolean().optional(),
});
export type EditDeadlineInput = z.infer<typeof EditDeadlineInput>;

/** The done tick. */
export const SetDeadlineDoneInput = z.object({
  id: deadlineId,
  done: z.boolean(),
  expectedVersion: z.number().int().min(1),
});
export type SetDeadlineDoneInput = z.infer<typeof SetDeadlineDoneInput>;

/** Removing a deadline: it comes off the camp calendar too. */
export const RemoveDeadlineInput = z.object({
  id: deadlineId,
  expectedVersion: z.number().int().min(1),
});
export type RemoveDeadlineInput = z.infer<typeof RemoveDeadlineInput>;

// --- AfrikaBurn's standard dates ---------------------------------------------
// The dates AfrikaBurn sets every year (owner, 2026-10-01, mock-up A): the
// year page lists them all, each "Not announced yet" until a captain sets it.
// The names, groups and help lines are @camp404/core's AFRIKABURN_DATES; this
// is only the stable key each one is stored under (afrikaburn_deadlines.kind).
// A deadline with no kind is one of "Other": a captain's own title.

export const AFRIKABURN_DATE_KINDS = [
  "form_1_opens",
  "form_2",
  "registration_closes",
  "art_grants_close",
  "wap_requests_open",
  "wap_requests_close",
  "waps_sent_out",
  "tickets_open",
  "ddt_deadline",
  "second_ddt_round",
  "tickets_close",
] as const;
export const AfrikaburnDateKind = z.enum(AFRIKABURN_DATE_KINDS);
export type AfrikaburnDateKind = z.infer<typeof AfrikaburnDateKind>;

/**
 * Setting or changing one of AfrikaBurn's standard dates. `expectedVersion`
 * is null when it was "Not announced yet" (nothing stored), else the version
 * the captain saw. `skipped` is "No round this year" (only the dates that
 * allow it: afrikaburnDateMayBeSkipped in @camp404/core); a skipped date
 * has no day. `done` is sent only by the Change dialog.
 */
export const SetAfrikaburnDateInput = z
  .object({
    kind: AfrikaburnDateKind,
    dueDate: deadlineFields.dueDate,
    note: deadlineFields.note,
    skipped: z.boolean().default(false),
    done: z.boolean().optional(),
    expectedVersion: z.number().int().min(1).nullable(),
  })
  .superRefine((v, ctx) => {
    if (!v.skipped && !v.dueDate) {
      ctx.addIssue({
        code: "custom",
        path: ["dueDate"],
        message: "Pick the date.",
      });
    }
  })
  .transform((v) => (v.skipped ? { ...v, dueDate: null } : v));
export type SetAfrikaburnDateInput = z.infer<typeof SetAfrikaburnDateInput>;
