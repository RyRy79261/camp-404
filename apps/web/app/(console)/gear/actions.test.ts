import { beforeEach, describe, expect, it, vi } from "vitest";

// A member's own gear order actions (#241): the order is always the signed-in
// member's, never an id the form sends, and a member's line never carries a
// source or a price.

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/captain-gate", () => ({ captainActionGate: vi.fn() }));
vi.mock("@/lib/payments", () => ({ ledgerCycle: vi.fn(async () => 2027) }));
vi.mock("@/lib/rental", () => ({
  saveRentalOrder: vi.fn(async () => ({
    ok: true,
    version: 1,
    status: "submitted",
  })),
  withdrawRentalOrder: vi.fn(async () => ({ ok: true, version: 3 })),
}));

import { captainActionGate } from "@/lib/captain-gate";
import { saveRentalOrder, withdrawRentalOrder } from "@/lib/rental";
import { changeMyGearAction, saveMyGearAction } from "./actions";

const ITEM = "5f0c1b9e-6a55-4d2b-9d6f-3a1f2b3c4d5e";
const line = { itemId: ITEM, choice: "need", quantity: 1, sharerIds: ["pal"] };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(captainActionGate).mockResolvedValue({
    ok: true,
    campUser: { id: "me" },
    rank: "camp_member",
  } as never);
});

describe("saveMyGearAction", () => {
  it("saves the signed-in member's order, whatever id, source or price the form carries", async () => {
    expect(
      await saveMyGearAction({
        userId: "someone",
        lines: [{ ...line, source: "camp", unitPriceCents: 1 }],
        submit: true,
        expectedVersion: 0,
      }),
    ).toEqual({ ok: true, data: { version: 1, status: "submitted" } });
    expect(saveRentalOrder).toHaveBeenCalledExactlyOnceWith({
      userId: "me",
      cycle: 2027,
      lines: [{ ...line, ownDescription: null, ownSleeps: null }],
      submit: true,
      expectedVersion: 0,
    });
    expect(captainActionGate).toHaveBeenCalledWith("camp_member");
  });

  it("says what is wrong with the order and saves nothing", async () => {
    expect(
      await saveMyGearAction({
        lines: [{ ...line, quantity: 0 }],
        submit: false,
        expectedVersion: 0,
      }),
    ).toEqual({ ok: false, error: "Ask for at least one." });
    expect(
      await saveMyGearAction({
        lines: [{ ...line, choice: "buy" }],
        submit: false,
        expectedVersion: 0,
      }),
    ).toEqual({
      ok: false,
      error: "Say whether you have your own or need one.",
    });
    expect(saveRentalOrder).not.toHaveBeenCalled();
  });

  it("refuses someone the gate refuses", async () => {
    vi.mocked(captainActionGate).mockResolvedValue({
      ok: false,
      error: "Not signed in.",
    });
    expect(
      await saveMyGearAction({ lines: [], submit: false, expectedVersion: 0 }),
    ).toEqual({ ok: false, error: "Not signed in." });
    expect(saveRentalOrder).not.toHaveBeenCalled();
  });
});

describe("changeMyGearAction", () => {
  it("takes back the signed-in member's own order", async () => {
    expect(
      await changeMyGearAction({ expectedVersion: 2, userId: "someone" }),
    ).toEqual({ ok: true, data: { version: 3 } });
    expect(withdrawRentalOrder).toHaveBeenCalledExactlyOnceWith({
      userId: "me",
      cycle: 2027,
      expectedVersion: 2,
    });
  });
});
