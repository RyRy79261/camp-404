import { FileText, ReceiptText } from "lucide-react";
import {
  campDayKey,
  CHARGE_KIND_LABELS,
  formatMoney,
  PAYMENT_METHOD_LABELS,
  REFUND_STATUS_LABELS,
} from "@camp404/core";
import { Badge } from "@camp404/ui/components/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@camp404/ui/components/card";
import { PageHeading } from "@camp404/ui/components/page-heading";
import { getDuesYear, getMemberDues, listFeeTiers } from "@/lib/dues";
import { paymentProofPath } from "@/lib/dues-copy";
import { balanceSentence, formatDay } from "@/lib/dues-view";
import { requireMemberPage } from "@/lib/member-gate";
import { getMemberRefCode, ledgerCycle } from "@/lib/payments";
import { PaymentReference } from "../profile/payment-reference";
import { PledgeForm, ProofForm, RefundAsk } from "./my-dues-forms";

export const dynamic = "force-dynamic";

export const metadata = { title: "My dues — Camp 404" };

// A member's own dues for the year (#240): what they owe and their reference,
// what they pledge, what they are charged, their payment plan, and the
// payments they made, each with its state. They tell the Finance team they
// paid by sending the amount, the date and a proof file, which lands as
// pending until it is checked against the bank. Only their own: nothing about
// anyone else is read, and what the Finance team keeps to itself (a
// concession's reason, the ledger's notes) is left out on the server.

const STATUS = {
  pending: { label: "Being checked", variant: "warning" },
  reconciled: { label: "Received", variant: "success" },
  waived: { label: "Waived", variant: "secondary" },
} as const;

