import { Lock } from "lucide-react"

import { cn } from "../lib/utils"

// Preview-but-locked panel (decision D3): a clearance-gated surface renders the
// page chrome for everyone, then this in place of the data for viewers without
// clearance — the server withholds the data, this explains why. Presentational
// leaf; the gating decision (`requireClearance`) lives in @camp404/core.
export interface CaptainLockProps {
  title?: string
  message?: string
  className?: string
}

export function CaptainLock({
  title = "VIEW ONLY",
  message = "No data for your rank.",
  className,
}: CaptainLockProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-2 rounded-lg border border-dashed bg-muted/20 px-6 py-12 text-center",
        className,
      )}
    >
      <span className="flex h-10 w-10 items-center justify-center rounded-full border bg-muted/40">
        <Lock className="h-5 w-5 text-muted-foreground" />
      </span>
      <p className="text-sm font-semibold uppercase tracking-wide text-foreground">
        {title}
      </p>
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  )
}
