import * as React from "react"

import { cn } from "../lib/utils"

// A calm, centred empty or parked state (from the AfrikaBurn app): a dashed
// card for a surface with nothing to show yet. Warm and honest, never an
// error. A call-to-action goes in `action` (or children).
export interface EmptyStateProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Optional decorative leading icon. */
  icon?: React.ReactNode
  title: string
  /** Optional supporting sentence(s). */
  description?: React.ReactNode
  /** Optional call-to-action (button/link). */
  action?: React.ReactNode
}

function EmptyState({
  icon,
  title,
  description,
  action,
  className,
  children,
  ...props
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-card/40 px-6 py-16 text-center",
        className,
      )}
      {...props}
    >
      {icon && (
        <span
          className="text-muted-foreground [&_svg]:h-6 [&_svg]:w-6"
          aria-hidden
        >
          {icon}
        </span>
      )}
      <div className="flex flex-col gap-1.5">
        <p className="text-base font-medium text-foreground">{title}</p>
        {description && (
          <p className="mx-auto max-w-md text-sm text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      {action}
      {children}
    </div>
  )
}

export { EmptyState }
