"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { EmptyState } from "@camp404/ui/components/empty-state";
import { StatTile } from "@camp404/ui/components/stat-tile";
import {
  deriveRosterStats,
  matchesChip,
  matchesRosterQuery,
  matchesTeam,
  type RosterChip,
  type RosterRow,
} from "@/lib/camp-roster";
import { MemberProfile } from "./member-profile";
import { focusRosterTrigger } from "./roster-presentation";
import { RosterList } from "./roster-list";
import { RosterTable } from "./roster-table";
import { RosterToolbar } from "./roster-toolbar";

// Captains' camp-management roster (board S17, iteration B — terminal console).
// Captain-only triage surface: full rows + the approval stats strip + the
// approve/reject/assign actions. Non-captain members are routed to the public
// `MemberRoster` by the page (server-side), so this island always renders the
// captain view. All the island LOGIC (filter/search/chip state, row→profile
// selection) is here; the detail fetch + decisions + promotion live in
// MemberProfile and the dialogs.

export function CampManagementRoster({
  rows,
  teams,
}: {
  rows: RosterRow[];
  teams: readonly { key: string; label: string }[];
}) {
  const [query, setQuery] = useState("");
  const [chip, setChip] = useState<RosterChip>("all");
  const [team, setTeam] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const stats = useMemo(() => deriveRosterStats(rows), [rows]);

  const filtered = useMemo(
    () =>
      rows.filter(
        (r) =>
          matchesRosterQuery(r, query) &&
          matchesChip(r, chip) &&
          (team === null || matchesTeam(r, team)),
      ),
    [rows, query, chip, team],
  );

  // Resolve the open profile from the FILTERED rows, so narrowing the list to
  // exclude the selected member closes the panel (no orphaned profile). The
  // record index stays the member's position in the FULL roster — a stable
  // per-member "#NN", not a position that shifts as filters change.
  const selectedRow = useMemo(
    () => filtered.find((r) => r.id === selectedId) ?? null,
    [filtered, selectedId],
  );
  const selectedIndex = useMemo(
    () => (selectedId ? rows.findIndex((r) => r.id === selectedId) + 1 : 0),
    [rows, selectedId],
  );

  // "Nobody is awaiting approval." only when there genuinely are no pending
  // members — not when a search/team filter merely narrowed them out.
  const emptyTitle =
    chip === "pending" && stats.pending === 0
      ? "Nobody is awaiting approval."
      : rows.length === 0
        ? "No members have signed up yet."
        : "No members match your search.";

  return (
    <div className="flex flex-col gap-6">
      {/* Stats strip — captain-only (approval-derived counts). Desktop:
          label-over-number with a hint (board 37); mobile: compact
          number-over-label, no hint (board 38). */}
      <div className="grid grid-cols-3 gap-3 sm:gap-4">
        <StatTile
          className="hidden bg-muted sm:block"
          label="Members"
          value={<span className="font-mono text-foreground">{stats.members}</span>}
          hint="All sign-ups"
        />
        <StatTile
          className="bg-muted sm:hidden"
          compact
          label="Members"
          value={<span className="font-mono text-foreground">{stats.members}</span>}
        />
        <StatTile
          className="hidden bg-muted sm:block"
          label="Approved"
          value={<span className="font-mono text-success">{stats.approved}</span>}
          hint="Cleared to camp"
        />
        <StatTile
          className="bg-muted sm:hidden"
          compact
          label="Approved"
          value={<span className="font-mono text-success">{stats.approved}</span>}
        />
        <StatTile
          className="hidden bg-muted sm:block"
          label="Incomplete"
          value={<span className="font-mono text-warning">{stats.incomplete}</span>}
          hint="Notices & questionnaires unfinished"
        />
        <StatTile
          className="bg-muted sm:hidden"
          compact
          label="Incomplete"
          value={<span className="font-mono text-warning">{stats.incomplete}</span>}
        />
      </div>

      <RosterToolbar
        query={query}
        onQueryChange={setQuery}
        chip={chip}
        onChipChange={setChip}
        team={team}
        onTeamChange={setTeam}
        teams={teams}
        stats={stats}
      />

      {filtered.length === 0 ? (
        <EmptyState
          icon={<Search className="h-5 w-5" aria-hidden />}
          title={emptyTitle}
        />
      ) : (
        <>
          <RosterTable
            className="hidden sm:block"
            rows={filtered}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />
          <RosterList
            className="sm:hidden"
            rows={filtered}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />
        </>
      )}

      {selectedRow && (
        <MemberProfile
          key={selectedRow.id}
          row={selectedRow}
          index={selectedIndex}
          onClose={() => {
            const id = selectedId;
            setSelectedId(null);
            if (id) focusRosterTrigger(id);
          }}
        />
      )}
    </div>
  );
}
