import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { POWER_TEAM } from "@camp404/core";
import type { MealPlanDay, Team } from "@camp404/types";
import type { CampConfig } from "../camp-config";
import {
  MEAL_PLAN_CHANGED,
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
// matters: anyone reads it, and before a save it is 11 empty days; only a
// captain or a Kitchen lead saves, checked again inside the write; a save is
// a compare-and-set on version and writes its audit row with it; and a plan
// belongs to the year it was saved in.

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

const day = (
  breakfast: number,
  lunch: number,
  dinner: number,
): MealPlanDay => ({
  breakfast,
  lunch,
  dinner,
});

const THREE_DAYS = [day(20, 0, 25), day(45, 0, 50), day(45, 0, 60)];

describe("meal plan", () => {
  const h = useTestDb();

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

  it("reads as 11 empty days at version 0 before anyone saves", async () => {
    await campYear(h.db(), 2026);
    const plan = await getMealPlan();
    expect(plan).toMatchObject({ cycle: 2026, daysOnSite: 11, version: 0 });
    expect(plan.days).toHaveLength(11);
    expect(plan.days.every((d) => d.breakfast + d.lunch + d.dinner === 0)).toBe(
      true,
    );
  });

  it("lets a Kitchen lead and a captain save, each audited in the same write", async () => {
    const { captain, kitchenLead } = await people();
    expect(
      await setMealPlan({
        actorId: kitchenLead.id,
        daysOnSite: 3,
        days: THREE_DAYS,
        expectedVersion: 0,
      }),
    ).toEqual({ ok: true, version: 1 });
    expect(await getMealPlan()).toMatchObject({
      daysOnSite: 3,
      days: THREE_DAYS,
      version: 1,
    });

    const two = [day(30, 10, 30), day(30, 10, 30)];
    expect(
      await setMealPlan({
        actorId: captain.id,
        daysOnSite: 2,
        days: two,
        expectedVersion: 1,
      }),
    ).toEqual({ ok: true, version: 2 });
    // The third day's row is gone, not left behind.
    expect(await getMealPlan()).toMatchObject({ daysOnSite: 2, days: two });
    const dayRows = await h.db().select().from(schema.kitchenMealPlanDays);
    expect(dayRows).toHaveLength(2);

    const audit = await auditRows();
    expect(audit.map((r) => r.actorId)).toEqual([kitchenLead.id, captain.id]);
    expect(audit[1]!.metadata).toMatchObject({
      cycle: 2026,
      version: 2,
      before: { daysOnSite: 3, days: THREE_DAYS },
      after: { daysOnSite: 2, days: two },
    });
  });

  it("stores the date of day 1 with the plan, audited, and clears it when blanked", async () => {
    const { captain } = await people();
    expect((await getMealPlan()).firstDay).toBeNull();
    expect(
      await setMealPlan({
        actorId: captain.id,
        daysOnSite: 3,
        firstDay: "2026-04-25",
        days: THREE_DAYS,
        expectedVersion: 0,
      }),
    ).toEqual({ ok: true, version: 1 });
    expect(await getMealPlan()).toMatchObject({
      firstDay: "2026-04-25",
      version: 1,
    });
    // A date that is not a real calendar day is refused, with nothing saved.
    expect(
      await setMealPlan({
        actorId: captain.id,
        daysOnSite: 3,
        firstDay: "2027-02-29",
        days: THREE_DAYS,
        expectedVersion: 1,
      }),
    ).toEqual({ ok: false, error: "Pick the date of day 1." });
    expect(
      await setMealPlan({
        actorId: captain.id,
        daysOnSite: 3,
        firstDay: null,
        days: THREE_DAYS,
        expectedVersion: 1,
      }),
    ).toEqual({ ok: true, version: 2 });
    expect((await getMealPlan()).firstDay).toBeNull();
    const audit = await auditRows();
    expect(audit[0]!.metadata).toMatchObject({
      before: { firstDay: null },
      after: { firstDay: "2026-04-25" },
    });
    expect(audit[1]!.metadata).toMatchObject({
      before: { firstDay: "2026-04-25" },
      after: { firstDay: null },
    });
  });

  it("refuses a member and a lead of another team inside the write, and writes nothing", async () => {
    const { member, powerLead } = await people();
    for (const actor of [member, powerLead]) {
      expect(
        await setMealPlan({
          actorId: actor.id,
          daysOnSite: 3,
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
        daysOnSite: 3,
        days: THREE_DAYS,
        expectedVersion: 0,
      }),
    ).toEqual({ ok: false, error: NOT_A_MEAL_PLAN_EDITOR });
  });

  it("is a compare-and-set: the second of two saves from the same version is refused", async () => {
    const { captain, kitchenLead } = await people();
    const first = await setMealPlan({
      actorId: captain.id,
      daysOnSite: 3,
      days: THREE_DAYS,
      expectedVersion: 0,
    });
    expect(first).toEqual({ ok: true, version: 1 });
    // Both opened the page before any plan existed.
    expect(
      await setMealPlan({
        actorId: kitchenLead.id,
        daysOnSite: 1,
        days: [day(99, 99, 99)],
        expectedVersion: 0,
      }),
    ).toEqual({ ok: false, error: MEAL_PLAN_CHANGED });
    // And from a version that has moved on.
    await setMealPlan({
      actorId: captain.id,
      daysOnSite: 3,
      days: THREE_DAYS,
      expectedVersion: 1,
    });
    expect(
      await setMealPlan({
        actorId: kitchenLead.id,
        daysOnSite: 1,
        days: [day(99, 99, 99)],
        expectedVersion: 1,
      }),
    ).toEqual({ ok: false, error: MEAL_PLAN_CHANGED });
    expect((await getMealPlan()).days).toEqual(THREE_DAYS);
    expect(await auditRows()).toHaveLength(2);
  });

  it("refuses plates outside 0 to 500, and days that do not match the days on site", async () => {
    const { captain } = await people();
    for (const bad of [
      { daysOnSite: 1, days: [day(501, 0, 0)] },
      { daysOnSite: 1, days: [day(-1, 0, 0)] },
      { daysOnSite: 1, days: [day(2.5, 0, 0)] },
      { daysOnSite: 2, days: [day(1, 1, 1)] },
      { daysOnSite: 31, days: Array.from({ length: 31 }, () => day(1, 1, 1)) },
    ]) {
      const result = await setMealPlan({
        actorId: captain.id,
        ...bad,
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
      daysOnSite: 3,
      days: THREE_DAYS,
      expectedVersion: 0,
    });
    await campYear(h.db(), 2027, [2026]);
    expect(await getMealPlan()).toMatchObject({ cycle: 2027, version: 0 });
    expect((await getMealPlan(2026)).days).toEqual(THREE_DAYS);
  });

  it("gives the largest plates at each meal for the prompts and the default count", async () => {
    const { captain } = await people();
    await setMealPlan({
      actorId: captain.id,
      daysOnSite: 3,
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
