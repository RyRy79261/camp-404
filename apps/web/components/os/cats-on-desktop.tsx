"use client";

import { useEffect } from "react";
import {
  ClockCat,
  PawTrail,
  PeekingCat,
  useDesktopSecrets,
  usePeek,
} from "@camp404/games/cats";
import { ShadowWork } from "@camp404/games/shadow-work";

// Where the desktop puts Camp 404's two cats (owner, 2026-09-25; the
// prototype's _proto/cats.md). The cats themselves are @camp404/games's; this
// only says where each sits. Never labelled: each is a toy for the pointer,
// hidden from assistive tech and out of the Tab order (the games package
// draws them so). Decorative: none takes a tap meant for a window (the
// desktop lets them through where a window reaches them) or reads any data.
//
// Loaded only through desktop-cats.tsx's lazy wrappers, so no game is in the
// desktop's first bundle. Under reduced motion every one of them holds still,
// and in a hidden tab nothing of theirs runs (the games package's rules).

/** Prince, asleep on a clock (the taskbar's, and the phone bar's). */
export function ClockPrince({ className }: { className?: string }) {
  return <ClockCat className={className} />;
}

/** How long after `sudo feed cat` Jinn may still turn up (a slow chunk). */
export const FEED_WAIT_MS = 3000;

/**
 * Jinn now and then peeking over the focused window's top edge, and at once
 * after `fedAt` (when the Terminal's `sudo feed cat` ran, in ms since the
 * epoch; 0 for never). A time, not a toggle, so a peek asked for while this
 * was still loading is not lost. Its own component with its own timer, so a
 * peek re-renders it and nothing else.
 */
export function WindowPeek({ fedAt }: { fedAt: number }) {
  const [peeking, show] = usePeek();
  useEffect(() => {
    if (fedAt > 0 && Date.now() - fedAt < FEED_WAIT_MS) show();
  }, [fedAt, show]);
  return peeking ? <PeekingCat /> : null;
}

/** Shadow Work with Jinn asleep on it, pinned under the Teams folder's icons. */
export function TeamsFolderArt({ onWake }: { onWake: () => void }) {
  return <ShadowWork onWake={onWake} />;
}

/**
 * The desktop's secret keys (the Konami code, "meow"; a key typed into a
 * field never counts) and the paw prints behind the pointer while `paws` is
 * on. The desktop owns `paws`, so the Terminal's `meow` toggles the same one.
 */
export function DesktopSecrets({
  paws,
  onKonami,
  onMeow,
}: {
  paws: boolean;
  onKonami: () => void;
  onMeow: () => void;
}) {
  useDesktopSecrets({ onKonami, onMeow });
  return <PawTrail on={paws} />;
}
