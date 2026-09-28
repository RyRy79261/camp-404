import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { POWER_TEAM, gridRuns, runAmps } from "@camp404/core";
import {
  EditGridNodeInput,
  GridNodeInput,
  LoadInput,
  type Team,
} from "@camp404/types";
import type { CampConfig } from "../camp-config";
import {
  NOT_A_POWER_EDITOR,
  addPowerLoad,
  copyLastYearLoads,
  listPowerLoads,
} from "../power";
import {
  ALREADY_HAS_GRID,
  GRID_FEEDS_OTHERS,
  GRID_LOOP,
  GRID_NODE_CHANGED,
  GRID_NODE_GONE,
  GRID_PARENT_END_POINT,
  addGridNode,
  assignLoadToGridNode,
  copyLastYearGrid,
  listGridNodes,
  listLoadGridPoints,
  removeGridNode,
  updateGridNode,
} from "../power-grid";
import * as schema from "../schema";
import { assignTeam, setLead } from "../team-memberships";
import { useTestDb } from "./_harness";
import { makeUser } from "./_factories";

// The grid plan (#256) on PGlite. What matters: only a captain or a Power &
// Lighting lead writes; the tree never loops and an end point feeds nothing;
// a point that feeds others cannot be removed; loads plug in at points of
// their own year; and the amps a run carries are summed through two levels of
// junctions from the stored rows.

type DB = ReturnType<ReturnType<typeof useTestDb>["db"]>;

async function campYear(db: DB, year: number, earlier: number[] = []) {
  const cycles: CampConfig["cycles"] = [
    ...earlier.map((y) => ({
      year: y,
      startedAt: `${y}-01-01T00:00:00.000Z`,
      endedAt: `${y}-12-31T00:00:00.000Z`,
    })),
    { year, startedAt: `${year}-01-01T00:00:00.000Z`, endedAt: null },
  ];
  await db
    .insert(schema.campSettings)
    .values({ id: true })
    .onConflictDoNothing({ target: schema.campSettings.id });
  const [row] = await db
    .select({ config: schema.campSettings.config })
    .from(schema.campSettings)
    .limit(1);
  await db
    .update(schema.campSettings)
    .set({ config: { ...row!.config, cycles } })
    .where(eq(schema.campSettings.id, true));
}

const load = (name: string, wattsEach: number) =>
  LoadInput.parse({
    name,
    area: "camp",
    category: "other",
    quantity: 1,
    wattsEach,
    schedule: "full_time",
    owner: "camp",
  });

