// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  PLAN_NEEDS_WORDS,
  PREP_NEEDS_DAY_ONE,
  PREP_NEEDS_WORDS,
  PRICE_BAD_AMOUNT,
  PRICE_BAD_LINE,
  PRICE_RANDS_ONLY,
  shoppingKey,
  snackKey,
} from "@camp404/core";
import {
  ALLERGENS_CHANGED,
  MEAL_ITEM_GONE,
  NOT_A_MEAL_CHECKER,
  PLAN_CHANGED,
  PREP_STEP_GONE,
  RECIPE_NEWER_VERSION,
} from "@camp404/db/kitchen-meals";
import { NOT_A_PRICE_KEEPER, PRICE_CHANGED } from "@camp404/db/kitchen-prices";
import {
  ALLERGEN_PLAN_KINDS,
  ALLERGEN_PLAN_MAX,
  KITCHEN_ALLERGENS,
  LogisticsPhase,
  MAX_LINE_PRICE_CENTS,
  MEALS,
  PREP_TIMINGS,
  PREP_WHAT_MAX,
  PRICE_KINDS,
  SHOP_NAME_MAX,
  type PrepTiming,
  type PriceKind,
} from "@camp404/types";
import { useTestDb } from "../../../../packages/db/src/__tests__/_harness";
import { bothWays, YEAR, type People } from "./_agreement";
import { phaseDays, recipeInBook, savedMealPlan } from "./_kitchen";

// The Kitchen's prices, allergy plans, allergen corrections and prep steps
// (#245), through lib/kitchen-menu.ts, on the database and on the E2E store
// (test-store-kitchen-extras.ts): the same people, the same calls, the same
// answers and refusal sentences. The input checks both sides apply are
// shoppingPriceInput, allergenPlanInput and prepStepInput in @camp404/core;
// this holds the rest (who may write and read, the compare-and-sets, the
// dates and the board) equal. The Kitchen lead is this domain's lead; the
// Finance lead is a lead of ANOTHER team, refused. See _agreement.ts.

const mode = vi.hoisted(() => ({ on: false }));
vi.mock("@/lib/test-mode", () => ({
  isE2ETestMode: () => mode.on,
  usesTestStore: () => mode.on,
  TEST_USER_COOKIE: "camp404_test_user",
}));

import { testStore } from "../test-store";
import {
  addMenuItem,
  addPrepStep,
  correctRecipeAllergens,
  getKitchenMenu,
  getMealChecks,
  getMenuDietaryFor,
  getShoppingPricesFor,
  listSheetPrepSteps,
  recordAllergenPlan,
  removePrepStep,
  setShoppingPrice,
} from "../kitchen-menu";

const NOBODY = "00000000-0000-4000-8000-000000000000";
const DINNER = MEALS[1];
const [DAY_BEFORE, SAME_DAY, BEFORE_LEAVING] = PREP_TIMINGS;
const [ESTIMATE, PAID] = PRICE_KINDS;
const [PORTION, SUBSTITUTION] = ALLERGEN_PLAN_KINDS;
const LENTILS = shoppingKey("Red lentils", "kg");

/** A meal plan with dinner on every day, Dhal on day 2's dinner; its item. */
async function dhalOnDayTwo(p: People): Promise<{
  itemId: string;
  recipeId: string;
  versionId: string;
}> {
  await savedMealPlan(p, () => ({ breakfast: 0, dinner: 45 }));
  const dhal = await recipeInBook(p, "Dhal");
  const added = await addMenuItem({
    actorId: p.kitchenLead,
    day: 2,
    meal: DINNER,
    recipeId: dhal.recipeId,
  });
  if (!added.ok) throw new Error(added.error);
  return { itemId: added.itemId, ...dhal };
}

