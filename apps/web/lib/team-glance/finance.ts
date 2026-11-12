import {
  formatMoney,
  sumMinor,
  type FeeTotals,
  type NextFeePayment,
} from "@camp404/core";
import { nextPaymentWords, shortDay } from "../pledge-view";
import {
  ATTENTION_LIMIT,
  plural,
  type GlanceAttention,
  type GlanceTile,
  type TeamGlance,
} from "../team-glance";

// The Finance team's panel on its team page ("Camp money"; approved mock-up
// docs/plans/2026-11-12-team-dashboards-mockup.html). Two views, picked on
// the server BEFORE anything is read: a member who does not keep the camp's
// money (MONEY_KEEPER: captains and Finance leads) sees only their own fees;
// a money keeper sees the camp's figures. Pure: the panel reads, this decides
// the words. No member is named, and money goes through formatMoney only.

export const FINANCE_LINKS = {
  myDues: { href: "/dues", label: "My dues" },
  whoOwes: { href: "/captains/payments/members", label: "Who owes what" },
  payments: { href: "/captains/payments", label: "Payments" },
  claims: { href: "/captains/payments/claims", label: "Claims to pay" },
  campMoney: { href: "/captains/payments/camp-money", label: "Camp money" },
  budgets: { href: "/captains/payments/budgets", label: "Budgets" },
} as const;

export const FINANCE_MEMBER_NOTE =
  "The camp's figures are for the Finance leads and captains.";

/** How far ahead "Bills in 30 days" looks. */
export const BILL_WINDOW_DAYS = 30;

/** A member's own fees, as getMyFeePayment reads them. */
export interface MemberFees {
  feeTotalCents: number;
  paidCents: number;
  owingCents: number;
  subsidy: boolean;
  next: NextFeePayment;
}

/** One bill payment not paid yet (the forecast's bill line, money out > 0). */
export interface UnpaidBill {
  dueOn: string;
  amountCents: number;
}

export type FinanceGlanceInput =
  | { view: "member"; mine: MemberFees | null }
  | {
      view: "keeper";
      /** "YYYY-MM-DD" on the camp's clock. */
      today: string;
      collecting: boolean;
      totals: Pick<
        FeeTotals,
        "pledgedCents" | "paidCents" | "paidUpCount" | "nextDue"
      >;
      /** Payments with proof sent, waiting to be checked. */
      pendingPayments: number;
      /** Claims a lead said yes to, not paid yet. */
      claimsToPay: { count: number; cents: number };
      bills: readonly UnpaidBill[];
      inBank: { amountCents: number; asOf: string } | null;
      /** Teams spending past their budget, with their labels. */
      overBudget: readonly { label: string; overCents: number }[];
    };

function addDays(day: string, n: number): string {
  const at = Date.UTC(
    Number(day.slice(0, 4)),
    Number(day.slice(5, 7)) - 1,
    Number(day.slice(8, 10)) + n,
  );
  return new Date(at).toISOString().slice(0, 10);
}

function memberGlance(mine: MemberFees | null): TeamGlance {
  const attention: GlanceAttention[] = [];
  let tile: GlanceTile;
  if (!mine || mine.feeTotalCents === 0) {
    tile = {
      key: "mine",
      label: "Your fees",
      value: "Nothing yet",
      hint: "No fee is set for you yet.",
    };
  } else if (mine.owingCents === 0) {
    tile = {
      key: "mine",
      label: "Your fees",
      value: "Paid up",
      hint: `${formatMoney(mine.paidCents)} paid. Thank you!`,
      tone: "ok",
      progress: { value: 1, max: 1 },
    };
  } else if (mine.subsidy) {
    tile = {
      key: "mine",
      label: "Your fees",
      value: `${formatMoney(mine.owingCents)} left`,
      hint: "You asked for a subsidy: the Finance team will talk to you first.",
      progress: { value: mine.paidCents, max: mine.feeTotalCents },
    };
  } else {
    const words = nextPaymentWords(mine.next, mine);
    tile = {
      key: "mine",
      label: "Your fees",
      value: `${formatMoney(mine.owingCents)} left`,
      hint: `of ${formatMoney(mine.feeTotalCents)}${words ? ` · next: ${words.figure}` : ""}`,
      tone: words?.overdue ? "bad" : undefined,
      progress: { value: mine.paidCents, max: mine.feeTotalCents },
    };
    if (words?.overdue) {
      attention.push({
        key: "overdue",
        tone: "bad",
        text: `${words.short}.`,
        link: FINANCE_LINKS.myDues,
      });
    }
  }
  return {
    title: "Camp money",
    tiles: [tile],
    attention,
    links: [FINANCE_LINKS.myDues],
    note: FINANCE_MEMBER_NOTE,
  };
}

