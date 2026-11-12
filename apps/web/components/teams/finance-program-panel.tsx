import { Wallet } from "lucide-react";
import {
  campDayKey,
  MONEY_KEEPER,
  paymentFigures,
  sumMinor,
} from "@camp404/core";
import {
  getCampMoney,
  getFeeOverview,
  getMyFeePayment,
} from "@/lib/camp-money";
import { getTeamsConfig } from "@/lib/camp-config";
import { listBudgetTotals, listClaimsForFinance } from "@/lib/claims";
import { ledgerCycle, listPayments } from "@/lib/payments";
import { financeGlance } from "@/lib/team-glance/finance";
import { TeamGlanceCard } from "./team-glance-card";
import type { TeamPanelProps } from "./team-panels";

// The Finance team's own panel on its team page. The viewer split is decided
// HERE, before any read: a member who does not keep the camp's money reads
// only their own fees (the same read as My dues' "Next payment"); a money
// keeper (MONEY_KEEPER: captains and Finance leads) reads the camp's figures
// through the Finance tools' own reads, the test store's twins under E2E.
// Only counts and totals reach the card: no member's name or claim.

export async function FinanceProgramPanel({
  actor,
  viewerId,
  now,
}: TeamPanelProps) {
  const today = campDayKey(now);
  const cycle = await ledgerCycle();

  if (!MONEY_KEEPER.allows(actor)) {
    const mine = await getMyFeePayment(viewerId, cycle, today);
    return (
      <TeamGlanceCard
        id="finance"
        icon={Wallet}
        glance={financeGlance({ view: "member", mine })}
      />
    );
  }

  // getFeeOverview and getCampMoney each read the dues accounts; at a camp
  // of 30 to 80 people that second read is cheaper than a third copy of the
  // forecast's arithmetic.
  const [overview, money, payments, claims, budgets, config] =
    await Promise.all([
      getFeeOverview(cycle, today),
      getCampMoney(cycle, today),
      listPayments(cycle),
      listClaimsForFinance(cycle),
      listBudgetTotals(cycle),
      getTeamsConfig(),
    ]);
  const labels = new Map(config.teams.map((t) => [t.key, t.label]));
  const toPay = claims.filter((c) => c.status === "approved");
  return (
    <TeamGlanceCard
      id="finance"
      icon={Wallet}
      glance={financeGlance({
        view: "keeper",
        today,
        collecting: overview.year.collectingFees,
        totals: overview.totals,
        // A member's proof to check, as the Finance page counts it; a
        // payment Finance recorded as promised is not waiting on anyone.
        pendingPayments: paymentFigures(payments).toCheckCount,
        claimsToPay: {
          count: toPay.length,
          cents: sumMinor(toPay.map((c) => c.amountCents)),
        },
        bills: money.forecast.lines.flatMap((line) =>
          line.kind === "bill"
            ? [{ dueOn: line.dueOn, amountCents: -line.amountCents }]
            : [],
        ),
        inBank: money.forecast.inBank,
        overBudget: Object.entries(budgets).flatMap(([team, totals]) =>
          totals.over && totals.leftCents !== null
            ? [
                {
                  label: labels.get(team) ?? team,
                  overCents: -totals.leftCents,
                },
              ]
            : [],
        ),
      })}
    />
  );
}
