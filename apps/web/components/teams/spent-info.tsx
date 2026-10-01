"use client";

import { Info } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@camp404/ui/components/popover";
import { SPENT_MEANS } from "@/lib/claims-copy";

// The small (i) beside "Spent": what the figure counts, on a tap or a click
// (a hover title would never open on a phone).

export function SpentInfo() {
  return (
    <Popover>
      <PopoverTrigger
        type="button"
        aria-label="What spent means"
        className="inline-flex h-4 w-4 items-center justify-center rounded-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Info className="h-3.5 w-3.5" aria-hidden />
      </PopoverTrigger>
      <PopoverContent className="w-64 text-sm normal-case tracking-normal">
        {SPENT_MEANS}
      </PopoverContent>
    </Popover>
  );
}
