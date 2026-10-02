import "server-only";

import {
  EditReadinessItemInput,
  FuelCanInput,
  GeneratorInput,
  GridNodeInput,
  LoadInput,
  SharingAgreementInput,
} from "@camp404/types";
import { testStore } from "./test-store";

// This year's Power plan in the E2E test store, a camp's worth of realistic
// rows: the approved mock-up's own example (a Honda EU70is that the loads
// overrun, the ten fuel cans of the can register mock-up, a grid with one run over its rating and three loads not
// plugged in, a checklist a third done, a neighbour not yet agreed). The
// seed-power test route fills it for a spec or a screenshot run, and the
// Power section tests render it, so both read the same camp. Every row goes
// through the test store's own writes as `actorId`, who must already be a
// Power & Lighting lead or a captain. Throws on the first refused write.

type Result = { ok: true } | { ok: false; error: string };

function must<T extends Result>(
  step: string,
  result: T,
): Extract<T, { ok: true }> {
  if (!result.ok) throw new Error(`${step}: ${result.error}`);
  return result as Extract<T, { ok: true }>;
}

export const POWER_EXAMPLE_LOADS = [
  ["Coffee urn", "kitchen", "other", 1, 2000, 2],
  ["Chest freezer", "kitchen", "refrigeration", 2, 320, null],
  ["Work lights", "kitchen", "lighting_functional", 4, 30, 8],
  ["Angle grinder", "workshop", "tools", 1, 900, 1],
  ["Sound system", "dome", "sound", 1, 800, 5],
  ["Fairy lights", "lounge", "lighting_decorative", 1, 480, 6],
  ["Phone charging station", "lounge", "charging", 6, 15, 10],
  ["Drinks fridge", "bar", "refrigeration", 1, 150, null],
] as const;

/**
 * The can register mock-up's ten cans: owner ("pat" is the actor, else the
 * camp), size, material, which of the given cars (by index; null none), note.
 */
export const POWER_EXAMPLE_CANS = [
  [null, 25, "metal", 0, "Red, camp stencil"],
  [null, 25, "metal", 0, null],
  [null, 25, "plastic", 1, null],
  [null, 20, "plastic", 0, null],
  ["pat", 20, "metal", 1, "Green, dented lid"],
  [null, 20, "plastic", 2, null],
  [null, 20, "plastic", 3, null],
  [null, 10, "metal", 2, "Spout is in the camp box"],
  ["pat", 25, "metal", null, null],
  ["pat", 15, "plastic", null, "Blue"],
] as const;

