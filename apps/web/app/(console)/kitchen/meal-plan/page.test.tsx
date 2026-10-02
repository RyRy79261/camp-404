import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The meal plan page, in the two views the owner approved on 2026-10-01: a
// Kitchen lead or a captain edits the week as a table, Day | Breakfast |
// Dinner, with Save in the heading, "Copy Day 1's plates to every day", each
// meal's recipes under its plates and the recipe picker
// (design/approved-kmp.html A, approved-rp.html B); every other member reads
// the menu as a card per day (approved-kmenu.html A). The camp does no lunch.
// A save sends the whole plan with the version the page opened; a problem
// with a number shows beside it, a refusal beside Save.

vi.mock("@/lib/captain-gate", () => ({ captainPageGate: vi.fn() }));
vi.mock("@/lib/users", () => ({ getLeadTeams: vi.fn() }));
vi.mock("@/lib/meal-plan", () => ({ getMealPlan: vi.fn() }));
vi.mock("@/lib/kitchen-menu", () => ({
  getKitchenMenu: vi.fn(),
  getSnacks: vi.fn(),
  listMenuBook: vi.fn(),
  getMenuDietaryFor: vi.fn(async () => null),
  getMealChecks: vi.fn(async () => ({ plans: [], prepSteps: [] })),
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
const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh, push: vi.fn() }),
}));

import { DAY_ONE_NEEDED_FOR_PREP } from "@camp404/types";
import { toast } from "@camp404/ui/components/toast";
import type { KitchenMenu, MenuBookRecipe } from "@camp404/db/kitchen-menu";
import { captainPageGate } from "@/lib/captain-gate";
import { getKitchenMenu, getSnacks, listMenuBook } from "@/lib/kitchen-menu";
import { getMealPlan } from "@/lib/meal-plan";
import { getLeadTeams } from "@/lib/users";
import { addMenuItemAction, saveMealPlanAction } from "./actions";
import MealPlanPage from "./page";

const DAL = "00000000-0000-4000-8000-000000000001";
const RICE = "00000000-0000-4000-8000-000000000002";
const CURRY = "00000000-0000-4000-8000-000000000003";

const NO_MENU: KitchenMenu = { cycle: 2026, items: [], recipes: {} };

const DAYS = [
  { breakfast: 0, dinner: 25 },
  { breakfast: 45, dinner: 50 },
  { breakfast: 45, dinner: 60 },
];

// By name, as the server lists it.
const BOOK: MenuBookRecipe[] = [
  {
    id: CURRY,
    title: "Butternut curry",
    summary: null,
    totalMinutes: 55,
    readyPlates: [20, 40],
    openPlates: [],
  },
  {
    id: DAL,
    title: "Camp dal",
    summary: "Red lentils, tomato and coconut",
    totalMinutes: 70,
    readyPlates: [25, 50],
    openPlates: [],
  },
  {
    id: RICE,
    title: "Rice",
    summary: "Steamed",
    totalMinutes: null,
    readyPlates: [50],
    openPlates: [25],
  },
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
  snacks = [] as { id: string; name: string; amount: string | null }[],
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
  vi.mocked(getSnacks).mockResolvedValue(snacks);
  vi.mocked(listMenuBook).mockResolvedValue(BOOK);
  render(await MealPlanPage());
}

const plates = (label: string) =>
  screen.getByLabelText(label) as HTMLInputElement;
const save = async () => {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
  });
};

const item = (
  id: string,
  day: number,
  meal: "breakfast" | "dinner",
  recipeId: string,
  position = 1,
) => ({ id, day, meal, recipeId, position });

// Camp dal is verified at 50 and 25 plates; Rice only at 50, and Claude is
// on 25 for it. A recipe on day 4 is past the 3 days on site.
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
      allergens: [],
      allergensMarked: false,
      allergenRevision: 0,
    },
    [RICE]: {
      recipeId: RICE,
      title: "Rice",
      versionId: "v-rice",
      categories: [],
      counts: [{ plates: 50, lines: [] }],
      openPlates: [25],
      allergens: [],
      allergensMarked: false,
      allergenRevision: 0,
    },
  },
};

