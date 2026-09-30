import { beforeEach, describe, expect, it, vi } from "vitest";

// The meal plan's save (2026-09-24): a captain or a Kitchen lead, as the
// signed-in actor; a lead of another team and a member are refused here, and
// the write checks again. A bad number is refused before the write.

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ unstable_rethrow: vi.fn() }));
vi.mock("@/lib/captain-gate", () => ({ captainActionGate: vi.fn() }));
vi.mock("@/lib/users", () => ({ getLeadTeams: vi.fn(async () => []) }));
vi.mock("@/lib/meal-plan", () => ({
  setMealPlan: vi.fn(async () => ({ ok: true, version: 2 })),
}));
vi.mock("@/lib/kitchen-menu", () => ({
  addMenuItem: vi.fn(async () => ({ ok: true, itemId: "item-1" })),
  removeMenuItem: vi.fn(async () => ({ ok: true })),
  addSnack: vi.fn(async () => ({ ok: true, snackId: "snack-1" })),
  removeSnack: vi.fn(async () => ({ ok: true })),
}));

import { revalidatePath } from "next/cache";
import type { ViewerRank } from "@camp404/types";
import { captainActionGate } from "@/lib/captain-gate";
import {
  addMenuItem,
  addSnack,
  removeMenuItem,
  removeSnack,
} from "@/lib/kitchen-menu";
import { setMealPlan } from "@/lib/meal-plan";
import {
  MEAL_PLAN_REFUSAL,
  MENU_REFUSAL,
  SNACK_REFUSAL,
} from "@/lib/recipe-copy";
import { getLeadTeams } from "@/lib/users";
import {
  addMenuItemAction,
  addSnackAction,
  removeMenuItemAction,
  removeSnackAction,
  saveMealPlanAction,
} from "./actions";

const LADDER: ViewerRank[] = ["camp_member", "team_lead", "captain"];

function actAs(rank: ViewerRank, led: string[] = [], id = "user-1") {
  vi.mocked(captainActionGate).mockImplementation(async (required, refusal) =>
    LADDER.indexOf(rank) >= LADDER.indexOf(required)
      ? ({ ok: true, rank, campUser: { id } } as never)
      : { ok: false, error: refusal ?? "No." },
  );
  vi.mocked(getLeadTeams).mockResolvedValue(led as never);
}

const PLAN = {
  daysOnSite: 2,
  days: [
    { breakfast: 20, lunch: 0, dinner: 25 },
    { breakfast: 45, lunch: 0, dinner: 50 },
  ],
  expectedVersion: 1,
};

beforeEach(() => {
  vi.clearAllMocks();
  actAs("captain", [], "captain-1");
});

describe("saveMealPlanAction", () => {
  it("refuses a lead of another team and a member, writing nothing", async () => {
    for (const [rank, led] of [
      ["team_lead", ["structures"]],
      ["camp_member", []],
    ] as const) {
      actAs(rank, [...led]);
      expect(await saveMealPlanAction(PLAN)).toEqual({
        ok: false,
        error: MEAL_PLAN_REFUSAL,
      });
    }
    expect(setMealPlan).not.toHaveBeenCalled();
  });

  it("saves as the Kitchen lead, never an id from the browser", async () => {
    actAs("team_lead", ["kitchen"], "lead-1");
    expect(
      await saveMealPlanAction({ ...PLAN, actorId: "someone-else" }),
    ).toEqual({ ok: true, data: { version: 2 } });
    expect(setMealPlan).toHaveBeenCalledWith({
      ...PLAN,
      firstDay: null,
      actorId: "lead-1",
    });
    expect(revalidatePath).toHaveBeenCalledWith("/kitchen/meal-plan");
  });

  it("passes the date of day 1 through, and refuses one that is not a date", async () => {
    expect(
      (await saveMealPlanAction({ ...PLAN, firstDay: "2026-04-25" })).ok,
    ).toBe(true);
    expect(setMealPlan).toHaveBeenCalledWith(
      expect.objectContaining({ firstDay: "2026-04-25" }),
    );
    vi.mocked(setMealPlan).mockClear();
    expect(
      await saveMealPlanAction({ ...PLAN, firstDay: "2026-02-30" }),
    ).toEqual({ ok: false, error: "Pick the date of day 1." });
    expect(setMealPlan).not.toHaveBeenCalled();
  });

  it("saves as a captain without reading their teams", async () => {
    expect((await saveMealPlanAction(PLAN)).ok).toBe(true);
    expect(getLeadTeams).not.toHaveBeenCalled();
  });

  it("refuses a bad number before the write, and passes the write's refusal through", async () => {
    expect(
      await saveMealPlanAction({
        ...PLAN,
        days: [PLAN.days[0], { breakfast: 501, lunch: 0, dinner: 0 }],
      }),
    ).toEqual({ ok: false, error: "Give at most 500 plates." });
    expect(setMealPlan).not.toHaveBeenCalled();
    vi.mocked(setMealPlan).mockResolvedValueOnce({
      ok: false,
      error: "Someone changed the meal plan first. Reload the page.",
    });
    expect(await saveMealPlanAction(PLAN)).toEqual({
      ok: false,
      error: "Someone changed the meal plan first. Reload the page.",
    });
  });
});

