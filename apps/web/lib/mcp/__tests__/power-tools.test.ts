// @vitest-environment node
import type { McpServer } from "@modelcontextprotocol/server";
import type { CallToolResult } from "@modelcontextprotocol/server";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { ALREADY_HAS_LOADS, NOTHING_TO_COPY } from "@camp404/core";
import { type Team } from "@camp404/types";
import type { CampConfig } from "@camp404/db/camp-config";
import {
  GENERATOR_CHANGED,
  LOAD_CHANGED,
  NOT_A_POWER_EDITOR,
  PLAN_CHANGED,
} from "@camp404/db/power";
import {
  READINESS_ITEM_CHANGED,
  READINESS_TICKED_FIRST,
  SHARING_CHANGED,
  WORK_PLAN_ALREADY_ON_BOARD,
} from "@camp404/db/power-readiness";
import { CAN_CHANGED } from "@camp404/db/power-site";
import * as schema from "@camp404/db/schema";
import { assignTeam, setLead } from "@camp404/db/team-memberships";
import { useTestDb } from "../../../../../packages/db/src/__tests__/_harness";
import { makeUser } from "../../../../../packages/db/src/__tests__/_factories";
import { POWER_REFUSAL } from "../../power-copy";
import { registerCampMcpTools } from "../server";

// The Power program's saves over the connector (tools/power.ts), against real
// Postgres (PGlite) through the real handlers: who may (a captain or a Power &
// Lighting lead, POWER_EDITOR), who is refused and in what words, the rows the
// page's write leaves (the fuel cans' audit rows), the partial change filled
// from the row at the version read, and the compare-and-set refusals.

type Handler = (args: unknown, extra: unknown) => Promise<CallToolResult>;
const tools = new Map<string, Handler>();
registerCampMcpTools({
  registerTool: (name: string, _config: unknown, handler: Handler) => {
    tools.set(name, handler);
  },
} as unknown as McpServer);

async function call(name: string, args: unknown, as: string) {
  const result = await tools.get(name)!(args, {
    http: { authInfo: { clientId: "test", extra: { campUserId: as } } },
  });
  const text = (result.content[0] as { text: string }).text;
  return result.isError
    ? { error: text }
    : // eslint-disable-next-line @typescript-eslint/no-explicit-any -- a tool's JSON answer
      { data: JSON.parse(text) as Record<string, any> };
}

// eslint-disable-next-line react-hooks/rules-of-hooks -- useTestDb is the PGlite harness, not a React Hook
const h = useTestDb();

async function campYear(year = 2026) {
  const cycles: CampConfig["cycles"] = [
    { year, startedAt: `${year}-01-01T00:00:00.000Z`, endedAt: null },
  ];
  await h
    .db()
    .insert(schema.campSettings)
    .values({ id: true })
    .onConflictDoNothing({ target: schema.campSettings.id });
  const [row] = await h
    .db()
    .select({ config: schema.campSettings.config })
    .from(schema.campSettings)
    .limit(1);
  await h
    .db()
    .update(schema.campSettings)
    .set({ config: { ...row!.config, cycles } })
    .where(eq(schema.campSettings.id, true));
}

const member = () => makeUser(h.db(), { approvalStatus: "approved" });
const captain = () =>
  makeUser(h.db(), { approvalStatus: "approved", rank: "captain" });

async function leadOf(team: Team) {
  const user = await member();
  await assignTeam({ userId: user.id, team });
  await setLead({ userId: user.id, team, isLead: true });
  return user;
}

const powerLead = () => leadOf("power_and_lighting" as Team);

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const FRIDGE = {
  name: "Chest freezer",
  area: "kitchen",
  category: "refrigeration",
  quantity: 1,
  wattsEach: 120,
  dutyPct: 40,
  schedule: "full_time",
  owner: "camp",
};

const GENNY = {
  model: "Honda EU22i",
  ratedKva: 1.8,
  maxKva: 2.2,
  tankLitres: 3.6,
  runtime50Hours: 4,
  runtime100Hours: 2.5,
  fuelType: "petrol",
  owner: "camp",
};

async function loadRow(id: string) {
  const [row] = await h
    .db()
    .select()
    .from(schema.powerLoads)
    .where(eq(schema.powerLoads.id, id));
  return row!;
}

