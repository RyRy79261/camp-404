"use server";

import { InkblotRun, type InkblotBoardEntry } from "@camp404/types";
import { runAction, type ActionResult } from "@/lib/action-result";
import { readInkblotBoard, recordInkblotRunFor } from "@/lib/inkblot-board";
import { resolveMemberState } from "@/lib/member-gate";
import { manifestModeFor } from "@/lib/program-manifest";
import { rateLimiter } from "@/lib/rate-limit";

// INKBLOT's shared "speed of chaos" board: the camp's fastest clean sweeps.
// Who may read or write it is who may open the game (the page's own gate: a
// member with the full desktop). The member's id comes from the session,
// never the caller, and each writes only their own runs, so no audit row.
// The time is the browser's, bounded by `InkblotRun`. A "use server" file:
// async exports only.

/** Runs one member may save in an hour; a real game takes a while. */
const RUNS_PER_HOUR = 30;

async function player(): Promise<
  { ok: true; userId: string } | { ok: false; error: string }
> {
  const state = await resolveMemberState();
  if (state.kind !== "member") {
    return { ok: false, error: "Sign in again to see the hall of fame." };
  }
  if (manifestModeFor(state) !== "full") {
    return { ok: false, error: "The hall of fame isn't open to you yet." };
  }
  return { ok: true, userId: state.campUser.id };
}

/** The camp's board, fastest first. */
export async function getInkblotBoardAction(): Promise<
  ActionResult<InkblotBoardEntry[]>
> {
  return runAction("getInkblotBoardAction", async () => {
    const who = await player();
    if (!who.ok) return who;
    return { ok: true as const, data: await readInkblotBoard() };
  });
}

/** Put a clean sweep on the board under the member's initials. */
export async function recordInkblotRunAction(
  run: unknown,
): Promise<
  ActionResult<{ board: InkblotBoardEntry[]; mine: InkblotBoardEntry }>
> {
  return runAction("recordInkblotRunAction", async () => {
    const who = await player();
    if (!who.ok) return who;
    const parsed = InkblotRun.safeParse(run);
    if (!parsed.success) {
      return {
        ok: false as const,
        error: parsed.error.issues[0]?.message ?? "That run can't be saved.",
      };
    }
    const verdict = await rateLimiter.limit(`inkblot-run:${who.userId}`, {
      limit: RUNS_PER_HOUR,
      windowMs: 60 * 60 * 1000,
    });
    if (!verdict.ok) {
      return {
        ok: false as const,
        error: "That's a lot of chaos. Try again in a while.",
      };
    }
    const mine = await recordInkblotRunFor(who.userId, parsed.data);
    return {
      ok: true as const,
      data: { board: await readInkblotBoard(), mine },
    };
  });
}
