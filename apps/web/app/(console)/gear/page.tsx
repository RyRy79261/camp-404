import Link from "next/link";
import { Tent } from "lucide-react";
import {
  formatMoney,
  RENTAL_SOURCE_LABELS,
  rentalOrderState,
} from "@camp404/core";
import { Badge } from "@camp404/ui/components/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@camp404/ui/components/card";
import { EmptyState } from "@camp404/ui/components/empty-state";
import { PageHeading } from "@camp404/ui/components/page-heading";
import { MY_DUES_PATH } from "@/lib/dues-copy";
import { requireMemberPage } from "@/lib/member-gate";
import { ledgerCycle } from "@/lib/payments";
import {
  getMyRental,
  listRentalSharerChoices,
  type RentalLine,
  type RentalOrder,
  type SharedTent,
} from "@/lib/rental";
import { nameList, orderBadge, quantityText } from "@/lib/rental-view";
import { ChangeMyOrder, MyGearForm } from "./my-gear-form";

export const dynamic = "force-dynamic";

export const metadata = { title: "My gear — Camp 404" };

// A member's own gear for the year (#241): for each thing the camp rents out
// (a tent, a mattress, bedding) they say whether they have their own or need
// one, how many, and who shares their tent. They do not pick where it comes
// from: a captain decides camp stock or the supplier when they confirm the
// order, and the total lands on the member's dues then. Only their own order
// is read here, plus any tent another member put them in. Everything on this
// page is settled before the Burn; there is no internet on site.

const STATE_WORDS = {
  draft: "Not sent yet. Send it when you're ready.",
  submitted: "Sent. A captain will confirm it.",
  confirmed: "Confirmed. There's nothing to pay for it.",
  charged: "Confirmed. It's on your dues.",
} as const;

function LineRow({
  line,
  confirmed,
}: {
  line: RentalLine;
  confirmed: boolean;
}) {
  const needs = line.choice === "need";
  return (
    <li className="flex flex-col gap-1 py-3 text-sm page-sm:flex-row page-sm:items-start page-sm:justify-between page-sm:gap-4">
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="font-medium">
          {needs ? quantityText(line.quantity, line.itemName) : line.itemName}
        </span>
        <span className="text-xs text-muted-foreground">
          {needs
            ? confirmed && line.source
              ? `From ${RENTAL_SOURCE_LABELS[line.source].toLowerCase()}`
              : "You need this"
            : "You have your own"}
        </span>
        {needs && line.sharers.length > 0 && (
          <span className="text-xs text-muted-foreground">
            Sharing with {nameList(line.sharers.map((s) => s.name))}
          </span>
        )}
        {needs && line.isTent && confirmed && (
          <span className="text-xs">
            {line.tentLabel ? (
              <>
                Tent label:{" "}
                <span className="font-semibold">{line.tentLabel}</span>
              </>
            ) : (
              <span className="text-muted-foreground">No tent label yet</span>
            )}
          </span>
        )}
      </span>
      {needs && confirmed && line.unitPriceCents !== null && (
        <span className="whitespace-nowrap font-medium tabular-nums">
          {formatMoney(line.unitPriceCents * line.quantity)}
        </span>
      )}
    </li>
  );
}

function OrderAsSent({ order }: { order: RentalOrder }) {
  const confirmed = order.status === "confirmed";
  return (
    <Card>
      <CardHeader className="p-5 pb-3">
        <CardTitle className="text-base">Your order</CardTitle>
        <CardDescription>
          {confirmed
            ? "A captain confirmed this. Ask a captain to reopen it if something needs to change."
            : "A captain decides whether each item comes from the camp's own stock or the supplier, and you see the price then."}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 p-5 pt-0">
        <ul aria-label="Your order" className="divide-y divide-border">
          {order.lines.map((line) => (
            <LineRow key={line.id} line={line} confirmed={confirmed} />
          ))}
        </ul>
        {confirmed && order.totalCents !== null && (
          <p className="flex items-center justify-between border-t border-border pt-3 text-sm font-semibold">
            <span>Total</span>
            <span className="tabular-nums">
              {formatMoney(order.totalCents)}
            </span>
          </p>
        )}
        {order.status === "submitted" && (
          <ChangeMyOrder version={order.version} />
        )}
        {confirmed && order.chargeId && (
          <Link
            href={MY_DUES_PATH}
            className="text-sm font-medium text-accent hover:underline"
          >
            See it on My dues
          </Link>
        )}
      </CardContent>
    </Card>
  );
}