describe("get_power_plan", () => {
  it("lets any member read the plan, and says who may edit", async () => {
    await campYear();
    const lead = await powerLead();
    const plain = await member();
    await call("save_power_load", FRIDGE, lead.id);

    const asMember = await call("get_power_plan", {}, plain.id);
    expect(asMember.error).toBeUndefined();
    expect(asMember.data!.youMayEdit).toBe(false);
    expect(asMember.data!.loads).toHaveLength(1);
    expect(asMember.data!.loads[0]).toMatchObject({
      name: "Chest freezer",
      version: 1,
      gridNodeId: null,
    });
    expect(asMember.data!.plan).toMatchObject({ version: 0 });
    expect(asMember.data!.sharing).toEqual({ version: 0 });

    const asLead = await call("get_power_plan", {}, lead.id);
    expect(asLead.data!.youMayEdit).toBe(true);
  });
});

describe("save_power_load", () => {
  it("adds a load, then changes only the fields given on the version read", async () => {
    await campYear();
    const lead = await powerLead();
    const added = await call("save_power_load", FRIDGE, lead.id);
    expect(added.error).toBeUndefined();
    const loadId = added.data!.id as string;

    const changed = await call(
      "save_power_load",
      { loadId, expectedVersion: 1, quantity: 2, circuit: "A" },
      lead.id,
    );
    expect(changed.error).toBeUndefined();
    expect(changed.data).toMatchObject({ id: loadId, version: 2 });
    expect(await loadRow(loadId)).toMatchObject({
      name: "Chest freezer",
      area: "kitchen",
      wattsEach: 120,
      dutyPct: 40,
      quantity: 2,
      circuit: "A",
      version: 2,
    });

    const stale = await call(
      "save_power_load",
      { loadId, expectedVersion: 1, quantity: 5 },
      lead.id,
    );
    expect(stale.error).toBe(LOAD_CHANGED);
    expect((await loadRow(loadId)).quantity).toBe(2);
  });

  it("drops the neighbour's camp when the owner changes, and gives the schema's sentence", async () => {
    await campYear();
    const lead = await powerLead();
    const added = await call(
      "save_power_load",
      { ...FRIDGE, owner: "neighbour", neighbourCamp: "Camp Next Door" },
      lead.id,
    );
    const loadId = added.data!.id as string;
    const moved = await call(
      "save_power_load",
      { loadId, expectedVersion: 1, owner: "camp" },
      lead.id,
    );
    expect(moved.error).toBeUndefined();
    expect(await loadRow(loadId)).toMatchObject({
      owner: "camp",
      neighbourCamp: null,
    });

    const bad = await call(
      "save_power_load",
      { ...FRIDGE, schedule: "hours_per_day" },
      lead.id,
    );
    expect(bad.error).toBe("Say how many hours a day it runs.");
  });

  it("refuses a member at the gate and a lead of another team", async () => {
    await campYear();
    const plain = await member();
    const kitchen = await leadOf("kitchen");
    const asMember = await call("save_power_load", FRIDGE, plain.id);
    expect(asMember.error).toMatch(
      new RegExp(
        `^${escape(POWER_REFUSAL)} On the website: https?://\\S+/power/loads$`,
      ),
    );
    const asKitchen = await call("save_power_load", FRIDGE, kitchen.id);
    expect(asKitchen.error).toMatch(new RegExp(`^${escape(POWER_REFUSAL)}`));
    expect(await h.db().select().from(schema.powerLoads)).toHaveLength(0);
    // The write's own refusal is the same sentence as the gate's.
    expect(NOT_A_POWER_EDITOR).toBe(POWER_REFUSAL);
  });
});

