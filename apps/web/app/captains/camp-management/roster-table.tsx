import { ArrowDown, ArrowUp, ChevronRight } from "lucide-react";
import { Checkbox } from "@camp404/ui/components/checkbox";
import { cn } from "@camp404/ui/lib/utils";
import type {
  RosterDisplayRow,
  RosterSort,
  RosterSortKey,
} from "@/lib/camp-roster";
import {
  RoleBadge,
  RosterAvatar,
  countryFlag,
  statusBarClass,
} from "./roster-presentation";

// Terminal-console roster table (board S17, ≥ sm). One row per member: a status
// colour bar, mono-tinted avatar, name, @handle, country (flag + name), the
// three-rank role badge and a chevron open affordance. The chevron is a real
// focusable button so the row is keyboard-reachable; the whole row is also
// clickable for pointer users. Serves both the captain view (coloured status
// bar) and the member view (no `status` → a neutral bar, no approval signal).

/**
 * Ticking rows for a bulk decision (captain view, Pending filter). No board
 * draws it; it reuses the shared Checkbox.
 */
export interface RosterSelection {
  checked: ReadonlySet<string>;
  /** Only a member still awaiting a decision can be ticked. */
  canSelect: (row: RosterDisplayRow) => boolean;
  onToggle: (id: string) => void;
}

/** Sortable column headers (captain view). The rows arrive already sorted. */
export interface RosterTableSort {
  value: RosterSort;
  onChange: (sort: RosterSort) => void;
}

/** A column header that sorts when it has somewhere to report the change. */
function SortHeader({
  label,
  sortKey,
  sort,
  className,
}: {
  label: string;
  sortKey: RosterSortKey;
  sort?: RosterTableSort;
  className?: string;
}) {
  if (!sort) {
    return (
      <th scope="col" className={cn("font-bold", className)}>
        {label}
      </th>
    );
  }
  const active = sort.value.key === sortKey;
  const direction = active ? sort.value.direction : null;
  return (
    <th
      scope="col"
      aria-sort={
        direction === "asc"
          ? "ascending"
          : direction === "desc"
            ? "descending"
            : "none"
      }
      className={cn("font-bold", className)}
    >
      <button
        type="button"
        onClick={() =>
          sort.onChange({
            key: sortKey,
            direction: direction === "asc" ? "desc" : "asc",
          })
        }
        className={cn(
          "inline-flex items-center gap-1 uppercase tracking-wide transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
          active && "text-accent",
        )}
      >
        {label}
        {direction === "asc" && <ArrowUp aria-hidden className="h-3 w-3" />}
        {direction === "desc" && <ArrowDown aria-hidden className="h-3 w-3" />}
      </button>
    </th>
  );
}

export function RosterTable({
  rows,
  selectedId,
  onSelect,
  selection,
  sort,
  className,
}: {
  rows: RosterDisplayRow[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  selection?: RosterSelection;
  sort?: RosterTableSort;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-lg border bg-card",
        className,
      )}
    >
      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="border-b bg-black/20 font-mono text-micro font-bold uppercase tracking-wide text-muted-foreground">
            <th className="w-1 p-0" aria-hidden />
            {selection && (
              <th scope="col" className="w-10 py-3 pl-4">
                <span className="sr-only">Select</span>
              </th>
            )}
            <SortHeader
              label="Member"
              sortKey="name"
              sort={sort}
              className="px-4 py-3"
            />
            <SortHeader
              label="Handle"
              sortKey="handle"
              sort={sort}
              className="w-[180px] px-2 py-3"
            />
            <SortHeader
              label="Country"
              sortKey="country"
              sort={sort}
              className="w-[220px] px-2 py-3"
            />
            <SortHeader
              label="Role"
              sortKey="role"
              sort={sort}
              className="w-[160px] px-2 py-3"
            />
            <th scope="col" className="w-[80px] px-2 py-3">
              <span className="sr-only">Open</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const selected = r.id === selectedId;
            return (
              <tr
                key={r.id}
                onClick={() => onSelect(r.id)}
                className={cn(
                  "cursor-pointer border-b transition-colors last:border-0",
                  selected
                    ? "bg-accent/10"
                    : "even:bg-white/[0.025] hover:bg-white/[0.04]",
                )}
              >
                <td className="relative w-1 p-0">
                  <span
                    aria-hidden
                    className={cn(
                      "absolute inset-y-0 left-0 w-1",
                      r.status ? statusBarClass(r.status) : "bg-border",
                    )}
                  />
                  {r.statusLabel && (
                    <span className="sr-only">{r.statusLabel}</span>
                  )}
                </td>
                {selection && (
                  <td
                    className="w-10 py-3 pl-4"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {selection.canSelect(r) && (
                      <Checkbox
                        aria-label={`Select ${r.displayName}`}
                        checked={selection.checked.has(r.id)}
                        onCheckedChange={() => selection.onToggle(r.id)}
                      />
                    )}
                  </td>
                )}
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <RosterAvatar name={r.displayName} id={r.id} px={30} />
                    <span className="font-semibold text-foreground">
                      {r.displayName}
                    </span>
                  </div>
                </td>
                <td className="px-2 py-3 font-mono text-label text-muted-foreground">
                  {r.handle ? `@${r.handle}` : "—"}
                </td>
                <td className="px-2 py-3 text-sm text-foreground">
                  {r.country ? (
                    <span className="inline-flex items-center gap-2">
                      <span aria-hidden className="text-base">
                        {countryFlag(r.country)}
                      </span>
                      {r.country}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
                <td className="px-2 py-3">
                  <RoleBadge rank={r.rank} isLead={r.isLead} />
                </td>
                <td className="px-2 py-3 text-right">
                  <button
                    type="button"
                    data-roster-trigger={r.id}
                    aria-current={selected ? "true" : undefined}
                    aria-label={`Open ${r.displayName}'s profile`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelect(r.id);
                    }}
                    className="inline-flex items-center justify-center rounded-md p-1 text-accent transition-colors hover:bg-accent/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  >
                    <ChevronRight aria-hidden className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
