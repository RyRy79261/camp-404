import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { canPriceShoppingList, KITCHEN_TEAM } from "@camp404/core";

// The shopping list print (#249, Option A of design/print-shopping.html):
// every member prints it; a captain or a Kitchen lead gets it by shop with
// prices and totals, anyone else by shop area with no shop and no price.
// The reads are stand-ins, but who gets prices is the real rule
// (canPriceShoppingList), as the database applies it: break the rule and the
// member's sheet test goes red.

vi.mock("@/lib/captain-gate", () => ({ captainPageGate: vi.fn() }));
vi.mock("@/lib/kitchen-menu", () => ({
  getShoppingFacts: vi.fn(),
  getShoppingPricesFor: vi.fn(),
}));

import { captainPageGate } from "@/lib/captain-gate";
import { getShoppingFacts, getShoppingPricesFor } from "@/lib/kitchen-menu";
import { PRINT_SHEET_ATTR } from "@/lib/print";
import { shoppingFacts, shoppingPrices } from "@/lib/__tests__/print-fixtures";
import ShoppingListPrintPage from "./page";

/** Who each viewer is: their rank and the teams they lead. */
const VIEWERS: Record<string, { rank: string; led: string[] }> = {
  member: { rank: "camp_member", led: [] },
  kitchenLead: { rank: "team_lead", led: [KITCHEN_TEAM] },
  powerLead: { rank: "team_lead", led: ["power_and_lighting"] },
  captain: { rank: "captain", led: [] },
};

function as(viewer: keyof typeof VIEWERS) {
  vi.mocked(captainPageGate).mockResolvedValue({
    campUser: { id: viewer },
    rank: VIEWERS[viewer]!.rank,
    cleared: true,
  } as never);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getShoppingFacts).mockResolvedValue(shoppingFacts());
  // getShoppingPricesFor's rule, over the stand-in prices.
  vi.mocked(getShoppingPricesFor).mockImplementation(async (viewerId) => {
    const v = VIEWERS[viewerId];
    return v && canPriceShoppingList(v.rank, v.led) ? shoppingPrices() : null;
  });
});

afterEach(cleanup);

async function open() {
  return render(await ShoppingListPrintPage());
}

describe("the shopping list print", () => {
  it("lets any member print it, in the print shell", async () => {
    as("member");
    const { container } = await open();
    expect(captainPageGate).toHaveBeenCalledWith("camp_member");
    expect(container.querySelector(`[${PRINT_SHEET_ATTR}]`)).toBeTruthy();
    expect(getShoppingPricesFor).toHaveBeenCalledWith("member");
  });

  it("gives a member the list by shop area with no shop, no price and no total", async () => {
    as("member");
    const { container } = await open();
    const text = container.textContent ?? "";
    expect(
      screen
        .getAllByTestId("area-block")
        .map((b) => b.getAttribute("aria-label")),
    ).toEqual(["Produce", "Legumes", "Spices", "Snacks"]);
    expect(text).not.toMatch(/R\s?\d/);
    expect(text).not.toContain("Vlei Farm Stall");
    expect(text).not.toContain("Tafelberg");
    expect(text).not.toContain("Shop total");
    expect(text).not.toContain("prices");
    expect(screen.queryByTestId("all-shops-total")).toBeNull();
    expect(screen.queryAllByTestId("shop-block")).toHaveLength(0);
  });

  it("gives a lead of another team the member's sheet too", async () => {
    as("powerLead");
    const { container } = await open();
    expect(container.textContent).not.toMatch(/R\s?\d/);
    expect(screen.queryAllByTestId("shop-block")).toHaveLength(0);
  });

  it.each(["kitchenLead", "captain"] as const)(
    "gives a %s the list by shop, each shop with its total, and the total of all shops",
    async (viewer) => {
      as(viewer);
      await open();
      const blocks = screen.getAllByTestId("shop-block");
      expect(blocks.map((b) => b.getAttribute("aria-label"))).toEqual([
        "Tafelberg Wholesale",
        "Vlei Farm Stall",
        "No shop yet",
      ]);
      const tafelberg = within(blocks[0]!);
      expect(tafelberg.getByText("Red lentils")).toBeTruthy();
      expect(tafelberg.getByText("Rusks")).toBeTruthy();
      expect(blocks[0]!.textContent).toMatch(/Shop total\s*R\s311,50/);
      expect(blocks[1]!.textContent).toMatch(/Shop total\s*R\s96,00/);
      // A shop with no price says no total.
      expect(blocks[2]!.textContent).not.toContain("Shop total");
      expect(screen.getByTestId("all-shops-total").textContent).toMatch(
        /To spend, all shops \(estimate\)\s*R\s407,50/,
      );
      expect(screen.getByText(/this sheet shows prices/)).toBeTruthy();
    },
  );

  it("leaves off what is bought and names what it cannot count", async () => {
    as("captain");
    const { container } = await open();
    expect(container.textContent).toContain(
      "From 2 meals on the menu · 4 lines still to buy · 1 already bought is left off",
    );
    expect(container.textContent).not.toContain("Eggs");
    expect(screen.getByTestId("not-counted").textContent).toContain(
      "Not on this list: Green salad (Day 2 · Fri 23 Apr, dinner, 50 plates).",
    );
  });

  it("says when there is nothing to buy", async () => {
    as("member");
    const facts = shoppingFacts();
    vi.mocked(getShoppingFacts).mockResolvedValue({
      ...facts,
      menu: { ...facts.menu, items: [] },
      snacks: [],
    });
    await open();
    expect(screen.getByText(/Nothing to buy yet/)).toBeTruthy();
  });
});
