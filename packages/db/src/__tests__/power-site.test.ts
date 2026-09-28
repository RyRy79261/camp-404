import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import {
  POWER_TEAM,
  burnRate,
  daysOfFuelLeft,
  effectiveRefuels,
  lowFuelWarning,
} from "@camp404/core";
import {
  AddFuelCansInput,
  CorrectRefuelInput,
  GeneratorInput,
  RefuelInput,
  type Team,
} from "@camp404/types";
import type { CampConfig } from "../camp-config";
import { NOT_A_POWER_EDITOR, addGenerator } from "../power";
import {
  CAN_CHANGED,
  ENTRY_ALREADY_CORRECTED,
  ENTRY_STRUCK_OUT,
  NOT_A_CAMP_MEMBER,
  REFUEL_IN_FUTURE,
  addFuelCans,
  canHoldsOnly,
  correctRefuel,
  listFuelCans,
  listRefuelEntries,
  logRefuel,
  previousRefuelCycle,
  removeFuelCan,
  strikeRefuel,
  updateFuelCan,
} from "../power-site";
import * as schema from "../schema";
import { assignTeam, setLead } from "../team-memberships";
import { useTestDb } from "./_harness";
import { makeUser } from "./_factories";

// Fuel on site (#255) on a real Postgres (PGlite). What matters: only a
// captain or a Power & Lighting lead writes, checked inside the write; the log
// is append-only (a correction or strike-out is a new row, and an entry is
// replaced once); a refuelling from a can takes its litres out of that can and
// a correction puts them back; and the days of fuel left and the low-fuel
// warning come out of the stored rows.

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

const GENNY = GeneratorInput.parse({
  model: "Test 5.5",
  ratedKva: 5.5,
  maxKva: 6,
  tankLitres: 13.5,
  runtime50Hours: 9.8,
  runtime100Hours: 5.5,
  fuelType: "petrol",
  owner: "camp",
});

/** Well after every refuelling below, so none is "still to come". */
const NOW = new Date("2026-12-01T00:00:00Z");

