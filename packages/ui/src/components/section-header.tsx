import * as React from "react"

import { cn } from "../lib/utils"

// A titled section heading with an optional description and a right-aligned
// action slot (a button, a count, a control). Presentational leaf; the heading
// level is configurable for correct document outline.
export interface SectionHeaderProps
  extends React.HTMLAttributes<HTMLDivElement> {
  title: string
  description?: string
  /** Right-aligned content — an action button, badge, or control. */
  action?: React.ReactNode
  as?: "h1" | "h2" | "h3"
}

function SectionHeader({
  title,
  description,
  action,
  as: Heading = "h2",
  className,
  ...props
}: SectionHeaderProps) {
  return (
    <div
      className={cn("flex items-start justify-between gap-4", className)}
      {...props}
    >
      <div className="min-w-0">
        <Heading className="text-lg font-semibold">{title}</Heading>
        {description && (
          <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}

export { SectionHeader }
