import { z } from "zod";

export const ReimbursementStatus = z.enum([
  "submitted",
  "approved",
  "paid",
  "reconciled",
  "rejected",
]);
export type ReimbursementStatus = z.infer<typeof ReimbursementStatus>;

export const ReimbursementCategory = z.enum([
  "kitchen",
  "build",
  "fire",
  "art",
  "vehicle",
  "general",
  "fuel",
]);
export type ReimbursementCategory = z.infer<typeof ReimbursementCategory>;

export const EftDetails = z.object({
  accountHolder: z.string().min(1),
  bankName: z.string().min(1),
  accountNumber: z.string().min(4),
  branchCode: z.string().min(3),
});
export type EftDetails = z.infer<typeof EftDetails>;

export const ReimbursementInput = z.object({
  amountZar: z.number().positive(),
  category: ReimbursementCategory,
  description: z.string().min(1).max(500),
  receiptBlobUrl: z.string().url(),
  voiceMemoBlobUrl: z.string().url().optional(),
  eft: EftDetails,
});
export type ReimbursementInput = z.infer<typeof ReimbursementInput>;
