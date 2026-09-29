import { beforeEach, describe, expect, it, vi } from "vitest";

// A member's own dues actions (#240): the pledge and a refund request are
// always the signed-in member's, never an id the form sends.

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/captain-gate", () => ({ captainActionGate: vi.fn() }));
vi.mock("@/lib/payments", () => ({ ledgerCycle: vi.fn(async () => 2027) }));
vi.mock("@/lib/dues", () => ({
  savePledge: vi.fn(async () => ({ ok: true, charged: true })),
  requestRefund: vi.fn(async () => ({ ok: true, id: "r1" })),
}));

import { captainActionGate } from "@/lib/captain-gate";
import { requestRefund, savePledge } from "@/lib/dues";
import { requestMyRefundAction, savePledgeAction } from "./actions";

const TIER = "5f0c1b9e-6a55-4d2b-9d6f-3a1f2b3c4d5e";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(captainActionGate).mockResolvedValue({
    ok: true,
    campUser: { id: "me" },
    rank: "camp_member",
  } as never);
});

describe("savePledgeAction", () => {
  it("saves the signed-in member's pledge, whatever id the form carries", async () => {
    expect(
      await savePledgeAction({ kind: "tier", tierId: TIER, userId: "someone" }),
    ).toEqual({ ok: true, data: { charged: true } });
    expect(savePledge).toHaveBeenCalledExactlyOnceWith({
      userId: "me",
      cycle: 2027,
      pledge: { kind: "tier", tierId: TIER },
    });
    expect(captainActionGate).toHaveBeenCalledWith("camp_member");
  });

  it("says what is wrong with the pledge and saves nothing", async () => {
    expect(await savePledgeAction({ kind: "below", amountCents: 0 })).toEqual({
      ok: false,
      error: "The amount must be more than R0.",
    });
    expect(await savePledgeAction({ kind: "anything" })).toEqual({
      ok: false,
      error: "Pick what you can pay.",
    });
    expect(savePledge).not.toHaveBeenCalled();
  });

  it("refuses someone the gate refuses", async () => {
    vi.mocked(captainActionGate).mockResolvedValue({
      ok: false,
      error: "Not signed in.",
    });
    expect(await savePledgeAction({ kind: "tier", tierId: TIER })).toEqual({
      ok: false,
      error: "Not signed in.",
    });
    expect(savePledge).not.toHaveBeenCalled();
  });
});

describe("requestMyRefundAction", () => {
  it("asks as the signed-in member, at the schedule's amount", async () => {
    expect(
      await requestMyRefundAction({ paymentId: "p1", note: " Can't come " }),
    ).toEqual({ ok: true });
    expect(requestRefund).toHaveBeenCalledWith(
      expect.objectContaining({
        paymentId: "p1",
        amountCents: null,
        note: "Can't come",
        actorId: "me",
      }),
    );
  });
});
