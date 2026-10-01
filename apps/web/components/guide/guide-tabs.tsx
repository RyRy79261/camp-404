"use client";

import Link from "next/link";
import { SegmentedLinks } from "@camp404/ui/components/segmented-control";
import { GUIDE_PATH } from "@/lib/guide-copy";

// The guide's By topic / By team tabs (#250). Each tab is a link and the
// choice lives in the address (?by=team), so the contents stay a server
// render, as the recipe page's tabs do. A client module only so Next's <Link>
// can be handed to the kit component.

export type GuideGrouping = "topic" | "team";

export function GuideTabs({
  by,
  query,
}: {
  by: GuideGrouping;
  /** The search in the address, kept on both tabs' links. */
  query: string;
}) {
  const q = query ? `q=${encodeURIComponent(query)}` : "";
  return (
    <SegmentedLinks
      aria-label="Group the guide"
      className="page-sm:w-auto"
      value={by}
      linkAs={Link}
      options={[
        {
          value: "topic",
          label: "By topic",
          href: q ? `${GUIDE_PATH}?${q}` : GUIDE_PATH,
        },
        {
          value: "team",
          label: "By team",
          href: q ? `${GUIDE_PATH}?by=team&${q}` : `${GUIDE_PATH}?by=team`,
        },
      ]}
    />
  );
}
