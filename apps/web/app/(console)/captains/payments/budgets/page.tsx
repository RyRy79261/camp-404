import { PaymentsFrame } from "@/components/dues/payments-frame";
import { loadBudgetRows } from "@/lib/budget-rows";
import { captainPageGate } from "@/lib/captain-gate";
import { BUDGETS_REFUSAL, PAYMENTS_BUDGETS_PATH } from "@/lib/claims-copy";
import { keepsMoney } from "@/lib/money-gate";
import { BudgetsManager } from "./budgets-manager";

export const dynamic = "force-dynamic";

export const metadata = { title: "Budgets — Camp 404" };

// The year's team budgets (#242): ONE amount per team (owner, 2026-09-30),
// set here by captains and Finance leads (canManageMoney). Beside each, what
// the team has spent (the claims it said yes to) and what is waiting. Every
// member reads the same table, without the pencils, at /teams/budgets.

export default async function BudgetsPage() {
  const gate = await captainPageGate("team_lead");
  const cleared = gate.cleared && (await keepsMoney(gate));
  const data = cleared ? await loadBudgetRows() : null;

  return (
    <PaymentsFrame
      active={PAYMENTS_BUDGETS_PATH}
      title="Budgets"
      description="Each team's budget for the year, what it has spent, and what is waiting for a yes."
      cleared={data !== null}
      refusal={BUDGETS_REFUSAL}
    >
      {data ? (
        <BudgetsManager
          yearLabel={data.yearLabel}
          rows={data.rows}
          totals={data.totals}
          canEdit
        />
      ) : null}
    </PaymentsFrame>
  );
}
