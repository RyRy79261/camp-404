import * as React from "react";

import { cn } from "../lib/utils";

// RowActions: the one place a table row or a list row puts its buttons, so
// the main button sits in the same spot on every row (the owner's "why does
// the main button move into the row?").
//
// - `primary`: the row's one main action (a small button). Leave it out on a
//   row that has none; never swap in a different control in its place.
// - `secondary`: the quieter actions (ghost icon buttons: edit, remove). They
//   go in a slot of their own on the far right that keeps its width on
//   every row, `secondarySlots` icon buttons wide, so a row without them does
//   not pull the main button sideways. Pass `null` on a row that has none in
//   a table whose other rows do.
//
// In a ResponsiveDataTable put it in the `role: "actions"` column: that
// column keeps its own width on the right. Server-safe (no state).

export interface RowActionsProps {
  primary?: React.ReactNode;
  secondary?: React.ReactNode;
  /** How many icon buttons wide the secondary slot is on every row. */
  secondarySlots?: 1 | 2 | 3;
  className?: string;
  /** Names the group for a screen reader ("Actions for Cooler boxes"). */
  label?: string;
}

/** Each slot is one icon button (2.5rem) plus the gap between them. */
const SECONDARY_WIDTH = {
  1: "min-w-10",
  2: "min-w-[5.125rem]",
  3: "min-w-[7.75rem]",
} as const;

function RowActions({
  primary,
  secondary,
  secondarySlots = 1,
  className,
  label,
}: RowActionsProps) {
  const hasPrimary =
    primary !== undefined && primary !== null && primary !== false;
  return (
    <div
      data-slot="row-actions"
      role={label ? "group" : undefined}
      aria-label={label}
      className={cn("flex items-center justify-end gap-1", className)}
    >
      {hasPrimary && (
        <div data-slot="row-actions-primary" className="flex shrink-0">
          {primary}
        </div>
      )}
      {secondary !== undefined && (
        <div
          data-slot="row-actions-secondary"
          className={cn(
            "flex shrink-0 items-center justify-end gap-0.5",
            SECONDARY_WIDTH[secondarySlots],
          )}
        >
          {secondary}
        </div>
      )}
    </div>
  );
}

export { RowActions };
