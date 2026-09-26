"use client";

import { useSyncExternalStore } from "react";

export const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

/** Made once: the snapshot is read on every render of every cat. */
let list: MediaQueryList | null = null;
let madeBy: typeof window.matchMedia | null = null;
function reducedMotionList(): MediaQueryList {
  // A new matchMedia (a test swapping in its own) makes the list again.
  if (!list || madeBy !== window.matchMedia) {
    madeBy = window.matchMedia;
    list = window.matchMedia(REDUCED_MOTION_QUERY);
  }
  return list;
}

function subscribe(onChange: () => void) {
  const mq = reducedMotionList();
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

/**
 * Whether the member asked for reduced motion. On the server, and during
 * hydration, the answer is `serverValue`: "yes" by default, so nothing
 * starts moving until the browser has said it may. A still scene that must
 * not be rearranged after hydration (Jinn asleep on Shadow Work) passes
 * false, since its first frame is still either way.
 */
export function useReducedMotion(serverValue = true): boolean {
  return useSyncExternalStore(
    subscribe,
    () => reducedMotionList().matches,
    () => serverValue,
  );
}
