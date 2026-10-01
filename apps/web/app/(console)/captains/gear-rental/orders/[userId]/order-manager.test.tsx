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

import type { RentalLine, RentalTentAnswer } from "@camp404/db/rental";
import { toast } from "@camp404/ui/components/toast";
import {
  confirmRentalOrderAction,
  reopenRentalOrderAction,
} from "../../actions";
import { OrderManager, stillToPickText, tooSmallText } from "./order-manager";

// A captain's view of one gear order (#241). The member asked for "a tent",
// never for a catalogue tent: the captain picks which one and where it comes
// from, with a warning (not a refusal) when it sleeps fewer than it is for.
// And what Reopen says: an order with nothing to pay made no charge.

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const MATTRESS = "11111111-1111-4111-8111-111111111111";
const SMALL = "44444444-4444-4444-8444-444444444444";
const BIG = "55555555-5555-4555-8555-555555555555";
const ORDER = "22222222-2222-4222-8222-222222222222";
const LINE = "33333333-3333-4333-8333-333333333333";

const ITEMS = [
  {
    id: SMALL,
    name: "2-person tent",
    isTent: true,
    sleeps: 2,
    archived: false,
    campPriceCents: 10_000,
    campStockCount: 4,
    supplierPriceCents: 25_000,
  },
  {
    id: BIG,
    name: "4-person tent",
    isTent: true,
    sleeps: 4,
    archived: false,
    campPriceCents: null,
    campStockCount: null,
    supplierPriceCents: 70_000,
  },
  {
    id: MATTRESS,
    name: "Mattress",
    isTent: false,
    sleeps: 1,
    archived: false,
    campPriceCents: null,
    campStockCount: null,
    supplierPriceCents: 8_000,
  },
];

function line(over: Partial<RentalLine> = {}): RentalLine {
  return {
    id: LINE,
    itemId: MATTRESS,
    itemName: "Mattress",
    isTent: false,
    sleeps: 1,
    choice: "need",
    quantity: 1,
    source: null,
    unitPriceCents: null,
    tentLabel: null,
    ...over,
  };
}

function needs(people: number, over: Partial<RentalTentAnswer> = {}) {
  return {
    choice: "need" as const,
    people,
    ownDescription: null,
    ownSleeps: null,
    sharers: [{ id: "fay", name: "Fay Friend", accepted: false }],
    assigned: null,
    ...over,
  };
}

function show(order: {
  status: "submitted" | "confirmed";
  tent: RentalTentAnswer | null;
  lines?: RentalLine[];
  charged?: boolean;
  totalCents?: number | null;
  hostedBy?: string[];
}) {
  render(
    <OrderManager
      order={{
        id: ORDER,
        version: 3,
        totalCents: null,
        charged: false,
        hostedBy: [],
        lines: [],
        ...order,
      }}
      items={ITEMS}
      campLeft={{ [SMALL]: 3 }}
      duesHref="/captains/payments/members/m1"
    />,
  );
}

