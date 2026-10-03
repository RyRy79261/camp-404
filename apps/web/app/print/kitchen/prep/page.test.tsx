import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { KITCHEN_TEAM } from "@camp404/core";

// The prep plan print (#249, Option A of design/print-prep-plan.html): before
// we leave by date, then each day on site, a tick box per step, the dish and
// meal it is for, no names. The same readers as the prep steps on the meal
// plan: a captain or a Kitchen lead; anyone else reads a refusal outside the
// sheet, so it is never a PDF.

vi.mock("@/lib/captain-gate", () => ({ captainPageGate: vi.fn() }));
vi.mock("@/lib/camp-config", () => ({ getCurrentCycle: vi.fn() }));
vi.mock("@/lib/kitchen-menu", () => ({ listSheetPrepSteps: vi.fn() }));
vi.mock("@/lib/meal-plan", () => ({ getMealPlan: vi.fn() }));
vi.mock("@/lib/users", () => ({ getLeadTeams: vi.fn() }));

import { captainPageGate } from "@/lib/captain-gate";
import { getCurrentCycle } from "@/lib/camp-config";
import { listSheetPrepSteps } from "@/lib/kitchen-menu";
import { getMealPlan } from "@/lib/meal-plan";
import { PRINT_SHEET_ATTR } from "@/lib/print";
import { PREP_PLAN_REFUSAL } from "@/lib/recipe-copy";
import { getLeadTeams } from "@/lib/users";
import PrepPlanPrintPage from "./page";

function as(rank: string, led: string[] = []) {
  vi.mocked(captainPageGate).mockResolvedValue({
    campUser: { id: "viewer" },
    rank,
    cleared: true,
  } as never);
  vi.mocked(getLeadTeams).mockResolvedValue(led as never);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getCurrentCycle).mockResolvedValue({ year: 2027 } as never);
  vi.mocked(getMealPlan).mockResolvedValue({
    cycle: 2027,
    daysOnSite: 3,
    firstDay: "2027-04-22",
    days: [],
    version: 1,
    updatedAt: null,
  });
  vi.mocked(listSheetPrepSteps).mockResolvedValue([
    {
      dueDate: "2027-04-23",
      what: "Soak the oats",
      recipeTitle: "Oats porridge",
      day: 3,
      meal: "breakfast",
    },
    {
      dueDate: "2027-04-17",
      what: "Chop the onions",
      recipeTitle: "Potjiekos",
      day: 1,
      meal: "dinner",
    },
    {
      dueDate: "2027-04-23",
      what: "Rinse the lentils",
      recipeTitle: "Camp dal",
      day: 2,
      meal: "dinner",
    },
  ]);
});

afterEach(cleanup);

describe("the prep plan print", () => {
  it.each([
    ["a member", "camp_member", []],
    ["a lead of another team", "team_lead", ["power_and_lighting"]],
  ])(
    "refuses %s outside the sheet, and reads no steps",
    async (_who, rank, led) => {
      as(rank, led);
      const { container } = render(await PrepPlanPrintPage());
      expect(screen.getByTestId("prep-refusal").textContent).toBe(
        PREP_PLAN_REFUSAL,
      );
      expect(container.querySelector(`[${PRINT_SHEET_ATTR}]`)).toBeNull();
      expect(listSheetPrepSteps).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["a Kitchen lead", "team_lead", [KITCHEN_TEAM]],
    ["a captain", "captain", []],
  ])(
    "gives %s the plan: before we leave by date, then each day on site",
    async (_who, rank, led) => {
      as(rank, led);
      const { container } = render(await PrepPlanPrintPage());
      expect(container.querySelector(`[${PRINT_SHEET_ATTR}]`)).toBeTruthy();
      expect(listSheetPrepSteps).toHaveBeenCalledWith(2027);
      expect(container.textContent).toContain(
        "AfrikaBurn 2027 · 1 step before we leave · 2 on site",
      );
      expect(
        screen.getAllByTestId("prep-step").map((r) => r.textContent),
      ).toEqual([
        "Chop the onionsPotjiekos · Day 1 dinner",
        "Rinse the lentilsCamp dal · Day 2 dinner",
        "Soak the oatsOats porridge · Day 3 breakfast",
      ]);
      const text = container.textContent ?? "";
      expect(text.indexOf("Before we leave")).toBeLessThan(
        text.indexOf("Sat 17 Apr"),
      );
      expect(text.indexOf("Sat 17 Apr")).toBeLessThan(
        text.indexOf("Day 1 · Thu 22 Apr"),
      );
      expect(text).toContain("Day 3 · Sat 24 Apr");
      // Day 1 and Day 3 have nothing to prep.
      expect(screen.getAllByText("Nothing to prep.")).toHaveLength(2);
    },
  );
});
