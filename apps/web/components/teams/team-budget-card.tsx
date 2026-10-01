import Link from "next/link";
import { ReceiptText, Wallet } from "lucide-react";
import type { BudgetTotals } from "@camp404/core";
import { Badge } from "@camp404/ui/components/badge";
import { buttonVariants } from "@camp404/ui/components/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@camp404/ui/components/card";
import {
  CLAIM_APPROVALS_PATH,
  MY_CLAIMS_PATH,
  PAYMENTS_BUDGETS_PATH,
  TEAM_BUDGETS_PATH,
} from "@/lib/claims-copy";
import { BudgetStats } from "./budget-stats";

// A team's money for the year (#242), on its program page: every member reads
// the totals (owner, 2026-09-30: budget, spent, left), never a claim. The
// figures sit in one row under the bar. "Claim money back" is offered only to
// the people on this team (a claim is for money spent for the team), and opens
// the claim form on this team; the quieter links beside it follow what the
// viewer may do: a lead of this team (or a captain) always sees "Claims to
// approve" with its count, so the row never reshuffles; the Finance team sets
// the budgets, and everyone else reads every team's on the same page. With no
// budget set, nothing spent and nothing waiting the card is one line, not a
// row of dashes: the claim for the team's people, and "Set budgets" for those
// who set them.

export function TeamBudgetCard({
  team,
  teamLabel,
  totals,
  onTeam,
  canApprove,
  keepsMoney,
}: {
  team: string;
  teamLabel: string;
  totals: BudgetTotals;
  /** On this team this year (an archived team's page offers no claim). */
  onTeam: boolean;
  /** A lead of this team, or a captain. */
  canApprove: boolean;
  /** A captain or a Finance lead. */
  keepsMoney: boolean;
}) {
  const quiet = buttonVariants({ variant: "outline", size: "sm" });
  const claim = onTeam ? (
    <Link
      href={`${MY_CLAIMS_PATH}?team=${encodeURIComponent(team)}`}
      className={buttonVariants({ size: "sm" })}
    >
      <ReceiptText aria-hidden />
      Claim money back
    </Link>
  ) : null;
  const approvals = canApprove ? (
    <Link href={CLAIM_APPROVALS_PATH} className={quiet}>
      Claims to approve ({totals.waitingCount})
    </Link>
  ) : null;
  const budgets = keepsMoney ? (
    <Link href={PAYMENTS_BUDGETS_PATH} className={quiet}>
      Set budgets
    </Link>
  ) : (
    <Link href={TEAM_BUDGETS_PATH} className={quiet}>
      {"Every team's budget"}
    </Link>
  );

  if (
    totals.budgetCents === null &&
    totals.waitingCount === 0 &&
    totals.spentCents === 0
  ) {
    return (
      <Card>
        <CardContent className="flex flex-wrap items-center gap-x-3 gap-y-2 p-6">
          <CardTitle className="flex items-center gap-2 text-base">
            <Wallet className="h-4 w-4 text-accent" aria-hidden />
            Budget
          </CardTitle>
          <span className="text-sm text-muted-foreground">
            No budget set yet.
          </span>
          {claim || keepsMoney ? (
            <span className="ml-auto flex flex-wrap items-center gap-2">
              {claim}
              {keepsMoney ? budgets : null}
            </span>
          ) : null}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-3 space-y-0 pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Wallet className="h-4 w-4 text-accent" aria-hidden />
          Budget
        </CardTitle>
        {totals.budgetCents === null ? (
          <Badge variant="outline">No budget set</Badge>
        ) : totals.over ? (
          <Badge variant="destructive">Over budget</Badge>
        ) : null}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <BudgetStats totals={totals} label={`${teamLabel} budget`} />
        <div className="flex flex-wrap items-center gap-2">
          {claim}
          {approvals}
          {budgets}
        </div>
      </CardContent>
    </Card>
  );
}
