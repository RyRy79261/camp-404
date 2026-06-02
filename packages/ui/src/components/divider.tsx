import * as React from "react"

import { cn } from "../lib/utils"

// Thin rule for separating content. Horizontal by default; pass
// `orientation="vertical"` inside a flex row (the parent must give it height).
export interface DividerProps extends React.HTMLAttributes<HTMLDivElement> {
  orientation?: "horizontal" | "vertical"
}

function Divider({
  orientation = "horizontal",
  className,
  ...props
}: DividerProps) {
  return (
    <div
      role="separator"
      aria-orientation={orientation}
      className={cn(
        "shrink-0 bg-border",
        orientation === "horizontal" ? "h-px w-full" : "h-full w-px",
        className,
      )}
      {...props}
    />
  )
}

export { Divider }
