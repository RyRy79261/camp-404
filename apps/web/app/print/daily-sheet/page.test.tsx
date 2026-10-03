import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The daily site sheet (#249): a lead or a captain prints one day or every
// day, each day a sheet of team sections and a General page; a member is
// refused outside the sheet (no PDF), because the Kitchen's allergy line is
// safety data. The real assembly (lib/daily-sheet.ts) runs here over mocked
// reads that carry full names and contact details, and the sheet shows first
// names only and none of the rest.

vi.mock("@/lib/captain-gate", () => ({ captainPageGate: vi.fn() }));
vi.mock("@/lib/audit", () => ({ auditReadsAfterResponse: vi.fn() }));
vi.mock("@/lib/test-mode", () => ({ usesTestStore: vi.fn(() => false) }));
vi.mock("@/lib/test-store-shifts", () => ({ shiftsTestStore: {} }));
vi.mock("@/lib/test-store-daily-sheet", () => ({ dailySheetTestStore: {} }));
vi.mock("@/lib/camp-config", () => ({ getCampSettings: vi.fn() }));
vi.mock("@camp404/db/shifts", () => ({
  readShiftRoster: vi.fn(),
  readBurnDays: vi.fn(),
}));
vi.mock("@camp404/db/daily-sheet", () => ({ listSheetAllergies: vi.fn() }));
vi.mock("@/lib/meal-plan", () => ({ getMealPlan: vi.fn() }));
vi.mock("@/lib/kitchen-menu", () => ({
  getKitchenMenu: vi.fn(),
  listSheetPrepSteps: vi.fn(async () => []),
}));
vi.mock("@/lib/lounge", () => ({ getLoungeProgramme: vi.fn() }));
vi.mock("@/lib/camp-calendar", () => ({ getUpcomingEvents: vi.fn() }));
vi.mock("@/lib/google-calendar", () => ({
  CALENDAR_PAGE_RANGE: { days: 365, max: 250 },
}));

import { listSheetAllergies } from "@camp404/db/daily-sheet";
import { readBurnDays, readShiftRoster } from "@camp404/db/shifts";
import { auditReadsAfterResponse } from "@/lib/audit";
import { getUpcomingEvents } from "@/lib/camp-calendar";
import { getCampSettings } from "@/lib/camp-config";
import { captainPageGate } from "@/lib/captain-gate";
import { getKitchenMenu, listSheetPrepSteps } from "@/lib/kitchen-menu";
import { getLoungeProgramme } from "@/lib/lounge";
import { getMealPlan } from "@/lib/meal-plan";
import { PRINT_SHEET_ATTR } from "@/lib/print";
import DailySheetPrintPage from "./page";

const D1 = "2027-04-27";
const D2 = "2027-04-28";

function gate(rank: "camp_member" | "team_lead" | "captain") {
  vi.mocked(captainPageGate).mockResolvedValue({
    campUser: { id: "viewer" },
    rank,
    cleared: rank !== "camp_member",
  } as never);
}

function open(day?: string) {
  return DailySheetPrintPage({ searchParams: Promise.resolve({ day }) });
}

beforeEach(() => {
  vi.clearAllMocks();
  gate("team_lead");
  vi.mocked(getCampSettings).mockResolvedValue({
    cycleNumber: 2027,
    current: { year: 2027, burnStart: D1, burnEnd: D2 },
    teams: {
      teams: [
        { key: "kitchen", label: "Kitchen" },
        { key: "sanitation_and_water", label: "Sanitation and MOOP" },
        { key: "power_and_lighting", label: "Power and Lighting" },
      ],
    },
  } as never);
  vi.mocked(readBurnDays).mockResolvedValue([D1, D2]);
  vi.mocked(readShiftRoster).mockResolvedValue({
    types: [
      {
        id: "t-cook",
        cycle: 2027,
        team: "kitchen",
        name: "Breakfast cooks",
        startMinute: 7 * 60,
        durationMinutes: 120,
        places: 3,
        note: "Call Sipho on 082 555 1234 if the gas runs out",
        dutyCardId: "card-cooks",
        dutyCard: {
          id: "card-cooks",
          slug: "breakfast-cooking",
          title: "Breakfast cooking",
        },
        version: 1,
      },
      {
        id: "t-bins",
        cycle: 2027,
        team: "sanitation_and_water",
        name: "Bins and MOOP",
        startMinute: 15 * 60,
        durationMinutes: 30,
        places: 2,
        note: null,
        dutyCardId: null,
        dutyCard: null,
        version: 1,
      },
    ],
    slots: [
      { id: "s1", typeId: "t-cook", day: D1, status: "open", version: 1 },
      { id: "s2", typeId: "t-bins", day: D1, status: "open", version: 1 },
      { id: "s3", typeId: "t-bins", day: D2, status: "open", version: 1 },
    ],
    signups: [
      {
        slotId: "s1",
        userId: "u1",
        name: "Sipho Dlamini",
        addedByUserId: null,
      },
      {
        slotId: "s1",
        userId: "u2",
        name: "Naledi Mokoena",
        addedByUserId: null,
      },
      { slotId: "s2", userId: "u3", name: "Tumi Khumalo", addedByUserId: null },
      { slotId: "s3", userId: "u3", name: "Tumi Khumalo", addedByUserId: null },
      // A member with no name yet is never printed by their email.
      {
        slotId: "s3",
        userId: "u5",
        name: "kyle@example.com",
        addedByUserId: null,
      },
    ],
  });
  vi.mocked(listSheetAllergies).mockResolvedValue([
    {
      userId: "u4",
      name: "Megan van der Berg",
      allergies: "Nuts",
      isAnaphylactic: true,
      foods: null,
    },
    {
      userId: "u2",
      name: "Naledi Mokoena",
      allergies: "No egg",
      isAnaphylactic: false,
      foods: null,
    },
  ]);
  vi.mocked(getMealPlan).mockResolvedValue({
    cycle: 2027,
    daysOnSite: 11,
    firstDay: D1,
    days: [],
    version: 1,
    updatedAt: null,
  });
  vi.mocked(getKitchenMenu).mockResolvedValue({
    cycle: 2027,
    items: [
      { id: "m1", day: 1, meal: "breakfast", position: 1, recipeId: "r1" },
      { id: "m2", day: 1, meal: "dinner", position: 1, recipeId: "r2" },
    ],
    recipes: {
      r1: { title: "Shakshuka", counts: [{ plates: 40, lines: [] }] },
      r2: { title: "Bobotie", counts: [{ plates: 40, lines: [] }] },
    },
  } as never);
  vi.mocked(getLoungeProgramme).mockResolvedValue({
    offers: [
      {
        id: "o1",
        title: "Kombucha tasting",
        description: "Bring a cup",
        kind: "workshop",
        durationMinutes: 60,
        hostName: "Lerato Ndlovu",
      },
    ],
    slots: [{ id: "l1", offerId: "o1", day: 1, startMinute: 14 * 60 }],
  } as never);
  vi.mocked(getUpcomingEvents).mockResolvedValue({
    status: "ok",
    events: [
      {
        id: "e1",
        title: "Camp circle",
        start: `${D1}T19:00:00Z`,
        allDay: false,
        location: "Dome",
        teamTag: null,
      },
    ],
  });
});

afterEach(cleanup);

describe("the daily site sheet print", () => {
  it("refuses a member outside the sheet, and reads nothing", async () => {
    gate("camp_member");
    const { container } = render(await open(D1));
    expect(captainPageGate).toHaveBeenCalledWith("team_lead");
    expect(screen.getByText(/Only captains and team leads/)).toBeTruthy();
    expect(container.querySelector(`[${PRINT_SHEET_ATTR}]`)).toBeNull();
    expect(listSheetAllergies).not.toHaveBeenCalled();
    expect(readShiftRoster).not.toHaveBeenCalled();
    expect(auditReadsAfterResponse).not.toHaveBeenCalled();
  });

  it("gives a lead the day's sheet: team sections, dishes, allergies, events, and the General page", async () => {
    const { container } = render(await open(D1));
    expect(container.querySelector(`[${PRINT_SHEET_ATTR}]`)).toBeTruthy();
    expect(container.innerHTML).toContain("A4 landscape");

    const sheet = screen.getByRole("region", { name: "Day 1 sheet" });
    expect(
      within(sheet).getByRole("heading", {
        level: 2,
        name: "Day 1 · Tuesday 27 April",
      }),
    ).toBeTruthy();
    const kitchen = within(sheet).getByRole("region", { name: "Kitchen" });
    expect(kitchen.textContent).toContain("Breakfast cooks");
    expect(kitchen.textContent).toContain("07:00–09:00");
    expect(kitchen.textContent).toContain("Sipho, Naledi");
    // The details are on the duty card: the task names it (#250).
    expect(within(kitchen).getByTestId("sheet-task-card").textContent).toBe(
      "Card: Breakfast cooking",
    );
    // One open place: a line to write a name on.
    expect(within(kitchen).getAllByLabelText("Open place")).toHaveLength(1);
    expect(kitchen.textContent).toContain("Shakshuka");
    expect(kitchen.textContent).toContain("Bobotie");
    expect(kitchen.textContent).toContain("Nuts (severe) Megan");
    expect(kitchen.textContent).toContain("No egg Naledi");
    const san = within(sheet).getByRole("region", {
      name: "Sanitation and MOOP",
    });
    expect(san.textContent).toContain("Tumi");
    expect(within(san).queryByTestId("sheet-task-card")).toBeNull();
    // Only teams with tasks that day.
    expect(
      within(sheet).queryByRole("region", { name: "Power and Lighting" }),
    ).toBeNull();
    const events = within(sheet).getByRole("region", {
      name: "Today's events",
    });
    expect(events.textContent).toContain("14:00Kombucha tasting · Lounge");
    // 19:00 UTC is 21:00 camp time.
    expect(events.textContent).toContain("21:00Camp circle · Dome");
    expect(within(sheet).getByRole("region", { name: "Notes" })).toBeTruthy();

    const general = screen.getByRole("region", { name: "Day 1 General page" });
    expect(within(general).getAllByTestId("general-row")).toHaveLength(20);
    expect(general.textContent).toContain("Asked by");
    expect(general.textContent).not.toContain("Tumi");

    // The read of each member's allergy is recorded.
    expect(auditReadsAfterResponse).toHaveBeenCalledWith([
      expect.objectContaining({
        actorId: "viewer",
        action: "safety.allergies.view",
        target: "u4",
      }),
      expect.objectContaining({ target: "u2" }),
    ]);
  });

  it("prints first names only, and no shift details, hosts or contact details", async () => {
    const { container } = render(await open("all"));
    const text =
      container.querySelector(`[${PRINT_SHEET_ATTR}]`)?.textContent ?? "";
    expect(text).toContain("Camp member");
    for (const surname of [
      "Dlamini",
      "Mokoena",
      "Khumalo",
      "van der Berg",
      "Ndlovu",
    ]) {
      expect(text).not.toContain(surname);
    }
    expect(text).not.toMatch(/@|082|555 1234|gas runs out|Bring a cup/);
    expect(text).not.toMatch(/plates|\b40\b/);
    expect(text).not.toMatch(/Lerato/);
  });

  it("prints every day as a sheet and a General page each", async () => {
    render(await open("all"));
    expect(screen.getByRole("region", { name: "Day 1 sheet" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "Day 2 sheet" })).toBeTruthy();
    expect(
      screen.getByRole("region", { name: "Day 2 General page" }),
    ).toBeTruthy();
    expect(screen.getAllByText(/page \d of 4/)).toHaveLength(4);
    // Day 2 has no Kitchen task and no menu: no Kitchen section, no allergies.
    const day2 = screen.getByRole("region", { name: "Day 2 sheet" });
    expect(within(day2).queryByRole("region", { name: "Kitchen" })).toBeNull();
    expect(day2.textContent).not.toContain("Allergies");
  });

  it("prints a Kitchen prep step due on site as a short line on its day, and gives that day a Kitchen section (#245)", async () => {
    vi.mocked(listSheetPrepSteps).mockResolvedValue([
      {
        dueDate: D2,
        what: "Soak the oats",
        recipeTitle: "Overnight oats",
        day: 3,
        meal: "breakfast",
      },
      {
        dueDate: "2027-04-20",
        what: "Cook the chilli base",
        recipeTitle: "Chilli sin carne",
        day: 3,
        meal: "dinner",
      },
    ]);
    render(await open("all"));
    const day2 = screen.getByRole("region", { name: "Day 2 sheet" });
    const kitchen = within(day2).getByRole("region", { name: "Kitchen" });
    expect(
      within(kitchen)
        .getAllByTestId("sheet-prep")
        .map((p) => p.textContent),
    ).toEqual(["PrepSoak the oats (Overnight oats, Day 3 breakfast)"]);
    // A step due before we leave is on the task board, never on a sheet.
    expect(document.body.textContent).not.toContain("Cook the chilli base");
    const day1 = screen.getByRole("region", { name: "Day 1 sheet" });
    expect(within(day1).queryAllByTestId("sheet-prep")).toHaveLength(0);
  });

  it("numbers each day as the meal plan does: Day 1 is the first Build day in Logistics", async () => {
    // Build starts four days before the Burn: the Burn's first day is Day 5
    // on the meal plan, and its dishes are Day 5's.
    vi.mocked(getMealPlan).mockResolvedValue({
      cycle: 2027,
      daysOnSite: 11,
      firstDay: "2027-04-23",
      days: [],
      version: 1,
      updatedAt: null,
    });
    vi.mocked(getKitchenMenu).mockResolvedValue({
      cycle: 2027,
      items: [
        { id: "m1", day: 5, meal: "breakfast", position: 1, recipeId: "r1" },
        { id: "m2", day: 1, meal: "dinner", position: 1, recipeId: "r2" },
      ],
      recipes: {
        r1: { title: "Shakshuka", counts: [{ plates: 40, lines: [] }] },
        r2: { title: "Bobotie", counts: [{ plates: 40, lines: [] }] },
      },
    } as never);
    render(await open("all"));
    const first = screen.getByRole("region", { name: "Day 5 sheet" });
    expect(
      within(first).getByRole("heading", {
        level: 2,
        name: "Day 5 · Tuesday 27 April",
      }),
    ).toBeTruthy();
    expect(first.textContent).toContain("Shakshuka");
    expect(first.textContent).not.toContain("Bobotie");
    // The Lounge keeps its own Burn days: its Day 1 is still the 27th.
    expect(first.textContent).toContain("Kombucha tasting");
    expect(screen.getByRole("region", { name: "Day 6 sheet" })).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Day 1 sheet" })).toBeNull();
  });

  it("lets a captain print too", async () => {
    gate("captain");
    const { container } = render(await open(D2));
    expect(container.querySelector(`[${PRINT_SHEET_ATTR}]`)).toBeTruthy();
    expect(screen.getByRole("region", { name: "Day 2 sheet" })).toBeTruthy();
  });
});
