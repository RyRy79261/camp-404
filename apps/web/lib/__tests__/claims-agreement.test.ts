// @vitest-environment node
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  BUDGET_BAD_AMOUNT,
  CLAIM_BAD_AMOUNT,
  CLAIM_CHANGED,
  CLAIM_NEEDS_A_RECEIPT,
  CLAIM_TOO_MANY_FILES,
} from "@camp404/core";
import {
  CLAIM_NEEDS_A_REASON,
  CLAIM_NO_SUCH_MEMBER,
  CLAIM_NOT_FINANCE,
  CLAIM_NOT_FOUND,
  NOT_THE_CLAIMS_TEAM,
  OWN_CLAIM_DECISION,
  OWN_CLAIM_PAYMENT,
} from "@camp404/db/reimbursements";
import { BUDGET_CHANGED, BUDGET_NOT_FINANCE } from "@camp404/db/team-budgets";
import { CLAIM_ACCOUNT_TYPES, CLAIM_MAX_FILES, Team } from "@camp404/types";
import { useTestDb } from "../../../../packages/db/src/__tests__/_harness";
import { bothWays, YEAR, type People } from "./_agreement";

// Budgets and claims (#242), through lib/claims.ts, on the database and on
// the E2E store: the same people, the same calls, the same answers and
// refusal sentences. The checks both sides apply are one set of functions in
// @camp404/core/claims; this holds the rest (who may decide and pay, the
// compare-and-sets, the reads and totals) equal. See _agreement.ts.

const mode = vi.hoisted(() => ({ on: false }));
vi.mock("@/lib/test-mode", () => ({
  isE2ETestMode: () => mode.on,
  usesTestStore: () => mode.on,
  TEST_USER_COOKIE: "camp404_test_user",
}));

import { testStore } from "../test-store";
import {
  decideClaim,
  getClaimFile,
  listBudgetTotals,
  listClaimsForApproval,
  listClaimsForFinance,
  listMyClaims,
  payClaim,
  readClaimAccount,
  setTeamBudget,
  submitClaim,
} from "../claims";

const KITCHEN = Team.enum.kitchen;
const FINANCE = Team.enum.finance;
const NOBODY = "00000000-0000-4000-8000-000000000000";
const RECEIPT = {
  pathname: "claim-receipts/m/1.pdf",
  contentType: "application/pdf",
};

/** A claim for `team` by `submitterId`; its id (or the refusal). */
async function claimFor(
  submitterId: string,
  team: Team,
  amountCents = 12_345,
): Promise<string> {
  const result = await submitClaim({
    submitterId,
    cycle: YEAR,
    team,
    description: `Gas for ${team}`,
    amountCents,
    spentOn: `${YEAR}-02-10`,
    accountType: CLAIM_ACCOUNT_TYPES[0],
    accountDetails: "FNB 123 456",
    files: [RECEIPT],
  });
  if (!result.ok) throw new Error(result.error);
  return result.id;
}

