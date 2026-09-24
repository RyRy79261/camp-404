"use client";

import { useEffect, useId, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { NotificationBell } from "@camp404/ui/components/notification-bell";
import { Button } from "@camp404/ui/components/button";
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
// signed-in member's own inbox, and are dropped again on close: a reopen must
// never paint the last open's read state as if it were current.
//
// The panel lists only the newest few rows, so the list alone cannot account
// for the badge. The count that "Mark all read" would clear comes back with
// the rows and is written out under the heading — said as a clearable count,
// because it is narrower than the badge: the badge also counts waiting
// questionnaires and unshown pop-ups, and the button clears neither. The badge
// itself is still the server render's, so it is right before anyone interacts.
//
// Opening the panel marks NOTHING read — that is the inbox's job, and a badge
// that cleared itself on a peek would lose the member their unread list.

const PANEL = "flex w-[min(26rem,calc(100vw-1rem))] flex-col gap-0 p-0";
const NOTE = "px-4 py-6 text-sm text-muted-foreground";

type PanelState =
  | { status: "loading" }
  | { status: "ready"; data: NotificationPanelData }
  | { status: "error"; error: string };

/**
 * The bell in the console header and the panel it opens. Fetches on open, drops
 * what it fetched on close, and marks nothing read — the badge is cleared by
 * the inbox or by "Mark all read", never by a peek.
 */
export function NotificationPanel({
  count,
}: {
  /**
   * What the badge shows: `getInboxBadge(...).total` (lib/inbox-badge.ts),
   * unread deliveries plus waiting questionnaires — the same number as the
   * Notifications tile on Home.
   */
  count: number;
}) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<PanelState>({ status: "loading" });
  // Bumped to force a refetch, e.g. after "Mark all read" or a retry.
  const [nonce, setNonce] = useState(0);
  const headingId = useId();
  // The server's clock, frozen per open so every row in one panel agrees.
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    if (!open) {
      // Drop the last open's rows, so reopening shows "Loading…" rather than a
      // stale list whose unread dots the inbox may since have cleared.
      setState({ status: "loading" });
      return;
    }
    let cancelled = false;
    setState({ status: "loading" });
    setNow(new Date());
    void fetchNotificationPanelAction()
      .then((result) => {
        if (cancelled) return;
        setState(
          result.ok
            ? { status: "ready", data: result.data }
            : { status: "error", error: result.error },
        );
      })
      // The action converts its own failures, but the CALL can still reject —
      // an offline tab, a dropped request. A fulfilment-only handler would
      // leave the panel saying "Loading…" for as long as it stayed open, with
      // no way back; this lands it on the error state and its "Try again".
      .catch(() => {
        if (cancelled) return;
        setState({
          status: "error",
          error: "Check your connection and try again.",
        });
      });
    return () => {
      cancelled = true;
    };
  }, [open, nonce]);

  const data = state.status === "ready" ? state.data : null;
  const rows = data ? data.pending.length + data.recent.length : 0;

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
          <div className="flex flex-col">
            <h2 id={headingId} className="text-sm font-semibold">
              Notifications
            </h2>
            {/* What "Mark all read" would clear, not the number of rows below
                it: the panel is a window on the inbox, so a badge of 10 over
                six rows that are all read still has to add up. It is NOT the
                badge either — the badge counts waiting questionnaires and
                unshown pop-ups, which this button cannot clear — so the line
                says what the button does rather than claiming a total. */}
            {data && (
              <p className="text-xs text-muted-foreground">
                {data.clearable === 0
                  ? "Nothing to mark read"
                  : `${data.clearable} can be marked read`}
              </p>
            )}
          </div>
          <MarkAllReadButton
            // The fresh count from this open, never the header's server render:
            // a row that arrived since must not find the control dead.
            disabled={!data || data.clearable === 0}
            className="-mr-2"
            onDone={() => setNonce((n) => n + 1)}
          />
        </div>

        <div className="max-h-[60vh] overflow-y-auto">
          {state.status === "loading" ? (
            <p className={NOTE}>Loading…</p>
          ) : state.status === "error" ? (
            <div className={NOTE}>
              {/* A failed read is reported as a failure. Telling the member
                  their inbox is empty when it could not be read is worse than
                  telling them nothing. */}
              <p>Couldn&rsquo;t load your notifications. {state.error}</p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={() => setNonce((n) => n + 1)}
              >
                Try again
              </Button>
            </div>
          ) : rows === 0 ? (
            <p className={NOTE}>
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
