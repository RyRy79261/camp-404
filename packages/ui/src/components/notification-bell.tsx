import * as React from "react";
import { Bell } from "lucide-react";

import { cn } from "../lib/utils";

// NotificationBell — the bell glyph with its unread-count badge pinned
// top-right, from the AfrikaBurn console header. Dumb and stateless: it renders
// the `count` it is given and leaves opening the notification surface to the
// parent's `onClick`, so it can be a Popover trigger (the console header) or a
// plain button. No hooks → server-safe.
//
// Promoted out of `console-header.tsx`, where the same markup was drawn inline
// as a link to /notifications; forwarding the ref and spreading the rest of the
// button props is what lets Radix's `asChild` trigger take it over.

export interface NotificationBellProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Unread count; 0 (or negative) hides the badge. */
  count?: number;
  /** Cap the displayed number ("99+" past this). Default 99. */
  max?: number;
  /** The glyph, in place of lucide's bell (the 404 OS tray draws its own). */
  icon?: React.ReactNode;
  /** Classes for the count badge, replacing its own. */
  badgeClassName?: string;
}

const NotificationBell = React.forwardRef<
  HTMLButtonElement,
  NotificationBellProps
>(({ count = 0, max = 99, className, icon, badgeClassName, ...props }, ref) => {
  const unread = Math.max(0, Math.floor(count));
  const display = unread > max ? `${max}+` : String(unread);
  // The count belongs in the accessible name: the badge itself is decorative,
  // so a screen reader would otherwise hear "Notifications" and no number.
  const label =
    unread > 0
      ? `Notifications, ${unread} unread`
      : "Notifications, none unread";

  return (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      className={cn(
        "relative inline-flex h-10 w-10 items-center justify-center rounded-md text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        className,
      )}
      {...props}
    >
      {icon ?? <Bell className="h-5 w-5" aria-hidden />}
      {unread > 0 ? (
        <span
          aria-hidden
          className={
            badgeClassName ??
            "absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold leading-none text-destructive-foreground"
          }
        >
          {display}
        </span>
      ) : null}
    </button>
  );
});
NotificationBell.displayName = "NotificationBell";

export { NotificationBell };
