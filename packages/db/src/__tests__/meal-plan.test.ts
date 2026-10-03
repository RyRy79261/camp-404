import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { POWER_TEAM } from "@camp404/core";
import type { MealPlanDay, Team } from "@camp404/types";
import type { CampConfig } from "../camp-config";
import {
  MEAL_PLAN_CHANGED,
  MEAL_PLAN_DAYS_MOVED,
  NOT_A_MEAL_PLAN_EDITOR,
  getMealPlan,
  readMealPlanPeaks,
  setMealPlan,
} from "../meal-plan";
import * as schema from "../schema";
import { assignTeam, setLead } from "../team-memberships";
import { useTestDb } from "./_harness";
import { makeUser } from "./_factories";

// The kitchen's meal plan (2026-09-24) on a real Postgres (PGlite). What
// matters: anyone reads it, and before a save it is empty days; its days on
// site and Day 1 come from the year's Logistics days (the owner, 2026-10-03),
// 11 undated days when there are none; only a captain or a Kitchen lead
// saves, checked again inside the write; a save is a compare-and-set on
// version and writes its audit row with it; the plates are kept by day
// number; and a plan belongs to the year it was saved in.

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

const day = (breakfast: number, dinner: number): MealPlanDay => ({
  breakfast,
  dinner,
});

const THREE_DAYS = [day(20, 25), day(45, 50), day(45, 60)];

/** A Logistics phase's days, written straight in (the fixture). */
async function phase(
  db: DB,
  cycle: number,
  name: "build" | "burn" | "strike",
  startDate: string | null,
  endDate: string | null,
) {
  await db
    .insert(schema.logisticsPhases)
    .values({ cycle, phase: name, startDate, endDate })
    .onConflictDoUpdate({
      target: [schema.logisticsPhases.cycle, schema.logisticsPhases.phase],
      set: { startDate, endDate },
    });
}

