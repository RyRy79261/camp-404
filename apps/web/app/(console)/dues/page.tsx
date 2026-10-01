import { FileText, ReceiptText } from "lucide-react";
import {
  campDayKey,
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
import {
  balanceSentence,
  chargeSubline,
  formatDay,
  PAYMENT_STATUS_WORDS,
  proofPlace,
} from "@/lib/dues-view";
import { requireMemberPage } from "@/lib/member-gate";
import { getMemberRefCode, ledgerCycle } from "@/lib/payments";
import { PaymentReference } from "../profile/payment-reference";
import {
  PledgeDialog,
  PledgeForm,
  ProofDialog,
  ProofForm,
  RefundAsk,
} from "./my-dues-forms";

export const dynamic = "force-dynamic";

export const metadata = { title: "My dues — Camp 404" };

// A member's own dues for the year (#240): what they owe and their reference,
// what they pledge, what they are charged, their payment plan, and the
// payments they made, each with its state. They tell the Finance team they
// paid by sending the amount, the date and a proof file, which lands as
// pending until it is checked against the bank. Only their own: nothing about
// anyone else is read, and what the Finance team keeps to itself (a
// concession's reason, the ledger's notes) is left out on the server.
//
// The page is ordered by where the member stands, so the one thing they can
// do next comes straight after the balance: picking what they can pay (no
// pledge yet), or telling us they paid (something left to pay). Once pledged,
// the pledge is one line in the balance card; once nothing is left to send
// proof for, the proof form is a "Send another proof" button, there even
// before anything is charged (a member may pay before a captain accepts
// them). Empty cards (nothing charged, no payments) are left out.

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

  const charges = dues.charges.filter((c) => !c.cancelled);
  const feeCharged = charges.some((c) => c.kind === "fee");
  const notComing = dues.participation?.status === "not_attending";
  const tierChoices = tiers.map((t) => ({
    id: t.id,
    label: t.label,
    amountCents: t.amountCents,
  }));
  // The pledge form is the next step only for a member who has not pledged.
  const mustPledge = !dues.pledge && !feeCharged;
  // Something left to pay that no proof covers yet: the form stays open.
  const proofOpen = proofPlace(dues.balance) === "form";

  const proof = proofOpen ? (
    <Card>
      <CardHeader className="p-5 pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <ReceiptText className="h-4 w-4 text-accent" aria-hidden />
          Tell us you paid
        </CardTitle>
        <CardDescription>
          Pay by EFT with your reference, then send the amount, the day and your
          proof of payment: a photo or a PDF of the bank&rsquo;s confirmation.
          Never send card numbers.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-5 pt-0">
        <ProofForm today={today} />
      </CardContent>
    </Card>
  ) : (
    <Card>
      <CardContent className="flex flex-wrap items-center justify-between gap-3 p-5">
        <p className="text-sm text-muted-foreground">
          {dues.balance.chargedCents > 0
            ? "Paid more, or for someone else? Send the Finance team your proof."
            : "Paid already? Send the Finance team your proof."}
        </p>
        <ProofDialog
          today={today}
          label={
            dues.payments.length > 0 ? "Send another proof" : "Send a proof"
          }
        />
      </CardContent>
    </Card>
  );

  return (
    <div className="flex flex-col">
      <PageHeading
        eyebrow="Me / My dues"
        title="My dues"
        description="What you pay the camp this year, and what you've paid. Pay by bank transfer with your reference, then send us your proof."
      />

      <div className="flex min-w-0 flex-col gap-6">
        <Card>
          <CardHeader className="p-5 pb-3">
            <CardTitle className="text-base">This year</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 p-5 pt-0">
            <p role="status" className="text-2xl font-semibold tracking-tight">
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
            {(dues.next ||
              (dues.balance.balanceCents > 0 && year.deadline)) && (
              <p className="text-sm">
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
                ) : (
                  <>Please pay by {formatDay(year.deadline!)}.</>
                )}
              </p>
            )}
            {dues.pledge && (
              <div
                data-testid="my-pledge"
                className="mt-2 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3"
              >
                <p className="text-sm">
                  You pledged{" "}
                  <span className="font-medium tabular-nums">
                    {formatMoney(dues.pledge.amountCents)}
                  </span>
                  {dues.pledge.tierLabel ? ` (${dues.pledge.tierLabel})` : ""}.{" "}
                  <span className="text-muted-foreground">
                    {feeCharged
                      ? "Ask the Finance team if it needs to change."
                      : "It is charged once you have a place."}
                  </span>
                </p>
                {!feeCharged && tierChoices.length > 0 && (
                  <PledgeDialog
                    tiers={tierChoices}
                    pledge={{
                      tierId: dues.pledge.tierId,
                      amountCents: dues.pledge.amountCents,
                    }}
                  />
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {mustPledge && (
          <Card className="border-l-4 border-l-accent">
            <CardHeader className="p-5 pb-3">
              <CardTitle className="text-base">What you can pay</CardTitle>
              <CardDescription>
                Pick the tier you can pay this year. Less than the lowest tier
                is fine too. Your fee is charged from it once you have a place;
                then you pay by EFT with your reference.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-5 pt-0">
              <PledgeForm tiers={tierChoices} pledge={null} locked={false} />
            </CardContent>
          </Card>
        )}

        {refCode && <PaymentReference code={refCode} />}

        {proof}

        {dues.instalments.length > 0 && (
          <Card>
            <CardHeader className="p-5 pb-3">
              <CardTitle className="text-base">Your payment plan</CardTitle>
            </CardHeader>
            <CardContent className="p-5 pt-0">
              <ul aria-label="Payment plan" className="divide-y divide-border">
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

        {charges.length > 0 && (
          <Card>
            <CardHeader className="p-5 pb-3">
              <CardTitle className="text-base">
                What you&rsquo;re charged
              </CardTitle>
            </CardHeader>
            <CardContent className="p-5 pt-0">
              <ul aria-label="Charges" className="divide-y divide-border">
                {charges.map((c) => (
                  <li
                    key={c.id}
                    className="flex items-center justify-between gap-3 py-2.5 text-sm"
                  >
                    <span className="min-w-0">
                      <span className="block font-medium">{c.description}</span>
                      <span className="text-xs text-muted-foreground">
                        {chargeSubline(c)}
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
            </CardContent>
          </Card>
        )}

        {dues.payments.length > 0 && (
          <Card>
            <CardHeader className="p-5 pb-3">
              <CardTitle className="text-base">Your payments</CardTitle>
              <CardDescription>
                A payment you send in shows as being checked until the Finance
                team sees it in the bank.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-5 pt-0">
              <ul aria-label="Your payments" className="divide-y divide-border">
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
                      <span className="text-xs text-muted-foreground">
                        {[
                          p.method ? PAYMENT_METHOD_LABELS[p.method] : null,
                          p.paidOn ? `paid ${formatDay(p.paidOn)}` : null,
                          `receipt no. ${p.reference}`,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
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
                          className="mt-1 inline-flex items-center gap-1 self-start text-xs font-medium text-accent hover:underline"
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
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

const STATUS = PAYMENT_STATUS_WORDS.member;
