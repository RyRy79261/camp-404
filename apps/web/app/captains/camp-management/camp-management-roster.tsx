"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { Button } from "@camp404/ui/components/button";
import { Checkbox } from "@camp404/ui/components/checkbox";
import { EmptyState } from "@camp404/ui/components/empty-state";
import { StatTile } from "@camp404/ui/components/stat-tile";
import {
  DEFAULT_ROSTER_SORT,
  deriveRosterStats,
  matchesChip,
  matchesRosterQuery,
  matchesTeam,
  sortRosterRows,
  type RosterChip,
  type RosterRow,
  type RosterSort,
} from "@/lib/camp-roster";
import { decideApprovalsAction, type BulkApprovalResult } from "./actions";
import { MemberProfile } from "./member-profile";
import { RejectConfirmDialog } from "./reject-confirm-dialog";
import { focusRosterTrigger } from "./roster-presentation";
import { RosterList } from "./roster-list";
import { RosterTable, type RosterSelection } from "./roster-table";
import { RosterToolbar } from "./roster-toolbar";

// Captains' camp-management roster (board S17, iteration B — terminal console).
// Captain-only triage surface: full rows + the approval stats strip + the
// approve/reject/assign actions. Non-captain members are routed to the public
// `MemberRoster` by the page (server-side), so this island always renders the
// captain view. All the island LOGIC (filter/search/chip state, row→profile
// selection, bulk decisions) is here; the detail fetch + single decisions +
// promotion live in MemberProfile and the dialogs.
//
// A member a captain just decided stays on screen even when the new status no
// longer matches the filter (a just-approved applicant under Pending), so the
// captain sees the result. Changing the search, chip or team starts afresh.
//
// Under Pending, rows can be ticked and decided together. No board draws the
// bulk bar; it reuses the shared Checkbox and Button.

type BulkOutcome = Extract<BulkApprovalResult, { ok: true }>;

/** What a bulk decision did, as one sentence per kind of outcome. */
export function bulkSummary(
  to: "approved" | "rejected",
  result: BulkOutcome,
  nameOf: (id: string) => string,
): string {
  const parts: string[] = [];
  if (result.decided.length > 0) {
    parts.push(
      `${to === "approved" ? "Approved" : "Rejected"} ${result.decided.length}.`,
    );
  }
  if (result.lost.length > 0) {
    parts.push(
      result.lost.length === 1
        ? `${nameOf(result.lost[0]!)} was already decided by another captain.`
        : `${result.lost.length} were already decided by another captain.`,
    );
  }
  for (const { userId, error } of result.refused) {
    parts.push(`${nameOf(userId)}: ${error}`);
  }
  return parts.join(" ") || "Nothing changed.";
}

