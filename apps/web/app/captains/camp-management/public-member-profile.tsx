"use client";

import { useEffect, useRef, useState } from "react";
import { Lock, X } from "lucide-react";
import { Spinner } from "@camp404/ui/components/spinner";
import type { PublicRosterRow } from "@/lib/camp-roster";
import { getPublicMemberProfileAction } from "./actions";
import { RoleBadge, RosterAvatar, TeamBadge } from "./roster-presentation";

// Inline PUBLIC member card (member view). Identity (name, @handle, country,
// role, teams) comes from the already-public roster row; the bio + this-year
// ideas load via getPublicMemberProfileAction — an allowlist, so approval
// status, contact details, government ID and admin actions never reach a member.
// A lock note stands in for the captain-only section.

type State =
  | { state: "loading" }
  | { state: "loaded"; bio: string | null; contribution: string | null }
  | { state: "error"; message: string };

export function PublicMemberProfile({
  row,
  index,
  onClose,
  teamLabels = {},
}: {
  row: PublicRosterRow;
  index: number;
  onClose: () => void;
  /** key → configured label for the team chips (falls back to the humanizer). */
  teamLabels?: Record<string, string>;
}) {
  const [detail, setDetail] = useState<State>({ state: "loading" });
  const panelRef = useRef<HTMLElement>(null);

  // Load the public card whenever a (new) row is selected; abandon a stale
  // response if the member has since opened a different row.
  useEffect(() => {
    let cancelled = false;
    setDetail({ state: "loading" });
    void getPublicMemberProfileAction(row.id)
      .then((res) => {
        if (cancelled) return;
        setDetail(
          res.ok
            ? { state: "loaded", bio: res.bio, contribution: res.contribution }
            : { state: "error", message: res.error },
        );
      })
      .catch(() => {
        if (cancelled) return;
        setDetail({ state: "error", message: "Couldn't load this member." });
      });
    return () => {
      cancelled = true;
    };
  }, [row.id]);

  // Move focus into the panel on open (a11y); the island returns focus to the
  // triggering row on close.
  useEffect(() => {
    panelRef.current?.focus();
  }, [row.id]);

  return (
    <section
      ref={panelRef}
      tabIndex={-1}
      aria-label={`${row.displayName} profile`}
      className="flex flex-col gap-5 rounded-lg border bg-card p-5 outline-none sm:p-6"
    >
      {/* PanelBar: console prompt + record index + close. */}
      <div className="flex items-center gap-2 border-b pb-3.5">
        <span aria-hidden className="font-mono text-sm font-bold text-accent">
          {">"}
        </span>
        <span className="flex-1 truncate font-mono text-caption text-muted-foreground">
          {row.displayName.toLowerCase()} · profile
        </span>
        <span className="font-mono text-caption font-semibold text-accent">
          #{String(index).padStart(2, "0")}
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close profile"
          className="ml-1 inline-flex items-center justify-center rounded-md p-1 text-muted-foreground transition-colors hover:bg-white/[0.04] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <X aria-hidden className="h-4 w-4" />
        </button>
      </div>

      {/* Head — entirely from the public row. */}
      <div className="flex items-start gap-4">
        <RosterAvatar name={row.displayName} id={row.id} px={64} radius={8} />
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <h2 className="font-mono text-2xl font-bold text-foreground">
            {row.displayName}
          </h2>
          {row.handle && (
            <p className="font-mono text-sm text-muted-foreground">
              @{row.handle}
            </p>
          )}
          {row.country && (
            <p className="text-sm text-muted-foreground">{row.country}</p>
          )}
          {row.teams.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
              {row.teams.map((team) => (
                <TeamBadge key={team} team={team} label={teamLabels[team]} />
              ))}
            </div>
          )}
        </div>
        <div className="shrink-0">
          <RoleBadge
            rank={row.rank}
            isLead={row.isLead}
            className="rounded-full bg-muted px-2.5 py-1"
          />
        </div>
      </div>

      {/* Public body: bio + this-year ideas (allowlisted). */}
      {detail.state === "loading" && (
        <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
          <Spinner size="sm" />
          Loading…
        </div>
      )}
      {detail.state === "error" && (
        <p className="py-6 text-center text-sm text-destructive">
          {detail.message}
        </p>
      )}
      {detail.state === "loaded" && (
        <div className="flex flex-col gap-4">
          {detail.bio ? (
            <p className="whitespace-pre-line text-sm text-foreground">
              {detail.bio}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">No bio on record yet.</p>
          )}
          {detail.contribution && (
            <div className="flex flex-col gap-1">
              <h3 className="font-mono text-micro font-bold uppercase tracking-wide text-muted-foreground">
                What they bring to camp
              </h3>
              <p className="whitespace-pre-line text-sm text-foreground">
                {detail.contribution}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Captain-only section — locked for members (decision: privacy). */}
      <div className="flex items-center gap-3 rounded-lg border border-dashed bg-muted/20 px-4 py-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border bg-muted/40">
          <Lock aria-hidden className="h-4 w-4 text-muted-foreground" />
        </span>
        <p className="text-caption text-muted-foreground">
          <span className="font-semibold text-foreground">Captains only.</span>{" "}
          Approval status, contact details and admin actions are visible to
          captains.
        </p>
      </div>
    </section>
  );
}
