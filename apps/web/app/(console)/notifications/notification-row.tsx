import { plainPreview } from "@camp404/core";
import { Badge } from "@camp404/ui/components/badge";
import { cn } from "@camp404/ui/lib/utils";
import { formatRelativeTime, presentationIcon } from "./presentation-meta";
import type { InboxItem } from "@/lib/notifications";

interface NotificationRowProps {
  presentation: InboxItem["presentation"];
  title: string;
  body: string;
  senderName: InboxItem["senderName"];
  /** "to the drivers" / "to you only" (#313); null says nothing. */
  sentTo?: InboxItem["sentTo"];
  /** Unread at the point the inbox was snapshotted (before markRead). */
  isNew: boolean;
  acknowledgedAt: InboxItem["acknowledgedAt"];
  createdAt: InboxItem["createdAt"];
  /**
   * Where a tap opens (notificationLink). Omitted when the notification is
   * about nothing but itself: a link back to this inbox would do nothing.
   */
  href?: string;
}

// One inbox row, drawn like the AfrikaBurn NotificationItem: a muted icon
// circle, the title with a "New" badge while unread, the body, and a meta line
// of the relative time and the sender/acknowledgement. Rows sit in a day card,
// divided by a rule. Server component — no interactivity.
export function NotificationRow({
  presentation,
  title,
  body,
  senderName,
  sentTo = null,
  isNew,
  acknowledgedAt,
  createdAt,
  href,
}: NotificationRowProps) {
  const Icon = presentationIcon(presentation);

  // Acknowledgement state wins over the bare attribution; suppressed entirely
  // when there's no sender (system / deleted-sender deliveries).
  const attribution = senderName
    ? acknowledgedAt
      ? `From ${senderName} · acknowledged`
      : presentation === "acknowledge"
        ? `From ${senderName} · awaiting acknowledgement`
        : `From ${senderName}`
    : null;
  // Who else it went to, when that says something (#313, mock-up aud-inbox):
  // a message to the drivers, or to a few chosen people, reads differently
  // from one to the whole camp.
  const to = sentToWords(sentTo);

  const frame = "flex items-start gap-3 rounded-lg px-3 py-3 text-left";
  const content = (
    <>
      <span
        className={cn(
          "mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
          isNew
            ? "bg-primary/15 text-primary"
            : "bg-muted text-muted-foreground",
        )}
      >
        <Icon className="h-4 w-4" aria-hidden="true" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <h3
              className={cn(
                "text-sm leading-snug text-foreground",
                isNew ? "font-semibold" : "font-medium",
              )}
            >
              {title}
            </h3>
            {isNew ? <Badge className="shrink-0">New</Badge> : null}
          </div>
          <time className="shrink-0 text-xs tabular-nums text-muted-foreground">
            {formatRelativeTime(createdAt)}
          </time>
        </div>
        {/* A row is a glimpse, never the message: an announcement body is
            markdown, and the rendering of it belongs on the surfaces that
            show the whole thing (the announcement page, the acknowledgement
            takeover). Here the markers are stripped, so a row cannot read as
            asterisks and hashes. Clipped only when the row opens the whole
            message. */}
        <p
          className={cn(
            "whitespace-pre-wrap text-sm text-muted-foreground",
            href && "line-clamp-3",
          )}
        >
          {plainPreview(body)}
        </p>
        {attribution || to ? (
          <p className="text-xs text-muted-foreground">
            {attribution}
            {to ? (
              <>
                {attribution ? " · " : ""}to{" "}
                <strong className="font-semibold text-foreground">{to}</strong>
              </>
            ) : null}
          </p>
        ) : null}
      </div>
    </>
  );

  return (
    <li className="border-b border-border last:border-b-0">
      {href ? (
        <a
          href={href}
          className={cn(
            frame,
            "transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          )}
        >
          {content}
        </a>
      ) : (
        <div className={frame}>{content}</div>
      )}
    </li>
  );
}

/** "the drivers", "you only", "you and 2 others". */
export function sentToWords(sentTo: InboxItem["sentTo"] | null): string | null {
  if (!sentTo) return null;
  if (sentTo.scope === "drivers") return "the drivers";
  if (sentTo.others === 0) return "you only";
  return `you and ${sentTo.others} ${sentTo.others === 1 ? "other" : "others"}`;
}
