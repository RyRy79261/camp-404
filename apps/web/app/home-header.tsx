import Link from "next/link";
import { Bell } from "lucide-react";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@camp404/ui/components/avatar";

interface HomeHeaderProps {
  initials: string;
  /** Member's profile photo URL, when set. */
  imageUrl?: string | null;
  /** Optional unread-notification count. Falsy hides the badge. */
  notifications?: number;
}

/**
 * Right-hand header content for the home control panel: notifications bell
 * with an unread badge, and the signed-in member's avatar (photo or
 * initials) linking through to their profile. The bell links to the
 * notification inbox.
 */
export function HomeHeader({ initials, imageUrl, notifications }: HomeHeaderProps) {
  return (
    <>
      <Link
        href="/notifications"
        aria-label={
          notifications
            ? `Notifications (${notifications} unread)`
            : "Notifications"
        }
        className="relative rounded-full p-1.5 text-[color:var(--color-foreground)] transition-colors hover:bg-[color:var(--color-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-primary)]"
      >
        <Bell className="h-5 w-5" aria-hidden />
        {notifications ? (
          <span
            aria-hidden
            className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[color:var(--color-primary)] px-1 text-[10px] font-semibold text-[color:var(--color-primary-foreground)]"
          >
            {notifications > 99 ? "99+" : notifications}
          </span>
        ) : null}
      </Link>
      <Link
        href="/profile"
        aria-label="Your profile"
        className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-primary)]"
      >
        <Avatar className="h-8 w-8">
          {imageUrl ? <AvatarImage src={imageUrl} alt="" /> : null}
          <AvatarFallback className="text-xs">{initials}</AvatarFallback>
        </Avatar>
      </Link>
    </>
  );
}
