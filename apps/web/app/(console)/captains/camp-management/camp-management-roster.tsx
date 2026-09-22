"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Search, X } from "lucide-react";
import { Button } from "@camp404/ui/components/button";
import { Card, CardContent } from "@camp404/ui/components/card";
import { Checkbox } from "@camp404/ui/components/checkbox";
import { EmptyState } from "@camp404/ui/components/empty-state";
import { cn } from "@camp404/ui/lib/utils";
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

// Captains' camp-management roster, composed like the AfrikaBurn console's
// registrations page: KPI cards, the filter strip, the table, then the member's
// review below it. Captain-only triage surface: full rows + the approval
// counts + the approve/reject/assign actions. Non-captain members are routed to the public
// `MemberRoster` by the page (server-side), so this island always renders the
// captain view. All the island LOGIC (filter/search/chip state, row→profile
// selection, bulk decisions) is here; the detail fetch + single decisions +
// promotion live in MemberProfile and the dialogs.
//
// A member a captain just decided stays on screen even when the new status no
// longer matches the filter (a just-approved applicant under Pending), so the
// captain sees the result. Changing the search, chip or team starts afresh.
//
// Under Pending, rows can be ticked and decided together, from a bar above the
// table built from the shared Checkbox and Button.

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
  initialTeam = null,
}: {
  rows: RosterRow[];
  teams: readonly { key: string; label: string }[];
  /** key → configured label for the profile team chips. */
  teamLabels?: Record<string, string>;
  /**
   * The team filter to open with — `?team=` on the URL, already checked
   * against the active teams by the page. The Overview's coverage rail links
   * here that way.
   */
  initialTeam?: string | null;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [chip, setChip] = useState<RosterChip>("all");
  const [team, setTeam] = useState<string | null>(initialTeam);
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
      {/* Headline numbers — captain-only (approval-derived counts), drawn as
          the AfrikaBurn console's KPI cards. */}
      <section
        aria-label="Roster at a glance"
        className="grid grid-cols-3 gap-2 sm:gap-4"
      >
        {(
          [
            {
              kicker: "Members",
              value: stats.members,
              sub: "All sign-ups",
              dot: "bg-primary",
            },
            {
              kicker: "Approved",
              value: stats.approved,
              sub: "Cleared to camp",
              dot: "bg-success",
            },
            {
              kicker: "Incomplete",
              value: stats.incomplete,
              sub: "Notices & questionnaires unfinished",
              dot: "bg-warning",
            },
          ] as const
        ).map((kpi) => (
          <Card key={kpi.kicker} className="h-full">
            <CardContent className="flex flex-col gap-2 p-3 sm:p-5">
              <div className="flex items-center gap-2">
                <span
                  aria-hidden
                  className={cn(
                    "hidden h-2 w-2 shrink-0 rounded-full sm:block",
                    kpi.dot,
                  )}
                />
                <span className="font-mono text-[0.65rem] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                  {kpi.kicker}
                </span>
              </div>
              <p className="text-3xl font-extrabold leading-none tabular-nums">
                {kpi.value}
              </p>
              <p className="hidden text-xs font-medium text-muted-foreground sm:block">
                {kpi.sub}
              </p>
            </CardContent>
          </Card>
        ))}
      </section>

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
          className="flex flex-wrap items-center gap-3 rounded-xl border border-accent/40 bg-card px-4 py-3 text-card-foreground shadow-sm"
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
          <span className="text-sm tabular-nums text-muted-foreground">
            {ticked.length} selected
          </span>
          <div className="ml-auto flex gap-2">
            <Button
              type="button"
              size="sm"
              disabled={ticked.length === 0 || bulkPending}
              onClick={() => decideTicked("approved")}
            >
              <Check aria-hidden />
              Approve {ticked.length}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="destructive"
              disabled={ticked.length === 0 || bulkPending}
              onClick={() => setBulkRejectOpen(true)}
            >
              <X aria-hidden />
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
        // Keyed by the chip and team, so a new filter fades the list in
        // (motion-safe). Typing a search does not: it would flicker per key.
        <div
          key={`${chip}|${team ?? ""}`}
          className="flex flex-col gap-3 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-150"
        >
          <p className="text-sm tabular-nums text-muted-foreground">
            {filtered.length} {filtered.length === 1 ? "member" : "members"}
          </p>
          <RosterTable
            className="hidden md:block"
            rows={filtered}
            selectedId={selectedId}
            onSelect={setSelectedId}
            selection={selection}
            sort={{ value: sort, onChange: setSort }}
          />
          <RosterList
            className="md:hidden"
            rows={filtered}
            selectedId={selectedId}
            onSelect={setSelectedId}
            selection={selection}
          />
        </div>
      )}

      {/* Keyed by member on purpose: a fresh panel per member means no state
          (notes draft, reject reason, loaded detail) from the last one can show
          under the new name. The panel animates in each time instead. */}
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
