import { Checkbox } from "@camp404/ui/components/checkbox";
import { cn } from "@camp404/ui/lib/utils";
import type { RosterDisplayRow } from "@/lib/camp-roster";
import {
  ThisYearDecisionButtons,
  type DecideThisYear,
  type RosterSelection,
} from "./roster-table";
import {
  RoleBadge,
  RosterAvatar,
  RosterStatusBadge,
  StandingBadge,
  ThisYearBadge,
  countryFlag,
} from "./roster-presentation";

// The roster below md (by its window's width, page-md): the console's
// stacked cards (the phone layout `ResponsiveDataTable` draws), one per
// member. Each card is a full-width button — avatar, name + sub-line
// (@handle · flag · country), then the status badge (captain view) and the
// role badge. Buttons make every card
// keyboard-reachable. A public row has no `status`; a member's card shows the
// one approval fact they may read — the applicant standing — in the same slot,
// and nothing at all for someone already in camp.
//
// This year's status (captains and team leads: the rows carry `thisYear`) is a
// badge under the card; a captain's Accept / Waiting list buttons sit beside
// it, OUTSIDE the card button, so each is its own control.

export function RosterList({
  rows,
  selectedId,
  onSelect,
  selection,
  onDecideThisYear,
  className,
}: {
  rows: RosterDisplayRow[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  selection?: RosterSelection;
  /** Captain view: the Accept / Waiting list buttons. */
  onDecideThisYear?: DecideThisYear;
  className?: string;
}) {
  return (
    <ul className={cn("flex list-none flex-col gap-3", className)}>
      {rows.map((r) => {
        const selected = r.id === selectedId;
        const thisYear = "thisYear" in r;
        return (
          <li
            key={r.id}
            className={cn(
              "flex flex-col rounded-xl border bg-card text-card-foreground transition-colors",
              selected && "border-accent/60 bg-muted",
            )}
          >
            <div className="flex items-stretch">
              {/* A sibling of the card button, never inside it: a checkbox in a
                button is two controls in one. */}
              {selection && (
                <span className="flex w-11 shrink-0 items-center justify-center">
                  {selection.canSelect(r) && (
                    <Checkbox
                      aria-label={`Select ${r.displayName}`}
                      checked={selection.checked.has(r.id)}
                      onCheckedChange={() => selection.onToggle(r.id)}
                    />
                  )}
                </span>
              )}
              <button
                type="button"
                data-roster-trigger={r.id}
                aria-current={selected ? "true" : undefined}
                onClick={() => onSelect(r.id)}
                aria-label={`Open ${r.displayName}'s profile`}
                className={cn(
                  "flex min-w-0 flex-1 items-center gap-3 rounded-xl p-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                  selection && "pl-0",
                )}
              >
                <RosterAvatar name={r.displayName} id={r.id} px={36} />
                <span className="min-w-0 flex-1">
                  <span
                    className={cn(
                      "block truncate text-base font-medium",
                      selected && "text-accent",
                    )}
                  >
                    {r.displayName}
                  </span>
                  <span className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                    {r.handle && <span>@{r.handle}</span>}
                    {r.country && (
                      <>
                        <span aria-hidden>{countryFlag(r.country)}</span>
                        <span className="truncate">{r.country}</span>
                      </>
                    )}
                  </span>
                </span>
                <span className="flex shrink-0 flex-col items-end gap-1.5">
                  {r.status && r.statusLabel ? (
                    <RosterStatusBadge
                      status={r.status}
                      label={r.statusLabel}
                    />
                  ) : (
                    r.standing && <StandingBadge standing={r.standing} />
                  )}
                  <RoleBadge rank={r.rank} isLead={r.isLead} />
                </span>
              </button>
            </div>
            {thisYear && (
              <div className="flex flex-wrap items-center gap-2 border-t px-4 py-2.5">
                <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  This year
                </span>
                <ThisYearBadge status={r.thisYear ?? null} />
                {onDecideThisYear && (
                  <ThisYearDecisionButtons
                    row={r}
                    onDecide={onDecideThisYear}
                    className="ml-auto"
                  />
                )}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
