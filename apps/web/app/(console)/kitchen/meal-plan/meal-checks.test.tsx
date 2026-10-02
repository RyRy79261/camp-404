import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DietaryCounts } from "@camp404/core";
import type { KitchenMenu } from "@camp404/db/kitchen-menu";
import type { MealChecks } from "@camp404/db/kitchen-meals";

// The meal plan's dietary check and prep steps (#245; the owner approved
// Option A of design/kitchen-dietary.html and kitchen-prep.html,
// 2026-10-02), for a captain or a Kitchen lead: the counts box above the
// week, a red flag under a recipe someone coming is anaphylactic to until a
// plan is recorded (then green), an amber line for other clashes, "Change
// allergens" from the flag, and "+ Prep step" with what and when, no person
// responsible. A member's page has none of it.

vi.mock("@/lib/captain-gate", () => ({ captainPageGate: vi.fn() }));
vi.mock("@/lib/users", () => ({ getLeadTeams: vi.fn() }));
vi.mock("@/lib/meal-plan", () => ({ getMealPlan: vi.fn() }));
vi.mock("@/lib/kitchen-menu", () => ({
  getKitchenMenu: vi.fn(),
  getSnacks: vi.fn(async () => []),
  listMenuBook: vi.fn(async () => []),
  getMenuDietaryFor: vi.fn(),
  getMealChecks: vi.fn(),
}));
vi.mock("./actions", () => ({
  saveMealPlanAction: vi.fn(),
  addMenuItemAction: vi.fn(),
  removeMenuItemAction: vi.fn(),
  addSnackAction: vi.fn(),
  removeSnackAction: vi.fn(),
  recordAllergenPlanAction: vi.fn(),
  correctAllergensAction: vi.fn(),
  addPrepStepAction: vi.fn(),
  removePrepStepAction: vi.fn(),
}));
vi.mock("../recipes/actions", () => ({ proofreadPlatesAction: vi.fn() }));
vi.mock("@camp404/ui/components/toast", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

import { toast } from "@camp404/ui/components/toast";
import { captainPageGate } from "@/lib/captain-gate";
import {
  getKitchenMenu,
  getMealChecks,
  getMenuDietaryFor,
} from "@/lib/kitchen-menu";
import { getMealPlan } from "@/lib/meal-plan";
import { getLeadTeams } from "@/lib/users";
import {
  addPrepStepAction,
  correctAllergensAction,
  recordAllergenPlanAction,
  removePrepStepAction,
} from "./actions";
import MealPlanPage from "./page";

const OATS = "00000000-0000-4000-8000-000000000001";
const SHAKSHUKA = "00000000-0000-4000-8000-000000000002";

const MENU: KitchenMenu = {
  cycle: 2027,
  items: [
    { id: "i-oats", day: 3, meal: "breakfast", position: 1, recipeId: OATS },
    {
      id: "i-shak",
      day: 2,
      meal: "breakfast",
      position: 1,
      recipeId: SHAKSHUKA,
    },
  ],
  recipes: {
    [OATS]: {
      recipeId: OATS,
      title: "Overnight oats",
      versionId: "v-oats",
      categories: [],
      counts: [{ plates: 60, lines: [] }],
      openPlates: [],
      allergens: [
        { allergen: "milk", from: ["Milk"] },
        { allergen: "peanuts", from: ["Peanut butter"] },
      ],
      allergensMarked: true,
      allergenRevision: 0,
    },
    [SHAKSHUKA]: {
      recipeId: SHAKSHUKA,
      title: "Shakshuka",
      versionId: "v-shak",
      categories: [],
      counts: [{ plates: 60, lines: [] }],
      openPlates: [],
      allergens: [
        { allergen: "milk", from: ["Feta"] },
        { allergen: "eggs", from: ["Eggs"] },
      ],
      allergensMarked: true,
      allergenRevision: 0,
    },
  },
};

const COUNTS: DietaryCounts = {
  members: 38,
  allergies: [
    { food: "peanuts", label: "Peanuts", count: 2, anaphylactic: 1 },
    { food: "eggs", label: "Eggs", count: 1, anaphylactic: 0 },
  ],
  intolerances: [{ food: "milk", label: "Milk", count: 4 }],
  preferences: [{ diet: "vegetarian", label: "Vegetarian", count: 9 }],
};

const NO_CHECKS: MealChecks = { plans: [], prepSteps: [] };

async function renderAs(
  rank: "camp_member" | "team_lead" | "captain",
  checks: MealChecks = NO_CHECKS,
) {
  vi.mocked(captainPageGate).mockResolvedValue({
    campUser: { id: "viewer" },
    rank,
    cleared: true,
  } as never);
  vi.mocked(getLeadTeams).mockResolvedValue(
    rank === "team_lead" ? ["kitchen"] : [],
  );
  vi.mocked(getMealPlan).mockResolvedValue({
    cycle: 2027,
    daysOnSite: 3,
    firstDay: "2027-04-22",
    days: [
      { breakfast: 0, dinner: 48 },
      { breakfast: 60, dinner: 55 },
      { breakfast: 60, dinner: 50 },
    ],
    version: 2,
    updatedAt: null,
  });
  vi.mocked(getKitchenMenu).mockResolvedValue(MENU);
  // The server answers null to anyone but a captain or a Kitchen lead.
  vi.mocked(getMenuDietaryFor).mockResolvedValue(
    rank === "camp_member" ? null : { counts: COUNTS, oldOnly: 0 },
  );
  vi.mocked(getMealChecks).mockResolvedValue(checks);
  render(await MealPlanPage());
}

const meal = (name: string) =>
  screen.getByRole("list", { name: `Recipes for ${name}` });

afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(recordAllergenPlanAction).mockResolvedValue({
    ok: true,
    data: { version: 1 },
  });
  vi.mocked(correctAllergensAction).mockResolvedValue({
    ok: true,
    data: { revision: 1 },
  });
  vi.mocked(addPrepStepAction).mockResolvedValue({
    ok: true,
    data: { onBoard: true, due: "2027-04-20" },
  });
  vi.mocked(removePrepStepAction).mockResolvedValue({ ok: true });
});

