// @vitest-environment node
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { POWER_TEAM } from "@camp404/core";
import * as schema from "@camp404/db/schema";
import {
  ALREADY_HAS_LOADS,
  ALREADY_HAS_PLAN,
  DEFAULT_POWER_PLAN,
  GENERATOR_CHANGED,
  GENERATOR_GONE,
  INVENTORY_ITEM_GONE,
  LOAD_CHANGED,
  LOAD_GONE,
  NOT_A_POWER_EDITOR,
  NOTHING_TO_COPY,
  PLAN_CHANGED,
} from "@camp404/db/power";
import { GeneratorInput, LoadInput, Team } from "@camp404/types";
import { useTestDb } from "../../../../packages/db/src/__tests__/_harness";
import { YEAR, bothWays, type DB, type Seed } from "./_agreement";

// Power and fuel (#253 load list, #254 generators and the plan), through
// lib/power.ts, on the database and on the E2E store: the same people, the
// same writes, the same answers and refusal sentences. Who may write is one
// rule (POWER_EDITOR), and the plan's generator check, the plan's settings
// and the copy refusals live once in @camp404/core (planGeneratorProblem,
// powerPlanPatch, copyLastYearProblem); this holds the rest equal. A Power
// and Lighting lead is this domain's lead; the Finance lead is a lead of
// ANOTHER team, refused. See _agreement.ts.

const mode = vi.hoisted(() => ({ on: false }));
vi.mock("@/lib/test-mode", () => ({
  isE2ETestMode: () => mode.on,
  usesTestStore: () => mode.on,
  TEST_USER_COOKIE: "camp404_test_user",
}));

import { testStore } from "../test-store";
import {
  addGenerator,
  addPowerLoad,
  archiveGenerator,
  copyLastYearLoads,
  copyLastYearPlan,
  getGenerator,
  getPowerPlan,
  listGenerators,
  listPowerLoads,
  previousLoadCycle,
  previousPlanCycle,
  removePowerLoad,
  setPowerPlan,
  updateGenerator,
  updatePowerLoad,
} from "../power";

const POWER = Team.enum[POWER_TEAM];

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

