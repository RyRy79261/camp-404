import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The load list (#253). Every approved member reads it; only a captain or a
// Power & Lighting lead edits it. Everyone else sees the same controls
// PRESENT BUT DISABLED, each described by the one refusal line above the
// table (AfrikaBurn's categories screen). A lead of another team stands on the
// team_lead rung everywhere, and still may not edit here. The inventory is
// read only for an editor.

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));
vi.mock("@/app/(console)/power/actions", () => ({
  addLoadAction: vi.fn(),
  updateLoadAction: vi.fn(),
  removeLoadAction: vi.fn(),
  copyLastYearLoadsAction: vi.fn(),
  savePlanSettingsAction: vi.fn(),
}));
vi.mock("@/lib/captain-gate", () => ({ captainPageGate: vi.fn() }));
vi.mock("@/lib/users", () => ({ getLeadTeams: vi.fn(async () => []) }));
vi.mock("@/lib/power", () => ({
  listPowerLoads: vi.fn(),
  getPowerPlan: vi.fn(),
  getGenerator: vi.fn(async () => null),
  listPowerInventory: vi.fn(async () => []),
  previousLoadCycle: vi.fn(async () => null),
}));

import { captainPageGate } from "@/lib/captain-gate";
import {
  getGenerator,
  getPowerPlan,
  listPowerInventory,
  listPowerLoads,
  previousLoadCycle,
} from "@/lib/power";
import { POWER_REFUSAL } from "@/lib/power-copy";
import { getLeadTeams } from "@/lib/users";
import PowerLoadsPage from "./page";

const GEN_ID = "7c9e6679-7425-40de-944b-e07fc1f90ae7";

function load(overrides: Record<string, unknown>) {
  return {
    id: "load-1",
    cycle: 2026,
    name: "Deep freeze",
    area: "kitchen",
    category: "refrigeration",
    quantity: 1,
    wattsEach: 320,
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
    ...overrides,
  };
}

const PLAN = {
  cycle: 2026,
  generatorId: null,
  secondGeneratorNote: null,
  powerFactor: 0.8,
  daysOnSite: 7,
  firstPoweredDay: null,
  runFromHour: null,
  runToHour: null,
  compareRunFromHour: 18,
  compareRunToHour: 6,
  lowLoadFactor: 1,
  safetyMarginPct: 20,
  canLitres: 20,
  cansOwned: 0,
  version: 0,
  updatedAt: null,
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
  render(await PowerLoadsPage());
}

afterEach(cleanup);

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getPowerPlan).mockResolvedValue(PLAN);
  vi.mocked(previousLoadCycle).mockResolvedValue(null);
  vi.mocked(listPowerLoads).mockResolvedValue([
    load({}),
    load({
      id: "load-2",
      name: "Fairy lights",
      area: "lounge",
      category: "lighting_decorative",
      wattsEach: 480,
      volts: 12,
      current: "dc",
      schedule: "hours_per_day",
      hoursPerDay: 6,
      owner: "member",
    }),
  ] as never);
});

describe("the load list", () => {
  it("shows a member the controls disabled, each pointing at the one refusal line", async () => {
    await renderAs("camp_member");
    const refusal = screen.getByText(POWER_REFUSAL);
    const add = screen.getByRole("button", { name: /^Add load/ });
    expect(add).toHaveProperty("disabled", true);
    expect(add.getAttribute("aria-describedby")).toBe(refusal.id);
    for (const edit of screen.getAllByRole("button", {
      name: "Edit Deep freeze — not available to you",
    })) {
      expect(edit).toHaveProperty("disabled", true);
      expect(edit.getAttribute("aria-describedby")).toBe(refusal.id);
    }
    expect(
      screen.getAllByRole("button", {
        name: "Remove Fairy lights — not available to you",
      })[0],
    ).toHaveProperty("disabled", true);
    expect(screen.queryByRole("button", { name: /Plan settings/ })).toBeNull();
    expect(listPowerInventory).not.toHaveBeenCalled();
  });

  it("refuses a Kitchen lead the same way, though their rung is team_lead", async () => {
    await renderAs("team_lead", ["kitchen"]);
    expect(screen.getByText(POWER_REFUSAL)).toBeTruthy();
    expect(screen.getByRole("button", { name: /^Add load/ })).toHaveProperty(
      "disabled",
      true,
    );
  });

  it("gives a Power & Lighting lead the controls, enabled, and no refusal line", async () => {
    await renderAs("team_lead", ["kitchen", "power_and_lighting"]);
    expect(screen.queryByText(POWER_REFUSAL)).toBeNull();
    const add = screen.getByRole("button", { name: "Add load" });
    expect(add).toHaveProperty("disabled", false);
    expect(add.getAttribute("aria-describedby")).toBeNull();
    expect(
      screen.getAllByRole("button", { name: "Edit Deep freeze" })[0],
    ).toHaveProperty("disabled", false);
    expect(
      screen.getByRole("button", { name: /Plan settings/ }),
    ).toHaveProperty("disabled", false);
    expect(listPowerInventory).toHaveBeenCalled();
  });

  it("computes the result panel on the server", async () => {
    await renderAs("captain");
    // 320 W × 24 h + 480 W × 6 h = 7.68 + 2.88 kWh.
    const energy = screen.getByRole("article", { name: "Energy" });
    expect(within(energy).getByText("10.56 kWh")).toBeTruthy();
    // The busiest hour (320 W) plus the 6 h lights on top, all at once.
    const peak = screen.getByRole("article", { name: "Estimated peak" });
    expect(within(peak).getByText("0.80 kW")).toBeTruthy();
    expect(within(peak).getByText("1.00 kVA")).toBeTruthy();
    expect(
      within(peak).getByText("assumes everything on at once"),
    ).toBeTruthy();
    // The rows read without a member's name.
    expect(screen.getAllByText("Member-owned").length).toBeGreaterThan(0);
    expect(screen.getAllByText("6 h a day").length).toBeGreaterThan(0);
    expect(
      screen.getByText(
        "No generator chosen yet. Pick one on the fuel estimate.",
      ),
    ).toBeTruthy();
  });

  it("bands the chosen generator on the kVA figure", async () => {
    vi.mocked(getPowerPlan).mockResolvedValue({ ...PLAN, generatorId: GEN_ID });
    vi.mocked(getGenerator).mockResolvedValue({
      id: GEN_ID,
      model: "Small inverter",
      ratedKva: 1,
      maxKva: 1.1,
    } as never);
    await renderAs("captain");
    const rail = screen.getByRole("article", { name: "Generator" });
    // 0.8 kW ÷ 0.8 = 1 kVA of 1 kVA rated; kW-based it is 80%.
    expect(within(rail).getByText("100%")).toBeTruthy();
    expect(within(rail).getByText("(kW-based: 80%)")).toBeTruthy();
    // Surge: 0.8 kW + the freezer's 960 W start-up = 2.2 kVA, past 1.1.
    expect(
      within(rail).getByText("Surge exceeds the generator's maximum"),
    ).toBeTruthy();
  });

  it("offers last year's list only when this year is empty", async () => {
    vi.mocked(previousLoadCycle).mockResolvedValue(2025);
    await renderAs("captain");
    expect(screen.queryByRole("button", { name: /Copy last year/ })).toBeNull();

    cleanup();
    vi.mocked(listPowerLoads).mockResolvedValue([]);
    await renderAs("captain");
    expect(screen.getByText("No loads yet")).toBeTruthy();
    expect(
      screen.getAllByRole("button", { name: /Copy last year/ }).length,
    ).toBeGreaterThan(0);
  });
});
