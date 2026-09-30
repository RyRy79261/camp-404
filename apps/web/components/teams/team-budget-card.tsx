import Link from "next/link";
import { Wallet } from "lucide-react";
import { budgetSpentPercent, type BudgetTotals } from "@camp404/core";
import { Badge } from "@camp404/ui/components/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@camp404/ui/components/card";
import { ProgressBar } from "@camp404/ui/components/progress-bar";
import {
  CLAIM_APPROVALS_PATH,
  MY_CLAIMS_PATH,
  PAYMENTS_BUDGETS_PATH,
  SPENT_MEANS,
} from "@/lib/claims-copy";
import { budgetHeadline, budgetLeftLine, waitingLine } from "@/lib/claims-view";

// A team's money for the year (#242), on its program page: every member reads
// the totals (owner, 2026-09-30: budget, spent, left), never a claim. The
// links follow what the viewer may do: a lead of this team or a captain
// approves its claims, the Finance team sets the budget, and anyone claims.

export function TeamBudgetCard({
  teamLabel,
  totals,
  canApprove,
  keepsMoney,
}: {
  teamLabel: string;
  totals: BudgetTotals;
  /** A lead of this team, or a captain. */
  canApprove: boolean;
  /** A captain or a Finance lead. */
  keepsMoney: boolean;
}) {
  const percent = budgetSpentPercent(totals);
  const left = budgetLeftLine(totals);
  const waiting = waitingLine(totals);
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-3 space-y-0 pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Wallet className="h-4 w-4 text-accent" aria-hidden />
          Budget
        </CardTitle>
        {totals.over && <Badge variant="destructive">Over budget</Badge>}
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <p
          className="text-sm font-medium tabular-nums"
          data-testid="team-budget"
        >
          {budgetHeadline(totals)}
        </p>
        {percent !== null && (
          <ProgressBar value={percent} label={`${teamLabel} budget spent`} />
        )}
        {(left || waiting) && (
          <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            {left && <span className="tabular-nums">{left}</span>}
            {waiting && <span className="tabular-nums">{waiting}</span>}
          </p>
        )}
        <p className="text-xs text-muted-foreground">{SPENT_MEANS}</p>
        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
          {canApprove && totals.waitingCount > 0 && (
            <Link
              href={CLAIM_APPROVALS_PATH}
              className="text-xs font-medium text-accent hover:underline"
            >
              Claims to approve
            </Link>
          )}
          {keepsMoney && (
            <Link
              href={PAYMENTS_BUDGETS_PATH}
              className="text-xs font-medium text-accent hover:underline"
            >
              Set budgets
            </Link>
          )}
          <Link
            href={MY_CLAIMS_PATH}
            className="text-xs font-medium text-accent hover:underline"
          >
            Claim money back
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
