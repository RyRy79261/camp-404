"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { isParticipationDecision, mayRecordTicket } from "@camp404/core";
import { toast } from "@camp404/ui/components/toast";
import { CHOICE_OFF, CHOICE_ON_FILL } from "@camp404/ui/lib/choice";
import { cn } from "@camp404/ui/lib/utils";
import type {
  DecideThisYear,
  ThisYearDecision,
  ThisYearRow,
} from "../camp-management/roster-table";

// The captain's decision on an Applications row: one two-way control,
// [Accept | Waiting list], with the decision the captains made pressed, the
// same size in the same place on every row (AfrikaBurn's outline toggle
// group, in the kit's choice colours). It stands in for the decision badge
// and the buttons that came and went from row to row. A member who has not
// said Coming or Maybe has nothing to decide yet: their cell is a dash, with
// the reason as its tooltip.

const OPTIONS: {
  to: ThisYearDecision;
  label: string;
  name: (member: string) => string;
}[] = [
  {
    to: "accepted",
    label: "Accept",
    name: (member) => `Accept ${member} for this year`,
  },
  {
    to: "waitlisted",
    label: "Waiting list",
    name: (member) => `Put ${member} on the waiting list`,
  },
];

/** Why a row has no decision control. */
export const NOTHING_TO_DECIDE =
  "Nothing to decide until they say Coming or Maybe";

/** The control's width on every row of the table. */
const WIDTH = "w-full @min-[48rem]/rdt:w-[10.5rem]";

export function DecisionToggle({
  row,
  onDecide,
}: {
  row: ThisYearRow;
  onDecide: DecideThisYear;
}) {
  const [pending, startTransition] = useTransition();
  const [tapped, setTapped] = useState<ThisYearDecision | null>(null);
  const from = row.thisYear ?? null;

  if (!mayRecordTicket(from) || from === null) {
    return (
      <span
        title={NOTHING_TO_DECIDE}
        className={cn(
          "flex h-11 items-center text-muted-foreground @min-[48rem]/rdt:h-9",
          WIDTH,
        )}
      >
        <span aria-hidden>—</span>
        <span className="sr-only">{NOTHING_TO_DECIDE}</span>
      </span>
    );
  }

  return (
    <div
      role="group"
      aria-label={`Decision for ${row.displayName}`}
      className={cn("inline-flex gap-1 rounded-md border p-1", WIDTH)}
    >
      {OPTIONS.map((o) => {
        const pressed = from === o.to;
        const working = pending && tapped === o.to;
        return (
          <button
            key={o.to}
            type="button"
            aria-pressed={pressed}
            aria-label={o.name(row.displayName)}
            // Only the tapped half is busy; it stays focusable while it works.
            aria-disabled={working || undefined}
            disabled={pending && !working}
            onClick={() => {
              if (pending || pressed || !isParticipationDecision(from, o.to))
                return;
              setTapped(o.to);
              startTransition(async () => {
                const result = await onDecide(row, o.to);
                if (!result.ok) toast.error(result.error);
              });
            }}
            className={cn(
              "inline-flex h-11 flex-1 items-center justify-center gap-1.5 rounded-sm border px-2 text-sm font-medium whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring @min-[48rem]/rdt:h-[26px] @min-[48rem]/rdt:px-1.5",
              pressed ? CHOICE_ON_FILL : CHOICE_OFF,
              pressed && "cursor-default",
              "disabled:opacity-60",
            )}
          >
            {working && (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            )}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
