import * as React from "react"

import { cn } from "../lib/utils"

// Prominent monospace display for a short code — invite codes, trace codes.
// Presentational leaf; the copy-to-clipboard affordance is a client concern an
// organism layers on top.
export interface CodeDisplayProps
  extends React.HTMLAttributes<HTMLElement> {
  code: string
}

function CodeDisplay({ code, className, ...props }: CodeDisplayProps) {
  return (
    <code
      className={cn(
        "inline-flex items-center rounded-md border bg-muted/40 px-3 py-2 font-mono text-base tracking-wide text-foreground",
        className,
      )}
      {...props}
    >
      {code}
    </code>
  )
}

export { CodeDisplay }
