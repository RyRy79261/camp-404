import { UNSET_CYCLE } from "@camp404/db/camp-config";
import { sumMinor } from "@camp404/core";
import type { Team } from "@camp404/types";
import { PaymentsFrame } from "@/components/dues/payments-frame";
import { getTeamsConfig } from "@/lib/camp-config";
import { captainPageGate } from "@/lib/captain-gate";
import { listBudgetTotals } from "@/lib/claims";
import { PAYMENTS_BUDGETS_PATH } from "@/lib/claims-copy";
import { keepsMoney } from "@/lib/money-gate";
import { ledgerCycle } from "@/lib/payments";
import { BudgetsManager, type BudgetRow } from "./budgets-manager";

export const dynamic = "force-dynamic";

export const metadata = { title: "Budgets — Camp 404" };

// The year's team budgets (#242): ONE amount per team (owner, 2026-09-30),
// set here by captains and Finance leads (canManageMoney). Beside each, what
// the team has spent (the claims it said yes to) and what is waiting. Every
// member reads these totals on the team's own page; only this tab edits them.
// An archived team is listed only when it has a budget or claims this year.

export default async function BudgetsPage() {
  const gate = await captainPageGate("team_lead");
  const cleared = gate.cleared && (await keepsMoney(gate));
  const data = cleared
    ? await (async () => {
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
        return { cycle, rows };
      })()
    : null;

  return (
    <PaymentsFrame
      active={PAYMENTS_BUDGETS_PATH}
      title="Budgets"
      description="Each team's budget for the year, and what it has spent. Every member sees these totals on the team's page."
      cleared={data !== null}
    >
      {data ? (
        <BudgetsManager
          yearLabel={
            data.cycle === UNSET_CYCLE ? "this year" : String(data.cycle)
          }
          rows={data.rows}
          totals={{
            budgetCents: sumMinor(data.rows.map((r) => r.budgetCents ?? 0)),
            spentCents: sumMinor(data.rows.map((r) => r.spentCents)),
            waitingCents: sumMinor(data.rows.map((r) => r.waitingCents)),
          }}
        />
      ) : null}
    </PaymentsFrame>
  );
}
