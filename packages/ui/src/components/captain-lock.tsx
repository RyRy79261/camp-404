import { Lock } from "lucide-react"

import { cn } from "../lib/utils"

// Preview-but-locked (board 09): the page shows its chrome, and this card
// stands where the data would be. The page sends no data for a rank below its
// bar, so this is the whole of what that viewer gets. `title` names who may see
// it; `message` says what the viewer is missing.
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
        "flex flex-col items-center gap-2.5 rounded-[var(--radius)] border bg-card p-6 text-center",
        className,
      )}
    >
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/20">
        <Lock aria-hidden className="h-5 w-5 text-primary" />
      </span>
      <p className="text-[15px] font-bold text-foreground">{title}</p>
      <p className="text-xs text-muted-foreground">{message}</p>
    </div>
  )
}
