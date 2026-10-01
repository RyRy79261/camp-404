import Link from "next/link";
import { ChevronRight, Users } from "lucide-react";
import { campDayKey, formatMoney } from "@camp404/core";
import { Badge } from "@camp404/ui/components/badge";
import { EmptyState } from "@camp404/ui/components/empty-state";
import {
  ResponsiveDataTable,
  type ResponsiveColumn,
} from "@camp404/ui/components/responsive-data-table";
import { cn } from "@camp404/ui/lib/utils";
import { DuesStats, duesStatsFigures } from "@/components/dues/dues-stats";
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
// payments received or excused, plus refunds paid out. Filtered in the URL:
// members who owe, members with something to check (a proof they sent in, a
// payment recorded as promised, or a refund they asked for), or everyone. A
// row opens the member's account. The balance is always a figure (R 0,00
// dimmed), and what the row needs sits in its own Status chip, so the money
// lines up down the right edge. The columns keep their widths across the
// filters, and Next instalment shows only when someone has a plan.

const SHOW = ["owing", "check", "all"] as const;
type Show = (typeof SHOW)[number];

function shown(rows: DuesAccountRow[], show: Show): DuesAccountRow[] {
  if (show === "owing") return rows.filter((r) => r.balance.balanceCents > 0);
  if (show === "check") {
    return rows.filter(
      (r) =>
        r.pendingProofs > 0 || r.figures.promisedCount > 0 || r.openRefunds > 0,
    );
  }
  return rows;
}

/** The status chip: what Finance has to do, else where the balance stands. */
function statusChips(r: DuesAccountRow) {
  const chips: {
    text: string;
    variant: "warning" | "success" | "secondary" | "outline";
  }[] = [];
  if (r.pendingProofs > 0) {
    chips.push({
      text:
        r.pendingProofs === 1
          ? "Proof to check"
          : `${r.pendingProofs} proofs to check`,
      variant: "warning",
    });
  }
  if (r.figures.promisedCount > 0) {
    chips.push({ text: "Promised", variant: "warning" });
  }
  if (r.openRefunds > 0)
    chips.push({ text: "Refund asked", variant: "warning" });
  if (chips.length === 0) {
    const label = balanceLabel(r.balance);
    if (label.tone === "clear")
      chips.push({ text: "Paid up", variant: "success" });
    else if (label.tone === "credit")
      chips.push({ text: "To give back", variant: "secondary" });
    else if (label.tone === "none")
      chips.push({ text: "Nothing charged", variant: "outline" });
  }
  return chips;
}

function columns(withPlan: boolean): ResponsiveColumn<DuesAccountRow>[] {
  return [
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
            <span className="font-mono text-xs tracking-normal text-muted-foreground">
              {r.refCode}
            </span>
          )}
        </span>
      ),
    },
    {
      id: "place",
      header: "Place",
      headClassName: "w-32",
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
      headClassName: "w-48",
      cell: (r) =>
        r.feeCents !== null ? (
          <span className="flex flex-wrap items-center gap-1.5">
            <span className="tabular-nums">{formatMoney(r.feeCents)}</span>
            {r.concession && <Badge variant="outline">Lowered</Badge>}
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
    ...(withPlan
      ? [
          {
            id: "next",
            header: "Next instalment",
            headClassName: "w-44",
            cell: (r: DuesAccountRow) =>
              r.next ? (
                <span className="flex flex-wrap items-center gap-1.5">
                  <span className="tabular-nums">
                    {formatMoney(r.next.amountCents)} by{" "}
                    {formatDay(r.next.dueOn)}
                  </span>
                  {r.next.overdue && <Badge variant="destructive">Late</Badge>}
                </span>
              ) : null,
          } satisfies ResponsiveColumn<DuesAccountRow>,
        ]
      : []),
    {
      id: "status",
      header: "Status",
      role: "badge",
      headClassName: "w-40",
      cell: (r) => (
        <span className="flex flex-wrap gap-1.5">
          {statusChips(r).map((chip) => (
            <Badge key={chip.text} variant={chip.variant}>
              {chip.text}
            </Badge>
          ))}
        </span>
      ),
    },
    {
      id: "balance",
      header: "Balance",
      align: "right",
      headClassName: "w-32",
      cellClassName: "whitespace-nowrap font-medium tabular-nums",
      cell: (r) =>
        r.balance.balanceCents > 0 ? (
          formatMoney(r.balance.balanceCents)
        ) : r.balance.balanceCents < 0 ? (
          <span className="text-muted-foreground">
            − {formatMoney(-r.balance.balanceCents)}
          </span>
        ) : (
          <span className="text-muted-foreground">{formatMoney(0)}</span>
        ),
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
          <DuesStats
            figures={duesStatsFigures(data.rows)}
            deadline={data.year.deadline}
          />

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
              columns={columns(visible.some((r) => r.next !== null))}
              data={visible}
              getRowKey={(r) => r.userId}
              label="Members' dues"
              framed
            />
          )}
        </div>
      )}
    </PaymentsFrame>
  );
}
