"use client";

import type { ComponentProps } from "react";
import dynamic from "next/dynamic";
import type { InkblotBoardEntry } from "@camp404/types";
import {
  getInkblotBoardAction,
  recordInkblotRunAction,
} from "@/app/(console)/terminal/inkblot/actions";
import { INKBLOT_COPY } from "@/lib/terminal-commands";

// INKBLOT, fetched only when its window opens (never in the desktop's first
// bundle). Until it arrives the window shows the game's own background. The
// wall's photos are the console's own copies (public/inkblot), handed in, so
// the game package holds no app's files.
const InkblotWindow = dynamic(
  () => import("@camp404/games/inkblot").then((m) => m.InkblotWindow),
  { ssr: false, loading: () => <div className="h-full bg-os-bg" /> },
);

// The game's board types, read off the lazy component: even a type import
// from @camp404/games is refused here (desktop-cats.test.tsx).
type InkblotBoard = NonNullable<ComponentProps<typeof InkblotWindow>["board"]>;
type InkblotEntry = Awaited<ReturnType<InkblotBoard["load"]>>[number];

const toEntry = (e: InkblotBoardEntry): InkblotEntry => ({
  name: e.initials,
  seconds: e.durationMs / 1000,
  at: e.at,
});

/** The camp's shared board, kept in the database (inkblot_scores). */
export const campInkblotBoard: InkblotBoard = {
  async load() {
    const result = await getInkblotBoardAction();
    if (!result.ok) throw new Error(result.error);
    return result.data.map(toEntry);
  },
  async save({ name, seconds }) {
    const result = await recordInkblotRunAction({
      initials: name,
      durationMs: Math.round(seconds * 1000),
    });
    if (!result.ok) return result;
    return {
      ok: true,
      board: result.data.board.map(toEntry),
      mine: toEntry(result.data.mine),
    };
  },
};

/** INKBLOT's window body. Its loop runs only while this window is the live one. */
export function InkblotProgram() {
  return (
    <InkblotWindow
      copy={INKBLOT_COPY}
      photoBase="/inkblot"
      board={campInkblotBoard}
    />
  );
}
