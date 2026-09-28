import { z } from "zod";

// The lounge programme (#269): the Ministry of Vibes' offers and its days ×
// time-bands grid. Any approved member offers an activity or a DJ set; a
// captain or a Ministry of Vibes lead decides and places it (canRunLounge in
// @camp404/core, never this shape's rule). Times are camp time
// (CAMP_TIME_ZONE); a programme day runs from 06:00 to 06:00 the next
// morning, so a set at 02:00 belongs to the night before.

export const LOUNGE_OFFER_KINDS = [
  "activity",
  "dj_set",
  "workshop",
  "other",
] as const;
export const LoungeOfferKind = z.enum(LOUNGE_OFFER_KINDS);
export type LoungeOfferKind = z.infer<typeof LoungeOfferKind>;

/** Where an offer stands. A decision moves it; an edit by its host resets it. */
export const LOUNGE_OFFER_STATUSES = [
  "offered",
  "accepted",
  "declined",
  "needs_changes",
] as const;
export const LoungeOfferStatus = z.enum(LOUNGE_OFFER_STATUSES);
export type LoungeOfferStatus = z.infer<typeof LoungeOfferStatus>;

/** What an offer needs from the camp. */
export const LOUNGE_NEEDS = ["space", "sound", "power", "materials"] as const;
export const LoungeNeed = z.enum(LOUNGE_NEEDS);
export type LoungeNeed = z.infer<typeof LoungeNeed>;

/**
 * The lounge's time bands, in programme order from 06:00. Four hours each,
 * so the six cover the whole day (the lounge is open 24/7).
 */
export const LOUNGE_BANDS = [
  "morning",
  "midday",
  "afternoon",
  "sunset",
  "night",
  "late_night",
] as const;
export const LoungeBand = z.enum(LOUNGE_BANDS);
export type LoungeBand = z.infer<typeof LoungeBand>;

/** The most programme days there can be (the Burn is about eight). */
export const MAX_LOUNGE_DAYS = 14;
/** Start times and lengths are in steps of this many minutes. */
export const LOUNGE_STEP_MINUTES = 15;
export const LOUNGE_MIN_MINUTES = 15;
export const LOUNGE_MAX_MINUTES = 8 * 60;
export const LOUNGE_TITLE_MAX = 80;
export const LOUNGE_DESCRIPTION_MAX = 1000;
export const LOUNGE_NOTE_MAX = 300;
export const LOUNGE_REASON_MAX = 500;
export const LOUNGE_POLICY_MAX = 2000;

/**
 * Row ids. Postgres accepts any 8-4-4-4-12 hex string as a uuid, and so does
 * this; the E2E store's ids are plain strings, so the facade never re-checks.
 */
const RowId = z.string().trim().min(1).max(64);

/** A blank form field is no answer, not an empty string. */
const optionalText = (max: number, message: string) =>
  z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? null : v),
    z.string().trim().max(max, message).nullable().default(null),
  );

const ProgrammeDay = z
  .number()
  .int("Pick a day.")
  .min(1, "Pick a day.")
  .max(MAX_LOUNGE_DAYS, "Pick a day of the Burn.");

const offerFields = {
  title: z
    .string()
    .trim()
    .min(1, "Give it a name.")
    .max(
      LOUNGE_TITLE_MAX,
      `Keep the name under ${LOUNGE_TITLE_MAX} characters.`,
    ),
  description: optionalText(
    LOUNGE_DESCRIPTION_MAX,
    `Keep the description under ${LOUNGE_DESCRIPTION_MAX} characters.`,
  ),
  kind: LoungeOfferKind,
  durationMinutes: z
    .number()
    .int("Pick how long it runs.")
    .min(LOUNGE_MIN_MINUTES, "It runs for at least 15 minutes.")
    .max(LOUNGE_MAX_MINUTES, "It runs for at most 8 hours.")
    .refine((m) => m % LOUNGE_STEP_MINUTES === 0, {
      message: "Use steps of 15 minutes.",
    }),
  needs: z
    .array(LoungeNeed)
    .max(LOUNGE_NEEDS.length)
    .refine((list) => new Set(list).size === list.length, {
      message: "Tick each need once.",
    })
    .default([]),
  needsNote: optionalText(
    LOUNGE_NOTE_MAX,
    `Keep the note under ${LOUNGE_NOTE_MAX} characters.`,
  ),
  preferredDays: z
    .array(ProgrammeDay)
    .max(MAX_LOUNGE_DAYS)
    .refine((list) => new Set(list).size === list.length, {
      message: "Tick each day once.",
    })
    .default([]),
  preferredBands: z
    .array(LoungeBand)
    .max(LOUNGE_BANDS.length)
    .refine((list) => new Set(list).size === list.length, {
      message: "Tick each time once.",
    })
    .default([]),
  recurring: z.boolean().default(false),
  publicGuide: z.boolean().default(false),
};

