import { PaymentsFrame } from "@/components/dues/payments-frame";
import { captainPageGate } from "@/lib/captain-gate";
import { getDuesYear, listFeeTiers } from "@/lib/dues";
import { PAYMENTS_SETTINGS_PATH } from "@/lib/dues-copy";
import { keepsMoney } from "@/lib/money-gate";
import { ledgerCycle } from "@/lib/payments";
import { DuesSettings } from "./dues-settings";

export const dynamic = "force-dynamic";

export const metadata = { title: "Fees and dates — Camp 404" };

// The year's fee tiers and dates (#240), kept in the database, never in code:
// the tiers a member pledges from, the deadline, and the refund schedule (a
// full refund up to one day, a partial one up to a later day, nothing after).
// Here rather than in Camp settings so the Finance leads, who may not open
// Camp settings, keep them with the captains.

export default async function DuesSettingsPage() {
  const gate = await captainPageGate("team_lead");
  const cleared = gate.cleared && (await keepsMoney(gate));
  const data = cleared
    ? await (async () => {
        const cycle = await ledgerCycle();
        const [tiers, year] = await Promise.all([
          listFeeTiers(cycle),
          getDuesYear(cycle),
        ]);
        return { tiers, year };
      })()
    : null;
  return (
    <PaymentsFrame
      active={PAYMENTS_SETTINGS_PATH}
      title="Fees and dates"
      description="This year's fee tiers, which members pledge from, the deadline for dues and the refund schedule."
      cleared={data !== null}
    >
      {data ? <DuesSettings tiers={data.tiers} year={data.year} /> : null}
    </PaymentsFrame>
  );
}
