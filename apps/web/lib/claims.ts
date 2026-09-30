import "server-only";

import type { BudgetTotals } from "@camp404/core";
import { decryptField, encrypt, type DecryptedField } from "@camp404/db/crypto";
import * as claims from "@camp404/db/reimbursements";
import type {
  ClaimForApproval,
  ClaimForFinance,
  ClaimResult,
  MyClaim,
} from "@camp404/db/reimbursements";
import * as budgets from "@camp404/db/team-budgets";
import type { ClaimAccountType, Team } from "@camp404/types";
import { claimsTestStore } from "./test-store-claims";
import { usesTestStore } from "./test-mode";

// Budgets and claims (#242), from the database or, under E2E, the test
// store's twin. The rules live in @camp404/db/reimbursements and
// @camp404/db/team-budgets, and the twin repeats them. Every write re-checks
// the actor itself inside its own transaction, so a caller passes only who is
// acting, never a rank or a team list.
//
// Bank details are encrypted HERE, at the write boundary, and decrypted here
// for the one audited read; the database module never sees the plaintext.
// The test store never encrypts (the E2E harness runs without the key).

export type { ClaimForApproval, ClaimForFinance, ClaimResult, MyClaim };

const store = () => (usesTestStore() ? claimsTestStore : null);

// --- Reads --------------------------------------------------------------------

export async function listMyClaims(userId: string): Promise<MyClaim[]> {
  return store()?.listMyClaims(userId) ?? claims.listMyClaims(userId);
}

export async function listClaimsForApproval(input: {
  cycle: number;
  teams: readonly Team[] | "all";
}): Promise<ClaimForApproval[]> {
  return (
    store()?.listClaimsForApproval(input) ?? claims.listClaimsForApproval(input)
  );
}

export async function listClaimsForFinance(
  cycle: number,
): Promise<ClaimForFinance[]> {
  return (
    store()?.listClaimsForFinance(cycle) ?? claims.listClaimsForFinance(cycle)
  );
}

export async function listBudgetTotals(
  cycle: number,
): Promise<Record<Team, BudgetTotals>> {
  return store()?.listBudgetTotals(cycle) ?? budgets.listBudgetTotals(cycle);
}

export async function getClaimFile(
  fileId: string,
): Promise<Awaited<ReturnType<typeof claims.getClaimFile>>> {
  const s = store();
  return s ? s.getClaimFile(fileId) : claims.getClaimFile(fileId);
}

/**
 * A claim's bank details, decrypted, and whose claim it is. The caller
 * decides who may read them and records the read.
 */
export async function readClaimAccount(claimId: string): Promise<{
  submitterId: string | null;
  team: Team | null;
  accountType: ClaimAccountType;
  details: DecryptedField;
} | null> {
  const s = store();
  if (s) return s.readClaimAccount(claimId);
  const row = await claims.getClaimAccount(claimId);
  if (!row) return null;
  return {
    submitterId: row.submitterId,
    team: row.team,
    accountType: row.accountType,
    details: decryptField(row.accountDetailsEncrypted),
  };
}

// --- Writes -------------------------------------------------------------------

export async function submitClaim(
  input: Omit<claims.SubmitClaimInput, "accountDetailsEncrypted"> & {
    accountDetails: string;
  },
): Promise<ClaimResult<{ id: string }>> {
  const s = store();
  if (s) return s.submitClaim(input);
  const { accountDetails, ...rest } = input;
  return claims.submitClaim({
    ...rest,
    accountDetailsEncrypted: encrypt(accountDetails),
  });
}

export async function decideClaim(
  input: Parameters<typeof claims.decideClaim>[0],
): Promise<ClaimResult> {
  return store()?.decideClaim(input) ?? claims.decideClaim(input);
}

export async function payClaim(
  input: Parameters<typeof claims.payClaim>[0],
): Promise<ClaimResult> {
  return store()?.payClaim(input) ?? claims.payClaim(input);
}

export async function setTeamBudget(
  input: Parameters<typeof budgets.setTeamBudget>[0],
): Promise<ClaimResult> {
  return store()?.setTeamBudget(input) ?? budgets.setTeamBudget(input);
}
