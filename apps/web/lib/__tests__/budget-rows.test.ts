import { describe, expect, it, vi } from "vitest";

vi.mock("../claims", () => ({ listBudgetTotals: vi.fn() }));
vi.mock("../camp-config", () => ({ getTeamsConfig: vi.fn() }));
vi.mock("../payments", () => ({ ledgerCycle: vi.fn() }));

import { yearTotals, type BudgetRow } from "../budget-rows";

// The year's totals over every listed team (#242): Left counts only the teams
// that have a budget, so a team with no budget never makes the year "Over".

function row(
  key: string,
  budgetCents: number | null,
  spentCents: number,
): BudgetRow {
  return {
    key,
    label: key,
    archived: false,
    budgetCents,
    spentCents,
    waitingCents: 0,
    waitingCount: 0,
    leftCents: budgetCents === null ? null : budgetCents - spentCents,
    over: budgetCents !== null && spentCents > budgetCents,
  };
}

describe("yearTotals", () => {
  it("leaves an unbudgeted team's spend out of Left", () => {
    const totals = yearTotals([
      row("kitchen", 500_000, 100_000),
      row("power", null, 450_000),
    ]);
    expect(totals.budgetCents).toBe(500_000);
    expect(totals.spentCents).toBe(550_000);
    expect(totals.leftCents).toBe(400_000);
  });

  it("has no Left when no team has a budget", () => {
    expect(yearTotals([row("power", null, 450_000)]).leftCents).toBeNull();
  });
});
