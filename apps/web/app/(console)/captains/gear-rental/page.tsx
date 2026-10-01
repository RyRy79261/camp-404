import Link from "next/link";
import { ChevronRight, Tent } from "lucide-react";
import { formatMoney, sumMinor } from "@camp404/core";
import { Badge } from "@camp404/ui/components/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@camp404/ui/components/card";
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
import { orderBadge, quantityText, tentNeedText } from "@/lib/rental-view";

export const dynamic = "force-dynamic";

export const metadata = { title: "Gear rental — Camp 404" };

// Every member's gear order for the year (#241), for captains: the ones
// waiting to be confirmed first. A row opens the order, where the captain
// picks camp stock or the supplier for each item and confirms. Above them:
// who is coming this year and has NOT sent an order, by name, and the
// button in that card, which nudges exactly those members. A name opens a page where a
// captain can fill the order in for them. Member money data: nothing is read
// for anyone but a captain.

const COLUMNS: ResponsiveColumn<RentalOrder>[] = [
  {
    id: "member",
    header: "Member",
    role: "title",
    headClassName: "min-w-40",
    cellClassName: "whitespace-nowrap",
    // The name is the row's way in: it reads as a link (AfrikaBurn's
    // RegistrationsTable), with a chevron that says it opens.
    cell: (o) => (
      <Link
        href={rentalOrderPath(o.userId)}
        className="group/name inline-flex items-center gap-1 font-medium text-foreground underline-offset-4 hover:text-accent hover:underline"
      >
        {o.memberName}
        <ChevronRight
          className="h-4 w-4 text-muted-foreground group-hover/name:text-accent"
          aria-hidden
        />
      </Link>
    ),
  },
  {
    id: "place",
    header: "Place",
    cellClassName: "whitespace-nowrap",
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
      const tent = o.tent;
      // The tent a captain picked, else what the member asked for.
      const needs = [
        ...(tent?.choice === "need"
          ? [
              o.status === "confirmed" && tent.assigned
                ? tent.assigned.tentLabel
                  ? `${tent.assigned.itemName} (label ${tent.assigned.tentLabel})`
                  : tent.assigned.itemName
                : `${tentNeedText(tent.people)}, not assigned yet`,
            ]
          : []),
        ...o.lines
          .filter((l) => l.choice === "need")
          .map((l) => quantityText(l.quantity, l.itemName)),
      ];
      return needs.length === 0 ? (
        <span className="text-muted-foreground">Nothing from the camp</span>
      ) : (
        needs.join(", ")
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
            <CardHeader className="p-5 pb-3">
              <CardTitle className="text-base">
                Not answered yet ({unanswered.length})
              </CardTitle>
              <CardDescription>
                Members who say they are coming, or whom a captain accepted, and
                who have not sent an order. The button asks exactly these. Open
                a name to fill their order in for them.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4 p-5 pt-0">
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
              {unanswered.length > 0 && (
                <AskEveryone count={unanswered.length} />
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
              framed
            />
          )}
        </div>
      )}
    </RentalFrame>
  );
}