/** A new offer, from any approved member. */
export const LoungeOfferInput = z.object(offerFields);
export type LoungeOfferInput = z.infer<typeof LoungeOfferInput>;

/** The host changes their own offer; `expectedVersion` is what they saw. */
export const EditLoungeOfferInput = z.object({
  ...offerFields,
  offerId: RowId,
  expectedVersion: z.number().int().min(1),
});
export type EditLoungeOfferInput = z.infer<typeof EditLoungeOfferInput>;

export const WithdrawLoungeOfferInput = z.object({ offerId: RowId });
export type WithdrawLoungeOfferInput = z.infer<typeof WithdrawLoungeOfferInput>;

/** The decisions a reviewer can make. */
export const LOUNGE_DECISIONS = [
  "accepted",
  "declined",
  "needs_changes",
] as const;
export const LoungeDecision = z.enum(LOUNGE_DECISIONS);
export type LoungeDecision = z.infer<typeof LoungeDecision>;

/**
 * A decision, as a compare-and-set on the status and version the reviewer
 * saw. Declining or asking for changes needs a reason the host will read.
 */
export const DecideLoungeOfferInput = z
  .object({
    offerId: RowId,
    decision: LoungeDecision,
    expectedStatus: LoungeOfferStatus,
    expectedVersion: z.number().int().min(1),
    reason: optionalText(
      LOUNGE_REASON_MAX,
      `Keep the reason under ${LOUNGE_REASON_MAX} characters.`,
    ),
  })
  .refine((d) => d.decision !== d.expectedStatus, {
    message: "It already has that answer.",
    path: ["decision"],
  })
  .refine((d) => d.decision === "accepted" || d.reason !== null, {
    message: "Say why, so the host knows what to do.",
    path: ["reason"],
  });
export type DecideLoungeOfferInput = z.infer<typeof DecideLoungeOfferInput>;

/** Put an accepted offer on the programme: a day and a start time. */
export const PlaceLoungeOfferInput = z.object({
  offerId: RowId,
  day: ProgrammeDay,
  /** Minutes after midnight, camp time, in 15-minute steps. */
  startMinute: z
    .number()
    .int("Pick a start time.")
    .min(0, "Pick a start time.")
    .max(24 * 60 - LOUNGE_STEP_MINUTES, "Pick a start time.")
    .refine((m) => m % LOUNGE_STEP_MINUTES === 0, {
      message: "Use steps of 15 minutes.",
    }),
});
export type PlaceLoungeOfferInput = z.infer<typeof PlaceLoungeOfferInput>;

export const RemoveLoungeSlotInput = z.object({ slotId: RowId });
export type RemoveLoungeSlotInput = z.infer<typeof RemoveLoungeSlotInput>;

/** The team's music guidance for DJs, shown on the DJ set form. */
export const LoungeMusicPolicyInput = z.object({
  musicPolicy: optionalText(
    LOUNGE_POLICY_MAX,
    `Keep the note under ${LOUNGE_POLICY_MAX} characters.`,
  ),
  /** 0 when the year has no settings saved yet. */
  expectedVersion: z.number().int().min(0),
});
export type LoungeMusicPolicyInput = z.infer<typeof LoungeMusicPolicyInput>;
