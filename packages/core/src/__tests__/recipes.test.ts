import { describe, expect, it } from "vitest";
import {
  DEFAULT_PLATES,
  RECIPE_STATUSES,
  type RecipeStatus,
} from "@camp404/types";
import {
  RECIPE_TRANSITIONS,
  canApproveRecipe,
  canEditMealPlan,
  canMoveRecipe,
  canRunProofread,
  canSetKitchenSettings,
  defaultPlates,
  groupLinesByCategory,
  groupStepsByPhase,
  mealPlanPeaks,
  mealPlanPlateCounts,
} from "../recipes";

describe("canApproveRecipe", () => {
  it("refuses a lead of another team", () => {
    expect(canApproveRecipe("team_lead", ["structures"])).toBe(false);
    expect(canApproveRecipe("team_lead", [])).toBe(false);
  });

  it("allows a lead of Kitchen, including one who leads other teams too", () => {
    expect(canApproveRecipe("team_lead", ["kitchen"])).toBe(true);
    expect(canApproveRecipe("team_lead", ["structures", "kitchen"])).toBe(true);
  });

  it("allows a captain, who needs to lead nothing", () => {
    expect(canApproveRecipe("captain", [])).toBe(true);
  });

  it("refuses a rank it does not know, whatever teams come with it", () => {
    for (const rank of ["", "member", "Captain", "admin", "toString"]) {
      expect(canApproveRecipe(rank, ["kitchen"]), rank).toBe(false);
    }
  });

  it("refuses a camp member even when a Kitchen lead flag comes with them", () => {
    expect(canApproveRecipe("camp_member", ["kitchen"])).toBe(false);
  });
});

describe("canRunProofread", () => {
  it("lets a Kitchen lead send, as the owner decided (2A), and a captain", () => {
    expect(canRunProofread("team_lead", ["kitchen"])).toBe(true);
    expect(canRunProofread("team_lead", ["structures", "kitchen"])).toBe(true);
    expect(canRunProofread("captain", [])).toBe(true);
  });

  it("refuses a lead of another team and a member", () => {
    expect(canRunProofread("team_lead", ["structures"])).toBe(false);
    expect(canRunProofread("team_lead", [])).toBe(false);
    expect(canRunProofread("camp_member", ["kitchen"])).toBe(false);
  });

  it("refuses a rank it does not know, whatever teams come with it", () => {
    for (const rank of ["", "member", "Captain", "admin", "toString"]) {
      expect(canRunProofread(rank, ["kitchen"]), rank).toBe(false);
    }
  });
});

describe("canSetKitchenSettings", () => {
  it("is a captain's alone: 2A does not open the settings to leads", () => {
    expect(canSetKitchenSettings("captain")).toBe(true);
    expect(canSetKitchenSettings("team_lead")).toBe(false);
    expect(canSetKitchenSettings("camp_member")).toBe(false);
    expect(canSetKitchenSettings("admin")).toBe(false);
    expect(canSetKitchenSettings("toString")).toBe(false);
  });
});

describe("RECIPE_TRANSITIONS", () => {
  it("names every status, and moves only to statuses that exist", () => {
    expect(Object.keys(RECIPE_TRANSITIONS).sort()).toEqual(
      [...RECIPE_STATUSES].sort(),
    );
    for (const targets of Object.values(RECIPE_TRANSITIONS)) {
      for (const to of targets) expect(RECIPE_STATUSES).toContain(to);
    }
  });

  it("follows the lifecycle", () => {
    const allowed: [RecipeStatus, RecipeStatus][] = [
      ["suggested", "approved"],
      ["suggested", "rejected"],
      ["suggested", "changes_requested"],
      ["changes_requested", "suggested"],
      ["approved", "queued"],
      ["proofread", "queued"],
      ["accepted", "queued"],
      ["queued", "analysing"],
      // A queued run whose text lost its clearance is handed back unsent.
      ["queued", "approved"],
      ["queued", "proofread"],
      ["queued", "accepted"],
      ["analysing", "proofread"],
      // A failed run hands the recipe back to where it stood.
      ["analysing", "approved"],
      ["analysing", "accepted"],
      ["proofread", "accepted"],
      ["approved", "accepted"],
    ];
    for (const [from, to] of allowed) {
      expect(canMoveRecipe(from, to), `${from} -> ${to}`).toBe(true);
    }
    const count = Object.values(RECIPE_TRANSITIONS).flat().length;
    expect(count).toBe(allowed.length);
  });

  it("never sends a suggestion or a rejected recipe to Claude", () => {
    expect(canMoveRecipe("suggested", "queued")).toBe(false);
    expect(canMoveRecipe("changes_requested", "queued")).toBe(false);
    expect(canMoveRecipe("rejected", "queued")).toBe(false);
    expect(canMoveRecipe("approved", "analysing")).toBe(false);
  });

  it("refuses a status it does not know", () => {
    expect(canMoveRecipe("constructor" as RecipeStatus, "approved")).toBe(
      false,
    );
    expect(canMoveRecipe("pending" as RecipeStatus, "approved")).toBe(false);
  });
});