describe("the kitchen's extras: the database and the test store agree", () => {
  const h = useTestDb();
  beforeEach(() => {
    mode.on = false;
    testStore.reset();
  });

  it("prices a line for the Kitchen's editors only, in rands, compare-and-set", async () => {
    const { db, store } = await bothWays(mode, h, async (p) => {
      const price = (
        actorId: string,
        input: {
          key?: string;
          amountCents?: number | null;
          currency?: string;
          shop?: string | null;
          kind?: string;
          expectedVersion?: number;
        } = {},
      ) =>
        setShoppingPrice({
          actorId,
          key: input.key ?? LENTILS,
          shop: input.shop === undefined ? "Makro" : input.shop,
          amountCents:
            input.amountCents === undefined ? 9_600 : input.amountCents,
          kind: (input.kind ?? ESTIMATE) as PriceKind,
          currency: input.currency ?? "ZAR",
          expectedVersion: input.expectedVersion ?? 0,
        });
      return {
        dollars: await price(p.kitchenLead, { currency: "USD" }),
        lowerCase: await price(p.kitchenLead, { currency: "zar" }),
        halfCent: await price(p.kitchenLead, { amountCents: 10.5 }),
        negative: await price(p.kitchenLead, { amountCents: -1 }),
        tooMuch: await price(p.kitchenLead, {
          amountCents: MAX_LINE_PRICE_CENTS + 1,
        }),
        badLine: await price(p.kitchenLead, { key: "lentils" }),
        noLine: await price(p.kitchenLead, { key: "" }),
        otherLead: await price(p.financeLead),
        member: await price(p.member),
        first: await price(p.kitchenLead, {
          shop: ` ${"M".repeat(SHOP_NAME_MAX + 20)} `,
          kind: "guess",
        }),
        stale: await price(p.captain),
        second: await price(p.captain, {
          expectedVersion: 1,
          shop: "  ",
          amountCents: null,
          kind: PAID,
        }),
        snack: await price(p.captain, {
          key: snackKey(NOBODY),
          amountCents: 2_500,
        }),
        captainReads: await getShoppingPricesFor(p.captain),
        leadReads: await getShoppingPricesFor(p.kitchenLead),
        otherLeadReads: await getShoppingPricesFor(p.financeLead),
        memberReads: await getShoppingPricesFor(p.member),
      };
    });
    expect(db).toMatchObject({
      dollars: { ok: false, error: PRICE_RANDS_ONLY },
      lowerCase: { ok: false, error: PRICE_RANDS_ONLY },
      halfCent: { ok: false, error: PRICE_BAD_AMOUNT },
      negative: { ok: false, error: PRICE_BAD_AMOUNT },
      tooMuch: { ok: false, error: PRICE_BAD_AMOUNT },
      badLine: { ok: false, error: PRICE_BAD_LINE },
      noLine: { ok: false, error: PRICE_BAD_LINE },
      otherLead: { ok: false, error: NOT_A_PRICE_KEEPER },
      member: { ok: false, error: NOT_A_PRICE_KEEPER },
      first: { ok: true, version: 1 },
      stale: { ok: false, error: PRICE_CHANGED },
      second: { ok: true, version: 2 },
      snack: { ok: true },
      otherLeadReads: null,
      memberReads: null,
    });
    expect(store).toEqual(db);
  });

  it("records an allergy plan and corrects a recipe's allergens, for the Kitchen's editors only", async () => {
    const { db, store } = await bothWays(mode, h, async (p) => {
      const { itemId, recipeId, versionId } = await dhalOnDayTwo(p);
      const plan = (
        actorId: string,
        input: {
          itemId?: string;
          details?: string;
          kind?: string;
          expectedVersion?: number;
        } = {},
      ) =>
        recordAllergenPlan({
          actorId,
          itemId: input.itemId ?? itemId,
          kind: (input.kind ?? PORTION) as (typeof ALLERGEN_PLAN_KINDS)[number],
          details: input.details ?? "A plain portion, set aside first.",
          allergens: [KITCHEN_ALLERGENS[0], "not-an-allergen"],
          expectedVersion: input.expectedVersion ?? 0,
        });
      const correct = (
        actorId: string,
        expectedRevision: number,
        version = versionId,
      ) =>
        correctRecipeAllergens({
          actorId,
          recipeId,
          versionId: version,
          allergens: [KITCHEN_ALLERGENS[1]],
          expectedRevision,
        });
      return {
        otherLead: await plan(p.financeLead),
        member: await plan(p.member),
        blank: await plan(p.kitchenLead, { details: "  " }),
        gone: await plan(p.kitchenLead, { itemId: NOBODY }),
        notAnId: await plan(p.kitchenLead, { itemId: "nope" }),
        first: await plan(p.kitchenLead, {
          details: ` ${"x".repeat(ALLERGEN_PLAN_MAX + 40)} `,
          kind: "unknown",
        }),
        afterFirst: (await getMealChecks()).plans,
        stale: await plan(p.captain),
        second: await plan(p.captain, {
          expectedVersion: 1,
          kind: SUBSTITUTION,
        }),
        correctOtherLead: await correct(p.financeLead, 0),
        oldVersion: await correct(p.kitchenLead, 0, NOBODY),
        corrected: await correct(p.kitchenLead, 0),
        correctStale: await correct(p.captain, 0),
        checks: await getMealChecks(),
        countsForMember: await getMenuDietaryFor(p.member),
        countsForOtherLead: await getMenuDietaryFor(p.financeLead),
      };
    });
    expect(db).toMatchObject({
      otherLead: { ok: false, error: NOT_A_MEAL_CHECKER },
      member: { ok: false, error: NOT_A_MEAL_CHECKER },
      blank: { ok: false, error: PLAN_NEEDS_WORDS },
      gone: { ok: false, error: MEAL_ITEM_GONE },
      notAnId: { ok: false, error: MEAL_ITEM_GONE },
      first: { ok: true, version: 1 },
      afterFirst: [{ kind: PORTION, version: 1 }],
      stale: { ok: false, error: PLAN_CHANGED },
      second: { ok: true, version: 2 },
      correctOtherLead: { ok: false, error: NOT_A_MEAL_CHECKER },
      oldVersion: { ok: false, error: RECIPE_NEWER_VERSION },
      corrected: { ok: true, revision: 1 },
      correctStale: { ok: false, error: ALLERGENS_CHANGED },
      countsForMember: null,
      countsForOtherLead: null,
    });
    expect(store).toEqual(db);
  });

  it("dates a prep step from Day 1, puts an early one on the board, and takes it off once", async () => {
    const { db, store } = await bothWays(mode, h, async (p, seed) => {
      const noDayOne = await (async () => {
        const { itemId } = await dhalOnDayTwo(p);
        return addPrepStep({
          actorId: p.kitchenLead,
          itemId,
          what: "Soak the lentils",
          when: DAY_BEFORE,
          date: null,
        });
      })();
      await phaseDays(
        seed,
        p,
        LogisticsPhase.enum.build,
        `${YEAR}-04-22`,
        `${YEAR}-04-24`,
      );
      // Day 1 moved the plan's days: save it again for them.
      await savedMealPlan(p, () => ({ breakfast: 0, dinner: 45 }));
      const itemId = (await getKitchenMenu()).items[0]!.id;
      const step = (
        actorId: string,
        when: string,
        input: { what?: string; date?: string | null; itemId?: string } = {},
      ) =>
        addPrepStep({
          actorId,
          itemId: input.itemId ?? itemId,
          what: input.what ?? "Soak the lentils",
          when: when as PrepTiming,
          date: input.date ?? null,
        });
      const dayBefore = await step(p.kitchenLead, DAY_BEFORE);
      const early = await step(p.captain, BEFORE_LEAVING, {
        date: `${YEAR}-04-10`,
        what: ` ${"Buy lentils ".repeat(30)}`,
      });
      const result = {
        noDayOne,
        otherLead: await step(p.financeLead, SAME_DAY),
        member: await step(p.member, SAME_DAY),
        blank: await step(p.kitchenLead, SAME_DAY, { what: " " }),
        badTiming: await step(p.kitchenLead, "whenever"),
        gone: await step(p.kitchenLead, SAME_DAY, { itemId: NOBODY }),
        dayBefore,
        early,
        checks: await getMealChecks(),
        sheet: await listSheetPrepSteps(YEAR),
      };
      if (!early.ok) throw new Error(early.error);
      return {
        ...result,
        removeOtherLead: await removePrepStep({
          actorId: p.financeLead,
          stepId: early.stepId,
        }),
        removed: await removePrepStep({
          actorId: p.kitchenLead,
          stepId: early.stepId,
        }),
        again: await removePrepStep({
          actorId: p.kitchenLead,
          stepId: early.stepId,
        }),
        notAnId: await removePrepStep({ actorId: p.captain, stepId: "nope" }),
        after: await getMealChecks(),
      };
    });
    expect(db).toMatchObject({
      noDayOne: { ok: false, error: PREP_NEEDS_DAY_ONE },
      otherLead: { ok: false, error: NOT_A_MEAL_CHECKER },
      member: { ok: false, error: NOT_A_MEAL_CHECKER },
      blank: { ok: false, error: PREP_NEEDS_WORDS },
      badTiming: { ok: false, error: PREP_NEEDS_WORDS },
      gone: { ok: false, error: MEAL_ITEM_GONE },
      dayBefore: { ok: true, onBoard: false, due: `${YEAR}-04-22` },
      early: { ok: true, onBoard: true, due: `${YEAR}-04-10` },
      removeOtherLead: { ok: false, error: NOT_A_MEAL_CHECKER },
      removed: { ok: true },
      again: { ok: false, error: PREP_STEP_GONE },
      notAnId: { ok: false, error: PREP_STEP_GONE },
    });
    expect(
      (db as { checks: { prepSteps: { what: string }[] } }).checks.prepSteps[0]
        ?.what.length,
    ).toBeLessThanOrEqual(PREP_WHAT_MAX);
    expect(store).toEqual(db);
  });
});
