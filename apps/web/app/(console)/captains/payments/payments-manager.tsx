"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Wallet } from "lucide-react";
import {
  CAMP_TIME_ZONE,
  formatMoney,
  readRate,
  sumMinor,
  type PaymentStatus,
} from "@camp404/core";
import type { PaymentRow } from "@camp404/db/payments";
import { Badge } from "@camp404/ui/components/badge";
import { Button } from "@camp404/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@camp404/ui/components/card";
import { useConfirm } from "@camp404/ui/components/confirm-dialog";
import { EmptyState } from "@camp404/ui/components/empty-state";
import { InputField } from "@camp404/ui/components/input-field";
import { Label } from "@camp404/ui/components/label";
import {
  ResponsiveDataTable,
  type ResponsiveColumn,
} from "@camp404/ui/components/responsive-data-table";
import { Textarea } from "@camp404/ui/components/textarea";
import { toast } from "@camp404/ui/components/toast";
import { recordPaymentAction, setPaymentStatusAction } from "./actions";

// The payments ledger island: record a payment, and move one between pending,
// received and waived. Every write goes through the captain-gated actions and
// the page re-renders from the server.
//
// Feedback, as on every captain screen: a refused payment shows inline on the
// form; a failed one-tap move on a ledger row is a toast. Only the control that
// was used spins, and no second change starts while one runs.
//
// Money is in rands only (owner's call, 2026-09-24), so the "Dues paid" card's
// totals are plain rand totals.

export interface LedgerMember {
  id: string;
  name: string;
  /** Settled for the year already (a received or waived payment). */
  duesPaid: boolean;
}

const STATUS: Record<
  PaymentStatus,
  { label: string; variant: "warning" | "success" | "secondary" }
> = {
  pending: { label: "Pending", variant: "warning" },
  reconciled: { label: "Received", variant: "success" },
  waived: { label: "Waived", variant: "secondary" },
};

const STATUS_CHOICES: { value: PaymentStatus; label: string }[] = [
  { value: "reconciled", label: "Received: I can see it in the bank" },
  { value: "pending", label: "Pending: promised, not in the bank yet" },
  { value: "waived", label: "Waived: they don't have to pay" },
];

const when = new Intl.DateTimeFormat("en-ZA", {
  dateStyle: "medium",
  timeZone: CAMP_TIME_ZONE,
});

/** This year's rows with one status, and their rand total in cents. */
function totalOf(payments: readonly PaymentRow[], status: PaymentStatus) {
  const rows = payments.filter((p) => p.status === status);
  return {
    count: rows.length,
    cents: sumMinor(rows.map((p) => p.amountCents)),
  };
}

const selectClass =
  "h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50";

