import { UNSET_CYCLE } from "@camp404/db/camp-config";
import { PaymentsFrame } from "@/components/dues/payments-frame";
import { getTeamsConfig, teamLabelMap } from "@/lib/camp-config";
import { captainPageGate } from "@/lib/captain-gate";
import { listClaimsForFinance } from "@/lib/claims";
import { PAYMENTS_CLAIMS_PATH } from "@/lib/claims-copy";
import { keepsMoney } from "@/lib/money-gate";
import { ledgerCycle } from "@/lib/payments";
import { ClaimsPayManager, type FinanceClaim } from "./claims-pay-manager";

export const dynamic = "force-dynamic";

export const metadata = { title: "Claims — Camp 404" };

// The year's claims for the Finance team (#242): captains and Finance leads
// (canManageMoney). A claim the team said yes to is paid by bank transfer
// outside the app, then marked paid here; or turned down after all, with a
// reason the member reads. The receipts open through /api/claim-receipt and
// the bank details on request, each read recorded in the audit log. Anyone
// else sees the heading and a lock, and no claim is read.

export default async function FinanceClaimsPage() {
  const gate = await captainPageGate("team_lead");
  const cleared = gate.cleared && (await keepsMoney(gate));
  const data = cleared
    ? await (async () => {
        const cycle = await ledgerCycle();
        const [claims, config] = await Promise.all([
          listClaimsForFinance(cycle),
          getTeamsConfig(),
        ]);
        const labels = teamLabelMap(config);
        const rows: FinanceClaim[] = claims.map((c) => ({
          id: c.id,
          teamLabel: c.team ? (labels[c.team] ?? c.team) : "No team",
          submitterName: c.submitterName?.trim() || "Unnamed burner",
          description: c.description,
          amountCents: c.amountCents,
          spentOn: c.spentOn,
          status: c.status,
          decisionNote: c.decisionNote,
          approverName: c.approverName,
          files: c.files.map((f) => f.id),
          own: c.submitterId === gate.campUser.id,
        }));
        return { cycle, rows };
      })()
    : null;

  return (
    <PaymentsFrame
      active={PAYMENTS_CLAIMS_PATH}
      title="Claims"
      description="Money members spent for a team. Once the team says yes, pay it back by bank transfer and mark it paid here."
      cleared={data !== null}
    >
      {data ? (
        <ClaimsPayManager
          yearLabel={
            data.cycle === UNSET_CYCLE ? "this year" : String(data.cycle)
          }
          rows={data.rows}
        />
      ) : null}
    </PaymentsFrame>
  );
}
