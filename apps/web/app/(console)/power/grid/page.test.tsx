import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The grid plan (#256). Every approved member reads it; a run's amps are
// worked out on the server from what plugs in beyond it: a 2300 W kitchen on
// a 10 A cable is 10 A (100%, near its limit), and the 16 A main junction
// feeding it and a 460 W lounge carries 12 A (75%, fine). A lounge cable with
// no rating says "Rating unknown", never a guess.

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));
vi.mock("@/app/(console)/power/grid/actions", () => ({
  addGridNodeAction: vi.fn(),
  updateGridNodeAction: vi.fn(),
  removeGridNodeAction: vi.fn(),
  assignLoadAction: vi.fn(),
  copyLastYearGridAction: vi.fn(),
}));
vi.mock("@/lib/captain-gate", () => ({ captainPageGate: vi.fn() }));
vi.mock("@/lib/users", () => ({ getLeadTeams: vi.fn(async () => []) }));
vi.mock("@/lib/power", () => ({
  listPowerLoads: vi.fn(),
  getPowerPlan: vi.fn(),
}));
vi.mock("@/lib/power-site", () => ({
  listGridNodes: vi.fn(),
  listLoadGridPoints: vi.fn(),
  previousGridCycle: vi.fn(async () => null),
}));

import { captainPageGate } from "@/lib/captain-gate";
import { getPowerPlan, listPowerLoads } from "@/lib/power";
import { POWER_REFUSAL } from "@/lib/power-copy";
import { listGridNodes, listLoadGridPoints } from "@/lib/power-site";
import { getLeadTeams } from "@/lib/users";
import PowerGridPage from "./page";

function node(
  id: string,
  name: string,
  kind: string,
  parentId: string | null,
  cableRatedAmps: number | null,
) {
  return {
    id,
    cycle: 2026,
    name,
    kind,
    parentId,
    cable: null,
    cableLengthM: null,
    cableGaugeMm2: null,
    cableRatedAmps,
    adapter: null,
    haveCable: true,
    haveAdapter: true,
    sort: 0,
    version: 1,
  };
}

function load(id: string, name: string, wattsEach: number) {
  return {
    id,
    cycle: 2026,
    name,
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
    owner: "camp",
    neighbourCamp: null,
    inventoryItemId: null,
    circuit: null,
    sort: 0,
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

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
  render(await PowerGridPage());
}

afterEach(cleanup);

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getPowerPlan).mockResolvedValue({ daysOnSite: 11 } as never);
  vi.mocked(listGridNodes).mockResolvedValue([
    node("gen", "Genny", "generator", null, null),
    node("main", "Main junction", "junction", "gen", 16),
    node("kitchen", "Kitchen", "end_point", "main", 10),
    node("lounge", "Lounge", "end_point", "main", null),
  ] as never);
  vi.mocked(listPowerLoads).mockResolvedValue([
    load("l1", "Urn", 2300),
    load("l2", "Lights", 460),
    load("l3", "Spare fridge", 900),
  ] as never);
  vi.mocked(listLoadGridPoints).mockResolvedValue({
    l1: "kitchen",
    l2: "lounge",
  });
});

describe("the grid plan", () => {
  it("works out each run's amps and says how hard its cable works", async () => {
    await renderAs("camp_member");
    const point = (name: string) => screen.getByRole("listitem", { name });
    expect(within(point("Kitchen")).getByText("Near its limit")).toBeTruthy();
    expect(
      within(point("Kitchen")).getByText("Carries 10 A of 10 A (100%)"),
    ).toBeTruthy();
    expect(within(point("Main junction")).getByText("Fine")).toBeTruthy();
    expect(
      within(point("Main junction")).getByText("Carries 12 A of 16 A (75%)"),
    ).toBeTruthy();
    expect(within(point("Lounge")).getByText("Rating unknown")).toBeTruthy();
    expect(screen.getByText(/1 load is not on the grid yet/)).toBeTruthy();
  });

  it("shows a member where loads plug in as text, and every control disabled", async () => {
    await renderAs("camp_member");
    const refusal = screen.getByText(POWER_REFUSAL);
    const add = screen.getByRole("button", { name: /^Add point/ });
    expect(add).toHaveProperty("disabled", true);
    expect(add.getAttribute("aria-describedby")).toBe(refusal.id);
    expect(
      screen.getByRole("button", { name: /^Edit Kitchen/ }),
    ).toHaveProperty("disabled", true);
    expect(screen.queryAllByRole("combobox")).toHaveLength(0);
    expect(screen.getAllByText("Not on the grid yet").length).toBeGreaterThan(
      0,
    );
  });

  it("gives a Power & Lighting lead a picker for each load", async () => {
    await renderAs("team_lead", ["power_and_lighting"]);
    expect(screen.queryByText(POWER_REFUSAL)).toBeNull();
    expect(
      screen.getAllByRole("combobox", { name: "Where Urn plugs in" }).length,
    ).toBeGreaterThan(0);
  });
});
