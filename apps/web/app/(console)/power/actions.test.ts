import { beforeEach, describe, expect, it, vi } from "vitest";

// The load list's and the fuel page's actions (#253, #254). What matters here:
//  1. Editing needs a captain or a lead of Power & Lighting: a lead of any
//     other team (Kitchen) is refused before the facade is called, although
//     their clearance is the global team_lead rung. A member is refused too.
//  2. Every write names the signed-in actor and nothing else: never a team
//     list, never an id from the browser.
//  3. The plan settings are checked merged onto the current plan, and only
//     the fields each page edits are sent: the load list's three, and the
//     fuel page's without the date of day 1.
// The rule is checked again inside each write (packages/db, on PGlite).

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ unstable_rethrow: vi.fn() }));
vi.mock("@/lib/captain-gate", () => ({ captainActionGate: vi.fn() }));
vi.mock("@/lib/users", () => ({ getLeadTeams: vi.fn(async () => []) }));
vi.mock("@/lib/power", () => ({
  addPowerLoad: vi.fn(async () => ({ ok: true, id: "load-new" })),
  updatePowerLoad: vi.fn(async () => ({ ok: true })),
  removePowerLoad: vi.fn(async () => ({ ok: true })),
  copyLastYearLoads: vi.fn(async () => ({ ok: true, count: 3 })),
  setPowerPlan: vi.fn(async () => ({ ok: true, version: 4 })),
  getPowerPlan: vi.fn(),
  copyLastYearPlan: vi.fn(async () => ({ ok: true, fromCycle: 2025 })),
  addGenerator: vi.fn(async () => ({ ok: true, id: "gen-new" })),
  updateGenerator: vi.fn(async () => ({ ok: true })),
  archiveGenerator: vi.fn(async () => ({ ok: true })),
}));

import { revalidatePath } from "next/cache";
import type { ViewerRank } from "@camp404/types";
import { captainActionGate } from "@/lib/captain-gate";
import {
  addGenerator,
  addPowerLoad,
  archiveGenerator,
  copyLastYearLoads,
  copyLastYearPlan,
  getPowerPlan,
  removePowerLoad,
  setPowerPlan,
  updateGenerator,
  updatePowerLoad,
} from "@/lib/power";
import {
  POWER_FUEL_PATH,
  POWER_LOADS_PATH,
  POWER_REFUSAL,
} from "@/lib/power-copy";
import { getLeadTeams } from "@/lib/users";
import {
  addGeneratorAction,
  addLoadAction,
  archiveGeneratorAction,
  copyLastYearLoadsAction,
  copyLastYearPlanAction,
  removeLoadAction,
  saveFuelPlanAction,
  savePlanSettingsAction,
  updateGeneratorAction,
  updateLoadAction,
} from "./actions";

const LOAD_ID = "0f8fad5b-d9cb-469f-a165-70867728950e";
const GEN_ID = "7c9e6679-7425-40de-944b-e07fc1f90ae7";
const LADDER: ViewerRank[] = ["camp_member", "team_lead", "captain"];

/** Signed in as `id` on `rank`, leading `led`; the gate walks the real ladder. */
function actAs(rank: ViewerRank, led: string[] = [], id = "user-1") {
  vi.mocked(captainActionGate).mockImplementation(async (required, refusal) =>
    LADDER.indexOf(rank) >= LADDER.indexOf(required)
      ? { ok: true, campUser: { id } as never, rank }
      : { ok: false, error: refusal ?? "refused" },
  );
  vi.mocked(getLeadTeams).mockResolvedValue(led);
}

const FREEZER = {
  name: "Deep freeze",
  area: "kitchen",
  category: "refrigeration",
  quantity: 1,
  wattsEach: 320,
  dutyPct: 100,
  schedule: "full_time",
  owner: "camp",
};

const PLAN = {
  cycle: 2026,
  generatorId: GEN_ID,
  secondGeneratorNote: null,
  powerFactor: 0.8,
  daysOnSite: 7,
  firstPoweredDay: null,
  runFromHour: 18,
  runToHour: 6,
  lowLoadFactor: 1.2,
  safetyMarginPct: 20,
  canLitres: 20,
  cansOwned: 2,
  version: 3,
  updatedAt: new Date("2026-09-20T08:00:00Z"),
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getPowerPlan).mockResolvedValue(PLAN);
  actAs("captain", [], "captain-1");
});