describe("fuel on site", () => {
  const h = useTestDb();

  async function leadOf(team: Team) {
    const user = await makeUser(h.db());
    await assignTeam({ userId: user.id, team });
    await setLead({ userId: user.id, team, isLead: true });
    return user;
  }

  async function setup() {
    await campYear(h.db(), 2026, [2025]);
    const captain = await makeUser(h.db(), { rank: "captain" });
    const powerLead = await leadOf(POWER_TEAM as Team);
    const kitchenLead = await leadOf("kitchen");
    const member = await makeUser(h.db(), { displayName: "Sam Watch" });
    const gen = await addGenerator({ ...GENNY, actorId: captain.id });
    if (!gen.ok) throw new Error(gen.error);
    return { captain, powerLead, kitchenLead, member, generatorId: gen.id };
  }

  async function cans(actorId: string, count: number, litres = 20) {
    const made = await addFuelCans({
      ...AddFuelCansInput.parse({
        count,
        capacityLitres: 20,
        litres,
        location: "on_site",
      }),
      actorId,
    });
    if (!made.ok) throw new Error(made.error);
    return listFuelCans();
  }

  function refuel(
    generatorId: string,
    doneByUserId: string,
    refuelledAt: string,
    litres: number,
    fromCanId: string | null = null,
  ) {
    return RefuelInput.parse({
      generatorId,
      doneByUserId,
      refuelledAt,
      litres,
      fromCanId,
    });
  }

  async function onHand() {
    return (await listFuelCans()).reduce((sum, c) => sum + c.litres, 0);
  }

  it("names cans in order and carries on past a removed one", async () => {
    const { captain } = await setup();
    const three = await cans(captain.id, 3);
    expect(three.map((c) => c.label)).toEqual(["Can 1", "Can 2", "Can 3"]);
    expect(
      await removeFuelCan({
        actorId: captain.id,
        canId: three[1]!.id,
        expectedVersion: 1,
      }),
    ).toEqual({ ok: true });
    const after = await cans(captain.id, 1);
    expect(after.map((c) => c.label)).toEqual(["Can 1", "Can 3", "Can 4"]);
  });

  it("refuses a lead of another team and a member, inside the write", async () => {
    const { captain, kitchenLead, member, generatorId } = await setup();
    const [can] = await cans(captain.id, 1);
    for (const actor of [kitchenLead, member]) {
      expect(
        await addFuelCans({
          count: 1,
          capacityLitres: 20,
          litres: 20,
          location: "storage",
          actorId: actor.id,
        }),
      ).toEqual({ ok: false, error: NOT_A_POWER_EDITOR });
      expect(
        await logRefuel({
          ...refuel(generatorId, member.id, "2026-04-25T06:00", 10, can!.id),
          actorId: actor.id,
          now: NOW,
        }),
      ).toEqual({ ok: false, error: NOT_A_POWER_EDITOR });
    }
    expect(await listRefuelEntries()).toEqual([]);
    expect(await onHand()).toBe(20);
  });

  it("a stock-take is a compare-and-set on the can's version", async () => {
    const { captain, powerLead } = await setup();
    const [can] = await cans(captain.id, 1);
    const take = (actorId: string, litres: number) =>
      updateFuelCan({
        canId: can!.id,
        expectedVersion: 1,
        label: "Can 1",
        capacityLitres: 20,
        litres,
        location: "vehicle",
        actorId,
      });
    expect(await take(powerLead.id, 12)).toEqual({ ok: true });
    expect(await take(captain.id, 5)).toEqual({
      ok: false,
      error: CAN_CHANGED,
    });
    const [after] = await listFuelCans();
    expect(after).toMatchObject({
      litres: 12,
      location: "vehicle",
      version: 2,
    });
  });

  it("takes a refuelling out of its can, and refuses more than the can holds", async () => {
    const { powerLead, member, generatorId } = await setup();
    const [can] = await cans(powerLead.id, 1, 15);
    expect(
      await logRefuel({
        ...refuel(generatorId, member.id, "2026-04-25T06:00", 16, can!.id),
        actorId: powerLead.id,
        now: NOW,
      }),
    ).toEqual({ ok: false, error: canHoldsOnly(15) });
    expect(await listRefuelEntries()).toEqual([]);

    const done = await logRefuel({
      ...refuel(generatorId, member.id, "2026-04-25T06:00", 15, can!.id),
      actorId: powerLead.id,
      now: NOW,
    });
    expect(done.ok).toBe(true);
    const [after] = await listFuelCans();
    expect(after).toMatchObject({ litres: 0, version: 2 });
    const [entry] = await listRefuelEntries();
    expect(entry).toMatchObject({
      litres: 15,
      fromCanLabel: "Can 1",
      doneByName: "Sam Watch",
      generatorModel: "Test 5.5",
      fromPaper: false,
    });
    expect(entry!.refuelledAt.toISOString()).toBe("2026-04-25T04:00:00.000Z");
  });

  it("refuses a time still to come, and a doer who is not an approved member", async () => {
    const { powerLead, member, generatorId } = await setup();
    const pending = await makeUser(h.db(), { approvalStatus: "pending" });
    expect(
      await logRefuel({
        ...refuel(generatorId, member.id, "2026-12-01T06:00", 10),
        actorId: powerLead.id,
        now: NOW,
      }),
    ).toEqual({ ok: false, error: REFUEL_IN_FUTURE });
    expect(
      await logRefuel({
        ...refuel(generatorId, pending.id, "2026-04-25T06:00", 10),
        actorId: powerLead.id,
        now: NOW,
      }),
    ).toEqual({ ok: false, error: NOT_A_CAMP_MEMBER });
  });

  it("two refuellings give a rate, and a third drops the days of fuel left", async () => {
    const { powerLead, member, generatorId } = await setup();
    const [a, b] = await cans(powerLead.id, 5);
    const log = async (at: string, canId: string) => {
      const r = await logRefuel({
        ...refuel(generatorId, member.id, at, 10, canId),
        actorId: powerLead.id,
        now: NOW,
      });
      if (!r.ok) throw new Error(r.error);
    };
    await log("2026-04-25T06:00", a!.id);
    expect(burnRate(await listRefuelEntries())).toBeNull();

    await log("2026-04-25T12:00", a!.id);
    let rate = burnRate(await listRefuelEntries())!.litresPerDay;
    expect(rate).toBe(40);
    const before = daysOfFuelLeft(await onHand(), rate);
    expect(before).toBe(2);
    expect(
      lowFuelWarning({
        daysLeft: before,
        thresholdDays: 2,
        remainingDays: null,
      }),
    ).toBe(false);

    await log("2026-04-25T18:00", b!.id);
    rate = burnRate(await listRefuelEntries())!.litresPerDay;
    const after = daysOfFuelLeft(await onHand(), rate);
    expect(after).toBe(1.75);
    expect(
      lowFuelWarning({
        daysLeft: after,
        thresholdDays: 2,
        remainingDays: null,
      }),
    ).toBe(true);
  });

  it("a correction is a new entry, puts the old litres back and takes the new", async () => {
    const { powerLead, member, generatorId } = await setup();
    const [can] = await cans(powerLead.id, 1);
    const first = await logRefuel({
      ...refuel(generatorId, member.id, "2026-04-25T06:00", 10, can!.id),
      actorId: powerLead.id,
      now: NOW,
    });
    if (!first.ok) throw new Error(first.error);
    expect(await onHand()).toBe(10);

    const fix = CorrectRefuelInput.parse({
      ...refuel(generatorId, member.id, "2026-04-25T06:00", 12, can!.id),
      correctsEntryId: first.id,
      note: "It was 12",
    });
    const corrected = await correctRefuel({
      ...fix,
      actorId: powerLead.id,
      now: NOW,
    });
    expect(corrected.ok).toBe(true);
    expect(await onHand()).toBe(8);

    const rows = await listRefuelEntries();
    expect(rows).toHaveLength(2);
    // The old entry is still there, untouched.
    expect(rows.find((r) => r.id === first.id)).toMatchObject({ litres: 10 });
    expect(effectiveRefuels(rows).map((r) => r.litres)).toEqual([12]);

    // An entry is replaced once.
    expect(
      await correctRefuel({ ...fix, actorId: powerLead.id, now: NOW }),
    ).toEqual({ ok: false, error: ENTRY_ALREADY_CORRECTED });
    expect(await onHand()).toBe(8);
  });

  it("a strike-out puts the litres back and cannot itself be corrected", async () => {
    const { powerLead, member, generatorId } = await setup();
    const [can] = await cans(powerLead.id, 1);
    const first = await logRefuel({
      ...refuel(generatorId, member.id, "2026-04-25T06:00", 10, can!.id),
      actorId: powerLead.id,
      fromPaper: true,
      now: NOW,
    });
    if (!first.ok) throw new Error(first.error);
    const struck = await strikeRefuel({
      entryId: first.id,
      note: "Logged twice",
      actorId: powerLead.id,
    });
    if (!struck.ok) throw new Error(struck.error);
    expect(await onHand()).toBe(20);
    const rows = await listRefuelEntries();
    expect(effectiveRefuels(rows)).toEqual([]);
    expect(rows.find((r) => r.id === struck.id)).toMatchObject({
      voided: true,
      correctsEntryId: first.id,
      fromPaper: true,
      note: "Logged twice",
    });
    expect(
      await correctRefuel({
        ...CorrectRefuelInput.parse({
          ...refuel(generatorId, member.id, "2026-04-25T06:00", 5),
          correctsEntryId: struck.id,
        }),
        actorId: powerLead.id,
        now: NOW,
      }),
    ).toEqual({ ok: false, error: ENTRY_STRUCK_OUT });
  });

  it("keeps each year's log to itself, and finds last year's", async () => {
    const { powerLead, member, generatorId } = await setup();
    await h
      .db()
      .insert(schema.refuelEntries)
      .values({
        cycle: 2025,
        generatorId,
        refuelledAt: new Date("2025-04-25T04:00:00Z"),
        litres: 9,
        doneByUserId: member.id,
      });
    expect(await listRefuelEntries()).toEqual([]);
    expect(await previousRefuelCycle()).toBe(2025);
    expect((await listRefuelEntries(2025)).map((r) => r.litres)).toEqual([9]);
    const made = await logRefuel({
      ...refuel(generatorId, member.id, "2026-04-25T06:00", 10),
      actorId: powerLead.id,
      now: NOW,
    });
    expect(made.ok).toBe(true);
    expect((await listRefuelEntries()).map((r) => r.cycle)).toEqual([2026]);
  });
});
