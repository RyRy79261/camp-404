import { z } from "zod";

// Dues (#240): the year's fee tiers and dates, what each member is charged,
// their payment plan, the payments they say they made, refunds, the post-burn
// settle-up and the statement import. The shapes a form or a server action
// sends. Money is whole rand cents: a screen turns what someone typed into
// cents with parseMoneyToMinor (@camp404/core) before it sends, and anything
// but a whole positive number of cents is refused here. Who may write is the
// server's rule (canManageMoney in @camp404/core), never this shape's.

/** What a charge on a member's account is for. */
export const CHARGE_KINDS = ["fee", "rental", "settle_up", "other"] as const;
export const ChargeKind = z.enum(CHARGE_KINDS);
export type ChargeKind = z.infer<typeof ChargeKind>;

/** The charges someone adds by hand; a fee and a settle-up have their own forms. */
export const MANUAL_CHARGE_KINDS = ["rental", "other"] as const;
export const ManualChargeKind = z.enum(MANUAL_CHARGE_KINDS, {
  error: "Pick what the charge is for.",
});

/** How a member says they paid. */
export const PAYMENT_METHODS = [
  "bank_transfer",
  "international_transfer",
  "cash",
  "other",
] as const;
export const PaymentMethod = z.enum(PAYMENT_METHODS, {
  error: "Pick how you paid.",
});
export type PaymentMethod = z.infer<typeof PaymentMethod>;

/** Who put a payment on the ledger. */
export const PAYMENT_SOURCES = ["captain", "member", "statement"] as const;
export type PaymentSource = (typeof PAYMENT_SOURCES)[number];

/** A refund's state: asked for, paid out, or refused with a reason. */
export const REFUND_STATUSES = ["requested", "refunded", "declined"] as const;
export const RefundStatus = z.enum(REFUND_STATUSES);
export type RefundStatus = z.infer<typeof RefundStatus>;

/** The longest text each field takes. */
export const TIER_LABEL_MAX = 60;
export const CHARGE_DESCRIPTION_MAX = 200;
export const MONEY_NOTE_MAX = 500;
/** The most instalments one plan may have. */
export const MAX_INSTALMENTS = 12;
/** The most fee tiers one year may have. */
export const MAX_FEE_TIERS = 12;

const RowId = z.guid();
/**
 * A member's or a payment's id. Not checked as a uuid here: the E2E test store
 * names its members and payments otherwise, and the database refuses an id
 * that is not one.
 */
const RefId = z.string().trim().min(1).max(64);

/** Whole cents above zero: an amount someone typed, already parsed. */
const Cents = z
  .number({ error: "Type an amount in rands." })
  .int({ error: "Type an amount in rands, like 1250 or 1250,50." })
  .positive({ error: "The amount must be more than R0." })
  .max(100_000_000, { error: "That amount is too large." });

/** A calendar day, YYYY-MM-DD, that exists (the UTC round trip refuses 30 Feb). */
export const DuesDay = z.string().refine(
  (value) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(`${value}T00:00:00.000Z`);
    return (
      !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
    );
  },
  { error: "Pick a date." },
);

/** Free text that is trimmed, and blank means none. */
const optionalText = (max: number, message: string) =>
  z.preprocess(
    (value) =>
      typeof value === "string" && value.trim() === "" ? null : value,
    z.string().trim().max(max, { error: message }).nullable().default(null),
  );

const requiredText = (max: number, empty: string, long: string) =>
  z
    .string({ error: empty })
    .trim()
    .min(1, { error: empty })
    .max(max, { error: long });

// --- The year's settings ------------------------------------------------------

/** A fee tier, added or renamed: its label and amount. */
export const FeeTierInput = z.object({
  label: requiredText(
    TIER_LABEL_MAX,
    "Give the tier a name.",
    `Keep the name under ${TIER_LABEL_MAX} characters.`,
  ),
  amountCents: Cents,
});
export type FeeTierInput = z.infer<typeof FeeTierInput>;

export const EditFeeTierInput = FeeTierInput.extend({ tierId: RowId });

/**
 * The year's dates: the deadline for dues, and the refund schedule (a full
 * refund until one day, a partial one at a percentage until a later day,
 * nothing after). Every field may be left empty.
 */
export const DuesYearInput = z
  .object({
    deadline: DuesDay.nullable(),
    fullRefundUntil: DuesDay.nullable(),
    partialRefundUntil: DuesDay.nullable(),
    partialRefundPct: z
      .number({ error: "Type a percentage from 1 to 99." })
      .int({ error: "Type a whole percentage." })
      .min(1, { error: "Type a percentage from 1 to 99." })
      .max(99, { error: "Type a percentage from 1 to 99." })
      .nullable(),
    expectedVersion: z.number().int().min(0),
  })
  .superRefine((value, ctx) => {
    const partialDay = value.partialRefundUntil !== null;
    const partialPct = value.partialRefundPct !== null;
    if (partialDay !== partialPct) {
      ctx.addIssue({
        code: "custom",
        path: [partialDay ? "partialRefundPct" : "partialRefundUntil"],
        message: "A partial refund needs both its last day and its percentage.",
      });
    }
    if (
      value.fullRefundUntil !== null &&
      value.partialRefundUntil !== null &&
      value.partialRefundUntil <= value.fullRefundUntil
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["partialRefundUntil"],
        message: "The partial refund must end after the full refund does.",
      });
    }
  });
