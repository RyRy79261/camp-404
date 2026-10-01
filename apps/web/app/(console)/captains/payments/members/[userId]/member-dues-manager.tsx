"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  FileText,
  HandCoins,
  Loader2,
  Plus,
  RotateCcw,
  Trash2,
  X,
} from "lucide-react";
import {
  CHARGE_KIND_LABELS,
  formatMoney,
  PAYMENT_METHOD_LABELS,
  parseMoneyToMinor,
  paymentFigures,
  proposeRefund,
  REFUND_STATUS_LABELS,
  sumMinor,
  type RefundSchedule,
} from "@camp404/core";
import type { DuesPaymentRow, FeeTier, MemberDues } from "@camp404/db/dues";
import { MAX_INSTALMENTS } from "@camp404/types";
import { Badge } from "@camp404/ui/components/badge";
import { Button } from "@camp404/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@camp404/ui/components/card";
import {
  ConfirmDialog,
  useConfirm,
} from "@camp404/ui/components/confirm-dialog";
import { DateControl } from "@camp404/ui/components/date-control";
import { InputField } from "@camp404/ui/components/input-field";
import { Label } from "@camp404/ui/components/label";
import { RowActions } from "@camp404/ui/components/row-actions";
import { Textarea } from "@camp404/ui/components/textarea";
import { toast } from "@camp404/ui/components/toast";
import { paymentProofPath } from "@/lib/dues-copy";
import {
  balanceSentence,
  chargeSubline,
  financeStatusWords,
  formatDay,
  SOURCE_WORDS,
  typedRands,
} from "@/lib/dues-view";
import { setPaymentStatusAction } from "../../actions";
import {
  addChargeAction,
  cancelChargeAction,
  decideRefundAction,
  requestRefundAction,
  setFeeAction,
  setPaymentPlanAction,
} from "../../dues-actions";

// One member's dues, for the Finance team (#240), laid out like AfrikaBurn's
// registration review: what Finance came to read on the left (the balance
// first, then payments and charges as lists), and the forms in a 360px rail
// on the right (camp fee, a new charge, the payment plan). In a narrow window
// the rail goes under the lists, so the balance still comes first. Typing
// problems show beside the field; a one-tap change on a row (cancel a charge,
// mark a payment received) reports a failure as a toast, and only that
// control spins. A payment row keeps its main button and its quiet move in
// fixed slots (RowActions); excusing a payment asks first and names the
// money. Every write goes through the Finance-gated actions, and the page
// re-renders from the server.

const selectClass =
  "h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50";

const TYPE_AMOUNT = "Type the amount in rands, like 1250 or 1250,50.";

/** One figure under the balance: its label over its amount. */
function Row({ label, value }: { label: string; value: string }) {
  return (
    <div
      role="group"
      aria-label={label}
      className="flex min-w-0 flex-col gap-0.5"
    >
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="text-sm font-medium tabular-nums">{value}</dd>
    </div>
  );
}

