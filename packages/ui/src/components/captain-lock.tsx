import { Lock } from "lucide-react"

import { cn } from "../lib/utils"

// Preview-but-locked: the page shows its heading, and this card stands where
// the data would be. The page sends no data for a rank below its bar, so this
// is the whole of what that viewer gets. Drawn as the console's dashed empty
// state with a lock. `title` names who may see it; `message` says what the
// viewer is missing.
export interface CaptainLockProps {
  /** @default "Captain access only" */
  title?: string
  /** @default "This data is visible to captains. Your rank doesn’t have clearance for this view." */
  message?: string
  className?: string
}

export function CaptainLock({
  title = "Captain access only",
  message = "This data is visible to captains. Your rank doesn’t have clearance for this view.",
  className,
}: CaptainLockProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-card/40 px-6 py-16 text-center",
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
    </div>
  )
}
