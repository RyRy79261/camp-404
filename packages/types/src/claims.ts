import { z } from "zod";
import { Team } from "./roles";

// Team budgets and claims (#242). A team has one budget for the year, set by
// the Finance team; a member claims back money they spent for a team, with at
// least one receipt; a lead of that team (or a captain) says yes, and the
// Finance team pays it. These are the shapes a form or a server action sends.
// Money is whole rand cents: a screen turns what someone typed into cents with
// parseMoneyToMinor (@camp404/core) before it sends. Who may do what is the
// server's rule (canApproveClaim and canManageMoney in @camp404/core), never
// this shape's.

/**
 * Where a claim is. Paid is the end: there is no "matched to the bank" step
 * after it (owner, 2026-10-05). Mirrored by reimbursement_status in the
 * database.
 */
export const CLAIM_STATUSES = [
  "submitted",
  "approved",
  "paid",
  "rejected",
] as const;
export const ClaimStatus = z.enum(CLAIM_STATUSES);
export type ClaimStatus = z.infer<typeof ClaimStatus>;

/** A South African bank account, or one abroad. */
export const CLAIM_ACCOUNT_TYPES = ["sa", "international"] as const;
export const ClaimAccountType = z.enum(CLAIM_ACCOUNT_TYPES, {
  error: "Pick where your bank is.",
});
export type ClaimAccountType = z.infer<typeof ClaimAccountType>;

/** The longest text each field takes. */
export const CLAIM_DESCRIPTION_MAX = 300;
export const CLAIM_ACCOUNT_MAX = 300;
export const CLAIM_NOTE_MAX = 500;
/** Said when Finance turns down an approved claim without saying why. */
export const CLAIM_NEEDS_A_REASON =
  "Say why, so the member knows: the team already said yes.";
/** The most receipt files one claim takes. */
export const CLAIM_MAX_FILES = 5;

/** Whole cents above zero, at most R1 000 000. */
const Cents = z
  .number({ error: "Type the amount in rands." })
  .int({ error: "Type the amount in rands, like 450 or 450,50." })
  .positive({ error: "The amount must be more than R0." })
  .max(100_000_000, { error: "That amount is too large." });

/** A calendar day, YYYY-MM-DD, that exists (the UTC round trip refuses 30 Feb). */
const Day = z.string().refine(
  (value) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(`${value}T00:00:00.000Z`);
    return (
      !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
    );
  },
  { error: "Pick the day you bought it." },
);

const requiredText = (max: number, empty: string, long: string) =>
  z
    .string({ error: empty })
    .trim()
    .min(1, { error: empty })
    .max(max, { error: long });

/** Free text that is trimmed, and blank means none. */
const optionalText = (max: number, message: string) =>
  z.preprocess(
    (value) =>
      typeof value === "string" && value.trim() === "" ? null : value,
    z.string().trim().max(max, { error: message }).nullable().default(null),
  );

/**
 * A member's claim, without its files: the upload route checks and stores
 * those, and refuses a claim with none.
 */
export const ClaimInput = z.object({
  team: z.enum(Team.options, { error: "Pick the team it was for." }),
  description: requiredText(
    CLAIM_DESCRIPTION_MAX,
    "Say what you bought.",
    `Keep what you bought under ${CLAIM_DESCRIPTION_MAX} characters.`,
  ),
  amountCents: Cents,
  spentOn: Day,
  accountType: ClaimAccountType,
  accountDetails: requiredText(
    CLAIM_ACCOUNT_MAX,
    "Add the bank account to pay you back into.",
    `Keep the bank details under ${CLAIM_ACCOUNT_MAX} characters.`,
  ),
});
export type ClaimInput = z.infer<typeof ClaimInput>;

/**
 * A claim's id. Not checked as a uuid: the E2E test store names its claims
 * otherwise, and the database refuses an id that is not one.
 */
const ClaimId = z.string().trim().min(1).max(64);

/** A team's yes or no on a claim waiting for it. A no may say why. */
export const ClaimDecisionInput = z.object({
  claimId: ClaimId,
  decision: z.enum(["approved", "rejected"]),
  note: optionalText(
    CLAIM_NOTE_MAX,
    `Keep the note under ${CLAIM_NOTE_MAX} characters.`,
  ),
});
export type ClaimDecisionInput = z.infer<typeof ClaimDecisionInput>;

/** The Finance team paying an approved claim, or turning it down after all. */
export const ClaimPayInput = z
  .object({
    claimId: ClaimId,
    decision: z.enum(["paid", "rejected"]),
    note: optionalText(
      CLAIM_NOTE_MAX,
      `Keep the note under ${CLAIM_NOTE_MAX} characters.`,
    ),
  })
  .superRefine((value, ctx) => {
    // The team already said yes, so turning it down after all needs a reason
    // the member can read.
    if (value.decision === "rejected" && value.note === null) {
      ctx.addIssue({
        code: "custom",
        path: ["note"],
        message: CLAIM_NEEDS_A_REASON,
      });
    }
  });
export type ClaimPayInput = z.infer<typeof ClaimPayInput>;

/** A claim whose bank details the Finance team opens. */
export const ClaimRefInput = z.object({ claimId: ClaimId });

/**
 * A team's budget for the year. `amountCents` null clears it. `expectedCents`
 * is the amount the editor saw (null: none set), so a change made by someone
 * else in between is refused rather than overwritten.
 */
export const BudgetInput = z.object({
  team: z.enum(Team.options, { error: "Pick a team." }),
  amountCents: z
    .number({ error: "Type the budget in rands." })
    .int({ error: "Type the budget in rands, like 5000 or 5000,50." })
    .min(0, { error: "A budget can't be below R0." })
    .max(100_000_000, { error: "That budget is too large." })
    .nullable(),
  expectedCents: z.number().int().min(0).nullable(),
});
export type BudgetInput = z.infer<typeof BudgetInput>;
