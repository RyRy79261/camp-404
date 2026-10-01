import { PAYMENTS_BUDGETS_PATH, PAYMENTS_CLAIMS_PATH } from "./claims-copy";

// The dues screens' paths and shared sentences (#240). A plain module, not a
// "use server" file, so pages, actions and components can all import it.

/** The member's own dues. */
export const MY_DUES_PATH = "/dues";
/** The Finance tools: the ledger first. */
export const PAYMENTS_PATH = "/captains/payments";
export const PAYMENTS_OWING_PATH = "/captains/payments/members";
export const PAYMENTS_IMPORT_PATH = "/captains/payments/import";
export const PAYMENTS_SETTLE_UP_PATH = "/captains/payments/settle-up";
export const PAYMENTS_SETTINGS_PATH = "/captains/payments/settings";

/** One member's account in the Finance tools. */
export function memberDuesPath(userId: string): string {
  return `${PAYMENTS_OWING_PATH}/${encodeURIComponent(userId)}`;
}

/** Where a payment's proof file is read (never the blob's own address). */
export function paymentProofPath(paymentId: string): string {
  return `/api/payment-proof/${encodeURIComponent(paymentId)}`;
}

/** Said to anyone who is not a captain or a Finance lead. */
export const MONEY_REFUSAL = "Payments are for captains and Finance leads.";

/**
 * The lock a member sees on the Finance tools. What they almost always want
 * is their own dues, so the lock says where those are and links there.
 */
export const MONEY_LOCK_MESSAGE =
  "Only captains and the Finance team see the camp's payments. Your own dues are in My dues.";

/** The tabs across the top of the Finance tools, in order. */
export const PAYMENTS_TABS = [
  { href: PAYMENTS_PATH, label: "Payments" },
  { href: PAYMENTS_OWING_PATH, label: "Who owes what" },
  { href: PAYMENTS_CLAIMS_PATH, label: "Claims" },
  { href: PAYMENTS_BUDGETS_PATH, label: "Budgets" },
  { href: PAYMENTS_IMPORT_PATH, label: "Bank statement" },
  { href: PAYMENTS_SETTLE_UP_PATH, label: "Settle-up" },
  { href: PAYMENTS_SETTINGS_PATH, label: "Fees and dates" },
] as const;

/** The proof files the upload takes, and the most it takes. */
export const PROOF_TYPES: Readonly<Record<string, string>> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};
export const PROOF_MAX_BYTES = 4 * 1024 * 1024;
