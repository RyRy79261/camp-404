import { and, asc, eq } from "drizzle-orm";
import { type Currency, isCurrency, UnknownCurrencyError } from "@camp404/core";
import { writeAuditEvent } from "./audit";
import { currentCycleNumber } from "./cycles";
import { createHttpDb, withTransaction } from "./index";
import * as schema from "./schema";

// Team budgets, one per team per year (migration 0034). Reads and writes are
// for the camp's current year: a new year starts with no budgets. Who may set
// a budget is the caller's check (a captain, or the lead of that team).

export type TeamBudgetTeam = (typeof schema.teamEnum.enumValues)[number];
export type TeamBudgetRow = typeof schema.teamBudgets.$inferSelect;

/** This year's budgets, by team key. */
export async function listTeamBudgets(): Promise<TeamBudgetRow[]> {
  const cycle = await currentCycleNumber();
  return createHttpDb()
    .select()
    .from(schema.teamBudgets)
    .where(eq(schema.teamBudgets.cycle, cycle))
    .orderBy(asc(schema.teamBudgets.team));
}

/** This year's budget for one team, or null when none is set. */
export async function getTeamBudget(
  team: TeamBudgetTeam,
): Promise<TeamBudgetRow | null> {
  const cycle = await currentCycleNumber();
  const [row] = await createHttpDb()
    .select()
    .from(schema.teamBudgets)
    .where(
      and(
        eq(schema.teamBudgets.team, team),
        eq(schema.teamBudgets.cycle, cycle),
      ),
    )
    .limit(1);
  return row ?? null;
}

export interface TeamBudgetChange {
  /** A decimal string with up to 2 places, or null to clear. */
  assignedAmount?: string | null;
  perceivedAmount?: string | null;
  /** ZAR, USD or EUR; anything else is refused before writing. */
  currency?: Currency;
  notes?: string | null;
}

/**
 * Set fields of a team's budget for this year, creating the row on first use.
 * Fields left out keep their value. The row and its audit entry commit
 * together; the audit names which fields changed, not the notes text.
 */
export async function setTeamBudget(input: {
  team: TeamBudgetTeam;
  change: TeamBudgetChange;
  actorId: string;
}): Promise<TeamBudgetRow> {
  const { currency } = input.change;
  if (currency !== undefined && !isCurrency(currency)) {
    throw new UnknownCurrencyError(currency);
  }
  // Resolved before the transaction: currentCycleNumber reads on its own handle.
  const cycle = await currentCycleNumber();
  const set = Object.fromEntries(
    Object.entries(input.change).filter(([, value]) => value !== undefined),
  ) as TeamBudgetChange;
  return await withTransaction(async (tx) => {
    const [row] = await tx
      .insert(schema.teamBudgets)
      .values({ team: input.team, cycle, ...set })
      .onConflictDoUpdate({
        target: [schema.teamBudgets.team, schema.teamBudgets.cycle],
        set: { ...set, updatedAt: new Date() },
      })
      .returning();
    await writeAuditEvent(tx, {
      actorId: input.actorId,
      action: "team_budget.set",
      target: input.team,
      metadata: { team: input.team, cycle, fields: Object.keys(set) },
    });
    return row!;
  });
}
