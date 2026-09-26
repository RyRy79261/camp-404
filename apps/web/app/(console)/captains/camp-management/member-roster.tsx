"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { EmptyState } from "@camp404/ui/components/empty-state";
import {
  derivePublicRosterStats,
  matchesPublicChip,
  matchesRosterQuery,
  matchesTeam,
  type PublicRosterChip,
  type PublicRosterRow,
} from "@/lib/camp-roster";
import { PublicMemberProfile } from "./public-member-profile";
import { focusRosterTrigger } from "./roster-presentation";
import { RosterList } from "./roster-list";
import { RosterTable } from "./roster-table";
import { RosterToolbar } from "./roster-toolbar";

// Member-facing roster (revived per the owner's call), in the same console
// composition as the captain's minus the captain chrome. Any approved camp
// member may browse who is at camp — names, handles, country, role, teams —
// see who has applied, and open a PUBLIC card (bio + what they bring). Join
// date, contact details, government ID, dues, captain notes and the admin
// actions are withheld SERVER-SIDE: this island only ever receives
// PublicRosterRow, so it has no private data to render. Filters are
// All / Pending / Captains / Team.
//
// Pending is here on the owner's 2026-09-22 ruling ("everyone should be able to
// see the applicants"). Declined sign-ups never arrive in `rows` at all
// (MEMBERS_SEE_REJECTED), so there is no chip for them.

export function MemberRoster({
  rows,
  teams,
  teamLabels = {},
  initialTeam = null,
}: {
  rows: PublicRosterRow[];
  teams: readonly { key: string; label: string }[];
  /** key → configured label for the profile team chips. */
  teamLabels?: Record<string, string>;
  /** The team filter to open with — `?team=`, checked by the page. */
  initialTeam?: string | null;
}) {
  const [query, setQuery] = useState("");
  const [chip, setChip] = useState<PublicRosterChip>("all");
  const [team, setTeam] = useState<string | null>(initialTeam);
  // Same as the captain roster: a same-route `?team=` change keeps this
  // component mounted, so the filter follows the prop rather than the mount.
  const [urlTeam, setUrlTeam] = useState(initialTeam);
  if (urlTeam !== initialTeam) {
    setUrlTeam(initialTeam);
    setTeam(initialTeam);
  }
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Counted over every row this member HAS, so each chip's badge is exactly
  // how many rows pressing it shows.
  const stats = useMemo(() => derivePublicRosterStats(rows), [rows]);
  // The Standing column appears only when somebody on the roster is an
  // applicant — decided over the full roster so a filter never moves it.
  const showStanding = useMemo(
    () => rows.some((r) => r.standing !== null),
    [rows],
  );

  const filtered = useMemo(
    () =>
      rows.filter(
        (r) =>
          matchesRosterQuery(r, query, teamLabels) &&
          matchesPublicChip(r, chip) &&
          (team === null || matchesTeam(r, team)),
      ),
    [rows, query, chip, team, teamLabels],
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
          setChip(next === "captains" || next === "pending" ? next : "all")
        }
        team={team}
        onTeamChange={setTeam}
        teams={teams}
        stats={stats}
        publicOnly
      />

      {filtered.length === 0 ? (
        <EmptyState
          icon={<Search className="h-5 w-5" aria-hidden />}
          title={emptyTitle}
        />
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-sm tabular-nums text-muted-foreground">
            {filtered.length} {filtered.length === 1 ? "member" : "members"}
          </p>
          <RosterTable
            className="hidden page-md:block"
            rows={filtered}
            selectedId={selectedId}
            onSelect={setSelectedId}
            showStanding={showStanding}
          />
          <RosterList
            className="page-md:hidden"
            rows={filtered}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />
        </div>
      )}

      {selectedRow && (
        <PublicMemberProfile
          key={selectedRow.id}
          row={selectedRow}
          index={selectedIndex}
          teamLabels={teamLabels}
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