export function seedPowerExample(
  actorId: string,
  {
    cars = [],
    firstPoweredDay = null,
  }: {
    /** This year's drivers' user ids: the cans go on these cars. */
    cars?: readonly string[];
    /** The plan's day 1 (YYYY-MM-DD), which dates the can sheet's days. */
    firstPoweredDay?: string | null;
  } = {},
): void {
  const honda = must(
    "generator",
    testStore.addGenerator({
      ...GeneratorInput.parse({
        model: "Honda EU70is",
        ratedKva: 5.5,
        maxKva: 7,
        tankLitres: 19.2,
        runtime50Hours: 9.5,
        runtime100Hours: 5.3,
        fuelType: "petrol",
        owner: "camp",
      }),
      actorId,
    }),
  ).id;
  must(
    "spare generator",
    testStore.addGenerator({
      ...GeneratorInput.parse({
        model: "Kipor 10",
        ratedKva: 8.5,
        maxKva: 9,
        tankLitres: 25,
        runtime50Hours: 12,
        runtime100Hours: 7,
        fuelType: "petrol",
        owner: "hired",
      }),
      actorId,
    }),
  );
  must(
    "plan",
    testStore.setPowerPlan({
      actorId,
      expectedVersion: testStore.getPowerPlan().version,
      patch: {
        generatorId: honda,
        secondGeneratorNote: "Kipor 10, hired. Only if the Honda fails.",
        daysOnSite: 11,
        ...(firstPoweredDay ? { firstPoweredDay } : {}),
        safetyMarginPct: 20,
        canLitres: 20,
        cansOwned: 8,
        powerFactor: 0.8,
        lowLoadFactor: 1,
        runFromHour: null,
        runToHour: null,
      },
    }),
  );

  const loadIds = new Map<string, string>();
  for (const [
    name,
    area,
    category,
    quantity,
    wattsEach,
    hours,
  ] of POWER_EXAMPLE_LOADS) {
    const added = must(
      `load ${name}`,
      testStore.addPowerLoad({
        ...LoadInput.parse({
          name,
          area,
          category,
          quantity,
          wattsEach,
          schedule: hours === null ? "full_time" : "hours_per_day",
          hoursPerDay: hours,
          owner: "camp",
        }),
        actorId,
      }),
    );
    loadIds.set(name, added.id);
  }

  for (const [i, [owner, size, material, car, note]] of [
    ...POWER_EXAMPLE_CANS.entries(),
  ]) {
    must(
      `can ${i + 1}`,
      testStore.addFuelCan({
        ...FuelCanInput.parse({
          ownerUserId: owner === "pat" ? actorId : null,
          sizeLitres: size,
          material,
          travelsWithUserId: car === null ? null : (cars[car] ?? null),
          note,
        }),
        actorId,
      }),
    );
  }

  const point = (input: Record<string, unknown>) =>
    must(
      `point ${String(input.name)}`,
      testStore.addGridNode({ ...GridNodeInput.parse(input), actorId }),
    ).id;
  const gen = point({ name: "Honda", kind: "generator" });
  const main = point({
    name: "Main junction",
    kind: "junction",
    parentId: gen,
    cable: "25 m cable",
    cableLengthM: 25,
    cableGaugeMm2: 2.5,
    cableRatedAmps: 16,
  });
  const kitchen = point({
    name: "Kitchen",
    kind: "end_point",
    parentId: main,
    cable: "15 m reel",
    cableLengthM: 15,
    cableRatedAmps: 10,
  });
  const lounge = point({
    name: "Lounge",
    kind: "end_point",
    parentId: main,
    cable: "10 m cable",
    cableLengthM: 10,
    cableRatedAmps: 10,
    adapter: "4-way multiplug",
  });
  const dome = point({
    name: "Dome",
    kind: "end_point",
    parentId: gen,
    cable: "30 m cable",
    cableLengthM: 30,
    cableGaugeMm2: 2.5,
    cableRatedAmps: 16,
  });
  const plugs: [string, string][] = [
    ["Coffee urn", kitchen],
    ["Chest freezer", kitchen],
    ["Work lights", kitchen],
    ["Fairy lights", lounge],
    ["Sound system", dome],
  ];
  for (const [name, nodeId] of plugs) {
    must(
      `plug ${name}`,
      testStore.assignLoadToGridNode({
        actorId,
        loadId: loadIds.get(name)!,
        nodeId,
      }),
    );
  }

  must(
    "checklist",
    testStore.startReadinessChecklist({ actorId, generatorId: honda }),
  );
  const items = testStore
    .listReadinessItems()
    .filter((i) => i.generatorId === honda);
  for (const item of items.slice(0, 3)) {
    must(
      `tick ${item.label}`,
      testStore.tickReadinessItem({ actorId, itemId: item.id, done: true }),
    );
  }
  for (const [index, dueOn] of [
    [4, "2027-04-15"],
    [6, "2027-04-01"],
  ] as const) {
    const item = items[index];
    if (!item) continue;
    must(
      `assign ${item.label}`,
      testStore.updateReadinessItem({
        ...EditReadinessItemInput.parse({
          itemId: item.id,
          expectedVersion: item.version,
          ownerUserId: actorId,
          dueOn,
        }),
        actorId,
      }),
    );
  }
  must("work plan", testStore.addWorkPlanToBoard({ actorId }));

  must(
    "sharing",
    testStore.saveSharingAgreement({
      ...SharingAgreementInput.parse({
        partnerCamp: "Camp Moonbeam",
        contactRole: "their power lead",
        generatorSource: "ours",
        generatorId: honda,
        partnerFuelPct: null,
        watchCover: "We cover 18:00–00:00; they cover 00:00–06:00.",
        expectedVersion: 0,
      }),
      actorId,
    }),
  );
}
