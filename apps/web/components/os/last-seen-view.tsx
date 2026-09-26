"use client";

import { useLayoutEffect, useRef } from "react";
import { CAMP_TIME_ZONE } from "@camp404/core";
import { lastSeenLabel, mountLastSeen, type LastSeenCopy } from "@camp404/os";

/**
 * Hosts that already hold a copy. A closed shadow root cannot be seen from
 * outside, so this is how a second run of the effect on the same element
 * (React's development double run) knows to leave it alone.
 */
const mounted = new WeakSet<HTMLElement>();

/**
 * A background window's body: the frozen copy of how it last looked (owner's
 * decision 3 A), in a closed shadow root, inert and hidden from assistive
 * tech, with a quiet line under it. The parent keys this by the copy, because
 * a closed shadow root can be attached to an element only once.
 */
export function LastSeenView({ copy }: { copy: LastSeenCopy }) {
  const host = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = host.current;
    if (!el || mounted.has(el)) return;
    mounted.add(el);
    mountLastSeen(el, copy);
  }, [copy]);
  return (
    <div className="flex h-full flex-col">
      <div ref={host} className="min-h-0 flex-1 overflow-hidden" />
      <p className="shrink-0 border-t border-os-line bg-os-panel px-3 py-1 font-mono text-[11px] text-os-muted select-none">
        {/* Camp time, as the taskbar's clock shows it. */}
        {lastSeenLabel(copy.takenAt, CAMP_TIME_ZONE)} Click to refresh.
      </p>
    </div>
  );
}

/**
 * A background window with no copy yet (after a hard load, or when its copy
 * was dropped to stay in budget): its picture and plain name, centred.
 */
export function WindowPlaceholder({
  icon,
  label,
  loading = false,
}: {
  icon: React.ReactNode;
  label: string;
  /**
   * The page is on its way: a skeleton of a page (heading, a line, rows) in
   * the window's own colours, instead of "Click to open".
   */
  loading?: boolean;
}) {
  if (loading) return <WindowSkeleton label={label} />;
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-os-muted select-none">
      {icon}
      <p className="font-pixel text-xs uppercase tracking-[0.2em]">{label}</p>
      <p className="font-mono text-[11px]">Click to open.</p>
    </div>
  );
}

/** One square block of the skeleton. */
function Block({ className }: { className: string }) {
  return <div aria-hidden className={`bg-os-fg/10 ${className}`} />;
}

/**
 * A window whose page is on its way (opened at the click): the shape of a
 * console page, square blocks in the window's soft palette, pulsing on the
 * compositor (opacity only), still under reduced motion. It holds no data:
 * the server still gates the page, and this is drawn before it answers.
 */
export function WindowSkeleton({ label }: { label: string }) {
  return (
    <div
      data-window-loading
      className="flex h-full flex-col gap-5 overflow-hidden px-6 py-6 select-none"
    >
      <p className="os-pending font-pixel text-[10px] uppercase tracking-[0.2em] text-os-muted">
        Loading {label}…
      </p>
      <div className="flex flex-col gap-2 motion-safe:animate-pulse">
        <Block className="h-3 w-24" />
        <Block className="h-7 w-2/5" />
        <Block className="h-3.5 w-3/5" />
      </div>
      <div className="grid gap-3 motion-safe:animate-pulse">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex items-center gap-3">
            <Block className="size-8 shrink-0" />
            <Block className="h-4 flex-1" />
            <Block className="h-4 w-16" />
          </div>
        ))}
      </div>
    </div>
  );
}
