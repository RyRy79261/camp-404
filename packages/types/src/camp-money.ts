import { z } from "zod";
import { DuesDay } from "./dues";

// The camp's own money (camp fees sprint, owner 2026-10-27): the bank details
// members pay into, the bank balance Finance types in, and the bills the camp
// must pay. The shapes a form or a server action sends. Money is whole rand
// cents (ZAR only). Who may write is the server's rule (MONEY_KEEPER in
// @camp404/core), never this shape's.

/** The longest text each field takes. */
export const BANK_FIELD_MAX = 120;
export const BANK_NOTE_MAX = 500;
export const BILL_NAME_MAX = 120;
/** The most months a monthly bill runs for. */
export const MAX_BILL_MONTHS = 60;

/** Trimmed text; blank means none. */
const optionalText = (max: number) =>
  z.preprocess(
    (value) =>
      typeof value === "string" && value.trim() === "" ? null : value,
    z
      .string()
      .trim()
      .max(max, { error: `Keep it under ${max} characters.` })
      .nullable()
      .default(null),
  );

/**
 * Where members pay the camp: an account in South Africa, and what someone
 * paying from abroad needs (SWIFT, the bank's address, a note on transfer
 * fees). Every field may be left blank until Finance types it; nothing is
 * seeded. The camp's own account, shown to every member who owes, so it is
 * not a member's private bank details and is not encrypted.
 */
export const CampBankDetails = z.object({
  southAfrica: z.object({
    bank: optionalText(BANK_FIELD_MAX),
    accountName: optionalText(BANK_FIELD_MAX),
    accountNumber: optionalText(BANK_FIELD_MAX),
    branchCode: optionalText(BANK_FIELD_MAX),
  }),
  abroad: z.object({
    swift: optionalText(BANK_FIELD_MAX),
    accountNumber: optionalText(BANK_FIELD_MAX),
    bankAddress: optionalText(BANK_FIELD_MAX),
    note: optionalText(BANK_NOTE_MAX),
  }),
});
export type CampBankDetails = z.infer<typeof CampBankDetails>;

/** Bank details with nothing typed yet. */
export const EMPTY_CAMP_BANK_DETAILS: CampBankDetails = {
  southAfrica: {
    bank: null,
    accountName: null,
    accountNumber: null,
    branchCode: null,
  },
  abroad: { swift: null, accountNumber: null, bankAddress: null, note: null },
};

/** The bank details, saved: a compare-and-set on the version Finance saw. */
export const SaveCampBankDetailsInput = z.object({
  details: CampBankDetails,
  expectedVersion: z.number().int().min(0),
});
export type SaveCampBankDetailsInput = z.infer<typeof SaveCampBankDetailsInput>;

/**
 * What the bank shows on a day. Below zero is an overdraft. A compare-and-set
 * on the latest balance Finance saw (null: none yet); every balance is kept.
 */
export const CampBalanceInput = z.object({
  amountCents: z
    .number({ error: "Type an amount in rands." })
    .int({ error: "Type an amount in rands, like 1250 or 1250,50." })
    .min(-1_000_000_000, { error: "That amount is too large." })
    .max(1_000_000_000, { error: "That amount is too large." }),
  asOf: DuesDay,
  expectedLatestId: z.string().trim().min(1).max(64).nullable(),
});
export type CampBalanceInput = z.infer<typeof CampBalanceInput>;

/** How often a bill falls due. */
export const CAMP_BILL_REPEATS = ["once", "monthly"] as const;
export const CampBillRepeat = z.enum(CAMP_BILL_REPEATS, {
  error: "Pick one time or monthly.",
});
export type CampBillRepeat = z.infer<typeof CampBillRepeat>;

/**
 * A bill the camp must pay: what, to whom, how much, when (a monthly bill's
 * first month, and how many months), and whether it is only planned so far.
 */
export const CampBillInput = z
  .object({
    name: z
      .string({ error: "Say what the bill is for." })
      .trim()
      .min(1, { error: "Say what the bill is for." })
      .max(BILL_NAME_MAX, {
        error: `Keep it under ${BILL_NAME_MAX} characters.`,
      }),
    payee: optionalText(BILL_NAME_MAX),
    amountCents: z
      .number({ error: "Type an amount in rands." })
      .int({ error: "Type an amount in rands, like 1250 or 1250,50." })
      .positive({ error: "The amount must be more than R0." })
      .max(1_000_000_000, { error: "That amount is too large." }),
    dueOn: DuesDay,
    repeat: CampBillRepeat,
    /** How many times it is paid: 1 for a one-time bill. */
    times: z
      .number({ error: "Type how many months." })
      .int({ error: "Type a whole number of months." })
      .min(1, { error: "A bill is paid at least once." })
      .max(MAX_BILL_MONTHS, {
        error: `A monthly bill runs for at most ${MAX_BILL_MONTHS} months.`,
      }),
    planned: z.boolean(),
  })
  .superRefine((value, ctx) => {
    if (value.repeat === "once" && value.times !== 1) {
      ctx.addIssue({
        code: "custom",
        path: ["times"],
        message: "A one-time bill is paid once.",
      });
    }
  });
export type CampBillInput = z.infer<typeof CampBillInput>;

/** Mark a bill's next payment paid: a compare-and-set on the payments seen. */
export const MarkCampBillPaidInput = z.object({
  billId: z.string().trim().min(1).max(64),
  expectedPaidCount: z.number().int().min(0),
  paidOn: DuesDay,
});
export type MarkCampBillPaidInput = z.infer<typeof MarkCampBillPaidInput>;
