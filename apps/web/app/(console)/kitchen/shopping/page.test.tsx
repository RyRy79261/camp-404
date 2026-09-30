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

// The shopping list page (#245, the owner's layout A, 2026-09-30): worked
// out from the menu; one list grouped by shop area; each line with its
// amount and where it comes from; a recipe not verified for its meal's
// plates listed at the top, never guessed; snacks last; any member ticks.

vi.mock("@/lib/captain-gate", () => ({ captainPageGate: vi.fn() }));
vi.mock("@/lib/kitchen-menu", () => ({ getShoppingFacts: vi.fn() }));
vi.mock("./actions", () => ({ setShoppingTicksAction: vi.fn() }));
vi.mock("@camp404/ui/components/toast", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { toast } from "@camp404/ui/components/toast";
import { captainPageGate } from "@/lib/captain-gate";
import { getShoppingFacts } from "@/lib/kitchen-menu";
import { setShoppingTicksAction } from "./actions";
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
        { breakfast: 0, lunch: 0, dinner: 50 },
        { breakfast: 30, lunch: 0, dinner: 50 },
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
        },
      },
    },
    snacks: [{ id: "s1", name: "Rusks", amount: "4 boxes" }],
    ticks,
  };
}

async function renderAs(
  rank: "camp_member" | "captain",
  data: ShoppingFacts = facts(),
) {
  vi.mocked(captainPageGate).mockResolvedValue({
    campUser: { id: "viewer" },
    rank,
    cleared: true,
  } as never);
  vi.mocked(getShoppingFacts).mockResolvedValue(data);
  render(await ShoppingListPage());
}

const group = (name: string) => screen.getByRole("region", { name });

afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(setShoppingTicksAction).mockResolvedValue({ ok: true });
});

describe("shopping list page", () => {
  it("adds up the verified counts by shop area, and lists what is not counted yet at the top", async () => {
    await renderAs("camp_member");
    expect(
      screen.getByRole("heading", { level: 1, name: "Shopping list" }),
    ).toBeTruthy();
    expect(screen.getByText("From 2 meals on the menu.")).toBeTruthy();

    const notCounted = screen.getByRole("region", {
      name: "Not counted yet: proofread first",
    });
    expect(notCounted.textContent).toContain("Camp dal");
    expect(notCounted.textContent).toContain(
      "Day 2 · Sun 26 Apr, breakfast · 30 plates",
    );

    // Shop order: Produce, Legumes, Spices, then Snacks.
    expect(
      screen
        .getAllByRole("heading", { level: 2 })
        .map((h) => h.textContent)
        .slice(1),
    ).toEqual(["Produce", "Legumes", "Spices", "Snacks"]);
    expect(group("Produce").textContent).toContain("Onions1.6 kg");
    expect(group("Produce").textContent).toContain(
      "Day 1 dinner, Day 2 dinner",
    );
    expect(group("Legumes").textContent).toContain("Red lentils5 kg");
    expect(group("Spices").textContent).toContain("SaltTo taste");
    expect(group("Snacks").textContent).toContain("Rusks4 boxes");

    // The line opens to where its amount comes from.
    const from = screen.getByRole("list", {
      name: "Where the Onions comes from",
    });
    expect(
      within(from)
        .getAllByRole("listitem")
        .map((li) => li.textContent),
    ).toEqual([
      "Day 1 · Sat 25 Apr, dinner·Camp dalfor 50 plates: 800 g",
      "Day 2 · Sun 26 Apr, dinner·Camp dalfor 50 plates: 800 g",
    ]);
  });

  it("shows the camp's ticks, and a tick at another amount as not bought", async () => {
    await renderAs(
      "camp_member",
      facts([
        { key: "red lentils|g", amount: "5 kg" },
        { key: "onions|g", amount: "1 kg" },
      ]),
    );
    expect(
      screen.getByRole("checkbox", { name: "Red lentils" }).dataset.state,
    ).toBe("checked");
    expect(screen.getByRole("checkbox", { name: "Onions" }).dataset.state).toBe(
      "unchecked",
    );
    expect(group("Produce").textContent).toContain("Ticked when it was 1 kg");
  });

  it("lets a plain member tick a line and a whole shop area", async () => {
    await renderAs("camp_member");
    await act(async () => {
      fireEvent.click(screen.getByRole("checkbox", { name: "Onions" }));
    });
    expect(setShoppingTicksAction).toHaveBeenCalledWith({
      lines: [{ key: "onions|g", amount: "1.6 kg" }],
      ticked: true,
    });
    expect(screen.getByRole("checkbox", { name: "Onions" }).dataset.state).toBe(
      "checked",
    );
    await act(async () => {
      fireEvent.click(
        screen.getByRole("checkbox", { name: "Tick all Snacks" }),
      );
    });
    expect(setShoppingTicksAction).toHaveBeenLastCalledWith({
      lines: [{ key: "snack:s1", amount: "4 boxes" }],
      ticked: true,
    });
  });

  it("puts a refused tick back, with a toast", async () => {
    vi.mocked(setShoppingTicksAction).mockResolvedValue({
      ok: false,
      error: "Only approved camp members can tick the shopping list.",
    });
    await renderAs("camp_member");
    await act(async () => {
      fireEvent.click(screen.getByRole("checkbox", { name: "Onions" }));
    });
    expect(screen.getByRole("checkbox", { name: "Onions" }).dataset.state).toBe(
      "unchecked",
    );
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
});