const LIGHTS = LoadInput.parse({
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

/** The camp rolls into `year`, the way the year's rollover would. */
async function rollTo(seed: Seed, db: DB, year: number): Promise<void> {
  const cycles = [
    {
      year: YEAR,
      startedAt: `${YEAR}-01-01T00:00:00.000Z`,
      endedAt: `${year}-01-01T00:00:00.000Z`,
    },
    { year, startedAt: `${year}-01-01T00:00:00.000Z`, endedAt: null },
  ];
  if (seed.side === "store") {
    testStore.setTeamsConfig({
      ...testStore.getTeamsConfig(),
      cycles,
    } as ReturnType<typeof testStore.getTeamsConfig>);
    return;
  }
  const [row] = await db
    .select({ config: schema.campSettings.config })
    .from(schema.campSettings)
    .limit(1);
  await db
    .update(schema.campSettings)
    .set({ config: { ...row!.config, cycles } })
    .where(eq(schema.campSettings.id, true));
}

const refused = (error: string) => ({ ok: false, error });

describe("power and fuel: the database and the test store agree", () => {
  const h = useTestDb();
  beforeEach(() => {
    mode.on = false;
    testStore.reset();
  });

  it("lets a captain or a Power and Lighting lead keep the load list, compare-and-set on the version", async () => {
    const { db, store } = await bothWays(mode, h, async (p, seed) => {
      const powerLead = await seed.user("Volt");
      await seed.lead(powerLead, POWER);
      const added = await addPowerLoad({ ...FRIDGE, actorId: p.captain });
      if (!added.ok) throw new Error(added.error);
      const second = await addPowerLoad({ ...LIGHTS, actorId: powerLead });
      const otherLead = await addPowerLoad({
        ...FRIDGE,
        actorId: p.financeLead,
      });
      const member = await addPowerLoad({ ...FRIDGE, actorId: p.member });
      const noItem = await addPowerLoad({
        ...FRIDGE,
        inventoryItemId: randomUUID(),
        actorId: p.captain,
      });
      const edit = (actorId: string, expectedVersion: number, name: string) =>
        updatePowerLoad({
          ...FRIDGE,
          name,
          loadId: added.id,
          expectedVersion,
          actorId,
        });
      const changed = await edit(powerLead, 1, "Big freezer");
      const stale = await edit(p.captain, 1, "Small freezer");
      const memberEdit = await edit(p.member, 2, "Mine now");
      const gone = await updatePowerLoad({
        ...FRIDGE,
        loadId: randomUUID(),
        expectedVersion: 1,
        actorId: p.captain,
      });
      const removeStale = await removePowerLoad({
        actorId: p.captain,
        loadId: added.id,
        expectedVersion: 1,
      });
      const removeLead = await removePowerLoad({
        actorId: p.kitchenLead,
        loadId: added.id,
        expectedVersion: 2,
      });
      const loadsBefore = await listPowerLoads();
      const removed = await removePowerLoad({
        actorId: powerLead,
        loadId: added.id,
        expectedVersion: 2,
      });
      const removedAgain = await removePowerLoad({
        actorId: powerLead,
        loadId: added.id,
        expectedVersion: 2,
      });
      return {
        second,
        otherLead,
        member,
        noItem,
        changed,
        stale,
        memberEdit,
        gone,
        removeStale,
        removeLead,
        loadsBefore,
        removed,
        removedAgain,
        loads: await listPowerLoads(),
      };
    });
    expect(db).toMatchObject({
      second: { ok: true },
      otherLead: refused(NOT_A_POWER_EDITOR),
      member: refused(NOT_A_POWER_EDITOR),
      noItem: refused(INVENTORY_ITEM_GONE),
      changed: { ok: true },
      stale: refused(LOAD_CHANGED),
      memberEdit: refused(NOT_A_POWER_EDITOR),
      gone: refused(LOAD_GONE),
      removeStale: refused(LOAD_CHANGED),
      removeLead: refused(NOT_A_POWER_EDITOR),
      loadsBefore: [
        { name: "Big freezer", cycle: YEAR, sort: 0, version: 2 },
        {
          name: "Festoon lights",
          sort: 1,
          version: 1,
          windows: [{ fromHour: 18, toHour: 2 }],
        },
      ],
      removed: { ok: true },
      removedAgain: refused(LOAD_GONE),
      loads: [{ name: "Festoon lights" }],
    });
    expect(store).toEqual(db);
  });

  it("saves the year's plan once from the defaults, then compare-and-set, and keeps an archived generator only where it already is", async () => {
    const { db, store } = await bothWays(mode, h, async (p, seed) => {
      const powerLead = await seed.user("Volt");
      await seed.lead(powerLead, POWER);
      const defaults = await getPowerPlan();
      const genA = await addGenerator({ ...GENNY, actorId: p.captain });
      const genB = await addGenerator({
        ...GENNY,
        model: "Atlas 10",
        actorId: powerLead,
      });
      if (!genA.ok || !genB.ok) throw new Error("no generator");
      const memberGen = await addGenerator({ ...GENNY, actorId: p.member });
      const first = await setPowerPlan({
        actorId: powerLead,
        patch: { generatorId: genA.id, daysOnSite: 9 },
        expectedVersion: 0,
      });
      const firstAgain = await setPowerPlan({
        actorId: p.captain,
        patch: { daysOnSite: 8 },
        expectedVersion: 0,
      });
      const otherLead = await setPowerPlan({
        actorId: p.financeLead,
        patch: { daysOnSite: 8 },
        expectedVersion: 1,
      });
      const editGen = await updateGenerator({
        ...GENNY,
        model: "Honda EU70is (blue)",
        generatorId: genA.id,
        expectedVersion: 1,
        actorId: powerLead,
      });
      const editStale = await updateGenerator({
        ...GENNY,
        generatorId: genA.id,
        expectedVersion: 1,
        actorId: p.captain,
      });
      const archivedA = await archiveGenerator({
        actorId: p.captain,
        generatorId: genA.id,
      });
      const archivedB = await archiveGenerator({
        actorId: powerLead,
        generatorId: genB.id,
      });
      const archivedAgain = await archiveGenerator({
        actorId: p.captain,
        generatorId: genB.id,
      });
      const editArchived = await updateGenerator({
        ...GENNY,
        generatorId: genA.id,
        expectedVersion: 3,
        actorId: p.captain,
      });
      // The plan already names A: saving the rest keeps it. B is archived and
      // not the plan's, and a made-up id is not a generator at all.
      const keepsA = await setPowerPlan({
        actorId: p.captain,
        patch: { generatorId: genA.id, cansOwned: 6 },
        expectedVersion: 1,
      });
      const toB = await setPowerPlan({
        actorId: p.captain,
        patch: { generatorId: genB.id },
        expectedVersion: 2,
      });
      const toNothing = await setPowerPlan({
        actorId: p.captain,
        patch: { generatorId: randomUUID() },
        expectedVersion: 2,
      });
      const stale = await setPowerPlan({
        actorId: p.captain,
        patch: { cansOwned: 7 },
        expectedVersion: 1,
      });
      return {
        defaults,
        memberGen,
        first,
        firstAgain,
        otherLead,
        editGen,
        editStale,
        archivedA,
        archivedB,
        archivedAgain,
        editArchived,
        keepsA,
        toB,
        toNothing,
        stale,
        plan: await getPowerPlan(),
        generators: await listGenerators(),
        archived: await getGenerator(genA.id),
      };
    });
    const { version: _zero, ...defaults } = DEFAULT_POWER_PLAN;
    expect(db).toMatchObject({
      defaults: { ...defaults, cycle: YEAR, version: 0, updatedAt: null },
      memberGen: refused(NOT_A_POWER_EDITOR),
      first: { ok: true, version: 1 },
      firstAgain: refused(PLAN_CHANGED),
      otherLead: refused(NOT_A_POWER_EDITOR),
      editGen: { ok: true },
      editStale: refused(GENERATOR_CHANGED),
      archivedA: { ok: true },
      archivedB: { ok: true },
      archivedAgain: refused(GENERATOR_GONE),
      editArchived: refused(GENERATOR_GONE),
      keepsA: { ok: true, version: 2 },
      toB: refused(GENERATOR_GONE),
      toNothing: refused(GENERATOR_GONE),
      stale: refused(PLAN_CHANGED),
      plan: { daysOnSite: 9, cansOwned: 6, version: 2 },
      generators: [],
      archived: { model: "Honda EU70is (blue)", version: 3 },
    });
    expect(store).toEqual(db);
  });

  it("copies last year's loads and plan into a new year once, without day 1, a retired generator or last year's lead", async () => {
    const { db, store } = await bothWays(mode, h, async (p, seed) => {
      const powerLead = await seed.user("Volt");
      await seed.lead(powerLead, POWER);
      const nothingYet = await copyLastYearLoads({ actorId: p.captain });
      const noPlanYet = await copyLastYearPlan({ actorId: p.captain });
      await addPowerLoad({ ...FRIDGE, actorId: p.captain });
      await addPowerLoad({ ...LIGHTS, actorId: p.captain });
      const gen = await addGenerator({ ...GENNY, actorId: p.captain });
      if (!gen.ok) throw new Error(gen.error);
      await setPowerPlan({
        actorId: p.captain,
        patch: {
          generatorId: gen.id,
          firstPoweredDay: `${YEAR}-04-26`,
          daysOnSite: 10,
          secondGeneratorNote: "Borrow one from next door",
        },
        expectedVersion: 0,
      });
      const hasLoads = await copyLastYearLoads({ actorId: p.captain });
      const hasPlan = await copyLastYearPlan({ actorId: p.captain });
      await archiveGenerator({ actorId: p.captain, generatorId: gen.id });
      await rollTo(seed, h.db(), YEAR + 1);
      const before = {
        loadCycle: await previousLoadCycle(),
        planCycle: await previousPlanCycle(),
        loads: await listPowerLoads(),
      };
      const memberCopy = await copyLastYearLoads({ actorId: p.member });
      const otherLead = await copyLastYearPlan({ actorId: p.kitchenLead });
      // Teams and leads go fresh each year: last year's lead leads nothing.
      const lastYearsLead = await copyLastYearLoads({ actorId: powerLead });
      const loads = await copyLastYearLoads({ actorId: p.captain });
      const loadsAgain = await copyLastYearLoads({ actorId: p.captain });
      const plan = await copyLastYearPlan({ actorId: p.captain });
      const planAgain = await copyLastYearPlan({ actorId: p.captain });
      return {
        nothingYet,
        noPlanYet,
        hasLoads,
        hasPlan,
        before,
        memberCopy,
        otherLead,
        lastYearsLead,
        loads,
        loadsAgain,
        plan,
        planAgain,
        copied: await listPowerLoads(),
        thisYear: await getPowerPlan(),
        lastYear: await listPowerLoads(YEAR),
      };
    });
    expect(db).toMatchObject({
      nothingYet: refused(NOTHING_TO_COPY),
      noPlanYet: refused(NOTHING_TO_COPY),
      hasLoads: refused(ALREADY_HAS_LOADS),
      hasPlan: refused(ALREADY_HAS_PLAN),
      before: { loadCycle: YEAR, planCycle: YEAR, loads: [] },
      memberCopy: refused(NOT_A_POWER_EDITOR),
      otherLead: refused(NOT_A_POWER_EDITOR),
      lastYearsLead: refused(NOT_A_POWER_EDITOR),
      loads: { ok: true, count: 2 },
      loadsAgain: refused(ALREADY_HAS_LOADS),
      plan: { ok: true, fromCycle: YEAR },
      planAgain: refused(ALREADY_HAS_PLAN),
      copied: [
        { name: "Chest freezer", cycle: YEAR + 1, sort: 0, version: 1 },
        { name: "Festoon lights", cycle: YEAR + 1, sort: 1, version: 1 },
      ],
      thisYear: {
        cycle: YEAR + 1,
        generatorId: null,
        firstPoweredDay: null,
        daysOnSite: 10,
        secondGeneratorNote: "Borrow one from next door",
        version: 1,
      },
      lastYear: [{ cycle: YEAR }, { cycle: YEAR }],
    });
    expect(store).toEqual(db);
  });
});
