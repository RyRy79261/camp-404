"use client";

import Link from "next/link";
import { SegmentedLinks } from "@camp404/ui/components/segmented-control";
import {
  INVENTORY_BOOKINGS_PATH,
  INVENTORY_LOANS_PATH,
  INVENTORY_NEEDS_PATH,
  INVENTORY_PATH,
} from "@/lib/inventory-copy";

// The inventory's four views, as links (the inbox's filter tabs): each view is
// its own server page, so it is linkable and back-button friendly.

export type InventoryTab = "items" | "needs" | "bookings" | "lent";

const TABS: readonly { value: InventoryTab; href: string; label: string }[] = [
  { value: "items", href: INVENTORY_PATH, label: "Gear" },
  { value: "needs", href: INVENTORY_NEEDS_PATH, label: "Needs" },
  { value: "bookings", href: INVENTORY_BOOKINGS_PATH, label: "Bookings" },
  { value: "lent", href: INVENTORY_LOANS_PATH, label: "Loans" },
];

export function InventoryTabs({ current }: { current: InventoryTab }) {
  return (
    <div className="mb-6 overflow-x-auto">
      <SegmentedLinks
        aria-label="Inventory views"
        className="page-sm:w-auto"
        value={current}
        linkAs={Link}
        options={TABS.map((t) => ({
          value: t.value,
          href: t.href,
          label: t.label,
        }))}
      />
    </div>
  );
}
