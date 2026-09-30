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
  type RentalTentAnswer,
  type SharedTent,
} from "@/lib/rental";
import {
  nameList,
  orderBadge,
  ownTentText,
  quantityText,
  tentForForm,
  tentNeedText,
} from "@/lib/rental-view";
import {
  ChangeMyOrder,
  GearOrderForm,
} from "@/components/rental/gear-order-form";

export const dynamic = "force-dynamic";

export const metadata = { title: "My gear — Camp 404" };

// A member's own gear for the year (#241). The tent is asked once, by need
// (owner, 2026-09-30): they have their own, they need one (for how many
// people), or they are in someone else's; and who shares it. Then, for each
// other thing the camp rents out (a mattress, bedding), whether they have
// their own or need some. They never pick a tent from the catalogue, nor
// where anything comes from: a captain picks the tent and camp stock or the
// supplier when they confirm the
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
      </span>
      {needs && confirmed && line.unitPriceCents !== null && (
        <span className="whitespace-nowrap font-medium tabular-nums">
          {formatMoney(line.unitPriceCents * line.quantity)}
        </span>
      )}
    </li>
  );
}

/** The member's one tent answer, as they sent it and as a captain settled it. */
function TentRow({
  tent,
  confirmed,
  hostedBy,
}: {
  tent: RentalTentAnswer;
  confirmed: boolean;
  hostedBy: string[];
}) {
  const picked = confirmed ? tent.assigned : null;
  const sharing =
    tent.sharers.length > 0
      ? `Sharing with ${nameList(tent.sharers.map((s) => s.name))}`
      : null;
  return (
    <li
      data-testid="tent-answer"
      className="flex flex-col gap-1 py-3 text-sm page-sm:flex-row page-sm:items-start page-sm:justify-between page-sm:gap-4"
    >
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="font-medium">
          {tent.choice === "own"
            ? "Your own tent"
            : tent.choice === "need"
              ? (picked?.itemName ?? tentNeedText(tent.people))
              : "In someone else\u2019s tent"}
        </span>
        <span className="text-xs text-muted-foreground">
          {tent.choice === "own"
            ? (ownTentText(tent) ?? "Nothing to pay for it")
            : tent.choice === "need"
              ? picked?.source
                ? `${tentNeedText(tent.people)}, from ${RENTAL_SOURCE_LABELS[picked.source].toLowerCase()}`
                : "A captain picks your tent when they confirm"
              : hostedBy.length > 0
                ? `${nameList(hostedBy)}\u2019s tent`
                : "Nobody has put you in their tent yet"}
        </span>
        {sharing && (
          <span className="text-xs text-muted-foreground">{sharing}</span>
        )}
        {picked && (
          <span className="text-xs">
            {picked.tentLabel ? (
              <>
                Tent label:{" "}
                <span className="font-semibold">{picked.tentLabel}</span>
              </>
            ) : (
              <span className="text-muted-foreground">No tent label yet</span>
            )}
          </span>
        )}
      </span>
      {picked && picked.unitPriceCents !== null && (
        <span className="whitespace-nowrap font-medium tabular-nums">
          {formatMoney(picked.unitPriceCents)}
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
            : "A captain picks your tent, and whether each thing comes from the camp's own stock or the supplier. You see the price then."}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 p-5 pt-0">
        <ul aria-label="Your order" className="divide-y divide-border">
          {order.tent && (
            <TentRow
              tent={order.tent}
              confirmed={confirmed}
              hostedBy={order.hostedBy}
            />
          )}
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
  const tent = order?.tent ?? null;
  const picked = order?.status === "confirmed" ? tent?.assigned : null;
  const sharers = tent?.sharers.map((s) => s.name) ?? [];
  const mine = picked
    ? [{ id: picked.id, name: picked.itemName, label: picked.tentLabel }]
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
            No tent from the camp yet. It shows here once a captain picks your
            tent and confirms, or someone puts you in theirs.
          </p>
        ) : (
          <ul aria-label="Your tent" className="divide-y divide-border">
            {mine.map((line) => (
              <li
                key={line.id}
                className="flex flex-col gap-0.5 py-2.5 text-sm"
              >
                <span className="flex flex-wrap items-center gap-2 font-medium">
                  {line.name}
                  {line.label ? (
                    <Badge>{line.label}</Badge>
                  ) : (
                    <Badge variant="outline">No label yet</Badge>
                  )}
                </span>
                <span className="text-xs text-muted-foreground">
                  {sharers.length > 0
                    ? `You and ${nameList(sharers)}`
                    : "Just you"}
                </span>
              </li>
            ))}
            {shared.map((tent) => (
              <li
                key={tent.orderId}
                className="flex flex-col gap-0.5 py-2.5 text-sm"
              >
                <span className="flex flex-wrap items-center gap-2 font-medium">
                  {tent.tentName}
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
  const { items, order, sharedWithMe, asked } = rental;
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

          {asked && (
            <p
              role="status"
              data-testid="gear-asked"
              className="rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm"
            >
              The captains are putting the gear order together and asked
              everyone who is coming. Say what you have and what you need, then
              send it.
            </p>
          )}
          {order?.filledByCaptain && (
            <p
              data-testid="gear-filled"
              className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm"
            >
              A captain filled this in for you.{" "}
              {order.status === "confirmed"
                ? "Ask a captain to reopen it if it isn't right."
                : "Change it if it isn't right."}
            </p>
          )}
          {/* While the form shows, its tent question says this itself. */}
          {sharedWithMe.length > 0 && !editable && (
            <p
              data-testid="in-a-tent"
              className="rounded-lg border border-accent/40 bg-accent/10 px-4 py-3 text-sm"
            >
              You&rsquo;re in {nameList(sharedWithMe.map((t) => t.ownerName))}
              &rsquo;s tent. You don&rsquo;t need a tent of your own.
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
            <GearOrderForm
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
              tent={tentForForm(order?.tent ?? null)}
              hostedBy={sharedWithMe.map((t) => t.ownerName)}
              lines={(order?.lines ?? []).map((l) => ({
                itemId: l.itemId,
                choice: l.choice,
                quantity: l.quantity,
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
                  A captain picks your tent, and camp stock or the supplier for
                  each thing, and confirms.
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
