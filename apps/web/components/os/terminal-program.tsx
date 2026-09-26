"use client";

import { useContext, useEffect } from "react";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { TerminalWindow } from "@camp404/os/terminal";
import {
  CONSOLE_COMMANDS,
  WELCOME,
  isTerminalEffect,
  terminalHref,
  type TerminalContext,
} from "@/lib/terminal-commands";
import { DesktopSignalsContext } from "./held-screen";

/**
 * The Terminal's window body: the shared `TerminalWindow` with the console's
 * commands over the member's own programs (handed in by the page, built on
 * the server from their manifest). `open` and `exit` go through the desktop,
 * so they take the same path as an icon and a close button; with no desktop
 * around it, the router does.
 */
export function TerminalProgram({ context }: { context: TerminalContext }) {
  const desktop = useContext(DesktopSignalsContext);
  const router = useRouter();
  // The game is fetched only when someone might play it: while the Terminal
  // is open, so `play inkblot` opens a game that is ready.
  useEffect(() => {
    void import("@camp404/games/inkblot");
  }, []);

  return (
    <TerminalWindow
      commands={CONSOLE_COMMANDS}
      context={context}
      welcome={WELCOME}
      openApp={(id) => {
        const href = terminalHref(id, context);
        if (!href) return;
        if (desktop) desktop.open(href);
        else router.push(href as Route);
      }}
      onEffect={(effect) => {
        if (isTerminalEffect(effect)) desktop?.effect(effect);
      }}
      close={() => {
        if (desktop) desktop.closeLive();
        else router.push("/");
      }}
    />
  );
}
