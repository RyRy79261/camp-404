import { describe, expect, it } from "vitest";
import {
  BOOK_FIRST_RECIPE_PAGE,
  prepPlan,
  recipeBook,
  servedText,
  shoppingByShop,
  type PlanPrepStep,
} from "../kitchen-prints";
import type { MenuEntry } from "../kitchen-menu";

// The Kitchen's prints (#249, Option A of each in design/prints-round.html,
// owner 2026-10-02): the shopping list grouped by shop with shop totals, the
// recipe book's contents and page numbers, and the prep plan's order.

describe("shoppingByShop", () => {
  const line = (
    name: string,
    shop: string | null,
    amountCents: number | null,
  ) => ({
    name,
    shop,
    amountCents,
  });

  it("groups by shop, the busiest first, with each shop's total and the total of all", () => {
    const sheet = shoppingByShop([
      line("Tomatoes", "Vlei Farm Stall", 9600),
      line("Eggs", "Tafelberg Wholesale", 26600),
      line("Feta", "Tafelberg Wholesale", 19800),
      line("Lemons", null, null),
      line("Red peppers", "Vlei Farm Stall", 8500),
      line("Rusks", "Tafelberg Wholesale", 19600),
      line("Biltong", "Karoo Biltong Co.", 76000),
    ]);
    expect(
      sheet.shops.map((s) => [s.shop, s.lines.length, s.totalCents]),
    ).toEqual([
      ["Tafelberg Wholesale", 3, 66000],
      ["Vlei Farm Stall", 2, 18100],
      ["Karoo Biltong Co.", 1, 76000],
      [null, 1, 0],
    ]);
    expect(sheet.totalCents).toBe(66000 + 18100 + 76000);
    // Lines keep the order they came in (the list's shop-area order).
    expect(sheet.shops[0]!.lines.map((l) => l.name)).toEqual([
      "Eggs",
      "Feta",
      "Rusks",
    ]);
  });

  it("matches a shop whatever its case or spacing, and keeps the name first typed", () => {
    const sheet = shoppingByShop([
      line("Eggs", "Tafelberg  Wholesale", 100),
      line("Feta", " tafelberg wholesale ", 250),
      line("Salt", "  ", null),
    ]);
    expect(sheet.shops).toHaveLength(2);
    expect(sheet.shops[0]).toMatchObject({
      shop: "Tafelberg Wholesale",
      totalCents: 350,
    });
    expect(sheet.shops[1]).toMatchObject({ shop: null });
  });

  it("puts lines with no shop last, and still counts a price they carry", () => {
    const sheet = shoppingByShop([
      line("Salt", null, 1999),
      line("Pepper", null, null),
      line("Oil", "Spar", 5299),
    ]);
    expect(sheet.shops.map((s) => s.shop)).toEqual(["Spar", null]);
    expect(sheet.shops[1]!.totalCents).toBe(1999);
    expect(sheet.totalCents).toBe(7298);
  });

  it("orders shops with as many lines by name, and is empty for no lines", () => {
    const sheet = shoppingByShop([
      line("A", "Woolworths", 1),
      line("B", "Checkers", 2),
    ]);
    expect(sheet.shops.map((s) => s.shop)).toEqual(["Checkers", "Woolworths"]);
    expect(shoppingByShop([])).toEqual({ shops: [], totalCents: 0 });
  });
});

describe("recipeBook", () => {
  const days = [
    { breakfast: 0, dinner: 48 },
    { breakfast: 60, dinner: 55 },
    { breakfast: 60, dinner: 50 },
    { breakfast: 0, dinner: 40 },
  ];
  const entry = (
    day: number,
    meal: "breakfast" | "dinner",
    recipeId: string,
    position = 0,
  ): MenuEntry => ({ day, meal, recipeId, position });
  const recipes = {
    potjie: { title: "Potjiekos", plates: [48] },
    shak: { title: "Shakshuka", plates: [60] },
    dal: { title: "Camp dal", plates: [50, 55] },
    rice: { title: "Jeera rice", plates: [55, 50] },
    salad: { title: "Green salad", plates: [] },
  };

  const book = recipeBook({
    days,
    menu: [
      entry(3, "dinner", "dal", 0),
      entry(1, "dinner", "potjie", 0),
      entry(2, "breakfast", "shak", 0),
      entry(2, "dinner", "dal", 0),
      entry(2, "dinner", "rice", 1),
      entry(3, "breakfast", "shak", 0),
      entry(3, "dinner", "rice", 1),
      entry(4, "dinner", "salad", 0),
      // No plates at Day 1 breakfast: not on the menu.
      entry(1, "breakfast", "shak", 0),
      // A day past the plan: left out.
      entry(9, "dinner", "potjie", 0),
    ],
    recipes,
  });

  it("numbers one page per recipe and plate count, a recipe's counts together", () => {
    expect(BOOK_FIRST_RECIPE_PAGE).toBe(2);
    expect(book.pages.map((p) => [p.page, p.title, p.plates])).toEqual([
      [2, "Potjiekos", 48],
      [3, "Shakshuka", 60],
      [4, "Camp dal", 55],
      [5, "Camp dal", 50],
      [6, "Jeera rice", 55],
      [7, "Jeera rice", 50],
    ]);
    expect(book.pageCount).toBe(7);
  });

  it("gives a dish cooked twice at the same count one page, naming both meals", () => {
    const shak = book.pages.find((p) => p.recipeId === "shak")!;
    expect(shak.meals).toEqual([
      { day: 2, meal: "breakfast" },
      { day: 3, meal: "breakfast" },
    ]);
  });

  it("lists the menu by day and meal with each dish's page, and a dish with no checked count with none", () => {
    expect(
      book.contents.map((d) => ({
        day: d.day,
        meals: d.meals.map((m) => [
          m.meal,
          m.entries.map((e) => `${e.title}@${e.plates}:${e.page ?? "-"}`),
        ]),
      })),
    ).toEqual([
      { day: 1, meals: [["dinner", ["Potjiekos@48:2"]]] },
      {
        day: 2,
        meals: [
          ["breakfast", ["Shakshuka@60:3"]],
          ["dinner", ["Camp dal@55:4", "Jeera rice@55:6"]],
        ],
      },
      {
        day: 3,
        meals: [
          ["breakfast", ["Shakshuka@60:3"]],
          ["dinner", ["Camp dal@50:5", "Jeera rice@50:7"]],
        ],
      },
      { day: 4, meals: [["dinner", ["Green salad@40:-"]]] },
    ]);
  });

  it("is only a contents page for an empty menu", () => {
    expect(recipeBook({ days, menu: [], recipes })).toEqual({
      contents: [],
      pages: [],
      pageCount: 1,
    });
  });
});

