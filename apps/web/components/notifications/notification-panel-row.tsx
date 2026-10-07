"use client";

import Link from "next/link";
import { ClipboardList } from "lucide-react";
import {
  CAMP_TIME_ZONE,
  NOTIFICATION_FALLBACK_LINK,
  plainPreview,
} from "@camp404/core";
import { cn } from "@camp404/ui/lib/utils";
import type { InboxItem } from "@/lib/notifications";
import { formatRelativeTime } from "@/app/(console)/notifications/presentation-meta";
import { PresentationIcon } from "@/app/(console)/notifications/presentation-icon";
import type { PanelQuestionnaire } from "@/app/(console)/notifications/actions";

// The two row shapes the header panel lists, drawn like AfrikaBurn's
// NotificationItem: a glyph circle, the title, the body, then the day/time, and
// an unread dot on the right.
//
// A row is a LINK, not a button: tapping it navigates, and nothing here marks
// anything read — peeking at the panel must not clear the badge. The inbox
// still marks its own page read when the member opens it.

const ROW =
  "flex items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring";

// On the camp's clock, like every date a person reads (CAMP_TIME_ZONE), so
// the server's render and the browser's agree.
const TIME = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: CAMP_TIME_ZONE,
});
const DUE = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  timeZone: CAMP_TIME_ZONE,
});

/** Day + time, so "yesterday 18:40" is distinguishable from "18:40". */
function dayAndTime(at: Date, now: Date): string {
  return `${formatRelativeTime(at, now)} · ${TIME.format(at)}`;
}

/**
 * The one row shape both kinds share, so a delivery and a questionnaire line up
 * down the panel. It draws; deciding what goes in it is the caller's job.
 */
function Shell({
  href,
  icon,
  iconTone,
  title,
  body,
  meta,
  unread,
  onNavigate,
}: {
  href: string;
  icon: React.ReactNode;
  iconTone: string;
  title: string;
  body: string | null;
  meta: string;
  unread: boolean;
  onNavigate?: () => void;
}) {
  return (
    <li className="border-b border-border last:border-b-0">
      <Link href={href} className={ROW} onClick={onNavigate}>
        <span
          className={cn(
            "mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
            iconTone,
          )}
        >
          {icon}
        </span>
        <div className="min-w-0 flex-1 space-y-0.5">
          <p
            className={cn(
              "text-sm leading-snug",
              unread
                ? "font-semibold text-foreground"
                : "font-normal text-muted-foreground",
            )}
          >
            {title}
          </p>
          {body ? (
            <p className="line-clamp-2 whitespace-pre-line text-sm text-muted-foreground">
              {body}
            </p>
          ) : null}
          <p className="text-xs text-muted-foreground">{meta}</p>
        </div>
        {unread ? (
          <span
            aria-label="Unread"
            className="mt-2 h-2 w-2 shrink-0 rounded-full bg-primary"
          />
        ) : null}
      </Link>
    </li>
  );
}

/**
 * One delivered notification, as the panel lists it. The body is a glimpse, not
 * the message: an announcement is written in markdown, so the markers are
 * stripped here the way the inbox row strips them, and the whole thing is
 * rendered only on the announcement page.
 */
export function PanelNotificationRow({
  item,
  now,
  onNavigate,
}: {
  item: InboxItem;
  now: Date;
  /** Fired when the row is opened, so the panel can close behind it. */
  onNavigate?: () => void;
}) {
  const unread = item.readAt === null;
  return (
    <Shell
      href={item.link || NOTIFICATION_FALLBACK_LINK}
      icon={
        <PresentationIcon
          presentation={item.presentation}
          className="h-4 w-4"
          aria-hidden
        />
      }
      iconTone={
        unread ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"
      }
      title={item.title}
      body={item.body ? plainPreview(item.body) : null}
      meta={
        item.senderName
          ? `${dayAndTime(item.createdAt, now)} · ${item.senderName}`
          : dayAndTime(item.createdAt, now)
      }
      unread={unread}
      onNavigate={onNavigate}
    />
  );
}

/**
 * One questionnaire still waiting on the member. The bell counts these as well
 * as unread deliveries, so the panel has to list them or the badge reads 2 over
 * an empty panel. They stay until the member answers — reading never clears one
 * — so they are always drawn as unread.
 */
export function PanelQuestionnaireRow({
  item,
  onNavigate,
}: {
  item: PanelQuestionnaire;
  onNavigate?: () => void;
}) {
  const due = item.dueAt ? `Due ${DUE.format(item.dueAt)}` : null;
  return (
    <Shell
      href={`/questionnaires/${item.activationId}`}
      icon={<ClipboardList className="h-4 w-4" aria-hidden />}
      iconTone={
        item.blocking
          ? "bg-destructive/15 text-destructive"
          : "bg-accent/15 text-accent"
      }
      title={item.title}
      body={null}
      meta={
        [item.blocking ? "Required · blocks the app" : "Needs your answer", due]
          .filter(Boolean)
          .join(" · ") as string
      }
      unread
      onNavigate={onNavigate}
    />
  );
}
