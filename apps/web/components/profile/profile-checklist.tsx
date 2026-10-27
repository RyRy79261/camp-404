"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { Check, ChevronDown, UserRound } from "lucide-react";
import {
  profileChecklistTitle,
  type ProfileChecklist,
  type ProfileChecklistItem,
} from "@camp404/core";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@camp404/ui/components/card";
import { ProgressBar } from "@camp404/ui/components/progress-bar";
import { cn } from "@camp404/ui/lib/utils";

// "Your profile isn't finished" (owner's mock-up, step 6, 2026-10-27). The
// member's profile gaps as ONE grouped notice at the top of the bell's panel
// and the inbox, which opens a short checklist, and the same checklist as a
// card on Profile. Each line links to where it is fixed and ticks itself once
// it is. It never blocks anything. The lines come from profileChecklist in
// @camp404/core, worked out on the server on each read.

/** One line: a tick circle, then a link to the fix, or the done words. */
function Line({
  item,
  withHint,
  onNavigate,
}: {
  item: ProfileChecklistItem;
  /** The panel shows each hint under its link; the card keeps it short. */
  withHint: "below" | "inline" | "none";
  onNavigate?: () => void;
}) {
  return (
    <li
      className={cn(
        "flex items-start gap-2 text-sm",
        item.done && "text-muted-foreground",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border",
          item.done
            ? "border-success bg-success/20 text-success"
            : "border-border",
        )}
      >
        {item.done && <Check className="h-3 w-3" />}
      </span>
      {item.done ? (
        <span>
          <span className="sr-only">Done: </span>
          {item.label}
        </span>
      ) : (
        <span className="min-w-0">
          <Link
            href={item.href}
            onClick={onNavigate}
            className="font-medium text-accent underline-offset-4 hover:underline"
          >
            {item.label}
          </Link>
          {item.hint && withHint === "inline" && (
            <span className="text-muted-foreground"> {item.hint}</span>
          )}
          {item.hint && withHint === "below" && (
            <span className="block text-xs text-muted-foreground">
              {item.hint}
            </span>
          )}
        </span>
      )}
    </li>
  );
}

/**
 * The grouped notice, for the bell's panel (`as="li"`) and the inbox. Shut by
 * default to one line; it opens to the checklist. Draws nothing while every
 * line is done.
 */
export function ProfileChecklistNotice({
  checklist,
  as = "div",
  onNavigate,
  className,
}: {
  checklist: ProfileChecklist | null;
  as?: "div" | "li";
  /** Called when a line's link is followed (the panel closes itself). */
  onNavigate?: () => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const listId = useId();
  if (!checklist || checklist.missing === 0) return null;
  const Root = as;
  return (
    <Root
      className={cn("border-b border-border bg-primary/5", className)}
      data-profile-checklist
    >
      <button
        type="button"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      >
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent">
          <UserRound className="h-4 w-4" aria-hidden />
        </span>
        <span className="min-w-0 flex-1 space-y-0.5">
          <span className="block text-xs text-muted-foreground">
            Your profile
          </span>
          <span className="block text-sm font-semibold leading-snug text-foreground">
            {profileChecklistTitle(checklist.missing)}
          </span>
        </span>
        <ChevronDown
          aria-hidden
          className={cn(
            "mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
        />
      </button>
      {open && (
        <ul id={listId} className="flex flex-col gap-2 px-4 pb-3 pl-16">
          {checklist.items.map((item) => (
            <Line
              key={item.key}
              item={item}
              withHint="below"
              onNavigate={onNavigate}
            />
          ))}
        </ul>
      )}
    </Root>
  );
}

/** The card on Profile: "Finish your profile", how many are done, the lines. */
export function ProfileChecklistCard({
  checklist,
}: {
  checklist: ProfileChecklist | null;
}) {
  if (!checklist || checklist.missing === 0) return null;
  const total = checklist.items.length;
  const done = total - checklist.missing;
  return (
    <Card className="border-l-4 border-l-accent" data-profile-checklist>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base">Finish your profile</CardTitle>
          <span className="text-xs text-muted-foreground">
            {done} of {total} done
          </span>
        </div>
        <ProgressBar
          value={done}
          max={total}
          label={`${done} of ${total} done`}
        />
      </CardHeader>
      <CardContent>
        <ul className="flex flex-col gap-2">
          {checklist.items.map((item) => (
            <Line key={item.key} item={item} withHint="inline" />
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
