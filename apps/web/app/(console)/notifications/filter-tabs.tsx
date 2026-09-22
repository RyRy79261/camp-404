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
        label:
          tab === "unread" && unreadCount > 0
            ? `${INBOX_TAB_LABEL[tab]} · ${unreadCount}`
            : INBOX_TAB_LABEL[tab],
      }))}
    />
  );
}
