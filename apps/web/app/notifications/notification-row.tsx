import { cn } from "@camp404/ui/lib/utils";
import { formatRelativeTime, presentationIcon } from "./presentation-meta";
import type { InboxItem } from "@/lib/notifications";

interface NotificationRowProps {
  presentation: InboxItem["presentation"];
  title: string;
  body: string;
  senderName: InboxItem["senderName"];
  /** Unread at the point the inbox was snapshotted (before markRead). */
  isNew: boolean;
  acknowledgedAt: InboxItem["acknowledgedAt"];
  createdAt: InboxItem["createdAt"];
}

// One inbox row (board S12): a muted icon circle, the title + optional "New"
// pill, a relative timestamp, the body, and a sender/acknowledgement line.
// Unread rows wear a primary tint + border. Server component — no interactivity.
export function NotificationRow({
  presentation,
  title,
  body,
  senderName,
  isNew,
  acknowledgedAt,
  createdAt,
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

  return (
    <li
      className={cn(
        "flex gap-3 rounded-xl border p-3.5",
        isNew ? "border-primary bg-primary/10" : "border-border bg-card",
      )}
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted text-foreground">
        <Icon className="h-5 w-5" aria-hidden="true" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold leading-tight text-foreground">
              {title}
            </h2>
            {isNew ? (
              <span className="shrink-0 rounded-full bg-primary px-2 py-0.5 text-micro-xs font-bold text-primary-foreground">
                New
              </span>
            ) : null}
          </div>
          <time className="shrink-0 text-xs text-muted-foreground">
            {formatRelativeTime(createdAt)}
          </time>
        </div>
        <p className="whitespace-pre-wrap text-sm text-muted-foreground">
          {body}
        </p>
        {attribution ? (
          <p className="text-xs text-muted-foreground">{attribution}</p>
        ) : null}
      </div>
    </li>
  );
}
