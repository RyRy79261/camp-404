import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Generator readiness (#257). Every approved member reads it; only a captain
// or a Power & Lighting lead ticks, plans and shares. The fuel split is worked
// out on the server from the load list: 300 W of ours against 100 W of the
// neighbour's, all day, is 75% and 25%; a share set by hand wins.

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));
vi.mock("@/app/(console)/power/readiness/actions", () => ({
  startChecklistAction: vi.fn(),
  addReadinessItemAction: vi.fn(),
  updateReadinessItemAction: vi.fn(),
  tickReadinessItemAction: vi.fn(),
  removeReadinessItemAction: vi.fn(),
  addWorkPlanAction: vi.fn(),
  saveSharingAction: vi.fn(),
  removeSharingAction: vi.fn(),
}));
vi.mock("@/lib/captain-gate", () => ({ captainPageGate: vi.fn() }));
vi.mock("@/lib/users", () => ({ getLeadTeams: vi.fn(async () => []) }));
vi.mock("@/lib/tasks", () => ({
  listAssignableMembers: vi.fn(async () => []),
}));
vi.mock("@/lib/power", () => ({
  listPowerLoads: vi.fn(),
  getPowerPlan: vi.fn(),
  listGenerators: vi.fn(),
  getGenerator: vi.fn(async () => null),
}));
vi.mock("@/lib/power-site", () => ({
  listReadinessItems: vi.fn(),
  listWorkPlanTasks: vi.fn(async () => []),
  previousWorkPlanCycle: vi.fn(async () => null),
  getSharingAgreement: vi.fn(async () => null),
}));

import { captainPageGate } from "@/lib/captain-gate";
import { getPowerPlan, listGenerators, listPowerLoads } from "@/lib/power";
import { POWER_REFUSAL } from "@/lib/power-copy";
import { getSharingAgreement, listReadinessItems } from "@/lib/power-site";
import { listAssignableMembers } from "@/lib/tasks";
import { getLeadTeams } from "@/lib/users";
import PowerReadinessPage from "./page";

const GEN = "7c9e6679-7425-40de-944b-e07fc1f90ae7";

const GENERATOR = {
  id: GEN,
  model: "Test 5.5",
  ratedKva: 5.5,
  maxKva: 6,
  tankLitres: 13.5,
  runtime50Hours: 9.8,
  runtime100Hours: 5.5,
  fuelType: "petrol",
  owner: "camp",
  inventoryItemId: null,
  noiseNote: null,
  archivedAt: null,
  version: 1,
  createdAt: new Date(),
  updatedAt: new Date(),
};

function load(owner: string, wattsEach: number) {
  return {
    id: `${owner}-${wattsEach}`,
    cycle: 2026,
    name: `${owner} load`,
    area: "camp",
    category: "other",
    quantity: 1,
    wattsEach,
    surgeWattsEach: null,
    dutyPct: 100,
    schedule: "full_time",
    hoursPerDay: null,
    windows: null,
    fromDay: null,
    toDay: null,
    volts: 230,
    current: "ac",
    owner,
    neighbourCamp: owner === "neighbour" ? "Camp Moonbeam" : null,
    inventoryItemId: null,
    circuit: null,
    sort: 0,
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

const ITEMS = [
  {
    id: "i1",
    cycle: 2026,
    generatorId: GEN,
    itemKey: "runs",
    label: "Starts and runs under load",
    ownerUserId: null,
    ownerName: null,
    dueOn: null,
    doneAt: new Date(),
    doneByName: "Pat Lead",
    sort: 0,
    version: 2,
  },
  {
    id: "i2",
    cycle: 2026,
    generatorId: GEN,
    itemKey: "serviced",
    label: "Serviced, or checked it doesn't need it",
    ownerUserId: "u2",
    ownerName: "Sam Spark",
    dueOn: "2020-01-01",
    doneAt: null,
    doneByName: null,
    sort: 1,
    version: 1,
  },
];

const AGREEMENT = {
  cycle: 2026,
  partnerCamp: "Camp Moonbeam",
  contactRole: "their power lead",
  generatorSource: "ours",
  generatorId: GEN,
  theirGenerator: null,
  partnerFuelPct: null,
  watchCover: null,
  version: 1,
  updatedAt: new Date(),
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
  render(await PowerReadinessPage());
}

afterEach(cleanup);

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getPowerPlan).mockResolvedValue({
    generatorId: GEN,
    daysOnSite: 11,
    powerFactor: 0.8,
    lowLoadFactor: 1,
    safetyMarginPct: 20,
    runFromHour: null,
    runToHour: null,
  } as never);
  vi.mocked(listGenerators).mockResolvedValue([GENERATOR] as never);
  vi.mocked(listPowerLoads).mockResolvedValue([
    load("camp", 300),
    load("neighbour", 100),
  ] as never);
  vi.mocked(listReadinessItems).mockResolvedValue(ITEMS as never);
  vi.mocked(getSharingAgreement).mockResolvedValue(null);
});

describe("generator readiness", () => {
  it("counts what is done, and marks an overdue item", async () => {
    await renderAs("camp_member");
    const card = screen.getByRole("article", { name: "Test 5.5" });
    expect(within(card).getByText("1 of 2 done")).toBeTruthy();
    expect(within(card).getByText(/overdue, was due/)).toBeTruthy();
  });

  it("shows a member every tick and button disabled, pointing at the refusal line", async () => {
    await renderAs("camp_member");
    const refusal = screen.getByText(POWER_REFUSAL);
    const tick = screen.getByRole("checkbox", {
      name: /^Starts and runs under load/,
    });
    expect(tick).toHaveProperty("disabled", true);
    expect(tick.getAttribute("aria-describedby")).toBe(refusal.id);
    expect(
      screen.getByRole("button", {
        name: /^Put the work plan on the task board/,
      }),
    ).toHaveProperty("disabled", true);
    // No agreement, and a member cannot make one: no form.
    expect(screen.getByText("No sharing this year")).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: /^Save agreement/ }),
    ).toBeNull();
    expect(listAssignableMembers).not.toHaveBeenCalled();
  });

  it("splits the fuel by each camp's energy: 75% and 25%", async () => {
    vi.mocked(getSharingAgreement).mockResolvedValue(AGREEMENT as never);
    await renderAs("camp_member");
    const split = screen.getByLabelText("Fuel split");
    expect(within(split).getByText("75%")).toBeTruthy();
    expect(within(split).getByText("25%")).toBeTruthy();
  });

  it("uses the share the team set instead", async () => {
    vi.mocked(getSharingAgreement).mockResolvedValue({
      ...AGREEMENT,
      partnerFuelPct: 40,
    } as never);
    await renderAs("team_lead", ["power_and_lighting"]);
    expect(screen.getByText("60%")).toBeTruthy();
    expect(screen.getByText("40%")).toBeTruthy();
    expect(screen.getByText("Set by the team")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Save agreement" }),
    ).toHaveProperty("disabled", false);
  });
});
