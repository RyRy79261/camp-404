"use client";

import type { ReactNode } from "react";
import { ChevronDown, Search, TriangleAlert } from "lucide-react";
import { Input } from "@camp404/ui/components/input";
import { cn } from "@camp404/ui/lib/utils";
import type { RosterChip, RosterSort } from "@/lib/camp-roster";

// The sort choices a phone gets, where the table's column headers are hidden.
const SORT_OPTIONS: { value: string; label: string; sort: RosterSort }[] = [
  {
    value: "name-asc",
    label: "Name A–Z",
    sort: { key: "name", direction: "asc" },
  },
  {
    value: "name-desc",
    label: "Name Z–A",
    sort: { key: "name", direction: "desc" },
  },
  {
    value: "status-asc",
    label: "Needs a decision first",
    sort: { key: "status", direction: "asc" },
  },
  {
    value: "role-asc",
    label: "Captains first",
    sort: { key: "role", direction: "asc" },
  },
  {
    value: "country-asc",
    label: "Country",
    sort: { key: "country", direction: "asc" },
  },
];

// The roster's filter strip, laid out like the AfrikaBurn registrations filters:
// small uppercase labels over a search field, a joined toggle group and
// selects. Controlled: it owns no data, it reports query / chip / team changes
// up to the island. The status toggles (All / Pending / Captains /
// Outstanding) are single-select; Team is an independent narrowing filter. In
// `publicOnly` mode (the member view) the approval-derived toggles (Pending /
// Outstanding) are withheld — members filter by All / Captains / Team only.
//
// Team and Sort stay native selects (keyboard and screen-reader safe, and the
// E2E suites read their options), drawn as the kit's select trigger.

const STATUS_CHIPS: {
  chip: RosterChip;
  label: string;
  key: "members" | "pending" | "captains";
}[] = [
  { chip: "all", label: "All", key: "members" },
  { chip: "pending", label: "Pending", key: "pending" },
  { chip: "captains", label: "Captains", key: "captains" },
];

/** The counts the toolbar reads; captains pass the full RosterStats, the member
 * view passes just members + captains (the approval counts are captain-only). */
interface ToolbarStats {
  members: number;
  captains: number;
  pending?: number;
  outstanding?: number;
}

// AfrikaBurn's outline toggle (`toggleVariants`, size sm), on a plain button so
// it keeps `aria-pressed` and the button role.
const TOGGLE =
  "inline-flex h-9 min-w-9 items-center justify-center gap-1.5 rounded-md border border-input bg-background px-3 text-sm font-medium transition-colors hover:bg-muted hover:text-foreground focus-visible:relative focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";
const TOGGLE_ON = "border-primary bg-primary/15 text-foreground";

// The kit's SelectTrigger, on a native select.
const SELECT =
  "h-9 w-full cursor-pointer appearance-none rounded-md border border-input bg-background pl-3 pr-9 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

/** A labelled slot in the strip: small uppercase label over its control. */
function FilterField({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5 text-xs", className)}>
      {/* Each control carries its own accessible name. */}
      <span
        aria-hidden
        className="font-medium uppercase tracking-wide text-muted-foreground"
      >
        {label}
      </span>
      {children}
    </div>
  );
}

function SelectChevron() {
  return (
    <ChevronDown
      aria-hidden
      className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 opacity-50"
    />
  );
}

export function RosterToolbar({
  query,
  onQueryChange,
  chip,
  onChipChange,
  team,
  onTeamChange,
  teams,
  stats,
  sort,
  publicOnly = false,
}: {
  query: string;
  onQueryChange: (value: string) => void;
  chip: RosterChip;
  onChipChange: (chip: RosterChip) => void;
  team: string | null;
  onTeamChange: (team: string | null) => void;
  /** Active teams (key + label), order-resolved from the camp config. */
  teams: readonly { key: string; label: string }[];
  stats: ToolbarStats;
  /** The captain roster's sort, offered as a select below `md`. */
  sort?: { value: RosterSort; onChange: (sort: RosterSort) => void };
  publicOnly?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-end gap-x-6 gap-y-4">
      <FilterField label="Search" className="w-full sm:w-80">
        <div className="relative">
          <Search
            aria-hidden
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            type="search"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder={
              publicOnly
                ? "Search by name, handle or team"
                : "Search by name, handle or email"
            }
            aria-label="Search the roster"
            className="h-9 pl-9"
          />
        </div>
      </FilterField>

      <FilterField label={publicOnly ? "Show" : "Status"}>
        <div
          role="group"
          aria-label="Filter the roster"
          className="flex flex-wrap items-center gap-1.5 sm:gap-0 sm:[&>*:not(:first-child)]:rounded-l-none sm:[&>*:not(:first-child)]:border-l-0 sm:[&>*:not(:last-child)]:rounded-r-none"
        >
          {STATUS_CHIPS.filter((c) => !publicOnly || c.chip !== "pending").map(
            ({ chip: value, label, key }) => {
              const active = chip === value;
              return (
                <button
                  key={value}
                  type="button"
                  aria-pressed={active}
                  onClick={() => onChipChange(value)}
                  className={cn(TOGGLE, active && TOGGLE_ON)}
                >
                  {label}{" "}
                  <span
                    className={cn(
                      "tabular-nums",
                      active ? "text-foreground" : "text-muted-foreground",
                    )}
                  >
                    {stats[key] ?? 0}
                  </span>
                </button>
              );
            },
          )}

          {/* Outstanding — captain-only (an approval-derived facet). */}
          {!publicOnly && (
            <button
              type="button"
              aria-pressed={chip === "outstanding"}
              onClick={() =>
                onChipChange(chip === "outstanding" ? "all" : "outstanding")
              }
              className={cn(
                TOGGLE,
                chip === "outstanding" && "border-warning bg-warning/15",
              )}
            >
              <TriangleAlert aria-hidden className="h-3.5 w-3.5 text-warning" />
              Outstanding{" "}
              <span className="tabular-nums text-warning">
                {stats.outstanding ?? 0}
              </span>
            </button>
          )}
        </div>
      </FilterField>

      <FilterField label="Team" className="w-full sm:w-52">
        <div className="relative">
          <select
            aria-label="Filter by team"
            value={team ?? ""}
            onChange={(e) => onTeamChange(e.target.value || null)}
            className={cn(SELECT, team && "border-primary")}
          >
            <option value="">All teams</option>
            {teams.map((t) => (
              <option key={t.key} value={t.key}>
                {t.label}
              </option>
            ))}
          </select>
          <SelectChevron />
        </div>
      </FilterField>

      {/* Sort — phones only; the table's column headers sort on wider
          screens. */}
      {sort && (
        <FilterField label="Sort" className="w-full sm:w-52 md:hidden">
          <div className="relative">
            <select
              aria-label="Sort the roster"
              value={
                SORT_OPTIONS.find(
                  (o) =>
                    o.sort.key === sort.value.key &&
                    o.sort.direction === sort.value.direction,
                )?.value ?? ""
              }
              onChange={(e) => {
                const picked = SORT_OPTIONS.find(
                  (o) => o.value === e.target.value,
                );
                if (picked) sort.onChange(picked.sort);
              }}
              className={SELECT}
            >
              {/* A header-chosen sort with no phone equivalent still shows. */}
              {!SORT_OPTIONS.some(
                (o) =>
                  o.sort.key === sort.value.key &&
                  o.sort.direction === sort.value.direction,
              ) && <option value="">Custom</option>}
              {SORT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <SelectChevron />
          </div>
        </FilterField>
      )}
    </div>
  );
}
