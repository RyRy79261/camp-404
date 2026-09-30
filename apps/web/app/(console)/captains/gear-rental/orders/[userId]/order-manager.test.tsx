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
vi.mock("../../actions", () => ({
  confirmRentalOrderAction: vi.fn(),
  reopenRentalOrderAction: vi.fn(async () => ({ ok: true })),
  setTentLabelAction: vi.fn(),
}));
vi.mock("@camp404/ui/components/toast", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import type { RentalLine } from "@camp404/db/rental";
import { toast } from "@camp404/ui/components/toast";
import { reopenRentalOrderAction } from "../../actions";
import { OrderManager } from "./order-manager";

// A captain's view of one confirmed gear order (#241): what Reopen says. An
// order with nothing to pay made no charge, so reopening it must not say a
// charge came off the member's dues.

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const ITEM = "11111111-1111-4111-8111-111111111111";
const ORDER = "22222222-2222-4222-8222-222222222222";

function line(over: Partial<RentalLine>): RentalLine {
  return {
    id: "33333333-3333-4333-8333-333333333333",
    itemId: ITEM,
    itemName: "Mattress",
    isTent: false,
    sleeps: 1,
    choice: "need",
    quantity: 1,
    source: "supplier",
    unitPriceCents: 8_000,
    tentLabel: null,
    sharers: [],
    ...over,
  };
}

function confirmed(charged: boolean) {
  render(
    <OrderManager
      order={{
        id: ORDER,
        version: 3,
        status: "confirmed",
        totalCents: charged ? 8_000 : 0,
        charged,
        lines: [
          charged
            ? line({})
            : line({ choice: "own", source: null, unitPriceCents: null }),
        ],
      }}
      items={[
        {
          id: ITEM,
          campPriceCents: null,
          campStockCount: null,
          supplierPriceCents: 8_000,
        },
      ]}
      campLeft={{}}
      duesHref="/captains/payments/members/m1"
    />,
  );
}

async function reopen() {
  fireEvent.click(screen.getByRole("button", { name: "Reopen" }));
  const dialog = await screen.findByRole("dialog");
  fireEvent.click(within(dialog).getByRole("button", { name: "Reopen" }));
  await waitFor(() => expect(reopenRentalOrderAction).toHaveBeenCalled());
  await waitFor(() => expect(toast.success).toHaveBeenCalled());
  return dialog;
}

describe("reopening a confirmed order", () => {
  it("says the charge came off the dues when the order had one", async () => {
    confirmed(true);
    expect(screen.getByTestId("order-on-dues").textContent).toContain(
      "On their dues.",
    );
    await reopen();
    expect(reopenRentalOrderAction).toHaveBeenCalledExactlyOnceWith({
      orderId: ORDER,
      expectedVersion: 3,
    });
    expect(toast.success).toHaveBeenCalledExactlyOnceWith(
      "Reopened. The charge is off their dues.",
    );
    expect(refresh).toHaveBeenCalled();
  });

  it("names no charge when the order had nothing to pay", async () => {
    confirmed(false);
    expect(screen.getByTestId("order-on-dues").textContent).toBe(
      "Nothing on their dues for this order.",
    );
    await reopen();
    expect(toast.success).toHaveBeenCalledExactlyOnceWith("Reopened.");
  });

  it("shows the write's refusal beside the button, and no success", async () => {
    vi.mocked(reopenRentalOrderAction).mockResolvedValueOnce({
      ok: false,
      error: "This order changed since you opened it. Reload the page.",
    });
    confirmed(true);
    fireEvent.click(screen.getByRole("button", { name: "Reopen" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Reopen" }));
    expect((await screen.findByRole("alert")).textContent).toBe(
      "This order changed since you opened it. Reload the page.",
    );
    expect(toast.success).not.toHaveBeenCalled();
  });
});
