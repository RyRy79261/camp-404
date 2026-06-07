"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { EmptyState } from "@camp404/ui/components/empty-state";
import {
  derivePublicRosterStats,
  matchesRosterQuery,
  matchesTeam,
  type PublicRosterRow,
} from "@/lib/camp-roster";
import { PublicMemberProfile } from "./public-member-profile";
import { focusRosterTrigger } from "./roster-presentation";
import { RosterList } from "./roster-list";
import { RosterTable } from "./roster-table";
import { RosterToolbar } from "./roster-toolbar";

// Member-facing roster (board S17 "MemberReadOnly" intent, revived per the
// owner's call). Any approved camp member may browse who's at camp — names,
// handles, country, role, teams — and open a PUBLIC card (bio + what they bring).
// Approval status, join date, contact details, government ID and admin actions
// are withheld SERVER-SIDE: this island only ever receives PublicRosterRow, so it
// has no private data to render. Filters are All / Captains / Team only.

type PublicChip = "all" | "captains";

export function MemberRoster({ rows }: { rows: PublicRosterRow[] }) {
  const [query, setQuery] = useState("");
  const [chip, setChip] = useState<PublicChip>("all");
  const [team, setTeam] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const stats = useMemo(() => derivePublicRosterStats(rows), [rows]);

  const filtered = useMemo(
    () =>
      rows.filter(
        (r) =>
          matchesRosterQuery(r, query) &&
          (chip === "all" || r.rank === "captain") &&
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

  const emptyTitle =
    rows.length === 0
      ? "No members have signed up yet."
      : "No members match your search.";

  return (
    <div className="flex flex-col gap-6">
      <RosterToolbar
        query={query}
        onQueryChange={setQuery}
        chip={chip}
        onChipChange={(next) =>
          setChip(next === "captains" ? "captains" : "all")
        }
        team={team}
        onTeamChange={setTeam}
        stats={stats}
        publicOnly
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
        <PublicMemberProfile
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
