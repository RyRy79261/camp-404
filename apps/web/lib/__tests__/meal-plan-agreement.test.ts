// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  MEAL_PLAN_CHANGED,
  MEAL_PLAN_DAYS_MOVED,
  NOT_A_MEAL_PLAN_EDITOR,
} from "@camp404/db/meal-plan";
import { LogisticsPhase, MEAL_PLAN_MAX_DAYS } from "@camp404/types";
import { useTestDb } from "../../../../packages/db/src/__tests__/_harness";
import { bothWays, YEAR } from "./_agreement";
import { phaseDays } from "./_kitchen";

// The kitchen's meal plan, through lib/meal-plan.ts, on the database and on
// the E2E store: the same people, the same saves, the same answers and
// refusal sentences. Both sides check the input with one Zod schema and the
// editor with one rule (MEAL_PLAN_EDITOR); this holds the rest (Day 1 and the
// days on site from Logistics, the compare-and-set) equal. The Kitchen lead
// is this domain's lead; the Finance lead is a lead of ANOTHER team, refused.
// See _agreement.ts.

const mode = vi.hoisted(() => ({ on: false }));
vi.mock("@/lib/test-mode", () => ({
  isE2ETestMode: () => mode.on,
  usesTestStore: () => mode.on,
  TEST_USER_COOKIE: "camp404_test_user",
}));

import { testStore } from "../test-store";
import { getMealPlan, setMealPlan } from "../meal-plan";

const day = (breakfast: number, dinner: number) => ({ breakfast, dinner });

describe("the meal plan: the database and the test store agree", () => {
  const h = useTestDb();
  beforeEach(() => {
    mode.on = false;
    testStore.reset();
  });

  it("saves the plates for the Kitchen's editors only, compare-and-set on the version", async () => {
    const { db, store } = await bothWays(mode, h, async (p) => {
      const defaults = await getMealPlan();
      const days = defaults.days.map((_, i) => day(30 + i, 40 + i));
      const save = (
        actorId: string,
        input: Partial<Parameters<typeof setMealPlan>[0]> = {},
      ) =>
        setMealPlan({
          actorId,
          firstDay: defaults.firstDay,
          days,
          expectedVersion: 0,
          ...input,
        });
      const otherLead = await save(p.financeLead);
      const member = await save(p.member);
      const noDays = await save(p.kitchenLead, { days: [] });
      const tooManyPlates = await save(p.kitchenLead, {
        days: days.map(() => day(501, 0)),
      });
      const tooManyDays = await save(p.kitchenLead, {
        days: Array.from({ length: MEAL_PLAN_MAX_DAYS + 1 }, () => day(1, 1)),
      });
      const wrongCount = await save(p.kitchenLead, { days: days.slice(1) });
      const first = await save(p.kitchenLead);
      const stale = await save(p.captain);
      const second = await save(p.captain, {
        expectedVersion: 1,
        days: days.map(() => day(10, 20)),
      });
      return {
        defaults,
        otherLead,
        member,
        noDays,
        tooManyPlates,
        tooManyDays,
        wrongCount,
        first,
        stale,
        second,
        saved: await getMealPlan(),
        otherYear: await getMealPlan(YEAR - 1),
      };
    });
    expect(db).toMatchObject({
      defaults: { version: 0, firstDay: null },
      otherLead: { ok: false, error: NOT_A_MEAL_PLAN_EDITOR },
      member: { ok: false, error: NOT_A_MEAL_PLAN_EDITOR },
      noDays: { ok: false },
      tooManyPlates: { ok: false },
      wrongCount: { ok: false, error: MEAL_PLAN_DAYS_MOVED },
      first: { ok: true, version: 1 },
      stale: { ok: false, error: MEAL_PLAN_CHANGED },
      second: { ok: true, version: 2 },
      saved: { version: 2 },
      otherYear: { version: 0 },
    });
    expect(store).toEqual(db);
  });

  it("takes Day 1 and the days on site from Logistics, and refuses a save from before they moved", async () => {
    const { db, store } = await bothWays(mode, h, async (p, seed) => {
      await phaseDays(
        seed,
        p,
        LogisticsPhase.enum.build,
        `${YEAR}-04-22`,
        `${YEAR}-04-24`,
      );
      await phaseDays(
        seed,
        p,
        LogisticsPhase.enum.strike,
        `${YEAR}-05-03`,
        `${YEAR}-05-04`,
      );
      const opened = await getMealPlan();
      const days = opened.days.map(() => day(40, 45));
      const saved = await setMealPlan({
        actorId: p.kitchenLead,
        firstDay: opened.firstDay,
        days,
        expectedVersion: opened.version,
      });
      const wrongDayOne = await setMealPlan({
        actorId: p.kitchenLead,
        firstDay: `${YEAR}-04-21`,
        days,
        expectedVersion: 1,
      });
      // Build starts a day later: the same count would be a different Day 1.
      await phaseDays(
        seed,
        p,
        LogisticsPhase.enum.build,
        `${YEAR}-04-23`,
        `${YEAR}-04-24`,
        1,
      );
      const moved = await setMealPlan({
        actorId: p.kitchenLead,
        firstDay: opened.firstDay,
        days,
        expectedVersion: 1,
      });
      return {
        opened,
        saved,
        wrongDayOne,
        moved,
        now: await getMealPlan(),
      };
    });
    expect(db).toMatchObject({
      opened: { firstDay: `${YEAR}-04-22`, daysOnSite: 13, version: 0 },
      saved: { ok: true, version: 1 },
      wrongDayOne: { ok: false, error: MEAL_PLAN_DAYS_MOVED },
      moved: { ok: false, error: MEAL_PLAN_DAYS_MOVED },
      now: { firstDay: `${YEAR}-04-23`, daysOnSite: 12, version: 1 },
    });
    expect(store).toEqual(db);
  });
});
