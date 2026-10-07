import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { KitchenRecipe } from "@camp404/types";

// The recipe book print (#249, Option A of design/print-recipe-book.html):
// the contents (the menu by day and meal, each dish with its page), then a
// page per recipe at each plate count it is cooked for, with a "Contains:"
// line. Every member prints it, as every member reads the book.

vi.mock("@/lib/captain-gate", () => ({ captainPageGate: vi.fn() }));
vi.mock("@/lib/camp-config", () => ({ getCurrentCycle: vi.fn() }));
vi.mock("@/lib/kitchen-menu", () => ({ getKitchenMenu: vi.fn() }));
vi.mock("@/lib/meal-plan", () => ({ getMealPlan: vi.fn() }));
vi.mock("@/lib/recipes", () => ({
  getAcceptedVersion: vi.fn(),
  getPlateCount: vi.fn(),
}));

import { captainPageGate } from "@/lib/captain-gate";
import { getCurrentCycle } from "@/lib/camp-config";
import { getKitchenMenu } from "@/lib/kitchen-menu";
import { getMealPlan } from "@/lib/meal-plan";
import { PRINT_SHEET_ATTR } from "@/lib/print";
import { getAcceptedVersion, getPlateCount } from "@/lib/recipes";
import RecipeBookPrintPage from "./page";

const recipe = (title: string, lines: [string, number][]) =>
  KitchenRecipe.parse({
    title,
    summary: `${title}, the camp's way.`,
    plates: 60,
    totalTimeMinutes: 55,
    ingredients: lines.map(([name, quantity]) => ({
      name,
      category: "produce",
      quantity,
      unit: "kg",
    })),
    steps: [{ instruction: `Cook the ${title}.`, uses: lines.map(([n]) => n) }],
  });

const facts = (
  title: string,
  plates: number[],
  allergens: string[],
  marked = true,
) => ({
  title,
  versionId: `v-${title}`,
  categories: [],
  counts: plates.map((p) => ({ plates: p, lines: [] })),
  openPlates: [],
  allergens: allergens.map((allergen) => ({ allergen, from: [] })),
  allergensMarked: marked,
  allergenRevision: 0,
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(captainPageGate).mockResolvedValue({
    campUser: { id: "member" },
    rank: "camp_member",
    cleared: true,
  } as never);
  vi.mocked(getCurrentCycle).mockResolvedValue({ year: 2027 } as never);
  vi.mocked(getMealPlan).mockResolvedValue({
    cycle: 2027,
    daysOnSite: 2,
    firstDay: "2027-04-22",
    days: [
      { breakfast: 60, dinner: 55 },
      { breakfast: 60, dinner: 50 },
    ],
    version: 1,
    updatedAt: null,
  });
  vi.mocked(getKitchenMenu).mockResolvedValue({
    cycle: 2027,
    items: [
      { id: "1", day: 1, meal: "breakfast", position: 0, recipeId: "shak" },
      { id: "2", day: 1, meal: "dinner", position: 0, recipeId: "dal" },
      { id: "3", day: 2, meal: "breakfast", position: 0, recipeId: "shak" },
      { id: "4", day: 2, meal: "dinner", position: 0, recipeId: "dal" },
      { id: "5", day: 2, meal: "dinner", position: 1, recipeId: "salad" },
    ],
    recipes: {
      shak: facts("Shakshuka", [60], ["eggs", "milk", "nightshades"]),
      dal: facts("Camp dal", [55, 50], [], true),
      salad: facts("Green salad", [20], [], false),
    },
  } as never);
  vi.mocked(getAcceptedVersion).mockImplementation(
    async (id) =>
      ({
        id: `v-${id}`,
        version: id === "shak" ? 3 : 1,
        plates: 60,
        recipe:
          id === "shak"
            ? recipe("Shakshuka", [["Tomatoes", 2.5]])
            : recipe("Camp dal", [["Red lentils", 1.8]]),
      }) as never,
  );
  vi.mocked(getPlateCount).mockImplementation(async (_v, plates) => ({
    plates,
    lines: [
      {
        name: "x",
        quantity: plates / 10,
        quantityMax: null,
        unit: "kg",
        note: null,
      },
    ],
    pots: plates > 55 ? 2 : null,
    notes: [],
    report: null,
    source: "proofread",
  }));
});

afterEach(cleanup);

describe("the recipe book print", () => {
  it("lets any member print it, in the print shell", async () => {
    const { container } = render(await RecipeBookPrintPage());
    expect(captainPageGate).toHaveBeenCalledWith("camp_member");
    expect(container.querySelector(`[${PRINT_SHEET_ATTR}]`)).toBeTruthy();
  });

  it("opens with the contents: the menu by day, each dish with its page", async () => {
    render(await RecipeBookPrintPage());
    const contents = screen.getByRole("region", { name: "Contents" });
    expect(contents.textContent).toContain(
      "AfrikaBurn 2027 · 2 days, Thu 22 Apr to Fri 23 Apr · breakfast and dinner · 3 recipe pages",
    );
    expect(
      within(contents)
        .getAllByTestId("contents-page")
        .map((p) => p.textContent?.trim()),
    ).toEqual(["p. 2", "p. 3", "p. 2", "p. 4", ""]);
    expect(within(contents).getByTestId("contents-missing").textContent).toBe(
      "Green salad · 50 plates: no checked recipe yet, not in the book",
    );
    expect(contents.textContent).toContain("page 1 of 4");
  });

  it("prints a page per recipe and plate count, with its meals, amounts and Contains line", async () => {
    render(await RecipeBookPrintPage());
    const shak = screen.getByRole("region", { name: "Shakshuka, 60 plates" });
    expect(shak.textContent).toContain(
      "For 60 plates · Version 3 · Total 55 min · 2 pots · Day 1 and Day 2 breakfast",
    );
    expect(within(shak).getByTestId("contains").textContent).toBe(
      "Contains: Eggs · Milk · Nightshades",
    );
    expect(within(shak).getByTestId("card-line").textContent).toContain("6 kg");
    expect(shak.textContent).toContain("page 2 of 4");

    const dal55 = screen.getByRole("region", { name: "Camp dal, 55 plates" });
    expect(dal55.textContent).toContain("Day 1 dinner");
    expect(within(dal55).getByTestId("card-line").textContent).toContain(
      "5.5 kg",
    );
    // Marked, and nothing in it: said so, not left blank.
    expect(within(dal55).getByTestId("contains").textContent).toBe(
      "Contains: none of the allergens the Kitchen checks for.",
    );
    const dal50 = screen.getByRole("region", { name: "Camp dal, 50 plates" });
    expect(dal50.textContent).toContain("page 4 of 4");
    expect(getPlateCount).toHaveBeenCalledWith("v-dal", 50);
    // Each recipe's accepted version is read once.
    expect(getAcceptedVersion).toHaveBeenCalledTimes(2);
  });

  it("says when the menu is empty", async () => {
    vi.mocked(getKitchenMenu).mockResolvedValue({
      cycle: 2027,
      items: [],
      recipes: {},
    } as never);
    render(await RecipeBookPrintPage());
    expect(screen.getByText(/Nothing is on the menu yet/)).toBeTruthy();
    expect(getAcceptedVersion).not.toHaveBeenCalled();
  });
});
