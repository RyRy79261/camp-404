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
}: {
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-os-muted select-none">
      {icon}
      <p className="font-pixel text-xs uppercase tracking-[0.2em]">{label}</p>
      <p className="font-mono text-[11px]">Click to open.</p>
    </div>
  );
}
