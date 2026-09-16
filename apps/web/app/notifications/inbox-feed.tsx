"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { groupByDay, NOTIFICATION_FALLBACK_LINK } from "@camp404/core";
import { Button } from "@camp404/ui/components/button";
import { Spinner } from "@camp404/ui/components/spinner";
import type { InboxItem } from "@/lib/notifications";
import { loadOlderNotificationsAction } from "./actions";
import { NotificationRow } from "./notification-row";

// The inbox list: notifications under camp-day headings, newest first. The
// server renders the first page; older pages load when the member scrolls near
// the end (owner's call, 2026-09-16: page the inbox, load more as you scroll).
// A "Load older" button does the same for anyone who cannot scroll it into view.

/** A row links only when it is about something other than this inbox. */
function linkFor(item: InboxItem) {
  return item.link === NOTIFICATION_FALLBACK_LINK ? undefined : item.link;
}

export function InboxFeed({
  initialItems,
  initialCursor,
  now,
}: {
  initialItems: InboxItem[];
  initialCursor: string | null;
  /** The server's clock, so "Today" matches between server and client. */
  now: Date;
}) {
  const [items, setItems] = useState(initialItems);
  const [cursor, setCursor] = useState(initialCursor);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const loadingRef = useRef(false);

  const loadOlder = useCallback(async () => {
    if (!cursor || loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    setError(null);
    try {
      const result = await loadOlderNotificationsAction(cursor);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setItems((current) => {
        const seen = new Set(current.map((i) => i.id));
        return [
          ...current,
          ...result.data.items.filter((i) => !seen.has(i.id)),
        ];
      });
      setCursor(result.data.nextCursor);
    } catch {
      setError("Couldn't load older notifications. Check your connection.");
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, [cursor]);

  // Load the next page as the end of the list comes within a screen of view.
  // After a failure it waits for the Retry button instead of looping.
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !cursor || error) return;
    if (typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) void loadOlder();
      },
      { rootMargin: "0px 0px 600px 0px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [cursor, error, loadOlder]);

  const groups = groupByDay(items, now);

  return (
    <div className="flex flex-col gap-5 px-4 pb-5 pt-2">
      {groups.map((group) => (
        <section
          key={group.key}
          aria-labelledby={`inbox-day-${group.key}`}
          className="flex flex-col gap-3"
        >
          <h2
            id={`inbox-day-${group.key}`}
            className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
          >
            {group.label}
          </h2>
          <ul className="flex flex-col gap-3">
            {group.items.map((item) => (
              <NotificationRow
                key={item.id}
                presentation={item.presentation}
                title={item.title}
                body={item.body}
                senderName={item.senderName}
                isNew={item.readAt === null}
                acknowledgedAt={item.acknowledgedAt}
                createdAt={item.createdAt}
                href={linkFor(item)}
              />
            ))}
          </ul>
        </section>
      ))}

      {cursor && (
        <div ref={sentinelRef} className="flex flex-col items-center gap-2">
          {error && (
            <p role="alert" className="text-center text-sm text-destructive">
              {error}
            </p>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => void loadOlder()}
            disabled={loading}
          >
            {loading && <Spinner size="sm" label="Loading…" />}
            {error ? "Try again" : "Load older"}
          </Button>
        </div>
      )}
    </div>
  );
}
