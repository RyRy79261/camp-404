import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh, push: vi.fn() }),
}));
vi.mock("./actions", () => ({
  recordPaymentAction: vi.fn(),
  setPaymentStatusAction: vi.fn(async () => ({ ok: true })),
}));
vi.mock("@camp404/ui/components/toast", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import type { PaymentRow } from "@camp404/db/payments";
import { recordPaymentAction, setPaymentStatusAction } from "./actions";
import { PaymentsManager, RecordPaymentDialog } from "./payments-manager";

// The ledger screen: each payment's state in the Finance team's words,
// recording a payment from its dialog, and moving one between statuses (each
// quiet move asks first, and excusing names the money). The row's buttons sit
// in fixed slots. Money text carries no-break spaces from Intl, so it is
// matched with \s.

afterEach(() => {
  cleanup();
  vi.mocked(recordPaymentAction).mockReset();
  vi.mocked(setPaymentStatusAction).mockClear();
  refresh.mockReset();
});

function payment(over: Partial<PaymentRow> = {}): PaymentRow {
  return {
    id: "p1",
    userId: "m1",
    memberName: "Nova",
    memberRefCode: "C404-M017",
    cycle: 2027,
    amountCents: 125050,
    currency: "ZAR",
    reference: "C404-M017-2027-1",
    status: "pending",
    note: null,
    recordedByName: "Jo",
    source: "captain",
    method: null,
    paidOn: null,
    hasProof: false,
    refundStatus: null,
    createdAt: new Date("2027-03-01T10:00:00Z"),
    ...over,
  };
}

const MEMBERS = [
  { id: "m1", name: "Nova", duesPaid: false },
  { id: "m2", name: "Ash", duesPaid: true },
];

function openRecord() {
  render(<RecordPaymentDialog members={MEMBERS} />);
  fireEvent.click(screen.getByRole("button", { name: "Record a payment" }));
  return screen.getByRole("dialog", { name: "Record a payment" });
}

describe("PaymentsManager", () => {
  it("says so when nothing is recorded yet", () => {
    render(<PaymentsManager yearLabel="2027" payments={[]} />);
    expect(screen.getByText("No payments recorded yet.")).toBeTruthy();
  });

  it("names each state in one vocabulary: in the bank, excused, to check, promised", () => {
    render(
      <PaymentsManager
        yearLabel="2027"
        payments={[
          payment({ id: "a", status: "reconciled" }),
          payment({ id: "b", status: "waived" }),
          payment({ id: "c", source: "member" }),
          payment({ id: "d", source: "captain" }),
        ]}
      />,
    );
    const table = screen.getByRole("table", { name: "Payments for 2027" });
    for (const word of ["In the bank", "Excused", "To check", "Promised"]) {
      expect(within(table).getAllByText(word)).toHaveLength(1);
    }
    // The receipt number is labelled, so it is never taken for the EFT reference.
    expect(
      within(table).getAllByText("Receipt no. C404-M017-2027-1"),
    ).toHaveLength(4);
  });

  it("keeps the quiet move in one slot on every row, and the main button only where it applies", () => {
    render(
      <PaymentsManager
        yearLabel="2027"
        payments={[
          payment({ id: "a" }),
          payment({ id: "b", status: "reconciled" }),
        ]}
      />,
    );
    const table = screen.getByRole("table", { name: "Payments for 2027" });
    const slots = table.querySelectorAll('[data-slot="row-actions-secondary"]');
    expect(slots).toHaveLength(2);
    expect(
      table.querySelectorAll('[data-slot="row-actions-primary"]'),
    ).toHaveLength(1);
    expect(
      within(table).queryAllByRole("button", { name: "Waive" }),
    ).toHaveLength(0);
  });

  it("marks a pending payment received", async () => {
    render(<PaymentsManager yearLabel="2027" payments={[payment()]} />);
    // The ledger draws each row twice (a table from md up, a card below it),
    // and CSS hides one; the test DOM has both, so take the first.
    fireEvent.click(
      screen.getAllByRole("button", { name: "Mark received" })[0]!,
    );
    await waitFor(() =>
      expect(setPaymentStatusAction).toHaveBeenCalledWith({
        paymentId: "p1",
        from: "pending",
        to: "reconciled",
      }),
    );
  });

  it("spins only the tapped button and holds every other move", async () => {
    let land!: (value: { ok: true }) => void;
    vi.mocked(setPaymentStatusAction).mockReturnValueOnce(
      new Promise((resolve) => {
        land = resolve;
      }) as never,
    );
    render(<PaymentsManager yearLabel="2027" payments={[payment()]} />);
    const received = screen.getAllByRole("button", {
      name: "Mark received",
    })[0]!;
    fireEvent.click(received);

    await waitFor(() =>
      expect(received.querySelector(".animate-spin")).not.toBeNull(),
    );
    const excuse = screen.getAllByRole("button", {
      name: "Excuse this amount",
    })[0]!;
    expect(excuse.querySelector(".animate-spin")).toBeNull();
    expect(excuse).toHaveProperty("disabled", true);

    land({ ok: true });
    await waitFor(() => expect(excuse).toHaveProperty("disabled", false));
  });

  it("asks before excusing a payment, and names the money", async () => {
    render(<PaymentsManager yearLabel="2027" payments={[payment()]} />);
    fireEvent.click(
      screen.getAllByRole("button", { name: "Excuse this amount" })[0]!,
    );
    const dialog = await screen.findByRole("dialog");
    expect(dialog.textContent).toMatch(/Excuse R\s1\s250,50\?/);
    expect(dialog.textContent).toContain("no money comes in");
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

  it("asks before putting a received payment back to pending", async () => {
    render(
      <PaymentsManager
        yearLabel="2027"
        payments={[payment({ status: "reconciled" })]}
      />,
    );
    fireEvent.click(
      screen.getAllByRole("button", { name: "Back to pending" })[0]!,
    );
    const dialog = await screen.findByRole("dialog");
    expect(setPaymentStatusAction).not.toHaveBeenCalled();
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Back to pending" }),
    );
    await waitFor(() =>
      expect(setPaymentStatusAction).toHaveBeenCalledWith({
        paymentId: "p1",
        from: "reconciled",
        to: "pending",
      }),
    );
  });
});

describe("RecordPaymentDialog", () => {
  it("offers no currency to pick, and no example figure in the amount", () => {
    const dialog = openRecord();
    expect(within(dialog).queryByLabelText("Currency")).toBeNull();
    const amount =
      within(dialog).getByLabelText<HTMLInputElement>("Amount (R)");
    expect(amount.placeholder).toBe("");
  });

  it("records a payment with what the captain typed, and closes", async () => {
    vi.mocked(recordPaymentAction).mockResolvedValue({
      ok: true,
      reference: "C404-M017-2027-1",
    });
    const dialog = openRecord();
    fireEvent.change(within(dialog).getByLabelText("Member"), {
      target: { value: "m1" },
    });
    fireEvent.change(within(dialog).getByLabelText("Amount (R)"), {
      target: { value: "1250" },
    });
    fireEvent.change(within(dialog).getByLabelText("Note (optional)"), {
      target: { value: "FNB" },
    });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Record payment" }),
    );

    await waitFor(() =>
      expect(recordPaymentAction).toHaveBeenCalledWith({
        userId: "m1",
        amount: "1250",
        status: "reconciled",
        note: "FNB",
      }),
    );
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Record a payment" }),
      ).toBeNull(),
    );
  });

  it("shows the refusal and keeps the form when recording fails", async () => {
    vi.mocked(recordPaymentAction).mockResolvedValue({
      ok: false,
      error: "Type the amount in rands, like 1250 or 1250,50.",
    });
    const dialog = openRecord();
    fireEvent.change(within(dialog).getByLabelText("Member"), {
      target: { value: "m1" },
    });
    fireEvent.change(within(dialog).getByLabelText("Amount (R)"), {
      target: { value: "x" },
    });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Record payment" }),
    );

    expect((await screen.findByRole("alert")).textContent).toContain("rands");
    expect(
      (within(dialog).getByLabelText("Amount (R)") as HTMLInputElement).value,
    ).toBe("x");
  });
});
