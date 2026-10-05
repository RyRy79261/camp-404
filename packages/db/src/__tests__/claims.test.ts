import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { FINANCE_TEAM } from "@camp404/core";
import { useTestDb } from "./_harness";
import { makeMembership, makeUser } from "./_factories";
import { sanitiseAccount } from "../account";
import { setFoundingYear } from "../cycle-rollover";
import {
  CLAIM_CHANGED,
  CLAIM_NEEDS_A_REASON,
  CLAIM_NEEDS_A_RECEIPT,
  CLAIM_NO_SUCH_MEMBER,
  CLAIM_NOT_FINANCE,
  CLAIM_TOO_MANY_FILES,
  decideClaim,
  getClaimFile,
  listClaimsForApproval,
  listClaimsForFinance,
  listMyClaims,
  NOT_THE_CLAIMS_TEAM,
  OWN_CLAIM_DECISION,
  OWN_CLAIM_PAYMENT,
  payClaim,
  submitClaim,
  type SubmitClaimInput,
} from "../reimbursements";
import {
  BUDGET_CHANGED,
  BUDGET_NOT_FINANCE,
  listBudgetTotals,
  setTeamBudget,
} from "../team-budgets";
import * as schema from "../schema";

// Claims and budgets (#242) on real Postgres. A lead of the claim's team, or
// a captain, says yes; the Finance team (captains and Finance leads) pays;
// every move re-reads the actor inside its transaction, is a compare-and-set,
// and writes its audit row. The camp has no year set, so the year is the
// sentinel (1), as currentCycleNumber() reads it. Amounts are made up.

type DB = ReturnType<ReturnType<typeof useTestDb>["db"]>;
const YEAR = 1;

const PDF = {
  pathname: "claim-receipts/x/receipt.pdf",
  contentType: "application/pdf",
};

function claimFor(
  submitterId: string,
  overrides: Partial<SubmitClaimInput> = {},
): SubmitClaimInput {
  return {
    submitterId,
    cycle: YEAR,
    team: "kitchen",
    description: "Gas bottle refill",
    amountCents: 450_00,
    spentOn: "2027-03-02",
    accountType: "sa",
    accountDetailsEncrypted: "ciphertext",
    files: [PDF],
    ...overrides,
  };
}

async function people(db: DB) {
  const member = await makeUser(db, { displayName: "Mem Ber" });
  const kitchenLead = await makeUser(db, { displayName: "Kit Lead" });
  await makeMembership(db, {
    userId: kitchenLead.id,
    team: "kitchen",
    isLead: true,
  });
  const powerLead = await makeUser(db, { displayName: "Pow Lead" });
  await makeMembership(db, {
    userId: powerLead.id,
    team: "power_and_lighting",
    isLead: true,
  });
  const financeLead = await makeUser(db, { displayName: "Fin Lead" });
  await makeMembership(db, {
    userId: financeLead.id,
    team: FINANCE_TEAM,
    isLead: true,
  });
  const captain = await makeUser(db, {
    displayName: "Cap Tain",
    rank: "captain",
  });
  return { member, kitchenLead, powerLead, financeLead, captain };
}

async function submitted(input: SubmitClaimInput): Promise<string> {
  const result = await submitClaim(input);
  if (!result.ok) throw new Error(result.error);
  return result.id;
}

async function auditRows(db: DB, action: string) {
  return db
    .select()
    .from(schema.auditLog)
    .where(eq(schema.auditLog.action, action));
}

