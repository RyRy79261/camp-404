"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Car,
  Check,
  Flag,
  Loader2,
  Lock,
  MapPin,
  Minus,
  Search,
  ShieldCheck,
  ThumbsUp,
  X,
} from "lucide-react";
import { Button } from "@camp404/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@camp404/ui/components/dialog";
import { Input } from "@camp404/ui/components/input";
import { cn } from "@camp404/ui/lib/utils";
import type { RosterRow, RosterStatus } from "@/lib/camp-roster";
import type { PresentedMember } from "@/lib/member-detail";
import {
  decideApprovalAction,
  getMemberDetailAction,
} from "./actions";

// Captains' camp-management roster table. Renders the live roster for
// captains; for everyone else it renders the same chrome locked and empty —
// the page deliberately doesn't redirect non-captains, it greys the data
// out (and the server sends none). Rows are clickable: a captain opens a
// per-burner modal with their details and the actions they can take
// (approve / reject a pending applicant).

const STATUS_STYLE: Record<RosterStatus, string> = {
  ready: "bg-emerald-500/15 text-emerald-400",
  onboarding: "bg-amber-500/15 text-amber-400",
  awaiting_approval: "bg-sky-500/15 text-sky-400",
  rejected: "bg-rose-500/15 text-rose-400",
  pending: "bg-rose-500/15 text-rose-400",
};

