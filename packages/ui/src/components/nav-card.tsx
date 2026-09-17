import * as React from "react"
import { ChevronRight } from "lucide-react"

import { cn } from "../lib/utils"
import { IconBadge } from "./icon-badge"

// A tappable navigation card — leading icon, title, description, trailing
// chevron. Framework-agnostic (no next/*): a plain anchor, or the app's link
// component through `linkAs`. Presentational leaf.
export interface NavCardProps
  extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
  icon?: React.ReactNode
  title: string
  description?: string
  /**
   * The link component to render, e.g. Next's `Link`, so navigation stays in
   * the app instead of reloading the page. A plain `<a>` when left out.
   */
  linkAs?: React.ElementType
}

const NavCard = React.forwardRef<HTMLAnchorElement, NavCardProps>(
  ({ icon, title, description, className, linkAs: Link = "a", ...props }, ref) => (
    <Link
      ref={ref}
      className={cn(
        "flex items-center gap-4 rounded-xl border bg-card/40 p-4 transition-colors hover:bg-accent/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
      {...props}
    >
      {icon && (
        <IconBadge aria-hidden size="md" shape="rounded" tone="muted">
          {icon}
        </IconBadge>
      )}
      <span className="min-w-0 flex-1">
        <span className="block text-base font-medium">{title}</span>
        {description && (
          <span className="mt-0.5 block text-sm text-muted-foreground">
            {description}
          </span>
        )}
      </span>
      <ChevronRight aria-hidden className="h-5 w-5 shrink-0 text-muted-foreground" />
    </Link>
  ),
)
NavCard.displayName = "NavCard"

export { NavCard }
