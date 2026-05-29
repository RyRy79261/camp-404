"use client";

import { useMemo, useState } from "react";
import {
  Car,
  Check,
  Flag,
  Lock,
  MapPin,
  Minus,
  Search,
  ShieldCheck,
} from "lucide-react";
import { Input } from "@camp404/ui/components/input";
import { cn } from "@camp404/ui/lib/utils";
import type { RosterRow, RosterStatus } from "@/lib/camp-roster";

// Captains' camp-management roster table. Renders the live roster for
// captains; for everyone else it renders the same chrome locked and empty —
// the page deliberately doesn't redirect non-captains, it greys the data
// out (and the server sends none).

const STATUS_STYLE: Record<RosterStatus, string> = {
  ready: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  onboarding: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  pending: "bg-rose-500/15 text-rose-600 dark:text-rose-400",
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
    <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
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

export function CampManagementRoster({
  rows,
  locked,
}: {
  rows: RosterRow[];
  locked: boolean;
}) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.displayName.toLowerCase().includes(q) ||
        r.rankLabel.toLowerCase().includes(q) ||
        (r.country?.toLowerCase().includes(q) ?? false) ||
        r.teams.some((t) => teamLabel(t).toLowerCase().includes(q)),
    );
  }, [rows, query]);

  return (
    <div className="relative">
      {/* Counts strip + search. Hidden controls when locked (no data). */}
      {!locked && (
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            {rows.length} {rows.length === 1 ? "member" : "members"} signed up
          </p>
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
                  {rows.length === 0
                    ? "No members have signed up yet."
                    : "No members match your search."}
                </td>
              </tr>
            ) : (
              filtered.map((r) => (
                <tr
                  key={r.id}
                  className="border-b last:border-0 hover:bg-muted/30"
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
                            ? "bg-sky-500/15 text-sky-600 dark:text-sky-400"
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
    </div>
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
