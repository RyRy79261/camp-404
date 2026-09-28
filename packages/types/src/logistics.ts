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
