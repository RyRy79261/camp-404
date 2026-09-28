import Link from "next/link";
import { Users } from "lucide-react";
import { campDayKey, formatMoney, sumMinor } from "@camp404/core";
import { Badge } from "@camp404/ui/components/badge";
import { Card, CardContent } from "@camp404/ui/components/card";
import { EmptyState } from "@camp404/ui/components/empty-state";
import {
  ResponsiveDataTable,
  type ResponsiveColumn,
} from "@camp404/ui/components/responsive-data-table";
import { cn } from "@camp404/ui/lib/utils";
import { PaymentsFrame } from "@/components/dues/payments-frame";
import { captainPageGate } from "@/lib/captain-gate";
import { getDuesYear, listDuesAccounts, type DuesAccountRow } from "@/lib/dues";
import { memberDuesPath, PAYMENTS_OWING_PATH } from "@/lib/dues-copy";
import { balanceLabel, formatDay, PLACE_WORDS } from "@/lib/dues-view";
import { keepsMoney } from "@/lib/money-gate";
import { ledgerCycle } from "@/lib/payments";

export const dynamic = "force-dynamic";

export const metadata = { title: "Who owes what — Camp 404" };

// Who owes what (#240): every approved member's dues for the year, for the
// Finance team (captains and Finance leads). The balance is charges less
// payments received or waived, plus refunds paid out. Filtered in the URL:
// members who owe, members with something to check (a payment they sent in,
// or a refund they asked for), or everyone. A row opens the member's account.

const SHOW = ["owing", "check", "all"] as const;
type Show = (typeof SHOW)[number];

const TONE = {
  owes: "warning",
  clear: "success",
  credit: "secondary",
  none: "outline",
} as const;

function shown(rows: DuesAccountRow[], show: Show): DuesAccountRow[] {
  if (show === "owing") return rows.filter((r) => r.balance.balanceCents > 0);
  if (show === "check") {
    return rows.filter((r) => r.pendingProofs > 0 || r.openRefunds > 0);
  }
  return rows;
}

const COLUMNS: ResponsiveColumn<DuesAccountRow>[] = [
  {
    id: "member",
    header: "Member",
    role: "title",
    cellClassName: "whitespace-normal",
    cell: (r) => (
      <span className="flex min-w-0 flex-col gap-0.5">
        <Link
          href={memberDuesPath(r.userId)}
          className="font-medium hover:text-accent"
        >
          {r.name}
        </Link>
        {r.refCode && (
          <span className="font-mono text-xs text-muted-foreground">
            {r.refCode}
          </span>
        )}
      </span>
    ),
  },
  {
    id: "place",
    header: "This year",
    cell: (r) =>
      r.participation ? (
        PLACE_WORDS[r.participation]
      ) : (
        <span className="text-muted-foreground">No answer</span>
      ),
  },
  {
    id: "fee",
    header: "Camp fee",
    cell: (r) =>
      r.feeCents !== null ? (
        <span className="flex flex-wrap items-center gap-1.5">
          <span className="tabular-nums">{formatMoney(r.feeCents)}</span>
          {r.concession && <Badge variant="outline">Concession</Badge>}
        </span>
      ) : r.pledgeCents !== null ? (
        <span className="text-muted-foreground">
          Pledged {formatMoney(r.pledgeCents)}
          {r.pledgeLabel ? ` (${r.pledgeLabel})` : ""}
        </span>
      ) : (
        <span className="text-muted-foreground">No pledge yet</span>
      ),
  },
  {
    id: "next",
    header: "Next instalment",
    cell: (r) =>
      r.next ? (
        <span className="flex flex-wrap items-center gap-1.5">
          <span className="tabular-nums">
            {formatMoney(r.next.amountCents)} by {formatDay(r.next.dueOn)}
          </span>
          {r.next.overdue && <Badge variant="destructive">Late</Badge>}
        </span>
      ) : (
        <span className="text-muted-foreground">None</span>
      ),
  },
  {
    id: "check",
    header: "To check",
    role: "badge",
    cell: (r) =>
      r.pendingProofs > 0 || r.openRefunds > 0 ? (
        <span className="flex flex-wrap gap-1.5">
          {r.pendingProofs > 0 && (
            <Badge variant="warning">
              {r.pendingProofs === 1
                ? "Payment to check"
                : `${r.pendingProofs} payments to check`}
            </Badge>
          )}
          {r.openRefunds > 0 && <Badge variant="warning">Refund asked</Badge>}
        </span>
      ) : null,
  },
  {
    id: "balance",
    header: "Balance",
    align: "right",
    cellClassName: "whitespace-nowrap font-medium tabular-nums",
    cell: (r) => {
      const label = balanceLabel(r.balance);
      return label.tone === "owes" ? (
        label.text
      ) : (
        <Badge variant={TONE[label.tone]}>{label.text}</Badge>
      );
    },
  },
];

