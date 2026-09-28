import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { campDayKey } from "@camp404/core";
import { Badge } from "@camp404/ui/components/badge";
import { Button } from "@camp404/ui/components/button";
import { PaymentsFrame } from "@/components/dues/payments-frame";
import { captainPageGate } from "@/lib/captain-gate";
import { getDuesYear, getMemberDues, listFeeTiers } from "@/lib/dues";
import { PAYMENTS_OWING_PATH } from "@/lib/dues-copy";
import { PLACE_WORDS } from "@/lib/dues-view";
import { keepsMoney } from "@/lib/money-gate";
import { ledgerCycle } from "@/lib/payments";
import { MemberDuesManager } from "./member-dues-manager";

export const dynamic = "force-dynamic";

export const metadata = { title: "Member's dues — Camp 404" };

// One member's dues for the year (#240), for the Finance team: their charges,
// payments and refunds on the left, and their balance, camp fee and payment
// plan on the right. A concession's reason is read here and nowhere a member
// can see it. Captains and Finance leads only; anyone else sees a lock and
// nothing is read, not even the member's name.

export default async function MemberDuesPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const gate = await captainPageGate("team_lead");
  const cleared = gate.cleared && (await keepsMoney(gate));
  if (!cleared) {
    return (
      <PaymentsFrame
        active={PAYMENTS_OWING_PATH}
        title="Member's dues"
        description="One member's charges, payments and plan."
        cleared={false}
      />
    );
  }

  const { userId } = await params;
  const cycle = await ledgerCycle();
  const today = campDayKey(new Date());
  const [dues, tiers, year] = await Promise.all([
    getMemberDues(userId, cycle, { forFinance: true, today }),
    listFeeTiers(cycle),
    getDuesYear(cycle),
  ]);
  if (!dues) notFound();

  return (
    <div className="flex flex-col">
      <div className="mb-4">
        <Button asChild variant="ghost" size="sm">
          <Link href={PAYMENTS_OWING_PATH}>
            <ArrowLeft aria-hidden />
            Who owes what
          </Link>
        </Button>
      </div>
      <PaymentsFrame
        active={PAYMENTS_OWING_PATH}
        title={dues.name}
        description="Their camp fee, other charges, payments and payment plan for this year."
        cleared
      >
        <div className="-mt-2 mb-6 flex flex-wrap gap-2" aria-label="Member">
          {dues.refCode && (
            <Badge variant="outline" className="font-mono normal-case">
              {dues.refCode}
            </Badge>
          )}
          <Badge variant="secondary">
            {dues.participation
              ? PLACE_WORDS[dues.participation.status]
              : "No answer this year"}
          </Badge>
        </div>
        <MemberDuesManager
          dues={dues}
          tiers={tiers}
          schedule={{
            fullRefundUntil: year.fullRefundUntil,
            partialRefundUntil: year.partialRefundUntil,
            partialRefundPct: year.partialRefundPct,
          }}
          today={today}
        />
      </PaymentsFrame>
    </div>
  );
}
