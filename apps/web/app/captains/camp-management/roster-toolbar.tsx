"use client";

import { ChevronDown, TriangleAlert } from "lucide-react";
import { cn } from "@camp404/ui/lib/utils";
import type { RosterChip } from "@/lib/camp-roster";
import { TEAMS, teamLabel } from "./roster-presentation";

// Search + multi-chip filter row for the roster (board S17 toolbar). Controlled:
// it owns no data, it reports query / chip / team changes up to the island. The
// status chips (All / Pending / Captains / Outstanding) are single-select; the
// "Team:" dropdown is an independent narrowing filter. In `publicOnly` mode (the
// member view) the approval-derived chips (Pending / Outstanding) are withheld —
// members filter by All / Captains / Team only.

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

export function RosterToolbar({
  query,
  onQueryChange,
  chip,
  onChipChange,
  team,
  onTeamChange,
  stats,
  publicOnly = false,
}: {
  query: string;
  onQueryChange: (value: string) => void;
  chip: RosterChip;
  onChipChange: (chip: RosterChip) => void;
  team: string | null;
  onTeamChange: (team: string | null) => void;
  stats: ToolbarStats;
  publicOnly?: boolean;
}) {
  return (
    <div className="flex flex-col gap-3">
      {/* Console search: `>` prompt + borderless input + blinking caret. */}
      <div className="flex items-center gap-2.5 rounded-lg border border-accent bg-muted px-3.5 py-2.5 focus-within:ring-2 focus-within:ring-accent">
        <span aria-hidden className="font-mono text-base font-bold text-accent">
          {">"}
        </span>
        <input
          type="search"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="Search by name, handle or country"
          aria-label="Search the roster"
          className="min-w-0 flex-1 bg-transparent font-mono text-mono text-foreground placeholder:text-muted-foreground focus:outline-none"
        />
        {query.length === 0 && (
          <span
            aria-hidden
            className="h-[18px] w-[9px] shrink-0 motion-safe:animate-pulse bg-accent"
          />
        )}
      </div>

      {/* Filter chips. */}
      <div
        role="group"
        aria-label="Filter the roster"
        className="flex flex-wrap items-center gap-2"
      >
        {STATUS_CHIPS.filter(
          (c) => !publicOnly || c.chip !== "pending",
        ).map(({ chip: value, label, key }) => {
          const active = chip === value;
          return (
            <button
              key={value}
              type="button"
              aria-pressed={active}
              onClick={() => onChipChange(value)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg border px-3.5 py-2 font-mono text-label font-semibold transition-colors",
                active
                  ? "border-accent bg-accent/10 text-accent"
                  : "border-border bg-muted text-muted-foreground hover:text-foreground",
              )}
            >
              <span
                aria-hidden
                className={cn(
                  "h-1.5 w-1.5 rounded-full",
                  active ? "bg-accent" : "bg-muted-foreground",
                )}
              />
              {label} {stats[key] ?? 0}
            </button>
          );
        })}

        {/* Team dropdown — a native select styled as a chip (keyboard/SR-safe). */}
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-lg border px-3.5 py-2 font-mono text-label font-semibold transition-colors",
            team
              ? "border-accent bg-accent/10 text-accent"
              : "border-border bg-muted text-muted-foreground",
          )}
        >
          <span aria-hidden>Team:</span>
          <select
            aria-label="Filter by team"
            value={team ?? ""}
            onChange={(e) => onTeamChange(e.target.value || null)}
            className="cursor-pointer appearance-none bg-transparent pr-1 font-mono font-semibold focus:outline-none focus-visible:underline"
          >
            <option value="">All</option>
            {TEAMS.map((t) => (
              <option key={t} value={t}>
                {teamLabel(t)}
              </option>
            ))}
          </select>
          <ChevronDown aria-hidden className="h-3.5 w-3.5" />
        </span>

        {/* Outstanding — captain-only (an approval-derived facet). */}
        {!publicOnly && (
          <button
            type="button"
            aria-pressed={chip === "outstanding"}
            onClick={() =>
              onChipChange(chip === "outstanding" ? "all" : "outstanding")
            }
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg border border-warning px-3.5 py-2 font-mono text-label font-semibold text-warning transition-colors",
              chip === "outstanding" ? "bg-warning/20" : "bg-warning/10",
            )}
          >
            <TriangleAlert aria-hidden className="h-3.5 w-3.5" />
            Outstanding {stats.outstanding ?? 0}
          </button>
        )}
      </div>
    </div>
  );
}
