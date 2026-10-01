import type { ReactNode } from "react";
import {
  budgetSpentPercent,
  formatMoney,
  type BudgetTotals,
} from "@camp404/core";
import { ProgressBar } from "@camp404/ui/components/progress-bar";
import { cn } from "@camp404/ui/lib/utils";
import { SpentInfo } from "./spent-info";

// A team's money as four figures in a row (#242): Budget, Spent, Left and
// Waiting, each label over its amount, under the spent bar. The same row on
// the team page's Budget box, above a team's claims to approve, and as the
// year's totals on the Budgets tab, so the numbers read the same everywhere.
// What "spent" means is behind the small (i) beside its label.

function money(cents: number | null): string {
  return cents === null ? "—" : formatMoney(cents);
}

export function BudgetStats({
  totals,
  label,
  showBar = true,
  className,
}: {
  totals: Pick<
    BudgetTotals,
    "budgetCents" | "spentCents" | "leftCents" | "waitingCents" | "waitingCount"
  >;
  /** Names the bar and the row ("Kitchen budget"). */
  label: string;
  showBar?: boolean;
  className?: string;
}) {
  const percent =
    showBar && totals.budgetCents !== null
      ? budgetSpentPercent({ ...totals, over: false })
      : null;
  const over = totals.leftCents !== null && totals.leftCents < 0;
  const waitingHint =
    totals.waitingCount === 0
      ? "nothing waiting"
      : totals.waitingCount === 1
        ? "1 claim"
        : `${totals.waitingCount} claims`;
  return (
    <div className={cn("flex flex-col gap-3", className)}>
      {percent !== null && (
        <ProgressBar value={percent} label={`${label} spent`} />
      )}
      <dl
        aria-label={label}
        data-testid="budget-stats"
        className="grid grid-cols-2 gap-x-6 gap-y-3 page-sm:grid-cols-4"
      >
        <Stat term="Budget" value={money(totals.budgetCents)} />
        <Stat
          term={
            <span className="inline-flex items-center gap-1">
              Spent
              <SpentInfo />
            </span>
          }
          value={money(totals.spentCents)}
        />
        <Stat
          term={over ? "Over" : "Left"}
          value={
            totals.leftCents === null
              ? "—"
              : formatMoney(Math.abs(totals.leftCents))
          }
          tone={over ? "destructive" : undefined}
        />
        <Stat
          term="Waiting"
          value={formatMoney(totals.waitingCents)}
          hint={waitingHint}
        />
      </dl>
    </div>
  );
}

function Stat({
  term,
  value,
  hint,
  tone,
}: {
  term: ReactNode;
  value: string;
  hint?: string;
  tone?: "destructive";
}) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {term}
      </dt>
      <dd
        className={cn(
          "text-base font-semibold tabular-nums",
          tone === "destructive" && "text-destructive",
        )}
      >
        {value}
      </dd>
      {hint && <dd className="text-xs text-muted-foreground">{hint}</dd>}
    </div>
  );
}
