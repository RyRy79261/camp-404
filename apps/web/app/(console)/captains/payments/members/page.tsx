import Link from "next/link";
import { ChevronRight, Users } from "lucide-react";
import {
  campDayKey,
  feeTimingShortLabel,
  formatMoney,
  isComingThisYear,
} from "@camp404/core";
import { Badge } from "@camp404/ui/components/badge";
import { EmptyState } from "@camp404/ui/components/empty-state";
import {
  ResponsiveDataTable,
  type ResponsiveColumn,
} from "@camp404/ui/components/responsive-data-table";
import { FilterLinks, MoneyFigures } from "@/components/dues/money-kit";
import { PaymentsFrame } from "@/components/dues/payments-frame";
import { getFeeOverview, type FeeOverviewRow } from "@/lib/camp-money";
import { shortDay } from "@/lib/camp-money-view";
import { memberDuesPath, PAYMENTS_OWING_PATH } from "@/lib/dues-copy";
import { feeReminderPreview } from "@/lib/fee-reminders";
import { ledgerCycle } from "@/lib/payments";
import { programPage } from "@/lib/program-page";
import { CollectingSwitch } from "./collecting-switch";
import { FeeReminderButtons } from "./fee-reminders";

export const dynamic = "force-dynamic";

export const metadata = { title: "Who owes what — Camp 404" };

// Who owes what (#240; camp fees sprint, mock-up step 2): every approved
// member's pledge (their own amount, with the nearest name on the Join site's
// scale under it), when they said they can pay, what they paid, what they
// still owe and their next instalment, for the Finance team (captains and
// Finance leads). Filtered in the URL: Coming, Maybe, Owe money, Subsidy,
// Everyone, and "To check" while a proof or a promised payment waits. The
// "Collecting fees" switch and the two reminder buttons sit above. A row opens
// the member's account.

const SHOW = ["coming", "maybe", "owing", "subsidy", "check", "all"] as const;
type Show = (typeof SHOW)[number];

const FILTERS: Record<Show, (r: FeeOverviewRow) => boolean> = {
  coming: (r) => isComingThisYear(r.participation),
  maybe: (r) => r.participation === "maybe",
  owing: (r) => r.feeOwingCents > 0,
  subsidy: (r) => r.subsidy,
  check: (r) =>
    r.pendingProofs > 0 || r.figures.promisedCount > 0 || r.openRefunds > 0,
  all: () => true,
};

const EMPTY: Record<Show, string> = {
  coming: "Nobody has said Coming yet.",
  maybe: "Nobody said Maybe.",
  owing: "Nobody owes money right now.",
  subsidy: "Nobody asked for a subsidy.",
  check: "Nothing to check.",
  all: "No approved members yet.",
};

function money(cents: number) {
  return formatMoney(cents);
}

/** What Finance has to check on a row: proofs sent in, promised, refunds. */
function checkChips(r: FeeOverviewRow): string[] {
  const chips: string[] = [];
  if (r.pendingProofs > 0) {
    chips.push(
      r.pendingProofs === 1
        ? "Proof to check"
        : `${r.pendingProofs} proofs to check`,
    );
  }
  if (r.figures.promisedCount > 0) chips.push("Promised");
  if (r.openRefunds > 0) chips.push("Refund asked");
  return chips;
}

function columns(): ResponsiveColumn<FeeOverviewRow>[] {
  return [
    {
      id: "member",
      header: "Member",
      role: "title",
      cellClassName: "whitespace-normal",
      cell: (r) => (
        <span className="flex min-w-0 flex-col items-start gap-1">
          <Link
            href={memberDuesPath(r.userId)}
            className="font-medium hover:text-accent"
          >
            {r.name}
          </Link>
          {(r.subsidy || checkChips(r).length > 0) && (
            <span className="flex flex-wrap gap-1">
              {r.subsidy && (
                <Badge variant="secondary">Subsidy: talk to them</Badge>
              )}
              {checkChips(r).map((chip) => (
                <Badge key={chip} variant="warning">
                  {chip}
                </Badge>
              ))}
            </span>
          )}
        </span>
      ),
    },
    {
      id: "pledged",
      header: "Pledged",
      align: "right",
      headClassName: "w-36",
      cell: (r) =>
        r.pledgeCents === null && r.feeCents === null ? (
          <span className="text-muted-foreground">No pledge yet</span>
        ) : (
          <span className="flex flex-col items-end">
            <span className="tabular-nums">{money(r.feeTotalCents)}</span>
            {r.scaleName && (
              <span className="text-xs text-muted-foreground">
                {r.subsidy && r.feeTotalCents === 0
                  ? "Subsidy"
                  : r.scaleName.exact
                    ? r.scaleName.name
                    : `near ${r.scaleName.name}`}
              </span>
            )}
          </span>
        ),
    },
    {
      id: "when",
      header: "When they can pay",
      headClassName: "w-44",
      cell: (r) =>
        r.payBy ? (
          feeTimingShortLabel(r.payBy, r.burnYear)
        ) : (
          <span className="text-muted-foreground">Not answered</span>
        ),
    },
    {
      id: "paid",
      header: "Paid",
      align: "right",
      headClassName: "w-32",
      cellClassName: "whitespace-nowrap tabular-nums",
      cell: (r) => money(r.balance.paidCents),
    },
    {
      id: "owing",
      header: "Still owing",
      align: "right",
      headClassName: "w-32",
      cellClassName: "whitespace-nowrap tabular-nums",
      cell: (r) =>
        r.feeOwingCents > 0 ? (
          money(r.feeOwingCents)
        ) : (
          <span className="text-muted-foreground">{money(0)}</span>
        ),
    },
    {
      id: "next",
      header: "Next instalment",
      headClassName: "w-44",
      cell: (r) => {
        const next = r.feeNext;
        switch (next.kind) {
          case "due":
            return (
              <span className="flex flex-wrap items-center gap-1.5">
                <span className="tabular-nums">
                  {money(next.amountCents)} by {shortDay(next.dueOn)}
                </span>
                {next.overdue && <Badge variant="destructive">Late</Badge>}
              </span>
            );
          case "paid_up":
            return <Badge variant="success">Paid up</Badge>;
          case "no_date":
            return <span className="text-muted-foreground">No date yet</span>;
          case "subsidy":
            return <span className="text-muted-foreground">After a talk</span>;
          case "no_pledge":
            return <span className="text-muted-foreground">—</span>;
        }
      },
    },
    {
      id: "open",
      header: "Open",
      role: "actions",
      hideHeader: true,
      mobileHidden: true,
      cell: (r) => (
        // The row's cue that it opens; the name is the link a reader uses.
        <Link
          href={memberDuesPath(r.userId)}
          aria-hidden
          tabIndex={-1}
          className="flex text-muted-foreground hover:text-foreground"
        >
          <ChevronRight className="h-4 w-4" />
        </Link>
      ),
    },
  ];
}

