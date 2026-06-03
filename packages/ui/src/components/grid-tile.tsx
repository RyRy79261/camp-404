import * as React from "react"
import type { LucideIcon } from "lucide-react"

import { IconBadge, type IconBadgeTone } from "./icon-badge"
import { cn } from "../lib/utils"

// A control-panel tool tile (board 03): a tinted rounded IconBox + optional
// count badge over a title and hint. Renders as a link (`href`), a button
// (`onPress`), or an inert div (`disabled` — the preview-but-locked / coming-soon
// treatment). Presentational and framework-agnostic (plain `<a>`, no next/*), so
// it composes inside both server trees (the home dashboard) and the client
// Customize editor — the icon is a component ref passed straight through.
export interface GridTileProps {
  /** Lucide icon rendered inside the 46×46 rounded IconBadge. */
  icon: LucideIcon
  /**
   * Tone for the IconBadge fill + icon colour, keyed to the group identity:
   * `primary` (Captain), `accent` (Team Lead), `secondary` (Team Member).
   * @default "primary"
   */
  iconTone?: IconBadgeTone
  /** Tile label — "My Teams", "Camp Management", etc. */
  title: string
  /** Sub-label beneath the title — "Your crews", "Roster & statuses". */
  hint?: string
  /** Count badge at the head row's right. Falsy (0/undefined/null/"") hides it. */
  badge?: number | string | null
  /** Navigation target. When set the tile renders as an `<a>`. */
  href?: string
  /** Inert state (coming-soon / locked): non-interactive, dimmed. */
  disabled?: boolean
  /** Drag-handle slot injected by Customize mode's DraggableTileRow. */
  dragHandle?: React.ReactNode
  /** Press handler for button-mode tiles (no `href`). */
  onPress?: () => void
  className?: string
}

function GridTile({
  icon: Icon,
  iconTone = "primary",
  title,
  hint,
  badge,
  href,
  disabled = false,
  dragHandle,
  onPress,
  className,
}: GridTileProps) {
  const hasBadge = Boolean(badge)
  const base =
    "flex flex-col gap-3.5 rounded-xl border border-border bg-card p-4 text-left"
  const interactive =
    "transition-colors hover:bg-accent/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.98]"

  const body = (
    <>
      {dragHandle}
      <div className="flex items-start justify-between">
        <IconBadge size="md" shape="rounded" tone={iconTone}>
          <Icon aria-hidden="true" />
        </IconBadge>
        {hasBadge ? (
          <span className="rounded-full bg-primary/15 px-[9px] py-[3px] text-xs font-semibold text-primary">
            {badge}
          </span>
        ) : null}
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-base font-semibold text-foreground">{title}</span>
        {hint ? (
          <span className="text-xs text-muted-foreground">{hint}</span>
        ) : null}
      </div>
    </>
  )

  if (disabled) {
    return (
      <div
        aria-disabled="true"
        className={cn(base, "cursor-default opacity-50", className)}
      >
        {body}
      </div>
    )
  }

  if (href) {
    return (
      <a href={href} className={cn(base, interactive, className)}>
        {body}
      </a>
    )
  }

  return (
    <button
      type="button"
      onClick={onPress}
      className={cn(base, interactive, className)}
    >
      {body}
    </button>
  )
}

export { GridTile }