describe("assigning a tent", () => {
  it("shows what the member asked for, and offers the catalogue's tents", () => {
    show({ status: "submitted", tent: needs(2), lines: [line()] });
    const panel = screen.getByTestId("tent-panel");
    expect(within(panel).getByText("A tent for 2 people")).toBeTruthy();
    expect(within(panel).getByText("Fay Friend")).toBeTruthy();
    expect(within(panel).getByText("Not accepted yet")).toBeTruthy();
    const tents = within(panel).getByRole("radiogroup", { name: "Which tent" });
    expect(
      within(tents)
        .getAllByRole("radio")
        .map((r) => (r as HTMLInputElement).checked),
    ).toEqual([false, false]);
    // Nothing is picked yet, so there is no total, and it says what is
    // missing; no source to choose until there is a tent.
    expect(
      screen.getByRole("status", { name: "Order total" }).textContent,
    ).toBe("Pick their tent");
    expect(
      screen.queryByRole("radiogroup", { name: "Where the tent comes from" }),
    ).toBeNull();
  });

  it("confirms with the tent and the source the captain picked", async () => {
    vi.mocked(confirmRentalOrderAction).mockResolvedValue({
      ok: true,
      data: { totalCents: 18_000, charged: true },
    });
    show({ status: "submitted", tent: needs(2), lines: [line()] });
    // Without a tent, it says so beside the button and sends nothing.
    fireEvent.click(screen.getByRole("button", { name: /^Confirm/ }));
    expect(screen.getByRole("alert").textContent).toBe(
      "Pick the tent this member gets, and where it comes from.",
    );
    expect(confirmRentalOrderAction).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("radio", { name: /2-person tent/ }));
    const from = screen.getByRole("radiogroup", {
      name: "Where the tent comes from",
    });
    fireEvent.click(within(from).getByRole("radio", { name: /Camp stock/ }));
    expect(screen.getByText("3 left in camp stock.")).toBeTruthy();
    // The camp tent and the one mattress, which has only the supplier.
    expect(
      screen.getByRole("status", { name: "Order total" }).textContent,
    ).toMatch(/^R\s180,00$/);
    fireEvent.click(screen.getByRole("button", { name: "Confirm and charge" }));
    await waitFor(() =>
      expect(confirmRentalOrderAction).toHaveBeenCalledExactlyOnceWith({
        orderId: ORDER,
        expectedVersion: 3,
        tent: { itemId: SMALL, source: "camp" },
        sources: [{ lineId: LINE, source: "supplier" }],
      }),
    );
  });

  it("warns, and still lets the captain pick, a tent that sleeps fewer than it is for", () => {
    show({ status: "submitted", tent: needs(3) });
    expect(screen.queryByTestId("tent-too-small")).toBeNull();
    fireEvent.click(screen.getByRole("radio", { name: /2-person tent/ }));
    expect(screen.getByTestId("tent-too-small").textContent).toBe(
      tooSmallText(2, 3),
    );
    expect(
      (screen.getByRole("button", { name: /^Confirm/ }) as HTMLButtonElement)
        .disabled,
    ).toBe(false);
    // A tent that is big enough carries no warning.
    fireEvent.click(screen.getByRole("radio", { name: /4-person tent/ }));
    expect(screen.queryByTestId("tent-too-small")).toBeNull();
  });

  it("offers no tent to pick for a member with their own, or in someone else's", () => {
    show({
      status: "submitted",
      tent: {
        ...needs(1),
        choice: "own",
        people: null,
        ownDescription: "3-person dome",
        ownSleeps: 3,
      },
    });
    expect(screen.queryByRole("radiogroup", { name: "Which tent" })).toBeNull();
    expect(screen.getByTestId("tent-panel").textContent).toContain(
      "Their own tent: 3-person dome, sleeps 3.",
    );
    cleanup();
    show({
      status: "submitted",
      tent: { ...needs(1), choice: "shared", people: null, sharers: [] },
      hostedBy: ["Dee Member"],
    });
    expect(screen.queryByRole("radiogroup", { name: "Which tent" })).toBeNull();
    expect(screen.getByTestId("tent-panel").textContent).toContain(
      "In Dee Member\u2019s tent.",
    );
  });
});

function confirmed(charged: boolean) {
  show({
    status: "confirmed",
    charged,
    totalCents: charged ? 8_000 : 0,
    tent: null,
    lines: [
      charged
        ? line({ source: "supplier", unitPriceCents: 8_000 })
        : line({ choice: "own" }),
    ],
  });
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

describe("a source to pick", () => {
  const TWO = "66666666-6666-4666-8666-666666666666";
  const twoSources = {
    id: TWO,
    name: "Foam mattress",
    isTent: false,
    sleeps: 1,
    archived: false,
    campPriceCents: 4_000,
    campStockCount: 6,
    supplierPriceCents: 8_000,
  };

  it("shows an item with one source as words, not as a pressed button", () => {
    show({ status: "submitted", tent: null, lines: [line()] });
    const mattress = screen.getByRole("listitem", { name: "Mattress" });
    expect(within(mattress).queryByRole("radiogroup")).toBeNull();
    expect(within(mattress).getByTestId("only-source").textContent).toMatch(
      /^Supplier · R\s80,00 each/,
    );
    // Nothing to pick, so there is a total straight away.
    expect(
      screen.getByRole("status", { name: "Order total" }).textContent,
    ).toMatch(/^R\s80,00$/);
  });

  it("marks an item with two sources until one is picked, and says so instead of a total", () => {
    render(
      <OrderManager
        order={{
          id: ORDER,
          version: 3,
          status: "submitted",
          totalCents: null,
          charged: false,
          hostedBy: [],
          tent: null,
          lines: [
            line({ itemId: TWO, itemName: "Foam mattress", quantity: 2 }),
          ],
        }}
        items={[...ITEMS, twoSources]}
        campLeft={{ [TWO]: 6 }}
        duesHref="/captains/payments/members/m1"
      />,
    );
    const row = screen.getByRole("listitem", { name: "Foam mattress" });
    expect(row.textContent).toContain("Pick camp stock or supplier.");
    expect(
      screen.getByRole("status", { name: "Order total" }).textContent,
    ).toBe("Pick a source for 1 item");
    fireEvent.click(within(row).getByRole("radio", { name: /Camp stock/ }));
    expect(row.textContent).not.toContain("Pick camp stock or supplier.");
    expect(
      screen.getByRole("status", { name: "Order total" }).textContent,
    ).toMatch(/^R\s80,00$/);
  });

  it("names what is still to pick", () => {
    expect(stillToPickText({ tent: true, sources: 0 })).toBe("Pick their tent");
    expect(stillToPickText({ tent: true, sources: 2 })).toBe(
      "Pick their tent and a source for 2 items",
    );
    expect(stillToPickText({ tent: false, sources: 1 })).toBe(
      "Pick a source for 1 item",
    );
  });
});
