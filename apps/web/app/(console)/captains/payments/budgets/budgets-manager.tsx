"use client";

import { useState, useTransition, type ReactNode } from "react";
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
  CardHeader,
  CardTitle,
} from "@camp404/ui/components/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@camp404/ui/components/dialog";
import { EditorsNote } from "@camp404/ui/components/field-list";
import { InputField } from "@camp404/ui/components/input-field";
import { ProgressBar } from "@camp404/ui/components/progress-bar";
import {
  ResponsiveDataTable,
  type ResponsiveColumn,
} from "@camp404/ui/components/responsive-data-table";
import { RowActions } from "@camp404/ui/components/row-actions";
import { toast } from "@camp404/ui/components/toast";
import { BudgetStats } from "@/components/teams/budget-stats";
import { BUDGET_EDITORS } from "@/lib/claims-copy";
import { typedRands } from "@/lib/dues-view";
import { setBudgetAction } from "../claims-actions";

// The year's team budgets (#242): one amount per team, as one table (cards in
// a narrow window) with the amounts in right-aligned columns, so Budget,
// Spent, Left and Waiting line up down the list, and a team with no budget
// keeps the same row height (its bar cell stays empty). The year's totals sit
// above in the same four figures as a team's page. The Finance team (captains
// and Finance leads) gets an Edit button at the end of each row that opens the
// budget in a small dialog, where a problem with what was typed shows beside
// the field; everyone else reads the same table with no Edit buttons, and one
// quiet line says who sets them.

export interface BudgetRow extends BudgetTotals {
  key: string;
  label: string;
  archived: boolean;
}

const TYPE_AMOUNT = "Type the budget in rands, like 5000 or 5000,50.";

function amountColumn(
  id: string,
  header: string,
  cell: (r: BudgetRow) => ReactNode,
): ResponsiveColumn<BudgetRow> {
  return {
    id,
    header,
    align: "right",
    cellClassName: "whitespace-nowrap tabular-nums",
    cell,
  };
}

function columns(onEdit: ((row: BudgetRow) => void) | null) {
  const cols: ResponsiveColumn<BudgetRow>[] = [
    {
      id: "team",
      header: "Team",
      role: "title",
      cellClassName: "font-medium",
      cell: (r) => r.label,
    },
    {
      id: "marks",
      header: "Marks",
      role: "badge",
      hideHeader: true,
      cell: (r) =>
        r.over || r.archived ? (
          <span className="flex gap-1">
            {r.archived && <Badge variant="outline">Archived</Badge>}
            {r.over && <Badge variant="destructive">Over budget</Badge>}
          </span>
        ) : null,
    },
    amountColumn("budget", "Budget", (r) =>
      r.budgetCents === null ? (
        <span className="text-muted-foreground">No budget</span>
      ) : (
        <span className="font-medium">{formatMoney(r.budgetCents)}</span>
      ),
    ),
    amountColumn("spent", "Spent", (r) => formatMoney(r.spentCents)),
    amountColumn("left", "Left", (r) =>
      r.leftCents === null ? (
        <span className="text-muted-foreground">—</span>
      ) : r.leftCents < 0 ? (
        <span className="text-destructive">
          {formatMoney(-r.leftCents)} over
        </span>
      ) : (
        formatMoney(r.leftCents)
      ),
    ),
    amountColumn("waiting", "Waiting", (r) =>
      r.waitingCount === 0 ? (
        <span className="text-muted-foreground">—</span>
      ) : (
        <span>
          {formatMoney(r.waitingCents)}{" "}
          <span className="text-xs text-muted-foreground">
            ({r.waitingCount})
          </span>
        </span>
      ),
    ),
    {
      id: "bar",
      header: "Spent of budget",
      hideHeader: true,
      mobileHidden: true,
      cellClassName: "w-28 align-middle",
      cell: (r) => {
        const percent = budgetSpentPercent(r);
        return percent === null ? null : (
          <ProgressBar value={percent} label={`${r.label} budget spent`} />
        );
      },
    },
  ];
  if (onEdit) {
    cols.push({
      id: "actions",
      header: "Actions",
      role: "actions",
      hideHeader: true,
      align: "right",
      cell: (r) => (
        <RowActions
          label={`Actions for ${r.label}`}
          primary={
            <Button
              type="button"
              size="sm"
              variant="outline"
              aria-label={`Edit ${r.label}'s budget`}
              onClick={() => onEdit(r)}
            >
              <Pencil aria-hidden />
              Edit
            </Button>
          }
        />
      ),
    });
  }
  return cols;
}

export function BudgetsManager({
  yearLabel,
  rows,
  totals,
  canEdit,
}: {
  yearLabel: string;
  rows: BudgetRow[];
  totals: Pick<
    BudgetTotals,
    "budgetCents" | "spentCents" | "leftCents" | "waitingCents" | "waitingCount"
  >;
  /** A captain or a Finance lead: the Edit buttons and the dialog. */
  canEdit: boolean;
}) {
  const [editing, setEditing] = useState<BudgetRow | null>(null);
  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader className="p-5 pb-3">
          <CardTitle className="text-base">All teams, {yearLabel}</CardTitle>
        </CardHeader>
        <CardContent className="p-5 pt-0">
          <BudgetStats totals={totals} label={`Budgets ${yearLabel}`} />
        </CardContent>
      </Card>
      <div className="flex flex-col gap-2">
        <ResponsiveDataTable
          columns={columns(canEdit ? setEditing : null)}
          data={rows}
          getRowKey={(r) => r.key}
          label="Team budgets"
          stackBelow="md"
          framed
        />
        {!canEdit && <EditorsNote>{BUDGET_EDITORS}</EditorsNote>}
      </div>
      {canEdit && (
        <BudgetDialog
          // A fresh dialog per opening: it always starts from the budget as
          // it is now, never an old draft left by Cancel.
          key={editing ? `${editing.key}:${editing.budgetCents}` : "closed"}
          row={editing}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function BudgetDialog({
  row,
  onClose,
}: {
  row: BudgetRow | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const [amount, setAmount] = useState(
    row?.budgetCents == null ? "" : typedRands(row.budgetCents),
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function save() {
    if (!row) return;
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
      onClose();
      router.refresh();
    });
  }

  return (
    <Dialog
      open={row !== null}
      onOpenChange={(open) => {
        if (!open && !pending) onClose();
      }}
    >
      <DialogContent className="sm:max-w-sm" showCloseButton={!pending}>
        {row && (
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              save();
            }}
          >
            <DialogHeader>
              <DialogTitle>{row.label}&rsquo;s budget</DialogTitle>
              <DialogDescription>
                The amount for {row.label} this year, in rands.
              </DialogDescription>
            </DialogHeader>
            <InputField
              label={`${row.label} budget (R)`}
              inputMode="decimal"
              autoFocus
              value={amount}
              onChange={(e) => setAmount(e.currentTarget.value)}
              disabled={pending}
              helper="Leave it empty to clear the budget."
              error={error ?? undefined}
            />
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={pending}
                onClick={onClose}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                {pending && <Loader2 className="animate-spin" aria-hidden />}
                Save
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
