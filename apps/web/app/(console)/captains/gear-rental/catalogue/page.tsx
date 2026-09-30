import { RentalFrame } from "@/components/rental/rental-frame";
import { captainPageGate } from "@/lib/captain-gate";
import { ledgerCycle } from "@/lib/payments";
import { listRentalItems } from "@/lib/rental";
import { RENTAL_CATALOGUE_PATH } from "@/lib/rental-copy";
import { runsRental } from "@/lib/rental-gate";
import { CatalogueManager } from "./catalogue-manager";

export const dynamic = "force-dynamic";

export const metadata = { title: "Gear rental catalogue — Camp 404" };

// The year's rental catalogue (#241), kept in the database, never in code:
// each item members can ask for, the supplier's price, and, for the few items
// the camp has some of (its tents and some mattresses), the camp's own price
// and how many it has. The camp's Inventory is not priced and is not linked
// here. Captains only.

export default async function GearRentalCataloguePage() {
  const gate = await captainPageGate("team_lead");
  const cleared = gate.cleared && (await runsRental(gate));
  const items = cleared ? await listRentalItems(await ledgerCycle()) : null;
  return (
    <RentalFrame
      active={RENTAL_CATALOGUE_PATH}
      title="Catalogue"
      description="This year's rental items and their prices. Members see the items; you decide on each order whether an item comes from camp stock or the supplier."
      cleared={items !== null}
    >
      {items ? <CatalogueManager items={items} /> : null}
    </RentalFrame>
  );
}
