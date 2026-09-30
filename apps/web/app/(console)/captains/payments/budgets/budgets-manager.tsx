"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Pencil } from "lucide-react";
import {
  budgetSpentPercent,
  formatMoney,
  parseMoneyToMinor,
  type BudgetTotals,
} from "@camp404/core";
import { Badge } from "@camp404/ui/components/badge";
import { Button } from "@camp404/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@camp404/ui/components/card";
import { InputField } from "@camp404/ui/components/input-field";
import { ProgressBar } from "@camp404/ui/components/progress-bar";
import { toast } from "@camp404/ui/components/toast";
import { SPENT_MEANS } from "@/lib/claims-copy";
import { budgetLeftLine } from "@/lib/claims-view";
import { typedRands } from "@/lib/dues-view";
import { setBudgetAction } from "../claims-actions";

// The Finance team's Budgets tab (#242): one amount per team for the year.
// Each row edits in place; a problem with what was typed shows beside it.

export interface BudgetRow extends BudgetTotals {
  key: string;
  label: string;
  archived: boolean;
}

const TYPE_AMOUNT = "Type the budget in rands, like 5000 or 5000,50.";

export function BudgetsManager({
  yearLabel,
  rows,
  totals,
}: {
  yearLabel: string;
  rows: BudgetRow[];
  totals: { budgetCents: number; spentCents: number; waitingCents: number };
}) {
  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardContent className="flex flex-wrap gap-x-8 gap-y-2 p-5 text-sm text-muted-foreground">
          <span>
            Budgets {yearLabel}{" "}
            <span className="font-medium tabular-nums text-foreground">
              {formatMoney(totals.budgetCents)}
            </span>
          </span>
          <span>
            Spent{" "}
            <span className="font-medium tabular-nums text-foreground">
              {formatMoney(totals.spentCents)}
            </span>
          </span>
          {totals.waitingCents > 0 && (
            <span>
              Waiting for a yes{" "}
              <span className="font-medium tabular-nums text-foreground">
                {formatMoney(totals.waitingCents)}
              </span>
            </span>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="p-5 pb-3">
          <CardTitle className="text-base">Team budgets</CardTitle>
          <CardDescription>{SPENT_MEANS}</CardDescription>
        </CardHeader>
        <CardContent className="p-5 pt-0">
          <ul aria-label="Team budgets" className="divide-y divide-border">
            {rows.map((row) => (
              <BudgetItem key={row.key} row={row} />
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

function BudgetItem({ row }: { row: BudgetRow }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [amount, setAmount] = useState(
    row.budgetCents === null ? "" : typedRands(row.budgetCents),
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const percent = budgetSpentPercent(row);
  const left = budgetLeftLine(row);

  function save() {
    setError(null);
    let cents: number | null = null;
    if (amount.trim() !== "") {
      cents = parseMoneyToMinor(amount);
      if (cents === null || cents < 0) {
        setError(TYPE_AMOUNT);
        return;
      }
    }
    start(async () => {
      const res = await setBudgetAction({
        team: row.key,
        amountCents: cents,
        expectedCents: row.budgetCents,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      toast.success(
        cents === null
          ? `${row.label}: budget cleared`
          : `${row.label}: budget ${formatMoney(cents)}`,
      );
      setEditing(false);
      router.refresh();
    });
  }

  return (
    <li className="flex flex-col gap-2 py-3" aria-label={row.label}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-2">
          <span className="font-medium">{row.label}</span>
          {row.archived && <Badge variant="outline">Archived</Badge>}
          {row.over && <Badge variant="destructive">Over budget</Badge>}
        </span>
        {!editing && (
          <span className="flex items-center gap-2">
            <span className="font-medium tabular-nums">
              {row.budgetCents === null
                ? "No budget"
                : formatMoney(row.budgetCents)}
            </span>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              aria-label={`Edit ${row.label}'s budget`}
              onClick={() => {
                // Start from the budget as it is now, never an old draft.
                setAmount(
                  row.budgetCents === null ? "" : typedRands(row.budgetCents),
                );
                setError(null);
                setEditing(true);
              }}
            >
              <Pencil aria-hidden />
            </Button>
          </span>
        )}
      </div>
      {percent !== null && (
        <ProgressBar value={percent} label={`${row.label} budget spent`} />
      )}
      <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
        <span>
          Spent{" "}
          <span className="tabular-nums text-foreground">
            {formatMoney(row.spentCents)}
          </span>
        </span>
        {left && <span className="tabular-nums">{left}</span>}
        {row.waitingCount > 0 && (
          <span>
            Waiting{" "}
            <span className="tabular-nums text-foreground">
              {formatMoney(row.waitingCents)}
            </span>
          </span>
        )}
      </div>
      {editing && (
        <div className="flex flex-col gap-2 rounded-md border border-border p-3">
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-40 flex-1">
              <InputField
                label={`${row.label} budget (R)`}
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.currentTarget.value)}
                disabled={pending}
              />
            </div>
            <Button type="button" disabled={pending} onClick={save}>
              {pending && <Loader2 className="animate-spin" aria-hidden />}
              Save
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={pending}
              onClick={() => {
                setEditing(false);
                setError(null);
              }}
            >
              Cancel
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Leave it empty to clear the budget.
          </p>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </div>
      )}
    </li>
  );
}
