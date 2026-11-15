// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

vi.mock("../../power", () => ({
  getGenerator: vi.fn(),
  getPowerPlan: vi.fn(),
  listPowerLoads: vi.fn(async () => []),
  previousLoadCycle: vi.fn(async () => null),
  previousPlanCycle: vi.fn(async () => null),
}));
vi.mock("../../power-site", () => ({
  getSharingAgreement: vi.fn(async () => null),
  listFuelCans: vi.fn(async () => []),
  listGridNodes: vi.fn(async () => []),
  listReadinessItems: vi.fn(async () => []),
  listWorkPlanTasks: vi.fn(async () => []),
  previousGridCycle: vi.fn(async () => null),
}));
vi.mock("../reads", () => ({
  readNames: vi.fn(
    async (ids: string[]) =>
      new Map(
        ids.map((id) => [
          id,
          id === "33333333-3333-4333-8333-333333333333" ? "Pat Mokoena" : "?",
        ]),
      ),
  ),
}));

import { ALREADY_HAS_LOADS, NOTHING_TO_COPY } from "@camp404/core";
import { WORK_PLAN_ALREADY_ON_BOARD } from "@camp404/db/power-readiness";
import type { McpScope } from "../../mcp/scope";
import {
  getGenerator,
  getPowerPlan,
  listPowerLoads,
  previousLoadCycle,
} from "../../power";
import {
  getSharingAgreement,
  listFuelCans,
  listGridNodes,
  listReadinessItems,
  listWorkPlanTasks,
} from "../../power-site";
import { POWER_REFUSAL } from "../../power-copy";
import { POWER_PREVIEWS } from "../previews-power";

// The Power saves' voice previews (previews-power.ts): the sentence and facts
// come from the rows read on the server, the compare-and-set value is the
// row's own, and a row that is not there, or a person who may not save Power,
// is blocked before Do.

const HELPER = "33333333-3333-4333-8333-333333333333";
const LOAD_ID = "22222222-2222-4222-8222-222222222222";
const GEN_ID = "44444444-4444-4444-8444-444444444444";
const ITEM_ID = "55555555-5555-4555-8555-555555555555";
const CAN_ID = "66666666-6666-4666-8666-666666666666";
const NODE_ID = "77777777-7777-4777-8777-777777777777";

const scope = (over: Partial<McpScope> = {}): McpScope => ({
  campUserId: "11111111-1111-4111-8111-111111111111",
  rank: "member",
  viewerRank: "team_lead",
  leadTeams: ["power_and_lighting" as never],
  memberTeams: ["power_and_lighting" as never],
  isDriver: false,
  isCaptain: false,
  ...over,
});
const ctx = { scope: scope(), now: new Date("2026-10-06T10:00:00Z") };
const kitchenLead = {
  scope: scope({
    leadTeams: ["kitchen" as never],
    memberTeams: ["kitchen" as never],
  }),
  now: ctx.now,
};

const FREEZER = {
  id: LOAD_ID,
  name: "Chest freezer",
  area: "kitchen",
  quantity: 1,
  wattsEach: 120,
  version: 3,
};

