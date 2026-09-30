import { Team, ViewerRank, type ClaimStatus } from "@camp404/types";
import { sumMinor } from "./money";

// Team budgets and claims (#242). Pure: no DB, no session, no next/*.
//
// The owner's rulings (2026-09-30):
//  - ONE budget amount per team per year. Captains and Finance leads set it
//    (canManageMoney in ./dues). Every member reads each team's totals:
//    budget, spent, left.
//  - A claim's detail (what it was for, the receipts, the bank details) is
//    for the Finance team (captains and Finance leads) and the member who
//    claimed. Finance leads read receipts and bank details, audited.
//  - A lead OF THAT TEAM, or a captain, says yes to a claim, at any amount:
//    there is no limit that needs a second approval. Then the Finance team
//    marks it paid.
//
// It fails closed: a rank this module does not know, or a team key that is
// not a team, answers false, a captain's included. The writes re-read the
// actor's rank and led teams inside their own transactions and pass those
// here; they never take a team list from the caller.

/**
 * Whether someone may say yes or no to a claim made for `teamKey`: a captain,
 * or a lead of that team this year. `ledTeams` are the team keys they lead.
 * A claim under no team (an old one) is a captain's.
 */
export function canApproveClaim(
  rank: string,
  ledTeams: readonly string[],
  teamKey: string | null,
): boolean {
  if (!ViewerRank.safeParse(rank).success) return false;
  if (rank === "captain") return teamKey === null || isTeam(teamKey);
  if (teamKey === null || !isTeam(teamKey)) return false;
  if (rank === "team_lead") return ledTeams.includes(teamKey);
  return false;
}

function isTeam(key: string): boolean {
  return Team.safeParse(key).success;
}

/**
 * The statuses that count as spent against a team's budget: the team said
 * yes, so the camp owes the money, paid or not. A claim still waiting for the
 * team is counted apart, as waiting; a refused one counts nowhere.
 */
export const SPENT_STATUSES: ReadonlySet<ClaimStatus> = new Set([
  "approved",
  "paid",
  "reconciled",
]);

/** A team's money for the year, as every member reads it. */
export interface BudgetTotals {
  /** The budget, or null when the Finance team has not set one. */
  budgetCents: number | null;
  /** Claims the team said yes to, paid or not. */
  spentCents: number;
  /** Claims still waiting for the team's yes. */
  waitingCents: number;
  waitingCount: number;
  /** Budget less spent (below zero when over), or null with no budget. */
  leftCents: number | null;
  over: boolean;
}

/** Add up one team's claims against its budget. */
export function budgetTotals(
  budgetCents: number | null,
  claims: readonly { status: ClaimStatus; amountCents: number }[],
): BudgetTotals {
  const spentCents = sumMinor(
    claims
      .filter((c) => SPENT_STATUSES.has(c.status))
      .map((c) => c.amountCents),
  );
  const waiting = claims.filter((c) => c.status === "submitted");
  const waitingCents = sumMinor(waiting.map((c) => c.amountCents));
  const leftCents = budgetCents === null ? null : budgetCents - spentCents;
  return {
    budgetCents,
    spentCents,
    waitingCents,
    waitingCount: waiting.length,
    leftCents,
    over: leftCents !== null && leftCents < 0,
  };
}

/** The share of the budget spent, 0 to 100, for a bar. Null with no budget. */
export function budgetSpentPercent(totals: BudgetTotals): number | null {
  if (totals.budgetCents === null) return null;
  if (totals.budgetCents === 0) return totals.spentCents > 0 ? 100 : 0;
  return Math.min(
    100,
    Math.round((totals.spentCents / totals.budgetCents) * 100),
  );
}

/** Where a claim is, in the words a member reads. */
export const CLAIM_STATUS_LABELS: Readonly<Record<ClaimStatus, string>> = {
  submitted: "Waiting for the team",
  approved: "Approved, not paid yet",
  paid: "Paid",
  reconciled: "Paid",
  rejected: "Not approved",
};

/** The only moves a claim can make. Rejected and reconciled are final. */
export const CLAIM_MOVES: Readonly<
  Record<ClaimStatus, readonly ClaimStatus[]>
> = {
  submitted: ["approved", "rejected"],
  approved: ["paid", "rejected"],
  paid: ["reconciled"],
  reconciled: [],
  rejected: [],
};
