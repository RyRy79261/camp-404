import Link from "next/link";
import { PaymentsFrame } from "@/components/dues/payments-frame";
import { getCampBankDetails } from "@/lib/camp-money";
import { getDuesYear } from "@/lib/dues";
import { PAYMENTS_SETTINGS_PATH } from "@/lib/dues-copy";
import { ledgerCycle } from "@/lib/payments";
import { programPage } from "@/lib/program-page";
import { BankDetailsForm } from "./bank-details-form";
import { DuesSettings } from "./dues-settings";

export const dynamic = "force-dynamic";

export const metadata = { title: "Fees and dates — Camp 404" };

// The camp's bank details (camp fees sprint) and the year's dates (#240):
// where members pay, the deadline and the refund schedule. Here rather than
// in Camp settings so the Finance leads, who may not open Camp settings, keep
// them with the captains. The fee amounts are not set here any more: a member
// pledges any amount on the Join site's scale, so one quiet line says where
// that scale is set.

export default async function DuesSettingsPage() {
  const gate = await programPage("payments");
  const data = gate.allowed
    ? await (async () => {
        const cycle = await ledgerCycle();
        const [year, bank] = await Promise.all([
          getDuesYear(cycle),
          getCampBankDetails(),
        ]);
        return { year, bank };
      })()
    : null;
  return (
    <PaymentsFrame
      active={PAYMENTS_SETTINGS_PATH}
      title="Fees and dates"
      description="Where members pay the camp, the deadline for dues and the refund schedule."
      cleared={data !== null}
    >
      {data ? (
        <div className="flex flex-col gap-6">
          <p className="text-sm text-muted-foreground">
            Members pledge any amount on the fee scale. Its amounts are set in{" "}
            <Link
              href="/captains/join-site"
              className="text-foreground underline underline-offset-2 hover:text-accent"
            >
              Join site settings
            </Link>
            .
          </p>
          <div className="grid items-start gap-6 page-lg:grid-cols-2">
            <BankDetailsForm
              details={data.bank.details}
              version={data.bank.version}
            />
            <DuesSettings year={data.year} />
          </div>
        </div>
      ) : null}
    </PaymentsFrame>
  );
}
