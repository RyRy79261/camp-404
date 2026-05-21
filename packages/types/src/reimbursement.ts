import { z } from "zod";
import { Team } from "./roles";

export const ReimbursementStatus = z.enum([
  "submitted",
  "approved",
  "paid",
  "reconciled",
  "rejected",
]);
export type ReimbursementStatus = z.infer<typeof ReimbursementStatus>;

export const ReimbursementAccountType = z.enum(["sa", "international"]);
export type ReimbursementAccountType = z.infer<typeof ReimbursementAccountType>;

// Where a member wants to be reimbursed. Encrypted at rest via pgcrypto;
// these are the plaintext shapes the route handler encrypts.
export const SaAccountDetails = z.object({
  type: z.literal("sa"),
  accountHolder: z.string().min(1),
  bankName: z.string().min(1),
  accountNumber: z.string().min(4),
  branchCode: z.string().min(3),
});
export type SaAccountDetails = z.infer<typeof SaAccountDetails>;

export const InternationalAccountDetails = z.object({
  type: z.literal("international"),
  accountHolder: z.string().min(1),
  bankName: z.string().min(1),
  iban: z.string().min(4),
  swiftBic: z.string().min(8).max(11),
  country: z.string().min(2),
});
export type InternationalAccountDetails = z.infer<
  typeof InternationalAccountDetails
>;

export const ReimbursementAccount = z.discriminatedUnion("type", [
  SaAccountDetails,
  InternationalAccountDetails,
]);
export type ReimbursementAccount = z.infer<typeof ReimbursementAccount>;

export const ReimbursementInput = z
  .object({
    amount: z.number().positive(),
    // ISO 4217 code of the currency the member actually paid in.
    currency: z.string().regex(/^[A-Z]{3}$/, "Three-letter ISO currency code"),
    // The team the claim is lodged under. null = "general".
    team: Team.nullable().default(null),
    description: z.string().min(1).max(500),
    receiptBlobUrl: z.string().url().optional(),
    itemPhotoBlobUrl: z.string().url().optional(),
    voiceMemoBlobUrl: z.string().url().optional(),
    account: ReimbursementAccount,
  })
  .refine((d) => d.receiptBlobUrl || d.itemPhotoBlobUrl, {
    message: "Attach a photo of the receipt and/or the item",
    path: ["receiptBlobUrl"],
  });
export type ReimbursementInput = z.infer<typeof ReimbursementInput>;
