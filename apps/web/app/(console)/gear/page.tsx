import Link from "next/link";
import { Tent } from "lucide-react";
import {
  formatMoney,
  RENTAL_SOURCE_LABELS,
  rentalOrderState,
} from "@camp404/core";
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
  ownTentText,
  quantityText,
  tentForForm,
  tentNeedText,
} from "@/lib/rental-view";
import { TentLabelValue } from "@/components/rental/tent-label-value";
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

const WRITE_IT_DOWN =
  "Write the label down before you leave home: there\u2019s no signal at the Burn.";

function LineRow({
  line,
  confirmed,
}: {
  line: RentalLine;
  confirmed: boolean;
}) {
  const needs = line.choice === "need";
  return (
    <li className="flex items-start justify-between gap-4 py-3 text-sm">
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

/**
 * The member's one tent answer, as they sent it and as a captain settled it.
 * The tent shows here once, with its label at heading size: the label is what
 * a member writes down before the Burn.
 */
function TentRow({
  tent,
  confirmed,
  shared,
}: {
  tent: RentalTentAnswer;
  confirmed: boolean;
  shared: SharedTent[];
}) {
  const picked = confirmed ? tent.assigned : null;
  const sharing =
    tent.sharers.length > 0
      ? `Sharing with ${nameList(tent.sharers.map((s) => s.name))}`
      : null;
  // The tent someone else put them in, when that is their answer.
  const host = tent.choice === "shared" ? (shared[0] ?? null) : null;
  return (
    <li data-testid="tent-answer" className="flex flex-col gap-3 py-3 text-sm">
      <span className="flex items-start justify-between gap-4">
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="font-medium">
            {tent.choice === "own"
              ? "Your own tent"
              : tent.choice === "need"
                ? (picked?.itemName ?? tentNeedText(tent.people))
                : host
                  ? `${host.ownerName}\u2019s tent: ${host.tentName}`
                  : "In someone else\u2019s tent"}
          </span>
          <span className="text-xs text-muted-foreground">
            {tent.choice === "own"
              ? (ownTentText(tent) ?? "Nothing to pay for it")
              : tent.choice === "need"
                ? picked?.source
                  ? `${tentNeedText(tent.people)}, from ${RENTAL_SOURCE_LABELS[picked.source].toLowerCase()}`
                  : "A captain picks your tent when they confirm"
                : host
                  ? host.otherSharers.length > 0
                    ? `With ${nameList(host.otherSharers)}`
                    : "Nothing to pay for it"
                  : "Nobody has put you in their tent yet"}
          </span>
          {sharing && (
            <span className="text-xs text-muted-foreground">{sharing}</span>
          )}
        </span>
        {picked && picked.unitPriceCents !== null && (
          <span className="whitespace-nowrap font-medium tabular-nums">
            {formatMoney(picked.unitPriceCents)}
          </span>
        )}
      </span>
      {(picked || host) && (
        <span className="flex flex-col gap-1">
          <TentLabelValue
            label={picked ? picked.tentLabel : (host?.tentLabel ?? null)}
            missing={
              host && !host.confirmed
                ? "Not confirmed yet"
                : "No label yet. It shows here once a captain gives it one."
            }
          />
          <span className="text-xs text-muted-foreground">{WRITE_IT_DOWN}</span>
        </span>
      )}
    </li>
  );
}

function OrderAsSent({
  order,
  shared,
}: {
  order: RentalOrder;
  shared: SharedTent[];
}) {
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
            <TentRow tent={order.tent} confirmed={confirmed} shared={shared} />
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
        description="Say which sleeping gear you have and which you need from the camp this year, then send it. A captain picks your tent, and camp stock or the supplier for each thing, and confirms. The total goes on your dues."
      />

      <div className="flex min-w-0 flex-col gap-6">
        {order && state && (
          <Card>
            <CardContent className="flex flex-col gap-1 p-5">
              <p
                role="status"
                data-testid="order-state"
                className="text-lg font-semibold"
              >
                {STATE_WORDS[state]}
              </p>
              {state === "charged" && (
                <Link
                  href={MY_DUES_PATH}
                  className="self-start text-sm font-medium text-accent hover:underline"
                >
                  See it on My dues
                </Link>
              )}
            </CardContent>
          </Card>
        )}

        {asked && (
          <p
            role="status"
            data-testid="gear-asked"
            className="rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm"
          >
            The captains are putting the gear order together and asked everyone
            who is coming. Say what you have and what you need, then send it.
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
        {/* While the form shows, its tent card says this itself. */}
        {sharedWithMe.length > 0 &&
          !editable &&
          order?.tent?.choice !== "shared" && (
            <p
              data-testid="in-a-tent"
              className="rounded-lg border border-accent/40 bg-accent/10 px-4 py-3 text-sm"
            >
              {nameList(sharedWithMe.map((t) => t.ownerName))} also put you in
              their tent. Ask them to take you off if that&rsquo;s wrong.
            </p>
          )}

        {!editable ? (
          order && <OrderAsSent order={order} shared={sharedWithMe} />
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
            hostedLabel={sharedWithMe[0]?.tentLabel ?? null}
            lines={(order?.lines ?? []).map((l) => ({
              itemId: l.itemId,
              choice: l.choice,
              quantity: l.quantity,
            }))}
          />
        )}
      </div>
    </div>
  );
}
