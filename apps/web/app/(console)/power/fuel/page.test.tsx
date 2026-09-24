import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The fuel estimate (#254). Every approved member reads it; only a captain or
// a Power & Lighting lead edits the plan and the generators. Everyone else
// sees the same controls PRESENT BUT DISABLED, described by the one refusal
// line. The figures are worked out on the server: for the issue's example (a
// 1065 W load all day on a 5.5 kVA generator, 13.5 L tank, 9.8 h at 50%,
// 5.5 h at 100%) that is 19.73 L a day at 24 h, 197.3 L over 10 days,
// 236.7 L with 20%, and 12 cans of 20 L.

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));
vi.mock("@/app/(console)/power/actions", () => ({
  saveFuelPlanAction: vi.fn(),
  copyLastYearPlanAction: vi.fn(),
  addGeneratorAction: vi.fn(),
  updateGeneratorAction: vi.fn(),
  archiveGeneratorAction: vi.fn(),
}));
vi.mock("@/lib/captain-gate", () => ({ captainPageGate: vi.fn() }));
vi.mock("@/lib/users", () => ({ getLeadTeams: vi.fn(async () => []) }));
vi.mock("@/lib/power", () => ({
  listPowerLoads: vi.fn(),
  getPowerPlan: vi.fn(),
  listGenerators: vi.fn(),
  getGenerator: vi.fn(async () => null),
  listPowerInventory: vi.fn(async () => []),
  previousPlanCycle: vi.fn(async () => null),
}));

import { captainPageGate } from "@/lib/captain-gate";
import {
  getPowerPlan,
  listGenerators,
  listPowerInventory,
  listPowerLoads,
  previousPlanCycle,
} from "@/lib/power";
import { POWER_REFUSAL } from "@/lib/power-copy";
import { getLeadTeams } from "@/lib/users";
import PowerFuelPage from "./page";

const GEN_ID = "7c9e6679-7425-40de-944b-e07fc1f90ae7";

const GENERATOR = {
  id: GEN_ID,
  model: "Test 5.5",
  ratedKva: 5.5,
  maxKva: 6,
  tankLitres: 13.5,
  runtime50Hours: 9.8,
  runtime100Hours: 5.5,
  fuelType: "petrol",
  owner: "member_lent",
  inventoryItemId: null,
  noiseNote: "Quiet inverter",
  archivedAt: null,
  version: 1,
  createdAt: new Date("2026-09-20T08:00:00Z"),
  updatedAt: new Date("2026-09-20T08:00:00Z"),
};

const LOAD = {
  id: "load-1",
  cycle: 2026,
  name: "Everything",
  area: "camp",
  category: "other",
  quantity: 1,
  wattsEach: 1065,
  surgeWattsEach: null,
  dutyPct: 100,
  schedule: "full_time",
  hoursPerDay: null,
  windows: null,
  fromDay: null,
  toDay: null,
  volts: 230,
  current: "ac",
  owner: "camp",
  neighbourCamp: null,
  inventoryItemId: null,
  circuit: null,
  sort: 0,
  version: 1,
  createdAt: new Date("2026-09-20T08:00:00Z"),
  updatedAt: new Date("2026-09-20T08:00:00Z"),
};

const PLAN = {
  cycle: 2026,
  generatorId: GEN_ID,
  secondGeneratorNote: null,
  powerFactor: 0.8,
  daysOnSite: 10,
  firstPoweredDay: null,
  runFromHour: null,
  runToHour: null,
  lowLoadFactor: 1,
  safetyMarginPct: 20,
  canLitres: 20,
  cansOwned: 0,
  version: 2,
  updatedAt: new Date("2026-09-20T08:00:00Z"),
};

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
  render(await PowerFuelPage());
}

afterEach(cleanup);

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getPowerPlan).mockResolvedValue(PLAN as never);
  vi.mocked(listGenerators).mockResolvedValue([GENERATOR] as never);
  vi.mocked(listPowerLoads).mockResolvedValue([LOAD] as never);
  vi.mocked(previousPlanCycle).mockResolvedValue(null);
});

