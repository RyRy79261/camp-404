import Link from "next/link";
import { ChevronRight, Printer } from "lucide-react";
import { formatMoney, RENTAL_SOURCE_LABELS } from "@camp404/core";
import { Button } from "@camp404/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@camp404/ui/components/card";
import {
  ResponsiveDataTable,
  type ResponsiveColumn,
} from "@camp404/ui/components/responsive-data-table";
import { RentalFrame } from "@/components/rental/rental-frame";
import { captainPageGate } from "@/lib/captain-gate";
import { ledgerCycle } from "@/lib/payments";
import { getRentalOverview } from "@/lib/rental";
import {
  RENTAL_PATH,
  RENTAL_PRINT_PATH,
  RENTAL_SUMMARY_PATH,
  rentalOrderPath,
} from "@/lib/rental-copy";
import { runsRental } from "@/lib/rental-gate";
import { nameList, ownTentText, tentNeedText } from "@/lib/rental-view";

export const dynamic = "force-dynamic";

export const metadata = { title: "Gear rental summary — Camp 404" };

type SummaryRow = Awaited<
  ReturnType<typeof getRentalOverview>
>["summary"]["rows"][number];

type TentRow = Awaited<ReturnType<typeof getRentalOverview>>["tents"][number];

const count = (n: number) => (
  <span className={n === 0 ? "text-muted-foreground" : undefined}>{n}</span>
);

/** A short one-line header, with what it means as its tooltip. */
const head = (short: string, full: string) => <span title={full}>{short}</span>;

/** Number columns: narrow, right-aligned, figures in one width. */
const NUMBER = {
  align: "right",
  headClassName: "w-20 whitespace-nowrap",
  cellClassName: "w-20 whitespace-nowrap tabular-nums",
} as const;

// Seven columns, in the shared table: a table where the window has room for
// it, and a card per item where it has not (a phone), never a table scrolled
// sideways. The item's name is the wide column and stays on one line; the
// numbers are narrow, with short headers whose tooltip says the whole thing.
const BY_ITEM_COLUMNS: ResponsiveColumn<SummaryRow>[] = [
  {
    id: "item",
    header: "Item",
    role: "title",
    cellClassName: "whitespace-nowrap font-medium",
    cell: (row) => row.name,
  },
  {
    id: "camp",
    header: head("Camp", "Members, from camp stock"),
    ...NUMBER,
    cell: (row) => count(row.campCount),
  },
  {
    id: "supplier",
    header: head("Supplier", "Members, from the supplier"),
    ...NUMBER,
    cell: (row) => count(row.supplierCount),
  },
  {
    id: "reserve",
    header: head("Spares", "Spares kept for on site"),
    ...NUMBER,
    cell: (row) =>
      row.reserveCount === 0 ? (
        count(0)
      ) : (
        <span
          title={`From ${RENTAL_SOURCE_LABELS[row.reserveSource].toLowerCase()}`}
        >
          {row.reserveCount}
        </span>
      ),
  },
  {
    id: "storage",
    header: head("From storage", "Take out of storage"),
    ...NUMBER,
    cellClassName: `${NUMBER.cellClassName} font-semibold`,
    cell: (row) => row.fromStorage,
  },
  {
    id: "left",
    header: head("Left", "Camp stock left after this"),
    ...NUMBER,
    cell: (row) =>
      row.campStockCount === null ? (
        <span
          className="text-muted-foreground"
          title="The camp owns none of these"
        >
          &ndash;
        </span>
      ) : (
        `${row.campStockLeft} of ${row.campStockCount}`
      ),
  },
  {
    id: "order",
    header: head("To order", "Order from the supplier"),
    ...NUMBER,
    cellClassName: `${NUMBER.cellClassName} font-semibold`,
    cell: (row) => row.toOrder,
  },
];

// The confirmed tents: the label in a column of its own (the one thing a
// member writes down), then the tent and who sleeps in it.
const TENT_COLUMNS: ResponsiveColumn<TentRow>[] = [
  {
    id: "label",
    header: "Label",
    headClassName: "w-24",
    cellClassName: "w-24 whitespace-nowrap text-lg font-bold",
    cell: (tent) =>
      tent.tentLabel ?? (
        <span className="text-sm font-normal text-muted-foreground">
          No label
        </span>
      ),
  },
  {
    id: "tent",
    header: "Tent",
    role: "title",
    cell: (tent) => (
      <span className="flex flex-col gap-1">
        {tent.itemName}
        {tent.people !== null && tent.people > tent.sleeps && (
          <span className="text-xs font-normal text-warning">
            Sleeps {tent.sleeps}, for {tent.people}
          </span>
        )}
      </span>
    ),
  },
  {
    id: "sleepers",
    header: "Who sleeps in it",
    cell: (tent) => nameList([tent.ownerName, ...tent.sharers]),
  },
];

// What the camp orders and what comes out of storage (#241), for captains:
// totals by item across the CONFIRMED orders, split by source, with the
// on-site reserve added to the source it comes from. The supplier column is
// the order the camp places; the camp stock column is what is taken out of
// storage, against how many the camp has. Then the confirmed tents with who
// is in each. This replaces the order sheet: it is read on screen or printed,
// and nothing is exported to a spreadsheet.

