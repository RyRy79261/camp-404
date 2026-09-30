import { PaymentsFrame } from "@/components/dues/payments-frame";
import { captainPageGate } from "@/lib/captain-gate";
import { settleUpCandidates } from "@/lib/dues";
import { PAYMENTS_SETTLE_UP_PATH } from "@/lib/dues-copy";
import { keepsMoney } from "@/lib/money-gate";
import { ledgerCycle } from "@/lib/payments";
import { SettleUpForm } from "./settle-up-form";

export const dynamic = "force-dynamic";

export const metadata = { title: "Settle-up — Camp 404" };

// The post-burn settle-up (#240): a total shared out across everyone with a
// camp fee this year, as a top-up each member pays or money back to each. The
// Finance team sees the split before it goes out, the shares add up to the
// total to the cent, and publishing writes every member's share in one
// transaction with its audit row. Members with a concession can be left out.

export default async function SettleUpPage() {
  const gate = await captainPageGate("team_lead");
  const cleared = gate.cleared && (await keepsMoney(gate));
  const candidates = cleared
    ? await settleUpCandidates(await ledgerCycle())
    : [];
  return (
    <PaymentsFrame
      active={PAYMENTS_SETTLE_UP_PATH}
      title="Settle-up"
      description="After the burn, share what is left to pay, or what is left over, across everyone with a camp fee this year."
      cleared={cleared}
    >
      {cleared ? <SettleUpForm candidates={candidates} /> : null}
    </PaymentsFrame>
  );
}
