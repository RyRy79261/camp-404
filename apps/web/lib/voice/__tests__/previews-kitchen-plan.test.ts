// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

vi.mock("../../meal-plan", () => ({ getMealPlan: vi.fn() }));
vi.mock("../../kitchen-menu", () => ({
  getKitchenMenu: vi.fn(),
  getMealChecks: vi.fn(),
  getSnacks: vi.fn(),
  listMenuBook: vi.fn(),
}));
vi.mock("../../mcp/tools/kitchen-plan", () => ({
  readShoppingLines: vi.fn(),
}));

import {
  getKitchenMenu,
  getMealChecks,
  getSnacks,
  listMenuBook,
} from "../../kitchen-menu";
import { getMealPlan } from "../../meal-plan";
import { readShoppingLines } from "../../mcp/tools/kitchen-plan";
import type { McpScope } from "../../mcp/scope";
import { KITCHEN_PLAN_PREVIEWS as P } from "../previews-kitchen-plan";

// The meal plan's and the shopping list's voice previews: the row comes from
// the real plan, menu item or line, never from Claude's words, and the
// compare-and-set value Do runs with is what the preview read.

const SCOPE: McpScope = {
  campUserId: "11111111-1111-4111-8111-111111111111",
  rank: "member",
  viewerRank: "team_lead",
  leadTeams: ["kitchen"],
  memberTeams: ["kitchen"],
  isDriver: false,
  isCaptain: false,
};
const ctx = { scope: SCOPE, now: new Date("2026-04-01T10:00:00Z") };

const ITEM = "22222222-2222-4222-8222-222222222222";
const RECIPE = "33333333-3333-4333-8333-333333333333";
const VERSION = "44444444-4444-4444-8444-444444444444";

function seed() {
  vi.mocked(getMealPlan).mockResolvedValue({
    cycle: 2026,
    daysOnSite: 2,
    firstDay: "2026-04-22",
    days: [
      { breakfast: 20, dinner: 0 },
      { breakfast: 0, dinner: 30 },
    ],
    version: 4,
    updatedAt: null,
  });
  vi.mocked(getKitchenMenu).mockResolvedValue({
    cycle: 2026,
    items: [
      { id: ITEM, day: 1, meal: "breakfast", position: 1, recipeId: RECIPE },
    ],
    recipes: {
      [RECIPE]: {
        recipeId: RECIPE,
        title: "Oats",
        versionId: VERSION,
        categories: [],
        counts: [],
        openPlates: [],
        allergens: [{ allergen: "gluten" }],
        allergensMarked: true,
        allergenRevision: 2,
      },
    },
  } as never);
  vi.mocked(getMealChecks).mockResolvedValue({ plans: [], prepSteps: [] });
  vi.mocked(getSnacks).mockResolvedValue([]);
  vi.mocked(listMenuBook).mockResolvedValue([
    {
      id: RECIPE,
      title: "Oats",
      summary: null,
      totalMinutes: null,
      readyPlates: [20],
      openPlates: [],
    },
  ]);
}

