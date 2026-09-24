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
vi.mock("./actions", () => ({ saveMealPlanAction: vi.fn() }));
vi.mock("@camp404/ui/components/toast", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));
const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh, push: vi.fn() }),
}));

import { toast } from "@camp404/ui/components/toast";
import { captainPageGate } from "@/lib/captain-gate";
import { getMealPlan } from "@/lib/meal-plan";
import { getLeadTeams } from "@/lib/users";
import { saveMealPlanAction } from "./actions";
import MealPlanPage from "./page";

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
    expect(rows.map((r) => r.textContent)).toEqual([
      "Day 1" + "20" + "0" + "25",
      "Day 2" + "45" + "0" + "50",
      "Day 3" + "45" + "10" + "60",
    ]);
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Copy Day 1 to every day" }),
    ).toBeNull();
    expect(screen.queryByRole("spinbutton")).toBeNull();
    expect(getLeadTeams).not.toHaveBeenCalled();
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
});
