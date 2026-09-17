import Link from "next/link";
import { CaptainLock } from "@camp404/ui/components/captain-lock";
import { GhostBack } from "@camp404/ui/components/ghost-back";
import { UNSET_CYCLE } from "@camp404/db/camp-config";
import { currentCycleNumber } from "@camp404/db/cycles";
import { listPayments } from "@camp404/db/payments";
import { captainPageGate } from "@/lib/captain-gate";
import { getCampManagementRoster } from "@/lib/roster";
import { PaymentsManager, type LedgerMember } from "./payments-manager";

export const dynamic = "force-dynamic";

export const metadata = { title: "Dues & payments — Camp 404" };

// The payments ledger (owner's call, 2026-09-16: a full ledger with amounts
// and references). The app never moves money: a member pays the camp by EFT
// quoting their reference, and a captain records what the bank statement
// shows. Captain-only, preview-but-locked (D3): anyone else sees the chrome and
// a lock, and no payment is read. No board draws this page; it reuses the
// captain pages' chrome and the shared form parts.

export default async function PaymentsPage() {
  const { cleared } = await captainPageGate("captain");

  const data = cleared
    ? await (async () => {
        const cycle = await currentCycleNumber();
        const [payments, roster] = await Promise.all([
          listPayments(cycle),
          getCampManagementRoster(),
        ]);
        const members: LedgerMember[] = roster
          .filter((m) => m.approvalStatus !== "rejected")
          .map((m) => ({
            id: m.id,
            name: m.displayName?.trim() || "Unnamed burner",
            duesPaid: m.duesPaid,
          }))
          .sort((a, b) => a.name.localeCompare(b.name));
        return { cycle, payments, members };
      })()
    : null;

  return (
    <main className="mx-auto max-w-lg px-4 py-6">
      <GhostBack linkAs={Link} href="/captains/tools" className="-ml-2 mb-4">
        Camp tools
      </GhostBack>
      <header className="mb-6">
        <h1 className="text-2xl font-bold">Dues &amp; payments</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Record what the bank statement shows. A member&apos;s dues count as
          paid for the year once a payment is received or waived.
        </p>
      </header>

      {data ? (
        <PaymentsManager
          // A camp that has not named its founding year is on a placeholder.
          yearLabel={
            data.cycle === UNSET_CYCLE ? "this year" : String(data.cycle)
          }
          members={data.members}
          payments={data.payments}
        />
      ) : (
        <CaptainLock message="Payments are captain-only. Your rank doesn't have clearance for this." />
      )}
    </main>
  );
}