// The menu inside the meal plan and the snacks (#244): the same people as the
// meal plan, as the signed-in actor; the write checks again.
describe("the menu and snack actions", () => {
  const RECIPE = "00000000-0000-4000-8000-000000000001";
  const ITEM = "00000000-0000-4000-8000-000000000002";

  it("refuse a lead of another team and a member, writing nothing", async () => {
    for (const [rank, led] of [
      ["team_lead", ["structures"]],
      ["camp_member", []],
    ] as const) {
      actAs(rank, [...led]);
      expect(
        await addMenuItemAction({ day: 1, meal: "dinner", recipeId: RECIPE }),
      ).toEqual({ ok: false, error: MENU_REFUSAL });
      expect(await removeMenuItemAction({ itemId: ITEM })).toEqual({
        ok: false,
        error: MENU_REFUSAL,
      });
      expect(await addSnackAction({ name: "Rusks", amount: "" })).toEqual({
        ok: false,
        error: SNACK_REFUSAL,
      });
      expect(await removeSnackAction({ snackId: ITEM })).toEqual({
        ok: false,
        error: SNACK_REFUSAL,
      });
    }
    expect(addMenuItem).not.toHaveBeenCalled();
    expect(removeMenuItem).not.toHaveBeenCalled();
    expect(addSnack).not.toHaveBeenCalled();
    expect(removeSnack).not.toHaveBeenCalled();
  });

  it("write as the Kitchen lead, never an id from the browser", async () => {
    actAs("team_lead", ["kitchen"], "lead-1");
    expect(
      await addMenuItemAction({
        day: 2,
        meal: "breakfast",
        recipeId: RECIPE,
        actorId: "someone-else",
      }),
    ).toEqual({ ok: true, data: { itemId: "item-1" } });
    expect(addMenuItem).toHaveBeenCalledWith({
      day: 2,
      meal: "breakfast",
      recipeId: RECIPE,
      actorId: "lead-1",
    });
    expect(await addSnackAction({ name: " Rusks ", amount: " " })).toEqual({
      ok: true,
      data: { snackId: "snack-1" },
    });
    expect(addSnack).toHaveBeenCalledWith({
      name: "Rusks",
      amount: null,
      actorId: "lead-1",
    });
    expect(revalidatePath).toHaveBeenCalledWith("/kitchen/shopping");
  });

  it("refuse what is not a meal or not a snack before the write", async () => {
    expect(
      await addMenuItemAction({ day: 1, meal: "snack", recipeId: RECIPE }),
    ).toMatchObject({ ok: false });
    expect(
      await addMenuItemAction({ day: 0, meal: "dinner", recipeId: RECIPE }),
    ).toEqual({ ok: false, error: "Pick a day on the meal plan." });
    expect(await addSnackAction({ name: "  " })).toEqual({
      ok: false,
      error: "Name the snack.",
    });
    expect(addMenuItem).not.toHaveBeenCalled();
    expect(addSnack).not.toHaveBeenCalled();
  });
});
