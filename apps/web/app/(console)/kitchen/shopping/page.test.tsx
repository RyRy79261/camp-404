import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ShoppingFacts } from "@camp404/db/kitchen-menu";

// The shopping list page (#245; the owner's approved mock-up,
// design/approved-ks.html, Option A, 2026-10-01): worked out from the menu;
// one checklist with every shop area on one page; a tap on a line ticks it,
// its arrow opens where its amount comes from; a recipe not verified for its
// meal's plates listed at the top, never guessed; snacks last; a filter by
// name and All / To buy / Bought; "Tick all" per area; any member ticks.

vi.mock("@/lib/captain-gate", () => ({ captainPageGate: vi.fn() }));
vi.mock("@/lib/kitchen-menu", () => ({
  getShoppingFacts: vi.fn(),
  getShoppingPricesFor: vi.fn(),
}));
vi.mock("@/lib/claims", () => ({ listBudgetTotals: vi.fn() }));
vi.mock("@/lib/payments", () => ({ ledgerCycle: vi.fn(async () => 2026) }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));
vi.mock("./actions", () => ({
  setShoppingTicksAction: vi.fn(),
  setShoppingPriceAction: vi.fn(),
}));
vi.mock("@camp404/ui/components/toast", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { toast } from "@camp404/ui/components/toast";
import { captainPageGate } from "@/lib/captain-gate";
import { listBudgetTotals } from "@/lib/claims";
import {
  getShoppingFacts,
  getShoppingPricesFor,
  type ShoppingPrice,
} from "@/lib/kitchen-menu";
import { setShoppingPriceAction, setShoppingTicksAction } from "./actions";
import ShoppingListPage from "./page";

const DAL = "00000000-0000-4000-8000-000000000001";
const line = (
  name: string,
  quantity: number | null,
  unit: "kg" | "g" | null,
) => ({ name, quantity, quantityMax: null, unit, note: null });

function facts(ticks: ShoppingFacts["ticks"] = []): ShoppingFacts {
  return {
    plan: {
      cycle: 2026,
      daysOnSite: 2,
      firstDay: "2026-04-25",
      days: [
        { breakfast: 0, dinner: 50 },
        { breakfast: 30, dinner: 50 },
      ],
      version: 1,
      updatedAt: null,
    },
    menu: {
      cycle: 2026,
      items: [
        { id: "a", day: 1, meal: "dinner", position: 1, recipeId: DAL },
        { id: "b", day: 2, meal: "dinner", position: 1, recipeId: DAL },
        { id: "c", day: 2, meal: "breakfast", position: 1, recipeId: DAL },
      ],
      recipes: {
        [DAL]: {
          recipeId: DAL,
          title: "Camp dal",
          versionId: "v1",
          categories: ["legume", "produce", "spice"],
          counts: [
            {
              plates: 50,
              lines: [
                line("Red lentils", 2.5, "kg"),
                line("Onions", 800, "g"),
                line("Salt", null, null),
              ],
            },
          ],
          openPlates: [],
          allergens: [],
          allergensMarked: false,
          allergenRevision: 0,
        },
      },
    },
    snacks: [{ id: "s1", name: "Rusks", amount: "4 boxes" }],
    ticks,
  };
}

async function renderAs(
  rank: "camp_member" | "captain" | "team_lead",
  data: ShoppingFacts = facts(),
  prices: ShoppingPrice[] | null = null,
) {
  vi.mocked(captainPageGate).mockResolvedValue({
    campUser: { id: "viewer" },
    rank,
    cleared: true,
  } as never);
  vi.mocked(getShoppingFacts).mockResolvedValue(data);
  // The server decides who gets prices (getShoppingPricesFor answers null to
  // anyone but a captain or a Kitchen lead); the page draws what it gets.
  vi.mocked(getShoppingPricesFor).mockResolvedValue(prices);
  render(await ShoppingListPage());
}

/** Text as a person reads it: formatMoney's no-break spaces as spaces. */
const read = (el: Element | null) =>
  (el?.textContent ?? "").replace(/\s/g, " ");

const PRICES: ShoppingPrice[] = [
  {
    key: "red lentils|g",
    shop: "Vlei Farm Stall",
    amountCents: 9600,
    kind: "estimate",
    version: 1,
  },
  {
    key: "onions|g",
    shop: "Tafelberg Wholesale",
    amountCents: 4950,
    kind: "paid",
    version: 2,
  },
  {
    key: "snack:s1",
    shop: null,
    amountCents: 19600,
    kind: "estimate",
    version: 1,
  },
];

const group = (name: string) => screen.getByRole("region", { name });
/** A line's tick: the line itself, named by its name and amount. */
const box = (name: string) =>
  screen.getByRole("checkbox", { name: (n) => n.split(",")[0] === name });
const isTicked = (name: string) => box(name).getAttribute("aria-checked");

afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(setShoppingTicksAction).mockResolvedValue({ ok: true });
  vi.mocked(setShoppingPriceAction).mockResolvedValue({
    ok: true,
    data: { version: 2 },
  });
  vi.mocked(listBudgetTotals).mockResolvedValue({
    kitchen: {
      budgetCents: 350000,
      spentCents: 0,
      waitingCents: 0,
      waitingCount: 0,
      leftCents: 350000,
    },
  } as never);
});