describe("budgets and claims: the database and the test store agree", () => {
  const h = useTestDb();
  beforeAll(() => {
    // The database side encrypts the bank details at the facade.
    process.env.PGCRYPTO_KEY ??= "claims-agreement-suite-key";
  });
  beforeEach(() => {
    mode.on = false;
    testStore.reset();
  });

  it("lodges a claim with its receipts, and refuses one without", async () => {
    const { db, store } = await bothWays(mode, h, async (p) => {
      const base = {
        submitterId: p.member,
        cycle: YEAR,
        team: KITCHEN,
        description: "Gas",
        amountCents: 5_000,
        spentOn: `${YEAR}-02-10`,
        accountType: CLAIM_ACCOUNT_TYPES[0],
        accountDetails: "FNB 123 456",
        files: [RECEIPT],
      };
      const id = await claimFor(p.member, KITCHEN);
      const mine = await listMyClaims(p.member);
      return {
        noReceipt: await submitClaim({ ...base, files: [] }),
        tooMany: await submitClaim({
          ...base,
          files: Array.from({ length: CLAIM_MAX_FILES + 1 }, () => RECEIPT),
        }),
        nothing: await submitClaim({ ...base, amountCents: 0 }),
        halfCent: await submitClaim({ ...base, amountCents: 10.5 }),
        nobody: await submitClaim({ ...base, submitterId: NOBODY }),
        mine,
        others: await listMyClaims(p.other),
        file: await getClaimFile(mine[0]!.files[0]!.id),
        noFile: await getClaimFile(NOBODY),
        account: await readClaimAccount(id),
        noAccount: await readClaimAccount(NOBODY),
        kitchen: await listClaimsForApproval({ cycle: YEAR, teams: [KITCHEN] }),
        finance: await listClaimsForApproval({ cycle: YEAR, teams: [FINANCE] }),
        none: await listClaimsForApproval({ cycle: YEAR, teams: [] }),
        all: await listClaimsForApproval({ cycle: YEAR, teams: "all" }),
        lastYear: await listClaimsForApproval({
          cycle: YEAR - 1,
          teams: "all",
        }),
      };
    });
    expect(db).toMatchObject({
      noReceipt: { ok: false, error: CLAIM_NEEDS_A_RECEIPT },
      tooMany: { ok: false, error: CLAIM_TOO_MANY_FILES },
      nothing: { ok: false, error: CLAIM_BAD_AMOUNT },
      halfCent: { ok: false, error: CLAIM_BAD_AMOUNT },
      nobody: { ok: false, error: CLAIM_NO_SUCH_MEMBER },
      mine: [{ team: KITCHEN, status: "submitted", amountCents: 12_345 }],
      others: [],
      file: { contentType: "application/pdf", submitterId: "@member" },
      noFile: null,
      account: { details: { state: "ok", value: "FNB 123 456" } },
      noAccount: null,
      finance: [],
      none: [],
      lastYear: [],
    });
    expect(store).toEqual(db);
  });

  it("lets a lead of the claim's team or a captain decide it, never their own", async () => {
    const { db, store } = await bothWays(mode, h, async (p) => {
      const kitchenClaim = await claimFor(p.member, KITCHEN);
      const captainsClaim = await claimFor(p.captain, KITCHEN);
      const toReject = await claimFor(p.other, KITCHEN);
      const decide = (
        claimId: string,
        actorId: string,
        decision: "approved" | "rejected" = "approved",
        note: string | null = null,
      ) => decideClaim({ claimId, decision, note, actorId });
      return {
        leadOfAnotherTeam: await decide(kitchenClaim, p.financeLead),
        member: await decide(kitchenClaim, p.other),
        nobody: await decide(kitchenClaim, NOBODY),
        gone: await decide(NOBODY, p.captain),
        goneByNobody: await decide(NOBODY, NOBODY),
        own: await decide(captainsClaim, p.captain),
        lead: await decide(kitchenClaim, p.kitchenLead),
        again: await decide(kitchenClaim, p.captain, "rejected"),
        captain: await decide(captainsClaim, p.kitchenLead),
        rejected: await decide(toReject, p.captain, "rejected", "No receipt"),
        mine: await listMyClaims(p.other),
        waiting: await listClaimsForApproval({ cycle: YEAR, teams: "all" }),
      };
    });
    expect(db).toMatchObject({
      leadOfAnotherTeam: { ok: false, error: NOT_THE_CLAIMS_TEAM },
      member: { ok: false, error: NOT_THE_CLAIMS_TEAM },
      nobody: { ok: false, error: NOT_THE_CLAIMS_TEAM },
      gone: { ok: false, error: CLAIM_NOT_FOUND },
      goneByNobody: { ok: false, error: CLAIM_NOT_FOUND },
      own: { ok: false, error: OWN_CLAIM_DECISION },
      lead: { ok: true },
      again: { ok: false, error: CLAIM_CHANGED },
      captain: { ok: true },
      rejected: { ok: true },
      mine: [{ status: "rejected", decisionNote: "No receipt" }],
      waiting: [],
    });
    expect(store).toEqual(db);
  });

  it("lets the Finance team pay an approved claim, never their own, and counts it against the budget", async () => {
    const { db, store } = await bothWays(mode, h, async (p) => {
      const kitchenClaim = await claimFor(p.member, KITCHEN, 30_000);
      const financeClaim = await claimFor(p.financeLead, FINANCE, 7_000);
      const waiting = await claimFor(p.other, KITCHEN, 4_000);
      await decideClaim({
        claimId: kitchenClaim,
        decision: "approved",
        actorId: p.kitchenLead,
      });
      await decideClaim({
        claimId: financeClaim,
        decision: "approved",
        actorId: p.captain,
      });
      const pay = (
        claimId: string,
        actorId: string,
        decision: "paid" | "rejected" = "paid",
        note: string | null = null,
      ) => payClaim({ claimId, decision, note, actorId });
      const budget = await setTeamBudget({
        team: KITCHEN,
        cycle: YEAR,
        amountCents: 25_000,
        expectedCents: null,
        actorId: p.financeLead,
      });
      return {
        budget,
        byKitchenLead: await pay(kitchenClaim, p.kitchenLead),
        byMember: await pay(kitchenClaim, p.member),
        noReason: await pay(kitchenClaim, p.captain, "rejected", "  "),
        own: await pay(financeClaim, p.financeLead),
        notApproved: await pay(waiting, p.captain),
        gone: await pay(NOBODY, p.captain),
        paid: await pay(kitchenClaim, p.financeLead),
        again: await pay(kitchenClaim, p.captain),
        turnedDown: await pay(
          financeClaim,
          p.captain,
          "rejected",
          "Wrong receipt",
        ),
        forFinance: await listClaimsForFinance(YEAR),
        totals: await listBudgetTotals(YEAR),
        lastYear: await listBudgetTotals(YEAR - 1),
      };
    });
    expect(db).toMatchObject({
      budget: { ok: true },
      byKitchenLead: { ok: false, error: CLAIM_NOT_FINANCE },
      byMember: { ok: false, error: CLAIM_NOT_FINANCE },
      noReason: { ok: false, error: CLAIM_NEEDS_A_REASON },
      own: { ok: false, error: OWN_CLAIM_PAYMENT },
      notApproved: { ok: false, error: CLAIM_CHANGED },
      gone: { ok: false, error: CLAIM_NOT_FOUND },
      paid: { ok: true },
      again: { ok: false, error: CLAIM_CHANGED },
      turnedDown: { ok: true },
      totals: {
        [KITCHEN]: {
          budgetCents: 25_000,
          spentCents: 30_000,
          waitingCents: 4_000,
          waitingCount: 1,
          leftCents: -5_000,
          over: true,
        },
        [FINANCE]: { budgetCents: null, spentCents: 0 },
      },
    });
    expect(store).toEqual(db);
  });

  it("sets a team's budget for the Finance team only, as a compare-and-set", async () => {
    const { db, store } = await bothWays(mode, h, async (p: People) => {
      const set = (
        actorId: string,
        amountCents: number | null,
        expectedCents: number | null,
      ) =>
        setTeamBudget({
          team: KITCHEN,
          cycle: YEAR,
          amountCents,
          expectedCents,
          actorId,
        });
      return {
        negative: await set(p.captain, -1, null),
        halfCent: await set(p.captain, 10.5, null),
        leadOfAnotherTeam: await set(p.kitchenLead, 10_000, null),
        member: await set(p.member, 10_000, null),
        captain: await set(p.captain, 10_000, null),
        stale: await set(p.financeLead, 20_000, null),
        finance: await set(p.financeLead, 20_000, 10_000),
        same: await set(p.financeLead, 20_000, 20_000),
        cleared: await set(p.captain, null, 20_000),
        totals: await listBudgetTotals(YEAR),
      };
    });
    expect(db).toMatchObject({
      negative: { ok: false, error: BUDGET_BAD_AMOUNT },
      halfCent: { ok: false, error: BUDGET_BAD_AMOUNT },
      leadOfAnotherTeam: { ok: false, error: BUDGET_NOT_FINANCE },
      member: { ok: false, error: BUDGET_NOT_FINANCE },
      captain: { ok: true },
      stale: { ok: false, error: BUDGET_CHANGED },
      finance: { ok: true },
      same: { ok: true },
      cleared: { ok: true },
      totals: { [KITCHEN]: { budgetCents: null } },
    });
    expect(store).toEqual(db);
  });
});
