import { ArrowDown, ArrowUp, ChevronRight } from "lucide-react";
import { Button } from "@camp404/ui/components/button";
import { Checkbox } from "@camp404/ui/components/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@camp404/ui/components/table";
import { cn } from "@camp404/ui/lib/utils";
import type {
  RosterDisplayRow,
  RosterSort,
  RosterSortKey,
} from "@/lib/camp-roster";
import {
  RoleBadge,
  RosterAvatar,
  RosterStatusBadge,
  StandingBadge,
  countryFlag,
} from "./roster-presentation";

// The roster as a console table (≥ md), in the AfrikaBurn registrations/accounts
// table surface. One row per member: avatar + name, @handle, country (flag +
// name), the role badge, the status badge (captain view only) and a chevron
// open control. The chevron is a real focusable button so the row is
// keyboard-reachable; the whole row is also clickable for pointer users.
//
// Not `ResponsiveDataTable`: the column headers sort (`aria-sort` lives on the
// <th>), rows select, and a selected row is marked — none of which that
// component carries. It uses the same kit table leaves, so it reads the same.
// Serves both the captain view and the member view. A public row has no
// `status`, so the member table carries no triage column; instead the island
// asks for `showStanding` when somebody on the roster is still an applicant,
// and that column shows the one approval fact a member may read.

/**
 * Ticking rows for a bulk decision (captain view, Pending filter). Reuses the
 * shared Checkbox.
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
      <TableHead scope="col" className={className}>
        {label}
      </TableHead>
    );
  }
  const active = sort.value.key === sortKey;
  const direction = active ? sort.value.direction : null;
  return (
    <TableHead
      scope="col"
      aria-sort={
        direction === "asc"
          ? "ascending"
          : direction === "desc"
            ? "descending"
            : "none"
      }
      className={className}
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
          "-mx-1 inline-flex items-center gap-1 rounded-sm px-1 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          active && "text-foreground",
        )}
      >
        {label}
        {direction === "asc" && (
          <ArrowUp aria-hidden className="h-3.5 w-3.5 text-accent" />
        )}
        {direction === "desc" && (
          <ArrowDown aria-hidden className="h-3.5 w-3.5 text-accent" />
        )}
      </button>
    </TableHead>
  );
}

export function RosterTable({
  rows,
  selectedId,
  onSelect,
  selection,
  sort,
  showStanding = false,
  className,
}: {
  rows: RosterDisplayRow[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  selection?: RosterSelection;
  sort?: RosterTableSort;
  /**
   * Member view: draw the Standing column. The island decides from the WHOLE
   * roster, not the filtered rows, so the column does not appear and disappear
   * as the member changes a filter — and a roster with no applicants on it
   * keeps the table it has always had.
   */
  showStanding?: boolean;
  className?: string;
}) {
  // Rows are either all captain rows or all public rows.
  const showStatus = rows.some((r) => r.status !== undefined);
  const standingColumn = !showStatus && showStanding;
  return (
    <div
      className={cn(
        "rounded-xl border bg-card text-card-foreground shadow-sm",
        className,
      )}
    >
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            {selection && (
              <TableHead scope="col" className="w-10 pl-4">
                <span className="sr-only">Select</span>
              </TableHead>
            )}
            <SortHeader
              label="Member"
              sortKey="name"
              sort={sort}
              className={cn(!selection && "pl-4")}
            />
            <SortHeader label="Telegram" sortKey="handle" sort={sort} />
            <SortHeader label="Country" sortKey="country" sort={sort} />
            <SortHeader label="Role" sortKey="role" sort={sort} />
            {showStatus && (
              <SortHeader label="Status" sortKey="status" sort={sort} />
            )}
            {standingColumn && <TableHead scope="col">Standing</TableHead>}
            <TableHead scope="col" className="w-12 pr-4">
              <span className="sr-only">Open</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => {
            const selected = r.id === selectedId;
            return (
              <TableRow
                key={r.id}
                data-state={selected ? "selected" : undefined}
                onClick={() => onSelect(r.id)}
                className="cursor-pointer"
              >
                {selection && (
                  <TableCell
                    className="w-10 pl-4"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {selection.canSelect(r) && (
                      <Checkbox
                        aria-label={`Select ${r.displayName}`}
                        checked={selection.checked.has(r.id)}
                        onCheckedChange={() => selection.onToggle(r.id)}
                      />
                    )}
                  </TableCell>
                )}
                <TableCell className={cn("py-3", !selection && "pl-4")}>
                  <div className="flex items-center gap-3">
                    <RosterAvatar name={r.displayName} id={r.id} px={28} />
                    <span
                      className={cn("font-medium", selected && "text-accent")}
                    >
                      {r.displayName}
                    </span>
                  </div>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {r.handle ? `@${r.handle}` : "—"}
                </TableCell>
                <TableCell>
                  {r.country ? (
                    <span className="inline-flex items-center gap-2">
                      <span aria-hidden>{countryFlag(r.country)}</span>
                      {r.country}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell>
                  <RoleBadge rank={r.rank} isLead={r.isLead} />
                </TableCell>
                {showStatus && (
                  <TableCell>
                    {r.status && r.statusLabel ? (
                      <RosterStatusBadge
                        status={r.status}
                        label={r.statusLabel}
                      />
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                )}
                {standingColumn && (
                  <TableCell>
                    {r.standing ? (
                      <StandingBadge standing={r.standing} />
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                )}
                <TableCell className="w-12 pr-4 text-right">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    data-roster-trigger={r.id}
                    aria-current={selected ? "true" : undefined}
                    aria-label={`Open ${r.displayName}'s profile`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelect(r.id);
                    }}
                    className="h-8 w-8"
                  >
                    <ChevronRight aria-hidden />
                  </Button>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