describe("servedText", () => {
  it("names the meals a page is cooked for, a kind of meal together", () => {
    expect(servedText([{ day: 2, meal: "breakfast" }])).toBe("Day 2 breakfast");
    expect(
      servedText([
        { day: 2, meal: "breakfast" },
        { day: 6, meal: "breakfast" },
      ]),
    ).toBe("Day 2 and Day 6 breakfast");
    expect(
      servedText([
        { day: 1, meal: "dinner" },
        { day: 3, meal: "breakfast" },
        { day: 4, meal: "dinner" },
        { day: 8, meal: "dinner" },
      ]),
    ).toBe("Day 1, Day 4 and Day 8 dinner and Day 3 breakfast");
    expect(servedText([])).toBe("");
  });
});

describe("prepPlan", () => {
  const FIRST = "2027-04-22";
  const step = (
    dueDate: string,
    what: string,
    day: number,
    meal: "breakfast" | "dinner",
  ): PlanPrepStep => ({ dueDate, what, recipeTitle: "Dish", day, meal });

  it("puts before-we-leave steps by date, then every day on site in order", () => {
    const plan = prepPlan({
      firstDay: FIRST,
      daysOnSite: 3,
      steps: [
        step("2027-04-23", "Soak the oats", 3, "breakfast"),
        step("2027-04-20", "Weigh the pancake mix", 5, "breakfast"),
        step("2027-04-17", "Chop onions", 1, "dinner"),
        step("2027-04-23", "Move the chilli base", 3, "dinner"),
        step("2027-04-22", "Take the onions out", 1, "dinner"),
        step("2027-04-17", "Mix the spice blend", 5, "dinner"),
        step("2027-04-23", "Rinse the lentils", 2, "dinner"),
      ],
    });
    expect(
      plan.before.map((d) => [d.date, d.steps.map((s) => s.what)]),
    ).toEqual([
      ["2027-04-17", ["Chop onions", "Mix the spice blend"]],
      ["2027-04-20", ["Weigh the pancake mix"]],
    ]);
    expect(
      plan.onSite.map((d) => [d.day, d.date, d.steps.map((s) => s.what)]),
    ).toEqual([
      [1, "2027-04-22", ["Take the onions out"]],
      // The meal it is for orders the day: Day 2 dinner, then Day 3 breakfast, then dinner.
      [
        2,
        "2027-04-23",
        ["Rinse the lentils", "Soak the oats", "Move the chilli base"],
      ],
      [3, "2027-04-24", []],
    ]);
    expect([plan.beforeCount, plan.onSiteCount]).toEqual([3, 4]);
  });

  it("keeps steps for the same meal in the order they came", () => {
    const plan = prepPlan({
      firstDay: FIRST,
      daysOnSite: 1,
      steps: [
        step(FIRST, "First", 1, "dinner"),
        step(FIRST, "Second", 1, "dinner"),
      ],
    });
    expect(plan.onSite[0]!.steps.map((s) => s.what)).toEqual([
      "First",
      "Second",
    ]);
  });

  it("puts a step due after the last day on the last day, so none is lost", () => {
    const plan = prepPlan({
      firstDay: FIRST,
      daysOnSite: 2,
      steps: [step("2027-04-30", "Late", 2, "dinner")],
    });
    expect(plan.onSite[1]!.steps.map((s) => s.what)).toEqual(["Late"]);
    expect(plan.onSiteCount).toBe(1);
  });

  it("lists every step by date when Day 1 has no date", () => {
    const plan = prepPlan({
      firstDay: null,
      daysOnSite: 11,
      steps: [
        step("2027-04-23", "B", 2, "dinner"),
        step("2027-04-20", "A", 1, "dinner"),
      ],
    });
    expect(plan.onSite).toEqual([]);
    expect(plan.before.map((d) => d.date)).toEqual([
      "2027-04-20",
      "2027-04-23",
    ]);
    expect(plan.beforeCount).toBe(2);
  });
});
