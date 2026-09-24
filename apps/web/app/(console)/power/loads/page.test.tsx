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
    // Amps = watts ÷ volts: 800 W on 230 V mains; the start-up spike is
    // 800 + 960 W.
    expect(within(peak).getByText("3.5 A at 230 V")).toBeTruthy();
    // People read "Start-up spike", never "surge", with one plain sentence.
    const spike = screen.getByRole("article", { name: "Start-up spike" });
    expect(within(spike).getByText("7.7 A at 230 V")).toBeTruthy();
    expect(
      within(spike).getByText(
        "Fridges and freezers draw a short burst when their motor starts, about 3 times their normal draw. This checks the generator can take it.",
      ),
    ).toBeTruthy();
    expect(screen.queryByText(/surge/i)).toBeNull();
    // Each row at its own voltage: the 12 V lights draw 40 A on their supply.
    expect(screen.getAllByText("40 A at 12 V").length).toBeGreaterThan(0);
    expect(screen.getAllByText("1.4 A").length).toBeGreaterThan(0);
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
    // Start-up spike: 0.8 kW + the freezer's 960 W = 2.2 kVA, past 1.1.
    expect(
      within(rail).getByText(
        "The start-up spike is more than the generator's maximum",
      ),
    ).toBeTruthy();
    expect(within(rail).queryByText(/surge/i)).toBeNull();
  });

  it("bands a 5.5 kVA generator green at 1430 W: 32.5% of kVA, 26% by kW", async () => {
    vi.mocked(listPowerLoads).mockResolvedValue([
      load({ name: "Sound desk", category: "sound", wattsEach: 1065 }),
      load({
        id: "load-2",
        name: "Lounge lamps",
        category: "lighting_functional",
        wattsEach: 365,
      }),
    ] as never);
    vi.mocked(getPowerPlan).mockResolvedValue({ ...PLAN, generatorId: GEN_ID });
    vi.mocked(getGenerator).mockResolvedValue({
      id: GEN_ID,
      model: "Test 5.5",
      ratedKva: 5.5,
      maxKva: 6,
    } as never);
    await renderAs("captain");
    const rail = screen.getByRole("article", { name: "Generator" });
    // 1430 W ÷ 0.8 = 1.7875 kVA of 5.5 rated; 1.43 kW of 5.5 is 26%.
    expect(within(rail).getByText("32.5%")).toBeTruthy();
    expect(within(rail).getByText("(kW-based: 26%)")).toBeTruthy();
    expect(
      within(rail).getByText("of rated kVA at the peak · Comfortable"),
    ).toBeTruthy();
    // Start-up spike 1430 + 1065 W = 3.12 kVA stays under the 6 kVA maximum.
    expect(
      within(rail).queryByText(
        "The start-up spike is more than the generator's maximum",
      ),
    ).toBeNull();
    expect(rail.querySelector(".bg-success")).not.toBeNull();
  });

  it("offers last year's list only when this year is empty", async () => {
    vi.mocked(previousLoadCycle).mockResolvedValue(2025);
    await renderAs("captain");
    expect(screen.queryByRole("button", { name: /Copy last year/ })).toBeNull();

    cleanup();
    vi.mocked(listPowerLoads).mockResolvedValue([]);
    await renderAs("captain");
    expect(screen.getByText("No loads yet")).toBeTruthy();
    // Once only: the empty state's call to action, not the heading as well.
    expect(
      screen.getAllByRole("button", { name: /Copy last year/ }),
    ).toHaveLength(1);
  });
});
