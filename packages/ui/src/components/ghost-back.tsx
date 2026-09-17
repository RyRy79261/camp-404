import * as React from "react"
import { ChevronLeft } from "lucide-react"

import { cn } from "../lib/utils"
import { buttonVariants } from "./button"

// The "← Back" ghost link at the top of detail / sub pages, styled as a ghost
// button; defaults its label to "Back". Framework-agnostic: a plain anchor,
// or the app's link component through `linkAs`.
export interface GhostBackProps
  extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
  /**
   * The link component to render, e.g. Next's `Link`, so navigation stays in
   * the app instead of reloading the page. A plain `<a>` when left out.
   */
  linkAs?: React.ElementType
}

const GhostBack = React.forwardRef<HTMLAnchorElement, GhostBackProps>(
  ({ className, children = "Back", linkAs: Link = "a", ...props }, ref) => (
    <Link
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
    </Link>
  ),
)
GhostBack.displayName = "GhostBack"

export { GhostBack }
