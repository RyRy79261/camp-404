"use client";

import { createContext, useContext, useEffect } from "react";
import type { TerminalEffect } from "@/lib/terminal-commands";

// A blocking questionnaire can start holding a member while their desktop is
// already up: a captain sends one, and the member's next click is
// redirected to the runner by the server. The console layout stays mounted
// across that soft navigation, so it is still drawing the full desktop. The
// runner and its completion page render <HeldScreen> while the member is
// held; the desktop hears it through this context, draws the held picture at
// once (the form on top of an inert desktop, no tray, pins, Today or copies)
// and refreshes, so the layout re-renders into its held branch.
//
// A picture only: the gate is still the server's redirect.
//
// The same context lets a page inside a window ask the desktop to open
// another program or to close its own window (the Terminal's `open` and
// `exit`), so it goes the desktop's way rather than round it, and to show
// one of its cats (the Terminal's `meow` and `sudo feed cat`).

export interface DesktopSignals {
  /**
   * A page says a blocking questionnaire holds the member. The desktop holds
   * for that address only: when the member moves on, the next page says so
   * again if they are still held.
   */
  hold: () => void;
  /**
   * Open a program's address the way an icon does (the dirty guard, the
   * last-seen copy, the pending state): the Terminal's `open`.
   */
  open: (href: string) => void;
  /** Close the window the page is in, as its close button does. */
  closeLive: () => void;
  /**
   * A Terminal cat command's request (`meow`: paw prints on or off; `sudo
   * feed cat`: Jinn peeks now). Decorative only.
   */
  effect: (effect: TerminalEffect) => void;
}

export const DesktopSignalsContext = createContext<DesktopSignals | null>(null);

/** Rendered by a page only while a blocking questionnaire holds the member. */
export function HeldScreen() {
  const signals = useContext(DesktopSignalsContext);
  useEffect(() => {
    signals?.hold();
  }, [signals]);
  return null;
}