export default async function MyDuesPage() {
  const { campUser } = await requireMemberPage();
  const cycle = await ledgerCycle();
  const today = campDayKey(new Date());
  const [dues, tiers, year, refCode] = await Promise.all([
    getMemberDues(campUser.id, cycle, { forFinance: false, today }),
    listFeeTiers(cycle),
    getDuesYear(cycle),
    getMemberRefCode(campUser.id),
  ]);
  if (!dues) return null;

  const feeCharged = dues.charges.some((c) => c.kind === "fee" && !c.cancelled);
  const notComing = dues.participation?.status === "not_attending";

  return (
    <div className="flex flex-col">
      <PageHeading
        eyebrow="Me / My dues"
        title="My dues"
        description="What you pay the camp this year, and what you've paid. Pay by bank transfer with your reference, then send us your proof."
      />

      <div className="grid items-start gap-6 page-lg:grid-cols-3">
        <div className="flex min-w-0 flex-col gap-6 page-lg:col-span-2">
          <Card>
            <CardContent className="flex flex-col gap-2 p-5">
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                This year
              </span>
              <p
                role="status"
                className="text-2xl font-semibold tracking-tight"
              >
                {balanceSentence(dues.balance)}
              </p>
              <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted-foreground">
                <span>
                  Charged{" "}
                  <span className="font-medium tabular-nums text-foreground">
                    {formatMoney(dues.balance.chargedCents)}
                  </span>
                </span>
                <span>
                  Paid{" "}
                  <span className="font-medium tabular-nums text-foreground">
                    {formatMoney(dues.balance.paidCents)}
                  </span>
                </span>
                {dues.balance.pendingCents > 0 && (
                  <span>
                    Being checked{" "}
                    <span className="font-medium tabular-nums text-foreground">
                      {formatMoney(dues.balance.pendingCents)}
                    </span>
                  </span>
                )}
                {dues.balance.refundedCents > 0 && (
                  <span>
                    Refunded{" "}
                    <span className="font-medium tabular-nums text-foreground">
                      {formatMoney(dues.balance.refundedCents)}
                    </span>
                  </span>
                )}
              </div>
              {(dues.next || year.deadline) && (
                <p className="mt-1 text-sm">
                  {dues.next ? (
                    <>
                      Next:{" "}
                      <span className="font-medium tabular-nums">
                        {formatMoney(dues.next.amountCents)}
                      </span>{" "}
                      by {formatDay(dues.next.dueOn)}
                      {dues.next.overdue && (
                        <Badge variant="destructive" className="ml-2">
                          Late
                        </Badge>
                      )}
                    </>
                  ) : dues.balance.balanceCents > 0 && year.deadline ? (
                    <>Please pay by {formatDay(year.deadline)}.</>
                  ) : null}
                </p>
              )}
            </CardContent>
          </Card>

          {refCode && <PaymentReference code={refCode} />}

          <Card>
            <CardHeader className="p-5 pb-3">
              <CardTitle className="text-base">
                What you&rsquo;re charged
              </CardTitle>
              <CardDescription>
                Your camp fee is charged once you have a place, from what you
                pledged.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-5 pt-0">
              {dues.charges.filter((c) => !c.cancelled).length === 0 ? (
                <p className="text-sm text-muted-foreground">Nothing yet.</p>
              ) : (
                <ul aria-label="Charges" className="divide-y divide-border">
                  {dues.charges
                    .filter((c) => !c.cancelled)
                    .map((c) => (
                      <li
                        key={c.id}
                        className="flex items-center justify-between gap-3 py-2.5 text-sm"
                      >
                        <span className="min-w-0">
                          <span className="block font-medium">
                            {c.description}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {CHARGE_KIND_LABELS[c.kind]}
                          </span>
                        </span>
                        <span className="font-medium tabular-nums">
                          {c.amountCents < 0
                            ? `− ${formatMoney(-c.amountCents)}`
                            : formatMoney(c.amountCents)}
                        </span>
                      </li>
                    ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="p-5 pb-3">
              <CardTitle className="text-base">Your payments</CardTitle>
              <CardDescription>
                A payment you send in shows as being checked until the Finance
                team sees it in the bank.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-5 pt-0">
              {dues.payments.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No payments yet this year.
                </p>
              ) : (
                <ul
                  aria-label="Your payments"
                  className="divide-y divide-border"
                >
                  {dues.payments.map((p) => (
                    <li
                      key={p.id}
                      className="flex flex-col gap-2 py-3 page-sm:flex-row page-sm:items-start page-sm:justify-between"
                    >
                      <span className="flex min-w-0 flex-col gap-0.5">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="font-medium tabular-nums">
                            {formatMoney(p.amountCents)}
                          </span>
                          <Badge variant={STATUS[p.status].variant}>
                            {STATUS[p.status].label}
                          </Badge>
                          {p.refund && (
                            <Badge variant="outline">
                              {REFUND_STATUS_LABELS[p.refund.status]}
                              {p.refund.status !== "declined"
                                ? ` · ${formatMoney(p.refund.amountCents)}`
                                : ""}
                            </Badge>
                          )}
                        </span>
                        <span className="font-mono text-xs text-muted-foreground">
                          {p.reference}
                        </span>
                        {(p.paidOn || p.method) && (
                          <span className="text-xs text-muted-foreground">
                            {[
                              p.method ? PAYMENT_METHOD_LABELS[p.method] : null,
                              p.paidOn ? `paid ${formatDay(p.paidOn)}` : null,
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </span>
                        )}
                        {p.refund?.status === "declined" &&
                          p.refund.declineReason && (
                            <span className="text-xs text-muted-foreground">
                              Why: {p.refund.declineReason}
                            </span>
                          )}
                        {p.hasProof && (
                          <a
                            href={paymentProofPath(p.id)}
                            target="_blank"
                            rel="noopener"
                            className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline"
                          >
                            <FileText className="h-3.5 w-3.5" aria-hidden />
                            Your proof
                          </a>
                        )}
                      </span>
                      {notComing &&
                        p.status === "reconciled" &&
                        (!p.refund || p.refund.status === "declined") && (
                          <RefundAsk paymentId={p.id} />
                        )}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        <aside className="flex flex-col gap-6">
          <Card>
            <CardHeader className="p-5 pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <ReceiptText className="h-4 w-4 text-accent" aria-hidden />
                Tell us you paid
              </CardTitle>
              <CardDescription>
                Send the amount, the day and your proof of payment: a photo or a
                PDF of the bank&rsquo;s confirmation. Never send card numbers.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-5 pt-0">
              <ProofForm today={today} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="p-5 pb-3">
              <CardTitle className="text-base">What you can pay</CardTitle>
              <CardDescription>
                {feeCharged
                  ? "Your fee is set. Ask the Finance team if it needs to change."
                  : "Pick the tier you can pay this year. Less than the lowest tier is fine too."}
              </CardDescription>
            </CardHeader>
            <CardContent className="p-5 pt-0">
              <PledgeForm
                tiers={tiers.map((t) => ({
                  id: t.id,
                  label: t.label,
                  amountCents: t.amountCents,
                }))}
                pledge={
                  dues.pledge
                    ? {
                        tierId: dues.pledge.tierId,
                        amountCents: dues.pledge.amountCents,
                      }
                    : null
                }
                locked={feeCharged}
              />
            </CardContent>
          </Card>

          {dues.instalments.length > 0 && (
            <Card>
              <CardHeader className="p-5 pb-3">
                <CardTitle className="text-base">Your payment plan</CardTitle>
              </CardHeader>
              <CardContent className="p-5 pt-0">
                <ul
                  aria-label="Payment plan"
                  className="divide-y divide-border"
                >
                  {dues.instalments.map((i) => (
                    <li
                      key={i.dueOn}
                      className="flex items-center justify-between gap-3 py-2 text-sm"
                    >
                      <span>{formatDay(i.dueOn)}</span>
                      <span className="tabular-nums">
                        {formatMoney(i.amountCents)}
                      </span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </aside>
      </div>
    </div>
  );
}