describe("save_generator and set_power_plan", () => {
  it("adds and changes a generator, and refuses a stale version", async () => {
    await campYear();
    const boss = await captain();
    const added = await call("save_generator", GENNY, boss.id);
    expect(added.error).toBeUndefined();
    const generatorId = added.data!.id as string;
    const changed = await call(
      "save_generator",
      { generatorId, expectedVersion: 1, noiseNote: "Quiet" },
      boss.id,
    );
    expect(changed.error).toBeUndefined();
    const [row] = await h
      .db()
      .select()
      .from(schema.generators)
      .where(eq(schema.generators.id, generatorId));
    expect(row).toMatchObject({
      model: "Honda EU22i",
      tankLitres: 3.6,
      noiseNote: "Quiet",
      version: 2,
    });
    const stale = await call(
      "save_generator",
      { generatorId, expectedVersion: 1, model: "Other" },
      boss.id,
    );
    expect(stale.error).toBe(GENERATOR_CHANGED);
  });

  it("saves the plan's fields given, keeps the rest, and refuses a stale version", async () => {
    await campYear();
    const lead = await powerLead();
    const genny = await call("save_generator", GENNY, lead.id);
    const first = await call(
      "set_power_plan",
      { expectedVersion: 0, daysOnSite: 9, generatorId: genny.data!.id },
      lead.id,
    );
    expect(first.error).toBeUndefined();
    expect(first.data).toMatchObject({ version: 1 });

    const second = await call(
      "set_power_plan",
      { expectedVersion: 1, runFromHour: 18, runToHour: 2 },
      lead.id,
    );
    expect(second.error).toBeUndefined();
    const plan = (await call("get_power_plan", {}, lead.id)).data!.plan;
    expect(plan).toMatchObject({
      version: 2,
      daysOnSite: 9,
      generatorId: genny.data!.id,
      generatorModel: "Honda EU22i",
      runFromHour: 18,
      runToHour: 2,
    });

    expect(
      (
        await call(
          "set_power_plan",
          { expectedVersion: 1, daysOnSite: 3 },
          lead.id,
        )
      ).error,
    ).toBe(PLAN_CHANGED);
    expect(
      (
        await call(
          "set_power_plan",
          { expectedVersion: 2, runFromHour: 2 },
          lead.id,
        )
      ).error,
    ).toBe("The generator must start and stop at different hours.");
    expect(
      (
        await call(
          "set_power_plan",
          { expectedVersion: 2, powerFactor: 2 },
          lead.id,
        )
      ).error,
    ).toBe("The power factor is at most 1.");
  });
});

describe("copy_power_last_year", () => {
  it("copies an earlier year's loads once, and says when there is nothing to copy", async () => {
    await campYear(2025);
    const boss = await captain();
    const none = await call("copy_power_last_year", { what: "loads" }, boss.id);
    expect(none.error).toBe(NOTHING_TO_COPY);
    await call("save_power_load", FRIDGE, boss.id);

    await campYear(2026);
    const copied = await call(
      "copy_power_last_year",
      { what: "loads" },
      boss.id,
    );
    expect(copied.error).toBeUndefined();
    expect(copied.data).toMatchObject({ copied: "loads", count: 1 });
    const again = await call(
      "copy_power_last_year",
      { what: "loads" },
      boss.id,
    );
    expect(again.error).toBe(ALREADY_HAS_LOADS);
  });
});

describe("the grid", () => {
  it("adds and changes points and plugs a load in", async () => {
    await campYear();
    const lead = await powerLead();
    const gen = await call(
      "save_grid_node",
      { name: "Genny", kind: "generator" },
      lead.id,
    );
    expect(gen.error).toBeUndefined();
    const box = await call(
      "save_grid_node",
      { name: "Kitchen box", kind: "junction", parentId: gen.data!.id },
      lead.id,
    );
    expect(box.error).toBeUndefined();
    const nodeId = box.data!.id as string;
    const changed = await call(
      "save_grid_node",
      { nodeId, expectedVersion: 1, cableLengthM: 25, haveCable: true },
      lead.id,
    );
    expect(changed.error).toBeUndefined();

    const load = await call("save_power_load", FRIDGE, lead.id);
    const plugged = await call(
      "plug_in_power_load",
      { loadId: load.data!.id, nodeId },
      lead.id,
    );
    expect(plugged.error).toBeUndefined();

    const read = (await call("get_power_plan", {}, lead.id)).data!;
    expect(read.loads[0].gridNodeId).toBe(nodeId);
    expect(
      read.grid.find((n: { id: string }) => n.id === nodeId),
    ).toMatchObject({
      name: "Kitchen box",
      parentId: gen.data!.id,
      cableLengthM: 25,
      haveCable: true,
      version: 2,
    });
    expect(
      (
        await call(
          "save_grid_node",
          { name: "Loose", kind: "end_point" },
          lead.id,
        )
      ).error,
    ).toBe("Say which point feeds it.");
  });
});

