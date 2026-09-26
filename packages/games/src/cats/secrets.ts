"use client";

import { useEffect, useRef } from "react";

/** Up up down down left right left right B A, as `KeyboardEvent.key`s. */
export const KONAMI = [
  "arrowup",
  "arrowup",
  "arrowdown",
  "arrowdown",
  "arrowleft",
  "arrowright",
  "arrowleft",
  "arrowright",
  "b",
  "a",
] as const;

export type Secret = "konami" | "meow";

/**
 * One key into the secret-key buffer: the keys kept (the last ten), and
 * which secret, if any, the key just finished. A finished secret empties the
 * buffer, so "meowmeow" is two, not three overlapping.
 */
export function feedSecretKey(
  buffer: readonly string[],
  key: string,
): { buffer: string[]; secret: Secret | null } {
  const next = [...buffer, key.toLowerCase()].slice(-KONAMI.length);
  if (KONAMI.every((k, i) => next[i] === k)) {
    return { buffer: [], secret: "konami" };
  }
  if (next.slice(-4).join("") === "meow") {
    return { buffer: [], secret: "meow" };
  }
  return { buffer: next, secret: null };
}

/** Whether a key went to something the member is typing into. */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (typeof HTMLElement === "undefined" || !(target instanceof HTMLElement)) {
    return false;
  }
  return (
    target.isContentEditable ||
    !!target.closest("input, textarea, select, [role=application]")
  );
}

export type DesktopSecretsHandlers = {
  /** The Konami code, typed anywhere but a field. */
  onKonami: () => void;
  /** "meow", typed anywhere but a field. */
  onMeow: () => void;
};

/**
 * Listens for the desktop's secret keys. Keys typed into a field, or with
 * Ctrl, Cmd or Alt held, never count, so a form can say "meow".
 */
export function useDesktopSecrets({
  onKonami,
  onMeow,
}: DesktopSecretsHandlers) {
  const handlers = useRef({ onKonami, onMeow });
  useEffect(() => {
    handlers.current = { onKonami, onMeow };
  });
  useEffect(() => {
    let buffer: string[] = [];
    function onKey(e: KeyboardEvent) {
      if (e.ctrlKey || e.metaKey || e.altKey || isTypingTarget(e.target)) {
        return;
      }
      const fed = feedSecretKey(buffer, e.key);
      buffer = fed.buffer;
      if (fed.secret === "konami") handlers.current.onKonami();
      else if (fed.secret === "meow") handlers.current.onMeow();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
