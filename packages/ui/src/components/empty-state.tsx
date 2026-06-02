import * as React from "react"

import { cn } from "../lib/utils"

// Empty/zero-data placeholder — rosters with no members, queues with nothing
// outstanding, family trees with no accounts. An optional icon + title +
// description, with room for a call-to-action via children.
export interface EmptyStateProps extends React.HTMLAttributes<HTMLDivElement> {
  icon?: React.ReactNode
  title: string
  description?: string
}

function EmptyState({
  icon,
  title,
  description,
  className,
  children,
  ...props
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-2 rounded-lg border border-dashed bg-muted/10 px-6 py-12 text-center",
        className,
      )}
      {...props}
    >
      {icon && (
        <span className="flex h-10 w-10 items-center justify-center rounded-full border bg-muted/40 text-muted-foreground">
          {icon}
        </span>
      )}
      <p className="text-sm font-medium text-foreground">{title}</p>
      {description && (
        <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
      )}
      {children}
    </div>
  )
}

export { EmptyState }