describe("readiness and the work plan", () => {
  it("starts a checklist, adds and assigns a check, ticks it once", async () => {
    await campYear();
    const lead = await powerLead();
    const helper = await member();
    const genny = await call("save_generator", GENNY, lead.id);
    const generatorId = genny.data!.id as string;

    const started = await call(
      "start_readiness_checklist",
      { generatorId },
      lead.id,
    );
    expect(started.data).toMatchObject({ count: 9 });
    const added = await call(
      "save_readiness_item",
      { generatorId, label: "Buy a funnel" },
      lead.id,
    );
    expect(added.error).toBeUndefined();
    const itemId = added.data!.id as string;

    const assigned = await call(
      "save_readiness_item",
      { itemId, expectedVersion: 1, ownerUserId: helper.id },
      lead.id,
    );
    expect(assigned.error).toBeUndefined();
    const dated = await call(
      "save_readiness_item",
      { itemId, expectedVersion: 2, dueOn: "2026-04-01" },
      lead.id,
    );
    expect(dated.error).toBeUndefined();
    const stale = await call(
      "save_readiness_item",
      { itemId, expectedVersion: 2, dueOn: null },
      lead.id,
    );
    expect(stale.error).toBe(READINESS_ITEM_CHANGED);

    expect(
      (await call("tick_readiness_item", { itemId, done: true }, lead.id))
        .error,
    ).toBeUndefined();
    expect(
      (await call("tick_readiness_item", { itemId, done: true }, lead.id))
        .error,
    ).toBe(READINESS_TICKED_FIRST);

    const item = (
      await call("get_power_plan", {}, lead.id)
    ).data!.readiness.find((i: { id: string }) => i.id === itemId);
    expect(item).toMatchObject({
      label: "Buy a funnel",
      ownerUserId: helper.id,
      dueOn: "2026-04-01",
      done: true,
    });
  });

  it("puts the work plan on the board once", async () => {
    await campYear();
    const lead = await powerLead();
    const first = await call("add_power_work_plan", {}, lead.id);
    expect(first.error).toBeUndefined();
    expect(first.data).toMatchObject({ count: 6, fromYear: null });
    const tasks = await h
      .db()
      .select()
      .from(schema.tasks)
      .where(eq(schema.tasks.team, "power_and_lighting"));
    expect(tasks).toHaveLength(6);
    expect(tasks.every((t) => t.assigneeId === null)).toBe(true);
    expect((await call("add_power_work_plan", {}, lead.id)).error).toBe(
      WORK_PLAN_ALREADY_ON_BOARD,
    );
  });
});

describe("save_power_sharing", () => {
  it("makes the agreement, changes a field, and refuses contact details and stale versions", async () => {
    await campYear();
    const lead = await powerLead();
    const made = await call(
      "save_power_sharing",
      {
        expectedVersion: 0,
        partnerCamp: "Camp Next Door",
        generatorSource: "theirs",
        theirGenerator: "Their 5 kVA",
      },
      lead.id,
    );
    expect(made.error).toBeUndefined();
    expect(made.data).toMatchObject({ version: 1 });
    const changed = await call(
      "save_power_sharing",
      { expectedVersion: 1, partnerFuelPct: 40 },
      lead.id,
    );
    expect(changed.error).toBeUndefined();
    const sharing = (await call("get_power_plan", {}, lead.id)).data!.sharing;
    expect(sharing).toMatchObject({
      version: 2,
      partnerCamp: "Camp Next Door",
      theirGenerator: "Their 5 kVA",
      partnerFuelPct: 40,
    });
    expect(
      (
        await call(
          "save_power_sharing",
          { expectedVersion: 2, contactRole: "082 555 1234" },
          lead.id,
        )
      ).error,
    ).toBe("Give a role, not a phone number or an email address.");
    expect(
      (await call("save_power_sharing", { expectedVersion: 1 }, lead.id)).error,
    ).toBe(SHARING_CHANGED);
  });
});

describe("save_fuel_can", () => {
  it("adds and changes a can with the page's audit rows, and refuses a stale version", async () => {
    await campYear();
    const lead = await powerLead();
    const owner = await member();
    const added = await call(
      "save_fuel_can",
      { sizeLitres: 20, material: "metal", ownerUserId: owner.id },
      lead.id,
    );
    expect(added.error).toBeUndefined();
    expect(added.data).toMatchObject({ number: 1 });
    const canId = added.data!.id as string;

    const changed = await call(
      "save_fuel_can",
      { canId, expectedVersion: 1, note: "Red cap" },
      lead.id,
    );
    expect(changed.error).toBeUndefined();
    const [row] = await h
      .db()
      .select()
      .from(schema.fuelCans)
      .where(eq(schema.fuelCans.id, canId));
    expect(row).toMatchObject({
      sizeLitres: 20,
      material: "metal",
      ownerUserId: owner.id,
      note: "Red cap",
      version: 2,
    });

    const audit = await h
      .db()
      .select()
      .from(schema.auditLog)
      .where(eq(schema.auditLog.target, canId));
    expect(audit.map((a) => a.action).sort()).toEqual([
      "power.fuel_can_added",
      "power.fuel_can_changed",
    ]);
    expect(audit.every((a) => a.actorId === lead.id)).toBe(true);

    const stale = await call(
      "save_fuel_can",
      { canId, expectedVersion: 1, sizeLitres: 25 },
      lead.id,
    );
    expect(stale.error).toBe(CAN_CHANGED);
  });
});