describe("the dietary counts box", () => {
  it("shows allergies, intolerances and preferences as counts, and See who goes to the recorded sheet", async () => {
    await renderAs("team_lead");
    const box = screen.getByRole("region", { name: "Dietary" });
    expect(box.hasAttribute("data-os-private")).toBe(true);
    expect(box.textContent).toContain(
      "From the dietary forms of the 38 members coming this year. Counts only.",
    );
    expect(box.textContent).toContain("Peanuts1 anaphylactic2");
    expect(box.textContent).toContain("Milk4");
    expect(box.textContent).toContain("Vegetarian9");
    expect(
      within(box).getByRole("link", { name: "See who (recorded)" }),
    ).toHaveProperty(
      "href",
      expect.stringContaining("/print/daily-sheet?day=all"),
    );
  });

  it("is not on a member's page, and their page asks for no counts or checks", async () => {
    await renderAs("camp_member");
    expect(screen.queryByRole("region", { name: "Dietary" })).toBeNull();
    expect(
      screen.queryByText(/anaphylactic|Record a plan|Prep step/),
    ).toBeNull();
    expect(getMenuDietaryFor).not.toHaveBeenCalled();
    expect(getMealChecks).not.toHaveBeenCalled();
  });
});

describe("the flags under each recipe", () => {
  it("is red with Record a plan for anaphylaxis, amber for the rest", async () => {
    await renderAs("team_lead");
    const oats = meal("Day 3, breakfast");
    const red = within(oats).getByTestId("flag-red");
    expect(red.textContent).toContain(
      "Peanuts (peanut butter): 2 allergic, 1 anaphylactic.",
    );
    expect(red.textContent).toContain("No plan yet.");
    expect(within(oats).getByTestId("flag-amber").textContent).toBe(
      "Milk: 4 intolerant",
    );
    const shak = meal("Day 2, breakfast");
    expect(within(shak).queryByTestId("flag-red")).toBeNull();
    expect(within(shak).getByTestId("flag-amber").textContent).toContain(
      "Milk (feta): 4 intolerant · Eggs: 1 allergic",
    );
  });

  it("records a plan for the anaphylaxis foods, with the version it opened", async () => {
    await renderAs("captain");
    fireEvent.click(
      screen.getByRole("button", { name: "Record a plan: Overnight oats" }),
    );
    const dialog = screen.getByRole("dialog", { name: "Plan for peanuts" });
    expect(dialog.textContent).toContain(
      "Overnight oats · Day 3, Sat 24 Apr, breakfast · 60 plates. One member coming is anaphylactic to peanuts.",
    );
    fireEvent.click(
      within(dialog).getByRole("radio", { name: /A substitution/ }),
    );
    // Nothing typed: said beside it, nothing sent.
    await act(async () => {
      fireEvent.click(
        within(dialog).getByRole("button", { name: "Save plan" }),
      );
    });
    expect(within(dialog).getByRole("alert").textContent).toBe(
      "Say what exactly the kitchen will do.",
    );
    expect(recordAllergenPlanAction).not.toHaveBeenCalled();
    fireEvent.change(within(dialog).getByRole("textbox"), {
      target: { value: "Sunflower seed butter for everyone." },
    });
    await act(async () => {
      fireEvent.click(
        within(dialog).getByRole("button", { name: "Save plan" }),
      );
    });
    expect(recordAllergenPlanAction).toHaveBeenCalledWith({
      itemId: "i-oats",
      kind: "substitution",
      details: "Sunflower seed butter for everyone.",
      allergens: ["peanuts"],
      expectedVersion: 0,
    });
  });

  it("turns green once a plan names the food, and red again when it does not", async () => {
    const plan = {
      menuItemId: "i-oats",
      kind: "portion" as const,
      details: "One bowl first, in a clean pot.",
      allergens: ["peanuts" as const],
      version: 3,
    };
    await renderAs("team_lead", { plans: [plan], prepSteps: [] });
    const green = within(meal("Day 3, breakfast")).getByTestId("flag-planned");
    expect(green.textContent).toContain(
      "Peanuts (peanut butter): plan recorded. A separate portion: One bowl first, in a clean pot.",
    );
    expect(
      within(meal("Day 3, breakfast")).queryByTestId("flag-red"),
    ).toBeNull();
    cleanup();

    // A plan made for sesame covers no peanuts.
    await renderAs("team_lead", {
      plans: [{ ...plan, allergens: ["sesame"] }],
      prepSteps: [],
    });
    expect(
      within(meal("Day 3, breakfast")).getByTestId("flag-red"),
    ).toBeTruthy();
  });

  it("corrects a recipe's allergens from the flag, with the revision it opened", async () => {
    await renderAs("team_lead");
    fireEvent.click(
      screen.getByRole("button", { name: "Change allergens: Shakshuka" }),
    );
    const dialog = screen.getByRole("dialog", {
      name: "Allergens in Shakshuka",
    });
    fireEvent.click(within(dialog).getByRole("checkbox", { name: "Eggs" }));
    fireEvent.click(within(dialog).getByRole("checkbox", { name: "Sesame" }));
    await act(async () => {
      fireEvent.click(
        within(dialog).getByRole("button", { name: "Save allergens" }),
      );
    });
    expect(correctAllergensAction).toHaveBeenCalledWith({
      recipeId: SHAKSHUKA,
      versionId: "v-shak",
      allergens: ["milk", "sesame"],
      expectedRevision: 0,
    });
  });
});

