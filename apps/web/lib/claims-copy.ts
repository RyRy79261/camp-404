// Budgets and claims (#242): paths and shared sentences. A plain module, not
// a "use server" file, so pages, actions and components can all import it.

/** A member's own claims, and the form to make one. */
export const MY_CLAIMS_PATH = "/claims";
/** Claims waiting for a team's yes: a lead of that team, or a captain. */
export const CLAIM_APPROVALS_PATH = "/captains/claims";
/** The Finance tools' Budgets and Claims tabs. */
export const PAYMENTS_BUDGETS_PATH = "/captains/payments/budgets";
export const PAYMENTS_CLAIMS_PATH = "/captains/payments/claims";
/** Every team's budget, read-only, for every member. */
export const TEAM_BUDGETS_PATH = "/teams/budgets";

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
export const SPENT_MEANS = "Spent: the claims the team approved, paid or not.";

/** There is no internet at the burn: said where a member claims. */
export const CLAIM_ON_SITE_NOTE =
  "No signal at the burn? Keep the paper receipt and claim when you're home.";

/** Said on the Finance team's Budgets tab to anyone else. */
export const BUDGETS_REFUSAL =
  "Setting budgets is for captains and Finance leads.";

/** The one quiet line under the budgets a viewer can only read. */
export const BUDGET_EDITORS = "Captains and Finance leads set the budgets.";
