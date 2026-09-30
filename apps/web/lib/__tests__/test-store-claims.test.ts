import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  CLAIM_CHANGED,
  CLAIM_NEEDS_A_REASON,
  CLAIM_NEEDS_A_RECEIPT,
  CLAIM_NOT_FINANCE,
  NOT_THE_CLAIMS_TEAM,
  OWN_CLAIM_DECISION,
  OWN_CLAIM_PAYMENT,
} from "@camp404/db/reimbursements";
import { BUDGET_CHANGED, BUDGET_NOT_FINANCE } from "@camp404/db/team-budgets";
import { testStore } from "../test-store";
import { claimsTestStore as s } from "../test-store-claims";

// The E2E twin of @camp404/db/reimbursements and team-budgets (#242).
// Playwright drives the claim and budget screens through it, so it keeps the
// database modules' rules, case for case with
// packages/db/src/__tests__/claims.test.ts: a lead of the claim's team or a
// captain says yes, the Finance team pays, nobody decides or pays their own
// claim, each move is a compare-and-set, and spent counts what the team said
// yes to. Amounts are made up.

const YEAR = testStore.currentCycleNumber();

function user(name: string, rank: "captain" | "member" = "member") {
  return testStore.createUser({
    authUserId: `auth-${name}`,
    displayName: name,
    inviteCode: "seeded",
    rank,
  });
}

function camp() {
  const captain = user("Cap", "captain");
  const member = user("Mem");
  const kitchenLead = user("Kit");
  testStore.seedTeamMembership({
    userId: kitchenLead.id,
    team: "kitchen",
    isLead: true,
  });
  const powerLead = user("Pow");
  testStore.seedTeamMembership({
    userId: powerLead.id,
    team: "power_and_lighting",
    isLead: true,
  });
  const financeLead = user("Fin");
  testStore.seedTeamMembership({
    userId: financeLead.id,
    team: "finance",
    isLead: true,
  });
  return { captain, member, kitchenLead, powerLead, financeLead };
}

function claim(submitterId: string, amountCents = 450_00) {
  const res = s.submitClaim({
    submitterId,
    cycle: YEAR,
    team: "kitchen",
    description: "Gas",
    amountCents,
    spentOn: "2027-03-02",
    accountType: "sa",
    accountDetails: "FNB 123",
    files: [
      { pathname: "claim-receipts/x/r.pdf", contentType: "application/pdf" },
    ],
  });
  if (!res.ok) throw new Error(res.error);
  return res.id;
}

beforeEach(() => testStore.reset());

describe("claims twin", () => {
  it("refuses a claim with no receipt", () => {
    const { member } = camp();
    const res = s.submitClaim({
      submitterId: member.id,
      cycle: YEAR,
      team: "kitchen",
      description: "Gas",
      amountCents: 100,
      spentOn: "2027-03-02",
      accountType: "sa",
      accountDetails: "FNB",
      files: [],
    });
    expect(res).toEqual({ ok: false, error: CLAIM_NEEDS_A_RECEIPT });
  });

  it("lets only a lead of that team or a captain say yes, never on their own", () => {
    const c = camp();
    const id = claim(c.member.id);
    for (const actor of [c.powerLead, c.financeLead, c.member]) {
      expect(
        s.decideClaim({ claimId: id, decision: "approved", actorId: actor.id }),
      ).toEqual({
        ok: false,
        error: NOT_THE_CLAIMS_TEAM,
      });
    }
    const own = claim(c.kitchenLead.id);
    expect(
      s.decideClaim({
        claimId: own,
        decision: "approved",
        actorId: c.kitchenLead.id,
      }),
    ).toEqual({
      ok: false,
      error: OWN_CLAIM_DECISION,
    });
    expect(
      s.decideClaim({
        claimId: id,
        decision: "approved",
        actorId: c.kitchenLead.id,
      }),
    ).toEqual({
      ok: true,
    });
    expect(
      s.decideClaim({
        claimId: id,
        decision: "rejected",
        actorId: c.captain.id,
      }),
    ).toEqual({
      ok: false,
      error: CLAIM_CHANGED,
    });
  });

  it("lets the Finance team pay an approved claim, not a team lead, not their own", () => {
    const c = camp();
    const id = claim(c.member.id);
    s.decideClaim({
      claimId: id,
      decision: "approved",
      actorId: c.kitchenLead.id,
    });
    expect(
      s.payClaim({ claimId: id, decision: "paid", actorId: c.kitchenLead.id }),
    ).toEqual({
      ok: false,
      error: CLAIM_NOT_FINANCE,
    });
    const finOwn = claim(c.financeLead.id);
    s.decideClaim({
      claimId: finOwn,
      decision: "approved",
      actorId: c.captain.id,
    });
    expect(
      s.payClaim({
        claimId: finOwn,
        decision: "paid",
        actorId: c.financeLead.id,
      }),
    ).toEqual({
      ok: false,
      error: OWN_CLAIM_PAYMENT,
    });
    expect(
      s.payClaim({
        claimId: id,
        decision: "rejected",
        actorId: c.financeLead.id,
      }),
    ).toEqual({ ok: false, error: CLAIM_NEEDS_A_REASON });
    expect(
      s.payClaim({ claimId: id, decision: "paid", actorId: c.financeLead.id }),
    ).toEqual({
      ok: true,
    });
    expect(s.listMyClaims(c.member.id)[0]!.status).toBe("paid");
  });

  it("adds up spent against the budget, and sets it only for Finance, compare-and-set", () => {
    const c = camp();
    expect(
      s.setTeamBudget({
        team: "kitchen",
        cycle: YEAR,
        amountCents: 1000_00,
        expectedCents: null,
        actorId: c.kitchenLead.id,
      }),
    ).toEqual({ ok: false, error: BUDGET_NOT_FINANCE });
    expect(
      s.setTeamBudget({
        team: "kitchen",
        cycle: YEAR,
        amountCents: 1000_00,
        expectedCents: null,
        actorId: c.financeLead.id,
      }),
    ).toEqual({ ok: true });
    expect(
      s.setTeamBudget({
        team: "kitchen",
        cycle: YEAR,
        amountCents: 900_00,
        expectedCents: null,
        actorId: c.captain.id,
      }),
    ).toEqual({ ok: false, error: BUDGET_CHANGED });
    const yes = claim(c.member.id, 300_00);
    s.decideClaim({
      claimId: yes,
      decision: "approved",
      actorId: c.kitchenLead.id,
    });
    claim(c.member.id, 50_00);
    expect(s.listBudgetTotals(YEAR).kitchen).toMatchObject({
      budgetCents: 1000_00,
      spentCents: 300_00,
      waitingCents: 50_00,
      leftCents: 700_00,
    });
  });

  it("shows a lead only their teams' waiting claims, without bank details", () => {
    const c = camp();
    claim(c.member.id);
    const rows = s.listClaimsForApproval({ cycle: YEAR, teams: ["kitchen"] });
    expect(rows).toHaveLength(1);
    expect(Object.keys(rows[0]!)).not.toContain("accountDetails");
    expect(
      s.listClaimsForApproval({ cycle: YEAR, teams: ["power_and_lighting"] }),
    ).toEqual([]);
  });
});