describe("submitClaim", () => {
  const h = useTestDb();

  it("stores the claim in cents with its receipts, waiting for the team", async () => {
    const db = h.db();
    const { member } = await people(db);
    const id = await submitted(
      claimFor(member.id, {
        files: [
          PDF,
          { pathname: "claim-receipts/x/2.jpg", contentType: "image/jpeg" },
        ],
      }),
    );
    const [row] = await db.select().from(schema.reimbursements);
    expect(row).toMatchObject({
      id,
      submitterId: member.id,
      cycle: YEAR,
      team: "kitchen",
      amountCents: 450_00,
      currency: "ZAR",
      spentOn: "2027-03-02",
      status: "submitted",
      accountDetailsEncrypted: "ciphertext",
    });
    expect(await db.select().from(schema.reimbursementFiles)).toHaveLength(2);

    const mine = await listMyClaims(member.id);
    expect(mine).toHaveLength(1);
    expect(mine[0]!.files.map((f) => f.contentType)).toEqual([
      "application/pdf",
      "image/jpeg",
    ]);
    const file = await getClaimFile(mine[0]!.files[0]!.id);
    expect(file).toMatchObject({
      claimId: id,
      submitterId: member.id,
      team: "kitchen",
    });
  });

  it("refuses a claim with no receipt, too many, a bad amount or an erased member, and writes nothing", async () => {
    const db = h.db();
    const { member } = await people(db);
    expect(await submitClaim(claimFor(member.id, { files: [] }))).toEqual({
      ok: false,
      error: CLAIM_NEEDS_A_RECEIPT,
    });
    expect(
      await submitClaim(claimFor(member.id, { files: Array(6).fill(PDF) })),
    ).toEqual({ ok: false, error: CLAIM_TOO_MANY_FILES });
    expect(
      (await submitClaim(claimFor(member.id, { amountCents: 0 }))).ok,
    ).toBe(false);
    expect(
      (await submitClaim(claimFor(member.id, { amountCents: 1.5 }))).ok,
    ).toBe(false);
    const erased = await makeUser(db, { sanitised: true });
    expect(await submitClaim(claimFor(erased.id))).toEqual({
      ok: false,
      error: CLAIM_NO_SUCH_MEMBER,
    });
    expect(await db.select().from(schema.reimbursements)).toEqual([]);
    expect(await db.select().from(schema.reimbursementFiles)).toEqual([]);
  });

  it("lists only the member's own claims", async () => {
    const db = h.db();
    const { member, kitchenLead } = await people(db);
    await submitted(claimFor(member.id));
    await submitted(claimFor(kitchenLead.id));
    expect((await listMyClaims(member.id)).length).toBe(1);
  });
});

