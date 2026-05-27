import { Bell } from "lucide-react";

interface HomeHeaderProps {
  initials: string;
  /** Optional unread-notification count. Falsy hides the badge. */
  notifications?: number;
}

/**
 * Right-hand header content for the home control panel: notifications bell
 * with an unread badge, and the signed-in member's initials as an avatar.
 * Read-only for now — wiring the bell to the notifications inbox and the
 * avatar to /profile are follow-ups.
 */
export function HomeHeader({ initials, notifications }: HomeHeaderProps) {
  return (
    <>
      <button
        type="button"
        aria-label={
          notifications
            ? `Notifications (${notifications} unread)`
            : "Notifications"
        }
        className="relative rounded-full p-1.5 text-[color:var(--color-foreground)] transition-colors hover:bg-[color:var(--color-muted)]"
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
      </button>
      <span
        aria-label={`Signed in as ${initials}`}
        className="flex h-8 w-8 items-center justify-center rounded-full bg-[color:var(--color-secondary)] text-xs font-semibold text-[color:var(--color-secondary-foreground)]"
      >
        {initials}
      </span>
    </>
  );
}