describe("shopping list page", () => {
  it("adds up the verified counts by shop area, and lists what is not counted yet at the top", async () => {
    await renderAs("camp_member");
    expect(
      screen.getByRole("heading", { level: 1, name: "Shopping list" }),
    ).toBeTruthy();
    expect(
      screen.getByText(
        "From 2 meals on the menu. Ticks are shared: everyone sees what is already bought.",
      ),
    ).toBeTruthy();

    const notCounted = screen.getByRole("region", {
      name: "Not counted yet: proofread first",
    });
    expect(notCounted.textContent).toContain("1 recipe not counted yet");
    expect(notCounted.textContent).toContain("Camp dal");
    expect(notCounted.textContent).toContain(
      "Day 2 · Sun 26 Apr, breakfast · 30 plates",
    );
    expect(
      within(notCounted).getByRole("link", { name: "Open Camp dal" }),
    ).toHaveProperty(
      "href",
      expect.stringContaining(`/kitchen/recipes/${DAL}?plates=30`),
    );

    // Shop order: Produce, Legumes, Spices, then Snacks.
    expect(
      screen
        .getAllByRole("region")
        .slice(1)
        .map((r) => r.getAttribute("aria-labelledby")),
    ).toEqual(["group-produce", "group-legume", "group-spice", "group-snacks"]);
    expect(group("Produce").textContent).toContain("0 of 1 bought");
    expect(box("Onions").textContent).toBe("Onions1.6 kg");
    expect(box("Red lentils").textContent).toBe("Red lentils5 kg");
    expect(box("Salt").textContent).toBe("SaltTo taste");
    expect(box("Rusks").textContent).toBe("Rusks4 boxes");
    // A snack has nowhere it comes from.
    expect(
      screen.queryByRole("button", { name: "Where the Rusks comes from" }),
    ).toBeNull();

    // The arrow opens where the amount comes from, each meal's amount under
    // the total.
    const arrow = screen.getByRole("button", {
      name: "Where the Onions comes from",
    });
    expect(arrow.getAttribute("aria-expanded")).toBe("false");
    expect(
      screen.queryByRole("list", { name: "Where the Onions comes from" }),
    ).toBeNull();
    fireEvent.click(arrow);
    expect(arrow.getAttribute("aria-expanded")).toBe("true");
    const from = screen.getByRole("list", {
      name: "Where the Onions comes from",
    });
    expect(
      within(from)
        .getAllByRole("listitem")
        .map((li) => li.textContent),
    ).toEqual([
      "Camp dalDay 1 · Sat 25 Apr, dinner · 50 plates800 g",
      "Camp dalDay 2 · Sun 26 Apr, dinner · 50 plates800 g",
    ]);
    // Opening it ticks nothing.
    expect(setShoppingTicksAction).not.toHaveBeenCalled();
  });

  it("shows the camp's ticks, and a tick at another amount as not bought", async () => {
    await renderAs(
      "camp_member",
      facts([
        { key: "red lentils|g", amount: "5 kg" },
        { key: "onions|g", amount: "1 kg" },
      ]),
    );
    expect(isTicked("Red lentils")).toBe("true");
    expect(isTicked("Onions")).toBe("false");
    expect(group("Produce").textContent).toContain(
      "Ticked when it was 1 kg. The list now needs 1.6 kg.",
    );
    expect(group("Legumes").textContent).toContain("1 of 1 bought");
  });

  it("lets a plain member tick a line with a tap, and a whole shop area", async () => {
    await renderAs("camp_member");
    await act(async () => {
      fireEvent.click(box("Onions"));
    });
    expect(setShoppingTicksAction).toHaveBeenCalledWith({
      lines: [{ key: "onions|g", amount: "1.6 kg" }],
      ticked: true,
    });
    expect(isTicked("Onions")).toBe("true");
    // Every line in Produce is bought: its button unticks them.
    expect(
      within(group("Produce")).getByRole("button", {
        name: "Untick all Produce",
      }).textContent,
    ).toBe("Untick all");
    const snacks = within(group("Snacks")).getByRole("button", {
      name: "Tick all Snacks",
    });
    expect(snacks.textContent).toBe("Tick all 1");
    await act(async () => {
      fireEvent.click(snacks);
    });
    expect(setShoppingTicksAction).toHaveBeenLastCalledWith({
      lines: [{ key: "snack:s1", amount: "4 boxes" }],
      ticked: true,
    });
  });

  it("shows all, what is left to buy, or what is bought", async () => {
    await renderAs(
      "camp_member",
      facts([{ key: "red lentils|g", amount: "5 kg" }]),
    );
    const show = screen.getByRole("group", { name: "Show" });
    expect(
      within(show)
        .getAllByRole("button")
        .map((b) => b.textContent),
    ).toEqual(["All4", "To buy3", "Bought1"]);
    fireEvent.click(within(show).getByRole("button", { name: /^To buy/ }));
    expect(screen.queryByRole("region", { name: "Legumes" })).toBeNull();
    expect(box("Onions")).toBeTruthy();
    fireEvent.click(within(show).getByRole("button", { name: /^Bought/ }));
    expect(
      screen.getAllByRole("checkbox").map((c) => c.getAttribute("aria-label")),
    ).toEqual(["Red lentils, 5 kg"]);
  });

  it("takes the ticks from a refreshed list, not the ones it first drew", async () => {
    vi.mocked(captainPageGate).mockResolvedValue({
      campUser: { id: "viewer" },
      rank: "camp_member",
      cleared: true,
    } as never);
    vi.mocked(getShoppingFacts).mockResolvedValue(facts());
    const { rerender } = render(await ShoppingListPage());
    await act(async () => {
      fireEvent.click(box("Onions"));
    });
    expect(isTicked("Onions")).toBe("true");

    // The menu grew: the onions were ticked at another amount, and someone
    // else ticked the lentils.
    vi.mocked(getShoppingFacts).mockResolvedValue(
      facts([
        { key: "onions|g", amount: "1 kg" },
        { key: "red lentils|g", amount: "5 kg" },
      ]),
    );
    await act(async () => {
      rerender(await ShoppingListPage());
    });
    expect(isTicked("Onions")).toBe("false");
    expect(group("Produce").textContent).toContain("Ticked when it was 1 kg");
    expect(isTicked("Red lentils")).toBe("true");
  });

  it("puts a refused tick back, with a toast", async () => {
    vi.mocked(setShoppingTicksAction).mockResolvedValue({
      ok: false,
      error: "Only approved camp members can tick the shopping list.",
    });
    await renderAs("camp_member");
    await act(async () => {
      fireEvent.click(box("Onions"));
    });
    expect(isTicked("Onions")).toBe("false");
    expect(toast.error).toHaveBeenCalledWith(
      "Only approved camp members can tick the shopping list.",
    );
  });

  it("filters the lines by name", async () => {
    await renderAs("captain");
    fireEvent.change(
      screen.getByRole("searchbox", { name: "Filter the list" }),
      {
        target: { value: "lent" },
      },
    );
    expect(screen.queryByRole("region", { name: "Produce" })).toBeNull();
    expect(group("Legumes")).toBeTruthy();
  });

  it("says there is nothing to buy when the menu is empty", async () => {
    const empty = facts();
    empty.menu = { cycle: 2026, items: [], recipes: {} };
    empty.snacks = [];
    await renderAs("camp_member", empty);
    expect(screen.getByText(/Nothing to buy yet/)).toBeTruthy();
    expect(screen.queryByRole("checkbox")).toBeNull();
  });

  describe("prices and the food cost (#245)", () => {
    it("builds a member's list with no shop, no price and no food cost", async () => {
      await renderAs("camp_member");
      const page = read(document.body);
      expect(page).not.toMatch(/No shop or price yet|Food cost|estimate|R \d/);
      expect(screen.queryByRole("region", { name: "Food cost" })).toBeNull();
      // A snack still has no arrow for a member: nothing to open.
      expect(screen.queryByRole("button", { name: /Rusks/ })).toBeNull();
      expect(listBudgetTotals).not.toHaveBeenCalled();
    });

    it("gives a Kitchen lead each line's shop and price in a grey line, and the food cost on top", async () => {
      await renderAs("team_lead", facts(), PRICES);
      const lentils = box("Red lentils").closest("li")!;
      expect(read(lentils)).toContain("Vlei Farm Stall · R 96,00 estimate");
      expect(read(box("Onions").closest("li"))).toContain(
        "Tafelberg Wholesale · R 49,50 paid",
      );
      expect(read(box("Salt").closest("li"))).toContain("No shop or price yet");

      const cost = screen.getByRole("region", { name: "Food cost" });
      const text = read(cost);
      // 96,00 + 49,50 + 196,00 = 341,50; 49,50 paid, 292,00 estimated.
      expect(text).toContain("R 341,50");
      expect(text).toContain("R 49,50 paid");
      expect(text).toContain("R 292,00 estimated");
      expect(text).toContain("R 3 500");
      // Left: 3 500 less 341,50.
      expect(text).toContain("R 3 158,50");
      // Two days, each counting its larger meal: 50 + 50 = 100 person-days.
      expect(text).toContain("R 3,42");
      expect(text).toContain("Over 100 person-days");
      expect(text).toContain("10% of the budget");
      expect(text).toContain("No price yet: Salt.");
      expect(
        within(cost).getByRole("link", { name: "Budgets" }),
      ).toHaveProperty("href", expect.stringContaining("/teams/kitchen"));
    });

    it("opens Shop, Price and This price is above Comes from, and saves a price as rand cents", async () => {
      await renderAs("captain", facts(), PRICES);
      fireEvent.click(
        screen.getByRole("button", {
          name: "Shop, price and where it comes from: Red lentils",
        }),
      );
      const price = screen.getByLabelText("Price in rands: Red lentils");
      expect((price as HTMLInputElement).value).toBe("96,00");
      expect(screen.getByLabelText("Shop: Red lentils")).toBeTruthy();
      expect(screen.getByText("Comes from")).toBeTruthy();

      fireEvent.change(price, { target: { value: "99,50" } });
      await act(async () => {
        fireEvent.blur(price);
      });
      expect(setShoppingPriceAction).toHaveBeenCalledWith({
        key: "red lentils|g",
        shop: "Vlei Farm Stall",
        amountCents: 9950,
        kind: "estimate",
        currency: "ZAR",
        expectedVersion: 1,
      });

      await act(async () => {
        fireEvent.click(
          within(
            screen.getByRole("group", { name: "This price is: Red lentils" }),
          ).getByRole("button", { name: "What we paid" }),
        );
      });
      expect(setShoppingPriceAction).toHaveBeenLastCalledWith(
        expect.objectContaining({ kind: "paid", expectedVersion: 2 }),
      );
    });

    it("says beside the boxes when a price can't be read or is refused, and sends nothing for a bad one", async () => {
      await renderAs("captain", facts(), PRICES);
      fireEvent.click(
        screen.getByRole("button", {
          name: "Shop, price and where it comes from: Red lentils",
        }),
      );
      const price = screen.getByLabelText("Price in rands: Red lentils");
      fireEvent.change(price, { target: { value: "$12" } });
      await act(async () => {
        fireEvent.blur(price);
      });
      expect(screen.getByRole("alert").textContent).toBe(
        "Type the price in rands, like 96,00.",
      );
      expect(setShoppingPriceAction).not.toHaveBeenCalled();

      vi.mocked(setShoppingPriceAction).mockResolvedValue({
        ok: false,
        error:
          "Someone changed this line first. Reload the page to see their shop and price.",
      });
      fireEvent.change(price, { target: { value: "12" } });
      await act(async () => {
        fireEvent.blur(price);
      });
      expect(screen.getByRole("alert").textContent).toContain(
        "Someone changed this line first",
      );
    });

    it("lets a lead price a snack, which comes from no recipe", async () => {
      await renderAs("captain", facts(), PRICES);
      fireEvent.click(
        screen.getByRole("button", {
          name: "Shop, price and where it comes from: Rusks",
        }),
      );
      expect(
        screen.getByText(
          "A snack: it is on the list as it is, not from a recipe.",
        ),
      ).toBeTruthy();
      expect(
        (screen.getByLabelText("Price in rands: Rusks") as HTMLInputElement)
          .value,
      ).toBe("196,00");
    });
  });
});
