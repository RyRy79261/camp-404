import {
  CLAIM_MAX_FILES,
  Team,
  ViewerRank,
  type ClaimStatus,
} from "@camp404/types";
import type { Actor } from "./actor";
import { MONEY_KEEPER } from "./dues";
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

/** Which teams' claims someone sees: every claim, or those of these teams. */
export type ClaimScope = "all" | readonly Team[];

/**
 * Whose claims the "Claims to approve" page lists: a captain every team's, a
 * lead the teams they lead this year, anyone else none. A Finance lead is a
 * lead here like any other: the Finance page is where they read every claim.
 */
export function claimApprovalScope(actor: Actor): ClaimScope {
  if (actor.rank === "captain") return "all";
  if (actor.rank === "team_lead") return actor.ledTeams;
  return [];
}

/**
 * Whose claims the connector's review list returns: a captain or a Finance
 * lead every claim (what the website's Finance page shows them), a lead the
 * teams they lead this year, anyone else none.
 */
export function claimReviewScope(actor: Actor): ClaimScope {
  if (MONEY_KEEPER.allows(actor)) return "all";
  return claimApprovalScope(actor);
}

/**
 * The statuses that count as spent against a team's budget: the team said
 * yes, so the camp owes the money, paid or not. A claim still waiting for the
 * team is counted apart, as waiting; a refused one counts nowhere.
 */
export const SPENT_STATUSES: ReadonlySet<ClaimStatus> = new Set([
  "approved",
  "paid",
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
  rejected: "Not approved",
};

/** The only moves a claim can make. Paid and rejected are final. */
export const CLAIM_MOVES: Readonly<
  Record<ClaimStatus, readonly ClaimStatus[]>
> = {
  submitted: ["approved", "rejected"],
  approved: ["paid", "rejected"],
  paid: [],
  rejected: [],
};

// --- The rules both claim stores apply ----------------------------------------
//
// @camp404/db/reimbursements and team-budgets, and the E2E test store
// (apps/web/lib/test-store-claims.ts), call these, so the order of the checks
// and the sentences are written once. Locks and audit rows stay in the
// database modules.

export const CLAIM_NEEDS_A_RECEIPT =
  "Add at least one receipt: a photo or a PDF.";
export const CLAIM_TOO_MANY_FILES = `Add at most ${CLAIM_MAX_FILES} files to one claim.`;
export const CLAIM_BAD_AMOUNT = "The amount must be more than R0.";
export const CLAIM_CHANGED =
  "Someone else changed this claim first. Reload the page.";
export const BUDGET_BAD_AMOUNT = "A budget must be R0 or more.";

/**
 * What is wrong with a claim to lodge before anything is read, in order: no
 * receipt, too many files, an amount that is not whole cents above R0. Null
 * when it may go on.
 */
export function claimInputProblem(input: {
  files: readonly unknown[];
  amountCents: number;
}): string | null {
  if (input.files.length === 0) return CLAIM_NEEDS_A_RECEIPT;
  if (input.files.length > CLAIM_MAX_FILES) return CLAIM_TOO_MANY_FILES;
  if (!Number.isSafeInteger(input.amountCents) || input.amountCents <= 0) {
    return CLAIM_BAD_AMOUNT;
  }
  return null;
}

/** Whether a claim at `status` may move `from` → `to`: the compare-and-set. */
export function claimMayMove(
  status: ClaimStatus,
  from: ClaimStatus,
  to: ClaimStatus,
): boolean {
  return status === from && CLAIM_MOVES[from].includes(to);
}

/**
 * What a move stamps on the claim: the team's decision (who, when, and the
 * note on a no), the payment (who and when), or the Finance team's no after
 * all (its reason).
 */
export function claimMoveStamp(input: {
  from: ClaimStatus;
  to: ClaimStatus;
  actorId: string;
  note?: string | null;
  now: Date;
}):
  | { approverId: string; approvedAt: Date; decisionNote: string | null }
  | { paidById: string; paidAt: Date }
  | { decisionNote: string | null } {
  if (input.from === "submitted") {
    return {
      approverId: input.actorId,
      approvedAt: input.now,
      decisionNote: input.note ?? null,
    };
  }
  if (input.to === "paid")
    return { paidById: input.actorId, paidAt: input.now };
  return { decisionNote: input.note ?? null };
}

/** A team budget to set: whole cents, R0 or more, or null for none. */
export function budgetAmountProblem(amountCents: number | null): string | null {
  if (amountCents === null) return null;
  return Number.isSafeInteger(amountCents) && amountCents >= 0
    ? null
    : BUDGET_BAD_AMOUNT;
}