describe("the team's yes", () => {
  const h = useTestDb();

  it("shows a lead only the claims of teams they lead, waiting, this year", async () => {
    const db = h.db();
    const { member, kitchenLead } = await people(db);
    const kitchen = await submitted(claimFor(member.id));
    await submitted(claimFor(member.id, { team: "structures" }));
    await submitted(claimFor(member.id, { cycle: 2020 }));

    const forKitchen = await listClaimsForApproval({
      cycle: YEAR,
      teams: ["kitchen"],
    });
    expect(forKitchen.map((c) => c.id)).toEqual([kitchen]);
    expect(forKitchen[0]).toMatchObject({
      submitterName: "Mem Ber",
      amountCents: 450_00,
    });
    // Never the bank details or the receipts.
    expect(Object.keys(forKitchen[0]!)).not.toContain(
      "accountDetailsEncrypted",
    );
    expect(Object.keys(forKitchen[0]!)).not.toContain("files");
    expect(await listClaimsForApproval({ cycle: YEAR, teams: [] })).toEqual([]);
    expect(
      await listClaimsForApproval({ cycle: YEAR, teams: "all" }),
    ).toHaveLength(2);
    void kitchenLead;
  });

  it("lets a lead of that team say yes once, and audits it", async () => {
    const db = h.db();
    const { member, kitchenLead, captain } = await people(db);
    const id = await submitted(claimFor(member.id));

    expect(
      await decideClaim({
        claimId: id,
        decision: "approved",
        actorId: kitchenLead.id,
      }),
    ).toEqual({ ok: true });
    // A captain who read it as waiting loses the race, in a sentence.
    expect(
      await decideClaim({
        claimId: id,
        decision: "rejected",
        actorId: captain.id,
      }),
    ).toEqual({ ok: false, error: CLAIM_CHANGED });

    const [row] = await db.select().from(schema.reimbursements);
    expect(row).toMatchObject({
      status: "approved",
      approverId: kitchenLead.id,
    });
    const audit = await auditRows(db, "reimbursement.status_changed");
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      actorId: kitchenLead.id,
      target: member.id,
    });
    expect(audit[0]!.metadata).toMatchObject({
      reimbursementId: id,
      from: "submitted",
      to: "approved",
      team: "kitchen",
      amountCents: 450_00,
    });
  });

  it("refuses a lead of another team, a Finance lead and a member, and writes nothing", async () => {
    const db = h.db();
    const { member, powerLead, financeLead } = await people(db);
    const other = await makeUser(db);
    const id = await submitted(claimFor(member.id));
    for (const actor of [powerLead, financeLead, other]) {
      expect(
        await decideClaim({
          claimId: id,
          decision: "approved",
          actorId: actor.id,
        }),
      ).toEqual({ ok: false, error: NOT_THE_CLAIMS_TEAM });
    }
    const [row] = await db.select().from(schema.reimbursements);
    expect(row!.status).toBe("submitted");
    expect(await auditRows(db, "reimbursement.status_changed")).toEqual([]);
  });

  it("reads the lead flag inside the write: a lead stood down is refused", async () => {
    const db = h.db();
    const { member, kitchenLead } = await people(db);
    const id = await submitted(claimFor(member.id));
    await db
      .update(schema.teamMemberships)
      .set({ isLead: false })
      .where(eq(schema.teamMemberships.userId, kitchenLead.id));
    expect(
      await decideClaim({
        claimId: id,
        decision: "approved",
        actorId: kitchenLead.id,
      }),
    ).toEqual({ ok: false, error: NOT_THE_CLAIMS_TEAM });
  });

  it("refuses the claimant's own claim, even for a captain", async () => {
    const db = h.db();
    const { captain, kitchenLead } = await people(db);
    const own = await submitted(claimFor(kitchenLead.id));
    expect(
      await decideClaim({
        claimId: own,
        decision: "approved",
        actorId: kitchenLead.id,
      }),
    ).toEqual({ ok: false, error: OWN_CLAIM_DECISION });
    const captains = await submitted(claimFor(captain.id));
    expect(
      await decideClaim({
        claimId: captains,
        decision: "approved",
        actorId: captain.id,
      }),
    ).toEqual({ ok: false, error: OWN_CLAIM_DECISION });
  });

  it("keeps the note on a no, for the member to read", async () => {
    const db = h.db();
    const { member, captain } = await people(db);
    const id = await submitted(claimFor(member.id));
    expect(
      await decideClaim({
        claimId: id,
        decision: "rejected",
        note: "Bought for your own tent",
        actorId: captain.id,
      }),
    ).toEqual({ ok: true });
    const [mine] = await listMyClaims(member.id);
    expect(mine).toMatchObject({
      status: "rejected",
      decisionNote: "Bought for your own tent",
    });
  });
});