describe("the fuel estimate", () => {
  it("shows a member every control disabled, pointing at the one refusal line", async () => {
    await renderAs("camp_member");
    const refusal = screen.getByText(POWER_REFUSAL);
    const save = screen.getByRole("button", { name: /^Save plan/ });
    expect(save).toHaveProperty("disabled", true);
    expect(save.getAttribute("aria-describedby")).toBe(refusal.id);
    expect(screen.getByRole("combobox", { name: "Generator" })).toHaveProperty(
      "disabled",
      true,
    );
    expect(
      screen.getByRole("spinbutton", { name: /^Days on site/ }),
    ).toHaveProperty("disabled", true);
    expect(
      screen.getByRole("radio", { name: "24 h", checked: true }),
    ).toBeTruthy();
    for (const radio of screen.getAllByRole("radio")) {
      expect(radio).toHaveProperty("disabled", true);
    }
    const add = screen.getByRole("button", { name: /^Add generator/ });
    expect(add).toHaveProperty("disabled", true);
    expect(add.getAttribute("aria-describedby")).toBe(refusal.id);
    expect(
      screen.getAllByRole("button", {
        name: "Archive Test 5.5 — not available to you",
      })[0],
    ).toHaveProperty("disabled", true);
    expect(listPowerInventory).not.toHaveBeenCalled();
  });

  it("refuses a Kitchen lead the same way, and enables a Power & Lighting lead", async () => {
    await renderAs("team_lead", ["kitchen"]);
    expect(screen.getByRole("button", { name: /^Save plan/ })).toHaveProperty(
      "disabled",
      true,
    );

    cleanup();
    await renderAs("team_lead", ["kitchen", "power_and_lighting"]);
    expect(screen.queryByText(POWER_REFUSAL)).toBeNull();
    const save = screen.getByRole("button", { name: "Save plan" });
    expect(save).toHaveProperty("disabled", false);
    expect(
      screen.getByRole("spinbutton", { name: /^Days on site/ }),
    ).toHaveProperty("disabled", false);
    expect(listPowerInventory).toHaveBeenCalled();
  });

  it("works out litres, cans and refills on the server, running 24 h", async () => {
    await renderAs("captain");
    const kpi = (name: string) => screen.getByRole("article", { name });
    // 0.3006 L/h idle + 2.1540 × (1.065 ÷ 0.8 ÷ 5.5) = 0.822 L/h × 24 h.
    expect(within(kpi("Litres a day")).getByText("19.73 L")).toBeTruthy();
    expect(
      within(kpi("Litres for the burn")).getByText("197.3 L"),
    ).toBeTruthy();
    expect(within(kpi("With margin")).getByText("236.7 L")).toBeTruthy();
    expect(within(kpi("Jerry cans needed")).getByText("12")).toBeTruthy();
    // 19.73 ÷ 13.5 L tank = 1.5 a day; 24 h ÷ 1.46 = every 16.4 h.
    const refills = kpi("Tank refills a day");
    expect(within(refills).getByText("1.5")).toBeTruthy();
    expect(within(refills).getByText(/about every 16\.4 h/)).toBeTruthy();

    // The generator runs 24/7 (owner, 2026-09-24): one schedule, and no
    // second, comparison schedule beside it.
    expect(
      screen.queryByRole("table", { name: "Scenario compare" }),
    ).toBeNull();
    expect(screen.queryByText(/Comparison/)).toBeNull();
    expect(screen.getAllByRole("radio", { name: "24 h" })).toHaveLength(1);
    expect(
      within(kpi("Litres a day")).getByText("on the busiest day, running 24 h"),
    ).toBeTruthy();

    // Running all day, nothing falls in the off hours: no warning.
    expect(
      screen.queryByText(/falls in hours the generator is off/),
    ).toBeNull();
    expect(screen.getByText("0.301 L/h")).toBeTruthy();
    expect(screen.getByText("Day 10")).toBeTruthy();
  });

  it("warns of energy in the off hours, and of an overload", async () => {
    vi.mocked(getPowerPlan).mockResolvedValue({
      ...PLAN,
      runFromHour: 18,
      runToHour: 6,
    } as never);
    await renderAs("captain");
    expect(
      screen.getByText(/^12\.78 kWh a day falls in hours the generator is off/),
    ).toBeTruthy();
    expect(
      within(
        screen.getByRole("article", { name: "Jerry cans needed" }),
      ).getByText("6"),
    ).toBeTruthy();
    expect(screen.queryByText(/goes over the generator's rating/)).toBeNull();

    cleanup();
    vi.mocked(listPowerLoads).mockResolvedValue([
      { ...LOAD, wattsEach: 5000 },
    ] as never);
    await renderAs("captain");
    expect(
      screen.getByText(/^Load goes over the generator's rating/),
    ).toBeTruthy();
  });

  it("says what is missing before there is an estimate", async () => {
    vi.mocked(getPowerPlan).mockResolvedValue({
      ...PLAN,
      generatorId: null,
    } as never);
    await renderAs("captain");
    expect(screen.getByText("No generator chosen")).toBeTruthy();
    expect(screen.queryByRole("article", { name: "Litres a day" })).toBeNull();

    cleanup();
    vi.mocked(getPowerPlan).mockResolvedValue(PLAN as never);
    vi.mocked(listPowerLoads).mockResolvedValue([]);
    await renderAs("captain");
    expect(screen.getByText("No loads yet")).toBeTruthy();
  });

  it("names a lent generator without a member, and offers last year's plan only to a year with none", async () => {
    vi.mocked(previousPlanCycle).mockResolvedValue(2025);
    await renderAs("captain");
    expect(screen.getAllByText("Lent by a member").length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: /Copy last year/ })).toBeNull();

    cleanup();
    vi.mocked(getPowerPlan).mockResolvedValue({
      ...PLAN,
      version: 0,
      updatedAt: null,
    } as never);
    await renderAs("captain");
    expect(
      screen.getByRole("button", { name: /Copy last year's plan/ }),
    ).toHaveProperty("disabled", false);
  });
});