describe("groupLinesByCategory", () => {
  it("groups lines in shop order and keeps each line where it was written", () => {
    const lines = [
      { name: "Soy sauce", category: "condiment" as const },
      { name: "Garlic", category: "produce" as const },
      { name: "Tofu", category: "protein" as const },
      { name: "Coriander root", category: "produce" as const },
      { name: "Rice", category: "grain" as const },
    ];
    expect(
      groupLinesByCategory(lines).map((g) => [
        g.category,
        g.lines.map(({ line, index }) => `${index}:${line.name}`),
      ]),
    ).toEqual([
      ["produce", ["1:Garlic", "3:Coriander root"]],
      ["protein", ["2:Tofu"]],
      ["grain", ["4:Rice"]],
      ["condiment", ["0:Soy sauce"]],
    ]);
    expect(groupLinesByCategory([])).toEqual([]);
  });
});

describe("groupStepsByPhase", () => {
  it("groups consecutive steps and numbers them straight through", () => {
    const steps = [
      { phase: "Prep", instruction: "a" },
      { phase: "Prep", instruction: "b" },
      { phase: "Cook", instruction: "c" },
      { phase: null, instruction: "d" },
      { phase: "Prep", instruction: "e" },
    ];
    expect(
      groupStepsByPhase(steps).map((g) => [
        g.phase,
        g.steps.map(({ step, number }) => `${number}${step.instruction}`),
      ]),
    ).toEqual([
      ["Prep", ["1a", "2b"]],
      ["Cook", ["3c"]],
      [null, ["4d"]],
      ["Prep", ["5e"]],
    ]);
  });
});

describe("defaultPlates", () => {
  it("offers the largest meal that is set, or 40", () => {
    expect(
      defaultPlates({
        kitchenPlatesBreakfast: 60,
        kitchenPlatesLunch: null,
        kitchenPlatesDinner: 45,
      }),
    ).toBe(60);
    expect(
      defaultPlates({
        kitchenPlatesBreakfast: null,
        kitchenPlatesLunch: null,
        kitchenPlatesDinner: null,
      }),
    ).toBe(DEFAULT_PLATES);
    expect(DEFAULT_PLATES).toBe(40);
  });
});

describe("the meal plan", () => {
  const days = [
    { breakfast: 20, lunch: 0, dinner: 25 },
    { breakfast: 45, lunch: 0, dinner: 50 },
    { breakfast: 45, lunch: 12, dinner: 60 },
  ];

  it("lists each distinct plate count once, smallest first, and no 0", () => {
    expect(mealPlanPlateCounts(days)).toEqual([12, 20, 25, 45, 50, 60]);
    expect(mealPlanPlateCounts([])).toEqual([]);
    expect(
      mealPlanPlateCounts([{ breakfast: 0, lunch: 0, dinner: 0 }]),
    ).toEqual([]);
  });

  it("peaks each meal over the days, null for a meal that never happens", () => {
    expect(mealPlanPeaks(days)).toEqual({
      kitchenPlatesBreakfast: 45,
      kitchenPlatesLunch: 12,
      kitchenPlatesDinner: 60,
    });
    expect(mealPlanPeaks([{ breakfast: 30, lunch: 0, dinner: 0 }])).toEqual({
      kitchenPlatesBreakfast: 30,
      kitchenPlatesLunch: null,
      kitchenPlatesDinner: null,
    });
    // The largest count in the plan is what Claude writes a recipe for.
    expect(defaultPlates(mealPlanPeaks(days))).toBe(60);
    expect(defaultPlates(mealPlanPeaks([]))).toBe(DEFAULT_PLATES);
  });

  it("lets a captain or a Kitchen lead edit it, and nobody else", () => {
    expect(canEditMealPlan("captain", [])).toBe(true);
    expect(canEditMealPlan("team_lead", ["kitchen"])).toBe(true);
    expect(canEditMealPlan("team_lead", ["structures"])).toBe(false);
    expect(canEditMealPlan("camp_member", ["kitchen"])).toBe(false);
    expect(canEditMealPlan("wizard", ["kitchen"])).toBe(false);
  });
});
