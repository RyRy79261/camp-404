import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));
vi.mock("../../actions", () => ({
  setPaymentStatusAction: vi.fn(async () => ({ ok: true })),
}));
vi.mock("../../dues-actions", () => ({
  addChargeAction: vi.fn(),
  cancelChargeAction: vi.fn(),
  decideRefundAction: vi.fn(),
  requestRefundAction: vi.fn(),
  setFeeAction: vi.fn(),
  setPaymentPlanAction: vi.fn(),
}));
vi.mock("@camp404/ui/components/toast", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import type { MemberDues } from "@camp404/db/dues";
import { setPaymentStatusAction } from "../../actions";
import { MemberDuesManager } from "./member-dues-manager";

// One member's dues for the Finance team: the balance comes first, the forms
// sit after the lists, "Change fee" is the main button only once the fee was
// changed, "Save plan" shows only once the plan was changed, and excusing a
// payment asks first and names the money. Money text carries no-break spaces
// from Intl, so it is matched with \s.

afterEach(() => {
  cleanup();
  vi.mocked(setPaymentStatusAction).mockClear();
});

const DUES: MemberDues = {
  userId: "u1",
  cycle: 2027,
  name: "Dee Botha",
  refCode: "C404-M001",
  pledge: {
    tierId: "t1",
    tierLabel: "Base",
    amountCents: 250000,
    pledgedAt: null,
  },
  planVersion: 0,
  instalments: [],
  charges: [
    {
      id: "c1",
      kind: "fee",
      description: "Camp fee: Base",
      amountCents: 250000,
      currency: "ZAR",
      standardAmountCents: null,
      concessionReason: null,
      concession: false,
      cancelled: false,
      createdAt: new Date("2026-10-01T10:00:00Z"),
    },
  ],
  payments: [
    {
      id: "p1",
      reference: "C404-M001-2027-1",
      amountCents: 100000,
      currency: "ZAR",
      status: "pending",
      source: "member",
      method: "bank_transfer",
      paidOn: "2026-10-01",
      hasProof: true,
      note: null,
      createdAt: new Date("2026-10-01T10:00:00Z"),
      refund: null,
    },
  ],
  participation: { status: "accepted", withdrewOn: null },
  balance: {
    chargedCents: 250000,
    paidCents: 0,
    pendingCents: 100000,
    refundedCents: 0,
    balanceCents: 250000,
  },
  next: null,
};

function renderIt() {
  return render(
    <MemberDuesManager
      dues={DUES}
      tiers={[
        {
          id: "t1",
          label: "Base",
          amountCents: 250000,
          currency: "ZAR",
          archived: false,
        },
      ]}
      schedule={{
        fullRefundUntil: null,
        partialRefundUntil: null,
        partialRefundPct: null,
      }}
      today="2026-10-01"
    />,
  );
}

describe("MemberDuesManager", () => {
  it("puts the balance before the forms", () => {
    renderIt();
    const balance = screen.getByRole("heading", { name: "Balance" });
    const fee = screen.getByRole("heading", { name: "Camp fee" });
    expect(
      balance.compareDocumentPosition(fee) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    // Proofs to check are their own figure, not mixed into money received.
    expect(
      within(screen.getByRole("group", { name: "Proofs to check" })).getByText(
        /^R\s1\s000,00$/,
      ),
    ).toBeTruthy();
  });

  it("holds Change fee back until the fee changes", () => {
    renderIt();
    const change = screen.getByRole("button", { name: "Change fee" });
    expect(change).toHaveProperty("disabled", true);
    fireEvent.change(screen.getByLabelText("Fee (R)"), {
      target: { value: "2000" },
    });
    expect(change).toHaveProperty("disabled", false);
  });

  it("shows Save plan only once the plan changes", () => {
    renderIt();
    expect(screen.queryByRole("button", { name: "Save plan" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Add instalment" }));
    expect(screen.getByRole("button", { name: "Save plan" })).toBeTruthy();
  });

  it("asks before excusing a payment, and names the money", async () => {
    renderIt();
    fireEvent.click(screen.getByRole("button", { name: "Excuse this amount" }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog.textContent).toMatch(/Excuse R\s1\s000,00\?/);
    expect(setPaymentStatusAction).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole("button", { name: /^Excuse R/ }));
    await waitFor(() =>
      expect(setPaymentStatusAction).toHaveBeenCalledWith({
        paymentId: "p1",
        from: "pending",
        to: "waived",
      }),
    );
  });
});
