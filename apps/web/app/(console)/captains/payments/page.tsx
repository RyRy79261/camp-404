import { campDayKey } from "@camp404/core";
import { UNSET_CYCLE } from "@camp404/db/camp-config";
import { DuesStats, duesStatsFigures } from "@/components/dues/dues-stats";
import { PaymentsFrame } from "@/components/dues/payments-frame";
import { captainPageGate } from "@/lib/captain-gate";
import { getDuesYear, listDuesAccounts } from "@/lib/dues";
import { PAYMENTS_PATH } from "@/lib/dues-copy";
import { keepsMoney } from "@/lib/money-gate";
import { ledgerCycle, listPayments } from "@/lib/payments";
import { getCampManagementRoster } from "@/lib/roster";
import {
  PaymentsManager,
  RecordPaymentDialog,
  type LedgerMember,
} from "./payments-manager";

export const dynamic = "force-dynamic";

export const metadata = { title: "Payments — Camp 404" };

// The payments ledger (owner's call, 2026-09-16: a full ledger with amounts
// and references). The app never moves money: a member pays the camp by EFT
// quoting their reference, and sends a proof file (#240), and the Finance team
// records and checks what the bank statement shows. For captains and Finance
// leads (canManageMoney): the rank gate is team_lead, because clearance is
// global, and the Finance rule then turns away a lead of any other team.
// Anyone else sees the heading and a lock, and no payment is read. The year's
// figures sit on top (the same four as Who owes what, read from the same
// accounts, so the tabs never disagree), then the ledger. "Record a payment"
// is the page's one main button, in the heading, and opens its form in a
// dialog.

export default async function PaymentsPage() {
  const gate = await captainPageGate("team_lead");
  const cleared = gate.cleared && (await keepsMoney(gate));

  const data = cleared
    ? await (async () => {
        const cycle = await ledgerCycle();
        const [payments, roster, accounts, year] = await Promise.all([
          listPayments(cycle),
          getCampManagementRoster(),
          listDuesAccounts(cycle, campDayKey(new Date())),
          getDuesYear(cycle),
        ]);
        const members: LedgerMember[] = roster
          .filter((m) => m.approvalStatus !== "rejected")
          .map((m) => ({
            id: m.id,
            name: m.displayName?.trim() || "Unnamed burner",
            duesPaid: m.duesPaid,
          }))
          .sort((a, b) => a.name.localeCompare(b.name));
        return {
          cycle,
          payments,
          members,
          figures: duesStatsFigures(accounts),
          deadline: year.deadline,
        };
      })()
    : null;

  return (
    <PaymentsFrame
      active={PAYMENTS_PATH}
      title="Payments"
      description="Record what the bank statement shows, and check the payments members send in. A member is paid up once what they paid covers what they are charged."
      cleared={data !== null}
      actions={data ? <RecordPaymentDialog members={data.members} /> : null}
    >
      {data ? (
        <div className="flex flex-col gap-6">
          <DuesStats figures={data.figures} deadline={data.deadline} />
          <PaymentsManager
            // A camp that has not named its founding year is on a placeholder.
            yearLabel={
              data.cycle === UNSET_CYCLE ? "this year" : String(data.cycle)
            }
            payments={data.payments}
          />
        </div>
      ) : null}
    </PaymentsFrame>
  );
}
