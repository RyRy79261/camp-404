import * as React from "react"

import { cn } from "../lib/utils"

// Empty/zero-data placeholder (board 08) — rosters with no members, queues with
// nothing outstanding, family trees with no accounts. A calm, borderless block:
// an optional icon in a 64px circle, a title, a description, and room for a
// call-to-action via children.
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
        "flex flex-col items-center gap-3 px-6 py-8 text-center",
        className,
      )}
      {...props}
    >
      {icon && (
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-muted text-muted-foreground [&_svg]:h-6 [&_svg]:w-6">
          {icon}
        </span>
      )}
      <p className="text-base font-bold text-foreground">{title}</p>
      {description && (
        <p className="max-w-sm text-[13px] text-muted-foreground">
          {description}
        </p>
      )}
      {children}
    </div>
  )
}

export { EmptyState }