const recipes = (name: string) =>
  screen.queryByRole("list", { name: `Recipes for ${name}` });

afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(saveMealPlanAction).mockResolvedValue({
    ok: true,
    data: { version: 5 },
  });
  vi.mocked(addMenuItemAction).mockResolvedValue({
    ok: true,
    data: { itemId: "new" },
  });
});

describe("the menu as a member reads it", () => {
  it("is a card per day with breakfast and dinner, the dishes as links, and nothing to change", async () => {
    await renderAs(
      "camp_member",
      [],
      { daysOnSite: 3, days: DAYS, version: 4, firstDay: "2026-04-29" },
      MENU,
      [{ id: "s1", name: "Rusks", amount: "6 boxes" }],
    );
    expect(
      screen.getByRole("heading", { level: 1, name: "Meal plan" }),
    ).toBeTruthy();
    expect(
      screen.getByText(
        "What the camp eats each day. Tap a dish to read its recipe.",
      ),
    ).toBeTruthy();
    // Across a month end: 29 April to 1 May.
    expect(screen.getByText("Wed 29 Apr – Fri 1 May")).toBeTruthy();
    expect(screen.getByText("3 days on site")).toBeTruthy();

    const days = screen.getAllByRole("region");
    expect(days.map((d) => d.getAttribute("aria-labelledby"))).toEqual([
      "menu-day-1",
      "menu-day-2",
      "menu-day-3",
      "menu-snacks",
    ]);
    expect(
      within(days[0]!)
        .getAllByRole("heading", { level: 3 })
        .map((h) => h.textContent),
    ).toEqual(["Breakfast", "Dinner"]);
    // Day 1 has no breakfast; day 3's dinner has plates and no dish yet.
    expect(
      within(days[0]!).getByText("No camp breakfast this day"),
    ).toBeTruthy();
    expect(within(days[2]!).getByText("Dishes not chosen yet")).toBeTruthy();
    expect(within(days[0]!).getByText("25")).toBeTruthy();

    const dinner = recipes("Day 1, dinner")!;
    expect(
      within(dinner)
        .getAllByRole("link")
        .map((a) => a.textContent),
    ).toEqual(["Camp dal", "Rice"]);
    expect(
      within(dinner).getByRole("link", { name: "Camp dal" }),
    ).toHaveProperty(
      "href",
      expect.stringContaining(`/kitchen/recipes/${DAL}?plates=25`),
    );
    // Day 4 is past the days on site: left off.
    expect(recipes("Day 4, dinner")).toBeNull();
    // No proofreading words, no controls, and never the book.
    expect(screen.queryByText(/Verified|With Claude|Proofread/)).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByRole("spinbutton")).toBeNull();
    expect(listMenuBook).not.toHaveBeenCalled();
    expect(getLeadTeams).not.toHaveBeenCalled();
    // The snacks come last.
    expect(
      within(screen.getByRole("list", { name: "Snacks" })).getByText("6 boxes"),
    ).toBeTruthy();
  });

  it("has no lunch anywhere", async () => {
    await renderAs("camp_member", [], undefined, MENU);
    expect(screen.queryByText(/lunch/i)).toBeNull();
    cleanup();
    await renderAs("captain", [], undefined, MENU);
    expect(screen.queryByText(/lunch/i)).toBeNull();
    expect(screen.queryByLabelText(/lunch/i)).toBeNull();
  });

  it("is what a lead of another team reads too", async () => {
    await renderAs("team_lead", ["structures"], undefined, MENU);
    expect(recipes("Day 1, dinner")).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
    expect(listMenuBook).not.toHaveBeenCalled();
  });
});