export function MemberDuesManager({
  dues,
  tiers,
  schedule,
  today,
}: {
  dues: MemberDues;
  tiers: FeeTier[];
  schedule: RefundSchedule;
  today: string;
}) {
  const router = useRouter();
  const [confirm, confirmDialog] = useConfirm();
  // One-tap row changes: which control spins.
  const [rowBusy, setRowBusy] = useState<string | null>(null);
  const [rowPending, startRow] = useTransition();

  const liveFee = dues.charges.find((c) => c.kind === "fee" && !c.cancelled);

  // --- Camp fee -----------------------------------------------------------------
  const [feeAmount, setFeeAmount] = useState(
    liveFee
      ? typedRands(liveFee.amountCents)
      : dues.pledge
        ? typedRands(dues.pledge.amountCents)
        : "",
  );
  const [feeReason, setFeeReason] = useState(liveFee?.concessionReason ?? "");
  // "Change fee" is the main button only once something was changed.
  const feeDirty =
    !liveFee ||
    parseMoneyToMinor(feeAmount) !== liveFee.amountCents ||
    feeReason.trim() !== (liveFee.concessionReason ?? "").trim();
  const [feeError, setFeeError] = useState<string | null>(null);
  const [feePending, startFee] = useTransition();

  function saveFee() {
    setFeeError(null);
    const cents = parseMoneyToMinor(feeAmount);
    if (cents === null || cents <= 0) {
      setFeeError(TYPE_AMOUNT);
      return;
    }
    startFee(async () => {
      const res = await setFeeAction({
        userId: dues.userId,
        amountCents: cents,
        concessionReason: feeReason,
        expectedFeeId: liveFee?.id ?? null,
      });
      if (!res.ok) {
        setFeeError(res.error);
        return;
      }
      toast.success("Camp fee saved");
      router.refresh();
    });
  }

  // --- A new charge ---------------------------------------------------------------
  const [chargeKind, setChargeKind] = useState<"rental" | "other">("rental");
  const [chargeText, setChargeText] = useState("");
  const [chargeAmount, setChargeAmount] = useState("");
  const [chargeError, setChargeError] = useState<string | null>(null);
  const [chargePending, startCharge] = useTransition();

  function addCharge() {
    setChargeError(null);
    const cents = parseMoneyToMinor(chargeAmount);
    if (cents === null || cents <= 0) {
      setChargeError(TYPE_AMOUNT);
      return;
    }
    startCharge(async () => {
      const res = await addChargeAction({
        userId: dues.userId,
        kind: chargeKind,
        description: chargeText,
        amountCents: cents,
      });
      if (!res.ok) {
        setChargeError(res.error);
        return;
      }
      toast.success("Charge added");
      setChargeText("");
      setChargeAmount("");
      router.refresh();
    });
  }

  async function cancelCharge(id: string, description: string) {
    const sure = await confirm({
      title: "Cancel this charge?",
      description: `"${description}" comes off ${dues.name}'s balance. It stays in the list, crossed out.`,
      confirmLabel: "Cancel the charge",
      cancelLabel: "Keep it",
      destructive: true,
    });
    if (!sure) return;
    setRowBusy(`charge:${id}`);
    startRow(async () => {
      const res = await cancelChargeAction({ chargeId: id });
      if (!res.ok) toast.error(res.error);
      router.refresh();
    });
  }

  // --- Payments and refunds --------------------------------------------------------------
  async function movePayment(p: DuesPaymentRow, to: "reconciled" | "waived") {
    if (to === "waived") {
      const amount = formatMoney(p.amountCents);
      const sure = await confirm({
        title: `Excuse ${amount}?`,
        description: `${dues.name} won't have to pay it: it counts toward their dues as paid, and no money comes in. Only do this when the camp has agreed to let them off.`,
        confirmLabel: `Excuse ${amount}`,
        destructive: true,
      });
      if (!sure) return;
    }
    setRowBusy(`payment:${p.id}:${to}`);
    startRow(async () => {
      const res = await setPaymentStatusAction({
        paymentId: p.id,
        from: p.status,
        to,
      });
      if (!res.ok) toast.error(res.error);
      router.refresh();
    });
  }

  type RefundDialog =
    | { kind: "request"; payment: DuesPaymentRow }
    | { kind: "refunded"; payment: DuesPaymentRow; refundId: string }
    | { kind: "declined"; payment: DuesPaymentRow; refundId: string };
  const [dialog, setDialog] = useState<RefundDialog | null>(null);
  const [dialogAmount, setDialogAmount] = useState("");
  const [dialogText, setDialogText] = useState("");
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [dialogPending, startDialog] = useTransition();

  const withdrewOn = dues.participation?.withdrewOn ?? null;

  function openRefund(payment: DuesPaymentRow) {
    const proposal = proposeRefund(
      payment.amountCents,
      withdrewOn ?? today,
      schedule,
    );
    setDialog({ kind: "request", payment });
    setDialogAmount(typedRands(proposal.amountCents ?? payment.amountCents));
    setDialogText("");
    setDialogError(null);
  }

  function openDecision(
    payment: DuesPaymentRow,
    kind: "refunded" | "declined",
  ) {
    if (!payment.refund) return;
    setDialog({ kind, payment, refundId: payment.refund.id });
    setDialogAmount(typedRands(payment.refund.amountCents));
    setDialogText("");
    setDialogError(null);
  }

  function confirmDialogAction() {
    if (!dialog) return;
    setDialogError(null);
    const cents = parseMoneyToMinor(dialogAmount);
    if (dialog.kind !== "declined" && (cents === null || cents <= 0)) {
      setDialogError(TYPE_AMOUNT);
      return;
    }
    startDialog(async () => {
      const res =
        dialog.kind === "request"
          ? await requestRefundAction({
              paymentId: dialog.payment.id,
              amountCents: cents,
              note: dialogText,
            })
          : dialog.kind === "refunded"
            ? await decideRefundAction({
                refundId: dialog.refundId,
                to: "refunded",
                amountCents: cents,
              })
            : await decideRefundAction({
                refundId: dialog.refundId,
                to: "declined",
                reason: dialogText,
              });
      if (!res.ok) {
        setDialogError(res.error);
        return;
      }
      toast.success(
        dialog.kind === "request"
          ? "Refund asked for"
          : dialog.kind === "refunded"
            ? "Refund recorded"
            : "Refund declined",
      );
      setDialog(null);
      router.refresh();
    });
  }

  const proposalLine = (() => {
    if (dialog?.kind !== "request") return null;
    const proposal = proposeRefund(
      dialog.payment.amountCents,
      withdrewOn ?? today,
      schedule,
    );
    const when = withdrewOn
      ? `They said they're not coming on ${formatDay(withdrewOn)}`
      : `Worked out for today, ${formatDay(today)}`;
    switch (proposal.rule) {
      case "full":
        return `${when}: a full refund.`;
      case "partial":
        return `${when}: ${schedule.partialRefundPct}% back.`;
      case "none":
        return `${when}: past the last refund day, so nothing back.`;
      default:
        return "No refund schedule is set for this year, so check the amount.";
    }
  })();

  // --- Payment plan -------------------------------------------------------------------
  const [plan, setPlan] = useState(
    dues.instalments.map((i) => ({
      dueOn: i.dueOn,
      amount: typedRands(i.amountCents),
    })),
  );
  const [planError, setPlanError] = useState<string | null>(null);
  const [planPending, startPlan] = useTransition();

  function savePlan() {
    setPlanError(null);
    const instalments: { dueOn: string; amountCents: number }[] = [];
    for (const row of plan) {
      const cents = parseMoneyToMinor(row.amount);
      if (!row.dueOn) {
        setPlanError("Give each instalment a date.");
        return;
      }
      if (cents === null || cents <= 0) {
        setPlanError(TYPE_AMOUNT);
        return;
      }
      instalments.push({ dueOn: row.dueOn, amountCents: cents });
    }
    startPlan(async () => {
      const res = await setPaymentPlanAction({
        userId: dues.userId,
        instalments,
        expectedVersion: dues.planVersion,
      });
      if (!res.ok) {
        setPlanError(res.error);
        return;
      }
      toast.success(instalments.length > 0 ? "Plan saved" : "Plan removed");
      router.refresh();
    });
  }

  const planDirty =
    JSON.stringify(plan) !==
    JSON.stringify(
      dues.instalments.map((i) => ({
        dueOn: i.dueOn,
        amount: typedRands(i.amountCents),
      })),
    );
  const figures = paymentFigures(dues.payments);
  const planTotal = sumMinor(
    plan.map((row) => parseMoneyToMinor(row.amount) ?? 0),
  );
  const busy = (key: string) =>
    rowPending && rowBusy === key ? (
      <Loader2 className="animate-spin" aria-hidden />
    ) : null;
  const anyPending =
    rowPending || feePending || chargePending || planPending || dialogPending;

  return (
    <div className="flex flex-col gap-6 page-lg:flex-row page-lg:items-start">
      {confirmDialog}
      <ConfirmDialog
        open={dialog !== null}
        onOpenChange={(open) => !open && setDialog(null)}
        title={
          dialog?.kind === "request"
            ? "Ask for a refund"
            : dialog?.kind === "refunded"
              ? "Record the refund as paid"
              : "Decline the refund"
        }
        description={
          dialog?.kind === "request"
            ? `Of ${dialog.payment.reference}, ${formatMoney(dialog.payment.amountCents)}.`
            : dialog?.kind === "refunded"
              ? "Once the money has gone back to them. It counts against what they've paid."
              : "Say why. They see the reason on their dues page."
        }
        confirmLabel={
          dialog?.kind === "request"
            ? "Ask for the refund"
            : dialog?.kind === "refunded"
              ? "Mark refunded"
              : "Decline"
        }
        destructive={dialog?.kind === "declined"}
        pending={dialogPending}
        error={dialogError}
        onConfirm={confirmDialogAction}
      >
        <div className="flex flex-col gap-4">
          {proposalLine && (
            <p className="text-sm text-muted-foreground">{proposalLine}</p>
          )}
          {dialog?.kind !== "declined" ? (
            <InputField
              label="Refund (R)"
              inputMode="decimal"
              value={dialogAmount}
              onChange={(e) => setDialogAmount(e.currentTarget.value)}
              disabled={dialogPending}
            />
          ) : null}
          {dialog?.kind !== "refunded" ? (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="refund-text">
                {dialog?.kind === "declined" ? "Reason" : "Note (optional)"}
              </Label>
              <Textarea
                id="refund-text"
                rows={2}
                maxLength={500}
                value={dialogText}
                onChange={(e) => setDialogText(e.currentTarget.value)}
                disabled={dialogPending}
              />
            </div>
          ) : null}
        </div>
      </ConfirmDialog>

      <div className="flex min-w-0 flex-1 flex-col gap-6">
        <Card>
          <CardHeader className="p-5 pb-3">
            <CardTitle className="text-base">Balance</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 p-5 pt-0">
            <span className="text-3xl font-bold tabular-nums">
              {formatMoney(Math.abs(dues.balance.balanceCents))}
            </span>
            <p role="status" className="text-sm text-muted-foreground">
              {balanceSentence(dues.balance)
                .replace(/^You owe/, "Owes")
                .replace(/^The camp owes you/, "The camp owes them")
                .replace(/^You're paid up/, "Paid up")}
            </p>
            <dl className="mt-1 grid grid-cols-2 gap-x-6 gap-y-3 border-t border-border pt-3 page-sm:grid-cols-4">
              <Row
                label="Charged"
                value={formatMoney(dues.balance.chargedCents)}
              />
              <Row
                label="In the bank"
                value={formatMoney(figures.inBankCents)}
              />
              {figures.excusedCents > 0 && (
                <Row
                  label="Excused"
                  value={formatMoney(figures.excusedCents)}
                />
              )}
              {figures.toCheckCents > 0 && (
                <Row
                  label="Proofs to check"
                  value={formatMoney(figures.toCheckCents)}
                />
              )}
              {figures.promisedCents > 0 && (
                <Row
                  label="Promised"
                  value={formatMoney(figures.promisedCents)}
                />
              )}
              {dues.balance.refundedCents > 0 && (
                <Row
                  label="Refunded"
                  value={formatMoney(dues.balance.refundedCents)}
                />
              )}
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="p-5 pb-3">
            <CardTitle className="text-base">Payments</CardTitle>
            <CardDescription>
              What they paid this year, newest first.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-5 pt-0">
            {dues.payments.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No payments yet this year.
              </p>
            ) : (
              <ul aria-label="Payments" className="divide-y divide-border">
                {dues.payments.map((p) => {
                  const words = financeStatusWords(p.status, p.source);
                  const refundable =
                    p.status === "reconciled" &&
                    (!p.refund || p.refund.status === "declined");
                  return (
                    <li
                      key={p.id}
                      className="flex flex-col gap-2 py-3 page-sm:flex-row page-sm:items-start page-sm:justify-between"
                    >
                      <span className="flex min-w-0 flex-col gap-0.5">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="font-medium tabular-nums">
                            {formatMoney(p.amountCents)}
                          </span>
                          <Badge variant={words.variant}>{words.label}</Badge>
                          {p.refund && (
                            <Badge
                              variant={
                                p.refund.status === "declined"
                                  ? "outline"
                                  : "secondary"
                              }
                            >
                              {REFUND_STATUS_LABELS[p.refund.status]}
                              {p.refund.status !== "declined"
                                ? ` · ${formatMoney(p.refund.amountCents)}`
                                : ""}
                            </Badge>
                          )}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {[
                            SOURCE_WORDS[p.source],
                            p.method ? PAYMENT_METHOD_LABELS[p.method] : null,
                            p.paidOn ? `paid ${formatDay(p.paidOn)}` : null,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                        <span className="font-mono text-xs tracking-normal text-muted-foreground">
                          Receipt no. {p.reference}
                        </span>
                        {p.note && (
                          <span className="whitespace-pre-line text-xs text-muted-foreground">
                            {p.note}
                          </span>
                        )}
                        {p.refund?.note && (
                          <span className="text-xs text-muted-foreground">
                            Their note: {p.refund.note}
                          </span>
                        )}
                        {p.hasProof && (
                          <a
                            href={paymentProofPath(p.id)}
                            target="_blank"
                            rel="noopener"
                            className="mt-1 inline-flex items-center gap-1 self-start text-xs font-medium text-accent hover:underline"
                          >
                            <FileText className="h-3.5 w-3.5" aria-hidden />
                            Proof of payment
                          </a>
                        )}
                      </span>
                      <RowActions
                        label={`Actions for ${p.reference}`}
                        className="page-sm:justify-end"
                        primary={
                          p.status === "pending" ? (
                            <Button
                              type="button"
                              size="sm"
                              disabled={anyPending}
                              onClick={() => void movePayment(p, "reconciled")}
                            >
                              {busy(`payment:${p.id}:reconciled`)}
                              Mark received
                            </Button>
                          ) : p.refund?.status === "requested" ? (
                            <Button
                              type="button"
                              size="sm"
                              disabled={anyPending}
                              onClick={() => openDecision(p, "refunded")}
                            >
                              <Check aria-hidden />
                              Mark refunded
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
                              disabled={anyPending}
                              onClick={() => void movePayment(p, "waived")}
                            >
                              {busy(`payment:${p.id}:waived`) ?? (
                                <HandCoins aria-hidden />
                              )}
                            </Button>
                          ) : p.refund?.status === "requested" ? (
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              aria-label="Decline the refund"
                              title="Decline the refund"
                              disabled={anyPending}
                              onClick={() => openDecision(p, "declined")}
                            >
                              <X aria-hidden />
                            </Button>
                          ) : refundable ? (
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              aria-label="Refund"
                              title="Refund"
                              disabled={anyPending}
                              onClick={() => openRefund(p)}
                            >
                              <RotateCcw aria-hidden />
                            </Button>
                          ) : null
                        }
                      />
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="p-5 pb-3">
            <CardTitle className="text-base">Charges</CardTitle>
            <CardDescription>
              What {dues.name} is charged this year.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-5 pt-0">
            {dues.charges.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No charges yet. Their camp fee is charged when a captain accepts
                them, from what they pledged, or set it under Camp fee.
              </p>
            ) : (
              <ul aria-label="Charges" className="divide-y divide-border">
                {dues.charges.map((c) => (
                  <li
                    key={c.id}
                    className="flex items-center justify-between gap-2 py-2.5"
                  >
                    <span
                      className={
                        c.cancelled
                          ? "min-w-0 text-muted-foreground line-through"
                          : "min-w-0"
                      }
                    >
                      <span className="block text-sm font-medium">
                        {c.description}
                      </span>
                      <span className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                        {chargeSubline(c)}
                        {c.concession && (
                          <Badge variant="outline">Lowered</Badge>
                        )}
                        {c.cancelled && <span>Cancelled</span>}
                      </span>
                      {c.concessionReason && !c.cancelled && (
                        <span className="mt-1 block text-xs text-muted-foreground">
                          Why (Finance only): {c.concessionReason}
                        </span>
                      )}
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="text-sm font-medium tabular-nums">
                        {c.amountCents < 0
                          ? `− ${formatMoney(-c.amountCents)}`
                          : formatMoney(c.amountCents)}
                      </span>
                      <RowActions
                        secondary={
                          !c.cancelled && c.kind !== "fee" ? (
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              disabled={anyPending}
                              aria-label={`Cancel ${c.description}`}
                              title="Cancel this charge"
                              onClick={() =>
                                void cancelCharge(c.id, c.description)
                              }
                            >
                              {busy(`charge:${c.id}`) ?? <Trash2 aria-hidden />}
                            </Button>
                          ) : null
                        }
                      />
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <aside
        aria-label="Change their dues"
        className="flex w-full shrink-0 flex-col gap-6 page-lg:sticky page-lg:top-6 page-lg:w-[360px]"
      >
        <Card>
          <CardHeader className="p-5 pb-3">
            <CardTitle className="text-base">Camp fee</CardTitle>
            <CardDescription>
              {dues.pledge
                ? `They pledged ${formatMoney(dues.pledge.amountCents)}${dues.pledge.tierLabel ? ` (${dues.pledge.tierLabel})` : ", less than the lowest tier"}.`
                : "They haven't pledged yet."}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4 p-5 pt-0">
            {tiers.length > 0 && (
              <div className="flex flex-wrap gap-2" aria-label="Fee tiers">
                {tiers.map((t) => (
                  <Button
                    key={t.id}
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={feePending}
                    onClick={() => setFeeAmount(typedRands(t.amountCents))}
                  >
                    {t.label} · {formatMoney(t.amountCents)}
                  </Button>
                ))}
              </div>
            )}
            <InputField
              label="Fee (R)"
              inputMode="decimal"
              className="max-w-48"
              value={feeAmount}
              onChange={(e) => setFeeAmount(e.currentTarget.value)}
              disabled={feePending}
            />
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="fee-reason">Why it is lowered (optional)</Label>
              <Textarea
                id="fee-reason"
                rows={2}
                maxLength={500}
                value={feeReason}
                onChange={(e) => setFeeReason(e.currentTarget.value)}
                disabled={feePending}
                aria-describedby="fee-reason-note"
              />
              <p id="fee-reason-note" className="text-xs text-muted-foreground">
                Only the Finance team reads this.
              </p>
            </div>
            {feeError && (
              <p role="alert" className="text-sm text-destructive">
                {feeError}
              </p>
            )}
            <Button
              type="button"
              className="self-start"
              variant={feeDirty ? "default" : "outline"}
              disabled={anyPending || !feeAmount.trim() || !feeDirty}
              onClick={saveFee}
            >
              {feePending && <Loader2 className="animate-spin" aria-hidden />}
              {liveFee ? "Change fee" : "Set fee"}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="p-5 pb-3">
            <CardTitle className="text-base">Add a charge</CardTitle>
            <CardDescription>
              Gear hire or anything else they owe on top of the fee.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4 p-5 pt-0">
            <div className="grid grid-cols-[minmax(0,1fr)_8rem] gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="charge-kind">For</Label>
                <select
                  id="charge-kind"
                  className={selectClass}
                  value={chargeKind}
                  onChange={(e) =>
                    setChargeKind(e.target.value as "rental" | "other")
                  }
                  disabled={anyPending}
                >
                  <option value="rental">{CHARGE_KIND_LABELS.rental}</option>
                  <option value="other">{CHARGE_KIND_LABELS.other}</option>
                </select>
              </div>
              <InputField
                label="Amount (R)"
                inputMode="decimal"
                value={chargeAmount}
                onChange={(e) => setChargeAmount(e.currentTarget.value)}
                disabled={anyPending}
              />
            </div>
            <InputField
              label="What it is"
              value={chargeText}
              maxLength={200}
              onChange={(e) => setChargeText(e.currentTarget.value)}
              helper="For example: tent hire, or a transfer fee."
              disabled={anyPending}
            />
            {chargeError && (
              <p role="alert" className="text-sm text-destructive">
                {chargeError}
              </p>
            )}
            <Button
              type="button"
              variant="outline"
              className="self-start"
              disabled={anyPending || !chargeText.trim() || !chargeAmount}
              onClick={addCharge}
            >
              {chargePending ? (
                <Loader2 className="animate-spin" aria-hidden />
              ) : (
                <Plus aria-hidden />
              )}
              Add charge
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="p-5 pb-3">
            <CardTitle className="text-base">Payment plan</CardTitle>
            <CardDescription>
              Instalments they agreed to pay. They see the plan on their dues
              page.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 p-5 pt-0">
            {plan.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No plan. Add instalments if they pay in parts.
              </p>
            )}
            {plan.map((row, i) => (
              <div
                key={i}
                className="grid grid-cols-[minmax(0,1fr)_6.5rem_auto] items-end gap-2"
              >
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={`plan-day-${i}`}>Due</Label>
                  <DateControl
                    id={`plan-day-${i}`}
                    value={row.dueOn}
                    onChange={(e) => {
                      const dueOn = e.currentTarget.value;
                      setPlan((rows) =>
                        rows.map((r, j) => (j === i ? { ...r, dueOn } : r)),
                      );
                    }}
                    disabled={planPending}
                  />
                </div>
                <InputField
                  label="R"
                  inputMode="decimal"
                  value={row.amount}
                  onChange={(e) => {
                    const amount = e.currentTarget.value;
                    setPlan((rows) =>
                      rows.map((r, j) => (j === i ? { ...r, amount } : r)),
                    );
                  }}
                  disabled={planPending}
                />
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  aria-label={`Remove instalment ${i + 1}`}
                  disabled={planPending}
                  onClick={() =>
                    setPlan((rows) => rows.filter((_, j) => j !== i))
                  }
                >
                  <Trash2 aria-hidden />
                </Button>
              </div>
            ))}
            {plan.length > 0 && (
              <p className="text-xs text-muted-foreground">
                Plan total {formatMoney(planTotal)}; balance{" "}
                {formatMoney(Math.max(0, dues.balance.balanceCents))}.
              </p>
            )}
            {planError && (
              <p role="alert" className="text-sm text-destructive">
                {planError}
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={planPending || plan.length >= MAX_INSTALMENTS}
                onClick={() =>
                  setPlan((rows) => [...rows, { dueOn: "", amount: "" }])
                }
              >
                <Plus aria-hidden />
                Add instalment
              </Button>
              {planDirty && (
                <Button
                  type="button"
                  size="sm"
                  disabled={anyPending}
                  onClick={savePlan}
                >
                  {planPending && (
                    <Loader2 className="animate-spin" aria-hidden />
                  )}
                  {plan.length === 0 ? "Remove the plan" : "Save plan"}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </aside>
    </div>
  );
}
