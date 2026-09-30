import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The meal plan page (the owner's sketch, 2026-09-24): every approved member
// reads the days on site and the plates at each meal; a Kitchen lead or a
// captain edits them, with Save in the heading and "Copy Day 1 to every day".
// The days are "Day 1", "Day 2"...: Camp settings holds no first day on site.
// A save sends the whole plan with the version the page opened; a problem
// with a number shows beside it, a refusal beside Save.

vi.mock("@/lib/captain-gate", () => ({ captainPageGate: vi.fn() }));
vi.mock("@/lib/users", () => ({ getLeadTeams: vi.fn() }));
vi.mock("@/lib/meal-plan", () => ({ getMealPlan: vi.fn() }));
vi.mock("@/lib/kitchen-menu", () => ({
  getKitchenMenu: vi.fn(),
  getSnacks: vi.fn(),
}));
vi.mock("@/lib/recipes", () => ({ listRecipeBook: vi.fn() }));
vi.mock("./actions", () => ({
  saveMealPlanAction: vi.fn(),
  addMenuItemAction: vi.fn(),
  removeMenuItemAction: vi.fn(),
  addSnackAction: vi.fn(),
  removeSnackAction: vi.fn(),
}));
vi.mock("../recipes/actions", () => ({ proofreadPlatesAction: vi.fn() }));
vi.mock("@camp404/ui/components/toast", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));
const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh, push: vi.fn() }),
}));

import { toast } from "@camp404/ui/components/toast";
import type { KitchenMenu } from "@camp404/db/kitchen-menu";
import { captainPageGate } from "@/lib/captain-gate";
import { getKitchenMenu, getSnacks } from "@/lib/kitchen-menu";
import { getMealPlan } from "@/lib/meal-plan";
import { listRecipeBook } from "@/lib/recipes";
import { getLeadTeams } from "@/lib/users";
import { saveMealPlanAction } from "./actions";
import MealPlanPage from "./page";

const DAL = "00000000-0000-4000-8000-000000000001";
const RICE = "00000000-0000-4000-8000-000000000002";

const NO_MENU: KitchenMenu = { cycle: 2026, items: [], recipes: {} };

const DAYS = [
  { breakfast: 20, lunch: 0, dinner: 25 },
  { breakfast: 45, lunch: 0, dinner: 50 },
  { breakfast: 45, lunch: 10, dinner: 60 },
];

async function renderAs(
  rank: "camp_member" | "team_lead" | "captain",
  leads: string[] = [],
  plan: {
    daysOnSite: number;
    days: typeof DAYS;
    version: number;
    firstDay?: string | null;
  } = { daysOnSite: 3, days: DAYS, version: 4 },
  menu: KitchenMenu = NO_MENU,
) {
  vi.mocked(captainPageGate).mockResolvedValue({
    campUser: { id: "viewer" },
    rank,
    cleared: true,
  } as never);
  vi.mocked(getLeadTeams).mockResolvedValue(leads);
  vi.mocked(getMealPlan).mockResolvedValue({
    cycle: 2026,
    updatedAt: null,
    ...plan,
    firstDay: plan.firstDay ?? null,
  });
  vi.mocked(getKitchenMenu).mockResolvedValue(menu);
  vi.mocked(getSnacks).mockResolvedValue([]);
  vi.mocked(listRecipeBook).mockResolvedValue([
    { id: DAL, title: "Camp dal" },
    { id: RICE, title: "Rice" },
  ] as never);
  render(await MealPlanPage());
}

const plates = (label: string) =>
  screen.getByLabelText(label) as HTMLInputElement;
const save = async () => {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
  });
};

afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(saveMealPlanAction).mockResolvedValue({
    ok: true,
    data: { version: 5 },
  });
});

