import { beforeEach, describe, expect, it, vi } from "vitest";

// The shopping list's ticks (#245): any approved member ticks, for the whole
// camp (the owner, 2026-09-30), as the signed-in actor; the write checks the
// member again.

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ unstable_rethrow: vi.fn() }));
vi.mock("@/lib/captain-gate", () => ({ captainActionGate: vi.fn() }));
vi.mock("@/lib/kitchen-menu", () => ({
  setShoppingTicks: vi.fn(async () => ({ ok: true })),
}));

import { captainActionGate } from "@/lib/captain-gate";
import { setShoppingTicks } from "@/lib/kitchen-menu";
import { TICK_REFUSAL } from "@/lib/recipe-copy";
import { setShoppingTicksAction } from "./actions";

const LINES = [{ key: "onions|g", amount: "3.5 kg" }];

beforeEach(() => vi.clearAllMocks());

describe("setShoppingTicksAction", () => {
  it("lets a plain member tick, as themselves", async () => {
    vi.mocked(captainActionGate).mockResolvedValue({
      ok: true,
      rank: "camp_member",
      campUser: { id: "member-1" },
    } as never);
    expect(
      await setShoppingTicksAction({
        lines: LINES,
        ticked: true,
        actorId: "someone-else",
      }),
    ).toEqual({ ok: true });
    expect(captainActionGate).toHaveBeenCalledWith("camp_member", TICK_REFUSAL);
    expect(setShoppingTicks).toHaveBeenCalledWith({
      lines: LINES,
      ticked: true,
      actorId: "member-1",
    });
  });

  it("refuses someone the gate refuses, and a tick with no lines", async () => {
    vi.mocked(captainActionGate).mockResolvedValue({
      ok: false,
      error: "Your account is still awaiting approval.",
    });
    expect(
      await setShoppingTicksAction({ lines: LINES, ticked: true }),
    ).toEqual({ ok: false, error: "Your account is still awaiting approval." });
    vi.mocked(captainActionGate).mockResolvedValue({
      ok: true,
      rank: "camp_member",
      campUser: { id: "member-1" },
    } as never);
    expect(await setShoppingTicksAction({ lines: [], ticked: true })).toEqual({
      ok: false,
      error: "Pick a line to tick.",
    });
    expect(setShoppingTicks).not.toHaveBeenCalled();
  });
});
