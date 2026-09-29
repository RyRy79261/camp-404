"use client";

import type * as React from "react";
import Link from "next/link";
import { SegmentedLinks } from "@camp404/ui/components/segmented-control";
import {
  POWER_FUEL_LOG_PATH,
  POWER_FUEL_PATH,
  POWER_GRID_PATH,
  POWER_LOADS_PATH,
  POWER_READINESS_PATH,
} from "@/lib/power-copy";

// The Power program's pages, as one row of tabs under each page's heading
// (#253–#257). Each tab is a link, so every page stays a server render and
// its address is its own, as the recipe page's tabs are. A client module only
// so Next's <Link> can be handed to the kit component. A narrow window shows
// each tab's short word, so all five fit on a phone; were they ever not to,
// the row scrolls sideways rather than squeezing.

export type PowerTab = "loads" | "fuel" | "fuel-log" | "grid" | "readiness";

/** A tab's label: the short word in a narrow window, the full name in a wide one. */
function label(short: string, full: string) {
  return (
    <>
      <span className="page-md:hidden">{short}</span>
      <span className="hidden page-md:inline">{full}</span>
    </>
  );
}

const TABS: { value: PowerTab; label: React.ReactNode; href: string }[] = [
  {
    value: "loads",
    label: label("Loads", "Load list"),
    href: POWER_LOADS_PATH,
  },
  {
    value: "fuel",
    label: label("Fuel", "Fuel estimate"),
    href: POWER_FUEL_PATH,
  },
  {
    value: "fuel-log",
    label: label("Refuel", "Refuelling"),
    href: POWER_FUEL_LOG_PATH,
  },
  { value: "grid", label: label("Grid", "Grid"), href: POWER_GRID_PATH },
  {
    value: "readiness",
    label: label("Ready", "Readiness"),
    href: POWER_READINESS_PATH,
  },
];

export function PowerTabs({ tab }: { tab: PowerTab }) {
  return (
    <div className="-mt-2 mb-6 overflow-x-auto">
      <SegmentedLinks
        aria-label="Power pages"
        className="min-w-max page-md:w-auto [&>*]:whitespace-nowrap [&>*]:px-2 page-sm:[&>*]:px-3"
        value={tab}
        linkAs={Link}
        options={TABS}
      />
    </div>
  );
}