describe("grid plan", () => {
  const h = useTestDb();

  async function leadOf(team: Team) {
    const user = await makeUser(h.db());
    await assignTeam({ userId: user.id, team });
    await setLead({ userId: user.id, team, isLead: true });
    return user;
  }

  async function point(
    actorId: string,
    fields: Record<string, unknown>,
  ): Promise<string> {
    const made = await addGridNode({
      ...GridNodeInput.parse(fields),
      actorId,
    });
    if (!made.ok) throw new Error(made.error);
    return made.id;
  }

  /** gen ─ main (16 A) ─ right (10 A) ─ kitchen (10 A), main ─ lounge. */
  async function grid(actorId: string) {
    const gen = await point(actorId, { name: "Genny", kind: "generator" });
    const main = await point(actorId, {
      name: "Main junction",
      kind: "junction",
      parentId: gen,
      cable: "Armoured 2.5 mm²",
      cableLengthM: 25,
      cableRatedAmps: 16,
    });
    const right = await point(actorId, {
      name: "Right junction",
      kind: "junction",
      parentId: main,
      cableRatedAmps: 10,
    });
    const kitchen = await point(actorId, {
      name: "Kitchen",
      kind: "end_point",
      parentId: right,
      cableRatedAmps: 10,
      adapter: "4-way multiplug",
      haveAdapter: false,
    });
    const lounge = await point(actorId, {
      name: "Lounge",
      kind: "end_point",
      parentId: main,
    });
    return { gen, main, right, kitchen, lounge };
  }

  async function setup() {
    await campYear(h.db(), 2026, [2025]);
    const captain = await makeUser(h.db(), { rank: "captain" });
    const powerLead = await leadOf(POWER_TEAM as Team);
    const kitchenLead = await leadOf("kitchen");
    return { captain, powerLead, kitchenLead };
  }

  it("sums the amps through two levels of junctions from the stored rows", async () => {
    const { powerLead } = await setup();
    const g = await grid(powerLead.id);
    const fridge = await addPowerLoad({
      ...load("Fridges", 1150),
      actorId: powerLead.id,
    });
    const lights = await addPowerLoad({
      ...load("Lights", 2070),
      actorId: powerLead.id,
    });
    if (!fridge.ok || !lights.ok) throw new Error("load");
    expect(
      await assignLoadToGridNode({
        actorId: powerLead.id,
        loadId: fridge.id,
        nodeId: g.kitchen,
      }),
    ).toEqual({ ok: true });
    await assignLoadToGridNode({
      actorId: powerLead.id,
      loadId: lights.id,
      nodeId: g.lounge,
    });

    const nodes = await listGridNodes();
    const where = await listLoadGridPoints();
    const loads = (await listPowerLoads()).map((l) => ({
      ...l,
      gridNodeId: where[l.id] ?? null,
    }));
    // 1150 W at the kitchen, two junctions down: 5 A on each run above it.
    expect(runAmps(nodes, loads, g.right, 11)).toBeCloseTo(5, 6);
    // The main junction carries the kitchen and the lounge: 3220 W is 14 A.
    expect(runAmps(nodes, loads, g.main, 11)).toBeCloseTo(14, 6);
    const runs = gridRuns(nodes, loads, 11);
    expect(runs.find((r) => r.id === g.main)?.band).toBe("warn");
    expect(runs.find((r) => r.id === g.right)?.band).toBe("ok");
    expect(runs.find((r) => r.id === g.lounge)?.band).toBe("unknown");

    // The load's own version is left alone by plugging it in.
    const [row] = await h
      .db()
      .select({ version: schema.powerLoads.version })
      .from(schema.powerLoads)
      .where(eq(schema.powerLoads.id, fridge.id));
    expect(row?.version).toBe(1);
  });

  it("refuses a lead of another team and a member", async () => {
    const { powerLead, kitchenLead } = await setup();
    const g = await grid(powerLead.id);
    const member = await makeUser(h.db());
    for (const actor of [kitchenLead, member]) {
      expect(
        await addGridNode({
          ...GridNodeInput.parse({ name: "X", kind: "generator" }),
          actorId: actor.id,
        }),
      ).toEqual({ ok: false, error: NOT_A_POWER_EDITOR });
      expect(
        await removeGridNode({
          actorId: actor.id,
          nodeId: g.lounge,
          expectedVersion: 1,
        }),
      ).toEqual({ ok: false, error: NOT_A_POWER_EDITOR });
    }
    expect(await listGridNodes()).toHaveLength(5);
  });

  it("never loops, and an end point feeds nothing", async () => {
    const { powerLead } = await setup();
    const g = await grid(powerLead.id);
    const move = (parentId: string, version = 1) =>
      updateGridNode({
        ...EditGridNodeInput.parse({
          nodeId: g.main,
          expectedVersion: version,
          name: "Main junction",
          kind: "junction",
          parentId,
        }),
        actorId: powerLead.id,
      });
    expect(await move(g.right)).toEqual({ ok: false, error: GRID_LOOP });
    expect(await move(g.main)).toEqual({ ok: false, error: GRID_LOOP });
    expect(await move(g.lounge)).toEqual({
      ok: false,
      error: GRID_PARENT_END_POINT,
    });
    expect(
      await addGridNode({
        ...GridNodeInput.parse({
          name: "Behind the kitchen",
          kind: "end_point",
          parentId: g.kitchen,
        }),
        actorId: powerLead.id,
      }),
    ).toEqual({ ok: false, error: GRID_PARENT_END_POINT });
    // A junction that feeds others cannot become an end point.
    expect(
      await updateGridNode({
        ...EditGridNodeInput.parse({
          nodeId: g.right,
          expectedVersion: 1,
          name: "Right",
          kind: "end_point",
          parentId: g.main,
        }),
        actorId: powerLead.id,
      }),
    ).toEqual({ ok: false, error: GRID_FEEDS_OTHERS });
  });

  it("edits are compare-and-set, and a feeding point cannot be removed", async () => {
    const { captain, powerLead } = await setup();
    const g = await grid(powerLead.id);
    const rename = (actorId: string, name: string) =>
      updateGridNode({
        ...EditGridNodeInput.parse({
          nodeId: g.lounge,
          expectedVersion: 1,
          name,
          kind: "end_point",
          parentId: g.main,
        }),
        actorId,
      });
    expect(await rename(powerLead.id, "Chill dome")).toEqual({ ok: true });
    expect(await rename(captain.id, "Lounge")).toEqual({
      ok: false,
      error: GRID_NODE_CHANGED,
    });
    expect(
      await removeGridNode({
        actorId: captain.id,
        nodeId: g.right,
        expectedVersion: 1,
      }),
    ).toEqual({ ok: false, error: GRID_FEEDS_OTHERS });
    expect(
      await removeGridNode({
        actorId: captain.id,
        nodeId: g.kitchen,
        expectedVersion: 1,
      }),
    ).toEqual({ ok: true });
    expect(
      await removeGridNode({
        actorId: captain.id,
        nodeId: g.kitchen,
        expectedVersion: 1,
      }),
    ).toEqual({ ok: false, error: GRID_NODE_GONE });
  });

  it("plugs a load in only at a point of its own year", async () => {
    const { powerLead } = await setup();
    const g = await grid(powerLead.id);
    const [old] = await h
      .db()
      .insert(schema.powerGridNodes)
      .values({ cycle: 2025, name: "Old genny", kind: "generator" })
      .returning({ id: schema.powerGridNodes.id });
    const made = await addPowerLoad({
      ...load("Fridge", 100),
      actorId: powerLead.id,
    });
    if (!made.ok) throw new Error(made.error);
    expect(
      await assignLoadToGridNode({
        actorId: powerLead.id,
        loadId: made.id,
        nodeId: old!.id,
      }),
    ).toEqual({ ok: false, error: GRID_NODE_GONE });
    await assignLoadToGridNode({
      actorId: powerLead.id,
      loadId: made.id,
      nodeId: g.kitchen,
    });
    expect(await listLoadGridPoints()).toEqual({ [made.id]: g.kitchen });
    await assignLoadToGridNode({
      actorId: powerLead.id,
      loadId: made.id,
      nodeId: null,
    });
    expect(await listLoadGridPoints()).toEqual({});
  });

  it("copies last year's grid once, with the same shape and fresh ids", async () => {
    // A captain: leads are the year's, and this test changes the year.
    const { captain: powerLead } = await setup();
    await campYear(h.db(), 2025);
    const g = await grid(powerLead.id);
    await addPowerLoad({ ...load("Fridge", 100), actorId: powerLead.id });
    await campYear(h.db(), 2026, [2025]);
    const copied = await copyLastYearGrid({ actorId: powerLead.id });
    expect(copied).toEqual({ ok: true, count: 5 });
    expect(await copyLastYearGrid({ actorId: powerLead.id })).toEqual({
      ok: false,
      error: ALREADY_HAS_GRID,
    });
    const nodes = await listGridNodes();
    expect(nodes.map((n) => n.name).sort()).toEqual(
      ["Genny", "Kitchen", "Lounge", "Main junction", "Right junction"].sort(),
    );
    expect(nodes.some((n) => Object.values(g).includes(n.id))).toBe(false);
    const byName = new Map(nodes.map((n) => [n.name, n]));
    expect(byName.get("Kitchen")?.parentId).toBe(
      byName.get("Right junction")?.id,
    );
    expect(byName.get("Kitchen")).toMatchObject({
      adapter: "4-way multiplug",
      haveAdapter: false,
      cableRatedAmps: 10,
    });
    // Loads copied later start off the grid.
    await copyLastYearLoads({ actorId: powerLead.id });
    expect(await listLoadGridPoints()).toEqual({});
  });
});
