import { describe, expect, it } from "vitest";
import { shoppingKey, type DietaryCounts } from "@camp404/core";
import type { MealPlanDay } from "@camp404/types";
import type {
  MealChecks,
  MenuDietary,
  ShoppingFacts,
} from "@/lib/kitchen-menu";
import { kitchenGlance } from "@/lib/team-glance/kitchen";

// The Kitchen's panel: the menu's meals with a recipe, the review count, the
// shopping list's ticks and, for an editor only, the meals that need an
// allergy plan. Counts and days, never a member.

const NOW = new Date("2027-03-01T10:00:00Z");

const day = (breakfast: number, dinner: number): MealPlanDay => ({
  breakfast,
  dinner,
});

const recipe = (id: string, allergens: string[] = []) => ({
  recipeId: id,
  title: id,
  versionId: `${id}-v1`,
  categories: ["legume" as const],
  counts: [
    {
      plates: 20,
      lines: [
        { name: "Red lentils", quantity: 1, quantityMax: null, unit: "kg" },
      ],
    },
  ],
  openPlates: [],
  allergens: allergens.map((a) => ({ allergen: a, from: [] })),
  allergensMarked: true,
  allergenRevision: 0,
});

function facts(over: Partial<ShoppingFacts> = {}): ShoppingFacts {
  return {
    plan: {
      cycle: 2027,
      daysOnSite: 2,
      firstDay: null,
      days: [day(20, 20), day(0, 20)],
      version: 1,
      updatedAt: null,
    },
    menu: {
      cycle: 2027,
      items: [
        { id: "m1", day: 1, meal: "breakfast", position: 1, recipeId: "dal" },
        { id: "m2", day: 1, meal: "dinner", position: 1, recipeId: "nuts" },
      ],
      recipes: { dal: recipe("dal"), nuts: recipe("nuts", ["peanuts"]) },
    },
    snacks: [{ id: "s1", name: "Chips", amount: "4 bags" }],
    ticks: [],
    ...over,
  } as ShoppingFacts;
}

const NO_CHECKS: MealChecks = { plans: [], prepSteps: [] };

const counts = (anaphylactic: number): DietaryCounts => ({
  members: 10,
  allergies: [
    { food: "peanuts", label: "Peanuts", count: 1, anaphylactic } as never,
  ],
  intolerances: [],
  preferences: [],
});
const dietary = (anaphylactic: number): MenuDietary => ({
  counts: counts(anaphylactic),
  oldOnly: 0,
});

const tile = (g: ReturnType<typeof kitchenGlance>, key: string) =>
  g.tiles.find((t) => t.key === key);

describe("kitchenGlance", () => {
  it("counts the meals with plates that have a recipe, and names the empty ones", () => {
    const g = kitchenGlance({
      now: NOW,
      facts: facts(),
      reviewWaiting: 0,
      canReview: true,
      allergy: null,
    });
    // Day 2 has no breakfast plates, so it is not a meal; Day 2 dinner is empty.
    expect(tile(g, "meals")?.value).toBe("2 of 3");
    expect(g.attention.map((a) => a.text)).toContain(
      "Day 2 dinner has no recipe yet.",
    );
  });

  it("counts ticks only at the amount the line has now", () => {
    const g = kitchenGlance({
      now: NOW,
      facts: facts({
        ticks: [
          // Red lentils: 1 kg from each of the two meals = 2 kg.
          { key: shoppingKey("Red lentils", "kg"), amount: "1 kg" },
          { key: "snack:s1", amount: "4 bags" },
        ],
      }),
      reviewWaiting: 0,
      canReview: true,
      allergy: null,
    });
    // The lentils were ticked at an older amount: only the snack counts.
    expect(tile(g, "shopping")?.value).toBe("1 of 2");
  });

  it("shows the allergy plans only to an editor, and counts a meal with no plan", () => {
    const member = kitchenGlance({
      now: NOW,
      facts: facts(),
      reviewWaiting: 2,
      canReview: true,
      allergy: null,
    });
    expect(tile(member, "allergy")).toBeUndefined();
    expect(member.note).toMatch(/Kitchen leads and captains/);
    expect(member.attention.some((a) => a.tone === "bad")).toBe(false);

    const lead = kitchenGlance({
      now: NOW,
      facts: facts(),
      reviewWaiting: 2,
      canReview: true,
      allergy: { dietary: dietary(1), plans: NO_CHECKS.plans },
    });
    expect(tile(lead, "allergy")?.value).toBe("1 missing");
    expect(lead.attention[0]?.text).toBe(
      "Day 1 dinner: no allergy plan for an anaphylactic member.",
    );
    expect(lead.note).toBeUndefined();
  });

  it("is all set when the plan covers the allergen, or nobody is anaphylactic", () => {
    const covered = kitchenGlance({
      now: NOW,
      facts: facts(),
      reviewWaiting: 0,
      canReview: true,
      allergy: {
        dietary: dietary(1),
        plans: [
          {
            menuItemId: "m2",
            kind: "substitution" as never,
            details: "Sunflower seeds",
            allergens: ["peanuts" as never],
            version: 1,
          },
        ],
      },
    });
    expect(tile(covered, "allergy")?.value).toBe("All set");
    const mild = kitchenGlance({
      now: NOW,
      facts: facts(),
      reviewWaiting: 0,
      canReview: true,
      allergy: { dietary: dietary(0), plans: [] },
    });
    expect(tile(mild, "allergy")?.value).toBe("All set");
  });

  it("says plainly when nothing is set up yet", () => {
    const g = kitchenGlance({
      now: NOW,
      facts: facts({
        plan: {
          cycle: 2027,
          daysOnSite: 11,
          firstDay: null,
          days: Array.from({ length: 11 }, () => day(0, 0)),
          version: 0,
          updatedAt: null,
        },
        menu: { cycle: 2027, items: [], recipes: {} },
        snacks: [],
      }),
      reviewWaiting: 0,
      canReview: true,
      allergy: null,
    });
    expect(tile(g, "meals")?.value).toBe("—");
    expect(tile(g, "shopping")?.value).toBe("—");
    expect(tile(g, "review")?.hint).toBe("Nothing waiting");
    expect(g.attention).toEqual([]);
  });
});

describe("kitchenGlance review fixes", () => {
  it("gives the Review link to a reviewer only; the count is for everyone", () => {
    const base = { now: NOW, facts: facts(), reviewWaiting: 2, allergy: null };
    const reviewer = kitchenGlance({ ...base, canReview: true });
    const member = kitchenGlance({ ...base, canReview: false });
    const line = (g: ReturnType<typeof kitchenGlance>) =>
      g.attention.find((a) => a.key === "review");
    expect(line(reviewer)?.link?.label).toBe("Review");
    expect(line(member)?.text).toBe("2 recipes are waiting for review.");
    expect(line(member)?.link).toBeUndefined();
  });

  it("asks no allergy plan for a meal whose plates went to 0", () => {
    const g = (dinnerPlates: number) =>
      kitchenGlance({
        now: NOW,
        facts: facts({
          plan: {
            cycle: 2027,
            daysOnSite: 2,
            firstDay: null,
            days: [day(20, dinnerPlates), day(0, 20)],
            version: 1,
            updatedAt: null,
          },
        }),
        reviewWaiting: 0,
        canReview: true,
        allergy: { dietary: dietary(1), plans: NO_CHECKS.plans },
      });
    // The peanut dinner on Day 1 needs a plan while it has plates...
    expect(tile(g(20), "allergy")?.value).toBe("1 missing");
    // ...and none once nobody eats it.
    expect(tile(g(0), "allergy")?.value).toBe("All set");
  });
});
