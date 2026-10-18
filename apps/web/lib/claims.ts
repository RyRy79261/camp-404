import "server-only";

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
import { twin } from "./twin";

// Budgets and claims (#242), from the database or, under E2E, the test
// store's twin. The checks both sides apply (the claim's input, the move and
// what it stamps, the budget amount) are one set of functions in
// @camp404/core/claims; lib/__tests__/claims-agreement.test.ts holds the rest
// equal. Every write re-checks the actor itself inside its own transaction,
// so a caller passes only who is acting, never a rank or a team list.
//
// Bank details are encrypted HERE, at the write boundary, and decrypted here
// for the one audited read; the database module never sees the plaintext.
// The test store never encrypts (the E2E harness runs without the key).

export type { ClaimForApproval, ClaimForFinance, ClaimResult, MyClaim };

/** The database side of the two calls that carry bank details. */
const sealed = {
  async submitClaim(
    input: Omit<claims.SubmitClaimInput, "accountDetailsEncrypted"> & {
      accountDetails: string;
    },
  ): Promise<ClaimResult<{ id: string }>> {
    const { accountDetails, ...rest } = input;
    return claims.submitClaim({
      ...rest,
      accountDetailsEncrypted: encrypt(accountDetails),
    });
  },

  async readClaimAccount(claimId: string): Promise<{
    submitterId: string | null;
    team: Team | null;
    accountType: ClaimAccountType;
    details: DecryptedField;
  } | null> {
    const row = await claims.getClaimAccount(claimId);
    if (!row) return null;
    return {
      submitterId: row.submitterId,
      team: row.team,
      accountType: row.accountType,
      details: decryptField(row.accountDetailsEncrypted),
    };
  },
};

const claim = twin(claims, claimsTestStore, [
  "listMyClaims",
  "listClaimsForApproval",
  "listClaimsForFinance",
  "getClaimFile",
  "decideClaim",
  "payClaim",
]);
const budget = twin(budgets, claimsTestStore, [
  "listBudgetTotals",
  "setTeamBudget",
]);
const bank = twin(sealed, claimsTestStore, ["submitClaim", "readClaimAccount"]);

// --- Reads --------------------------------------------------------------------

export const listMyClaims = claim.listMyClaims;
export const listClaimsForApproval = claim.listClaimsForApproval;
export const listClaimsForFinance = claim.listClaimsForFinance;
export const listBudgetTotals = budget.listBudgetTotals;
export const getClaimFile = claim.getClaimFile;

/**
 * A claim's bank details, decrypted, and whose claim it is. The caller
 * decides who may read them and records the read.
 */
export const readClaimAccount = bank.readClaimAccount;

// --- Writes -------------------------------------------------------------------

export const submitClaim = bank.submitClaim;
export const decideClaim = claim.decideClaim;
export const payClaim = claim.payClaim;
export const setTeamBudget = budget.setTeamBudget;
