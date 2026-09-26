"use client";

import dynamic from "next/dynamic";
import { INKBLOT_COPY } from "@/lib/terminal-commands";

// INKBLOT, fetched only when its window opens (never in the desktop's first
// bundle). Until it arrives the window shows the game's own background. The
// wall's photos are the console's own copies (public/inkblot), handed in, so
// the game package holds no app's files.
const InkblotWindow = dynamic(
  () => import("@camp404/games/inkblot").then((m) => m.InkblotWindow),
  { ssr: false, loading: () => <div className="h-full bg-os-bg" /> },
);

/** INKBLOT's window body. Its loop runs only while this window is the live one. */
export function InkblotProgram() {
  return <InkblotWindow copy={INKBLOT_COPY} photoBase="/inkblot" />;
}
