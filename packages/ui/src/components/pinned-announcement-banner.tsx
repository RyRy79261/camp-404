import * as React from "react";
import { Pin } from "lucide-react";
import { cn } from "../lib/utils";

// PinnedAnnouncementBanner / PinnedAnnouncementScroller — AfrikaBurn's
// `PinnedBulletinBanner` (packages/ui, the slim translucent-accent strip above
// a recipient's dashboard), restyled on Camp 404's tokens: a pin, one wrapping
// line, and a link through to the whole announcement.
//
// Two deliberate differences from the AfrikaBurn component:
//
//   - No dismiss. AfrikaBurn's takes an optional `onDismiss` that its single
//     call site never passes, so the ✕ never renders there either. Ours does
//     not have the prop at all: pinned means pinned (owner's call, 2026-09-22)
//     — it comes down when a captain unpins it, and no sooner. An affordance
//     that only looks like it would help is worse than none.
//   - No event handlers and no state, so both render in a server component —
//     the console layout draws them, and drawing them costs no client bundle.
//
// The link is a plain <a>: these live in @camp404/ui, which holds no next/link
// dependency, and a pinned announcement is opened rarely enough that a full
// navigation is the right trade for keeping the kit framework-free.

export interface PinnedAnnouncementBannerProps extends Omit<
  React.HTMLAttributes<HTMLDivElement>,
  "title"
> {
  /** The announcement's title. Wraps freely. */
  title: React.ReactNode;
  /** Where "Read" goes — the announcement's own page. */
  href: string;
  /** Link copy. Default "Read". */
  readLabel?: string;
}

export function PinnedAnnouncementBanner({
  title,
  href,
  readLabel = "Read",
  className,
  ...props
}: PinnedAnnouncementBannerProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-lg border border-primary/30 bg-primary/10 px-4 py-2.5 text-sm",
        className,
      )}
      {...props}
    >
      <Pin className="h-4 w-4 shrink-0 text-primary" aria-hidden />
      <p className="min-w-0 flex-1 leading-snug text-foreground">{title}</p>
      <a
        href={href}
        className="shrink-0 whitespace-nowrap font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        {readLabel} &rarr;
      </a>
    </div>
  );
}

export interface PinnedAnnouncementScrollerProps extends React.HTMLAttributes<HTMLElement> {
  /** Every pin that applies to this reader, already in order. */
  children: React.ReactNode;
  /** How many pins `children` holds — what the count names. */
  count: number;
  /** The region's accessible name. */
  label?: string;
}

/**
 * Every pin the reader has, as a horizontal scroller.
 *
 * The owner ruled (2026-09-22) that no pin is dropped: a reader who has four
 * gets four, and moves through them. AfrikaBurn has no carousel to copy —
 * nothing in its `packages/ui` or app components scroll-snaps — so this is the
 * smallest honest one, built from the same banner AfrikaBurn already draws.
 *
 * What makes it honest:
 *
 *   - THE COUNT IS VISIBLE. A scroller whose overflow is off-screen can hide a
 *     pin from someone who never drags it, which is exactly the failure a pin
 *     exists to prevent. "3 pinned" says there are three whether or not you
 *     scroll.
 *   - KEYBOARD REACHABLE, two ways. Each pin's "Read" link is in the tab order
 *     and the browser scrolls a focused link into view, so tabbing walks the
 *     whole set. The track itself is also a focusable `region`, so arrow keys
 *     scroll it without tabbing through every link first.
 *   - ONE PIN, NO TRACK. With a single pin there is nothing to scroll, so it is
 *     drawn as the plain full-width banner: no snap, no count, no focusable
 *     track to tab through. The scroller only appears when it has a job.
 */
export function PinnedAnnouncementScroller({
  children,
  count,
  label = "Pinned announcements",
  className,
  ...props
}: PinnedAnnouncementScrollerProps) {
  const single = count <= 1;
  return (
    <section aria-label={label} className={cn("flex flex-col", className)}>
      {!single && (
        <p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <Pin className="h-3 w-3 text-primary" aria-hidden />
          {count} pinned &mdash; scroll for the rest
        </p>
      )}
      <div
        // A scrollable box is only operable by keyboard if something in it can
        // hold focus; the links can, and so can this, for arrow-key scrolling.
        tabIndex={single ? undefined : 0}
        role={single ? undefined : "region"}
        aria-label={single ? undefined : `${label}, ${count} in a row`}
        className={cn(
          single
            ? "flex flex-col"
            : // `snap-x` with a per-card `snap-start` lands each pin flush at
              // the left edge instead of stopping half way through one.
              "-mx-1 flex snap-x snap-mandatory gap-3 overflow-x-auto px-1 pb-2 [scrollbar-width:thin] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        )}
        {...props}
      >
        {children}
      </div>
    </section>
  );
}

/**
 * One pin's slot inside the scroller. Full width when it is the only one, a
 * card that snaps when it shares the track.
 */
export function PinnedAnnouncementSlot({
  single,
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { single: boolean }) {
  return (
    <div
      className={cn(
        single
          ? "w-full"
          : // Wide enough for a real title, narrow enough that the next pin
            // peeks in and says "there is more here".
            "w-[min(85%,28rem)] shrink-0 snap-start",
        className,
      )}
      {...props}
    />
  );
}
