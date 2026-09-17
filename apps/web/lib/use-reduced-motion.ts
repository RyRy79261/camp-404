"use client";

import { useSyncExternalStore } from "react";

// Whether the device asks for less motion, kept live. CSS motion already obeys
// the global reduced-motion rule; this is for motion a script runs, such as the
// dnd-kit drop animation (the Web Animations API), which CSS cannot stop.

const QUERY = "(prefers-reduced-motion: reduce)";

function subscribe(onChange: () => void): () => void {
  if (typeof window === "undefined" || !window.matchMedia) return () => {};
  const list = window.matchMedia(QUERY);
  list.addEventListener?.("change", onChange);
  return () => list.removeEventListener?.("change", onChange);
}

function getSnapshot(): boolean {
  return typeof window !== "undefined" && !!window.matchMedia?.(QUERY).matches;
}

export function useReducedMotion(): boolean {
  // The server cannot know, so it renders the full-motion default.
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