describe("meal plan", () => {
  const h = useTestDb();

  async function leadOf(team: Team) {
    const user = await makeUser(h.db());
    await assignTeam({ userId: user.id, team });
    const led = await setLead({ userId: user.id, team, isLead: true });
    expect(led).toEqual({ ok: true, changed: true });
    return user;
  }

  /** The people, in 2026, on site 3 days from Sat 25 Apr (Build only). */
  async function people() {
    await campYear(h.db(), 2026);
    await phase(h.db(), 2026, "build", "2026-04-25", "2026-04-27");
    const captain = await makeUser(h.db(), { rank: "captain" });
    const kitchenLead = await leadOf("kitchen");
    const powerLead = await leadOf(POWER_TEAM as Team);
    const member = await makeUser(h.db());
    return { captain, kitchenLead, powerLead, member };
  }

  async function auditRows() {
    return h
      .db()
      .select()
      .from(schema.auditLog)
      .where(eq(schema.auditLog.action, "camp.kitchen_meal_plan.changed"));
  }

  it("reads as 11 empty undated days at version 0 with no Logistics days", async () => {
    await campYear(h.db(), 2026);
    const plan = await getMealPlan();
    expect(plan).toMatchObject({
      cycle: 2026,
      daysOnSite: 11,
      firstDay: null,
      version: 0,
    });
    expect(plan.days).toHaveLength(11);
    expect(plan.days.every((d) => d.breakfast + d.dinner === 0)).toBe(true);
  });

  it("takes Day 1 from the first Build day and the days on site through the last Strike day", async () => {
    await campYear(h.db(), 2026);
    await phase(h.db(), 2026, "build", "2026-04-22", "2026-04-26");
    await phase(h.db(), 2026, "burn", "2026-04-27", "2026-05-02");
    expect(await getMealPlan()).toMatchObject({
      firstDay: "2026-04-22",
      daysOnSite: 11,
    });
    await phase(h.db(), 2026, "strike", "2026-05-03", "2026-05-04");
    const plan = await getMealPlan();
    expect(plan).toMatchObject({ firstDay: "2026-04-22", daysOnSite: 13 });
    expect(plan.days).toHaveLength(13);
  });

  it("takes Day 1 from the first Burn day when no Build days are set", async () => {
    await campYear(h.db(), 2026);
    await phase(h.db(), 2026, "burn", "2026-04-27", "2026-05-02");
    await phase(h.db(), 2026, "build", null, null);
    expect(await getMealPlan()).toMatchObject({
      firstDay: "2026-04-27",
      daysOnSite: 6,
    });
    // Another year's days are not this year's.
    await phase(h.db(), 2025, "build", "2025-04-20", "2025-04-21");
    expect((await getMealPlan()).firstDay).toBe("2026-04-27");
  });

  it("lets a Kitchen lead and a captain save, each audited in the same write", async () => {
    const { captain, kitchenLead } = await people();
    expect(
      await setMealPlan({
        actorId: kitchenLead.id,
        days: THREE_DAYS,
        expectedVersion: 0,
      }),
    ).toEqual({ ok: true, version: 1 });
    expect(await getMealPlan()).toMatchObject({
      daysOnSite: 3,
      firstDay: "2026-04-25",
      days: THREE_DAYS,
      version: 1,
    });

    const three = [day(30, 30), day(30, 30), day(0, 30)];
    expect(
      await setMealPlan({
        actorId: captain.id,
        days: three,
        expectedVersion: 1,
      }),
    ).toEqual({ ok: true, version: 2 });
    expect(await getMealPlan()).toMatchObject({ daysOnSite: 3, days: three });

    const audit = await auditRows();
    expect(audit.map((r) => r.actorId)).toEqual([kitchenLead.id, captain.id]);
    expect(audit[1]!.metadata).toMatchObject({
      cycle: 2026,
      version: 2,
      daysOnSite: 3,
      firstDay: "2026-04-25",
      before: { days: THREE_DAYS },
      after: { days: three },
    });
  });

  it("keeps the plates by day number when the days on site shrink and grow again", async () => {
    const { captain } = await people();
    await setMealPlan({
      actorId: captain.id,
      days: THREE_DAYS,
      expectedVersion: 0,
    });
    // Build is cut to two days: the plan shows two, the third is kept.
    await phase(h.db(), 2026, "build", "2026-04-25", "2026-04-26");
    expect((await getMealPlan()).days).toEqual(THREE_DAYS.slice(0, 2));
    await setMealPlan({
      actorId: captain.id,
      days: [day(1, 1), day(2, 2)],
      expectedVersion: 1,
    });
    await phase(h.db(), 2026, "build", "2026-04-25", "2026-04-27");
    expect((await getMealPlan()).days).toEqual([
      day(1, 1),
      day(2, 2),
      THREE_DAYS[2],
    ]);
  });

  it("refuses rows that no longer match the days on site in Logistics", async () => {
    const { captain } = await people();
    // The page opened on three days; Logistics now says two.
    await phase(h.db(), 2026, "build", "2026-04-25", "2026-04-26");
    expect(
      await setMealPlan({
        actorId: captain.id,
        days: THREE_DAYS,
        expectedVersion: 0,
      }),
    ).toEqual({ ok: false, error: MEAL_PLAN_DAYS_MOVED });
    expect((await getMealPlan()).version).toBe(0);
    expect(await auditRows()).toEqual([]);
  });

  it("refuses a member and a lead of another team inside the write, and writes nothing", async () => {
    const { member, powerLead } = await people();
    for (const actor of [member, powerLead]) {
      expect(
        await setMealPlan({
          actorId: actor.id,
          days: THREE_DAYS,
          expectedVersion: 0,
        }),
      ).toEqual({ ok: false, error: NOT_A_MEAL_PLAN_EDITOR });
    }
    expect((await getMealPlan()).version).toBe(0);
    expect(await auditRows()).toEqual([]);
  });

  it("refuses a lead who lost the Kitchen lead between the page and the save", async () => {
    const { kitchenLead } = await people();
    await setLead({ userId: kitchenLead.id, team: "kitchen", isLead: false });
    expect(
      await setMealPlan({
        actorId: kitchenLead.id,
        days: THREE_DAYS,
        expectedVersion: 0,
      }),
    ).toEqual({ ok: false, error: NOT_A_MEAL_PLAN_EDITOR });
  });

  it("is a compare-and-set: the second of two saves from the same version is refused", async () => {
    const { captain, kitchenLead } = await people();
    const first = await setMealPlan({
      actorId: captain.id,
      days: THREE_DAYS,
      expectedVersion: 0,
    });
    expect(first).toEqual({ ok: true, version: 1 });
    const other = [day(99, 99), day(99, 99), day(99, 99)];
    // Both opened the page before any plan existed.
    expect(
      await setMealPlan({
        actorId: kitchenLead.id,
        days: other,
        expectedVersion: 0,
      }),
    ).toEqual({ ok: false, error: MEAL_PLAN_CHANGED });
    // And from a version that has moved on.
    await setMealPlan({
      actorId: captain.id,
      days: THREE_DAYS,
      expectedVersion: 1,
    });
    expect(
      await setMealPlan({
        actorId: kitchenLead.id,
        days: other,
        expectedVersion: 1,
      }),
    ).toEqual({ ok: false, error: MEAL_PLAN_CHANGED });
    expect((await getMealPlan()).days).toEqual(THREE_DAYS);
    expect(await auditRows()).toHaveLength(2);
  });

  it("refuses plates outside 0 to 500, and days that do not match the days on site", async () => {
    const { captain } = await people();
    for (const days of [
      [day(501, 0), day(0, 0), day(0, 0)],
      [day(-1, 0), day(0, 0), day(0, 0)],
      [day(2.5, 0), day(0, 0), day(0, 0)],
      [day(1, 1)],
      [],
      Array.from({ length: 31 }, () => day(1, 1)),
    ]) {
      const result = await setMealPlan({
        actorId: captain.id,
        days,
        expectedVersion: 0,
      });
      expect(result.ok).toBe(false);
    }
    expect((await getMealPlan()).version).toBe(0);
  });

  it("belongs to the year it was saved in", async () => {
    const { captain } = await people();
    await setMealPlan({
      actorId: captain.id,
      days: THREE_DAYS,
      expectedVersion: 0,
    });
    await campYear(h.db(), 2027, [2026]);
    expect(await getMealPlan()).toMatchObject({
      cycle: 2027,
      version: 0,
      firstDay: null,
    });
    expect((await getMealPlan(2026)).days).toEqual(THREE_DAYS);
  });

  it("gives the largest plates at each meal for the prompts and the default count", async () => {
    const { captain } = await people();
    await setMealPlan({
      actorId: captain.id,
      days: THREE_DAYS,
      expectedVersion: 0,
    });
    expect(await readMealPlanPeaks()).toEqual({
      kitchenPlatesBreakfast: 45,
      kitchenPlatesLunch: null,
      kitchenPlatesDinner: 60,
    });
  });
});
