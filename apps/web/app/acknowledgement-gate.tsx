"use client";

import {
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { Megaphone, TriangleAlert } from "lucide-react";
import { Alert } from "@camp404/ui/components/alert";
import { Button } from "@camp404/ui/components/button";
import { Card, CardContent } from "@camp404/ui/components/card";
import { Spinner } from "@camp404/ui/components/spinner";
import { toast } from "@camp404/ui/components/toast";
import { plainPreview } from "@camp404/core";

// Loaded on demand, never with the app. This gate is mounted in the ROOT
// layout, so a static import would put react-markdown and the whole
// unified/remark/rehype stack behind it into the chunk every route downloads
// — including sign-in, which can never show a takeover. Nothing here renders
// before a poll has answered, so the import starts only once there is a
// takeover to draw, and the Suspense fallback below means the member reads the
// words either way.
const MarkdownBody = lazy(() =>
  import("@/components/announcements/markdown-body").then((m) => ({
    default: m.MarkdownBody,
  })),
);

// App-wide gate for the full-screen "acknowledge" notification variant. It
// polls for the signed-in member's unacknowledged acknowledge-deliveries and,
// while any exist, takes over the screen with a scrollable modal showing the
// oldest one. The Acknowledge button lives at the very bottom of the scroll
// (not a fixed footer) — the member scrolls the whole message, then presses
// it to dismiss; the gate advances to the next until the queue is empty.
//
// The same poll shows "pop-up" notifications: each one once, as a toast, when
// the tab is visible and no takeover is on screen (owner's call, 2026-09-16).
//
// Drawn as the AfrikaBurn organiser gate screen (icon circle, eyebrow, heading)
// over the message in a card.
//
// While the takeover is up, everything else on the page is inert: focus starts
// on the message title and cannot leave the takeover, and nothing behind it can
// be clicked or read by a screen reader.
//
// Mounted once in the root layout. Unauthenticated visitors get an empty
// queue from the API, so it renders nothing on public pages.

interface PendingItem {
  deliveryId: string;
  title: string;
  body: string;
  senderName: string | null;
  createdAt: string;
}

interface Popup {
  deliveryId: string;
  title: string;
  body: string;
  link: string;
}

const POLL_INTERVAL_MS = 45_000;
const POPUP_DURATION_MS = 10_000;

export const ACK_FAILED =
  "Your acknowledgement did not save. Check your connection, then press Acknowledge again.";

/**
 * Make everything outside `el` inert: its siblings, and its ancestors'
 * siblings, up to <body>. Returns the undo. Elements that were already inert
 * are left alone, so the undo cannot wake something another component put to
 * sleep.
 */
export function inertOutside(el: HTMLElement): () => void {
  const changed: Element[] = [];
  let node: HTMLElement = el;
  while (node.parentElement && node !== document.body) {
    for (const sibling of Array.from(node.parentElement.children)) {
      if (sibling === node || sibling.hasAttribute("inert")) continue;
      if (sibling.tagName === "SCRIPT" || sibling.tagName === "STYLE") continue;
      sibling.setAttribute("inert", "");
      changed.push(sibling);
    }
    node = node.parentElement;
  }
  return () => {
    for (const sibling of changed) sibling.removeAttribute("inert");
  };
}

export function AcknowledgementGate() {
  const router = useRouter();
  const [queue, setQueue] = useState<PendingItem[]>([]);
  const [acking, setAcking] = useState(false);
  const [ackError, setAckError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const claimingRef = useRef(false);
  // Monotonic token so overlapping polls (interval vs. focus) can't let a
  // slower, older response clobber a newer one — only the latest request wins.
  const requestIdRef = useRef(0);

  // Claim the waiting pop-ups and show each as a toast whose action opens
  // what it is about (the inbox, when it is about nothing else).
  const showPopups = useCallback(async () => {
    if (claimingRef.current) return; // a claim from an earlier poll is running
    claimingRef.current = true;
    try {
      const res = await fetch("/api/notifications/popups", { method: "POST" });
      if (!res.ok) return;
      const { popups } = (await res.json()) as { popups: Popup[] };
      for (const popup of popups ?? []) {
        // A toast is a one-line glimpse, not the message: markdown markers
        // would show as punctuation, so it reads as plain text.
        toast.info(popup.title, {
          description: plainPreview(popup.body, 200),
          duration: POPUP_DURATION_MS,
          action: { label: "Open", onClick: () => router.push(popup.link) },
        });
      }
      // The claim marked them read: refresh the bell count.
      if (popups?.length) router.refresh();
    } finally {
      claimingRef.current = false;
    }
  }, [router]);

  const load = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    try {
      const res = await fetch("/api/notifications/pending", {
        cache: "no-store",
      });
      if (!res.ok) return;
      const data = (await res.json()) as {
        pending: PendingItem[];
        popups?: number;
      };
      if (requestId !== requestIdRef.current) return; // superseded — drop it
      const pending = data.pending ?? [];
      setQueue(pending);
      // A pop-up that nobody sees is lost, since claiming marks it read. So
      // claim only on a visible tab with no takeover in front of the toast.
      if (
        pending.length === 0 &&
        (data.popups ?? 0) > 0 &&
        document.visibilityState === "visible"
      ) {
        await showPopups();
      }
    } catch {
      // Network hiccup — the next poll (or focus) retries.
    }
  }, [showPopups]);

  // Initial load, interval poll, and a refetch whenever the tab regains
  // focus so an announcement appears promptly after it's published.
  useEffect(() => {
    void load();
    const id = setInterval(() => void load(), POLL_INTERVAL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [load]);

  const current = queue[0];
  const open = current !== undefined;
  const currentId = current?.deliveryId;

  // While the takeover is up: lock background scroll and put the rest of the
  // page to sleep.
  useEffect(() => {
    if (!open || !dialogRef.current) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const wake = inertOutside(dialogRef.current);
    return () => {
      document.body.style.overflow = previous;
      wake();
    };
  }, [open]);

  // Each new message starts at the top, with focus on its title, and without
  // the last message's error.
  useEffect(() => {
    if (!currentId) return;
    setAckError(null);
    scrollRef.current?.scrollTo({ top: 0 });
    titleRef.current?.focus();
  }, [currentId]);

  if (!current) return null;

  const acknowledge = async () => {
    setAcking(true);
    setAckError(null);
    try {
      const res = await fetch("/api/notifications/acknowledge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deliveryId: current.deliveryId }),
      });
      if (!res.ok) {
        setAckError(ACK_FAILED);
        return;
      }
      // { ok: false } means there was nothing left to acknowledge (another
      // tab did it), so it leaves the queue either way.
      // Supersede any in-flight poll so it can't re-add what we just dismissed.
      requestIdRef.current++;
      // Drop the acknowledged item; reveal the next in the queue (if any).
      setQueue((q) => q.filter((i) => i.deliveryId !== current.deliveryId));
      // Refresh server components so an updated unread badge / inbox reflect it.
      router.refresh();
    } catch {
      setAckError(ACK_FAILED);
    } finally {
      setAcking(false);
    }
  };

  // Tab never leaves the takeover. The page behind is inert, so the only
  // stops are in here; this wraps from the last one back to the first, and
  // the other way with Shift, instead of escaping to the browser chrome.
  const trapTab = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Tab" || !dialogRef.current) return;
    const stops = Array.from(
      dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
      ),
    );
    const first = titleRef.current;
    const last = stops.at(-1) ?? first;
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="ack-title"
      onKeyDown={trapTab}
      className="fixed inset-0 z-[100] overflow-hidden bg-background"
    >
      <div
        ref={scrollRef}
        className="mx-auto flex h-full w-full max-w-2xl flex-col gap-6 overflow-y-auto px-6 py-12"
      >
        <div className="flex flex-col items-center gap-3 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-accent/15 text-accent">
            <Megaphone className="h-5 w-5" aria-hidden />
          </span>
          <p className="font-mono text-xs uppercase tracking-[0.3em] text-accent">
            Camp announcement
          </p>
          <h1
            id="ack-title"
            ref={titleRef}
            tabIndex={-1}
            className="text-2xl font-semibold tracking-tight focus:outline-none"
          >
            {current.title}
          </h1>
          <p className="text-xs text-muted-foreground">
            {current.senderName ? `From ${current.senderName} · ` : ""}
            {new Date(current.createdAt).toLocaleString()}
          </p>
        </div>

        <Card>
          {/* The takeover is the whole message, so the body renders the
              markdown the captain wrote. While the renderer's chunk is in
              flight the same words are on screen as plain text — a member
              being asked to acknowledge something must never be looking at an
              empty card. */}
          <CardContent className="p-6">
            <Suspense
              fallback={
                <p className="whitespace-pre-wrap text-sm leading-relaxed [overflow-wrap:anywhere]">
                  {plainPreview(current.body)}
                </p>
              }
            >
              <MarkdownBody className="text-sm">{current.body}</MarkdownBody>
            </Suspense>
          </CardContent>
        </Card>

        {/* Acknowledge sits at the end of the scroll — not pinned. The member
            scrolls through the message to reach it. */}
        <div className="flex flex-col gap-3">
          {ackError && (
            <Alert variant="error">
              <TriangleAlert aria-hidden />
              <span>{ackError}</span>
            </Alert>
          )}
          {queue.length > 1 && (
            <p className="text-center text-xs text-muted-foreground">
              {queue.length - 1} more after this.
            </p>
          )}
          <Button
            type="button"
            size="lg"
            className="w-full"
            onClick={acknowledge}
            disabled={acking}
          >
            {acking && (
              <Spinner
                size="sm"
                label="Acknowledging…"
                className="text-primary-foreground"
              />
            )}
            Acknowledge
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            You can&rsquo;t dismiss this until you acknowledge.
          </p>
        </div>
      </div>
    </div>
  );
}
