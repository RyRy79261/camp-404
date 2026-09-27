import { z } from "zod";

// INKBLOT's shared "speed of chaos" board on the web desktop: the camp's
// fastest clean sweeps, stored in `inkblot_scores`. Join's copy of the game
// keeps its board in the visitor's browser and never uses these.

/** How many runs the board shows. */
export const INKBLOT_BOARD_SIZE = 10;

/**
 * The fastest time the board accepts. The level is 2160 units wide and the
 * cat walks 220 a second, so crossing it once takes about ten seconds; a
 * faster clean sweep was not played.
 */
export const INKBLOT_MIN_DURATION_MS = 8_000;

/** The slowest: an hour. A run left paused all day is not a record. */
export const INKBLOT_MAX_DURATION_MS = 60 * 60 * 1000;

/** Three letters or digits, upper case, or "???" for none given. */
export const InkblotInitials = z
  .string()
  .regex(/^(?:[A-Z0-9]{1,3}|\?\?\?)$/, "Initials are up to three letters.");

/** A finished run, as the member's browser reports it. */
export const InkblotRun = z
  .object({
    initials: InkblotInitials,
    durationMs: z
      .number()
      .int()
      .min(INKBLOT_MIN_DURATION_MS, "That time is too fast to be real.")
      .max(INKBLOT_MAX_DURATION_MS, "That run took too long to count."),
  })
  .strict();
export type InkblotRun = z.infer<typeof InkblotRun>;

/** One row of the board, fastest first. */
export type InkblotBoardEntry = {
  id: string;
  initials: string;
  durationMs: number;
  /** When it was played, ISO. */
  at: string;
};