export default async function WhoOwesWhatPage({
  searchParams,
}: {
  searchParams: Promise<{ show?: string }>;
}) {
  const gate = await programPage("payments");
  const { show: raw } = await searchParams;
  const show: Show = (SHOW as readonly string[]).includes(raw ?? "")
    ? (raw as Show)
    : "coming";

  const data = gate.allowed
    ? await (async () => {
        const cycle = await ledgerCycle();
        const today = campDayKey(new Date());
        const [overview, preview] = await Promise.all([
          getFeeOverview(cycle, today),
          feeReminderPreview(cycle, today),
        ]);
        return { cycle, overview, preview };
      })()
    : null;

  const rows = data?.overview.rows ?? [];
  const visible = rows.filter(FILTERS[show]);
  const count = (s: Show) => rows.filter(FILTERS[s]).length;
  const t = data?.overview.totals;
  const toCheck = count("check");

  return (
    <PaymentsFrame
      active={PAYMENTS_OWING_PATH}
      title="Who owes what"
      description="Each member's pledge, when they said they can pay, and what they have paid this year."
      actions={data ? <FeeReminderButtons preview={data.preview} /> : null}
      cleared={data !== null}
    >
      {data && t && (
        <div className="flex flex-col gap-6">
          <CollectingSwitch
            on={data.overview.year.collectingFees}
            version={data.overview.year.version}
          />

          <MoneyFigures
            label="This year's fees"
            figures={[
              {
                term: "Pledged",
                value: money(t.pledgedCents),
                hint: `${t.comingCount} said Coming${
                  t.subsidyCount > 0
                    ? ` · ${t.subsidyCount} ${t.subsidyCount === 1 ? "asks" : "ask"} for a subsidy`
                    : ""
                }`,
              },
              {
                term: "Paid",
                value: money(t.paidCents),
                hint: `${t.paidUpCount} paid up · ${t.partPaidCount} part paid`,
              },
              {
                term: "Still expected",
                value: money(t.stillExpectedCents),
                hint:
                  t.owingCount === 1
                    ? "1 member owes"
                    : `${t.owingCount} members owe`,
              },
              t.nextDue
                ? {
                    term: `Due by ${shortDay(t.nextDue.dueOn)}`,
                    value: money(t.nextDue.amountCents),
                    hint:
                      t.nextDue.count === 1
                        ? "1 member"
                        : `${t.nextDue.count} members`,
                  }
                : { term: "Next due", value: "—", hint: "No fee days yet" },
            ]}
          />

          <FilterLinks
            label="Show"
            links={[
              ...(
                [
                  ["coming", "Coming"],
                  ["maybe", "Maybe"],
                  ["owing", "Owe money"],
                  ["subsidy", "Subsidy"],
                ] as const
              ).map(([value, label]) => ({
                href: `${PAYMENTS_OWING_PATH}?show=${value}`,
                label,
                count: count(value),
                current: show === value,
              })),
              ...(toCheck > 0 || show === "check"
                ? [
                    {
                      href: `${PAYMENTS_OWING_PATH}?show=check`,
                      label: "To check",
                      count: toCheck,
                      current: show === "check",
                    },
                  ]
                : []),
              {
                href: `${PAYMENTS_OWING_PATH}?show=all`,
                label: "Everyone",
                current: show === "all",
              },
            ]}
          />

          {visible.length === 0 ? (
            <EmptyState icon={<Users aria-hidden />} title={EMPTY[show]} />
          ) : (
            <ResponsiveDataTable
              columns={columns()}
              data={visible}
              getRowKey={(r) => r.userId}
              label="Members' fees"
              framed
            />
          )}
        </div>
      )}
    </PaymentsFrame>
  );
}
