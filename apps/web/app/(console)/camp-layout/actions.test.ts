import { beforeEach, describe, expect, it, vi } from "vitest";

// The camp layout's actions (#271). What matters here:
//  1. Saving needs a captain or a lead of Structures: a lead of any other
//     team (Kitchen) is refused before the facade is called, although their
//     clearance is the global team_lead rung. A member is refused too.
//  2. The neighbour link is a captain's alone, a Structures lead included.
//  3. Every write names the signed-in actor and nothing else.
// The rules are checked again inside each write (packages/db, on PGlite).

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ unstable_rethrow: vi.fn() }));
vi.mock("@/lib/captain-gate", () => ({ captainActionGate: vi.fn() }));
vi.mock("@/lib/users", () => ({ getLeadTeams: vi.fn(async () => []) }));
vi.mock("@/lib/camp-layout", () => ({
  saveCampLayout: vi.fn(async () => ({ ok: true, version: 2 })),
  restoreLayoutVersion: vi.fn(async () => ({ ok: true, version: 3 })),
  copyLastYearLayout: vi.fn(async () => ({
    ok: true,
    version: 1,
    fromCycle: 2026,
  })),
  shareCampLayout: vi.fn(async () => ({ ok: true, token: "t".repeat(32) })),
  unshareCampLayout: vi.fn(async () => ({ ok: true, changed: true })),
}));

import { revalidatePath } from "next/cache";
import { LAYOUT_TEAM, emptyLayout } from "@camp404/core";
import type { ViewerRank } from "@camp404/types";
import { captainActionGate } from "@/lib/captain-gate";
import {
  copyLastYearLayout,
  restoreLayoutVersion,
  saveCampLayout,
  shareCampLayout,
  unshareCampLayout,
} from "@/lib/camp-layout";
import {
  LAYOUT_PATH,
  LAYOUT_REFUSAL,
  SHARE_REFUSAL,
} from "@/lib/camp-layout-copy";
import { getLeadTeams } from "@/lib/users";
import {
  copyLastYearLayoutAction,
  restoreLayoutVersionAction,
  saveLayoutAction,
  shareLayoutAction,
  unshareLayoutAction,
} from "./actions";

const LADDER: ViewerRank[] = ["camp_member", "team_lead", "captain"];

function actAs(rank: ViewerRank, led: string[] = [], id = "user-1") {
  vi.mocked(captainActionGate).mockImplementation(async (required, refusal) =>
    LADDER.indexOf(rank) >= LADDER.indexOf(required)
      ? { ok: true, campUser: { id } as never, rank }
      : { ok: false, error: refusal ?? "refused" },
  );
  vi.mocked(getLeadTeams).mockResolvedValue(led);
}

const SAVE = { layout: emptyLayout(), expectedVersion: 1, note: "Moved it" };

beforeEach(() => vi.clearAllMocks());

describe("saving the layout", () => {
  it("lets a Structures lead and a captain save, naming only themselves", async () => {
    actAs("team_lead", [LAYOUT_TEAM], "lead-1");
    expect(await saveLayoutAction(SAVE)).toEqual({
      ok: true,
      data: { version: 2 },
    });
    expect(saveCampLayout).toHaveBeenCalledWith({
      ...SAVE,
      actorId: "lead-1",
    });
    expect(revalidatePath).toHaveBeenCalledWith(LAYOUT_PATH);

    actAs("captain", [], "cap-1");
    expect((await saveLayoutAction(SAVE)).ok).toBe(true);
    expect(vi.mocked(saveCampLayout).mock.calls[1]?.[0].actorId).toBe("cap-1");
  });

  it("refuses a Kitchen lead and a member before the write", async () => {
    for (const [rank, led] of [
      ["team_lead", ["kitchen"]],
      ["camp_member", [LAYOUT_TEAM]],
    ] as const) {
      actAs(rank, [...led]);
      expect(await saveLayoutAction(SAVE)).toEqual({
        ok: false,
        error: LAYOUT_REFUSAL,
      });
      expect(
        await restoreLayoutVersionAction({ number: 1, expectedVersion: 2 }),
      ).toEqual({ ok: false, error: LAYOUT_REFUSAL });
      expect(await copyLastYearLayoutAction()).toEqual({
        ok: false,
        error: LAYOUT_REFUSAL,
      });
    }
    expect(saveCampLayout).not.toHaveBeenCalled();
    expect(restoreLayoutVersion).not.toHaveBeenCalled();
    expect(copyLastYearLayout).not.toHaveBeenCalled();
  });

  it("checks the plan at the boundary", async () => {
    actAs("captain");
    const bad = emptyLayout();
    bad.pieces.push({
      id: "p-1",
      kind: "tent",
      label: "",
      x: bad.plot.widthM,
      y: 0,
      w: 3,
      h: 2,
    });
    const result = await saveLayoutAction({ ...SAVE, layout: bad });
    expect(result.ok).toBe(false);
    expect(saveCampLayout).not.toHaveBeenCalled();
  });
});

describe("the neighbour link", () => {
  it("is a captain's to turn on and off", async () => {
    actAs("captain", [], "cap-1");
    expect(await shareLayoutAction()).toEqual({
      ok: true,
      data: { token: "t".repeat(32) },
    });
    expect(shareCampLayout).toHaveBeenCalledWith({ actorId: "cap-1" });
    expect(await unshareLayoutAction()).toEqual({ ok: true });
    expect(unshareCampLayout).toHaveBeenCalledWith({ actorId: "cap-1" });
  });

  it("refuses a Structures lead and a member", async () => {
    for (const rank of ["team_lead", "camp_member"] as const) {
      actAs(rank, [LAYOUT_TEAM]);
      expect(await shareLayoutAction()).toEqual({
        ok: false,
        error: SHARE_REFUSAL,
      });
      expect(await unshareLayoutAction()).toEqual({
        ok: false,
        error: SHARE_REFUSAL,
      });
    }
    expect(shareCampLayout).not.toHaveBeenCalled();
    expect(unshareCampLayout).not.toHaveBeenCalled();
  });
});
