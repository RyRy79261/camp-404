import { PaymentsFrame } from "@/components/dues/payments-frame";
import { captainPageGate } from "@/lib/captain-gate";
import { PAYMENTS_IMPORT_PATH } from "@/lib/dues-copy";
import { keepsMoney } from "@/lib/money-gate";
import { StatementImport } from "./statement-import";

export const dynamic = "force-dynamic";

export const metadata = { title: "Bank statement — Camp 404" };

// The bank statement import (#240), for the Finance team. They upload the
// statement file the bank or the transfer service gives them; it is read on
// the server, in memory, and never kept. Each line of money coming in is
// matched to a member by the reference they quoted (`C404-M017`), and the
// Finance team confirms each one, which records it as received (or marks the
// member's own pending payment received). No spreadsheet step, and nothing
// is written until a line is confirmed.

export default async function StatementImportPage() {
  const gate = await captainPageGate("team_lead");
  const cleared = gate.cleared && (await keepsMoney(gate));
  return (
    <PaymentsFrame
      active={PAYMENTS_IMPORT_PATH}
      title="Bank statement"
      description="Upload the statement from the bank or the transfer service. We match each payment to a member by their reference, and you confirm each one."
      cleared={cleared}
    >
      {cleared ? <StatementImport /> : null}
    </PaymentsFrame>
  );
}
