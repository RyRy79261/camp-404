import Link from "next/link";
import { Printer } from "lucide-react";
import { formatMoney, RENTAL_SOURCE_LABELS } from "@camp404/core";
import { Badge } from "@camp404/ui/components/badge";
import { Button } from "@camp404/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@camp404/ui/components/card";
import { RentalFrame } from "@/components/rental/rental-frame";
import { captainPageGate } from "@/lib/captain-gate";
import { ledgerCycle } from "@/lib/payments";
import { getRentalOverview } from "@/lib/rental";
import {
  RENTAL_PATH,
  RENTAL_PRINT_PATH,
  RENTAL_SUMMARY_PATH,
} from "@/lib/rental-copy";
import { runsRental } from "@/lib/rental-gate";
import { nameList, quantityText } from "@/lib/rental-view";

export const dynamic = "force-dynamic";

export const metadata = { title: "Gear rental summary — Camp 404" };

// What the camp orders and what comes out of storage (#241), for captains:
// totals by item across the CONFIRMED orders, split by source, with the
// adoptee reserve added to the source it comes from. The supplier column is
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
                  Items, with the adoptee reserve
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
                <div className="overflow-x-auto">
                  <table
                    aria-label="Totals by item"
                    className="w-full min-w-[40rem] border-collapse text-sm"
                  >
                    <thead>
                      <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                        <th className="py-2 pr-3 font-medium">Item</th>
                        <th className="px-3 py-2 text-right font-medium">
                          Members, camp stock
                        </th>
                        <th className="px-3 py-2 text-right font-medium">
                          Members, supplier
                        </th>
                        <th className="px-3 py-2 text-right font-medium">
                          Adoptee reserve
                        </th>
                        <th className="px-3 py-2 text-right font-medium">
                          Out of storage
                        </th>
                        <th className="px-3 py-2 text-right font-medium">
                          Camp stock left
                        </th>
                        <th className="py-2 pl-3 text-right font-medium">
                          Order from supplier
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {summary.rows.map((row) => (
                        <tr
                          key={row.itemId}
                          className="border-b border-border/60 last:border-0"
                        >
                          <th
                            scope="row"
                            className="py-2.5 pr-3 text-left font-medium"
                          >
                            {row.name}
                          </th>
                          <td className="px-3 py-2.5 text-right tabular-nums">
                            {row.campCount}
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums">
                            {row.supplierCount}
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums">
                            {row.reserveCount === 0 ? (
                              <span className="text-muted-foreground">0</span>
                            ) : (
                              <>
                                {row.reserveCount}{" "}
                                <span className="text-xs text-muted-foreground">
                                  {RENTAL_SOURCE_LABELS[
                                    row.reserveSource
                                  ].toLowerCase()}
                                </span>
                              </>
                            )}
                          </td>
                          <td className="px-3 py-2.5 text-right font-semibold tabular-nums">
                            {row.fromStorage}
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums">
                            {row.campStockCount === null ? (
                              <span className="text-muted-foreground">
                                None owned
                              </span>
                            ) : (
                              `${row.campStockLeft} of ${row.campStockCount}`
                            )}
                          </td>
                          <td className="py-2.5 pl-3 text-right font-semibold tabular-nums">
                            {row.toOrder}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="p-5 pb-3">
              <CardTitle className="text-base">Tents</CardTitle>
              <CardDescription>
                Each confirmed tent, its label and who sleeps in it. Label a
                tent on its member&rsquo;s order.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-5 pt-0">
              {overview.tents.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No confirmed tents yet.
                </p>
              ) : (
                <ul aria-label="Tents" className="divide-y divide-border">
                  {overview.tents.map((tent) => (
                    <li
                      key={tent.lineId}
                      className="flex flex-col gap-0.5 py-2.5 text-sm page-sm:flex-row page-sm:items-center page-sm:justify-between page-sm:gap-4"
                    >
                      <span className="flex flex-wrap items-center gap-2 font-medium">
                        {tent.tentLabel ? (
                          <Badge>{tent.tentLabel}</Badge>
                        ) : (
                          <Badge variant="outline">No label</Badge>
                        )}
                        {quantityText(tent.quantity, tent.itemName)}
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
