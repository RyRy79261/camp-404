import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Badge } from "@camp404/ui/components/badge";
import { Button } from "@camp404/ui/components/button";
import { PageHeading } from "@camp404/ui/components/page-heading";
import { GearOrderForm } from "@/components/rental/gear-order-form";
import { RentalFrame } from "@/components/rental/rental-frame";
import { captainPageGate } from "@/lib/captain-gate";
import { memberDuesPath } from "@/lib/dues-copy";
import { PLACE_WORDS } from "@/lib/dues-view";
import { ledgerCycle } from "@/lib/payments";
import {
  getMyRental,
  getRentalMember,
  getRentalOrderOf,
  getRentalOverview,
  listRentalItems,
  listRentalSharerChoices,
} from "@/lib/rental";
import { RENTAL_PATH, rentalOrderPath } from "@/lib/rental-copy";
import { runsRental } from "@/lib/rental-gate";
import { orderBadge, tentForForm } from "@/lib/rental-view";
import { OrderManager } from "./order-manager";

export const dynamic = "force-dynamic";

export const metadata = { title: "Gear order — Camp 404" };

// One member's gear order (#241), for captains: what they need, who shares
// their tent, and for each needed item a choice of camp stock or the
// supplier. Confirming charges the member's dues; reopening takes the charge
// off again. For a member who has not answered (no order, or a draft), the
// captain fills the order in for them here; a sent order can be changed the
// same way (`?edit=1`). Captains only; anyone else sees a lock and nothing is
// read, not even the member's name.

export default async function GearOrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ userId: string }>;
  searchParams: Promise<{ edit?: string }>;
}) {
  const gate = await captainPageGate("team_lead");
  const cleared = gate.cleared && (await runsRental(gate));
  if (!cleared) {
    return (
      <RentalFrame
        active={RENTAL_PATH}
        title="Gear order"
        description="One member's gear order."
        cleared={false}
      />
    );
  }

  const [{ userId }, { edit }] = await Promise.all([params, searchParams]);
  const cycle = await ledgerCycle();
  const [order, member, items, overview, sharerChoices] = await Promise.all([
    getRentalOrderOf(userId, cycle),
    getRentalMember(userId, cycle),
    listRentalItems(cycle, { includeArchived: true }),
    getRentalOverview(cycle),
    listRentalSharerChoices(userId),
  ]);
  if (!member) notFound();
  const badge = order
    ? orderBadge(order)
    : ({ label: "No order yet", variant: "outline" } as const);
  // A captain fills it in when the member has not answered, or asks to
  // change a sent order. A confirmed one is reopened first.
  const filling =
    !order ||
    order.status === "draft" ||
    (order.status === "submitted" && edit === "1");
  const live = items.filter((i) => !i.archived);
  // Whose tent the member is already in, read from those members' orders.
  const hostedBy =
    order?.hostedBy ??
    (await getMyRental(userId, cycle)).sharedWithMe.map((t) => t.ownerName);

  return (
    <div className="flex flex-col">
      <div className="mb-4">
        <Button asChild variant="ghost" size="sm">
          <Link href={RENTAL_PATH}>
            <ArrowLeft aria-hidden />
            Orders
          </Link>
        </Button>
      </div>
      <PageHeading
        eyebrow="Captains / Gear rental"
        title={member.name}
        description={
          filling
            ? "This member has not sent an order. Fill it in for them, then pick their tent and where each thing comes from, and confirm."
            : "Pick their tent and where each thing comes from, then confirm. The member sees the total on their dues."
        }
        actions={
          <span className="flex flex-wrap items-center gap-2">
            <Badge variant={badge.variant}>{badge.label}</Badge>
            {order?.filledByCaptain && (
              <Badge variant="outline">Filled in by a captain</Badge>
            )}
            <Badge variant="outline">
              {member.participation
                ? PLACE_WORDS[member.participation]
                : "No answer this year"}
            </Badge>
          </span>
        }
      />
      {filling ? (
        live.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            The catalogue has no items yet. Add some first.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            <GearOrderForm
              forMember={{ userId: member.userId, name: member.name }}
              items={live.map((i) => ({
                id: i.id,
                name: i.name,
                isTent: i.isTent,
                sleeps: i.sleeps,
                campPriceCents: i.campPriceCents,
                campStockCount: i.campStockCount,
                supplierPriceCents: i.supplierPriceCents,
              }))}
              members={sharerChoices}
              version={order?.version ?? 0}
              tent={tentForForm(order?.tent ?? null)}
              hostedBy={hostedBy}
              lines={(order?.lines ?? []).map((l) => ({
                itemId: l.itemId,
                choice: l.choice,
                quantity: l.quantity,
              }))}
            />
            {order?.status === "submitted" && (
              <Link
                href={rentalOrderPath(member.userId)}
                className="self-start text-sm font-medium text-accent hover:underline"
              >
                Leave it as it is
              </Link>
            )}
          </div>
        )
      ) : (
        order && (
          <div className="flex flex-col gap-4">
            <OrderManager
              order={{
                id: order.id,
                version: order.version,
                status: order.status,
                totalCents: order.totalCents,
                charged: order.chargeId !== null,
                tent: order.tent,
                hostedBy: order.hostedBy,
                lines: order.lines,
              }}
              items={items.map((i) => ({
                id: i.id,
                name: i.name,
                isTent: i.isTent,
                sleeps: i.sleeps,
                archived: i.archived,
                campPriceCents: i.campPriceCents,
                campStockCount: i.campStockCount,
                supplierPriceCents: i.supplierPriceCents,
              }))}
              campLeft={Object.fromEntries(
                overview.summary.rows.flatMap((r) =>
                  r.campStockLeft === null ? [] : [[r.itemId, r.campStockLeft]],
                ),
              )}
              duesHref={memberDuesPath(order.userId)}
            />
            {order.status === "submitted" && (
              <Link
                href={`${rentalOrderPath(member.userId)}?edit=1`}
                className="self-start text-sm font-medium text-accent hover:underline"
              >
                Change what they need
              </Link>
            )}
          </div>
        )
      )}
    </div>
  );
}
