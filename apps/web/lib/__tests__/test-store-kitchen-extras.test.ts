import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  NOT_A_MEAL_CHECKER,
  PLAN_CHANGED,
  PREP_STEP_GONE,
} from "@camp404/db/kitchen-meals";
import {
  NOT_A_PRICE_KEEPER,
  PRICE_CHANGED,
  PRICE_RANDS_ONLY,
} from "@camp404/db/kitchen-prices";
import { DAY_ONE_NEEDED_FOR_PREP } from "@camp404/types";
import { testStore } from "../test-store";
import { dailySheetTestStore } from "../test-store-daily-sheet";
import { dietaryTestStore } from "../test-store-dietary";
import { kitchenExtrasTestStore as x } from "../test-store-kitchen-extras";
import {
  storeAddMenuItem,
  storeKitchenMenu,
  storeRemoveMenuItem,
} from "../test-store-kitchen-menu";

// The E2E twins of Kitchen #245 (prices, the dietary pick-list and counts,
// plans, corrections and prep steps). Playwright drives the screens through
// them, so they keep the real rules in the same words
// (packages/db/src/__tests__/kitchen-245.test.ts).

function user(name: string, approved = true) {
  return testStore.createUser({
    authUserId: `auth-${name}`,
    displayName: name,
    inviteCode: "seeded",
    rank: "member",
    approvalStatus: approved ? "approved" : "pending",
  });
}

function lead(name: string, team: "kitchen" | "power_and_lighting") {
  const u = user(name);
  testStore.assignTeam({ userId: u.id, team });
  testStore.setLead({ userId: u.id, team, isLead: true });
  return u;
}

/** A Kitchen lead, a plan from 22 Apr, and Overnight oats on Day 2 breakfast. */
function setUp() {
  const cook = lead("Cook", "kitchen");
  testStore.setMealPlan({
    actorId: cook.id,
    daysOnSite: 2,
    firstDay: "2027-04-22",
    days: [
      { breakfast: 0, dinner: 40 },
      { breakfast: 60, dinner: 40 },
    ],
    expectedVersion: 0,
  });
  const ids = testStore.seedKitchenBook({
    authorId: cook.id,
    recipes: [
      {
        title: "Overnight oats",
        plates: [60],
        ingredients: [
          {
            name: "Peanut butter",
            category: "other",
            quantity: 1,
            unit: "kg",
            allergens: ["peanuts"],
          },
        ],
      },
    ],
  });
  const recipeId = ids["Overnight oats"]!;
  const added = storeAddMenuItem({
    actorId: cook.id,
    day: 2,
    meal: "breakfast",
    recipeId,
  });
  if (!added.ok) throw new Error(added.error);
  return { cook, recipeId, itemId: added.itemId };
}

beforeEach(() => testStore.reset());

describe("price twins", () => {
  it("let a Kitchen lead price a line, compare-and-set, and send no member a price", () => {
    const { cook } = setUp();
    const member = user("Member");
    const price = (
      actorId: string,
      expectedVersion: number,
      currency = "ZAR",
    ) =>
      x.setShoppingPrice({
        actorId,
        key: "peanut butter|g",
        shop: "Vlei",
        amountCents: 9600,
        kind: "estimate",
        currency,
        expectedVersion,
      });
    expect(price(member.id, 0)).toEqual({
      ok: false,
      error: NOT_A_PRICE_KEEPER,
    });
    expect(price(cook.id, 0, "USD")).toEqual({
      ok: false,
      error: PRICE_RANDS_ONLY,
    });
    expect(price(cook.id, 0)).toEqual({ ok: true, version: 1 });
    expect(price(cook.id, 0)).toEqual({ ok: false, error: PRICE_CHANGED });
    expect(x.getShoppingPricesFor(cook.id)).toEqual([
      {
        key: "peanut butter|g",
        shop: "Vlei",
        amountCents: 9600,
        kind: "estimate",
        version: 1,
      },
    ]);
    expect(x.getShoppingPricesFor(member.id)).toBeNull();
  });
});

describe("dietary twins", () => {
  it("save a member's pick-list, keep the old words, and count only the members coming", () => {
    const { cook } = setUp();
    const thandi = user("Thandi");
    testStore.seedParticipation({ userId: thandi.id, status: "accepted" });
    dailySheetTestStore.seedAllergy(thandi.id, {
      allergies: "peanuts",
      isAnaphylactic: true,
    });
    expect(dietaryTestStore.getMyDietary(thandi.id).old).toEqual({
      allergies: "peanuts",
      isAnaphylactic: true,
      notes: null,
    });
    expect(dietaryTestStore.getMenuDietaryFor(cook.id)?.oldOnly).toBe(1);
    dietaryTestStore.saveMyDietary({
      userId: thandi.id,
      foods: [{ food: "peanuts", reaction: "anaphylaxis" }],
      diets: ["vegan"],
    });
    const box = dietaryTestStore.getMenuDietaryFor(cook.id)!;
    expect(box.oldOnly).toBe(0);
    expect(box.counts.allergies).toEqual([
      { food: "peanuts", label: "Peanuts", count: 1, anaphylactic: 1 },
    ]);
    expect(JSON.stringify(box)).not.toContain("Thandi");
    expect(dietaryTestStore.getMenuDietaryFor(thandi.id)).toBeNull();
    expect(
      dailySheetTestStore.listSheetAllergies(testStore.currentCycleNumber()),
    ).toEqual([
      expect.objectContaining({
        foods: [{ food: "peanuts", reaction: "anaphylaxis" }],
      }),
    ]);
    expect(
      dietaryTestStore.saveMyDietary({ userId: "nobody", foods: [], diets: [] })
        .ok,
    ).toBe(false);
  });
});

