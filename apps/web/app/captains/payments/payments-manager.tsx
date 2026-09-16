"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CAMP_TIME_ZONE, formatRands, type PaymentStatus } from "@camp404/core";
import type { PaymentRow } from "@camp404/db/payments";
import { Badge } from "@camp404/ui/components/badge";
import { Button } from "@camp404/ui/components/button";
import { Card } from "@camp404/ui/components/card";
import { useConfirm } from "@camp404/ui/components/confirm-dialog";
import { InputField } from "@camp404/ui/components/input-field";
import { Label } from "@camp404/ui/components/label";
import { Spinner } from "@camp404/ui/components/spinner";
import { Textarea } from "@camp404/ui/components/textarea";
import { toast } from "@camp404/ui/components/toast";
import { recordPaymentAction, setPaymentStatusAction } from "./actions";

// The payments ledger island: record a payment, and move one between pending,
// received and waived. Every write goes through the captain-gated actions and
// the page re-renders from the server.

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

const selectClass =
  "h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

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
  const [pending, startTransition] = useTransition();
  const [confirm, confirmDialog] = useConfirm();
  const [userId, setUserId] = useState("");
  const [amount, setAmount] = useState("");
  const [status, setStatus] = useState<PaymentStatus>("reconciled");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const paid = members.filter((m) => m.duesPaid).length;

  function record() {
    setError(null);
    startTransition(async () => {
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
    startTransition(async () => {
      const res = await setPaymentStatusAction({
        paymentId: payment.id,
        from: payment.status,
        to,
      });
      if (!res.ok) toast.error(res.error);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-5">
      {confirmDialog}
      <p role="status" className="font-mono text-caption text-muted-foreground">
        {paid} of {members.length} members have paid for {yearLabel}.
      </p>

      <Card className="flex flex-col gap-4 p-4">
        <h2 className="text-base font-semibold">Record a payment</h2>
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
          className="self-start"
          disabled={pending || !userId || !amount.trim()}
          onClick={record}
        >
          {pending && <Spinner size="sm" />}
          Record payment
        </Button>
      </Card>

      <div className="flex flex-col gap-2">
        <h2 className="text-base font-semibold">Payments for {yearLabel}</h2>
        {payments.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No payments recorded yet.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {payments.map((payment) => {
              const badge = STATUS[payment.status];
              return (
                <li key={payment.id}>
                  <Card className="flex flex-col gap-2 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 flex-col gap-0.5">
                        <span className="font-semibold">
                          {payment.memberName ?? "A former member"}
                        </span>
                        <span className="font-mono text-caption text-muted-foreground">
                          {payment.reference}
                        </span>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <span className="font-mono text-sm font-semibold">
                          {formatRands(payment.amountCents)}
                        </span>
                        <Badge variant={badge.variant}>{badge.label}</Badge>
                      </div>
                    </div>
                    {payment.note && (
                      <p className="whitespace-pre-line text-sm text-muted-foreground">
                        {payment.note}
                      </p>
                    )}
                    <p className="font-mono text-caption text-muted-foreground">
                      Recorded by {payment.recordedByName ?? "a former captain"}{" "}
                      · {when.format(new Date(payment.createdAt))}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {payment.status === "pending" ? (
                        <>
                          <Button
                            type="button"
                            size="sm"
                            disabled={pending}
                            onClick={() => void move(payment, "reconciled")}
                          >
                            Mark received
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={pending}
                            onClick={() => void move(payment, "waived")}
                          >
                            Waive
                          </Button>
                        </>
                      ) : (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          disabled={pending}
                          onClick={() => void move(payment, "pending")}
                        >
                          Back to pending
                        </Button>
                      )}
                    </div>
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
