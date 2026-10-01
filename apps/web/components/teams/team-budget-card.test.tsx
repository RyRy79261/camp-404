import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { formatMoney, type BudgetTotals } from "@camp404/core";
import { TeamBudgetCard } from "./team-budget-card";

// The team page's Budget box (#242): with no budget, nothing spent and nothing
// waiting it is one short line; once the team has spent money, every member
// still reads what it spent, budget or not.

afterEach(cleanup);

const NONE: BudgetTotals = {
  budgetCents: null,
  spentCents: 0,
  waitingCents: 0,
  waitingCount: 0,
  leftCents: null,
  over: false,
};

function card(totals: BudgetTotals) {
  render(
    <TeamBudgetCard
      team="power"
      teamLabel="Power"
      totals={totals}
      onTeam={false}
      canApprove={false}
      keepsMoney={false}
    />,
  );
}

describe("TeamBudgetCard", () => {
  it("is one line when the team has no budget and no claims", () => {
    card(NONE);
    expect(screen.getByText("No budget set yet.")).toBeTruthy();
    expect(screen.queryByTestId("budget-stats")).toBeNull();
  });

  it("still shows what a team with no budget has spent", () => {
    card({ ...NONE, spentCents: 80_000 });
    expect(screen.queryByText("No budget set yet.")).toBeNull();
    const stats = screen.getByTestId("budget-stats");
    expect(stats.textContent).toContain(formatMoney(80_000));
  });
});