describe("addLoadAction", () => {
  it("refuses a Kitchen lead before the facade is called", async () => {
    actAs("team_lead", ["kitchen"]);
    expect(await addLoadAction(FREEZER)).toEqual({
      ok: false,
      error: POWER_REFUSAL,
    });
    expect(captainActionGate).toHaveBeenCalledWith("team_lead", POWER_REFUSAL);
    expect(addPowerLoad).not.toHaveBeenCalled();
  });

  it("refuses a member", async () => {
    actAs("camp_member");
    expect(await addLoadAction(FREEZER)).toEqual({
      ok: false,
      error: POWER_REFUSAL,
    });
    expect(addPowerLoad).not.toHaveBeenCalled();
  });

  it("lets a Power & Lighting lead add, as themselves and with no team list", async () => {
    actAs("team_lead", ["kitchen", "power_and_lighting"], "lead-1");
    const result = await addLoadAction({
      ...FREEZER,
      actorId: "someone-else",
      teams: ["power_and_lighting"],
    });
    expect(result).toEqual({ ok: true, data: { id: "load-new" } });
    const call = vi.mocked(addPowerLoad).mock.calls[0]![0];
    expect(call).toMatchObject({
      name: "Deep freeze",
      wattsEach: 320,
      actorId: "lead-1",
    });
    expect(call).not.toHaveProperty("teams");
    expect(revalidatePath).toHaveBeenCalledWith(POWER_LOADS_PATH);
    expect(revalidatePath).toHaveBeenCalledWith(POWER_FUEL_PATH);
  });

  it("lets a captain add without reading their teams", async () => {
    expect(await addLoadAction(FREEZER)).toMatchObject({ ok: true });
    expect(getLeadTeams).not.toHaveBeenCalled();
  });

  it("returns the first typing problem and writes nothing", async () => {
    expect(await addLoadAction({ ...FREEZER, wattsEach: 0 })).toEqual({
      ok: false,
      error: "Give the watts it draws.",
    });
    expect(addPowerLoad).not.toHaveBeenCalled();
  });

  it("passes the data layer's sentence through", async () => {
    vi.mocked(addPowerLoad).mockResolvedValueOnce({
      ok: false,
      error: "That inventory item isn't there any more. Reload the page.",
    });
    expect(await addLoadAction(FREEZER)).toEqual({
      ok: false,
      error: "That inventory item isn't there any more. Reload the page.",
    });
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

describe("updateLoadAction and removeLoadAction", () => {
  it("refuse a Kitchen lead", async () => {
    actAs("team_lead", ["kitchen"]);
    expect(
      await updateLoadAction({
        ...FREEZER,
        loadId: LOAD_ID,
        expectedVersion: 1,
      }),
    ).toEqual({ ok: false, error: POWER_REFUSAL });
    expect(
      await removeLoadAction({ loadId: LOAD_ID, expectedVersion: 1 }),
    ).toEqual({ ok: false, error: POWER_REFUSAL });
    expect(updatePowerLoad).not.toHaveBeenCalled();
    expect(removePowerLoad).not.toHaveBeenCalled();
  });

  it("send the version the editor opened", async () => {
    actAs("team_lead", ["power_and_lighting"], "lead-1");
    await updateLoadAction({
      ...FREEZER,
      loadId: LOAD_ID,
      expectedVersion: 2,
    });
    expect(updatePowerLoad).toHaveBeenCalledWith(
      expect.objectContaining({
        loadId: LOAD_ID,
        expectedVersion: 2,
        actorId: "lead-1",
      }),
    );
    await removeLoadAction({ loadId: LOAD_ID, expectedVersion: 5 });
    expect(removePowerLoad).toHaveBeenCalledWith({
      loadId: LOAD_ID,
      expectedVersion: 5,
      actorId: "lead-1",
    });
  });

  it("pass a lost race's sentence through", async () => {
    vi.mocked(removePowerLoad).mockResolvedValueOnce({
      ok: false,
      error: "Someone changed this load first. Reload the page.",
    });
    expect(
      await removeLoadAction({ loadId: LOAD_ID, expectedVersion: 1 }),
    ).toEqual({
      ok: false,
      error: "Someone changed this load first. Reload the page.",
    });
  });
});

describe("copyLastYearLoadsAction", () => {
  it("refuses a Kitchen lead, and copies as the P&L lead", async () => {
    actAs("team_lead", ["kitchen"]);
    expect(await copyLastYearLoadsAction()).toEqual({
      ok: false,
      error: POWER_REFUSAL,
    });
    expect(copyLastYearLoads).not.toHaveBeenCalled();

    actAs("team_lead", ["power_and_lighting"], "lead-1");
    expect(await copyLastYearLoadsAction()).toEqual({
      ok: true,
      data: { count: 3 },
    });
    expect(copyLastYearLoads).toHaveBeenCalledWith({ actorId: "lead-1" });
  });
});

describe("savePlanSettingsAction", () => {
  const SETTINGS = {
    daysOnSite: 9,
    firstPoweredDay: "2027-04-26",
    powerFactor: 0.9,
    expectedVersion: 3,
  };

  it("refuses a Kitchen lead", async () => {
    actAs("team_lead", ["kitchen"]);
    expect(await savePlanSettingsAction(SETTINGS)).toEqual({
      ok: false,
      error: POWER_REFUSAL,
    });
    expect(setPowerPlan).not.toHaveBeenCalled();
  });

  it("sends only the three fields it edits, with the version", async () => {
    expect(await savePlanSettingsAction(SETTINGS)).toEqual({
      ok: true,
      data: { version: 4 },
    });
    expect(setPowerPlan).toHaveBeenCalledWith({
      actorId: "captain-1",
      patch: { daysOnSite: 9, firstPoweredDay: "2027-04-26", powerFactor: 0.9 },
      expectedVersion: 3,
    });
  });

  it("clears the first powered day", async () => {
    await savePlanSettingsAction({ ...SETTINGS, firstPoweredDay: "" });
    expect(vi.mocked(setPowerPlan).mock.calls[0]![0].patch).toEqual({
      daysOnSite: 9,
      firstPoweredDay: null,
      powerFactor: 0.9,
    });
  });

  it("refuses a missing field rather than resetting it to its default", async () => {
    const { daysOnSite: _d, ...rest } = SETTINGS;
    expect(await savePlanSettingsAction(rest)).toMatchObject({ ok: false });
    expect(setPowerPlan).not.toHaveBeenCalled();
  });

  it("returns the plan's own sentence for a bad value", async () => {
    expect(
      await savePlanSettingsAction({ ...SETTINGS, powerFactor: 0.2 }),
    ).toEqual({ ok: false, error: "The power factor is at least 0.5." });
    expect(setPowerPlan).not.toHaveBeenCalled();
  });
});

const GENERATOR = {
  model: "Test 5.5",
  ratedKva: 5.5,
  maxKva: 6,
  tankLitres: 13.5,
  runtime50Hours: 9.8,
  runtime100Hours: 5.5,
  fuelType: "petrol",
  owner: "camp",
};

const FUEL_PLAN = {
  generatorId: GEN_ID,
  secondGeneratorNote: "The lounge's inverter, if it comes",
  runFromHour: null,
  runToHour: null,
  daysOnSite: 10,
  powerFactor: 0.8,
  lowLoadFactor: 1.1,
  safetyMarginPct: 25,
  canLitres: 25,
  cansOwned: 3,
  expectedVersion: 3,
};

describe("the fuel page's actions refuse a Kitchen lead", () => {
  const cases: [string, () => Promise<unknown>, () => unknown][] = [
    [
      "saveFuelPlanAction",
      () => saveFuelPlanAction(FUEL_PLAN),
      () => setPowerPlan,
    ],
    [
      "copyLastYearPlanAction",
      () => copyLastYearPlanAction(),
      () => copyLastYearPlan,
    ],
    [
      "addGeneratorAction",
      () => addGeneratorAction(GENERATOR),
      () => addGenerator,
    ],
    [
      "updateGeneratorAction",
      () =>
        updateGeneratorAction({
          ...GENERATOR,
          generatorId: GEN_ID,
          expectedVersion: 1,
        }),
      () => updateGenerator,
    ],
    [
      "archiveGeneratorAction",
      () => archiveGeneratorAction({ generatorId: GEN_ID }),
      () => archiveGenerator,
    ],
  ];

  it.each(cases)("%s", async (_name, act, facade) => {
    actAs("team_lead", ["kitchen"]);
    expect(await act()).toEqual({ ok: false, error: POWER_REFUSAL });
    expect(facade()).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

describe("saveFuelPlanAction", () => {
  it("sends the fuel fields with the version, and keeps the date of day 1", async () => {
    actAs("team_lead", ["power_and_lighting"], "lead-1");
    expect(await saveFuelPlanAction(FUEL_PLAN)).toEqual({
      ok: true,
      data: { version: 4 },
    });
    const call = vi.mocked(setPowerPlan).mock.calls[0]![0];
    const { expectedVersion: _v, ...fields } = FUEL_PLAN;
    expect(call).toEqual({
      actorId: "lead-1",
      patch: fields,
      expectedVersion: 3,
    });
    expect(call.patch).not.toHaveProperty("firstPoweredDay");
    expect(revalidatePath).toHaveBeenCalledWith(POWER_LOADS_PATH);
    expect(revalidatePath).toHaveBeenCalledWith(POWER_FUEL_PATH);
  });

  it("drops a comparison schedule an old page still sends: the camp runs 24/7", async () => {
    await saveFuelPlanAction({
      ...FUEL_PLAN,
      compareRunFromHour: 18,
      compareRunToHour: 6,
    });
    const { patch } = vi.mocked(setPowerPlan).mock.calls[0]![0];
    expect(patch).not.toHaveProperty("compareRunFromHour");
    expect(patch).not.toHaveProperty("compareRunToHour");
  });

  it("refuses a missing field rather than resetting it to its default", async () => {
    const { cansOwned: _c, ...rest } = FUEL_PLAN;
    expect(await saveFuelPlanAction(rest)).toMatchObject({ ok: false });
    expect(setPowerPlan).not.toHaveBeenCalled();
  });

  it("returns the plan's own sentence for half a schedule", async () => {
    expect(await saveFuelPlanAction({ ...FUEL_PLAN, runFromHour: 18 })).toEqual(
      {
        ok: false,
        error:
          "Give both the start and the stop hour, or neither for 24 hours.",
      },
    );
    expect(setPowerPlan).not.toHaveBeenCalled();
  });

  it("passes a lost race's sentence through", async () => {
    vi.mocked(setPowerPlan).mockResolvedValueOnce({
      ok: false,
      error: "Someone changed this year's plan first. Reload the page.",
    });
    expect(await saveFuelPlanAction(FUEL_PLAN)).toEqual({
      ok: false,
      error: "Someone changed this year's plan first. Reload the page.",
    });
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

describe("generator actions", () => {
  it("add, edit and archive as the actor, with the version on an edit", async () => {
    actAs("team_lead", ["power_and_lighting"], "lead-1");
    expect(
      await addGeneratorAction({ ...GENERATOR, actorId: "someone-else" }),
    ).toEqual({ ok: true, data: { id: "gen-new" } });
    expect(vi.mocked(addGenerator).mock.calls[0]![0]).toMatchObject({
      model: "Test 5.5",
      ratedKva: 5.5,
      inventoryItemId: null,
      noiseNote: null,
      actorId: "lead-1",
    });
    await updateGeneratorAction({
      ...GENERATOR,
      generatorId: GEN_ID,
      expectedVersion: 2,
    });
    expect(updateGenerator).toHaveBeenCalledWith(
      expect.objectContaining({
        generatorId: GEN_ID,
        expectedVersion: 2,
        actorId: "lead-1",
      }),
    );
    expect(await archiveGeneratorAction({ generatorId: GEN_ID })).toEqual({
      ok: true,
    });
    expect(archiveGenerator).toHaveBeenCalledWith({
      generatorId: GEN_ID,
      actorId: "lead-1",
    });
  });

  it("returns the generator's own sentence and writes nothing", async () => {
    expect(
      await addGeneratorAction({ ...GENERATOR, runtime100Hours: 12 }),
    ).toEqual({
      ok: false,
      error: "A tank runs out sooner at full load than at half load.",
    });
    expect(await archiveGeneratorAction({ generatorId: "nope" })).toEqual({
      ok: false,
      error: "Check the generator and try again.",
    });
    expect(addGenerator).not.toHaveBeenCalled();
    expect(archiveGenerator).not.toHaveBeenCalled();
  });

  it("copies last year's plan as the actor", async () => {
    expect(await copyLastYearPlanAction()).toEqual({
      ok: true,
      data: { fromCycle: 2025 },
    });
    expect(copyLastYearPlan).toHaveBeenCalledWith({ actorId: "captain-1" });
  });
});
