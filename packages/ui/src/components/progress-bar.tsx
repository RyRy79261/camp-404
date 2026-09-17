import * as React from "react"

import { cn } from "../lib/utils"

// Determinate progress bar (onboarding completion, upload progress). `value` and
// `max` are clamped; exposes the ARIA progressbar role. Presentational leaf.
export interface ProgressBarProps extends React.HTMLAttributes<HTMLDivElement> {
  value: number
  max?: number
  /** Accessible name for the bar (e.g. "Onboarding progress"). */
  label?: string
}

function ProgressBar({
  value,
  max = 100,
  label,
  className,
  ...props
}: ProgressBarProps) {
  const safeMax = max > 0 ? max : 1
  const pct = Math.min(100, Math.max(0, (value / safeMax) * 100))
  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
      className={cn(
        "h-2 w-full overflow-hidden rounded-full bg-muted",
        className,
      )}
      {...props}
    >
      {/* scaleX, not width: a transform animates on the compositor, so the
          fill glides without re-laying out the bar on every frame. */}
      <div
        className="h-full w-full origin-left rounded-full bg-primary motion-safe:transition-transform motion-safe:duration-300"
        style={{ transform: `scaleX(${pct / 100})` }}
      />
    </div>
  )
}

export { ProgressBar }