describe("the meal plan as a Kitchen lead edits it", () => {
  it("is the week as a table, Day | Breakfast | Dinner, for a Kitchen lead and a captain", async () => {
    for (const [rank, leads] of [
      ["team_lead", ["kitchen"]],
      ["captain", []],
    ] as const) {
      await renderAs(rank, [...leads]);
      const table = screen.getByRole("table", { name: "Plates per day" });
      expect(
        within(table)
          .getAllByRole("columnheader")
          .map((h) => h.textContent),
      ).toEqual(["Day", "Breakfast", "Dinner"]);
      expect(
        within(table)
          .getAllByRole("rowheader")
          .map((h) => h.textContent),
      ).toEqual(["Day 1", "Day 2", "Day 3"]);
      expect(screen.getByRole("button", { name: "Save" })).toBeTruthy();
      expect(plates("Day 2 dinner").value).toBe("50");
      cleanup();
    }
  });

  it("dates every day from the date of day 1, and saves it", async () => {
    await renderAs("team_lead", ["kitchen"]);
    const date = screen.getByLabelText("Day 1 date") as HTMLInputElement;
    expect(date.type).toBe("date");
    expect(date.value).toBe("");
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

  it("starts from 11 days and saves the plates typed, with the version it opened", async () => {
    await renderAs("team_lead", ["kitchen"], {
      daysOnSite: 11,
      days: Array.from({ length: 11 }, () => ({ breakfast: 0, dinner: 0 })),
      version: 0,
    });
    expect(plates("Days on site").value).toBe("11");
    expect(screen.getByRole("rowheader", { name: "Day 11" })).toBeTruthy();
    fireEvent.change(plates("Days on site"), { target: { value: "2" } });
    expect(screen.queryByRole("rowheader", { name: "Day 3" })).toBeNull();
    fireEvent.change(plates("Day 1 breakfast"), { target: { value: "20" } });
    fireEvent.change(plates("Day 1 dinner"), { target: { value: "25" } });
    fireEvent.change(plates("Day 2 dinner"), { target: { value: "" } });
    await save();
    expect(saveMealPlanAction).toHaveBeenCalledWith({
      daysOnSite: 2,
      firstDay: null,
      days: [
        { breakfast: 20, dinner: 25 },
        { breakfast: 0, dinner: 0 },
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

  it("copies Day 1's plates to every day", async () => {
    await renderAs("captain");
    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", {
          name: "Copy Day 1’s plates to every day",
        }),
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
    fireEvent.change(plates("Day 2 dinner"), { target: { value: "501" } });
    fireEvent.change(plates("Day 3 breakfast"), { target: { value: "4.5" } });
    await save();
    expect(saveMealPlanAction).not.toHaveBeenCalled();
    const dinner = plates("Day 2 dinner");
    expect(dinner.getAttribute("aria-invalid")).toBe("true");
    expect(
      document.getElementById(dinner.getAttribute("aria-describedby")!)
        ?.textContent,
    ).toBe("Give at most 500 plates.");
    expect(plates("Day 3 breakfast").getAttribute("aria-invalid")).toBe("true");

    fireEvent.change(plates("Day 2 dinner"), { target: { value: "50" } });
    fireEvent.change(plates("Day 3 breakfast"), { target: { value: "45" } });
    fireEvent.change(plates("Days on site"), { target: { value: "31" } });
    await save();
    expect(screen.getByText("Count at most 30 days.")).toBeTruthy();
    expect(saveMealPlanAction).not.toHaveBeenCalled();
  });

  it("says beside the date when Day 1 cannot be cleared while there are prep steps", async () => {
    await renderAs("captain", [], {
      daysOnSite: 3,
      days: DAYS,
      version: 4,
      firstDay: "2026-04-25",
    });
    vi.mocked(saveMealPlanAction).mockResolvedValueOnce({
      ok: false,
      error: DAY_ONE_NEEDED_FOR_PREP,
    });
    fireEvent.change(screen.getByLabelText("Day 1 date"), {
      target: { value: "" },
    });
    await save();
    expect(document.getElementById("first-day-error")?.textContent).toBe(
      DAY_ONE_NEEDED_FOR_PREP,
    );
    expect(
      screen.getByLabelText("Day 1 date").getAttribute("aria-invalid"),
    ).toBe("true");
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

  it("lists each meal's recipes with where its count stands, the take-off, and the add only where there are plates", async () => {
    await renderAs("team_lead", ["kitchen"], undefined, MENU);
    const dinner = recipes("Day 1, dinner")!;
    expect(
      within(dinner)
        .getAllByRole("listitem")
        .map((li) => li.textContent),
    ).toEqual([
      // #245: under each recipe, its allergy line (these versions were
      // written before Claude marked allergens) and "+ Prep step".
      "Camp dalVerified×Allergens not marked yet.+ Prep stepChange allergens",
      "RiceWith Claude…×Allergens not marked yet.+ Prep stepChange allergens",
      "+ Add a recipe",
    ]);
    expect(
      within(dinner).getByRole("button", {
        name: "Take Rice off Day 1, dinner",
      }),
    ).toBeTruthy();
    // Day 3 breakfast is 45 plates, which Camp dal has no count for.
    expect(
      within(recipes("Day 3, breakfast")!).getByRole("button", {
        name: "Proofread for 45 plates",
      }),
    ).toBeTruthy();
    // Day 1 breakfast is 0 plates: no add, and it says so.
    expect(
      screen.queryByRole("button", {
        name: "Add a recipe to Day 1, breakfast",
      }),
    ).toBeNull();
    expect(
      within(recipes("Day 1, breakfast")!).getByText(
        "No breakfast this day. Set plates to add a recipe.",
      ),
    ).toBeTruthy();
    expect(listMenuBook).toHaveBeenCalled();
  });
});

/** The screen's width, as the picker (portalled, outside the window) asks it. */
function screenIsWide(wide: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: wide,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
}

describe("the recipe picker", () => {
  const original = window.matchMedia;
  beforeEach(() => screenIsWide(true));
  afterEach(() => {
    window.matchMedia = original;
  });

  async function openPicker(meal: string) {
    await renderAs("team_lead", ["kitchen"], undefined, MENU);
    fireEvent.click(
      screen.getByRole("button", { name: `Add a recipe to ${meal}` }),
    );
    return screen.getByRole("dialog", { name: /Add recipes to/ });
  }

  it("lists the book with where each recipe stands for the meal's plates, its time and the other meals it is on", async () => {
    const picker = await openPicker("Day 2, dinner");
    expect(within(picker).getByText("Day 2 · 50 plates")).toBeTruthy();
    const table = within(picker).getByRole("table");
    const rows = within(table).getAllByRole("row").slice(1);
    // Proofread for these plates first, then the rest, each by name.
    expect(rows.map((r) => r.textContent)).toEqual([
      "Camp dalRed lentils, tomato and coconut" +
        "ProofreadReady to cook" +
        "1 h 10" +
        "Day 1, dinner +1" +
        "Add to dinner",
      // Rice is already on day 2 dinner, and on day 1 dinner too.
      "RiceSteamed" +
        "ProofreadReady to cook" +
        "—" +
        "Day 1, dinner" +
        "On dinner",
      "Butternut curry" +
        "Not proofreadDone for 20, 40 only" +
        "55 min" +
        "—" +
        "Add to dinner",
    ]);
    expect(within(picker).getByText("Rice", { selector: "b" })).toBeTruthy();
  });

  it("filters by name and by whether the recipe is proofread for these plates", async () => {
    const picker = await openPicker("Day 2, dinner");
    const filter = within(picker).getByRole("group", {
      name: "Filter by proofreading for 50 plates",
    });
    expect(
      within(filter)
        .getAllByRole("button")
        .map((b) => b.textContent),
    ).toEqual(["All3", "Proofread2", "Not proofread1"]);
    fireEvent.click(within(filter).getByRole("button", { name: /^Not/ }));
    expect(
      within(picker)
        .getAllByRole("row")
        .slice(1)
        .map((r) => r.querySelector("td")?.textContent),
    ).toEqual(["Butternut curry"]);
    fireEvent.click(within(filter).getByRole("button", { name: /^All/ }));
    fireEvent.change(within(picker).getByLabelText("Search the recipe book"), {
      target: { value: "DAL" },
    });
    expect(
      within(picker)
        .getAllByRole("row")
        .slice(1)
        .map((r) => r.querySelector("td")?.textContent),
    ).toEqual(["Camp dalRed lentils, tomato and coconut"]);
  });

  it("adds a recipe and stays open, the row turning to On dinner; Done closes it", async () => {
    const picker = await openPicker("Day 2, dinner");
    await act(async () => {
      fireEvent.click(
        within(picker).getByRole("button", {
          name: "Add Camp dal to Day 2, dinner",
        }),
      );
    });
    expect(addMenuItemAction).toHaveBeenCalledWith({
      day: 2,
      meal: "dinner",
      recipeId: DAL,
    });
    expect(refresh).toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBe(picker);
    expect(
      within(picker).queryByRole("button", {
        name: "Add Camp dal to Day 2, dinner",
      }),
    ).toBeNull();
    expect(within(picker).getByText("Rice, Camp dal")).toBeTruthy();
    fireEvent.click(within(picker).getByRole("button", { name: "Done" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("adds the highlighted row with Enter, moved by the arrow keys", async () => {
    const picker = await openPicker("Day 2, dinner");
    const search = within(picker).getByLabelText("Search the recipe book");
    fireEvent.keyDown(search, { key: "ArrowDown" });
    fireEvent.keyDown(search, { key: "ArrowDown" });
    fireEvent.keyDown(search, { key: "ArrowDown" });
    fireEvent.keyDown(search, { key: "ArrowUp" });
    fireEvent.keyDown(search, { key: "ArrowDown" });
    await act(async () => {
      fireEvent.keyDown(search, { key: "Enter" });
    });
    expect(addMenuItemAction).toHaveBeenCalledWith({
      day: 2,
      meal: "dinner",
      recipeId: CURRY,
    });
  });

  it("keeps a refused add as it was, with a toast", async () => {
    vi.mocked(addMenuItemAction).mockResolvedValue({
      ok: false,
      error: "That meal has as many recipes as it can take.",
    });
    const picker = await openPicker("Day 2, dinner");
    await act(async () => {
      fireEvent.click(
        within(picker).getByRole("button", {
          name: "Add Camp dal to Day 2, dinner",
        }),
      );
    });
    expect(toast.error).toHaveBeenCalledWith(
      "That meal has as many recipes as it can take.",
    );
    expect(
      within(picker).getByRole("button", {
        name: "Add Camp dal to Day 2, dinner",
      }),
    ).toBeTruthy();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("is a full sheet of cards on a phone", async () => {
    screenIsWide(false);
    const picker = await openPicker("Day 2, dinner");
    expect(within(picker).queryByRole("table")).toBeNull();
    const cards = within(
      within(picker).getByRole("list", {
        name: "The recipe book, for Day 2, dinner",
      }),
    ).getAllByRole("listitem");
    expect(cards).toHaveLength(3);
    const dal = cards[0]!;
    expect(within(dal).getByText("Proofread")).toBeTruthy();
    expect(within(dal).getByText("1 h 10")).toBeTruthy();
    expect(
      within(dal).getByText("Day 1, dinner; Day 3, breakfast"),
    ).toBeTruthy();
    expect(
      within(dal).getByRole("button", {
        name: "Add Camp dal to Day 2, dinner",
      }),
    ).toBeTruthy();
    expect(within(cards[1]!).getByText("On dinner")).toBeTruthy();
    expect(within(cards[2]!).getByText("Butternut curry")).toBeTruthy();
    expect(
      within(picker).getByPlaceholderText("Search 3 recipes by name"),
    ).toBeTruthy();
  });
});