describe("meal plan previews", () => {
  it("names each day's change and runs on the version it read", async () => {
    seed();
    const p = await P.set_meal_plan_plates!(
      { expectedVersion: 1, days: [{ day: 2, breakfast: 12 }] },
      ctx,
    );
    expect(p.args.expectedVersion).toBe(4);
    expect(p.change).toEqual(["Day 2 · Thu 23 Apr breakfast: 0 → 12 plates"]);
    expect(p.blocked).toBeUndefined();
    const off = await P.set_meal_plan_plates!(
      { expectedVersion: 4, days: [{ day: 9, dinner: 1 }] },
      ctx,
    );
    expect(off.blocked).toBe(
      "Day 9 isn't on the meal plan: it has 2 days on site.",
    );
  });

  it("names the recipe and meal from the book, and stops one already there or off the book", async () => {
    seed();
    const there = await P.add_menu_item!(
      { day: 1, meal: "breakfast", recipeId: RECIPE },
      ctx,
    );
    expect(there.sentence).toBe("Put “Oats” on Day 1 · Wed 22 Apr breakfast");
    expect(there.blocked).toBe("That recipe is already on this meal.");
    const noPlates = await P.add_menu_item!(
      { day: 1, meal: "dinner", recipeId: RECIPE },
      ctx,
    );
    expect(noPlates.blocked).toBeTruthy();
    const fine = await P.add_menu_item!(
      { day: 2, meal: "dinner", recipeId: RECIPE },
      ctx,
    );
    expect(fine.blocked).toBeUndefined();
    expect(fine.facts).toContain("30 plates");
    const unknown = await P.add_menu_item!(
      { day: 2, meal: "dinner", recipeId: VERSION },
      ctx,
    );
    expect(unknown.blocked).toBe("That recipe isn't in the recipe book.");
  });

  it("stops taking off a recipe that has a prep step", async () => {
    seed();
    vi.mocked(getMealChecks).mockResolvedValue({
      plans: [],
      prepSteps: [
        {
          id: VERSION,
          menuItemId: ITEM,
          what: "Soak",
          timing: "day_before",
          dueDate: "2026-04-21",
          onBoard: false,
        },
      ],
    });
    const p = await P.remove_menu_item!({ itemId: ITEM }, ctx);
    expect(p.sentence).toBe("Take “Oats” off Day 1 · Wed 22 Apr breakfast");
    expect(p.blocked).toMatch(/prep steps or an allergy plan/);
  });

  it("fills the allergy plan's version and the correction's revision from what it read", async () => {
    seed();
    vi.mocked(getMealChecks).mockResolvedValue({
      plans: [
        {
          menuItemId: ITEM,
          kind: "portion",
          details: "Separate pot",
          allergens: ["gluten"],
          version: 3,
        },
      ],
      prepSteps: [],
    });
    const plan = await P.record_allergen_plan!(
      {
        itemId: ITEM,
        kind: "substitution",
        details: "GF oats",
        allergens: ["gluten"],
        expectedVersion: 0,
      },
      ctx,
    );
    expect(plan.args.expectedVersion).toBe(3);
    expect(plan.sentence).toMatch(/^Replace the allergy plan for “Oats”/);
    expect(plan.change).toEqual(["Plan: “GF oats”", "Covers: Gluten"]);
    const fix = await P.correct_recipe_allergens!(
      { recipeId: RECIPE, allergens: [], expectedRevision: 0 },
      ctx,
    );
    expect(fix.args).toMatchObject({
      versionId: VERSION,
      expectedRevision: 2,
    });
  });
});

describe("shopping previews", () => {
  it("ticks at the amounts on the list now, and stops a line that is not there", async () => {
    vi.mocked(readShoppingLines).mockResolvedValue([
      {
        key: "oats|kg",
        area: "Grains",
        name: "Oats",
        amount: "2 kg",
        ticked: false,
        tickedAtOtherAmount: null,
      },
    ]);
    const p = await P.set_shopping_ticks!(
      { lines: [{ key: "oats|kg", amount: "9 kg" }], ticked: true },
      ctx,
    );
    expect(p.args.lines).toEqual([{ key: "oats|kg", amount: "2 kg" }]);
    expect(p.facts).toContain("Oats 2 kg");
    const gone = await P.set_shopping_ticks!(
      { lines: [{ key: "salt|g", amount: "1 g" }], ticked: true },
      ctx,
    );
    expect(gone.blocked).toBe("That line isn't on the shopping list now.");
  });

  it("fills the price's version, and stops someone the list gives no prices", async () => {
    vi.mocked(readShoppingLines).mockResolvedValue([
      {
        key: "oats|kg",
        area: "Grains",
        name: "Oats",
        amount: "2 kg",
        ticked: false,
        tickedAtOtherAmount: null,
        price: { shop: null, priceCents: null, kind: "estimate", version: 5 },
      },
    ]);
    const p = await P.set_shopping_price!(
      {
        key: "oats|kg",
        shop: "Makro",
        amountCents: 9600,
        kind: "estimate",
        expectedVersion: 0,
      },
      ctx,
    );
    expect(p.args.expectedVersion).toBe(5);
    expect(p.sentence).toMatch(/^Set “Oats” \(2 kg\) to R\s?96[.,]00 at Makro/);
    vi.mocked(readShoppingLines).mockResolvedValue([
      {
        key: "oats|kg",
        area: "Grains",
        name: "Oats",
        amount: "2 kg",
        ticked: false,
        tickedAtOtherAmount: null,
      },
    ]);
    const member = await P.set_shopping_price!({ key: "oats|kg" }, ctx);
    expect(member.blocked).toBe(
      "Only a Kitchen lead or a captain can set shops and prices.",
    );
  });
});
