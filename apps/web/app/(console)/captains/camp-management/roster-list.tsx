import { Checkbox } from "@camp404/ui/components/checkbox";
import { cn } from "@camp404/ui/lib/utils";
import type { RosterDisplayRow } from "@/lib/camp-roster";
import type { RosterSelection } from "./roster-table";
import {
  RoleBadge,
  RosterAvatar,
  RosterStatusBadge,
  countryFlag,
} from "./roster-presentation";

// The roster below md: the console's stacked cards (the phone layout
// `ResponsiveDataTable` draws), one per member. Each card is a full-width
// button — avatar, name + sub-line (@handle · flag · country), then the status
// badge (captain view) and the role badge. Buttons make every card
// keyboard-reachable. A public row has no `status`, so a member sees no
// approval signal.

export function RosterList({
  rows,
  selectedId,
  onSelect,
  selection,
  className,
}: {
  rows: RosterDisplayRow[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  selection?: RosterSelection;
  className?: string;
}) {
  return (
    <ul className={cn("flex list-none flex-col gap-3", className)}>
      {rows.map((r) => {
        const selected = r.id === selectedId;
        return (
          <li
            key={r.id}
            className={cn(
              "flex items-stretch rounded-xl border bg-card text-card-foreground transition-colors",
              selected && "border-accent/60 bg-muted",
            )}
          >
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
                {r.status && r.statusLabel && (
                  <RosterStatusBadge status={r.status} label={r.statusLabel} />
                )}
                <RoleBadge rank={r.rank} isLead={r.isLead} />
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
