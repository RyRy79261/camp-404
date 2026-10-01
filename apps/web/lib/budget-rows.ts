import "server-only";

import { UNSET_CYCLE } from "@camp404/db/camp-config";
import { sumMinor, type BudgetTotals } from "@camp404/core";
import type { Team } from "@camp404/types";
import { getTeamsConfig } from "./camp-config";
import { listBudgetTotals } from "./claims";
import { ledgerCycle } from "./payments";

// The year's team budgets as rows (#242), for the two pages that list them:
// every member's read-only Budgets (/teams/budgets) and the Finance team's
// Budgets tab, where they are set. Only each team's sums, never a claim. An
// archived team is listed only when it has a budget or claims this year.

export interface BudgetRow extends BudgetTotals {
  key: string;
  label: string;
  archived: boolean;
}

export type YearTotals = Pick<
  BudgetTotals,
  "budgetCents" | "spentCents" | "leftCents" | "waitingCents" | "waitingCount"
>;

export async function loadBudgetRows(): Promise<{
  yearLabel: string;
  rows: BudgetRow[];
  totals: YearTotals;
}> {
  const cycle = await ledgerCycle();
  const [totals, config] = await Promise.all([
    listBudgetTotals(cycle),
    getTeamsConfig(),
  ]);
  const rows: BudgetRow[] = config.teams
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((t) => ({
      ...totals[t.key as Team],
      key: t.key,
      label: t.label,
      archived: t.archived,
    }))
    .filter(
      (r) =>
        !r.archived ||
        r.budgetCents !== null ||
        r.spentCents > 0 ||
        r.waitingCount > 0,
    );
  return {
    yearLabel: cycle === UNSET_CYCLE ? "this year" : String(cycle),
    rows,
    totals: yearTotals(rows),
  };
}

/** The year's four figures over the listed teams, like one team's. */
export function yearTotals(rows: readonly BudgetRow[]): YearTotals {
  const budgeted = rows.filter((r) => r.budgetCents !== null);
  const budgetCents =
    budgeted.length === 0
      ? null
      : sumMinor(budgeted.map((r) => r.budgetCents ?? 0));
  const spentCents = sumMinor(rows.map((r) => r.spentCents));
  return {
    budgetCents,
    spentCents,
    leftCents: budgetCents === null ? null : budgetCents - spentCents,
    waitingCents: sumMinor(rows.map((r) => r.waitingCents)),
    waitingCount: rows.reduce((n, r) => n + r.waitingCount, 0),
  };
}