describe("the Finance team pays", () => {
  const h = useTestDb();

  async function approved(db: DB) {
    const p = await people(db);
    const id = await submitted(claimFor(p.member.id));
    expect(
      await decideClaim({
        claimId: id,
        decision: "approved",
        actorId: p.kitchenLead.id,
      }),
    ).toEqual({ ok: true });
    return { ...p, id };
  }

  it("lets a Finance lead mark an approved claim paid, and audits it", async () => {
    const db = h.db();
    const { id, financeLead } = await approved(db);
    expect(
      await payClaim({
        claimId: id,
        decision: "paid",
        actorId: financeLead.id,
      }),
    ).toEqual({
      ok: true,
    });
    const [row] = await db.select().from(schema.reimbursements);
    expect(row).toMatchObject({ status: "paid", paidById: financeLead.id });
    expect(row!.paidAt).toBeInstanceOf(Date);
    const audit = await auditRows(db, "reimbursement.status_changed");
    expect(audit.map((a) => (a.metadata as { to: string }).to)).toEqual([
      "approved",
      "paid",
    ]);
    // Paid twice: the second loses.
    expect(
      await payClaim({
        claimId: id,
        decision: "paid",
        actorId: financeLead.id,
      }),
    ).toEqual({
      ok: false,
      error: CLAIM_CHANGED,
    });
  });

  it("ends at paid: no one can move a paid claim on, or turn it down", async () => {
    const db = h.db();
    const { id, financeLead, captain, kitchenLead } = await approved(db);
    await payClaim({ claimId: id, decision: "paid", actorId: financeLead.id });
    expect(
      await payClaim({
        claimId: id,
        decision: "rejected",
        note: "Changed my mind",
        actorId: captain.id,
      }),
    ).toEqual({ ok: false, error: CLAIM_CHANGED });
    expect(
      await decideClaim({
        claimId: id,
        decision: "rejected",
        actorId: kitchenLead.id,
      }),
    ).toEqual({ ok: false, error: CLAIM_CHANGED });
    const [row] = await db.select().from(schema.reimbursements);
    expect(row).toMatchObject({ status: "paid", paidById: financeLead.id });
  });

  it("refuses a lead of the claim's own team and one of another team", async () => {
    const db = h.db();
    const { id, kitchenLead, powerLead } = await approved(db);
    for (const actor of [kitchenLead, powerLead]) {
      expect(
        await payClaim({ claimId: id, decision: "paid", actorId: actor.id }),
      ).toEqual({
        ok: false,
        error: CLAIM_NOT_FINANCE,
      });
    }
    expect((await db.select().from(schema.reimbursements))[0]!.status).toBe(
      "approved",
    );
  });

  it("never pays a claim the team has not said yes to", async () => {
    const db = h.db();
    const { member, financeLead } = await people(db);
    const id = await submitted(claimFor(member.id));
    expect(
      await payClaim({
        claimId: id,
        decision: "paid",
        actorId: financeLead.id,
      }),
    ).toEqual({
      ok: false,
      error: CLAIM_CHANGED,
    });
  });

  it("refuses a Finance lead paying their own claim", async () => {
    const db = h.db();
    const { financeLead, captain } = await people(db);
    const id = await submitted(claimFor(financeLead.id));
    await decideClaim({
      claimId: id,
      decision: "approved",
      actorId: captain.id,
    });
    expect(
      await payClaim({
        claimId: id,
        decision: "paid",
        actorId: financeLead.id,
      }),
    ).toEqual({
      ok: false,
      error: OWN_CLAIM_PAYMENT,
    });
  });

  it("lets Finance turn an approved claim down with a note, and it stops counting as spent", async () => {
    const db = h.db();
    const { id, captain, member } = await approved(db);
    expect((await listBudgetTotals(YEAR)).kitchen.spentCents).toBe(450_00);
    // The team already said yes, so a no without a reason is refused.
    for (const note of [null, "  "]) {
      expect(
        await payClaim({
          claimId: id,
          decision: "rejected",
          note,
          actorId: captain.id,
        }),
      ).toEqual({ ok: false, error: CLAIM_NEEDS_A_REASON });
    }
    expect((await listMyClaims(member.id))[0]!.status).toBe("approved");
    expect(
      await payClaim({
        claimId: id,
        decision: "rejected",
        note: "The receipt is for another camp",
        actorId: captain.id,
      }),
    ).toEqual({ ok: true });
    const [mine] = await listMyClaims(member.id);
    expect(mine).toMatchObject({
      status: "rejected",
      decisionNote: "The receipt is for another camp",
    });
    expect((await listBudgetTotals(YEAR)).kitchen.spentCents).toBe(0);
  });

  it("lists the year's claims for Finance with receipts and who said yes", async () => {
    const db = h.db();
    const { id } = await approved(db);
    const [row] = await listClaimsForFinance(YEAR);
    expect(row).toMatchObject({
      id,
      status: "approved",
      approverName: "Kit Lead",
      submitterName: "Mem Ber",
    });
    expect(row!.files).toHaveLength(1);
    expect(await listClaimsForFinance(2020)).toEqual([]);
  });
});

