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
import { PaymentsManager } from "./payments-manager";

// The ledger screen: the year's count and its rand totals, recording a
// payment, and moving one between statuses (going back to pending asks first).
// Money text carries no-break spaces from Intl, so it is matched with \s.

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
    createdAt: new Date("2027-03-01T10:00:00Z"),
    ...over,
  };
}

const MEMBERS = [
  { id: "m1", name: "Nova", duesPaid: false },
  { id: "m2", name: "Ash", duesPaid: true },
];

describe("PaymentsManager", () => {
  it("counts who has paid for the year", () => {
    render(
      <PaymentsManager yearLabel="2027" members={MEMBERS} payments={[]} />,
    );
    const [count, money, ...rest] = screen.getAllByRole("status");
    expect(count!.textContent).toBe("1 of 2 members have paid for 2027.");
    expect(money!.textContent).toMatch(/^Received: R\s0,00$/);
    // Nothing promised, so no Pending line.
    expect(rest).toHaveLength(0);
    expect(screen.getByText("No payments recorded yet.")).toBeTruthy();
  });

  it("totals the rands received and pending", () => {
    render(
      <PaymentsManager
        yearLabel="2027"
        members={MEMBERS}
        payments={[
          payment({ id: "a", amountCents: 1234, status: "reconciled" }),
          payment({ id: "b", amountCents: 1000, status: "reconciled" }),
          payment({ id: "c", amountCents: 700 }),
          // Waived settles dues but brings in no money.
          payment({ id: "e", amountCents: 9900, status: "waived" }),
        ]}
      />,
    );
    const lines = screen
      .getAllByRole("status")
      .map((el) => el.textContent ?? "");
    expect(lines.find((l) => l.startsWith("Received:"))).toMatch(
      /^Received: R\s22,34$/,
    );
    expect(lines.find((l) => l.startsWith("Pending:"))).toMatch(
      /^Pending: R\s7,00$/,
    );
  });

  it("offers no currency to pick: every amount is in rands", () => {
    render(
      <PaymentsManager yearLabel="2027" members={MEMBERS} payments={[]} />,
    );
    expect(screen.queryByLabelText("Currency")).toBeNull();
    expect(screen.getByLabelText("Amount (R)")).toBeTruthy();
  });

  it("records a payment with what the captain typed", async () => {
    vi.mocked(recordPaymentAction).mockResolvedValue({
      ok: true,
      reference: "C404-M017-2027-1",
    });
    render(
      <PaymentsManager yearLabel="2027" members={MEMBERS} payments={[]} />,
    );

    fireEvent.change(screen.getByLabelText("Member"), {
      target: { value: "m1" },
    });
    fireEvent.change(screen.getByLabelText("Amount (R)"), {
      target: { value: "1250" },
    });
    fireEvent.change(screen.getByLabelText("Note (optional)"), {
      target: { value: "FNB" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Record payment" }));

    await waitFor(() =>
      expect(recordPaymentAction).toHaveBeenCalledWith({
        userId: "m1",
        amount: "1250",
        status: "reconciled",
        note: "FNB",
      }),
    );
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it("shows the refusal and keeps the form when recording fails", async () => {
    vi.mocked(recordPaymentAction).mockResolvedValue({
      ok: false,
      error: "Type the amount in rands, like 1250 or 1250,50.",
    });
    render(
      <PaymentsManager yearLabel="2027" members={MEMBERS} payments={[]} />,
    );
    fireEvent.change(screen.getByLabelText("Member"), {
      target: { value: "m1" },
    });
    fireEvent.change(screen.getByLabelText("Amount (R)"), {
      target: { value: "x" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Record payment" }));

    expect((await screen.findByRole("alert")).textContent).toContain("rands");
    expect(
      (screen.getByLabelText("Amount (R)") as HTMLInputElement).value,
    ).toBe("x");
  });

  it("marks a pending payment received", async () => {
    render(
      <PaymentsManager
        yearLabel="2027"
        members={MEMBERS}
        payments={[payment()]}
      />,
    );
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

  it("spins only the tapped button and holds every other write", async () => {
    let land!: (value: { ok: true }) => void;
    vi.mocked(setPaymentStatusAction).mockReturnValueOnce(
      new Promise((resolve) => {
        land = resolve;
      }) as never,
    );
    render(
      <PaymentsManager
        yearLabel="2027"
        members={MEMBERS}
        payments={[payment()]}
      />,
    );
    const received = screen.getAllByRole("button", {
      name: "Mark received",
    })[0]!;
    fireEvent.click(received);

    await waitFor(() =>
      expect(received.querySelector(".animate-spin")).not.toBeNull(),
    );
    const waive = screen.getAllByRole("button", { name: "Waive" })[0]!;
    expect(waive.querySelector(".animate-spin")).toBeNull();
    expect(waive).toHaveProperty("disabled", true);
    const recordButton = screen.getByRole("button", { name: "Record payment" });
    expect(recordButton.querySelector(".animate-spin")).toBeNull();

    land({ ok: true });
    await waitFor(() => expect(waive).toHaveProperty("disabled", false));
  });

  it("asks before putting a received payment back to pending", async () => {
    render(
      <PaymentsManager
        yearLabel="2027"
        members={MEMBERS}
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
