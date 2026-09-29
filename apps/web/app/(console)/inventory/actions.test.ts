import { beforeEach, describe, expect, it, vi } from "vitest";

// The inventory's actions (#246). What matters here:
//  1. Every action needs a signed-in, approved member (the gate at
//     camp_member); a refusal reaches no write.
//  2. Every write names the signed-in actor and nothing else: never a rank or
//     a team list. Who may change a team's gear is decided in the write.
//  3. What the form sent is checked at the boundary, and the first sentence
//     is what the person reads.
//  4. A refusal from the write is passed through in its own words.

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ unstable_rethrow: vi.fn() }));
vi.mock("@/lib/captain-gate", () => ({ captainActionGate: vi.fn() }));
vi.mock("@/lib/inventory", () => ({
  addInventoryItem: vi.fn(async () => ({ ok: true, id: "item-new" })),
  updateInventoryItem: vi.fn(),
  archiveInventoryItem: vi.fn(),
  proposeInventoryChange: vi.fn(async () => ({ ok: true, id: "u-1" })),
  reviewInventoryChange: vi.fn(async () => ({ ok: true })),
  addInventoryNeed: vi.fn(),
  updateInventoryNeed: vi.fn(),
  removeInventoryNeed: vi.fn(),
  pledgeToNeed: vi.fn(),
  withdrawPledge: vi.fn(),
  bookInventoryItem: vi.fn(),
  cancelInventoryBooking: vi.fn(),
  lendInventoryItem: vi.fn(),
  returnInventoryLoan: vi.fn(),
}));

import { revalidatePath } from "next/cache";
import { NOT_AN_INVENTORY_EDITOR } from "@camp404/db/inventory";
import { captainActionGate } from "@/lib/captain-gate";
import {
  addInventoryItem,
  bookInventoryItem,
  lendInventoryItem,
  reviewInventoryChange,
} from "@/lib/inventory";
import {
  addItemAction,
  bookItemAction,
  lendItemAction,
  reviewChangeAction,
} from "./actions";

const ITEM_ID = "7c9e6679-7425-40de-944b-e07fc1f90ae7";
const ITEM = {
  name: "Cooler box",
  team: "kitchen",
  category: "cooling",
  condition: "good",
  quantity: 4,
  location: "storage_unit",
};

function signedIn() {
  vi.mocked(captainActionGate).mockResolvedValue({
    ok: true,
    campUser: { id: "actor" } as never,
    rank: "team_lead",
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  signedIn();
});

describe("inventory actions", () => {
  it("refuses anyone the member gate refuses, before any write", async () => {
    vi.mocked(captainActionGate).mockResolvedValue({
      ok: false,
      error: "Your account is still awaiting approval.",
    });
    expect(await bookItemAction({ itemId: ITEM_ID })).toEqual({
      ok: false,
      error: "Your account is still awaiting approval.",
    });
    expect(bookInventoryItem).not.toHaveBeenCalled();
    expect(captainActionGate).toHaveBeenCalledWith("camp_member");
  });

  it("adds an item as the signed-in actor and nobody else", async () => {
    const result = await addItemAction({
      ...ITEM,
      actorId: "someone-else",
      rank: "captain",
    });
    expect(result).toEqual({ ok: true, data: { id: "item-new" } });
    const sent = vi.mocked(addInventoryItem).mock.calls[0]![0];
    expect(sent.actorId).toBe("actor");
    expect(sent).not.toHaveProperty("rank");
    expect(revalidatePath).toHaveBeenCalledWith("/inventory", "layout");
  });

  it("answers the first problem with what was typed, and writes nothing", async () => {
    expect(await addItemAction({ ...ITEM, name: " " })).toEqual({
      ok: false,
      error: "Name the item.",
    });
    expect(
      await lendItemAction({
        itemId: ITEM_ID,
        quantity: 1,
        borrowerCamp: "",
        borrowerAddress: "7:30 and C",
      }),
    ).toEqual({ ok: false, error: "Name the camp that borrowed it." });
    expect(addInventoryItem).not.toHaveBeenCalled();
    expect(lendInventoryItem).not.toHaveBeenCalled();
  });

  it("passes the write's refusal through in its own words, and refreshes nothing", async () => {
    vi.mocked(reviewInventoryChange).mockResolvedValue({
      ok: false,
      error: NOT_AN_INVENTORY_EDITOR,
    });
    expect(
      await reviewChangeAction({ updateId: ITEM_ID, decision: "approved" }),
    ).toEqual({ ok: false, error: NOT_AN_INVENTORY_EDITOR });
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