export function financeGlance(input: FinanceGlanceInput): TeamGlance {
  if (input.view === "member") return memberGlance(input.mine);

  const { totals, claimsToPay, pendingPayments, today } = input;
  const until = addDays(today, BILL_WINDOW_DAYS);
  const soon = input.bills.filter((b) => b.dueOn <= until);
  const overdue = input.bills.filter((b) => b.dueOn < today);
  const soonCents = sumMinor(soon.map((b) => b.amountCents));

  const tiles: GlanceTile[] = [
    {
      key: "collected",
      label: "Fees collected",
      value: formatMoney(totals.paidCents),
      hint:
        totals.pledgedCents > 0
          ? `of ${formatMoney(totals.pledgedCents)} pledged · ${plural(totals.paidUpCount, "person", "people")} paid up`
          : "Nobody coming has pledged yet",
      progress:
        totals.pledgedCents > 0
          ? { value: totals.paidCents, max: totals.pledgedCents }
          : undefined,
    },
    {
      key: "payments",
      label: "Payments to check",
      value: String(pendingPayments),
      hint:
        pendingPayments > 0
          ? "proof sent, not confirmed yet"
          : "nothing waiting",
      tone: pendingPayments > 0 ? "warn" : undefined,
    },
    {
      key: "claims",
      label: "Claims to pay",
      value: String(claimsToPay.count),
      hint:
        claimsToPay.count > 0
          ? `${formatMoney(claimsToPay.cents)}, approved by a lead`
          : "nothing approved and unpaid",
      tone: claimsToPay.count > 0 ? "warn" : undefined,
    },
    {
      key: "bills",
      label: `Bills in ${BILL_WINDOW_DAYS} days`,
      value: formatMoney(soonCents),
      hint: [
        plural(soon.length, "payment"),
        input.inBank
          ? `${formatMoney(input.inBank.amountCents)} in the bank`
          : "no bank balance typed in yet",
      ].join(" · "),
      tone: overdue.length > 0 ? "bad" : undefined,
    },
  ];

  const attention: GlanceAttention[] = [];
  if (overdue.length > 0) {
    attention.push({
      key: "bills-overdue",
      tone: "bad",
      text: `${plural(overdue.length, "bill payment")} ${overdue.length === 1 ? "is" : "are"} overdue.`,
      link: FINANCE_LINKS.campMoney,
    });
  }
  for (const team of input.overBudget) {
    attention.push({
      key: `over-${team.label}`,
      tone: "bad",
      text: `${team.label} is ${formatMoney(team.overCents)} over its budget.`,
      link: FINANCE_LINKS.budgets,
    });
  }
  if (pendingPayments > 0) {
    attention.push({
      key: "payments",
      tone: "warn",
      text: `${plural(pendingPayments, "payment")} ${pendingPayments === 1 ? "is" : "are"} waiting to be confirmed.`,
      link: FINANCE_LINKS.payments,
    });
  }
  if (claimsToPay.count > 0) {
    attention.push({
      key: "claims",
      tone: "warn",
      text: `${plural(claimsToPay.count, "approved claim")} ${claimsToPay.count === 1 ? "is" : "are"} waiting to be paid.`,
      link: FINANCE_LINKS.claims,
    });
  }
  if (!input.collecting) {
    attention.push({
      key: "collecting",
      tone: "warn",
      text: "Collecting fees is off, so members are not asked to pay yet.",
      link: FINANCE_LINKS.whoOwes,
    });
  } else if (totals.nextDue) {
    attention.push({
      key: "next-due",
      tone: "ok",
      text: `Next fees due: ${formatMoney(totals.nextDue.amountCents)} from ${plural(totals.nextDue.count, "person", "people")} by ${shortDay(totals.nextDue.dueOn)}.`,
      link: FINANCE_LINKS.whoOwes,
    });
  }

  return {
    title: "Camp money",
    tiles,
    attention: attention.slice(0, ATTENTION_LIMIT),
    links: [
      FINANCE_LINKS.whoOwes,
      FINANCE_LINKS.payments,
      FINANCE_LINKS.claims,
      FINANCE_LINKS.campMoney,
      FINANCE_LINKS.budgets,
    ],
  };
}
