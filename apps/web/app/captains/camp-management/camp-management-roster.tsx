"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { CaptainLock } from "@camp404/ui/components/captain-lock";
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
import { RosterList } from "./roster-list";
import { RosterTable } from "./roster-table";
import { RosterToolbar } from "./roster-toolbar";

// Captains' camp-management roster (board S17, iteration B — terminal console).
// Renders the live roster for captains; for everyone else the page withholds the
// rows (rows=[], locked) and this renders a CaptainLock in place of the data —
// preview-but-locked (D3), not a redirect and not a blurred overlay. All the
// island LOGIC (filter/search/chip state, row→profile selection) is here; the
// detail fetch + decisions + promotion live in MemberProfile and the dialogs.

export function CampManagementRoster({
  rows,
  locked,
}: {
  rows: RosterRow[];
  locked: boolean;
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

  const selectedRow = useMemo(
    () => rows.find((r) => r.id === selectedId) ?? null,
    [rows, selectedId],
  );
  const selectedIndex = useMemo(
    () => (selectedId ? rows.findIndex((r) => r.id === selectedId) + 1 : 0),
    [rows, selectedId],
  );

  // Preview-but-locked: the server sent no rows; explain why, render nothing
  // interactive (the search controls are withheld, asserted by the e2e gate).
  if (locked) {
    return (
      <CaptainLock
        title="Captain access only"
        message="Camp management is visible to captains. Your rank doesn't include it."
      />
    );
  }

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
      {/* Stats strip. */}
      <div className="grid grid-cols-3 gap-3 sm:gap-4">
        <StatTile
          label="Members"
          value={<span className="font-mono text-foreground">{stats.members}</span>}
          hint="All sign-ups"
          className="bg-muted"
        />
        <StatTile
          label="Approved"
          value={<span className="font-mono text-success">{stats.approved}</span>}
          hint="Cleared to camp"
          className="bg-muted"
        />
        <StatTile
          label="Incomplete"
          value={<span className="font-mono text-warning">{stats.incomplete}</span>}
          hint="Notices & questionnaires unfinished"
          className="bg-muted"
        />
      </div>

      <RosterToolbar
        query={query}
        onQueryChange={setQuery}
        chip={chip}
        onChipChange={setChip}
        team={team}
        onTeamChange={setTeam}
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
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  );
}