export function CampManagementRoster({
  rows,
  teams,
  teamLabels = {},
}: {
  rows: RosterRow[];
  teams: readonly { key: string; label: string }[];
  /** key → configured label for the profile team chips. */
  teamLabels?: Record<string, string>;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [chip, setChip] = useState<RosterChip>("all");
  const [team, setTeam] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sort, setSort] = useState<RosterSort>(DEFAULT_ROSTER_SORT);
  // Members decided since the filters last changed.
  const [pinned, setPinned] = useState<ReadonlySet<string>>(new Set());
  // Members ticked for a bulk decision.
  const [checked, setChecked] = useState<ReadonlySet<string>>(new Set());
  const [bulkRejectOpen, setBulkRejectOpen] = useState(false);
  const [bulkReason, setBulkReason] = useState("");
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [bulkSummaryText, setBulkSummaryText] = useState<string | null>(null);
  const [bulkPending, startBulk] = useTransition();

  const stats = useMemo(() => deriveRosterStats(rows), [rows]);

  /** A new search, chip or team starts afresh: no pins, no ticks. */
  function narrow(apply: () => void) {
    apply();
    setPinned(new Set());
    setChecked(new Set());
    setBulkSummaryText(null);
  }

  function pin(ids: readonly string[]) {
    setPinned((prev) => new Set([...prev, ...ids]));
  }

  const filtered = useMemo(
    () =>
      sortRosterRows(
        rows.filter(
          (r) =>
            pinned.has(r.id) ||
            (matchesRosterQuery(r, query, teamLabels) &&
              matchesChip(r, chip) &&
              (team === null || matchesTeam(r, team))),
        ),
        sort,
      ),
    [rows, query, chip, team, teamLabels, pinned, sort],
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

  const selectable = useMemo(
    () =>
      chip === "pending"
        ? filtered.filter((r) => r.awaitingApproval).map((r) => r.id)
        : [],
    [chip, filtered],
  );
  const ticked = selectable.filter((id) => checked.has(id));
  const selection: RosterSelection | undefined =
    selectable.length > 0
      ? {
          checked,
          canSelect: (r) => selectable.includes(r.id),
          onToggle: (id) =>
            setChecked((prev) => {
              const next = new Set(prev);
              if (next.has(id)) next.delete(id);
              else next.add(id);
              return next;
            }),
        }
      : undefined;

  function nameOf(id: string): string {
    return rows.find((r) => r.id === id)?.displayName ?? "A member";
  }

  function decideTicked(to: "approved" | "rejected", reason?: string) {
    const userIds = ticked;
    setBulkError(null);
    startBulk(async () => {
      const res = await decideApprovalsAction({ userIds, to, reason });
      if (!res.ok) {
        setBulkError(res.error);
        return;
      }
      pin([...res.decided, ...res.lost, ...res.refused.map((r) => r.userId)]);
      setChecked(new Set());
      setBulkRejectOpen(false);
      setBulkReason("");
      setBulkSummaryText(bulkSummary(to, res, nameOf));
      router.refresh();
    });
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
        onQueryChange={(value) => narrow(() => setQuery(value))}
        chip={chip}
        onChipChange={(value) => narrow(() => setChip(value))}
        team={team}
        onTeamChange={(value) => narrow(() => setTeam(value))}
        teams={teams}
        stats={stats}
        sort={{ value: sort, onChange: setSort }}
      />

      {selection && (
        <div
          role="group"
          aria-label="Decide several applications"
          className="flex flex-wrap items-center gap-3 rounded-lg border bg-muted px-3.5 py-2.5"
        >
          <Checkbox
            aria-label="Select every pending member shown"
            checked={
              ticked.length === 0
                ? false
                : ticked.length === selectable.length
                  ? true
                  : "indeterminate"
            }
            onCheckedChange={(value) =>
              setChecked(value === true ? new Set(selectable) : new Set())
            }
          />
          <span className="font-mono text-caption text-muted-foreground">
            {ticked.length} selected
          </span>
          <div className="ml-auto flex gap-2">
            <Button
              type="button"
              size="sm"
              disabled={ticked.length === 0 || bulkPending}
              onClick={() => decideTicked("approved")}
            >
              Approve {ticked.length}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={ticked.length === 0 || bulkPending}
              onClick={() => setBulkRejectOpen(true)}
            >
              Reject {ticked.length}
            </Button>
          </div>
        </div>
      )}
      {bulkError && !bulkRejectOpen && (
        <p role="alert" className="text-sm text-destructive">
          {bulkError}
        </p>
      )}
      {bulkSummaryText && (
        <p role="status" className="text-sm text-muted-foreground">
          {bulkSummaryText}
        </p>
      )}

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
            selection={selection}
            sort={{ value: sort, onChange: setSort }}
          />
          <RosterList
            className="sm:hidden"
            rows={filtered}
            selectedId={selectedId}
            onSelect={setSelectedId}
            selection={selection}
          />
        </>
      )}

      {selectedRow && (
        <MemberProfile
          key={selectedRow.id}
          row={selectedRow}
          index={selectedIndex}
          teamLabels={teamLabels}
          onDecided={(id) => pin([id])}
          onClose={() => {
            const id = selectedId;
            setSelectedId(null);
            if (id) focusRosterTrigger(id);
          }}
        />
      )}

      <RejectConfirmDialog
        mode={{ kind: "bulk", count: ticked.length }}
        open={bulkRejectOpen}
        onOpenChange={(open) => {
          setBulkRejectOpen(open);
          if (!open) setBulkError(null);
        }}
        onConfirm={() => decideTicked("rejected", bulkReason)}
        pending={bulkPending}
        error={bulkError}
        reason={bulkReason}
        onReasonChange={setBulkReason}
      />
    </div>
  );
}
