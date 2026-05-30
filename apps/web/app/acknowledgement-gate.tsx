"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Megaphone } from "lucide-react";
import { Button } from "@camp404/ui/components/button";

// App-wide gate for the full-screen "acknowledge" notification variant. It
// polls for the signed-in member's unacknowledged acknowledge-deliveries and,
// while any exist, takes over the screen with a scrollable modal showing the
// oldest one. The Acknowledge button lives at the very bottom of the scroll
// (not a fixed footer) — the member scrolls the whole message, then presses
// it to dismiss; the gate advances to the next until the queue is empty.
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

const POLL_INTERVAL_MS = 45_000;

export function AcknowledgementGate() {
  const router = useRouter();
  const [queue, setQueue] = useState<PendingItem[]>([]);
  const [acking, setAcking] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  // Monotonic token so overlapping polls (interval vs. focus) can't let a
  // slower, older response clobber a newer one — only the latest request wins.
  const requestIdRef = useRef(0);

  const load = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    try {
      const res = await fetch("/api/notifications/pending", {
        cache: "no-store",
      });
      if (!res.ok) return;
      const data = (await res.json()) as { pending: PendingItem[] };
      if (requestId !== requestIdRef.current) return; // superseded — drop it
      setQueue(data.pending ?? []);
    } catch {
      // Network hiccup — the next poll (or focus) retries.
    }
  }, []);

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

  // Lock background scroll and reset the scroll position whenever a new
  // notification surfaces.
  useEffect(() => {
    if (!current) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    scrollRef.current?.scrollTo({ top: 0 });
    return () => {
      document.body.style.overflow = previous;
    };
  }, [current]);

  if (!current) return null;

  const acknowledge = async () => {
    setAcking(true);
    try {
      const res = await fetch("/api/notifications/acknowledge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deliveryId: current.deliveryId }),
      });
      if (!res.ok) return;
      // Supersede any in-flight poll so it can't re-add what we just dismissed.
      requestIdRef.current++;
      // Drop the acknowledged item; reveal the next in the queue (if any).
      setQueue((q) => q.filter((i) => i.deliveryId !== current.deliveryId));
      // Refresh server components so an updated unread badge / inbox reflect it.
      router.refresh();
    } finally {
      setAcking(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="ack-title"
      className="fixed inset-0 z-[100] bg-[color:var(--color-background)]"
    >
      <div
        ref={scrollRef}
        className="mx-auto flex h-full max-w-2xl flex-col overflow-y-auto px-6 py-10"
      >
        <div className="mb-6 flex items-center gap-2 text-[color:var(--color-primary)]">
          <Megaphone className="h-5 w-5" aria-hidden />
          <span className="text-xs font-semibold uppercase tracking-[0.15em]">
            Camp announcement
          </span>
        </div>

        <h1 id="ack-title" className="text-2xl font-semibold">
          {current.title}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {current.senderName ? `From ${current.senderName} · ` : ""}
          {new Date(current.createdAt).toLocaleString()}
        </p>

        <div className="mt-6 flex-1 whitespace-pre-wrap text-base leading-relaxed">
          {current.body}
        </div>

        {/* Acknowledge sits at the end of the scroll — not pinned. The member
            scrolls through the message to reach it. */}
        <div className="mt-10 border-t pt-6">
          {queue.length > 1 && (
            <p className="mb-3 text-xs text-muted-foreground">
              {queue.length - 1} more after this.
            </p>
          )}
          <Button
            type="button"
            size="lg"
            className="w-full gap-2"
            onClick={acknowledge}
            disabled={acking}
          >
            {acking && <Loader2 className="h-4 w-4 animate-spin" />}
            Acknowledge
          </Button>
        </div>
      </div>
    </div>
  );
}
