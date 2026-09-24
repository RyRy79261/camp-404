import { beforeEach, describe, expect, it, vi } from "vitest";

// The payments ledger's writes: captain-only, amounts typed the way a
// captain types them, and a stale status change is told, not applied.

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/captain-gate", () => ({ captainActionGate: vi.fn() }));
vi.mock("@/lib/users", () => ({ findCampUserById: vi.fn() }));
vi.mock("@camp404/db/payments", () => ({
  recordPayment: vi.fn(async () => ({
    id: "p1",
    reference: "C404-M017-2027-1",
  })),
  setPaymentStatus: vi.fn(async () => true),
}));

import { revalidatePath } from "next/cache";
import { captainActionGate } from "@/lib/captain-gate";
import { findCampUserById } from "@/lib/users";
import { recordPayment, setPaymentStatus } from "@camp404/db/payments";
import { recordPaymentAction, setPaymentStatusAction } from "./actions";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(captainActionGate).mockResolvedValue({
    ok: true,
    campUser: { id: "cap-1" },
    rank: "captain",
  } as never);
  vi.mocked(findCampUserById).mockResolvedValue({ id: "m1" } as never);
});

const VALID = {
  userId: "m1",
  amount: "1 250,50",
  status: "reconciled",
  note: " FNB ",
};

describe("recordPaymentAction", () => {
  it("records the payment in cents as the captain and refreshes both pages", async () => {
    expect(await recordPaymentAction(VALID)).toEqual({
      ok: true,
      reference: "C404-M017-2027-1",
    });
    expect(recordPayment).toHaveBeenCalledWith({
      userId: "m1",
      amountCents: 125050,
      currency: "ZAR",
      status: "reconciled",
      note: "FNB",
      recordedByUserId: "cap-1",
    });
    expect(revalidatePath).toHaveBeenCalledWith("/captains/payments");
    expect(revalidatePath).toHaveBeenCalledWith("/captains/camp-management");
  });

  it("says what is wrong with the form, and records nothing", async () => {
    expect(await recordPaymentAction({ ...VALID, userId: "" })).toEqual({
      ok: false,
      error: "Pick the member who paid.",
    });
    expect(await recordPaymentAction({ ...VALID, amount: "lots" })).toEqual({
      ok: false,
      error: "Type the amount like 1250 or 1250,50.",
    });
    expect(await recordPaymentAction({ ...VALID, status: "paid" })).toEqual({
      ok: false,
      error: "Pick a status.",
    });
    expect(
      await recordPaymentAction({ ...VALID, note: "x".repeat(501) }),
    ).toEqual({
      ok: false,
      error: "Keep the note under 500 characters.",
    });
    vi.mocked(findCampUserById).mockResolvedValue(null);
    expect(await recordPaymentAction(VALID)).toEqual({
      ok: false,
      error: "Member not found.",
    });
    expect(recordPayment).not.toHaveBeenCalled();
  });

  it("records in rands when no currency is given, and passes USD through", async () => {
    await recordPaymentAction({ ...VALID, amount: "12,34" });
    expect(recordPayment).toHaveBeenLastCalledWith(
      expect.objectContaining({ amountCents: 1234, currency: "ZAR" }),
    );
    await recordPaymentAction({
      ...VALID,
      amount: "US$12,34",
      currency: "USD",
    });
    expect(recordPayment).toHaveBeenLastCalledWith(
      expect.objectContaining({ amountCents: 1234, currency: "USD" }),
    );
  });

  it("refuses a currency the camp does not take, and records nothing", async () => {
    for (const currency of ["GBP", "usd", " ZAR", ""]) {
      expect(await recordPaymentAction({ ...VALID, currency })).toEqual({
        ok: false,
        error: "Pick ZAR, USD or EUR.",
      });
    }
    expect(recordPayment).not.toHaveBeenCalled();
  });

  it("refuses anyone the captain gate refuses", async () => {
    vi.mocked(captainActionGate).mockResolvedValue({
      ok: false,
      error: "Captain access only.",
    });
    expect(await recordPaymentAction(VALID)).toEqual({
      ok: false,
      error: "Captain access only.",
    });
    expect(captainActionGate).toHaveBeenCalledWith("captain");
    expect(recordPayment).not.toHaveBeenCalled();
  });
});

describe("setPaymentStatusAction", () => {
  it("moves the status from the one the captain saw", async () => {
    expect(
      await setPaymentStatusAction({
        paymentId: "p1",
        from: "pending",
        to: "waived",
      }),
    ).toEqual({ ok: true });
    expect(setPaymentStatus).toHaveBeenCalledWith({
      paymentId: "p1",
      from: "pending",
      to: "waived",
      actorId: "cap-1",
    });
  });

  it("tells the captain when another captain got there first", async () => {
    vi.mocked(setPaymentStatus).mockResolvedValue(false);
    expect(
      await setPaymentStatusAction({
        paymentId: "p1",
        from: "pending",
        to: "reconciled",
      }),
    ).toEqual({
      ok: false,
      error:
        "Another captain already changed this payment. The list is up to date now.",
    });
    expect(revalidatePath).toHaveBeenCalledWith("/captains/payments");
  });

  it("refuses an unknown status and does nothing for no change", async () => {
    expect(
      await setPaymentStatusAction({
        paymentId: "p1",
        from: "pending",
        to: "paid",
      }),
    ).toEqual({ ok: false, error: "Unknown payment change." });
    expect(
      await setPaymentStatusAction({
        paymentId: "p1",
        from: "waived",
        to: "waived",
      }),
    ).toEqual({ ok: true });
    expect(setPaymentStatus).not.toHaveBeenCalled();
  });
});
