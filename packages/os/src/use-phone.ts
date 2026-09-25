"use client";

import { useCallback, useSyncExternalStore } from "react";

/** Below the md breakpoint the desktop becomes a phone home screen. */
export const PHONE_QUERY = "(max-width: 767px)";

/**
 * Whether the screen is phone-sized, following it as it changes. The server
 * cannot know, so it renders the desktop and a phone flips after hydration.
 */
export function usePhone(query: string = PHONE_QUERY): boolean {
  const subscribe = useCallback(
    (cb: () => void) => {
      const mq = window.matchMedia(query);
      mq.addEventListener("change", cb);
      return () => mq.removeEventListener("change", cb);
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  );
}