export default async function WhoOwesWhatPage({
  searchParams,
}: {
  searchParams: Promise<{ show?: string }>;
}) {
  const gate = await captainPageGate("team_lead");
  const cleared = gate.cleared && (await keepsMoney(gate));
  const { show: raw } = await searchParams;
  const show: Show = (SHOW as readonly string[]).includes(raw ?? "")
    ? (raw as Show)
    : "owing";

  const data = cleared
    ? await (async () => {
        const cycle = await ledgerCycle();
        const [rows, year] = await Promise.all([
          listDuesAccounts(cycle, campDayKey(new Date())),
          getDuesYear(cycle),
        ]);
        return { rows, year };
      })()
    : null;

  const owing = data?.rows.filter((r) => r.balance.balanceCents > 0) ?? [];
  const visible = data ? shown(data.rows, show) : [];

  return (
    <PaymentsFrame
      active={PAYMENTS_OWING_PATH}
      title="Who owes what"
      description="Each member's camp fee, other charges and what they've paid this year. Open a member to change their fee, add a charge or set up a payment plan."
      cleared={data !== null}
    >
      {data && (
        <div className="flex flex-col gap-6">
          <div className="grid gap-3 page-sm:grid-cols-3">
            <Card>
              <CardContent className="flex flex-col gap-1 p-4">
                <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Still to come in
                </span>
                <span className="text-2xl font-bold tabular-nums">
                  {formatMoney(
                    sumMinor(owing.map((r) => r.balance.balanceCents)),
                  )}
                </span>
                <span className="text-xs text-muted-foreground">
                  {owing.length === 1
                    ? "1 member owes money"
                    : `${owing.length} members owe money`}
                </span>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex flex-col gap-1 p-4">
                <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Received
                </span>
                <span className="text-2xl font-bold tabular-nums">
                  {formatMoney(
                    sumMinor(data.rows.map((r) => r.balance.paidCents)),
                  )}
                </span>
                <span className="text-xs text-muted-foreground">
                  Received or waived this year
                </span>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex flex-col gap-1 p-4">
                <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Deadline
                </span>
                <span className="text-2xl font-bold">
                  {data.year.deadline
                    ? formatDay(data.year.deadline)
                    : "Not set"}
                </span>
                <span className="text-xs text-muted-foreground">
                  Set it under Fees and dates
                </span>
              </CardContent>
            </Card>
          </div>

          <nav
            aria-label="Show"
            className="inline-flex w-full rounded-md border p-1 page-sm:w-auto page-sm:self-start"
          >
            {(
              [
                ["owing", "Owe money"],
                ["check", "To check"],
                ["all", "Everyone"],
              ] as const
            ).map(([value, label]) => (
              <Link
                key={value}
                href={`${PAYMENTS_OWING_PATH}?show=${value}`}
                aria-current={show === value ? "page" : undefined}
                className={cn(
                  "flex-1 whitespace-nowrap rounded-sm px-3 py-2 text-center text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  show === value
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {label}
              </Link>
            ))}
          </nav>

          {visible.length === 0 ? (
            <EmptyState
              icon={<Users aria-hidden />}
              title={
                show === "owing"
                  ? "Nobody owes money right now."
                  : show === "check"
                    ? "Nothing to check."
                    : "No approved members yet."
              }
              description={
                show === "owing"
                  ? "Members show here once they are charged a fee and have not paid it all."
                  : "Payments members send in and refunds they ask for show here."
              }
            />
          ) : (
            <ResponsiveDataTable
              columns={COLUMNS}
              data={visible}
              getRowKey={(r) => r.userId}
              label="Members' dues"
              className="page-md:rounded-xl page-md:border page-md:bg-card page-md:shadow-sm"
            />
          )}
        </div>
      )}
    </PaymentsFrame>
  );
}
