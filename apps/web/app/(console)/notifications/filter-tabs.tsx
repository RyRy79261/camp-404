"use client";

import Link from "next/link";
import { SegmentedLinks } from "@camp404/ui/components/segmented-control";
import {
  INBOX_TAB_LABEL,
  INBOX_TAB_ORDER,
  notificationsHref,
  type InboxFilter,
} from "./filter";

// The All / Unread · n / Announcements tabs (AfrikaBurn's inbox toolbar).
//
// Every tab is a LINK and the state lives in `?filter=`, so the list stays a
// server render and a filtered inbox is linkable and back-button friendly —
// not a client tab handler that would have to re-fetch the list itself.
//
// A client module only so Next's `<Link>` (client-side navigation + prefetch)
// can be handed to the kit component: `SegmentedLinks` takes the anchor as a
// prop because `@camp404/ui` must not depend on next.

/**
 * A tab's visible text and, where they differ, the text it is announced as.
 *
 * The console nav already carries a link called "Announcements" (the captain
 * composer) for a team lead and above, and on this page both are on screen. So
 * the filter keeps AfrikaBurn's visible label and says "Announcements only" to
 * a screen reader. It is spelled out in full in a sr-only span, with the
 * visible copy `aria-hidden`, rather than appended as a sr-only " only":
 * accessible-name computation trims each node, so an appended word runs into
 * the one before it and is announced as "Announcementsonly".
 */
function label(tab: InboxFilter, unreadCount: number): React.ReactNode {
  const visible =
    tab === "unread" && unreadCount > 0
      ? `${INBOX_TAB_LABEL[tab]} · ${unreadCount}`
      : INBOX_TAB_LABEL[tab];
  if (tab !== "announcements") return visible;
  return (
    <>
      <span aria-hidden>{visible}</span>
      <span className="sr-only">{`${visible} only`}</span>
    </>
  );
}

export function NotificationFilterTabs({
  filter,
  unreadCount,
}: {
  filter: InboxFilter;
  /** Shown beside "Unread", so the tab says how much is waiting. */
  unreadCount: number;
}) {
  return (
    <SegmentedLinks
      aria-label="Filter notifications"
      className="sm:w-auto"
      value={filter}
      linkAs={Link}
      options={INBOX_TAB_ORDER.map((tab) => ({
        value: tab,
        href: notificationsHref(tab),
        label: label(tab, unreadCount),
      }))}
    />
  );
}
