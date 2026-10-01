"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  FileText,
  HandCoins,
  Loader2,
  Plus,
  Undo2,
  Wallet,
} from "lucide-react";
import {
  CAMP_TIME_ZONE,
  formatMoney,
  PAYMENT_METHOD_LABELS,
  REFUND_STATUS_LABELS,
  type PaymentStatus,
} from "@camp404/core";
import type { PaymentRow } from "@camp404/db/payments";
import { Badge } from "@camp404/ui/components/badge";
import { Button } from "@camp404/ui/components/button";
import { useConfirm } from "@camp404/ui/components/confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@camp404/ui/components/dialog";
import { EmptyState } from "@camp404/ui/components/empty-state";
import { InputField } from "@camp404/ui/components/input-field";
import { Label } from "@camp404/ui/components/label";
import {
  ResponsiveDataTable,
  type ResponsiveColumn,
} from "@camp404/ui/components/responsive-data-table";
import { RowActions } from "@camp404/ui/components/row-actions";
import { Textarea } from "@camp404/ui/components/textarea";
import { toast } from "@camp404/ui/components/toast";
import { memberDuesPath, paymentProofPath } from "@/lib/dues-copy";
import { financeStatusWords, formatDay, SOURCE_WORDS } from "@/lib/dues-view";
import { recordPaymentAction, setPaymentStatusAction } from "./actions";

// The payments ledger island: the year's payments as a table, and recording
// one. A payment a member sent in carries its proof file, opened through the
// audited proof route. Every write goes through the Finance-gated actions and
// the page re-renders from the server.
//
// Each row keeps its buttons in one place (RowActions): "Mark received" is the
// one main button, on a payment not yet in the bank; the quieter move sits in
// a fixed slot on the far right of every row: "Excuse this amount" on a
// payment not in the bank, "Back to pending" on one that is. Both ask first,
// and the excuse names the money, because it settles a member's dues with no
// money coming in.
//
// Feedback, as on every captain screen: a refused payment shows inline in the
// record dialog; a failed one-tap move on a ledger row is a toast. Only the
// control that was used spins, and no second move starts while one runs.

export interface LedgerMember {
  id: string;
  name: string;
  /** Settled for the year already (a received or waived payment). */
  duesPaid: boolean;
}

const STATUS_CHOICES: { value: PaymentStatus; label: string }[] = [
  { value: "reconciled", label: "In the bank: I can see it" },
  { value: "pending", label: "Promised: not in the bank yet" },
  { value: "waived", label: "Excused: they don't have to pay it" },
];

const when = new Intl.DateTimeFormat("en-ZA", {
  dateStyle: "medium",
  timeZone: CAMP_TIME_ZONE,
});

const selectClass =
  "h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50";

