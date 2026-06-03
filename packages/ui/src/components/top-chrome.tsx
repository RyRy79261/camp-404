import * as React from "react"
import { Bell } from "lucide-react"

import { Avatar, AvatarFallback, AvatarImage } from "./avatar"
import { cn } from "../lib/utils"

// The canonical app top bar (board 00): the "Camp 404" wordmark on the left,
// a notifications bell with an unread-count badge and the member avatar on the
// right. Plain `<a>` wrappers keep it framework-agnostic (no next/*); the app
// passes hrefs (defaults below). Presentational — the caller computes the
// initials and the unread count. Promoted from apps/web's HomeHeader.
export interface TopChromeProps {
  /** Initials shown in the avatar fallback (e.g. "JR"); pass "?" when unknown. */
  avatarInitials: string
  /** Profile photo URL, when the member has uploaded one. */
  avatarImageUrl?: string | null
  /** Unread notification count. Falsy hides the badge; capped at "99+". */
  unreadCount?: number
  /** Bell destination. @default "/notifications" */
  bellHref?: string
  /** Avatar destination. @default "/profile" */
  avatarHref?: string
  className?: string
}

function TopChrome({
  avatarInitials,
  avatarImageUrl,
  unreadCount,
  bellHref = "/notifications",
  avatarHref = "/profile",
  className,
}: TopChromeProps) {
  const hasUnread = Boolean(unreadCount && unreadCount > 0)
  const countLabel = unreadCount && unreadCount > 99 ? "99+" : String(unreadCount)

  return (
    <header
      className={cn(
        "flex w-full items-center justify-between bg-background px-4 py-4",
        className,
      )}
    >
      <span className="flex items-center gap-px text-xl font-bold" aria-hidden>
        <span className="text-foreground">Camp</span>
        <span className="font-mono text-primary">404</span>
      </span>
      <div className="flex items-center gap-2.5">
        <a
          href={bellHref}
          aria-label={
            hasUnread ? `Notifications (${countLabel} unread)` : "Notifications"
          }
          className="relative flex h-10 w-10 items-center justify-center rounded-full bg-muted text-foreground transition-colors hover:bg-muted/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Bell className="h-5 w-5" aria-hidden />
          {hasUnread ? (
            <span
              aria-hidden
              className="absolute right-0 top-0 flex h-4 w-4 min-w-4 -translate-y-1/4 translate-x-1/4 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-bold leading-none text-primary-foreground ring-1 ring-background"
            >
              {countLabel}
            </span>
          ) : null}
        </a>
        <a
          href={avatarHref}
          aria-label="Your profile"
          className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Avatar className="h-10 w-10">
            {avatarImageUrl ? <AvatarImage src={avatarImageUrl} alt="" /> : null}
            <AvatarFallback className="text-sm font-bold">
              {avatarInitials}
            </AvatarFallback>
          </Avatar>
        </a>
      </div>
    </header>
  )
}

export { TopChrome }
