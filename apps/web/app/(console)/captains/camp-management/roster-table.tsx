import { useEffect, useRef, useState, useTransition } from "react";
import { ArrowDown, ArrowUp, ChevronRight, Loader2 } from "lucide-react";
import { isParticipationDecision } from "@camp404/core";
import { Button } from "@camp404/ui/components/button";
import { Checkbox } from "@camp404/ui/components/checkbox";
import { toast } from "@camp404/ui/components/toast";
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
  ThisYearBadge,
  countryFlag,
  focusRosterTrigger,
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
//
// "This year" (who is coming) appears whenever the rows carry `thisYear`: a
// captain's always do, a team lead's do, a plain member's never do (the server
// leaves the key off). Only the captain island passes `onDecideThisYear`, so
// only a captain gets the Accept / Waiting list buttons.

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

/** The two places a captain can give a member for this year. */
export type ThisYearDecision = "accepted" | "waitlisted";

/**
 * A captain's Accept / Waiting list (captain view only). The island calls the
 * action, and on success keeps the row on screen and refreshes; the control
 * spins and reports a failure.
 */
export type DecideThisYear = (
  row: RosterDisplayRow,
  to: ThisYearDecision,
) => Promise<{ ok: true } | { ok: false; error: string }>;

const DECISION_BUTTONS: {
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

/**
 * The one-tap Accept / Waiting list buttons beside a member's "This year"
 * badge, offered only where `isParticipationDecision` allows the move: nothing
 * for a member who said No or has not answered, because they have to answer
 * Yes or Maybe first. Each row has its own transition, so only the tapped
 * button spins; a failure is a toast, the way every one-tap list change on a
 * captain screen reports one.
 *
 * Keyboard focus survives the tap. The tapped button is only aria-disabled
 * while it works (a disabled button drops focus to `<body>`), and once the
 * decision lands it is no longer offered (an accepted member cannot be
 * accepted again), so focus moves to the row's remaining button, or to the
 * row's open control when none is left.
 */
export function ThisYearDecisionButtons({
  row,
  onDecide,
  className,
}: {
  row: RosterDisplayRow;
  onDecide: DecideThisYear;
  className?: string;
}) {
  const [pending, startTransition] = useTransition();
  const [tapped, setTapped] = useState<ThisYearDecision | null>(null);
  const container = useRef<HTMLSpanElement>(null);
  const refocus = useRef(false);
  const from = row.thisYear ?? null;

  useEffect(() => {
    if (!refocus.current) return;
    refocus.current = false;
    // Only when the tapped button took focus with it: never steal focus the
    // captain has since moved on.
    const active = document.activeElement;
    if (active && active !== document.body) return;
    const next = container.current?.querySelector<HTMLButtonElement>(
      "button:not(:disabled)",
    );
    if (next) next.focus();
    else focusRosterTrigger(row.id);
  }, [from, row.id]);

  const offered =
    from === null
      ? []
      : DECISION_BUTTONS.filter((b) => isParticipationDecision(from, b.to));
  if (offered.length === 0) return null;

  return (
    <span
      ref={container}
      className={cn("flex flex-wrap items-center gap-1.5", className)}
    >
      {offered.map((b) => {
        const working = pending && tapped === b.to;
        return (
          <Button
            key={b.to}
            type="button"
            size="sm"
            variant="outline"
            aria-label={b.name(row.displayName)}
            disabled={pending && !working}
            aria-disabled={working || undefined}
            onClick={(e) => {
              // The row opens the profile; this tap only decides.
              e.stopPropagation();
              if (pending) return;
              setTapped(b.to);
              startTransition(async () => {
                const result = await onDecide(row, b.to);
                if (result.ok) refocus.current = true;
                else toast.error(result.error);
              });
            }}
            className="h-7 gap-1.5 px-2 text-xs aria-disabled:opacity-50"
          >
            {working && <Loader2 className="animate-spin" aria-hidden />}
            {b.label}
          </Button>
        );
      })}
    </span>
  );
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
  onDecideThisYear,
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
  /** Captain view: the Accept / Waiting list buttons in the This year cell. */
  onDecideThisYear?: DecideThisYear;
  className?: string;
}) {
  // Rows are either all captain rows or all public rows.
  const showStatus = rows.some((r) => r.status !== undefined);
  const standingColumn = !showStatus && showStanding;
  // Captains and team leads get this year's status; the server leaves the key
  // off a plain member's rows, so for them there is no column at all.
  const thisYearColumn = rows.some((r) => "thisYear" in r);
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
            {thisYearColumn && <TableHead scope="col">This year</TableHead>}
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
                {thisYearColumn && (
                  <TableCell>
                    <span className="flex flex-wrap items-center gap-2">
                      <ThisYearBadge status={r.thisYear ?? null} />
                      {onDecideThisYear && (
                        <ThisYearDecisionButtons
                          row={r}
                          onDecide={onDecideThisYear}
                        />
                      )}
                    </span>
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