/** "Record a payment": the page's main button, with its form in a dialog. */
export function RecordPaymentDialog({ members }: { members: LedgerMember[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [recording, startRecord] = useTransition();
  const [userId, setUserId] = useState("");
  const [amount, setAmount] = useState("");
  const [status, setStatus] = useState<PaymentStatus>("reconciled");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

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
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setError(null);
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" size="sm">
          <Plus aria-hidden />
          Record a payment
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg max-sm:h-[100dvh] max-sm:max-h-[100dvh] max-sm:max-w-full max-sm:rounded-none max-sm:border-0">
        <DialogHeader>
          <DialogTitle>Record a payment</DialogTitle>
          <DialogDescription>
            What the bank statement shows, against the member who paid.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="payment-member">Member</Label>
            <select
              id="payment-member"
              className={selectClass}
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              disabled={recording}
            >
              <option value="">Pick the member who paid</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.duesPaid ? `${m.name} (paid)` : m.name}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-4 sm:grid-cols-[10rem_minmax(0,1fr)]">
            <InputField
              label="Amount (R)"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.currentTarget.value)}
              disabled={recording}
            />
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="payment-status">Status</Label>
              <select
                id="payment-status"
                className={selectClass}
                value={status}
                onChange={(e) => setStatus(e.target.value as PaymentStatus)}
                disabled={recording}
              >
                {STATUS_CHOICES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="payment-note">Note (optional)</Label>
            <Textarea
              id="payment-note"
              value={note}
              onChange={(e) => setNote(e.currentTarget.value)}
              rows={2}
              maxLength={500}
              disabled={recording}
            />
            <p className="text-xs text-muted-foreground">
              What the bank statement says, for example.
            </p>
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <Button
            type="button"
            className="self-start"
            disabled={recording || !userId || !amount.trim()}
            onClick={record}
          >
            {recording && <Loader2 className="animate-spin" aria-hidden />}
            Record payment
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function PaymentsManager({
  yearLabel,
  payments,
}: {
  yearLabel: string;
  payments: PaymentRow[];
}) {
  const router = useRouter();
  // A one-tap move on a ledger row: which payment, and which button spins.
  const [moving, startMove] = useTransition();
  const [busy, setBusy] = useState<{ id: string; to: PaymentStatus } | null>(
    null,
  );
  const [confirm, confirmDialog] = useConfirm();

  async function move(payment: PaymentRow, to: PaymentStatus) {
    const who = payment.memberName ?? "the member";
    const amount = formatMoney(payment.amountCents, payment.currency);
    if (to === "pending") {
      const sure = await confirm({
        title: "Put this payment back to pending?",
        description: `${amount} stops counting toward ${who}'s dues until it is in the bank or excused again.`,
        confirmLabel: "Back to pending",
      });
      if (!sure) return;
    }
    if (to === "waived") {
      const sure = await confirm({
        title: `Excuse ${amount}?`,
        description: `${who} won't have to pay it: it counts toward their dues as paid, and no money comes in. Only do this when the camp has agreed to let them off.`,
        confirmLabel: `Excuse ${amount}`,
        destructive: true,
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
    moving && busy?.id === payment.id && busy.to === to;

  const columns: ResponsiveColumn<PaymentRow>[] = [
    {
      id: "member",
      header: "Member",
      role: "title",
      cellClassName: "whitespace-normal",
      cell: (p) => (
        <span className="flex min-w-0 flex-col gap-0.5">
          <Link
            href={memberDuesPath(p.userId)}
            className="font-medium hover:text-accent"
          >
            {p.memberName ?? "A former member"}
          </Link>
          <span className="whitespace-nowrap font-mono text-xs font-normal tracking-normal text-muted-foreground">
            Receipt no. {p.reference}
          </span>
          {(p.source !== "captain" || p.method || p.paidOn) && (
            <span className="text-xs font-normal text-muted-foreground">
              {[
                p.source !== "captain" ? SOURCE_WORDS[p.source] : null,
                p.method ? PAYMENT_METHOD_LABELS[p.method] : null,
                p.paidOn ? `paid ${formatDay(p.paidOn)}` : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </span>
          )}
          {p.note && (
            <span className="whitespace-pre-line text-xs font-normal text-muted-foreground">
              {p.note}
            </span>
          )}
          {(p.hasProof || p.refundStatus) && (
            <span className="mt-1 flex flex-wrap items-center gap-2">
              {p.hasProof && (
                <a
                  href={paymentProofPath(p.id)}
                  target="_blank"
                  rel="noopener"
                  className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline"
                >
                  <FileText className="h-3.5 w-3.5" aria-hidden />
                  Proof of payment
                </a>
              )}
              {p.refundStatus && (
                <Badge variant="outline">
                  {REFUND_STATUS_LABELS[p.refundStatus]}
                </Badge>
              )}
            </span>
          )}
        </span>
      ),
    },
    {
      id: "status",
      header: "Status",
      role: "badge",
      headClassName: "w-32",
      cell: (p) => {
        const words = financeStatusWords(p.status, p.source);
        return <Badge variant={words.variant}>{words.label}</Badge>;
      },
    },
    {
      id: "amount",
      header: "Amount",
      align: "right",
      headClassName: "w-32",
      cellClassName: "whitespace-nowrap font-medium tabular-nums",
      cell: (p) => formatMoney(p.amountCents, p.currency),
    },
    {
      id: "recorded",
      header: "Recorded",
      headClassName: "w-44",
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
      cell: (p) => (
        <RowActions
          label={`Actions for ${p.reference}`}
          primary={
            p.status === "pending" ? (
              <Button
                type="button"
                size="sm"
                disabled={moving}
                onClick={() => void move(p, "reconciled")}
              >
                {spins(p, "reconciled") && (
                  <Loader2 className="animate-spin" aria-hidden />
                )}
                Mark received
              </Button>
            ) : null
          }
          secondary={
            p.status === "pending" ? (
              <Button
                type="button"
                size="icon"
                variant="ghost"
                aria-label="Excuse this amount"
                title="Excuse this amount"
                disabled={moving}
                onClick={() => void move(p, "waived")}
              >
                {spins(p, "waived") ? (
                  <Loader2 className="animate-spin" aria-hidden />
                ) : (
                  <HandCoins aria-hidden />
                )}
              </Button>
            ) : (
              <Button
                type="button"
                size="icon"
                variant="ghost"
                aria-label="Back to pending"
                title="Back to pending"
                disabled={moving}
                onClick={() => void move(p, "pending")}
              >
                {spins(p, "pending") ? (
                  <Loader2 className="animate-spin" aria-hidden />
                ) : (
                  <Undo2 aria-hidden />
                )}
              </Button>
            )
          }
        />
      ),
    },
  ];

  return (
    <section
      aria-labelledby="payments-ledger-heading"
      className="flex min-w-0 flex-col gap-3"
    >
      {confirmDialog}
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
          description="Record one from the bank statement and it shows here, with its receipt number and who recorded it."
        />
      ) : (
        <ResponsiveDataTable
          columns={columns}
          data={payments}
          getRowKey={(p) => p.id}
          label={`Payments for ${yearLabel}`}
          framed
        />
      )}
    </section>
  );
}