describe("meal twins", () => {
  it("read Claude's marks, and let a Kitchen lead correct them and record a plan", () => {
    const { cook, recipeId, itemId } = setUp();
    const recipe = storeKitchenMenu().recipes[recipeId]!;
    expect(recipe.allergens).toEqual([
      { allergen: "peanuts", from: ["Peanut butter"] },
    ]);
    const powerLead = lead("Sparky", "power_and_lighting");
    expect(
      x.recordAllergenPlan({
        actorId: powerLead.id,
        itemId,
        kind: "portion",
        details: "x",
        allergens: ["peanuts"],
        expectedVersion: 0,
      }),
    ).toEqual({ ok: false, error: NOT_A_MEAL_CHECKER });
    const plan = (expectedVersion: number) =>
      x.recordAllergenPlan({
        actorId: cook.id,
        itemId,
        kind: "portion",
        details: "One bowl first.",
        allergens: ["peanuts"],
        expectedVersion,
      });
    expect(plan(0)).toEqual({ ok: true, version: 1 });
    expect(plan(0)).toEqual({ ok: false, error: PLAN_CHANGED });
    expect(x.getMealChecks().plans).toHaveLength(1);

    expect(
      x.correctRecipeAllergens({
        actorId: cook.id,
        recipeId,
        versionId: recipe.versionId!,
        allergens: ["sesame"],
        expectedRevision: 0,
      }),
    ).toEqual({ ok: true, revision: 1 });
    expect(storeKitchenMenu().recipes[recipeId]!.allergens).toEqual([
      { allergen: "sesame", from: [] },
    ]);
  });

  it("put a step before we leave on the board, one on site on the sheet, and take tasks off with the step or the recipe", () => {
    const { cook, itemId } = setUp();
    const before = x.addPrepStep({
      actorId: cook.id,
      itemId,
      what: "Toast the oats",
      when: "before_leaving",
      date: "2027-04-20",
    });
    expect(before).toMatchObject({
      ok: true,
      onBoard: true,
      due: "2027-04-20",
    });
    const onSite = x.addPrepStep({
      actorId: cook.id,
      itemId,
      what: "Soak the oats",
      when: "day_before",
      date: null,
    });
    expect(onSite).toMatchObject({
      ok: true,
      onBoard: false,
      due: "2027-04-22",
    });
    const board = () =>
      testStore
        .listBoardTasks(new Date("2027-04-01"))
        .filter((t) => t.team === "kitchen");
    expect(board().map((t) => [t.title, t.description])).toEqual([
      ["Overnight oats ×60: toast the oats", "For Day 2 breakfast, Fri 23 Apr"],
    ]);
    expect(x.listSheetPrepSteps(testStore.currentCycleNumber())).toHaveLength(
      2,
    );

    if (!before.ok) throw new Error();
    expect(
      x.removePrepStep({ actorId: cook.id, stepId: before.stepId }),
    ).toEqual({ ok: true });
    expect(board()).toEqual([]);
    expect(
      x.removePrepStep({ actorId: cook.id, stepId: before.stepId }),
    ).toEqual({
      ok: false,
      error: PREP_STEP_GONE,
    });

    x.addPrepStep({
      actorId: cook.id,
      itemId,
      what: "Buy milk",
      when: "before_leaving",
      date: "2027-04-21",
    });
    expect(board()).toHaveLength(1);
    expect(storeRemoveMenuItem({ actorId: cook.id, itemId })).toEqual({
      ok: true,
    });
    expect(board()).toEqual([]);
    expect(x.getMealChecks().prepSteps).toEqual([]);
  });

  it("move the prep steps and their tasks when Day 1 moves", () => {
    const { cook, itemId } = setUp();
    x.addPrepStep({
      actorId: cook.id,
      itemId,
      what: "Toast the oats",
      when: "before_leaving",
      date: "2027-04-20",
    });
    x.addPrepStep({
      actorId: cook.id,
      itemId,
      what: "Soak",
      when: "same_day",
      date: null,
    });
    testStore.setMealPlan({
      actorId: cook.id,
      daysOnSite: 2,
      firstDay: "2027-04-24",
      days: [
        { breakfast: 0, dinner: 40 },
        { breakfast: 60, dinner: 40 },
      ],
      expectedVersion: 1,
    });
    expect(x.getMealChecks().prepSteps.map((s) => s.dueDate)).toEqual([
      "2027-04-22",
      "2027-04-25",
    ]);
    const [task] = testStore
      .listBoardTasks(new Date("2027-04-01"))
      .filter((t) => t.team === "kitchen");
    expect(task!.dueAt).toEqual(new Date("2027-04-22T00:00:00+02:00"));
    expect(task!.description).toBe("For Day 2 breakfast, Sun 25 Apr");
  });

  it("refuse to clear Day 1 while there are prep steps, as the database does", () => {
    const { cook, itemId } = setUp();
    x.addPrepStep({
      actorId: cook.id,
      itemId,
      what: "Soak",
      when: "same_day",
      date: null,
    });
    expect(
      testStore.setMealPlan({
        actorId: cook.id,
        daysOnSite: 2,
        firstDay: null,
        days: [
          { breakfast: 0, dinner: 40 },
          { breakfast: 60, dinner: 40 },
        ],
        expectedVersion: 1,
      }),
    ).toEqual({ ok: false, error: DAY_ONE_NEEDED_FOR_PREP });
    expect(testStore.getMealPlan(testStore.currentCycleNumber()).firstDay).toBe(
      "2027-04-22",
    );
  });
});
