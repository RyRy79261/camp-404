import { PageHeading } from "@camp404/ui/components/page-heading";
import { BudgetsManager } from "@/app/(console)/captains/payments/budgets/budgets-manager";
import { loadBudgetRows } from "@/lib/budget-rows";
import { requireMemberPage } from "@/lib/member-gate";

export const dynamic = "force-dynamic";

export const metadata = { title: "Budgets — Camp 404" };

// Every team's budget for the year (#242), for every member (owner,
// 2026-09-30: "Every member sees each team's totals"): the same table as the
// Finance team's Budgets tab, read-only, with one quiet line saying who sets
// them. Only each team's sums are read, never a claim.

export default async function TeamBudgetsPage() {
  await requireMemberPage();
  const data = await loadBudgetRows();
  return (
    <div className="flex flex-col">
      <PageHeading
        eyebrow="Teams / Budgets"
        title="Budgets"
        description="Each team's budget for the year, what it has spent, and what is waiting for a yes."
      />
      <BudgetsManager
        yearLabel={data.yearLabel}
        rows={data.rows}
        totals={data.totals}
        canEdit={false}
      />
    </div>
  );
}
