// Budgets and claims (#242): paths and shared sentences. A plain module, not
// a "use server" file, so pages, actions and components can all import it.

/** A member's own claims, and the form to make one. */
export const MY_CLAIMS_PATH = "/claims";
/** Claims waiting for a team's yes: a lead of that team, or a captain. */
export const CLAIM_APPROVALS_PATH = "/captains/claims";
/** The Finance tools' Budgets and Claims tabs. */
export const PAYMENTS_BUDGETS_PATH = "/captains/payments/budgets";
export const PAYMENTS_CLAIMS_PATH = "/captains/payments/claims";

/** Where a claim's receipt is read (never the blob's own address). */
export function claimReceiptPath(fileId: string): string {
  return `/api/claim-receipt/${encodeURIComponent(fileId)}`;
}

/** Said to a member who is not a team lead or a captain. */
export const APPROVALS_REFUSAL =
  "Claims are approved by the lead of the claim's team, or a captain.";

/** Under the bank details, where a member types them. */
export const BANK_DETAILS_AUDIENCE =
  "Only you and the Finance team (captains and Finance leads) can see this.";

/** What "spent" means, wherever a budget is shown. */
export const SPENT_MEANS =
  "Spent counts the claims the team said yes to, paid or not yet.";
