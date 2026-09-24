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

import { revalidatePath } from "next/cache";
import type { ViewerRank } from "@camp404/types";
import { captainActionGate } from "@/lib/captain-gate";
import { setMealPlan } from "@/lib/meal-plan";
import { MEAL_PLAN_REFUSAL } from "@/lib/recipe-copy";
import { getLeadTeams } from "@/lib/users";
import { saveMealPlanAction } from "./actions";

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
    expect(setMealPlan).toHaveBeenCalledWith({ ...PLAN, actorId: "lead-1" });
    expect(revalidatePath).toHaveBeenCalledWith("/kitchen/meal-plan");
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
