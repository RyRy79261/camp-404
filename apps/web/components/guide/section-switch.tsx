"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ConfirmDialog } from "@camp404/ui/components/confirm-dialog";
import { Switch } from "@camp404/ui/components/switch";
import { toast } from "@camp404/ui/components/toast";
import { GUIDE_SITE_HOST } from "@camp404/types";
import { setGuideSectionPublicAction } from "@/app/(console)/guide/actions";

// A section's switch for the public site (#250, owner 2026-10-04), on the
// guide's contents grouped by topic, for captains. Turning a section on asks
// first and names every chapter that goes out and every one that stays members
// only; turning it off takes them all off at once, with no question. The
// write checks the captain again inside its transaction and audits the change.

export function SectionSwitch({
  category,
  label,
  isPublic,
  goingOut,
  staying,
}: {
  category: string;
  /** "Safety". */
  label: string;
  isPublic: boolean;
  /** What would go on the site now: "Burn barrel fire safety (duty card)". */
  goingOut: string[];
  /** Chapters kept members only by a captain's mark. */
  staying: string[];
}) {
  const router = useRouter();
  const [on, setOn] = React.useState(isPublic);
  const [asking, setAsking] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  // A refreshed page is the truth: follow `isPublic` when it changes,
  // adjusted for during render.
  const [seenPublic, setSeenPublic] = React.useState(isPublic);
  if (seenPublic !== isPublic) {
    setSeenPublic(isPublic);
    setOn(isPublic);
  }

  async function flip(next: boolean): Promise<boolean> {
    setPending(true);
    setError(null);
    let result: Awaited<ReturnType<typeof setGuideSectionPublicAction>>;
    try {
      result = await setGuideSectionPublicAction({ category, public: next });
    } catch {
      result = {
        ok: false,
        error: "That didn't go through. Check your connection and try again.",
      };
    } finally {
      setPending(false);
    }
    if (!result.ok) {
      if (next) setError(result.error);
      else toast.error(result.error);
      return false;
    }
    setOn(next);
    const n = result.data.chapters.length;
    toast.success(
      next
        ? `${label} is on ${GUIDE_SITE_HOST}`
        : `${label} is off the public site${n > 0 ? `: ${n} ${n === 1 ? "chapter" : "chapters"} taken off` : ""}`,
    );
    router.refresh();
    return true;
  }

  const n = goingOut.length;
  return (
    <>
      <label className="flex items-center gap-2 text-sm font-semibold">
        <Switch
          checked={on}
          disabled={pending}
          aria-label={`${label} on the public site`}
          onCheckedChange={(next) => {
            if (next) setAsking(true);
            else void flip(false);
          }}
        />
        Public
      </label>
      <ConfirmDialog
        open={asking}
        onOpenChange={(open) => {
          setAsking(open);
          if (!open) setError(null);
        }}
        title={`Make ${label} public?`}
        description={
          n === 0
            ? `Nothing in ${label} is published yet, so nothing goes on ${GUIDE_SITE_HOST} now.`
            : `${n} ${n === 1 ? "chapter goes" : "chapters go"} on ${GUIDE_SITE_HOST} now:`
        }
        confirmLabel="Make public"
        pending={pending}
        error={error}
        onConfirm={async () => {
          if (await flip(true)) setAsking(false);
        }}
      >
        <div className="flex flex-col gap-3 text-sm">
          {n > 0 ? (
            <ul aria-label="Goes public" className="list-disc pl-5">
              {goingOut.map((title) => (
                <li key={title}>{title}</li>
              ))}
            </ul>
          ) : null}
          <p className="text-muted-foreground">
            {staying.length > 0
              ? `${staying.join(", ")} ${staying.length === 1 ? "stays" : "stay"} members only. `
              : ""}
            Anyone with the link can read the public chapters, without signing
            in. Chapters added to {label} later go public when they are
            published.
          </p>
        </div>
      </ConfirmDialog>
    </>
  );
}
