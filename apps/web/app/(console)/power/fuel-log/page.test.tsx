import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The refuelling page (#255). Every approved member reads it; only a captain
// or a Power & Lighting lead changes it, and everyone else sees the controls
// disabled, pointing at the one refusal line. The figures are worked out on
// the server: 100 L in five cans; refuellings of 10 L at 06:00 and 12:00 are
// 40 L a day, so 80 L left is 2 days, and the warning (below 2 days) is quiet;
// with 70 L left it is 1.75 days and the warning shows.

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));
vi.mock("@/app/(console)/power/fuel-log/actions", () => ({
  addFuelCansAction: vi.fn(),
  updateFuelCanAction: vi.fn(),
  removeFuelCanAction: vi.fn(),
  logRefuelAction: vi.fn(),
  correctRefuelAction: vi.fn(),
  strikeRefuelAction: vi.fn(),
  saveLowFuelDaysAction: vi.fn(),
}));
vi.mock("@/lib/captain-gate", () => ({ captainPageGate: vi.fn() }));
vi.mock("@/lib/users", () => ({ getLeadTeams: vi.fn(async () => []) }));
vi.mock("@/lib/tasks", () => ({
  listAssignableMembers: vi.fn(async () => [
    { id: "viewer", displayName: "Pat Lead" },
  ]),
}));
vi.mock("@/lib/power", () => ({
  listPowerLoads: vi.fn(async () => []),
  getPowerPlan: vi.fn(),
  listGenerators: vi.fn(async () => []),
  getGenerator: vi.fn(async () => null),
}));
vi.mock("@/lib/power-site", () => ({
  listFuelCans: vi.fn(),
  listRefuelEntries: vi.fn(),
}));

import { saveLowFuelDaysAction } from "@/app/(console)/power/fuel-log/actions";
import { captainPageGate } from "@/lib/captain-gate";
import { getPowerPlan } from "@/lib/power";
import { POWER_REFUSAL } from "@/lib/power-copy";
import { listFuelCans, listRefuelEntries } from "@/lib/power-site";
import { listAssignableMembers } from "@/lib/tasks";
import { getLeadTeams } from "@/lib/users";
import PowerFuelLogPage from "./page";

const GEN = "7c9e6679-7425-40de-944b-e07fc1f90ae7";

const PLAN = {
  cycle: 2026,
  generatorId: null,
  secondGeneratorNote: null,
  powerFactor: 0.8,
  daysOnSite: 11,
  firstPoweredDay: null,
  runFromHour: null,
  runToHour: null,
  lowLoadFactor: 1,
  safetyMarginPct: 20,
  canLitres: 20,
  cansOwned: 0,
  lowFuelDays: 2,
  version: 2,
  updatedAt: null,
};

function cans(litres: number[]) {
  return litres.map((l, i) => ({
    id: `can-${i}`,
    cycle: 2026,
    label: `Can ${i + 1}`,
    capacityLitres: 20,
    litres: l,
    location: "on_site",
    sort: i,
    version: 1,
  }));
}

function entry(id: string, at: string, more: Record<string, unknown> = {}) {
  return {
    id,
    cycle: 2026,
    generatorId: GEN,
    generatorModel: "Test 5.5",
    refuelledAt: new Date(at),
    litres: 10,
    fromCanId: null,
    fromCanLabel: "Can 1",
    doneByUserId: "u1",
    doneByName: "Sam Watch",
    hourMeter: null,
    note: null,
    fromPaper: false,
    correctsEntryId: null,
    voided: false,
    createdAt: new Date(at),
    ...more,
  };
}

// 06:00 and 12:00 camp time on 25 Apr 2026.
const TWO = [
  entry("b", "2026-04-25T10:00:00Z"),
  entry("a", "2026-04-25T04:00:00Z"),
];

async function renderAs(
  rank: "camp_member" | "team_lead" | "captain",
  leads: string[] = [],
) {
  vi.mocked(captainPageGate).mockResolvedValue({
    campUser: { id: "viewer" },
    rank,
    cleared: true,
  } as never);
  vi.mocked(getLeadTeams).mockResolvedValue(leads);
  render(await PowerFuelLogPage());
}

