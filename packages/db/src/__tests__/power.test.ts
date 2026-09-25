import { eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { POWER_TEAM } from "@camp404/core";
import {
  EditGeneratorInput,
  EditLoadInput,
  GeneratorInput,
  LoadInput,
  type Team,
} from "@camp404/types";
import type { CampConfig } from "../camp-config";
import * as schema from "../schema";
import {
  ALREADY_HAS_LOADS,
  ALREADY_HAS_PLAN,
  DEFAULT_POWER_PLAN,
  GENERATOR_GONE,
  LOAD_CHANGED,
  NOT_A_POWER_EDITOR,
  NOTHING_TO_COPY,
  PLAN_CHANGED,
  addGenerator,
  addPowerLoad,
  archiveGenerator,
  copyLastYearLoads,
  copyLastYearPlan,
  getGenerator,
  getPowerPlan,
  listGenerators,
  listPowerInventory,
  listPowerLoads,
  previousLoadCycle,
  previousPlanCycle,
  removePowerLoad,
  setPowerPlan,
  updateGenerator,
  updatePowerLoad,
} from "../power";
import { assignTeam, setLead } from "../team-memberships";
import { useTestDb } from "./_harness";
import { makeUser } from "./_factories";

// Power and fuel (#253, #254) on a real Postgres (PGlite). What matters: only
// a captain or a Power & Lighting lead writes, checked again inside each
// write; a lead of another team is refused; every edit is compare-and-set;
// loads and plans belong to the year they were written in, and generators do
// not; and "copy last year" cannot double a list.

type DB = ReturnType<ReturnType<typeof useTestDb>["db"]>;

/** Put the camp in `year`, with the years before it closed. */
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

const FRIDGE = LoadInput.parse({
  name: "Chest freezer",
  area: "kitchen",
  category: "refrigeration",
  quantity: 1,
  wattsEach: 150,
  dutyPct: 40,
  schedule: "full_time",
  owner: "camp",
  fromDay: 2,
  toDay: 5,
});

const STRING_LIGHTS = LoadInput.parse({
  name: "Festoon lights",
  area: "lounge",
  category: "lighting_decorative",
  quantity: 4,
  wattsEach: 25,
  schedule: "windows",
  windows: [{ fromHour: 18, toHour: 2 }],
  owner: "member",
});

const GENNY = GeneratorInput.parse({
  model: "Honda EU70is",
  ratedKva: 5.5,
  maxKva: 7,
  tankLitres: 19.2,
  runtime50Hours: 8.2,
  runtime100Hours: 4,
  fuelType: "petrol",
  owner: "camp",
});

function edit(loadId: string, expectedVersion: number, changes = {}) {
  return EditLoadInput.parse({
    ...FRIDGE,
    ...changes,
    loadId,
    expectedVersion,
  });
}

describe("power", () => {
  const h = useTestDb();

  /** A lead of `team` this year, through the real helpers. */
  async function leadOf(team: Team) {
    const user = await makeUser(h.db());
    await assignTeam({ userId: user.id, team });
    const led = await setLead({ userId: user.id, team, isLead: true });
    expect(led).toEqual({ ok: true, changed: true });
    return user;
  }

  async function people() {
    await campYear(h.db(), 2026);
    const captain = await makeUser(h.db(), { rank: "captain" });
    const powerLead = await leadOf(POWER_TEAM as Team);
    const kitchenLead = await leadOf("kitchen");
    const member = await makeUser(h.db());
    return { captain, powerLead, kitchenLead, member };
  }

  async function add(actorId: string, load = FRIDGE) {
    const made = await addPowerLoad({ ...load, actorId });
    if (!made.ok) throw new Error(made.error);
    return made.id;
  }

  async function storedLoad(id: string) {
    const [row] = await h
      .db()
      .select()
      .from(schema.powerLoads)
      .where(eq(schema.powerLoads.id, id));
    return row;
  }

  describe("who may edit", () => {
    it("lets a captain and a Power & Lighting lead add, update and remove", async () => {
      const { captain, powerLead } = await people();
      for (const actor of [captain, powerLead]) {
        const id = await add(actor.id);
        expect(
          await updatePowerLoad({
            ...edit(id, 1, { quantity: 2 }),
            actorId: actor.id,
          }),
        ).toEqual({ ok: true });
        expect((await storedLoad(id))?.quantity).toBe(2);
        expect((await storedLoad(id))?.version).toBe(2);
        expect(
          await removePowerLoad({
            actorId: actor.id,
            loadId: id,
            expectedVersion: 2,
          }),
        ).toEqual({ ok: true });
        expect(await storedLoad(id)).toBeUndefined();
      }
    });

    it("refuses a lead of another team, server-side", async () => {
      const { captain, kitchenLead } = await people();
      expect(
        await addPowerLoad({ ...FRIDGE, actorId: kitchenLead.id }),
      ).toEqual({ ok: false, error: NOT_A_POWER_EDITOR });
      const id = await add(captain.id);
      expect(
        await updatePowerLoad({
          ...edit(id, 1, { quantity: 9 }),
          actorId: kitchenLead.id,
        }),
      ).toEqual({ ok: false, error: NOT_A_POWER_EDITOR });
      expect(
        await removePowerLoad({
          actorId: kitchenLead.id,
          loadId: id,
          expectedVersion: 1,
        }),
      ).toEqual({ ok: false, error: NOT_A_POWER_EDITOR });
      expect(await addGenerator({ ...GENNY, actorId: kitchenLead.id })).toEqual(
        { ok: false, error: NOT_A_POWER_EDITOR },
      );
      expect(
        await setPowerPlan({
          actorId: kitchenLead.id,
          patch: { daysOnSite: 9 },
          expectedVersion: 0,
        }),
      ).toEqual({ ok: false, error: NOT_A_POWER_EDITOR });
      expect((await storedLoad(id))?.quantity).toBe(1);
      expect(await h.db().select().from(schema.generators)).toEqual([]);
      expect(await h.db().select().from(schema.powerPlans)).toEqual([]);
    });

    it("refuses a plain member", async () => {
      const { member } = await people();
      expect(await addPowerLoad({ ...FRIDGE, actorId: member.id })).toEqual({
        ok: false,
        error: NOT_A_POWER_EDITOR,
      });
      expect(await copyLastYearLoads({ actorId: member.id })).toEqual({
        ok: false,
        error: NOT_A_POWER_EDITOR,
      });
    });

    it("refuses a Power & Lighting lead demoted before the write", async () => {
      const { powerLead } = await people();
      const id = await add(powerLead.id);
      await setLead({
        userId: powerLead.id,
        team: POWER_TEAM as Team,
        isLead: false,
      });
      expect(
        await updatePowerLoad({
          ...edit(id, 1, { quantity: 3 }),
          actorId: powerLead.id,
        }),
      ).toEqual({ ok: false, error: NOT_A_POWER_EDITOR });
      expect((await storedLoad(id))?.quantity).toBe(1);
    });

    it("refuses last year's Power & Lighting lead", async () => {
      await campYear(h.db(), 2026);
      const oldLead = await leadOf(POWER_TEAM as Team);
      await campYear(h.db(), 2027, [2026]);
      expect(await addPowerLoad({ ...FRIDGE, actorId: oldLead.id })).toEqual({
        ok: false,
        error: NOT_A_POWER_EDITOR,
      });
    });
  });

  describe("loads", () => {
    it("stamps this year's cycle on a new load, not the default 1", async () => {
      const { captain } = await people();
      const id = await add(captain.id);
      expect((await storedLoad(id))?.cycle).toBe(2026);
      expect((await listPowerLoads()).map((l) => l.id)).toEqual([id]);
      expect(await listPowerLoads(1)).toEqual([]);
    });

    it("stores a member's load with no member on it", async () => {
      const { captain } = await people();
      const id = await add(captain.id, STRING_LIGHTS);
      const row = await storedLoad(id);
      expect(row?.owner).toBe("member");
      expect(row?.windows).toEqual([{ fromHour: 18, toHour: 2 }]);
    });

    it("lists in the team's order", async () => {
      const { captain } = await people();
      const first = await add(captain.id);
      const second = await add(captain.id, STRING_LIGHTS);
      expect((await listPowerLoads()).map((l) => [l.id, l.sort])).toEqual([
        [first, 0],
        [second, 1],
      ]);
    });

    it("refuses a stale version and leaves the load as it was", async () => {
      const { captain, powerLead } = await people();
      const id = await add(captain.id);
      expect(
        await updatePowerLoad({
          ...edit(id, 1, { quantity: 2 }),
          actorId: captain.id,
        }),
      ).toEqual({ ok: true });
      // The lead opened the form before the captain saved.
      expect(
        await updatePowerLoad({
          ...edit(id, 1, { quantity: 7 }),
          actorId: powerLead.id,
        }),
      ).toEqual({ ok: false, error: LOAD_CHANGED });
      expect(
        await removePowerLoad({
          actorId: powerLead.id,
          loadId: id,
          expectedVersion: 1,
        }),
      ).toEqual({ ok: false, error: LOAD_CHANGED });
      const row = await storedLoad(id);
      expect(row?.quantity).toBe(2);
      expect(row?.version).toBe(2);
    });

    it("does not edit last year's load from this year", async () => {
      const { captain } = await people();
      const id = await add(captain.id);
      await campYear(h.db(), 2027, [2026]);
      const result = await updatePowerLoad({
        ...edit(id, 1, { quantity: 5 }),
        actorId: captain.id,
      });
      expect(result.ok).toBe(false);
      expect((await storedLoad(id))?.quantity).toBe(1);
    });
  });

  describe("copy last year", () => {
    it("copies last year's list into this year, day numbers intact", async () => {
      const { captain } = await people();
      const fridge = await add(captain.id);
      await add(captain.id, STRING_LIGHTS);
      await campYear(h.db(), 2027, [2026]);
      expect(await previousLoadCycle()).toBe(2026);

      expect(await copyLastYearLoads({ actorId: captain.id })).toEqual({
        ok: true,
        count: 2,
      });
      const now = await listPowerLoads();
      expect(now.map((l) => [l.name, l.cycle, l.fromDay, l.toDay])).toEqual([
        ["Chest freezer", 2027, 2, 5],
        ["Festoon lights", 2027, null, null],
      ]);
      expect(now.map((l) => l.id)).not.toContain(fridge);
      // Last year's list is untouched.
      expect(await listPowerLoads(2026)).toHaveLength(2);

      expect(await copyLastYearLoads({ actorId: captain.id })).toEqual({
        ok: false,
        error: ALREADY_HAS_LOADS,
      });
      expect(await listPowerLoads()).toHaveLength(2);
    });

    it("copies from the latest earlier year that has loads", async () => {
      const { captain } = await people();
      await add(captain.id);
      await campYear(h.db(), 2028, [2026, 2027]);
      expect(await previousLoadCycle()).toBe(2026);
      expect(await copyLastYearLoads({ actorId: captain.id })).toEqual({
        ok: true,
        count: 1,
      });
    });

    it("has nothing to copy in the camp's first year", async () => {
      const { captain } = await people();
      expect(await previousLoadCycle()).toBeNull();
      expect(await copyLastYearLoads({ actorId: captain.id })).toEqual({
        ok: false,
        error: NOTHING_TO_COPY,
      });
      expect(await copyLastYearPlan({ actorId: captain.id })).toEqual({
        ok: false,
        error: NOTHING_TO_COPY,
      });
    });

    it("copies last year's plan once, without last year's date", async () => {
      const { captain } = await people();
      expect(
        await setPowerPlan({
          actorId: captain.id,
          patch: {
            powerFactor: 0.9,
            daysOnSite: 8,
            firstPoweredDay: "2026-04-27",
          },
          expectedVersion: 0,
        }),
      ).toEqual({ ok: true, version: 1 });
      expect(await previousPlanCycle()).toBeNull();
      await campYear(h.db(), 2027, [2026]);
      expect((await getPowerPlan()).version).toBe(0);
      expect(await previousPlanCycle()).toBe(2026);
      expect(await copyLastYearPlan({ actorId: captain.id })).toEqual({
        ok: true,
        fromCycle: 2026,
      });
      const plan = await getPowerPlan();
      expect(plan).toMatchObject({
        cycle: 2027,
        powerFactor: 0.9,
        daysOnSite: 8,
        firstPoweredDay: null,
        version: 1,
      });
      expect(await copyLastYearPlan({ actorId: captain.id })).toEqual({
        ok: false,
        error: ALREADY_HAS_PLAN,
      });
    });
  });

  describe("the year's plan", () => {
    it("reads the defaults before anyone saves one", async () => {
      await people();
      expect(await getPowerPlan()).toEqual({
        ...DEFAULT_POWER_PLAN,
        cycle: 2026,
        updatedAt: null,
      });
    });

    it("starts a year at 11 days on site, running 24 h, with no comparison schedule", async () => {
      const { captain } = await people();
      // The owner's answers (2026-09-24): the camp is usually on site 11
      // days, and the generator runs 24/7.
      expect(
        await setPowerPlan({
          actorId: captain.id,
          patch: { powerFactor: 0.9 },
          expectedVersion: 0,
        }),
      ).toEqual({ ok: true, version: 1 });
      const plan = await getPowerPlan();
      expect(plan).toMatchObject({
        daysOnSite: 11,
        runFromHour: null,
        runToHour: null,
        powerFactor: 0.9,
      });
      expect(plan).not.toHaveProperty("compareRunFromHour");

      // The column itself, as the committed migrations leave it: a row
      // written with nothing but its year takes 11 days and 24 h, and the
      // comparison columns are gone.
      const [row] = await h
        .db()
        .insert(schema.powerPlans)
        .values({ cycle: 2031 })
        .returning();
      expect(row).toMatchObject({
        daysOnSite: 11,
        runFromHour: null,
        runToHour: null,
      });
      const columns = await h.db().execute<{
        column_name: string;
      }>(sql`select column_name from information_schema.columns where table_name = 'power_plans'`);
      const names = columns.rows.map((c) => c.column_name);
      expect(names).toContain("run_from_hour");
      expect(names).not.toContain("compare_run_from_hour");
      expect(names).not.toContain("compare_run_to_hour");
    });

    it("lets one of two first saves win", async () => {
      const { captain, powerLead } = await people();
      const [a, b] = await Promise.all([
        setPowerPlan({
          actorId: captain.id,
          patch: { daysOnSite: 8 },
          expectedVersion: 0,
        }),
        setPowerPlan({
          actorId: powerLead.id,
          patch: { daysOnSite: 10 },
          expectedVersion: 0,
        }),
      ]);
      expect([a, b].filter((r) => r.ok)).toHaveLength(1);
      expect([a, b].filter((r) => !r.ok)).toEqual([
        { ok: false, error: PLAN_CHANGED },
      ]);
      const plan = await getPowerPlan();
      expect(plan.version).toBe(1);
      expect(plan.daysOnSite).toBe(a.ok ? 8 : 10);
    });

    it("is a compare-and-set after the first save", async () => {
      const { captain, powerLead } = await people();
      await setPowerPlan({
        actorId: captain.id,
        patch: { daysOnSite: 8 },
        expectedVersion: 0,
      });
      expect(
        await setPowerPlan({
          actorId: powerLead.id,
          patch: { runFromHour: 18, runToHour: 6 },
          expectedVersion: 1,
        }),
      ).toEqual({ ok: true, version: 2 });
      expect(
        await setPowerPlan({
          actorId: captain.id,
          patch: { daysOnSite: 3 },
          expectedVersion: 1,
        }),
      ).toEqual({ ok: false, error: PLAN_CHANGED });
      expect(await getPowerPlan()).toMatchObject({
        daysOnSite: 8,
        runFromHour: 18,
        runToHour: 6,
        version: 2,
      });
    });

    it("refuses a generator that is gone or archived", async () => {
      const { captain } = await people();
      const made = await addGenerator({ ...GENNY, actorId: captain.id });
      if (!made.ok) throw new Error(made.error);
      await archiveGenerator({ actorId: captain.id, generatorId: made.id });
      expect(
        await setPowerPlan({
          actorId: captain.id,
          patch: { generatorId: made.id },
          expectedVersion: 0,
        }),
      ).toEqual({ ok: false, error: GENERATOR_GONE });
    });
  });

  describe("generators", () => {
    it("outlive the year and hide once archived", async () => {
      const { captain } = await people();
      const made = await addGenerator({ ...GENNY, actorId: captain.id });
      if (!made.ok) throw new Error(made.error);
      await setPowerPlan({
        actorId: captain.id,
        patch: { generatorId: made.id },
        expectedVersion: 0,
      });

      await campYear(h.db(), 2027, [2026]);
      expect((await listGenerators()).map((g) => g.model)).toEqual([
        "Honda EU70is",
      ]);

      expect(
        await archiveGenerator({ actorId: captain.id, generatorId: made.id }),
      ).toEqual({ ok: true });
      expect(await listGenerators()).toEqual([]);
      // Last year's plan still names it, and it still reads.
      expect((await getPowerPlan(2026)).generatorId).toBe(made.id);
      expect((await getGenerator(made.id))?.archivedAt).not.toBeNull();
      expect(
        await archiveGenerator({ actorId: captain.id, generatorId: made.id }),
      ).toEqual({ ok: false, error: GENERATOR_GONE });
    });

    it("edits are compare-and-set on the version", async () => {
      const { captain, powerLead } = await people();
      const made = await addGenerator({ ...GENNY, actorId: captain.id });
      if (!made.ok) throw new Error(made.error);
      const change = (model: string, expectedVersion: number) =>
        EditGeneratorInput.parse({
          ...GENNY,
          model,
          generatorId: made.id,
          expectedVersion,
        });
      expect(
        await updateGenerator({
          ...change("EU70is", 1),
          actorId: powerLead.id,
        }),
      ).toEqual({ ok: true });
      const stale = await updateGenerator({
        ...change("Stale", 1),
        actorId: captain.id,
      });
      expect(stale.ok).toBe(false);
      expect((await getGenerator(made.id))?.model).toBe("EU70is");
    });
  });

  describe("inventory", () => {
    it("offers stocked items with their watts", async () => {
      await people();
      await h
        .db()
        .insert(schema.inventoryItems)
        .values([
          {
            name: "Chest freezer",
            team: "kitchen",
            quantity: 1,
            wattsEach: 150,
          },
          { name: "Tarp", team: "structures", quantity: 6 },
          {
            name: "Old fridge",
            team: "kitchen",
            quantity: 1,
            wattsEach: 300,
            archivedAt: new Date(),
          },
        ]);
      expect(
        (await listPowerInventory()).map((i) => [i.name, i.wattsEach]),
      ).toEqual([
        ["Chest freezer", 150],
        ["Tarp", null],
      ]);
    });
  });
});
