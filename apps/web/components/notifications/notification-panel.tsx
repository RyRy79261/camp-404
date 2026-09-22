"use client";

import { useEffect, useId, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { NotificationBell } from "@camp404/ui/components/notification-bell";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@camp404/ui/components/popover";
import {
  fetchNotificationPanelAction,
  type NotificationPanelData,
} from "@/app/(console)/notifications/actions";
import { MarkAllReadButton } from "./mark-all-read-button";
import {
  PanelNotificationRow,
  PanelQuestionnaireRow,
} from "./notification-panel-row";

// The console header's notification panel (AfrikaBurn's organiser console): the
// bell opens a Popover anchored under it with the last few items, "Mark all
// read", and a link through to the inbox. Popover draws no page overlay, so the
// console behind stays undimmed while Radix still gives focus management and
// Escape / outside-click dismissal.
//
// Rows load lazily on open through a read-only server action scoped to the
// signed-in member's own inbox. The badge count still comes from the server
// render (ConsoleHeader), so it is right before anyone interacts.
//
// Opening the panel marks NOTHING read — that is the inbox's job, and a badge
// that cleared itself on a peek would lose the member their unread list.

const PANEL = "flex w-[min(26rem,calc(100vw-1rem))] flex-col gap-0 p-0";

export function NotificationPanel({
  count,
  unreadCount,
}: {
  /** What the badge shows: unread deliveries plus waiting questionnaires. */
  count: number;
  /** Unread deliveries alone — the only half "Mark all read" can clear. */
  unreadCount: number;
}) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<NotificationPanelData | null>(null);
  // Bumped to force a refetch, e.g. after "Mark all read".
  const [nonce, setNonce] = useState(0);
  const headingId = useId();
  // The server's clock, frozen per open so every row in one panel agrees.
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setNow(new Date());
    void fetchNotificationPanelAction().then((rows) => {
      if (!cancelled) setData(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [open, nonce]);

  const rows = data
    ? data.pending.length + data.recent.length
    : /* not loaded yet */ -1;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <NotificationBell count={count} />
      </PopoverTrigger>
      <PopoverContent
        className={PANEL}
        align="end"
        sideOffset={8}
        aria-labelledby={headingId}
      >
        <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-2.5">
          <h2 id={headingId} className="text-sm font-semibold">
            Notifications
          </h2>
          <MarkAllReadButton
            disabled={unreadCount === 0}
            className="-mr-2"
            onDone={() => setNonce((n) => n + 1)}
          />
        </div>

        <div className="max-h-[60vh] overflow-y-auto">
          {rows === -1 ? (
            <p className="px-4 py-6 text-sm text-muted-foreground">Loading…</p>
          ) : rows === 0 ? (
            <p className="px-4 py-6 text-sm text-muted-foreground">
              Nothing here yet — announcements, captain requests and
              questionnaires land here as they are sent.
            </p>
          ) : (
            <ul className="flex flex-col">
              {/* The questionnaires lead: they are the half of the badge that
                  never clears itself, and the member has to act on them. */}
              {data?.pending.map((q) => (
                <PanelQuestionnaireRow
                  key={q.activationId}
                  item={q}
                  onNavigate={() => setOpen(false)}
                />
              ))}
              {data?.recent.map((item) => (
                <PanelNotificationRow
                  key={item.id}
                  item={item}
                  now={now}
                  onNavigate={() => setOpen(false)}
                />
              ))}
            </ul>
          )}
        </div>

        <div className="border-t border-border px-4 py-2.5">
          <Link
            href="/notifications"
            onClick={() => setOpen(false)}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-accent underline-offset-4 hover:underline"
          >
            See all
            <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}
