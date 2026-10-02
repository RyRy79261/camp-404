import type { ReactNode } from "react";
import Link from "next/link";
import { PageHeading } from "@camp404/ui/components/page-heading";
import { cn } from "@camp404/ui/lib/utils";
import {
  INVENTORY_BOOKINGS_PATH,
  INVENTORY_LOANS_PATH,
  INVENTORY_NEEDS_PATH,
  INVENTORY_PATH,
} from "@/lib/inventory-copy";

// The inventory's frame (#246, redesign option A, owner 2026-10-01): one
// heading for the four views, whose action changes with the tab (Add item,
// Add need and a print, a print), then a row of tabs, each its own server
// page in the one Inventory window, so a view is a link and Back works. The
// tabs are the Payments window's underline tabs; they scroll sideways on a
// phone rather than squeeze.

export type InventoryTab = "items" | "needs" | "bookings" | "lent";

const TABS: readonly { value: InventoryTab; href: string; label: string }[] = [
  { value: "items", href: INVENTORY_PATH, label: "Gear" },
  { value: "needs", href: INVENTORY_NEEDS_PATH, label: "Needs this year" },
  { value: "bookings", href: INVENTORY_BOOKINGS_PATH, label: "Bookings" },
  { value: "lent", href: INVENTORY_LOANS_PATH, label: "Lent out" },
];

export function InventoryTabs({ current }: { current: InventoryTab }) {
  return (
    <nav
      aria-label="Inventory views"
      className="-mx-1 mb-5 overflow-x-auto border-b border-border"
    >
      <ul className="flex min-w-max gap-1 px-1">
        {TABS.map((tab) => {
          const on = tab.value === current;
          return (
            <li key={tab.value}>
              <Link
                href={tab.href}
                aria-current={on ? "page" : undefined}
                className={cn(
                  "-mb-px inline-flex items-center whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-semibold transition-colors",
                  on
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {tab.value === "needs" ? (
                  <>
                    <span className="page-sm:hidden">Needs</span>
                    <span className="hidden page-sm:inline">{tab.label}</span>
                  </>
                ) : (
                  tab.label
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** The heading and the tabs, then the view. */
export function InventoryFrame({
  current,
  actions,
  children,
}: {
  current: InventoryTab;
  /** The view's own action(s): Add item, Add need, a print. */
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    // On a phone the heading drops its one-line description (the mock-up's
    // phone): the tabs say what is here.
    <div className="flex flex-col [&_[data-slot=page-title]+p]:hidden page-sm:[&_[data-slot=page-title]+p]:block">
      <PageHeading
        eyebrow="Camp gear"
        title="Inventory"
        description="The camp's gear, what it still needs, and who has it."
        actions={actions}
      />
      <InventoryTabs current={current} />
      {children}
    </div>
  );
}
