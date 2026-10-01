import type { ReactNode } from "react";
import { Lock } from "lucide-react";

import { cn } from "../lib/utils";

// Preview-but-locked: the page shows its heading, and this card stands where
// the data would be. The page sends no data for a rank below its bar, so this
// is the whole of what that viewer gets. Drawn as a card in the window's
// blue card tint, like every other box inside a window, with a lock. `title`
// names who may see it; `message` says what the viewer is missing; `action`
// is the way forward, when there is one (a link to their own page).
export interface CaptainLockProps {
  /** @default "Captain access only" */
  title?: string;
  /** @default "This data is visible to captains. Your rank doesn’t have clearance for this view." */
  message?: string;
  /** A button or link under the message: where to go instead. */
  action?: ReactNode;
  className?: string;
}

export function CaptainLock({
  title = "Captain access only",
  message = "This data is visible to captains. Your rank doesn’t have clearance for this view.",
  action,
  className,
}: CaptainLockProps) {
  // `data-captain-lock` tells the 404 OS desktop a gate refused this page,
  // so it refreshes its program list (the member may have been demoted by
  // someone else since it was drawn).
  return (
    <div
      data-captain-lock=""
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-xl border border-border bg-card px-6 py-16 text-center",
        className,
      )}
    >
      <Lock aria-hidden className="h-6 w-6 text-muted-foreground" />
      <div className="flex flex-col gap-1.5">
        <p className="text-base font-medium text-foreground">{title}</p>
        <p className="mx-auto max-w-md text-sm text-muted-foreground">
          {message}
        </p>
      </div>
      {action}
    </div>
  );
}
