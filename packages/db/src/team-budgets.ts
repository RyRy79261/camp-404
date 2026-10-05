import { and, asc, eq } from "drizzle-orm";
import { budgetTotals, type BudgetTotals } from "@camp404/core";
import type { Team } from "@camp404/types";
import { writeAuditEvent } from "./audit";
import { lockMoneyKeeper, MoneyRefused, type MoneyResult } from "./dues";
import { createHttpDb, withTransaction } from "./index";
import { listClaimAmounts } from "./reimbursements";
import * as schema from "./schema";

// Team budgets (#242): ONE amount per team per year (owner, 2026-09-30), in
// whole rand cents, set by captains and Finance leads (canManageMoney,
// re-checked inside the write's own transaction). Every member reads each
// team's totals: budget, spent (the claims the team said yes to), left.
// A new year starts with no budgets.

export type TeamBudgetTeam = Team;
export type TeamBudgetRow = typeof schema.teamBudgets.$inferSelect;

export const BUDGET_NOT_FINANCE =
  "Only captains and Finance leads can set budgets.";
export const BUDGET_CHANGED =
  "Someone changed this budget first. Reload the page.";
export const BUDGET_BAD_AMOUNT = "A budget must be R0 or more.";

/** One year's budget rows, by team. */
export async function listTeamBudgets(cycle: number): Promise<TeamBudgetRow[]> {
  return createHttpDb()
    .select()
    .from(schema.teamBudgets)
    .where(eq(schema.teamBudgets.cycle, cycle))
    .orderBy(asc(schema.teamBudgets.team));
}

/**
 * Every team's totals for a year: its budget, what it spent, what is waiting.
 * A team with neither a budget nor a claim reads as no budget and nothing
 * spent. Claims under no team (from before #242) count against no team.
 */
export async function listBudgetTotals(
  cycle: number,
): Promise<Record<Team, BudgetTotals>> {
  const [budgets, claims] = await Promise.all([
    listTeamBudgets(cycle),
    listClaimAmounts(cycle),
  ]);
  const teams = schema.teamEnum.enumValues;
  return Object.fromEntries(
    teams.map((team) => [
      team,
      budgetTotals(
        budgets.find((b) => b.team === team)?.amountCents ?? null,
        claims.filter((c) => c.team === team),
      ),
    ]),
  ) as Record<Team, BudgetTotals>;
}

/**
 * Set or clear a team's budget for a year. `expectedCents` is the amount the
 * editor saw (null: none set); a change someone made in between is refused,
 * never overwritten. The row and its audit entry commit together.
 */
export async function setTeamBudget(input: {
  team: Team;
  cycle: number;
  amountCents: number | null;
  expectedCents: number | null;
  actorId: string;
}): Promise<MoneyResult> {
  if (
    input.amountCents !== null &&
    (!Number.isSafeInteger(input.amountCents) || input.amountCents < 0)
  ) {
    return { ok: false, error: BUDGET_BAD_AMOUNT };
  }
  try {
    await withTransaction(async (tx) => {
      if (!(await lockMoneyKeeper(tx, input.actorId))) {
        throw new MoneyRefused(BUDGET_NOT_FINANCE);
      }
      const where = and(
        eq(schema.teamBudgets.team, input.team),
        eq(schema.teamBudgets.cycle, input.cycle),
      );
      const [row] = await tx
        .select({ amountCents: schema.teamBudgets.amountCents })
        .from(schema.teamBudgets)
        .where(where)
        .for("update");
      const current = row?.amountCents ?? null;
      if (current !== input.expectedCents) {
        throw new MoneyRefused(BUDGET_CHANGED);
      }
      if (current === input.amountCents) return;
      const written = row
        ? await tx
            .update(schema.teamBudgets)
            .set({ amountCents: input.amountCents, updatedAt: new Date() })
            .where(where)
            .returning({ team: schema.teamBudgets.team })
        : await tx
            .insert(schema.teamBudgets)
            .values({
              team: input.team,
              cycle: input.cycle,
              amountCents: input.amountCents,
            })
            .onConflictDoNothing()
            .returning({ team: schema.teamBudgets.team });
      // Another editor inserted the row between our read and our insert.
      if (written.length === 0) throw new MoneyRefused(BUDGET_CHANGED);
      await writeAuditEvent(tx, {
        actorId: input.actorId,
        action: "team_budget.set",
        target: input.team,
        metadata: {
          team: input.team,
          cycle: input.cycle,
          amountCents: input.amountCents,
          fromCents: current,
        },
      });
    });
    return { ok: true };
  } catch (error) {
    if (error instanceof MoneyRefused) {
      return { ok: false, error: error.sentence };
    }
    throw error;
  }
}