export type DuesYearInput = z.infer<typeof DuesYearInput>;

// --- A member's own -----------------------------------------------------------

/**
 * A member's pledge: one of the year's tiers, or less than the lowest tier,
 * with the amount they can pay (a valid answer, #240).
 */
export const PledgeInput = z.discriminatedUnion(
  "kind",
  [
    z.object({ kind: z.literal("tier"), tierId: RowId }),
    z.object({ kind: z.literal("below"), amountCents: Cents }),
  ],
  { error: "Pick what you can pay." },
);
export type PledgeInput = z.infer<typeof PledgeInput>;

/** A payment a member says they made, sent with a proof file. */
export const PaymentProofInput = z.object({
  amountCents: Cents,
  paidOn: DuesDay,
  method: PaymentMethod,
  note: optionalText(
    MONEY_NOTE_MAX,
    `Keep the note under ${MONEY_NOTE_MAX} characters.`,
  ),
});
export type PaymentProofInput = z.infer<typeof PaymentProofInput>;

// --- The Finance team's writes ------------------------------------------------

/**
 * A member's fee for the year: a tier, or an amount. An amount below the
 * pledge, or any amount with a reason, is a concession; its reason is read
 * only by the Finance team.
 */
export const SetFeeInput = z.object({
  userId: RefId,
  amountCents: Cents,
  concessionReason: optionalText(
    MONEY_NOTE_MAX,
    `Keep the reason under ${MONEY_NOTE_MAX} characters.`,
  ),
});
export type SetFeeInput = z.infer<typeof SetFeeInput>;

/** A rental or other charge on one member's account. */
export const ChargeInput = z.object({
  userId: RefId,
  kind: ManualChargeKind,
  description: requiredText(
    CHARGE_DESCRIPTION_MAX,
    "Say what the charge is for.",
    `Keep it under ${CHARGE_DESCRIPTION_MAX} characters.`,
  ),
  amountCents: Cents,
});
export type ChargeInput = z.infer<typeof ChargeInput>;

/** A member's payment plan: the instalments, in the order they fall due. */
export const PaymentPlanInput = z
  .object({
    userId: RefId,
    instalments: z
      .array(z.object({ dueOn: DuesDay, amountCents: Cents }))
      .max(MAX_INSTALMENTS, {
        error: `A plan has at most ${MAX_INSTALMENTS} instalments.`,
      }),
    expectedVersion: z.number().int().min(0),
  })
  .superRefine((value, ctx) => {
    const days = value.instalments.map((i) => i.dueOn);
    if (new Set(days).size !== days.length) {
      ctx.addIssue({
        code: "custom",
        path: ["instalments"],
        message: "Give each instalment its own date.",
      });
    }
  });
export type PaymentPlanInput = z.infer<typeof PaymentPlanInput>;

/** The post-burn settle-up: a total to share out, as a top-up or a refund. */
export const SettleUpInput = z.object({
  description: requiredText(
    CHARGE_DESCRIPTION_MAX,
    "Say what the settle-up is for.",
    `Keep it under ${CHARGE_DESCRIPTION_MAX} characters.`,
  ),
  totalCents: Cents,
  direction: z.enum(["top_up", "refund"], {
    error: "Pick whether members pay more or get money back.",
  }),
  skipConcessions: z.boolean(),
});
export type SettleUpInput = z.infer<typeof SettleUpInput>;

/** One statement line the Finance team confirms as a member's payment. */
export const StatementConfirmInput = z.discriminatedUnion("kind", [
  // A new payment, received.
  z.object({
    kind: z.literal("record"),
    userId: RefId,
    amountCents: Cents,
    paidOn: DuesDay,
    description: z.string().trim().max(CHARGE_DESCRIPTION_MAX),
  }),
  // The member's own pending payment for the same amount, now seen.
  z.object({
    kind: z.literal("reconcile"),
    paymentId: RefId,
  }),
]);
export type StatementConfirmInput = z.infer<typeof StatementConfirmInput>;

/** A refund asked for on a received payment. */
export const RefundRequestInput = z.object({
  paymentId: RefId,
  amountCents: Cents,
  note: optionalText(
    MONEY_NOTE_MAX,
    `Keep the note under ${MONEY_NOTE_MAX} characters.`,
  ),
});
export type RefundRequestInput = z.infer<typeof RefundRequestInput>;

/** The Finance team's answer to a refund: paid out, or declined with a reason. */
export const RefundDecisionInput = z.discriminatedUnion("to", [
  z.object({
    refundId: RowId,
    to: z.literal("refunded"),
    amountCents: Cents,
  }),
  z.object({
    refundId: RowId,
    to: z.literal("declined"),
    reason: requiredText(
      MONEY_NOTE_MAX,
      "Say why the refund is declined.",
      `Keep the reason under ${MONEY_NOTE_MAX} characters.`,
    ),
  }),
]);
export type RefundDecisionInput = z.infer<typeof RefundDecisionInput>;

/**
 * A member asks for a refund of one of their own received payments. The
 * amount is proposed from the year's schedule; the Finance team decides.
 */
export const MemberRefundRequestInput = z.object({
  paymentId: RefId,
  note: optionalText(
    MONEY_NOTE_MAX,
    `Keep the note under ${MONEY_NOTE_MAX} characters.`,
  ),
});
export type MemberRefundRequestInput = z.infer<typeof MemberRefundRequestInput>;
