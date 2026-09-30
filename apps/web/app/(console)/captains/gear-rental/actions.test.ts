import { beforeEach, describe, expect, it, vi } from "vitest";

// The captains' gear rental actions (#241): the gate first, the Zod boundary
// next, then the write with the actor's id alone. A refusal from the gate
// writes nothing.

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/rental-gate", () => ({ rentalActionGate: vi.fn() }));
vi.mock("@/lib/payments", () => ({ ledgerCycle: vi.fn(async () => 2027) }));
vi.mock("@/lib/rental", () => ({
  addRentalItem: vi.fn(async () => ({ ok: true, id: "i1" })),
  editRentalItem: vi.fn(async () => ({ ok: true })),
  archiveRentalItem: vi.fn(async () => ({ ok: true })),
  confirmRentalOrder: vi.fn(async () => ({
    ok: true,
    totalCents: 26_000,
    chargeId: "c1",
  })),
  reopenRentalOrder: vi.fn(async () => ({ ok: true })),
  setTentLabel: vi.fn(async () => ({ ok: true })),
}));

import { revalidatePath } from "next/cache";
import { MY_DUES_PATH } from "@/lib/dues-copy";
import {
  addRentalItem,
  confirmRentalOrder,
  reopenRentalOrder,
  setTentLabel,
} from "@/lib/rental";
import { RENTAL_REFUSAL } from "@/lib/rental-copy";
import { rentalActionGate } from "@/lib/rental-gate";
import {
  addRentalItemAction,
  archiveRentalItemAction,
  confirmRentalOrderAction,
  editRentalItemAction,
  reopenRentalOrderAction,
  setTentLabelAction,
} from "./actions";

const ID = "5f0c1b9e-6a55-4d2b-9d6f-3a1f2b3c4d5e";
const LINE = "6f0c1b9e-6a55-4d2b-9d6f-3a1f2b3c4d5e";

const item = {
  name: "2-person tent",
  isTent: true,
  sleeps: 2,
  campPriceCents: 10_000,
  campStockCount: 4,
  supplierPriceCents: 25_000,
  reserveCount: 0,
  reserveSource: "supplier",
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(rentalActionGate).mockResolvedValue({
    ok: true,
    campUser: { id: "cap" },
    rank: "captain",
  } as never);
});

describe("the catalogue actions", () => {
  it("adds an item for this year as the captain", async () => {
    expect(await addRentalItemAction(item)).toEqual({
      ok: true,
      data: { id: "i1" },
    });
    expect(addRentalItem).toHaveBeenCalledExactlyOnceWith({
      cycle: 2027,
      item,
      actorId: "cap",
    });
  });

  it("refuses camp stock with a price and no count, beside the form", async () => {
    expect(
      await addRentalItemAction({ ...item, campStockCount: null }),
    ).toEqual({
      ok: false,
      error: "Camp stock needs both a price and how many the camp has.",
    });
    expect(addRentalItem).not.toHaveBeenCalled();
  });
});

describe("confirmRentalOrderAction", () => {
  const input = {
    orderId: ID,
    expectedVersion: 2,
    sources: [{ lineId: LINE, source: "camp" }],
  };

  it("confirms as the captain and refreshes the member's dues", async () => {
    expect(await confirmRentalOrderAction(input)).toEqual({
      ok: true,
      data: { totalCents: 26_000, charged: true },
    });
    expect(confirmRentalOrder).toHaveBeenCalledExactlyOnceWith({
      ...input,
      actorId: "cap",
    });
    expect(revalidatePath).toHaveBeenCalledWith(MY_DUES_PATH);
  });

  it("passes the write's refusal on and refreshes nothing", async () => {
    vi.mocked(confirmRentalOrder).mockResolvedValueOnce({
      ok: false,
      error: "This order changed since you opened it. Reload the page.",
    });
    expect(await confirmRentalOrderAction(input)).toEqual({
      ok: false,
      error: "This order changed since you opened it. Reload the page.",
    });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("refuses a source that is neither camp stock nor the supplier", async () => {
    expect(
      await confirmRentalOrderAction({
        ...input,
        sources: [{ lineId: LINE, source: "shop" }],
      }),
    ).toEqual({ ok: false, error: "Pick camp stock or the supplier." });
    expect(confirmRentalOrder).not.toHaveBeenCalled();
  });
});

describe("the gate", () => {
  it("stops every action for anyone who is not a captain", async () => {
    vi.mocked(rentalActionGate).mockResolvedValue({
      ok: false,
      error: RENTAL_REFUSAL,
    });
    const refused = { ok: false, error: RENTAL_REFUSAL };
    expect(await addRentalItemAction(item)).toEqual(refused);
    expect(await editRentalItemAction({ itemId: ID, item })).toEqual(refused);
    expect(await archiveRentalItemAction({ itemId: ID })).toEqual(refused);
    expect(
      await confirmRentalOrderAction({
        orderId: ID,
        expectedVersion: 1,
        sources: [],
      }),
    ).toEqual(refused);
    expect(
      await reopenRentalOrderAction({ orderId: ID, expectedVersion: 1 }),
    ).toEqual(refused);
    expect(await setTentLabelAction({ lineId: LINE, label: "T1" })).toEqual(
      refused,
    );
    for (const write of [
      addRentalItem,
      confirmRentalOrder,
      reopenRentalOrder,
      setTentLabel,
    ]) {
      expect(write).not.toHaveBeenCalled();
    }
  });
});

describe("setTentLabelAction", () => {
  it("trims the label, and a blank one takes it off", async () => {
    await setTentLabelAction({ lineId: LINE, label: " T3 " });
    expect(setTentLabel).toHaveBeenLastCalledWith({
      lineId: LINE,
      label: "T3",
      actorId: "cap",
    });
    await setTentLabelAction({ lineId: LINE, label: "  " });
    expect(setTentLabel).toHaveBeenLastCalledWith({
      lineId: LINE,
      label: null,
      actorId: "cap",
    });
  });
});
