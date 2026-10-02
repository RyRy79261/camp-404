import { beforeEach, describe, expect, it, vi } from "vitest";

// The meal plan's #245 writes (the owner's Option A, 2026-10-02): a plan for
// an anaphylaxis, a correction of a recipe's allergens, and prep steps. A
// captain or a Kitchen lead, as the signed-in actor; a lead of another team
// and a member are refused here, and the write checks again.

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ unstable_rethrow: vi.fn() }));
vi.mock("@/lib/captain-gate", () => ({ captainActionGate: vi.fn() }));
vi.mock("@/lib/users", () => ({ getLeadTeams: vi.fn(async () => []) }));
vi.mock("@/lib/meal-plan", () => ({ setMealPlan: vi.fn() }));
vi.mock("@/lib/kitchen-menu", () => ({
  addMenuItem: vi.fn(),
  removeMenuItem: vi.fn(),
  addSnack: vi.fn(),
  removeSnack: vi.fn(),
  recordAllergenPlan: vi.fn(async () => ({ ok: true, version: 1 })),
  correctRecipeAllergens: vi.fn(async () => ({ ok: true, revision: 1 })),
  addPrepStep: vi.fn(async () => ({
    ok: true,
    stepId: "s1",
    onBoard: true,
    due: "2027-04-20",
  })),
  removePrepStep: vi.fn(async () => ({ ok: true })),
}));

import { revalidatePath } from "next/cache";
import type { ViewerRank } from "@camp404/types";
import { captainActionGate } from "@/lib/captain-gate";
import {
  addPrepStep,
  correctRecipeAllergens,
  recordAllergenPlan,
  removePrepStep,
} from "@/lib/kitchen-menu";
import {
  ALLERGENS_REFUSAL,
  PLAN_REFUSAL,
  PREP_REFUSAL,
} from "@/lib/recipe-copy";
import { getLeadTeams } from "@/lib/users";
import {
  addPrepStepAction,
  correctAllergensAction,
  recordAllergenPlanAction,
  removePrepStepAction,
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

const ID = "11111111-1111-4111-8111-111111111111";
const PLAN = {
  itemId: ID,
  kind: "portion",
  details: "One bowl first.",
  allergens: ["peanuts"],
  expectedVersion: 0,
};
const FIX = {
  recipeId: ID,
  versionId: ID,
  allergens: ["milk"],
  expectedRevision: 0,
};
const STEP = {
  itemId: ID,
  what: "Toast the oats",
  when: "before_leaving",
  date: "2027-04-20",
};

beforeEach(() => {
  vi.clearAllMocks();
  actAs("team_lead", ["kitchen"], "lead-1");
});

describe("who may act", () => {
  it("refuses a lead of another team and a member, writing nothing", async () => {
    for (const [rank, led] of [
      ["team_lead", ["power"]],
      ["camp_member", []],
    ] as const) {
      actAs(rank, [...led]);
      expect(await recordAllergenPlanAction(PLAN)).toEqual({
        ok: false,
        error: PLAN_REFUSAL,
      });
      expect(await correctAllergensAction(FIX)).toEqual({
        ok: false,
        error: ALLERGENS_REFUSAL,
      });
      expect(await addPrepStepAction(STEP)).toEqual({
        ok: false,
        error: PREP_REFUSAL,
      });
      expect(await removePrepStepAction({ stepId: ID })).toEqual({
        ok: false,
        error: PREP_REFUSAL,
      });
    }
    expect(recordAllergenPlan).not.toHaveBeenCalled();
    expect(correctRecipeAllergens).not.toHaveBeenCalled();
    expect(addPrepStep).not.toHaveBeenCalled();
    expect(removePrepStep).not.toHaveBeenCalled();
  });

  it("passes a Kitchen lead's writes on as themselves, never an id from the form", async () => {
    expect(await recordAllergenPlanAction({ ...PLAN, actorId: "x" })).toEqual({
      ok: true,
      data: { version: 1 },
    });
    expect(recordAllergenPlan).toHaveBeenCalledWith({
      ...PLAN,
      actorId: "lead-1",
    });
    expect(await correctAllergensAction(FIX)).toEqual({
      ok: true,
      data: { revision: 1 },
    });
    expect(correctRecipeAllergens).toHaveBeenCalledWith({
      ...FIX,
      actorId: "lead-1",
    });
    expect(await addPrepStepAction(STEP)).toEqual({
      ok: true,
      data: { onBoard: true, due: "2027-04-20" },
    });
    expect(addPrepStep).toHaveBeenCalledWith({ ...STEP, actorId: "lead-1" });
    expect(revalidatePath).toHaveBeenCalledWith("/tasks");
    expect(await removePrepStepAction({ stepId: ID })).toEqual({ ok: true });
    expect(removePrepStep).toHaveBeenCalledWith({
      stepId: ID,
      actorId: "lead-1",
    });
  });
});

describe("the boundary", () => {
  it("refuses a plan with no words or no foods, and a step before we leave with no date", async () => {
    expect(await recordAllergenPlanAction({ ...PLAN, details: " " })).toEqual({
      ok: false,
      error: "Say what exactly the kitchen will do.",
    });
    expect(
      (await recordAllergenPlanAction({ ...PLAN, allergens: [] })).ok,
    ).toBe(false);
    expect(await addPrepStepAction({ ...STEP, date: "" })).toEqual({
      ok: false,
      error: "Pick the date.",
    });
    expect(await removePrepStepAction({ stepId: "nope" })).toMatchObject({
      ok: false,
    });
    expect(recordAllergenPlan).not.toHaveBeenCalled();
    expect(addPrepStep).not.toHaveBeenCalled();
  });

  it("hands on the write's own refusal", async () => {
    vi.mocked(addPrepStep).mockResolvedValueOnce({
      ok: false,
      error:
        "Pick a date before Day 1: on site, use the day before or the same day.",
    });
    expect(await addPrepStepAction(STEP)).toEqual({
      ok: false,
      error:
        "Pick a date before Day 1: on site, use the day before or the same day.",
    });
    vi.mocked(correctRecipeAllergens).mockResolvedValueOnce({
      ok: false,
      error: "No.",
    });
    expect(await correctAllergensAction(FIX)).toEqual({
      ok: false,
      error: "No.",
    });
    vi.mocked(recordAllergenPlan).mockResolvedValueOnce({
      ok: false,
      error: "Late.",
    });
    expect(await recordAllergenPlanAction(PLAN)).toEqual({
      ok: false,
      error: "Late.",
    });
    vi.mocked(removePrepStep).mockResolvedValueOnce({
      ok: false,
      error: "Gone.",
    });
    expect(await removePrepStepAction({ stepId: ID })).toEqual({
      ok: false,
      error: "Gone.",
    });
  });
});
