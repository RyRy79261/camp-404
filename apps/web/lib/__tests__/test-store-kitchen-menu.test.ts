import { beforeEach, describe, expect, it, vi } from "vitest";

// test-store.ts is server-only; neutralize the import guard under vitest.
vi.mock("server-only", () => ({}));

import {
  MENU_DAY_NOT_ON_PLAN,
  MENU_MEAL_HAS_NO_PLATES,
  MENU_RECIPE_NOT_IN_BOOK,
  NOT_A_MENU_EDITOR,
  NOT_A_SNACK_KEEPER,
  NOT_A_TICKER,
  SNACK_GONE,
} from "@camp404/db/kitchen-menu";
import { testStore } from "../test-store";
import {
  storeAddMenuItem,
  storeAddSnack,
  storeRemoveSnack,
  storeSetShoppingTicks,
  storeShoppingFacts,
  storeSnacks,
} from "../test-store-kitchen-menu";

// The E2E twins of the Kitchen's menu, snacks and ticks. Playwright drives
// the menu and the shopping list through them, so they keep the real rules
// in the same words (packages/db/src/__tests__/kitchen-menu.test.ts): only a
// captain or a Kitchen lead edits the menu and the snacks; any approved
// member ticks, for the whole camp.

const RECIPE = "00000000-0000-4000-8000-000000000001";

function user(name: string, approved = true) {
  return testStore.createUser({
    authUserId: `auth-${name}`,
    displayName: name,
    inviteCode: "seeded",
    rank: "member",
    approvalStatus: approved ? "approved" : "pending",
  });
}

function lead(name: string, team: "kitchen" | "structures") {
  const u = user(name);
  testStore.assignTeam({ userId: u.id, team });
  testStore.setLead({ userId: u.id, team, isLead: true });
  return u;
}

beforeEach(() => testStore.reset());

describe("kitchen menu twins", () => {
  it("refuse a lead of another team and a member on the menu and the snacks", () => {
    for (const actor of [lead("struct", "structures"), user("member")]) {
      expect(
        storeAddMenuItem({
          actorId: actor.id,
          day: 1,
          meal: "dinner",
          recipeId: RECIPE,
        }),
      ).toEqual({ ok: false, error: NOT_A_MENU_EDITOR });
      expect(
        storeAddSnack({ actorId: actor.id, name: "Rusks", amount: null }),
      ).toEqual({ ok: false, error: NOT_A_SNACK_KEEPER });
    }
    expect(storeSnacks()).toEqual([]);
  });

  it("refuse a day off the plan, a meal with no plates, and a recipe not in the book", () => {
    const cook = lead("cook", "kitchen");
    // One day on site: one day of Build in Logistics.
    const captain = testStore.createUser({
      authUserId: "auth-captain",
      displayName: "Captain",
      inviteCode: "seeded",
      rank: "captain",
      approvalStatus: "approved",
    });
    expect(
      testStore.setLogisticsPhase({
        actorId: captain.id,
        phase: "build",
        startDate: "2027-04-22",
        endDate: "2027-04-22",
        place: null,
        note: null,
        expectedVersion: 0,
        newEventId: "evbuild",
      }),
    ).toMatchObject({ ok: true });
    expect(
      testStore.setMealPlan({
        actorId: cook.id,
        firstDay: "2027-04-22",
        days: [{ breakfast: 0, dinner: 20 }],
        expectedVersion: 0,
      }),
    ).toEqual({ ok: true, version: 1 });
    const add = (day: number, meal: "breakfast" | "dinner") =>
      storeAddMenuItem({ actorId: cook.id, day, meal, recipeId: RECIPE });
    expect(add(2, "dinner")).toEqual({
      ok: false,
      error: MENU_DAY_NOT_ON_PLAN,
    });
    expect(add(1, "breakfast")).toEqual({
      ok: false,
      error: MENU_MEAL_HAS_NO_PLATES,
    });
    expect(add(1, "dinner")).toEqual({
      ok: false,
      error: MENU_RECIPE_NOT_IN_BOOK,
    });
  });

  it("keep a Kitchen lead's snacks, and say so when one is already gone", () => {
    const cook = lead("cook", "kitchen");
    const added = storeAddSnack({
      actorId: cook.id,
      name: " Rusks ",
      amount: " ",
    });
    if (!added.ok) throw new Error(added.error);
    expect(storeSnacks()).toEqual([
      { id: added.snackId, name: "Rusks", amount: null },
    ]);
    expect(
      storeRemoveSnack({ actorId: cook.id, snackId: added.snackId }),
    ).toEqual({ ok: true });
    expect(
      storeRemoveSnack({ actorId: cook.id, snackId: added.snackId }),
    ).toEqual({ ok: false, error: SNACK_GONE });
  });

  it("let any approved member tick for the camp, and refuse an applicant", () => {
    const line = { key: "onions|g", amount: "3.5 kg" };
    expect(
      storeSetShoppingTicks({
        actorId: user("applicant", false).id,
        lines: [line],
        ticked: true,
      }),
    ).toEqual({ ok: false, error: NOT_A_TICKER });
    const member = user("member");
    expect(
      storeSetShoppingTicks({
        actorId: member.id,
        lines: [line],
        ticked: true,
      }),
    ).toEqual({ ok: true });
    expect(storeShoppingFacts().ticks).toEqual([line]);
    expect(
      storeSetShoppingTicks({
        actorId: lead("struct", "structures").id,
        lines: [line],
        ticked: false,
      }),
    ).toEqual({ ok: true });
    expect(storeShoppingFacts().ticks).toEqual([]);
  });

  it("list the book for the picker by name, with where each recipe's counts stand (the twin of listMenuBook)", () => {
    const cook = lead("cook", "kitchen");
    const ids = testStore.seedKitchenBook({
      authorId: cook.id,
      recipes: [
        {
          title: "Rice",
          plates: [50],
          ingredients: [
            { name: "Rice", category: "grain", quantity: 4, unit: "kg" },
          ],
        },
        {
          title: "Camp dal",
          summary: "Red lentils",
          totalMinutes: 70,
          plates: [50, 30],
          open: [40],
          ingredients: [
            {
              name: "Red lentils",
              category: "legume",
              quantity: 5,
              unit: "kg",
            },
          ],
        },
      ],
    });
    expect(testStore.menuBook()).toEqual([
      {
        id: ids["Camp dal"],
        title: "Camp dal",
        summary: "Red lentils",
        totalMinutes: 70,
        readyPlates: [30, 50],
        openPlates: [40],
      },
      {
        id: ids["Rice"],
        title: "Rice",
        summary: null,
        totalMinutes: null,
        readyPlates: [50],
        openPlates: [],
      },
    ]);
    // A seeded recipe is in the book: it can go on the menu.
    // No Logistics days: the plan's 11 undated days.
    testStore.setMealPlan({
      actorId: cook.id,
      firstDay: null,
      days: [
        { breakfast: 0, dinner: 30 },
        ...Array.from({ length: 10 }, () => ({ breakfast: 0, dinner: 0 })),
      ],
      expectedVersion: 0,
    });
    expect(
      storeAddMenuItem({
        actorId: cook.id,
        day: 1,
        meal: "dinner",
        recipeId: ids["Camp dal"]!,
      }).ok,
    ).toBe(true);
  });
});