describe("meal plan page", () => {
  it("shows every member the plan as numbers, with nothing to change", async () => {
    await renderAs("camp_member");
    expect(
      screen.getByRole("heading", { level: 1, name: "Meal plan" }),
    ).toBeTruthy();
    expect(screen.getByText("Kitchen")).toBeTruthy();
    expect(screen.getByLabelText("Days on site").textContent).toBe("3");
    const table = screen.getByRole("table", { name: "Plates per day" });
    expect(
      within(table)
        .getAllByRole("columnheader")
        .map((h) => h.textContent),
    ).toEqual(["Day", "Breakfast", "Lunch", "Dinner"]);
    const rows = within(table).getAllByRole("row").slice(1);
    // Each cell names its meal too, for the phone's one card per day.
    expect(rows.map((r) => r.textContent)).toEqual([
      "Day 1" + "Breakfast20 plates" + "Lunch0" + "Dinner25 plates",
      "Day 2" + "Breakfast45 plates" + "Lunch0" + "Dinner50 plates",
      "Day 3" + "Breakfast45 plates" + "Lunch10 plates" + "Dinner60 plates",
    ]);
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Copy Day 1 to every day" }),
    ).toBeNull();
    expect(screen.queryByRole("spinbutton")).toBeNull();
    expect(getLeadTeams).not.toHaveBeenCalled();
    // A member is never sent the recipe book's picker.
    expect(listRecipeBook).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: /Add a recipe/ })).toBeNull();
  });

  it("shows every member each day's date once the plan has the date of day 1", async () => {
    await renderAs("camp_member", [], {
      daysOnSite: 3,
      days: DAYS,
      version: 4,
      firstDay: "2026-04-29",
    });
    const table = screen.getByRole("table", { name: "Plates per day" });
    const rows = within(table).getAllByRole("row").slice(1);
    // Across a month end: 29 and 30 April, then 1 May.
    expect(rows.map((r) => r.querySelector("th")?.textContent)).toEqual([
      "Day 1 · Wed 29 Apr",
      "Day 2 · Thu 30 Apr",
      "Day 3 · Fri 1 May",
    ]);
    // A member reads the dates; there is no date to change.
    expect(screen.queryByLabelText("Day 1 date")).toBeNull();
  });

  it("lets a Kitchen lead set the date of day 1 beside the days on site, dates every row, and saves it", async () => {
    await renderAs("team_lead", ["kitchen"]);
    const date = screen.getByLabelText("Day 1 date") as HTMLInputElement;
    expect(date.type).toBe("date");
    expect(date.value).toBe("");
    expect(screen.getByText("Day 1")).toBeTruthy();
    fireEvent.change(date, { target: { value: "2026-04-25" } });
    expect(
      screen.getByRole("rowheader", { name: "Day 1 · Sat 25 Apr" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("rowheader", { name: "Day 3 · Mon 27 Apr" }),
    ).toBeTruthy();
    await save();
    expect(saveMealPlanAction).toHaveBeenCalledWith({
      daysOnSite: 3,
      firstDay: "2026-04-25",
      days: DAYS,
      expectedVersion: 4,
    });
  });

  it("lets a Kitchen lead and a captain edit, and no lead of another team", async () => {
    for (const [rank, leads] of [
      ["team_lead", ["kitchen"]],
      ["captain", []],
    ] as const) {
      await renderAs(rank, [...leads]);
      expect(screen.getByRole("button", { name: "Save" })).toBeTruthy();
      expect(plates("Day 2 dinner").value).toBe("50");
      cleanup();
    }
    await renderAs("team_lead", ["structures"]);
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
  });

  it("starts from 11 days and saves the plates the lead typed, with the version it opened", async () => {
    await renderAs("team_lead", ["kitchen"], {
      daysOnSite: 11,
      days: Array.from({ length: 11 }, () => ({
        breakfast: 0,
        lunch: 0,
        dinner: 0,
      })),
      version: 0,
    });
    expect(plates("Days on site").value).toBe("11");
    expect(screen.getByText("Day 11")).toBeTruthy();
    fireEvent.change(plates("Days on site"), { target: { value: "2" } });
    expect(screen.queryByText("Day 3")).toBeNull();
    fireEvent.change(plates("Day 1 breakfast"), { target: { value: "20" } });
    fireEvent.change(plates("Day 1 dinner"), { target: { value: "25" } });
    fireEvent.change(plates("Day 2 lunch"), { target: { value: "" } });
    await save();
    expect(saveMealPlanAction).toHaveBeenCalledWith({
      daysOnSite: 2,
      firstDay: null,
      days: [
        { breakfast: 20, lunch: 0, dinner: 25 },
        { breakfast: 0, lunch: 0, dinner: 0 },
      ],
      expectedVersion: 0,
    });
    expect(toast.success).toHaveBeenCalledWith("Meal plan saved");
    expect(refresh).toHaveBeenCalled();
  });

  it("keeps the days already filled in when the days on site grow", async () => {
    await renderAs("captain");
    fireEvent.change(plates("Days on site"), { target: { value: "4" } });
    expect(plates("Day 3 dinner").value).toBe("60");
    expect(plates("Day 4 dinner").value).toBe("0");
  });

  it("copies Day 1 to every day", async () => {
    await renderAs("captain");
    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: "Copy Day 1 to every day" }),
      );
    });
    await save();
    expect(saveMealPlanAction).toHaveBeenCalledWith({
      daysOnSite: 3,
      firstDay: null,
      days: [DAYS[0], DAYS[0], DAYS[0]],
      expectedVersion: 4,
    });
  });

  it("puts a wrong number beside its field, and sends nothing", async () => {
    await renderAs("captain");
    fireEvent.change(plates("Day 2 lunch"), { target: { value: "501" } });
    fireEvent.change(plates("Day 3 breakfast"), { target: { value: "4.5" } });
    await save();
    expect(saveMealPlanAction).not.toHaveBeenCalled();
    const lunch = plates("Day 2 lunch");
    expect(lunch.getAttribute("aria-invalid")).toBe("true");
    expect(
      document.getElementById(lunch.getAttribute("aria-describedby")!)
        ?.textContent,
    ).toBe("Give at most 500 plates.");
    expect(plates("Day 3 breakfast").getAttribute("aria-invalid")).toBe("true");

    fireEvent.change(plates("Day 2 lunch"), { target: { value: "0" } });
    fireEvent.change(plates("Day 3 breakfast"), { target: { value: "45" } });
    fireEvent.change(plates("Days on site"), { target: { value: "31" } });
    await save();
    expect(screen.getByText("Count at most 30 days.")).toBeTruthy();
    expect(saveMealPlanAction).not.toHaveBeenCalled();
  });

  it("says why a save was refused, beside Save", async () => {
    vi.mocked(saveMealPlanAction).mockResolvedValue({
      ok: false,
      error: "Someone changed the meal plan first. Reload the page.",
    });
    await renderAs("captain");
    await save();
    expect(screen.getByRole("alert").textContent).toBe(
      "Someone changed the meal plan first. Reload the page.",
    );
    expect(refresh).not.toHaveBeenCalled();
  });

  describe("the menu inside it (#244)", () => {
    const item = (
      id: string,
      day: number,
      meal: "breakfast" | "lunch" | "dinner",
      recipeId: string,
      position = 1,
    ) => ({ id, day, meal, recipeId, position });

    // Camp dal is verified at 50 and 25 plates; Rice only at 50, and Claude
    // is on 25 for it. A recipe on day 4 is past the 3 days on site.
    const MENU: KitchenMenu = {
      cycle: 2026,
      items: [
        item("i1", 1, "dinner", DAL, 1),
        item("i2", 1, "dinner", RICE, 2),
        item("i3", 2, "dinner", RICE),
        item("i4", 3, "breakfast", DAL),
        item("i5", 4, "dinner", DAL),
      ],
      recipes: {
        [DAL]: {
          recipeId: DAL,
          title: "Camp dal",
          versionId: "v-dal",
          categories: [],
          counts: [
            { plates: 25, lines: [] },
            { plates: 50, lines: [] },
          ],
          openPlates: [],
        },
        [RICE]: {
          recipeId: RICE,
          title: "Rice",
          versionId: "v-rice",
          categories: [],
          counts: [{ plates: 50, lines: [] }],
          openPlates: [25],
        },
      },
    };

    const recipes = (name: string) =>
      screen.queryByRole("list", { name: `Recipes for ${name}` });

    it("shows every member each meal's recipes, each on its own line, with where its count stands", async () => {
      await renderAs("camp_member", [], undefined, MENU);
      const dinner = recipes("Day 1, dinner")!;
      expect(
        within(dinner)
          .getAllByRole("listitem")
          .map((li) => li.textContent),
      ).toEqual(["Camp dalVerified", "RiceWith Claude…"]);
      expect(
        within(dinner).getByRole("link", { name: "Camp dal" }),
      ).toHaveProperty(
        "href",
        expect.stringContaining(`/kitchen/recipes/${DAL}?plates=25`),
      );
      // Day 2 dinner is 50 plates: Rice is verified there.
      expect(recipes("Day 2, dinner")!.textContent).toBe("RiceVerified");
      // Day 3 breakfast is 45 plates, which Camp dal has no count for.
      expect(recipes("Day 3, breakfast")!.textContent).toBe(
        "Camp dalNot proofread yet",
      );
      // Day 4 is past the days on site: left off.
      expect(recipes("Day 4, dinner")).toBeNull();
      expect(screen.queryByRole("button")).toBeNull();
    });

    it("gives a Kitchen lead the add, the take-off and Proofread for N; no add on a meal with no plates", async () => {
      await renderAs("team_lead", ["kitchen"], undefined, MENU);
      expect(
        screen.getByRole("button", { name: "Add a recipe to Day 1, dinner" }),
      ).toBeTruthy();
      // Lunch on day 1 is 0 plates.
      expect(
        screen.queryByRole("button", { name: "Add a recipe to Day 1, lunch" }),
      ).toBeNull();
      expect(
        screen.getByRole("button", { name: "Take Rice off Day 1, dinner" }),
      ).toBeTruthy();
      expect(
        within(recipes("Day 3, breakfast")!).getByRole("button", {
          name: "Proofread for 45",
        }),
      ).toBeTruthy();
      expect(listRecipeBook).toHaveBeenCalled();
    });

    it("gives a lead of another team the same read-only menu", async () => {
      await renderAs("team_lead", ["structures"], undefined, MENU);
      expect(recipes("Day 1, dinner")).toBeTruthy();
      expect(screen.queryByRole("button")).toBeNull();
      expect(listRecipeBook).not.toHaveBeenCalled();
    });
  });
});
