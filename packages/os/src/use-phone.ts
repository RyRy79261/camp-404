"use client";

import { useCallback, useSyncExternalStore } from "react";

/** Below the md breakpoint the desktop becomes a phone home screen. */
export const PHONE_QUERY = "(max-width: 767px)";

/**
 * Whether the screen is phone-sized, following it as it changes. The server
 * cannot know, so it renders the desktop and a phone flips after hydration.
 */
/** One MediaQueryList per query, made once: a render may ask many times. */
const lists = new Map<string, MediaQueryList>();
let madeBy: typeof window.matchMedia | null = null;
export function mediaQueryList(query: string): MediaQueryList {
  // A new matchMedia (a test swapping in its own) starts the lists again.
  if (madeBy !== window.matchMedia) {
    lists.clear();
    madeBy = window.matchMedia;
  }
  let mq = lists.get(query);
  if (!mq) {
    mq = window.matchMedia(query);
    lists.set(query, mq);
  }
  return mq;
}

export function usePhone(query: string = PHONE_QUERY): boolean {
  const subscribe = useCallback(
    (cb: () => void) => {
      const mq = mediaQueryList(query);
      mq.addEventListener("change", cb);
      return () => mq.removeEventListener("change", cb);
    },
    [query],
  );
  // The snapshot reads the list made once, never a new matchMedia per
  // render (a window drag used to make one on every frame).
  return useSyncExternalStore(
    subscribe,
    () => mediaQueryList(query).matches,
    () => false,
  );
}