describe("team budgets", () => {
  const h = useTestDb();

  it("adds up spent (what the team said yes to) and waiting against the budget", async () => {
    const db = h.db();
    const { member, kitchenLead, financeLead } = await people(db);
    expect(
      await setTeamBudget({
        team: "kitchen",
        cycle: YEAR,
        amountCents: 1000_00,
        expectedCents: null,
        actorId: financeLead.id,
      }),
    ).toEqual({ ok: true });
    const yes = await submitted(claimFor(member.id, { amountCents: 300_00 }));
    await decideClaim({
      claimId: yes,
      decision: "approved",
      actorId: kitchenLead.id,
    });
    await submitted(claimFor(member.id, { amountCents: 50_00 }));
    await submitted(claimFor(member.id, { amountCents: 999_00, cycle: 2020 }));

    const totals = await listBudgetTotals(YEAR);
    expect(totals.kitchen).toEqual({
      budgetCents: 1000_00,
      spentCents: 300_00,
      waitingCents: 50_00,
      waitingCount: 1,
      leftCents: 700_00,
      over: false,
    });
    expect(totals.structures.budgetCents).toBeNull();
    expect(totals.structures.spentCents).toBe(0);
  });

  it("lets a Finance lead or a captain set it, audited, and refuses a lead of the team itself", async () => {
    const db = h.db();
    const { kitchenLead, financeLead, captain } = await people(db);
    const set = (
      actorId: string,
      amountCents: number | null,
      expectedCents: number | null,
    ) =>
      setTeamBudget({
        team: "kitchen",
        cycle: YEAR,
        amountCents,
        expectedCents,
        actorId,
      });

    expect(await set(kitchenLead.id, 500_00, null)).toEqual({
      ok: false,
      error: BUDGET_NOT_FINANCE,
    });
    expect(await set(financeLead.id, 500_00, null)).toEqual({ ok: true });
    expect(await set(captain.id, 800_00, 500_00)).toEqual({ ok: true });
    // Someone who still saw R500 loses, in a sentence.
    expect(await set(financeLead.id, 900_00, 500_00)).toEqual({
      ok: false,
      error: BUDGET_CHANGED,
    });
    expect(await set(financeLead.id, null, 800_00)).toEqual({ ok: true });
    expect((await listBudgetTotals(YEAR)).kitchen.budgetCents).toBeNull();

    const audit = await auditRows(db, "team_budget.set");
    expect(audit.map((a) => a.metadata)).toEqual([
      { team: "kitchen", cycle: YEAR, amountCents: 500_00, fromCents: null },
      { team: "kitchen", cycle: YEAR, amountCents: 800_00, fromCents: 500_00 },
      { team: "kitchen", cycle: YEAR, amountCents: null, fromCents: 800_00 },
    ]);
  });
});

describe("erasure", () => {
  const h = useTestDb();

  it("keeps the claim for accounting but drops its bank details, the reason given and the receipt rows", async () => {
    const db = h.db();
    const { member, captain } = await people(db);
    const id = await submitted(claimFor(member.id));
    await decideClaim({
      claimId: id,
      decision: "rejected",
      note: "Mem bought this for their own tent",
      actorId: captain.id,
    });
    await sanitiseAccount(member.id);
    const [row] = await db.select().from(schema.reimbursements);
    expect(row).toMatchObject({
      amountCents: 450_00,
      accountDetailsEncrypted: "",
      decisionNote: null,
    });
    expect(await db.select().from(schema.reimbursementFiles)).toEqual([]);
  });
});

describe("the founding year", () => {
  const h = useTestDb();

  it("adopts a claim lodged before the camp had a year", async () => {
    const db = h.db();
    const { member, captain } = await people(db);
    await submitted(claimFor(member.id));
    expect(
      await setFoundingYear({ year: 2027, actorUserId: captain.id }),
    ).toMatchObject({ ok: true });
    const [row] = await db.select().from(schema.reimbursements);
    expect(row!.cycle).toBe(2027);
  });
});