function TentsCard({
  order,
  shared,
}: {
  order: RentalOrder | null;
  shared: SharedTent[];
}) {
  const mine =
    order?.status === "confirmed"
      ? order.lines.filter((l) => l.isTent && l.choice === "need")
      : [];
  return (
    <Card>
      <CardHeader className="p-5 pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Tent className="h-4 w-4 text-accent" aria-hidden />
          Your tent
        </CardTitle>
        <CardDescription>
          The label is on the tent when you arrive. Write it down before you
          leave home: there&rsquo;s no signal at the Burn.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-5 pt-0">
        {mine.length === 0 && shared.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No tent from the camp yet. It shows here once a captain confirms
            your order, or someone puts you in theirs.
          </p>
        ) : (
          <ul aria-label="Your tent" className="divide-y divide-border">
            {mine.map((line) => (
              <li
                key={line.id}
                className="flex flex-col gap-0.5 py-2.5 text-sm"
              >
                <span className="flex flex-wrap items-center gap-2 font-medium">
                  {quantityText(line.quantity, line.itemName)}
                  {line.tentLabel ? (
                    <Badge>{line.tentLabel}</Badge>
                  ) : (
                    <Badge variant="outline">No label yet</Badge>
                  )}
                </span>
                <span className="text-xs text-muted-foreground">
                  {line.sharers.length > 0
                    ? `You and ${nameList(line.sharers.map((s) => s.name))}`
                    : "Just you"}
                </span>
              </li>
            ))}
            {shared.map((tent) => (
              <li
                key={tent.lineId}
                className="flex flex-col gap-0.5 py-2.5 text-sm"
              >
                <span className="flex flex-wrap items-center gap-2 font-medium">
                  {tent.itemName}
                  {tent.tentLabel ? (
                    <Badge>{tent.tentLabel}</Badge>
                  ) : (
                    <Badge variant="outline">
                      {tent.confirmed ? "No label yet" : "Not confirmed yet"}
                    </Badge>
                  )}
                </span>
                <span className="text-xs text-muted-foreground">
                  {tent.ownerName} put you in their tent
                  {tent.otherSharers.length > 0
                    ? `, with ${nameList(tent.otherSharers)}`
                    : ""}
                  .
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export default async function MyGearPage() {
  const { campUser } = await requireMemberPage();
  const cycle = await ledgerCycle();
  const [rental, members] = await Promise.all([
    getMyRental(campUser.id, cycle),
    listRentalSharerChoices(campUser.id),
  ]);
  const { items, order, sharedWithMe } = rental;
  const editable = !order || order.status === "draft";
  const state = order ? rentalOrderState(order) : null;

  return (
    <div className="flex flex-col">
      <PageHeading
        eyebrow="Me / My gear"
        title="My gear"
        description="Say which sleeping gear you have and which you need from the camp this year. A captain confirms your order, and the cost goes on your dues."
      />

      <div className="grid items-start gap-6 page-lg:grid-cols-3">
        <div className="flex min-w-0 flex-col gap-6 page-lg:col-span-2">
          {order && state && (
            <Card>
              <CardContent className="flex flex-col gap-2 p-5">
                <span className="flex flex-wrap items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  This year
                  <Badge variant={orderBadge(order).variant}>
                    {orderBadge(order).label}
                  </Badge>
                </span>
                <p
                  role="status"
                  data-testid="order-state"
                  className="text-lg font-semibold"
                >
                  {STATE_WORDS[state]}
                </p>
              </CardContent>
            </Card>
          )}

          {sharedWithMe.length > 0 && (
            <p
              data-testid="in-a-tent"
              className="rounded-lg border border-accent/40 bg-accent/10 px-4 py-3 text-sm"
            >
              You&rsquo;re in {nameList(sharedWithMe.map((t) => t.ownerName))}
              &rsquo;s tent. You don&rsquo;t need to order one yourself.
            </p>
          )}

          {!editable ? (
            order && <OrderAsSent order={order} />
          ) : items.length === 0 ? (
            <EmptyState
              icon={<Tent aria-hidden />}
              title="Nothing to order yet."
              description="The captains haven't listed this year's gear. Check back soon."
            />
          ) : (
            <MyGearForm
              items={items.map((i) => ({
                id: i.id,
                name: i.name,
                isTent: i.isTent,
                sleeps: i.sleeps,
                campPriceCents: i.campPriceCents,
                campStockCount: i.campStockCount,
                supplierPriceCents: i.supplierPriceCents,
              }))}
              members={members}
              version={order?.version ?? 0}
              lines={(order?.lines ?? []).map((l) => ({
                itemId: l.itemId,
                choice: l.choice,
                quantity: l.quantity,
                sharerIds: l.sharers.map((s) => s.id),
              }))}
            />
          )}
        </div>

        <aside className="flex flex-col gap-6">
          <TentsCard order={order} shared={sharedWithMe} />
          <Card>
            <CardHeader className="p-5 pb-3">
              <CardTitle className="text-base">How it works</CardTitle>
            </CardHeader>
            <CardContent className="p-5 pt-0">
              <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-sm text-muted-foreground">
                <li>Say what you have and what you need, then send it.</li>
                <li>
                  A captain picks camp stock or the supplier for each item and
                  confirms.
                </li>
                <li>The total goes on your dues. Pay it with your camp fee.</li>
              </ol>
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}
