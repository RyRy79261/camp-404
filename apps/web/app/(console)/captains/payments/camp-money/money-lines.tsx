"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { campDayKey, formatMoney } from "@camp404/core";
import { Badge } from "@camp404/ui/components/badge";
import { Button } from "@camp404/ui/components/button";
import {
  ResponsiveDataTable,
  type ResponsiveColumn,
} from "@camp404/ui/components/responsive-data-table";
import { RowActions } from "@camp404/ui/components/row-actions";
import { toast } from "@camp404/ui/components/toast";
import { cn } from "@camp404/ui/lib/utils";
import type { MoneyLineRow, PaidLineRow } from "@/lib/camp-money-view";
import { formatDay } from "@/lib/dues-view";
import { markCampBillPaidAction } from "../camp-money-actions";
import { BillDialog } from "./bill-dialog";

// Camp money's "Date by date" (mock-up step 1, Option B): every bill payment
// and fee day still to come, with the money after each, and "Mark paid" as
// the one main action on a bill's next payment, in the same place on every
// row (RowActions); the pencil beside it changes the bill. Marking paid is a
// one-tap change: only its own button spins, and a failure is a toast.

/** Money with its sign: "−R 4 400,00" out, "+R 23 600,00" in. */
function signed(cents: number): string {
  if (cents < 0) return `−${formatMoney(-cents)}`;
  return `+${formatMoney(cents)}`;
}

function money(cents: number): string {
  return cents < 0 ? `−${formatMoney(-cents)}` : formatMoney(cents);
}

export function MoneyLines({ rows }: { rows: MoneyLineRow[] }) {
  const router = useRouter();
  const [marking, setMarking] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function markPaid(row: MoneyLineRow) {
    if (!row.bill) return;
    const bill = row.bill.edit;
    setMarking(row.key);
    start(async () => {
      const res = await markCampBillPaidAction({
        billId: bill.id,
        expectedPaidCount: bill.paidCount,
        paidOn: campDayKey(new Date()),
      });
      if (!res.ok) toast.error(res.error);
      else toast.success(`${bill.name} marked paid`);
      setMarking(null);
      router.refresh();
    });
  }

  const columns: ResponsiveColumn<MoneyLineRow>[] = [
    {
      id: "day",
      header: "Date",
      headClassName: "w-24",
      cellClassName: "whitespace-nowrap tabular-nums",
      cell: (r) => r.day,
    },
    {
      id: "what",
      header: "What",
      role: "title",
      cellClassName: "whitespace-normal",
      cell: (r) => (
        <span className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
          <span className={cn(r.bill ? "font-medium" : undefined)}>
            {r.name}
          </span>
          {r.detail && (
            <span className="text-xs text-muted-foreground">{r.detail}</span>
          )}
          {r.planned && <Badge variant="secondary">Planned</Badge>}
        </span>
      ),
    },
    {
      id: "amount",
      header: "In / out",
      align: "right",
      headClassName: "w-36",
      cellClassName: cn("whitespace-nowrap tabular-nums"),
      cell: (r) => (
        <span className={r.incoming ? "text-success" : undefined}>
          {signed(r.amountCents)}
        </span>
      ),
    },
    {
      id: "after",
      header: "Money after",
      align: "right",
      headClassName: "w-36",
      cellClassName: "whitespace-nowrap tabular-nums",
      cell: (r) => (
        <span
          className={cn(
            r.moneyAfterCents < 0 && "text-destructive",
            r.highlight && "font-bold",
          )}
        >
          {money(r.moneyAfterCents)}
        </span>
      ),
    },
    {
      id: "actions",
      header: "Actions",
      role: "actions",
      hideHeader: true,
      cell: (r) => (
        <RowActions
          label={r.bill ? `Actions for ${r.name}` : undefined}
          primary={
            r.bill?.next ? (
              <Button
                type="button"
                size="sm"
                disabled={pending}
                onClick={() => markPaid(r)}
              >
                {pending && marking === r.key && (
                  <Loader2 className="animate-spin" aria-hidden />
                )}
                Mark paid
              </Button>
            ) : null
          }
          secondary={r.bill ? <BillDialog bill={r.bill.edit} /> : null}
        />
      ),
    },
  ];

  return (
    <ResponsiveDataTable
      columns={columns}
      data={rows}
      getRowKey={(r) => r.key}
      label="Date by date"
      framed
    />
  );
}

export function PaidLines({ rows }: { rows: PaidLineRow[] }) {
  const columns: ResponsiveColumn<PaidLineRow>[] = [
    {
      id: "day",
      header: "Was due",
      headClassName: "w-24",
      cellClassName: "whitespace-nowrap tabular-nums",
      cell: (r) => r.day,
    },
    {
      id: "what",
      header: "What",
      role: "title",
      cellClassName: "whitespace-normal",
      cell: (r) => (
        <span className="flex flex-wrap items-center gap-x-1.5">
          <span className="font-medium">{r.name}</span>
          {r.payee && (
            <span className="text-xs text-muted-foreground">{r.payee}</span>
          )}
        </span>
      ),
    },
    {
      id: "amount",
      header: "Out",
      align: "right",
      headClassName: "w-36",
      cellClassName: "whitespace-nowrap tabular-nums",
      cell: (r) => `−${formatMoney(r.amountCents)}`,
    },
    {
      id: "paid",
      header: "Paid",
      role: "badge",
      headClassName: "w-44",
      cell: (r) => (
        <span className="flex flex-wrap items-center gap-1.5">
          <Badge variant="success">Paid</Badge>
          {r.paidOn && (
            <span className="text-xs text-muted-foreground">
              on {formatDay(r.paidOn)}
            </span>
          )}
        </span>
      ),
    },
  ];
  return (
    <ResponsiveDataTable
      columns={columns}
      data={rows}
      getRowKey={(r) => r.key}
      label="Bills paid"
      framed
    />
  );
}
