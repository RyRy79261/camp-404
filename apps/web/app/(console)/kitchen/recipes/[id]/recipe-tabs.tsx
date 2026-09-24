"use client";

import Link from "next/link";
import { SegmentedLinks } from "@camp404/ui/components/segmented-control";
import { recipePath } from "@/lib/recipe-copy";

// The recipe page's Recipe / History tabs (the owner's sketch, 2026-09-24).
// Each tab is a LINK and the choice lives in the address (?tab=history), so a
// link or a reload keeps it and the page stays a server render, as the
// inbox's filter tabs do. A client module only so Next's <Link> can be handed
// to the kit component.

export type RecipeTab = "recipe" | "history";

export function RecipeTabs({
  recipeId,
  tab,
  plates,
}: {
  recipeId: string;
  tab: RecipeTab;
  /** The plate count in the address, kept when going back to the recipe. */
  plates: number | null;
}) {
  const base = recipePath(recipeId);
  return (
    <SegmentedLinks
      aria-label="Recipe tabs"
      className="sm:w-auto"
      value={tab}
      linkAs={Link}
      options={[
        {
          value: "recipe",
          label: "Recipe",
          href: plates === null ? base : `${base}?plates=${plates}`,
        },
        { value: "history", label: "History", href: `${base}?tab=history` },
      ]}
    />
  );
}
