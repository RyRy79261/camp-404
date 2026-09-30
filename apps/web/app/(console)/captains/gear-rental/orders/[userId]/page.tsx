import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Badge } from "@camp404/ui/components/badge";
import { Button } from "@camp404/ui/components/button";
import { PageHeading } from "@camp404/ui/components/page-heading";
import { RentalFrame } from "@/components/rental/rental-frame";
import { captainPageGate } from "@/lib/captain-gate";
import { memberDuesPath } from "@/lib/dues-copy";
import { PLACE_WORDS } from "@/lib/dues-view";
import { ledgerCycle } from "@/lib/payments";
import {
  getRentalOrderOf,
  getRentalOverview,
  listRentalItems,
} from "@/lib/rental";
import { RENTAL_PATH } from "@/lib/rental-copy";
import { runsRental } from "@/lib/rental-gate";
import { orderBadge } from "@/lib/rental-view";
import { OrderManager } from "./order-manager";

export const dynamic = "force-dynamic";

export const metadata = { title: "Gear order — Camp 404" };

// One member's gear order (#241), for captains: what they need, who shares
// their tent, and for each needed item a choice of camp stock or the
// supplier. Confirming charges the member's dues; reopening takes the charge
// off again. Captains only; anyone else sees a lock and nothing is read, not
// even the member's name.

export default async function GearOrderPage({
  params,
}: {
  params: Promise<{ userId: string }>;
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

  const { userId } = await params;
  const cycle = await ledgerCycle();
  const [order, items, overview] = await Promise.all([
    getRentalOrderOf(userId, cycle),
    listRentalItems(cycle, { includeArchived: true }),
    getRentalOverview(cycle),
  ]);
  if (!order) notFound();
  const badge = orderBadge(order);

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
        title={order.memberName}
        description="Pick where each item comes from, then confirm. The member sees the total on their dues."
        actions={
          <span className="flex flex-wrap items-center gap-2">
            <Badge variant={badge.variant}>{badge.label}</Badge>
            <Badge variant="outline">
              {order.participation
                ? PLACE_WORDS[order.participation]
                : "No answer this year"}
            </Badge>
          </span>
        }
      />
      <OrderManager
        order={{
          id: order.id,
          version: order.version,
          status: order.status,
          totalCents: order.totalCents,
          charged: order.chargeId !== null,
          lines: order.lines,
        }}
        items={items.map((i) => ({
          id: i.id,
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
    </div>
  );
}
