import { describe, expect, it } from "vitest";
import type { MealPlanDay } from "@camp404/types";
import {
  buildShoppingList,
  canTickShoppingList,
  shoppingKey,
  snackKey,
  sortMenu,
  type MenuEntry,
  type MenuRecipe,
} from "../kitchen-menu";

// The shopping list (#245) is worked out, not typed: for each recipe on the
// menu, the plate count Claude proofread for that meal's plates, added up by
// ingredient and unit, grouped by shop area. A count that is not there is
// "not counted yet", never guessed; food is never scaled by multiplying.

const day = (breakfast: number, dinner: number): MealPlanDay => ({
  breakfast,
  dinner,
});

const DAL: MenuRecipe = {
  title: "Camp dal",
  categories: ["legume", "produce", "spice"],
  counts: [
    {
      plates: 50,
      lines: [
        { name: "Red lentils", quantity: 2.5, quantityMax: null, unit: "kg" },
        { name: "Onions", quantity: 800, quantityMax: null, unit: "g" },
        { name: "Salt", quantity: null, quantityMax: null, unit: null },
      ],
    },
    {
      plates: 20,
      lines: [
        { name: "Red lentils", quantity: 1, quantityMax: null, unit: "kg" },
        { name: "Onions", quantity: 300, quantityMax: 400, unit: "g" },
        { name: "Salt", quantity: 10, quantityMax: null, unit: "g" },
      ],
    },
  ],
};

const SHAKSHUKA: MenuRecipe = {
  title: "Shakshuka",
  categories: ["produce", "protein", "produce"],
  counts: [
    {
      plates: 20,
      lines: [
        { name: "onions", quantity: 0.5, quantityMax: null, unit: "kg" },
        { name: "Eggs", quantity: 40, quantityMax: null, unit: null },
        { name: "Onions", quantity: 2, quantityMax: null, unit: "piece" },
      ],
    },
  ],
};

const RECIPES = { dal: DAL, shak: SHAKSHUKA };

const entry = (
  dayNo: number,
  meal: MenuEntry["meal"],
  recipeId: string,
  position = 1,
): MenuEntry => ({ day: dayNo, meal, recipeId, position });

describe("buildShoppingList", () => {
  it("adds the verified counts up by ingredient and unit, grams into kilograms", () => {
    const list = buildShoppingList({
      days: [day(20, 50), day(20, 50)],
      menu: [
        entry(1, "dinner", "dal"),
        entry(2, "dinner", "dal"),
        entry(1, "breakfast", "shak"),
      ],
      recipes: RECIPES,
    });
    expect(list.notCounted).toEqual([]);
    expect(list.meals).toBe(3);
    expect(list.groups.map((g) => g.category)).toEqual([
      "produce",
      "protein",
      "legume",
      "spice",
    ]);
    const produce = list.groups[0]!;
    // "Onions" in grams and kilograms are one line; in pieces another.
    expect(produce.lines.map((l) => [l.name, l.amount])).toEqual([
      [
        "Onions",
        { quantity: 2.1, quantityMax: null, unit: "kg", toTaste: false },
      ],
      [
        "Onions",
        { quantity: 2, quantityMax: null, unit: "piece", toTaste: false },
      ],
    ]);
    // Where it comes from, in menu order: day 1 breakfast first.
    expect(
      produce.lines[0]!.sources.map((s) => [
        s.day,
        s.meal,
        s.title,
        s.plates,
        s.amount.quantity,
        s.amount.unit,
      ]),
    ).toEqual([
      [1, "breakfast", "Shakshuka", 20, 500, "g"],
      [1, "dinner", "Camp dal", 50, 800, "g"],
      [2, "dinner", "Camp dal", 50, 800, "g"],
    ]);
    expect(list.groups[2]!.lines[0]!.amount).toMatchObject({
      quantity: 5,
      unit: "kg",
    });
    // Salt has no amount at 50 plates: "to taste".
    expect(list.groups[3]!.lines[0]!.amount).toEqual({
      quantity: null,
      quantityMax: null,
      unit: null,
      toTaste: true,
    });
  });

  it("uses the count for each meal's own plates, and keeps a range a range", () => {
    const list = buildShoppingList({
      days: [day(20, 50)],
      menu: [entry(1, "breakfast", "dal"), entry(1, "dinner", "dal")],
      recipes: RECIPES,
    });
    const onions = list.groups[0]!.lines[0]!;
    // 300–400 g at 20 plates and 800 g at 50.
    expect(onions.amount).toEqual({
      quantity: 1.1,
      quantityMax: 1.2,
      unit: "kg",
      toTaste: false,
    });
    const salt = list.groups.find((g) => g.category === "spice")!.lines[0]!;
    // 10 g at 20 plates, to taste at 50.
    expect(salt.amount).toEqual({
      quantity: 10,
      quantityMax: null,
      unit: "g",
      toTaste: true,
    });
  });

  it("lists a recipe with no count for its meal's plates as not counted, and adds nothing for it", () => {
    const list = buildShoppingList({
      days: [day(45, 50)],
      menu: [entry(1, "breakfast", "dal"), entry(1, "dinner", "dal")],
      recipes: RECIPES,
    });
    expect(list.notCounted).toEqual([
      {
        day: 1,
        meal: "breakfast",
        recipeId: "dal",
        title: "Camp dal",
        plates: 45,
      },
    ]);
    expect(list.meals).toBe(1);
    expect(
      list.groups.find((g) => g.category === "legume")!.lines[0]!.amount,
    ).toMatchObject({ quantity: 2.5, unit: "kg" });
  });

  it("leaves out a meal with no plates, a day past the plan, and a recipe it knows nothing of", () => {
    const list = buildShoppingList({
      days: [day(0, 50)],
      menu: [
        entry(1, "breakfast", "dal"),
        entry(2, "dinner", "dal"),
        entry(1, "dinner", "gone"),
      ],
      recipes: RECIPES,
    });
    expect(list).toEqual({ groups: [], notCounted: [], meals: 0 });
  });
});

describe("the list's helpers", () => {
  it("keys a line by its name in any case and its unit family", () => {
    expect(shoppingKey(" Onions ", "kg")).toBe(shoppingKey("onions", "g"));
    expect(shoppingKey("Onions", "piece")).not.toBe(shoppingKey("Onions", "g"));
    expect(shoppingKey("Milk", "l")).toBe("milk|ml");
    expect(shoppingKey("Eggs", null)).toBe("eggs|");
    expect(snackKey("abc")).toBe("snack:abc");
  });

  it("sorts the menu by day, meal and position", () => {
    expect(
      sortMenu([
        entry(2, "breakfast", "a"),
        entry(1, "dinner", "b", 2),
        entry(1, "dinner", "c", 1),
        entry(1, "breakfast", "d"),
      ]).map((e) => e.recipeId),
    ).toEqual(["d", "c", "b", "a"]);
  });

  it("lets any approved rank tick, and fails closed on anything else", () => {
    expect(canTickShoppingList("camp_member")).toBe(true);
    expect(canTickShoppingList("team_lead")).toBe(true);
    expect(canTickShoppingList("captain")).toBe(true);
    expect(canTickShoppingList("applicant")).toBe(false);
    expect(canTickShoppingList("")).toBe(false);
  });
});
