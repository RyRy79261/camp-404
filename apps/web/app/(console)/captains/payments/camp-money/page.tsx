import { Receipt } from "lucide-react";
import { campDayKey, formatMoney } from "@camp404/core";
import { EmptyState } from "@camp404/ui/components/empty-state";
import { FilterLinks, MoneyFigures } from "@/components/dues/money-kit";
import { PaymentsFrame } from "@/components/dues/payments-frame";
import { getCampMoney } from "@/lib/camp-money";
import {
  forecastRows,
  nextBigBill,
  paidCount,
  paidRows,
  shortDay,
} from "@/lib/camp-money-view";
import { PAYMENTS_CAMP_MONEY_PATH } from "@/lib/dues-copy";
import { ledgerCycle } from "@/lib/payments";
import { programPage } from "@/lib/program-page";
import { BankBalance } from "./bank-balance";
import { BillDialog } from "./bill-dialog";
import { MoneyLines, PaidLines } from "./money-lines";

export const dynamic = "force-dynamic";

export const metadata = { title: "Camp money — Camp 404" };

// Camp money (camp fees sprint, the owner's pick: mock-up step 1, Option B):
// four figures (in the bank, fees still to come, money after the next big
// bill, money left), then the money date by date with "Mark paid" on each
// bill's next payment, and the bank balance with its history. For the
// Finance team (captains and Finance leads, MONEY_KEEPER) only.

function money(cents: number): string {
  return cents < 0 ? `−${formatMoney(-cents)}` : formatMoney(cents);
}

export default async function CampMoneyPage({
  searchParams,
}: {
  searchParams: Promise<{ show?: string }>;
}) {
  const gate = await programPage("payments");
  const { show: raw } = await searchParams;
  const show = raw === "paid" ? "paid" : "due";
  const data = gate.allowed
    ? await getCampMoney(await ledgerCycle(), campDayKey(new Date()))
    : null;

  const f = data?.forecast;
  const big = f ? nextBigBill(f) : null;
  const paid = data ? paidCount(data.bills) : 0;
  const rows = data && f ? forecastRows(f, data.bills) : [];

  return (
    <PaymentsFrame
      active={PAYMENTS_CAMP_MONEY_PATH}
      title="Camp money"
      description="What the camp has, what it must pay and what is left."
      actions={<BillDialog />}
      cleared={data !== null}
    >
      {data && f && (
        <div className="flex flex-col gap-6">
          <MoneyFigures
            label="The camp's money"
            figures={[
              {
                term: "In the bank",
                value: f.inBank ? money(f.inBank.amountCents) : "—",
                negative: (f.inBank?.amountCents ?? 0) < 0,
                hint: (
                  <>
                    {f.inBank ? `on ${shortDay(f.inBank.asOf)} · ` : ""}
                    <a
                      href="#bank-balance"
                      className="text-foreground underline underline-offset-2 hover:text-accent"
                    >
                      Update
                    </a>
                  </>
                ),
              },
              {
                term: "Fees still to come",
                value: money(f.feesExpectedCents),
                hint: `from ${f.feesFromCount} of ${f.comingCount} Coming`,
              },
              big
                ? {
                    term: `After ${shortDay(big.dueOn)}`,
                    value: money(big.moneyAfterCents),
                    negative: big.moneyAfterCents < 0,
                    hint: `${big.name} · before team budgets`,
                  }
                : {
                    term: "After the next bill",
                    value: "—",
                    hint: "No bills still due",
                  },
              {
                term: "Money left",
                value: money(f.moneyLeftCents),
                negative: f.moneyLeftCents < 0,
                hint: "after every bill and budget",
              },
            ]}
          />

          <section
            aria-labelledby="date-by-date"
            className="flex flex-col gap-2"
          >
            <div className="flex flex-wrap items-center gap-3">
              <h2 id="date-by-date" className="text-base font-semibold">
                Date by date
              </h2>
              <FilterLinks
                label="Show"
                links={[
                  {
                    href: PAYMENTS_CAMP_MONEY_PATH,
                    label: "Still due",
                    current: show === "due",
                  },
                  {
                    href: `${PAYMENTS_CAMP_MONEY_PATH}?show=paid`,
                    label: "Paid",
                    count: paid,
                    current: show === "paid",
                  },
                ]}
              />
            </div>
            {show === "due" ? (
              rows.length === 0 ? (
                <EmptyState
                  icon={<Receipt aria-hidden />}
                  title="Nothing still to come."
                  description="Add the camp's bills, and fees show here once members pledge."
                />
              ) : (
                <MoneyLines rows={rows} />
              )
            ) : paid === 0 ? (
              <EmptyState
                icon={<Receipt aria-hidden />}
                title="No bills paid yet."
                description="A bill shows here once it is marked paid."
              />
            ) : (
              <PaidLines rows={paidRows(data.bills)} />
            )}
          </section>

          <BankBalance
            balances={data.balances.map((b) => ({
              id: b.id,
              amountCents: b.amountCents,
              asOf: b.asOf,
              recordedBy: b.recordedBy,
            }))}
          />
        </div>
      )}
    </PaymentsFrame>
  );
}