export default async function GearRentalSummaryPage() {
  const gate = await captainPageGate("team_lead");
  const cleared = gate.cleared && (await runsRental(gate));
  const overview = cleared
    ? await getRentalOverview(await ledgerCycle())
    : null;
  const summary = overview?.summary;

  return (
    <RentalFrame
      active={RENTAL_SUMMARY_PATH}
      title="Summary"
      description="What to order from the supplier and what to take out of storage, from the confirmed orders."
      cleared={overview !== null}
      actions={
        <Button asChild variant="outline">
          <Link href={RENTAL_PRINT_PATH} target="_blank" rel="noopener">
            <Printer aria-hidden />
            Print sheets
          </Link>
        </Button>
      }
    >
      {overview && summary && (
        <div className="flex flex-col gap-6">
          {overview.waiting > 0 && (
            <p
              role="status"
              className="rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm"
            >
              {overview.waiting === 1
                ? "1 order is sent and not confirmed. It is not counted here yet."
                : `${overview.waiting} orders are sent and not confirmed. They are not counted here yet.`}{" "}
              <Link
                href={RENTAL_PATH}
                className="font-medium text-accent hover:underline"
              >
                Open the orders
              </Link>
            </p>
          )}

          <div className="grid gap-3 page-sm:grid-cols-3">
            <Card>
              <CardContent className="flex flex-col gap-1 p-4">
                <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Order from the supplier
                </span>
                <span className="text-2xl font-bold tabular-nums">
                  {summary.toOrder}
                </span>
                <span className="text-xs text-muted-foreground">
                  Items, with the spares for on site
                </span>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex flex-col gap-1 p-4">
                <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Take out of storage
                </span>
                <span className="text-2xl font-bold tabular-nums">
                  {summary.fromStorage}
                </span>
                <span className="text-xs text-muted-foreground">
                  Items from camp stock
                </span>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex flex-col gap-1 p-4">
                <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Members are charged
                </span>
                <span className="text-2xl font-bold tabular-nums">
                  {formatMoney(summary.chargedCents)}
                </span>
                <span className="text-xs text-muted-foreground">
                  {formatMoney(summary.supplierCents)} supplier,{" "}
                  {formatMoney(summary.campCents)} camp stock
                </span>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="p-5 pb-3">
              <CardTitle className="text-base">By item</CardTitle>
              <CardDescription>
                {overview.confirmed === 1
                  ? "From 1 confirmed order."
                  : `From ${overview.confirmed} confirmed orders.`}
              </CardDescription>
            </CardHeader>
            <CardContent className="p-5 pt-0">
              {summary.rows.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No items in the catalogue yet.
                </p>
              ) : (
                <ResponsiveDataTable
                  columns={BY_ITEM_COLUMNS}
                  data={summary.rows}
                  getRowKey={(row) => row.itemId}
                  label="Totals by item"
                />
              )}
            </CardContent>
          </Card>

          {overview.unassigned.length > 0 && (
            <Card>
              <CardHeader className="p-5 pb-3">
                <CardTitle className="text-base">
                  Tents not assigned yet ({overview.unassigned.length})
                </CardTitle>
                <CardDescription>
                  Sent orders that need a tent. Open one to pick the tent and
                  confirm it.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-5 pt-0">
                <ul
                  aria-label="Needs a tent, not assigned yet"
                  className="divide-y divide-border"
                >
                  {overview.unassigned.map((need) => (
                    <li key={need.orderId}>
                      <Link
                        href={rentalOrderPath(need.userId)}
                        className="group/need flex items-center justify-between gap-4 py-2.5 text-sm"
                      >
                        <span className="flex min-w-0 flex-col gap-0.5 page-sm:flex-row page-sm:items-baseline page-sm:gap-4">
                          <span className="font-medium group-hover/need:text-accent group-hover/need:underline">
                            {need.ownerName}
                          </span>
                          <span className="text-muted-foreground">
                            {tentNeedText(need.people)}
                            {need.sharers.length > 0
                              ? `, with ${nameList(need.sharers)}`
                              : ""}
                          </span>
                        </span>
                        <ChevronRight
                          className="h-4 w-4 shrink-0 text-muted-foreground group-hover/need:text-accent"
                          aria-hidden
                        />
                      </Link>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="p-5 pb-3">
              <CardTitle className="text-base">Tents</CardTitle>
              <CardDescription>
                The tent a captain picked for each confirmed order, its label
                and who sleeps in it. Label a tent on its member&rsquo;s order.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-5 pt-0">
              {overview.tents.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No confirmed tents yet.
                </p>
              ) : (
                <ResponsiveDataTable
                  columns={TENT_COLUMNS}
                  data={overview.tents}
                  getRowKey={(tent) => tent.lineId}
                  label="Tents"
                  stackBelow="sm"
                />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="p-5 pb-3">
              <CardTitle className="text-base">
                Members&rsquo; own tents
              </CardTitle>
              <CardDescription>
                What members bring themselves, from sent and confirmed orders,
                for the site plan.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-5 pt-0">
              {overview.ownTents.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nobody has said they bring a tent yet.
                </p>
              ) : (
                <ul aria-label="Own tents" className="divide-y divide-border">
                  {overview.ownTents.map((tent) => (
                    <li
                      key={tent.orderId}
                      className="flex flex-col gap-0.5 py-2.5 text-sm page-sm:flex-row page-sm:items-center page-sm:justify-between page-sm:gap-4"
                    >
                      <span className="font-medium">
                        {ownTentText({
                          ownDescription: tent.description,
                          ownSleeps: tent.sleeps,
                        }) ?? "Not said"}
                      </span>
                      <span className="text-muted-foreground">
                        {nameList([tent.ownerName, ...tent.sharers])}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </RentalFrame>
  );
}