const kpi = (name: string) => screen.getByRole("article", { name });

afterEach(cleanup);

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getPowerPlan).mockResolvedValue(PLAN as never);
  vi.mocked(listFuelCans).mockResolvedValue(cans([0, 20, 20, 20, 20]) as never);
  vi.mocked(listRefuelEntries).mockResolvedValue(TWO as never);
});

describe("the refuelling page", () => {
  it("works out the rate and the days left, and stays quiet at the threshold", async () => {
    await renderAs("camp_member");
    expect(within(kpi("Fuel on hand")).getByText("80.0 L")).toBeTruthy();
    expect(within(kpi("Using")).getByText("40 L")).toBeTruthy();
    expect(within(kpi("Days of fuel left")).getByText("2")).toBeTruthy();
    expect(screen.queryByText(/^Fuel is running low/)).toBeNull();
  });

  it("warns below the threshold", async () => {
    vi.mocked(listFuelCans).mockResolvedValue(
      cans([0, 10, 20, 20, 20]) as never,
    );
    await renderAs("camp_member");
    expect(within(kpi("Days of fuel left")).getByText("1.8")).toBeTruthy();
    expect(screen.getByText(/^Fuel is running low/)).toBeTruthy();
  });

  it("is quiet with the warning turned off", async () => {
    vi.mocked(getPowerPlan).mockResolvedValue({
      ...PLAN,
      lowFuelDays: 0,
    } as never);
    vi.mocked(listFuelCans).mockResolvedValue(cans([1]) as never);
    await renderAs("camp_member");
    expect(screen.queryByText(/^Fuel is running low/)).toBeNull();
    expect(
      within(kpi("Days of fuel left")).getByText(/warning is off/),
    ).toBeTruthy();
  });

  it("shows a Kitchen lead every control disabled, pointing at the refusal line", async () => {
    await renderAs("team_lead", ["kitchen"]);
    const refusal = screen.getByText(POWER_REFUSAL);
    for (const name of [/^Log refuelling/, /^Add cans/, /^Save warning/]) {
      const button = screen.getByRole("button", { name });
      expect(button).toHaveProperty("disabled", true);
      expect(button.getAttribute("aria-describedby")).toBe(refusal.id);
    }
    // Only an editor needs the member list for "Filled by".
    expect(listAssignableMembers).not.toHaveBeenCalled();
  });

  it("marks a replaced entry and a paper one, and offers no fix for the replaced", async () => {
    vi.mocked(listRefuelEntries).mockResolvedValue([
      entry("fix", "2026-04-25T10:00:00Z", {
        correctsEntryId: "b",
        litres: 12,
      }),
      entry("b", "2026-04-25T10:00:00Z", { fromPaper: true }),
      entry("a", "2026-04-25T04:00:00Z"),
    ] as never);
    await renderAs("team_lead", ["power_and_lighting"]);
    const log = screen.getAllByRole("table", { name: "Refuelling log" })[0]!;
    expect(within(log).getByText("Correction")).toBeTruthy();
    expect(within(log).getByText("Replaced")).toBeTruthy();
    expect(within(log).getByText("From paper")).toBeTruthy();
    // Two entries count, each with its own Correct button; the replaced has none.
    expect(
      within(log).getAllByRole("button", { name: /^Correct the entry/ }),
    ).toHaveLength(2);
    // 12 L over 6 h.
    expect(within(kpi("Using")).getByText("48 L")).toBeTruthy();
  });

  it("refuses a blank warning field rather than saving 0, which turns it off", async () => {
    await renderAs("team_lead", ["power_and_lighting"]);
    const field = screen.getByLabelText(
      "Warn when the fuel left covers fewer days than",
    );
    fireEvent.change(field, { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Save warning" }));
    expect(
      screen.getByText("Give a number of days, or 0 to turn the warning off."),
    ).toBeTruthy();
    expect(saveLowFuelDaysAction).not.toHaveBeenCalled();
  });
});