describe("power previews", () => {
  it("names the load a change is for and fills in its version", async () => {
    vi.mocked(listPowerLoads).mockResolvedValue([FREEZER] as never);
    const p = await POWER_PREVIEWS.save_power_load!(
      { loadId: LOAD_ID, expectedVersion: 1, quantity: 2 },
      ctx,
    );
    expect(p.blocked).toBeUndefined();
    expect(p.sentence).toBe("Change the load “Chest freezer”");
    expect(p.facts).toBe("Power · loads · now 1 × 120 W · kitchen");
    expect(p.change).toEqual(["quantity: 2"]);
    expect(p.args).toEqual({
      loadId: LOAD_ID,
      expectedVersion: 3,
      quantity: 2,
    });
    expect(p.keys).toEqual([`power-load:${LOAD_ID}`]);
  });

  it("blocks a load that isn't there, and a lead of another team", async () => {
    vi.mocked(listPowerLoads).mockResolvedValue([]);
    const gone = await POWER_PREVIEWS.save_power_load!(
      { loadId: LOAD_ID, quantity: 2 },
      ctx,
    );
    expect(gone.blocked).toBe("That load isn't on this year's list.");

    const denied = await POWER_PREVIEWS.save_power_load!(
      { name: "Kettle", quantity: 1, wattsEach: 2000 },
      kitchenLead,
    );
    expect(denied.blocked).toBe(POWER_REFUSAL);
    const captain = await POWER_PREVIEWS.save_power_load!(
      { name: "Kettle", quantity: 1, wattsEach: 2000 },
      {
        scope: scope({ rank: "captain", viewerRank: "captain", leadTeams: [] }),
        now: ctx.now,
      },
    );
    expect(captain.blocked).toBeUndefined();
    expect(captain.sentence).toBe("Add the load “Kettle” to this year's list");
  });

  it("plugs a load in at a named point", async () => {
    vi.mocked(listPowerLoads).mockResolvedValue([FREEZER] as never);
    vi.mocked(listGridNodes).mockResolvedValue([
      { id: NODE_ID, name: "Kitchen box", kind: "junction", version: 1 },
    ] as never);
    const p = await POWER_PREVIEWS.plug_in_power_load!(
      { loadId: LOAD_ID, nodeId: NODE_ID },
      ctx,
    );
    expect(p.sentence).toBe("Plug “Chest freezer” in at “Kitchen box”");
    const off = await POWER_PREVIEWS.plug_in_power_load!(
      { loadId: LOAD_ID, nodeId: null },
      ctx,
    );
    expect(off.sentence).toBe("Take “Chest freezer” off the grid");
    expect(off.args).toEqual({ loadId: LOAD_ID, nodeId: null });
  });

  it("fills in the plan's version and lists the plan fields, generator included", async () => {
    vi.mocked(getPowerPlan).mockResolvedValue({
      version: 4,
      generatorId: GEN_ID,
      daysOnSite: 11,
    } as never);
    vi.mocked(getGenerator).mockResolvedValue({
      id: GEN_ID,
      model: "Honda EU22i",
      archivedAt: null,
    } as never);
    const p = await POWER_PREVIEWS.set_power_plan!(
      { expectedVersion: 0, generatorId: GEN_ID, daysOnSite: 9 },
      ctx,
    );
    expect(p.args).toMatchObject({ expectedVersion: 4 });
    expect(p.change).toEqual([`generatorId: “${GEN_ID}”`, "daysOnSite: 9"]);
    expect(p.facts).toBe("Power · plan · now “Honda EU22i”, 11 days on site");
  });

  it("blocks a copy when this year has its own, or there is nothing to copy", async () => {
    vi.mocked(listPowerLoads).mockResolvedValue([FREEZER] as never);
    vi.mocked(previousLoadCycle).mockResolvedValue(2025);
    const has = await POWER_PREVIEWS.copy_power_last_year!(
      { what: "loads" },
      ctx,
    );
    expect(has.blocked).toBe(ALREADY_HAS_LOADS);
    vi.mocked(listPowerLoads).mockResolvedValue([]);
    vi.mocked(previousLoadCycle).mockResolvedValue(null);
    const none = await POWER_PREVIEWS.copy_power_last_year!(
      { what: "loads" },
      ctx,
    );
    expect(none.blocked).toBe(NOTHING_TO_COPY);
    vi.mocked(previousLoadCycle).mockResolvedValue(2025);
    const ok = await POWER_PREVIEWS.copy_power_last_year!(
      { what: "loads" },
      ctx,
    );
    expect(ok.blocked).toBeUndefined();
    expect(ok.facts).toBe("Power · from 2025");
  });

  it("names who sees to a check and by when, from the roster", async () => {
    vi.mocked(listReadinessItems).mockResolvedValue([
      {
        id: ITEM_ID,
        generatorId: GEN_ID,
        label: "Oil checked",
        ownerName: null,
        dueOn: null,
        doneAt: null,
        version: 2,
      },
    ] as never);
    const p = await POWER_PREVIEWS.save_readiness_item!(
      { itemId: ITEM_ID, ownerUserId: HELPER, dueOn: "2027-04-14" },
      ctx,
    );
    expect(p.sentence).toBe("Put “Oil checked” on Pat Mokoena, by Wed 14 Apr");
    expect(p.args).toMatchObject({ expectedVersion: 2 });

    const tick = await POWER_PREVIEWS.tick_readiness_item!(
      { itemId: ITEM_ID, done: false },
      ctx,
    );
    expect(tick.blocked).toBe("It isn't ticked.");
  });

  it("blocks a second work plan", async () => {
    vi.mocked(listWorkPlanTasks).mockResolvedValue([{ taskId: "t" }] as never);
    const p = await POWER_PREVIEWS.add_power_work_plan!({}, ctx);
    expect(p.blocked).toBe(WORK_PLAN_ALREADY_ON_BOARD);
  });

  it("takes the sharing agreement's version, 0 when there is none", async () => {
    vi.mocked(getSharingAgreement).mockResolvedValue(null);
    const fresh = await POWER_PREVIEWS.save_power_sharing!(
      { expectedVersion: 3, partnerCamp: "Camp Next Door" },
      ctx,
    );
    expect(fresh.args).toMatchObject({ expectedVersion: 0 });
    expect(fresh.sentence).toBe(
      "Save a power sharing agreement with “Camp Next Door”",
    );
    vi.mocked(getSharingAgreement).mockResolvedValue({
      partnerCamp: "Camp Next Door",
      generatorSource: "theirs",
      version: 5,
    } as never);
    const edit = await POWER_PREVIEWS.save_power_sharing!(
      { expectedVersion: 0, partnerFuelPct: 40 },
      ctx,
    );
    expect(edit.args).toMatchObject({ expectedVersion: 5 });
    expect(edit.change).toEqual(["partnerFuelPct: 40"]);
  });

  it("names a fuel can by its number on the sheet", async () => {
    vi.mocked(listFuelCans).mockResolvedValue([
      { id: "x", version: 1 },
      {
        id: CAN_ID,
        sizeLitres: 20,
        material: "metal",
        ownerUserId: null,
        ownerName: null,
        version: 7,
      },
    ] as never);
    const p = await POWER_PREVIEWS.save_fuel_can!(
      { canId: CAN_ID, note: "Red cap" },
      ctx,
    );
    expect(p.sentence).toBe("Change fuel can 2");
    expect(p.facts).toBe("Power · fuel cans · now 20 L, metal, the camp's");
    expect(p.args).toMatchObject({ expectedVersion: 7 });
  });
});