export function PaymentsManager({
  yearLabel,
  members,
  payments,
}: {
  yearLabel: string;
  members: LedgerMember[];
  payments: PaymentRow[];
}) {
  const router = useRouter();
  const [recording, startRecord] = useTransition();
  // A one-tap move on a ledger row: which payment, and which button spins.
  const [moving, startMove] = useTransition();
  const [busy, setBusy] = useState<{ id: string; to: PaymentStatus } | null>(
    null,
  );
  const pending = recording || moving;
  const [confirm, confirmDialog] = useConfirm();
  const [userId, setUserId] = useState("");
  const [amount, setAmount] = useState("");
  const [status, setStatus] = useState<PaymentStatus>("reconciled");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const paid = readRate(
    members.filter((m) => m.duesPaid).length,
    members.length,
  );
  // Received counts only money seen in the bank: a waived payment settles dues
  // but brings nothing in, and a pending one has not arrived.
  const received = totalOf(payments, "reconciled");
  const promised = totalOf(payments, "pending");

  function record() {
    setError(null);
    startRecord(async () => {
      const res = await recordPaymentAction({ userId, amount, status, note });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      toast.success(`Recorded ${res.reference ?? "the payment"}`);
      setUserId("");
      setAmount("");
      setNote("");
      router.refresh();
    });
  }

  async function move(payment: PaymentRow, to: PaymentStatus) {
    if (to === "pending") {
      const sure = await confirm({
        title: "Put this payment back to pending?",
        description: `${payment.reference} stops counting toward ${payment.memberName ?? "the member"}'s dues until it is received or waived again.`,
        confirmLabel: "Back to pending",
      });
      if (!sure) return;
    }
    setBusy({ id: payment.id, to });
    startMove(async () => {
      const res = await setPaymentStatusAction({
        paymentId: payment.id,
        from: payment.status,
        to,
      });
      if (!res.ok) toast.error(res.error);
      router.refresh();
    });
  }

  const spins = (payment: PaymentRow, to: PaymentStatus) =>
    moving && busy?.id === payment.id && busy.to === to ? (
      <Loader2 className="animate-spin" aria-hidden />
    ) : null;

  const columns: ResponsiveColumn<PaymentRow>[] = [
    {
      id: "member",
      header: "Member",
      role: "title",
      cellClassName: "whitespace-normal",
      cell: (p) => (
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="font-medium">
            {p.memberName ?? "A former member"}
          </span>
          <span className="font-mono text-xs text-muted-foreground">
            {p.reference}
          </span>
          {p.note && (
            <span className="max-w-xs whitespace-pre-line text-xs font-normal text-muted-foreground">
              {p.note}
            </span>
          )}
        </span>
      ),
    },
    {
      id: "status",
      header: "Status",
      role: "badge",
      cell: (p) => (
        <Badge variant={STATUS[p.status].variant}>
          {STATUS[p.status].label}
        </Badge>
      ),
    },
    {
      id: "amount",
      header: "Amount",
      align: "right",
      cellClassName: "whitespace-nowrap font-medium tabular-nums",
      cell: (p) => formatMoney(p.amountCents, p.currency),
    },
    {
      id: "recorded",
      header: "Recorded",
      cell: (p) => (
        <span className="flex flex-col">
          <span>{p.recordedByName ?? "a former captain"}</span>
          <span className="text-xs tabular-nums text-muted-foreground">
            {when.format(new Date(p.createdAt))}
          </span>
        </span>
      ),
    },
    {
      id: "actions",
      header: "Actions",
      role: "actions",
      hideHeader: true,
      align: "right",
      cell: (p) =>
        p.status === "pending" ? (
          <span className="flex justify-end gap-2">
            <Button
              type="button"
              size="sm"
              disabled={pending}
              onClick={() => void move(p, "reconciled")}
            >
              {spins(p, "reconciled")}
              Mark received
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() => void move(p, "waived")}
            >
              {spins(p, "waived")}
              Waive
            </Button>
          </span>
        ) : (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={pending}
            onClick={() => void move(p, "pending")}
          >
            {spins(p, "pending")}
            Back to pending
          </Button>
        ),
    },
  ];

  return (
    <div className="grid items-start gap-6 page-lg:grid-cols-3">
      {confirmDialog}

      <section
        aria-labelledby="payments-ledger-heading"
        className="flex min-w-0 flex-col gap-3 page-lg:col-span-2"
      >
        <h2
          id="payments-ledger-heading"
          className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground"
        >
          Payments for {yearLabel}
        </h2>
        {payments.length === 0 ? (
          <EmptyState
            icon={<Wallet aria-hidden />}
            title="No payments recorded yet."
            description="Record one from the bank statement and it shows here, with its reference and who recorded it."
          />
        ) : (
          <ResponsiveDataTable
            columns={columns}
            data={payments}
            getRowKey={(p) => p.id}
            label={`Payments for ${yearLabel}`}
            className="md:rounded-xl md:border md:bg-card md:shadow-sm"
          />
        )}
      </section>

      <aside className="flex flex-col gap-6">
        <Card>
          <CardContent className="flex flex-col gap-2 p-5">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Dues paid
            </span>
            <span className="text-3xl font-bold tabular-nums">
              {paid.read}
              <span className="text-base font-medium text-muted-foreground">
                {" "}
                / {paid.of}
              </span>
            </span>
            <div
              className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
              role="progressbar"
              aria-valuenow={paid.percent}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Members who have paid"
            >
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${paid.percent}%` }}
              />
            </div>
            <p role="status" className="text-xs text-muted-foreground">
              {paid.read} of {paid.of} members have paid for {yearLabel}.
            </p>
            <div className="mt-1 flex flex-col gap-1 border-t border-border pt-3 text-sm">
              <p role="status">
                <span className="text-muted-foreground">Received: </span>
                <span className="font-medium tabular-nums">
                  {formatMoney(received.cents)}
                </span>
              </p>
              {promised.count > 0 && (
                <p role="status">
                  <span className="text-muted-foreground">Pending: </span>
                  <span className="font-medium tabular-nums">
                    {formatMoney(promised.cents)}
                  </span>
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="p-5 pb-4">
            <CardTitle className="text-base">Record a payment</CardTitle>
            <CardDescription>
              What the bank statement shows, against the member who paid.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4 p-5 pt-0">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="payment-member">Member</Label>
              <select
                id="payment-member"
                className={selectClass}
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                disabled={pending}
              >
                <option value="">Pick the member who paid</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.duesPaid ? `${m.name} (paid)` : m.name}
                  </option>
                ))}
              </select>
            </div>
            <InputField
              label="Amount (R)"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.currentTarget.value)}
              placeholder="1250"
              disabled={pending}
            />
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="payment-status">Status</Label>
              <select
                id="payment-status"
                className={selectClass}
                value={status}
                onChange={(e) => setStatus(e.target.value as PaymentStatus)}
                disabled={pending}
              >
                {STATUS_CHOICES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="payment-note">Note (optional)</Label>
              <Textarea
                id="payment-note"
                value={note}
                onChange={(e) => setNote(e.currentTarget.value)}
                rows={2}
                maxLength={500}
                disabled={pending}
                placeholder="What the bank statement says"
              />
            </div>
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <Button
              type="button"
              className="w-full"
              disabled={pending || !userId || !amount.trim()}
              onClick={record}
            >
              {recording && <Loader2 className="animate-spin" aria-hidden />}
              Record payment
            </Button>
          </CardContent>
        </Card>
      </aside>
    </div>
  );
}
