import * as React from "react"

import { cn } from "../lib/utils"

// Header for a detail panel / modal — a leading slot (avatar or icon badge), a
// title + optional subtitle, and a right-aligned action slot. Presentational
// leaf; the heading level is configurable for a correct outline.
export interface DetailHeaderProps
  extends React.HTMLAttributes<HTMLDivElement> {
  leading?: React.ReactNode
  title: string
  subtitle?: React.ReactNode
  action?: React.ReactNode
  as?: "h1" | "h2" | "h3"
}

function DetailHeader({
  leading,
  title,
  subtitle,
  action,
  as: Heading = "h2",
  className,
  ...props
}: DetailHeaderProps) {
  return (
    <div className={cn("flex items-center gap-3", className)} {...props}>
      {leading && <div className="shrink-0">{leading}</div>}
      <div className="min-w-0 flex-1">
        <Heading className="truncate text-lg font-semibold">{title}</Heading>
        {subtitle && (
          <div className="mt-0.5 truncate text-sm text-muted-foreground">
            {subtitle}
          </div>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}

export { DetailHeader }
