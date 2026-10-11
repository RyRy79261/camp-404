"use client";

import Link from "next/link";
import { SegmentedLinks } from "@camp404/ui/components/segmented-control";
import { PETS_PATH } from "@/lib/pets-copy";

// A founder's All / Waiting filter on Camp pets. Links, so the list stays a
// server render and the filter lives in `?show=`. A client module only so
// Next's <Link> can be handed to the kit component.

export function PetFilter({
  show,
  all,
  waiting,
}: {
  show: "all" | "waiting";
  all: number;
  waiting: number;
}) {
  return (
    <SegmentedLinks
      aria-label="Show"
      className="page-sm:w-auto"
      value={show}
      linkAs={Link}
      options={[
        { value: "all", href: PETS_PATH, label: `All (${all})` },
        {
          value: "waiting",
          href: `${PETS_PATH}?show=waiting`,
          label: `Waiting (${waiting})`,
        },
      ]}
    />
  );
}