describe("prep steps", () => {
  it("asks what and when, says where each choice lands, and has no person responsible", async () => {
    await renderAs("team_lead");
    fireEvent.click(
      screen.getByRole("button", {
        name: "Add a prep step: Overnight oats, Day 3, Sat 24 Apr, breakfast",
      }),
    );
    const dialog = screen.getByRole("dialog", {
      name: "Prep step for Overnight oats",
    });
    expect(dialog.textContent).toContain(
      "Due Fri 23 Apr · on that day's site sheet",
    );
    expect(dialog.textContent).toContain(
      "Due Sat 24 Apr · on that day's site sheet",
    );
    expect(dialog.textContent).not.toMatch(/responsible|Nobody yet/i);

    fireEvent.change(within(dialog).getByRole("textbox"), {
      target: { value: "Toast the oats" },
    });
    fireEvent.click(
      within(dialog).getByRole("radio", { name: /Before we leave/ }),
    );
    fireEvent.change(within(dialog).getByLabelText("Date"), {
      target: { value: "2027-04-20" },
    });
    expect(dialog.textContent).toContain(
      "Due Tue 20 Apr · on Tasks for the Kitchen",
    );
    await act(async () => {
      fireEvent.click(
        within(dialog).getByRole("button", { name: "Add to Kitchen tasks" }),
      );
    });
    expect(addPrepStepAction).toHaveBeenCalledWith({
      itemId: "i-oats",
      what: "Toast the oats",
      when: "before_leaving",
      date: "2027-04-20",
    });
    expect(toast.success).toHaveBeenCalledWith(
      "Prep step added to Tasks for the Kitchen",
    );
  });

  it("lists a recipe's steps with their due date, and the × takes one off", async () => {
    await renderAs("team_lead", {
      plans: [],
      prepSteps: [
        {
          id: "p1",
          menuItemId: "i-oats",
          what: "Soak the oats",
          timing: "day_before",
          dueDate: "2027-04-23",
          onBoard: false,
        },
      ],
    });
    const oats = meal("Day 3, breakfast");
    expect(oats.textContent).toContain(
      "PREPSoak the oats · due Fri 23 Apr (the day before)",
    );
    vi.mocked(removePrepStepAction).mockResolvedValueOnce({
      ok: false,
      error: "That prep step is already off. Reload the page.",
    });
    await act(async () => {
      fireEvent.click(
        within(oats).getByRole("button", {
          name: /Take this prep step off: Soak the oats/,
        }),
      );
    });
    expect(removePrepStepAction).toHaveBeenCalledWith({ stepId: "p1" });
    expect(toast.error).toHaveBeenCalledWith(
      "That prep step is already off. Reload the page.",
    );
  });
});