function teamLabel(team: string): string {
  return team
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/** Yes/no cell — a tick when true, a muted dash when false. */
function YesNo({ value, label }: { value: boolean; label: string }) {
  return value ? (
    <span className="inline-flex items-center gap-1 text-emerald-400">
      <Check className="h-4 w-4" aria-hidden />
      <span className="sr-only">{label}: yes</span>
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-muted-foreground/50">
      <Minus className="h-4 w-4" aria-hidden />
      <span className="sr-only">{label}: no</span>
    </span>
  );
}

type Filter = "all" | "awaiting";

export function CampManagementRoster({
  rows,
  locked,
}: {
  rows: RosterRow[];
  locked: boolean;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const awaitingCount = useMemo(
    () => rows.filter((r) => r.awaitingApproval).length,
    [rows],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (filter === "awaiting" && !r.awaitingApproval) return false;
      if (!q) return true;
      return (
        r.displayName.toLowerCase().includes(q) ||
        r.rankLabel.toLowerCase().includes(q) ||
        (r.country?.toLowerCase().includes(q) ?? false) ||
        r.teams.some((t) => teamLabel(t).toLowerCase().includes(q))
      );
    });
  }, [rows, query, filter]);

  const selectedRow = useMemo(
    () => rows.find((r) => r.id === selectedId) ?? null,
    [rows, selectedId],
  );

  return (
    <div className="relative">
      {/* Counts strip + filter + search. Hidden controls when locked. */}
      {!locked && (
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="inline-flex rounded-lg border p-0.5 text-sm">
            <button
              type="button"
              onClick={() => setFilter("all")}
              className={cn(
                "rounded-md px-3 py-1.5 font-medium transition-colors",
                filter === "all"
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              All ({rows.length})
            </button>
            <button
              type="button"
              onClick={() => setFilter("awaiting")}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 font-medium transition-colors",
                filter === "awaiting"
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              Awaiting approval
              {awaitingCount > 0 && (
                <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-sky-500/20 px-1.5 text-xs text-sky-400">
                  {awaitingCount}
                </span>
              )}
            </button>
          </div>
          <div className="relative w-full sm:w-72">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name, team, country…"
              className="pl-8"
              aria-label="Search the roster"
            />
          </div>
        </div>
      )}

      <div
        className={cn(
          "overflow-x-auto rounded-lg border",
          locked && "pointer-events-none select-none opacity-40 blur-[2px]",
        )}
        aria-hidden={locked}
      >
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-3 py-2.5 font-medium">Member</th>
              <th className="px-3 py-2.5 font-medium">Rank</th>
              <th className="px-3 py-2.5 font-medium">Status</th>
              <th className="px-3 py-2.5 text-center font-medium">
                <span className="inline-flex items-center gap-1">
                  <ShieldCheck className="h-3.5 w-3.5" /> Questionnaires
                </span>
              </th>
              <th className="px-3 py-2.5 text-center font-medium">
                <span className="inline-flex items-center gap-1">
                  <Car className="h-3.5 w-3.5" /> Driver
                </span>
              </th>
              <th className="px-3 py-2.5 text-center font-medium">
                <span className="inline-flex items-center gap-1">
                  <Flag className="h-3.5 w-3.5" /> In SA
                </span>
              </th>
              <th className="px-3 py-2.5 font-medium">
                <span className="inline-flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5" /> Country
                </span>
              </th>
            </tr>
          </thead>
          <tbody>
            {locked ? (
              <PlaceholderRows />
            ) : filtered.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  className="px-3 py-10 text-center text-muted-foreground"
                >
                  {filter === "awaiting"
                    ? "Nobody is awaiting approval."
                    : rows.length === 0
                      ? "No members have signed up yet."
                      : "No members match your search."}
                </td>
              </tr>
            ) : (
              filtered.map((r) => (
                <tr
                  key={r.id}
                  onClick={() => setSelectedId(r.id)}
                  className="cursor-pointer border-b last:border-0 hover:bg-muted/30"
                >
                  <td className="px-3 py-2.5">
                    <div className="font-medium">{r.displayName}</div>
                    {r.teams.length > 0 && (
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        {r.teams.map(teamLabel).join(", ")}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    <span
                      className={cn(
                        "inline-flex rounded-full px-2 py-0.5 text-xs font-medium",
                        r.rank === "captain"
                          ? "bg-primary/15 text-primary"
                          : r.isLead
                            ? "bg-sky-500/15 text-sky-400"
                            : "bg-muted text-muted-foreground",
                      )}
                    >
                      {r.rankLabel}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    <span
                      className={cn(
                        "inline-flex rounded-full px-2 py-0.5 text-xs font-medium",
                        STATUS_STYLE[r.status],
                      )}
                      title={
                        r.pendingRequiredActions > 0
                          ? `${r.pendingRequiredActions} outstanding action${
                              r.pendingRequiredActions === 1 ? "" : "s"
                            }`
                          : undefined
                      }
                    >
                      {r.statusLabel}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    <YesNo
                      value={r.requiredComplete}
                      label="Required questionnaires complete"
                    />
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    <YesNo value={r.isDriver} label="Registered as a driver" />
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    <YesNo value={r.inSouthAfrica} label="In South Africa" />
                  </td>
                  <td className="px-3 py-2.5 text-muted-foreground">
                    {r.country ?? "—"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {locked && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="flex max-w-sm flex-col items-center gap-2 rounded-lg border bg-background/95 px-6 py-5 text-center shadow-sm">
            <Lock className="h-6 w-6 text-muted-foreground" aria-hidden />
            <p className="font-medium">Captain access only</p>
            <p className="text-sm text-muted-foreground">
              Camp management data is visible to captains. Your rank
              doesn&apos;t have clearance for this view.
            </p>
          </div>
        </div>
      )}

      {!locked && (
        <MemberModal
          row={selectedRow}
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  );
}

// --- Per-burner detail modal ---------------------------------------------

type DetailState =
  | { state: "loading" }
  | { state: "loaded"; member: PresentedMember }
  | { state: "error"; message: string };

function MemberModal({
  row,
  onClose,
}: {
  row: RosterRow | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const [detail, setDetail] = useState<DetailState>({ state: "loading" });
  const [tab, setTab] = useState<"overview" | "profile">("overview");
  const [actionError, setActionError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const open = row != null;
  const rowId = row?.id ?? null;

  // Fetch detail whenever a (new) row is selected. Abandon a stale response if
  // the captain has since clicked a different burner.
  useEffect(() => {
    if (!rowId) return;
    let cancelled = false;
    setTab("overview");
    setActionError(null);
    setDetail({ state: "loading" });
    void getMemberDetailAction(rowId).then((res) => {
      if (cancelled) return;
      setDetail(
        res.ok
          ? { state: "loaded", member: res.member }
          : { state: "error", message: res.error },
      );
    });
    return () => {
      cancelled = true;
    };
  }, [rowId]);

  function decide(decision: "approved" | "rejected") {
    if (!row) return;
    setActionError(null);
    startTransition(async () => {
      const res = await decideApprovalAction(row.id, decision);
      if (!res.ok) {
        setActionError(res.error);
        return;
      }
      // Reflect the decision locally so the action buttons disappear, then
      // refresh the server data behind the table.
      setDetail((prev) =>
        prev.state === "loaded"
          ? {
              state: "loaded",
              member: { ...prev.member, approvalStatus: decision },
            }
          : prev,
      );
      router.refresh();
    });
  }

  const member = detail.state === "loaded" ? detail.member : null;
  const isAwaiting = member?.approvalStatus === "pending";

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent className="max-h-[85vh] gap-0 overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="border-b p-5">
          <DialogTitle>{row?.displayName ?? "Member"}</DialogTitle>
          <DialogDescription>
            {member ? member.approvalSummary : "Loading…"}
          </DialogDescription>
        </DialogHeader>

        {/* Tabs */}
        <div className="flex gap-1 border-b px-5 pt-3">
          {(["overview", "profile"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={cn(
                "rounded-t-md px-3 py-2 text-sm font-medium capitalize transition-colors",
                tab === t
                  ? "border-b-2 border-primary text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t}
            </button>
          ))}
        </div>

        <div className="max-h-[45vh] overflow-y-auto p-5">
          {detail.state === "loading" && (
            <div className="flex items-center justify-center py-10 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          )}
          {detail.state === "error" && (
            <p className="py-10 text-center text-sm text-destructive">
              {detail.message}
            </p>
          )}
          {member && tab === "overview" && (
            <div className="space-y-4">
              {member.profileImageUrl && (
                <img
                  src={member.profileImageUrl}
                  alt=""
                  className="h-20 w-20 rounded-full border object-cover"
                />
              )}
              <DetailList items={member.overview} />
            </div>
          )}
          {member && tab === "profile" && (
            <div className="space-y-5">
              {member.profileSections.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No questionnaire answers on record yet.
                </p>
              ) : (
                member.profileSections.map((section) => (
                  <div key={section.title} className="space-y-2">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {section.title}
                    </h3>
                    <DetailList items={section.items} />
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* Actions footer — reserved for things the captain needs to DO. The
            approve/reject pair shows only while a decision is outstanding;
            once decided it disappears. Ping is a future feature. */}
        <DialogFooter className="flex-col gap-3 border-t p-5 sm:flex-col">
          {actionError && (
            <p role="alert" className="text-sm text-destructive">
              {actionError}
            </p>
          )}
          <div className="flex w-full items-center gap-2">
            <span className="mr-auto text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Actions
            </span>
            {isAwaiting && (
              <>
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  disabled={isPending}
                  onClick={() => decide("rejected")}
                >
                  <X className="h-4 w-4" /> Reject
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={isPending}
                  className="bg-emerald-600 text-white hover:bg-emerald-600/90"
                  onClick={() => decide("approved")}
                >
                  {isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Check className="h-4 w-4" />
                  )}{" "}
                  Approve
                </Button>
              </>
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled
              title="Coming soon — nudge this member to check the app"
            >
              <ThumbsUp className="h-4 w-4" /> Ping
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DetailList({
  items,
}: {
  items: { label: string; value: string }[];
}) {
  if (items.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">Nothing recorded.</p>
    );
  }
  return (
    <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-2 text-sm">
      {items.map((item, i) => (
        <div key={i} className="contents">
          <dt className="text-muted-foreground">{item.label}</dt>
          <dd className="font-medium">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Empty skeleton rows so the locked table reads as "data here, but hidden". */
function PlaceholderRows() {
  return (
    <>
      {Array.from({ length: 6 }).map((_, i) => (
        <tr key={i} className="border-b last:border-0">
          {Array.from({ length: 7 }).map((__, j) => (
            <td key={j} className="px-3 py-3.5">
              <div className="h-3 w-16 rounded bg-muted" />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}
