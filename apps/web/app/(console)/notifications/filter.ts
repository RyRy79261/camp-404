import { INBOX_FILTERS, type InboxFilter } from "@camp404/types";

// The inbox tabs, as data. A plain module, NOT part of `actions.ts`: a
// `"use server"` file may export only async functions, and these are the
// synchronous helpers the page, the tabs and the load-more action all share.
//
// The tab lives in `?filter=` (AfrikaBurn's inbox does the same), so the list
// stays a server render and a filtered inbox is linkable and back-button
// friendly.

export type { InboxFilter };

export const INBOX_TAB_ORDER: readonly InboxFilter[] = INBOX_FILTERS;

export const INBOX_TAB_LABEL: Record<InboxFilter, string> = {
  all: "All",
  unread: "Unread",
  announcements: "Announcements",
};

/** `/notifications` for the default tab, `?filter=x` for the others. */
export function notificationsHref(filter: InboxFilter): string {
  return filter === "all"
    ? "/notifications"
    : `/notifications?filter=${filter}`;
}

/**
 * An unknown `?filter=` opens the whole inbox rather than throwing: a shared
 * link with a stale param should still show the member their notifications.
 */
export function parseInboxFilter(raw: string | undefined): InboxFilter {
  return (INBOX_FILTERS as readonly string[]).includes(raw ?? "")
    ? (raw as InboxFilter)
    : "all";
}

/**
 * Whether opening this tab clears the badge for the page it drew.
 *
 * The Unread tab must not empty itself while the member reads it: it is a
 * working list, and a page that marks read the rows it just drew shows an empty
 * screen on the next load. So the tabs that list read rows anyway mark the page
 * read (Camp 404's long-standing inbox behaviour, kept), and the Unread tab
 * does not — the member clears it with "Mark all read" or by opening All.
 * AfrikaBurn's inbox marks nothing read on load at all; this is the smaller
 * change that keeps Camp 404's badge behaviour on the tabs that had it.
 */
export function marksPageRead(filter: InboxFilter): boolean {
  return filter !== "unread";
}

/**
 * The ids a rendered inbox page may mark read: everything on it except a
 * pop-up the member has not been shown. `read_at` on a `presentation="popup"`
 * row is the "already shown" mark that `claimPopups` stamps, so clearing it
 * here would spend a one-time pop-up — a captain-rank request, an approval —
 * that no screen ever drew. "Mark all read" leaves them for the same reason.
 */
export function feedIds(
  items: readonly { id: string; presentation: string }[],
): string[] {
  return items.filter((i) => i.presentation !== "popup").map((i) => i.id);
}
