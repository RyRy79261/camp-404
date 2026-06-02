import * as React from "react"

import { cn } from "../lib/utils"

// A single headline metric — label + value, with an optional hint line and
// leading icon. Used in counts strips (roster Members/Approved/Incomplete) and
// dashboards. Presentational leaf.
export interface StatTileProps extends React.HTMLAttributes<HTMLDivElement> {
  label: string
  value: React.ReactNode
  hint?: string
  icon?: React.ReactNode
}

function StatTile({
  label,
  value,
  hint,
  icon,
  className,
  ...props
}: StatTileProps) {
  return (
    <div
      className={cn("rounded-lg border bg-card/40 px-4 py-3", className)}
      {...props}
    >
      <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
        {icon}
        <span>{label}</span>
      </div>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

export { StatTile }
