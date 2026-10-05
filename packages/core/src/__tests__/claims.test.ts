import { describe, expect, it } from "vitest";
import { CLAIM_STATUSES } from "@camp404/types";
import {
  budgetSpentPercent,
  budgetTotals,
  canApproveClaim,
  CLAIM_MOVES,
  CLAIM_STATUS_LABELS,
} from "../claims";
import { FINANCE_TEAM } from "../dues";

describe("canApproveClaim", () => {
  it("lets a captain decide any team's claim, and one under no team", () => {
    expect(canApproveClaim("captain", [], "kitchen")).toBe(true);
    expect(canApproveClaim("captain", [], null)).toBe(true);
  });

  it("lets a lead decide only the claims of a team they lead", () => {
    expect(canApproveClaim("team_lead", ["kitchen"], "kitchen")).toBe(true);
    expect(canApproveClaim("team_lead", ["kitchen"], "structures")).toBe(false);
    expect(canApproveClaim("team_lead", ["kitchen"], null)).toBe(false);
  });

  it("gives a Finance lead no yes over another team's claim", () => {
    expect(canApproveClaim("team_lead", [FINANCE_TEAM], "kitchen")).toBe(false);
    expect(canApproveClaim("team_lead", [FINANCE_TEAM], FINANCE_TEAM)).toBe(
      true,
    );
  });

  it("refuses a member, even one who names the team", () => {
    expect(canApproveClaim("camp_member", ["kitchen"], "kitchen")).toBe(false);
  });

  it("fails closed on an unknown rank or team", () => {
    expect(canApproveClaim("god", ["kitchen"], "kitchen")).toBe(false);
    expect(canApproveClaim("captain", [], "not-a-team")).toBe(false);
    expect(canApproveClaim("team_lead", ["not-a-team"], "not-a-team")).toBe(
      false,
    );
  });
});

describe("budgetTotals", () => {
  const claims = [
    { status: "submitted" as const, amountCents: 100_00 },
    { status: "approved" as const, amountCents: 200_00 },
    { status: "paid" as const, amountCents: 300_00 },
    { status: "paid" as const, amountCents: 50_00 },
    { status: "rejected" as const, amountCents: 999_00 },
  ];

  it("counts what the team said yes to as spent, and a waiting claim apart", () => {
    expect(budgetTotals(1000_00, claims)).toEqual({
      budgetCents: 1000_00,
      spentCents: 550_00,
      waitingCents: 100_00,
      waitingCount: 1,
      leftCents: 450_00,
      over: false,
    });
  });

  it("says over when spent passes the budget", () => {
    const t = budgetTotals(500_00, claims);
    expect(t.leftCents).toBe(-50_00);
    expect(t.over).toBe(true);
    expect(budgetSpentPercent(t)).toBe(100);
  });

  it("has nothing left and no bar without a budget", () => {
    const t = budgetTotals(null, claims);
    expect(t.leftCents).toBeNull();
    expect(t.over).toBe(false);
    expect(budgetSpentPercent(t)).toBeNull();
  });

  it("draws a bar for a budget of nothing", () => {
    expect(budgetSpentPercent(budgetTotals(0, []))).toBe(0);
    expect(budgetSpentPercent(budgetTotals(0, claims))).toBe(100);
    expect(budgetSpentPercent(budgetTotals(2000_00, claims))).toBe(28);
  });
});

describe("claim words and moves", () => {
  it("has a label and a move list for every status", () => {
    for (const status of CLAIM_STATUSES) {
      expect(CLAIM_STATUS_LABELS[status]).toBeTruthy();
      expect(CLAIM_MOVES[status]).toBeDefined();
    }
  });

  it("ends at paid: no move after it (owner, 2026-10-05)", () => {
    expect(CLAIM_STATUSES).not.toContain("reconciled");
    expect(CLAIM_MOVES.paid).toEqual([]);
    expect(CLAIM_MOVES.approved).toContain("paid");
  });

  it("never moves a claim back to waiting, or out of a final state", () => {
    for (const status of CLAIM_STATUSES) {
      expect(CLAIM_MOVES[status]).not.toContain("submitted");
    }
    expect(CLAIM_MOVES.rejected).toEqual([]);
    expect(CLAIM_MOVES.paid).toEqual([]);
  });
});
