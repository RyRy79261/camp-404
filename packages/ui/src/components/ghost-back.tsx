import * as React from "react"
import { ChevronLeft } from "lucide-react"

import { cn } from "../lib/utils"
import { buttonVariants } from "./button"

// The "← Back" ghost link at the top of detail / sub pages. Renders a plain
// anchor (framework-agnostic — pass a Next Link's href) styled as a ghost
// button; defaults its label to "Back".
export type GhostBackProps = React.AnchorHTMLAttributes<HTMLAnchorElement>

const GhostBack = React.forwardRef<HTMLAnchorElement, GhostBackProps>(
  ({ className, children = "Back", ...props }, ref) => (
    <a
      ref={ref}
      className={cn(
        buttonVariants({ variant: "ghost", size: "sm" }),
        "gap-1.5",
        className,
      )}
      {...props}
    >
      <ChevronLeft className="h-4 w-4" aria-hidden />
      {children}
    </a>
  ),
)
GhostBack.displayName = "GhostBack"

export { GhostBack }
