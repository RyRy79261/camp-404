"use client";

import { useEffect, useRef, useState } from "react";
import { Lock } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@camp404/ui/components/card";
import { SkeletonRegion, SkeletonText } from "@camp404/ui/components/skeleton";
import type { PublicRosterRow } from "@/lib/camp-roster";
import { getPublicMemberProfileAction } from "./actions";
import { ProfileHead } from "./roster-presentation";

// Inline PUBLIC member profile (member view), in the same review layout as the
// captain's: the header, the public record in the main column and a locked
// card where the captain-only controls would be. Identity (name, @handle,
// country, role, teams) comes from the already-public roster row; the bio +
// this-year ideas load via getPublicMemberProfileAction — an allowlist, so
// approval status, contact details, government ID and admin actions never
// reach a member.

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
      className="flex scroll-mt-24 flex-col gap-6 border-t pt-8 outline-none motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-2 motion-safe:duration-200"
    >
      {/* Head — entirely from the public row. */}
      <ProfileHead
        row={row}
        index={index}
        teamLabels={teamLabels}
        onClose={onClose}
      />

      <div className="grid items-start gap-6 lg:grid-cols-3">
        {/* Public body: bio + this-year ideas (allowlisted). */}
        <Card className="min-w-0 lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">About</CardTitle>
          </CardHeader>
          <CardContent>
            {detail.state === "loading" && (
              <SkeletonRegion label="Loading profile…">
                <SkeletonText lines={3} />
              </SkeletonRegion>
            )}
            {detail.state === "error" && (
              <p className="py-4 text-center text-sm text-destructive">
                {detail.message}
              </p>
            )}
            {detail.state === "loaded" && (
              <div className="flex flex-col gap-5">
                {detail.bio ? (
                  <p className="whitespace-pre-line text-sm text-foreground">
                    {detail.bio}
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No bio on record yet.
                  </p>
                )}
                {detail.contribution && (
                  <div>
                    <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      What they bring to camp
                    </h3>
                    <p className="mt-1 whitespace-pre-line text-sm text-foreground">
                      {detail.contribution}
                    </p>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Captain-only section — locked for members (decision: privacy). */}
        <aside className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-card/40 px-6 py-10 text-center lg:sticky lg:top-24">
          <Lock aria-hidden className="h-6 w-6 text-muted-foreground" />
          <p className="max-w-xs text-sm text-muted-foreground">
            <span className="font-medium text-foreground">Captains only.</span>{" "}
            Approval status, contact details and admin actions are visible to
            captains.
          </p>
        </aside>
      </div>
    </section>
  );
}
