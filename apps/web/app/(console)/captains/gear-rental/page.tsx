import Link from "next/link";
import { Tent } from "lucide-react";
import { formatMoney, sumMinor } from "@camp404/core";
import { Badge } from "@camp404/ui/components/badge";
import { Card, CardContent } from "@camp404/ui/components/card";
import { EmptyState } from "@camp404/ui/components/empty-state";
import {
  ResponsiveDataTable,
  type ResponsiveColumn,
} from "@camp404/ui/components/responsive-data-table";
import { AskEveryone } from "@/components/rental/ask-everyone";
import { RentalFrame } from "@/components/rental/rental-frame";
import { captainPageGate } from "@/lib/captain-gate";
import { PLACE_WORDS } from "@/lib/dues-view";
import { ledgerCycle } from "@/lib/payments";
import {
  listRentalOrders,
  listRentalUnanswered,
  type RentalOrder,
} from "@/lib/rental";
import { RENTAL_PATH, rentalOrderPath } from "@/lib/rental-copy";
import { runsRental } from "@/lib/rental-gate";
import { orderBadge, quantityText } from "@/lib/rental-view";

export const dynamic = "force-dynamic";

export const metadata = { title: "Gear rental — Camp 404" };

// Every member's gear order for the year (#241), for captains: the ones
// waiting to be confirmed first. A row opens the order, where the captain
// picks camp stock or the supplier for each item and confirms. Above them:
// who is coming this year and has NOT sent an order, by name, and "Ask
// everyone", which nudges exactly those members. A name opens a page where a
// captain can fill the order in for them. Member money data: nothing is read
// for anyone but a captain.

const COLUMNS: ResponsiveColumn<RentalOrder>[] = [
  {
    id: "member",
    header: "Member",
    role: "title",
    cellClassName: "whitespace-normal",
    cell: (o) => (
      <Link
        href={rentalOrderPath(o.userId)}
        className="font-medium hover:text-accent"
      >
        {o.memberName}
      </Link>
    ),
  },
  {
    id: "place",
    header: "This year",
    cell: (o) =>
      o.participation ? (
        PLACE_WORDS[o.participation]
      ) : (
        <span className="text-muted-foreground">No answer</span>
      ),
  },
  {
    id: "needs",
    header: "Needs",
    cellClassName: "whitespace-normal",
    cell: (o) => {
      const needs = o.lines.filter((l) => l.choice === "need");
      return needs.length === 0 ? (
        <span className="text-muted-foreground">Has their own</span>
      ) : (
        needs.map((l) => quantityText(l.quantity, l.itemName)).join(", ")
      );
    },
  },
  {
    id: "state",
    header: "Order",
    role: "badge",
    cell: (o) => (
      <Badge variant={orderBadge(o).variant}>{orderBadge(o).label}</Badge>
    ),
  },
  {
    id: "total",
    header: "Total",
    align: "right",
    cellClassName: "whitespace-nowrap font-medium tabular-nums",
    cell: (o) =>
      o.status === "confirmed" && o.totalCents !== null ? (
        formatMoney(o.totalCents)
      ) : (
        <span className="font-normal text-muted-foreground">Not yet</span>
      ),
  },
];

export default async function GearRentalOrdersPage() {
  const gate = await captainPageGate("team_lead");
  const cleared = gate.cleared && (await runsRental(gate));
  const cycle = cleared ? await ledgerCycle() : null;
  const [orders, unanswered] =
    cycle === null
      ? [null, []]
      : await Promise.all([
          listRentalOrders(cycle),
          listRentalUnanswered(cycle),
        ]);

  const waiting = orders?.filter((o) => o.status === "submitted") ?? [];
  const confirmed = orders?.filter((o) => o.status === "confirmed") ?? [];

  return (
    <RentalFrame
      active={RENTAL_PATH}
      title="Gear rental"
      description="Members say what sleeping gear they need. Open an order to pick camp stock or the supplier for each item and confirm it. Confirming puts the total on the member's dues."
      cleared={orders !== null}
      actions={<AskEveryone />}
    >
      {orders && (
        <div className="flex flex-col gap-6">
          <div className="grid gap-3 page-sm:grid-cols-3">
            <Card>
              <CardContent className="flex flex-col gap-1 p-4">
                <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Waiting for a captain
                </span>
                <span className="text-2xl font-bold tabular-nums">
                  {waiting.length}
                </span>
                <span className="text-xs text-muted-foreground">
                  Sent, not confirmed yet
                </span>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex flex-col gap-1 p-4">
                <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Confirmed
                </span>
                <span className="text-2xl font-bold tabular-nums">
                  {confirmed.length}
                </span>
                <span className="text-xs text-muted-foreground">
                  {confirmed.length === 1 ? "1 order" : "Orders"} counted in the
                  summary
                </span>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex flex-col gap-1 p-4">
                <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  On members&rsquo; dues
                </span>
                <span className="text-2xl font-bold tabular-nums">
                  {formatMoney(
                    sumMinor(confirmed.map((o) => o.totalCents ?? 0)),
                  )}
                </span>
                <span className="text-xs text-muted-foreground">
                  Charged for confirmed orders
                </span>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardContent className="flex flex-col gap-3 p-5">
              <div className="flex flex-col gap-1">
                <h2 className="text-base font-semibold">
                  Not answered yet
                  <span className="ml-2 font-normal tabular-nums text-muted-foreground">
                    {unanswered.length}
                  </span>
                </h2>
                <p className="text-sm text-muted-foreground">
                  Members who said they are coming, or whom a captain accepted,
                  and who have not sent an order. Ask everyone reaches exactly
                  these. Open a name to fill their order in for them.
                </p>
              </div>
              {unanswered.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Everyone who is coming has sent their order.
                </p>
              ) : (
                <ul
                  aria-label="Not answered yet"
                  className="flex flex-wrap gap-2"
                >
                  {unanswered.map((m) => (
                    <li key={m.userId}>
                      <Link
                        href={rentalOrderPath(m.userId)}
                        className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1 text-sm hover:border-accent hover:text-accent"
                      >
                        {m.name}
                        {m.draft && <Badge variant="outline">Draft</Badge>}
                        {m.asked && <Badge variant="warning">Asked</Badge>}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {orders.length === 0 ? (
            <EmptyState
              icon={<Tent aria-hidden />}
              title="No orders yet."
              description="Members order from My gear once the catalogue has items. An order shows here as soon as a member starts one, or a captain fills one in."
            />
          ) : (
            <ResponsiveDataTable
              columns={COLUMNS}
              data={orders}
              getRowKey={(o) => o.id}
              label="Gear orders"
              className="page-md:rounded-xl page-md:border page-md:bg-card page-md:shadow-sm"
            />
          )}
        </div>
      )}
    </RentalFrame>
  );
}
