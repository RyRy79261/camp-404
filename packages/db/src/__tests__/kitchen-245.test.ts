import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { POWER_TEAM } from "@camp404/core";
import {
  DAY_ONE_NEEDED_FOR_PREP,
  KitchenRecipe,
  type Team,
} from "@camp404/types";
import type { CampConfig } from "../camp-config";
import { listSheetAllergies } from "../daily-sheet";
import {
  DIETARY_NOT_A_MEMBER,
  getMenuDietaryFor,
  getMyDietary,
  saveMyDietary,
} from "../dietary";
import {
  ALLERGENS_CHANGED,
  MEAL_ITEM_GONE,
  NOT_A_MEAL_CHECKER,
  PLAN_CHANGED,
  PREP_STEP_GONE,
  RECIPE_NEWER_VERSION,
  addPrepStep,
  correctRecipeAllergens,
  getMealChecks,
  listSheetPrepSteps,
  recordAllergenPlan,
  removePrepStep,
} from "../kitchen-meals";
import {
  addMenuItem,
  getKitchenMenu,
  getShoppingFacts,
  removeMenuItem,
} from "../kitchen-menu";
import {
  NOT_A_PRICE_KEEPER,
  PRICE_BAD_AMOUNT,
  PRICE_CHANGED,
  PRICE_RANDS_ONLY,
  getShoppingPricesFor,
  setShoppingPrice,
} from "../kitchen-prices";
import { clearLogisticsPhase, setLogisticsPhase } from "../logistics";
import { getMealPlan, setMealPlan } from "../meal-plan";
import * as schema from "../schema";
import { assignTeam, setLead } from "../team-memberships";
import { useTestDb } from "./_harness";
import { makeUser, seedAcceptedVersion } from "./_factories";

// Kitchen #245 on a real Postgres (PGlite): prices and shops, the dietary
// pick-list and its counts, the allergy plans and corrections, and prep
// steps. What matters: only a captain or a Kitchen lead writes, checked again
// inside the write and audited with it; every write is compare-and-set;
// members are never sent a price; the counts name nobody; the old dietary
// answers are kept; a prep step before we leave is a Kitchen task, one on
// site is not, and taking the step off takes its task off.

const YEAR = 2027;

type DB = ReturnType<ReturnType<typeof useTestDb>["db"]>;

async function campYear(db: DB, year: number) {
  const cycles: CampConfig["cycles"] = [
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

const OATS = KitchenRecipe.parse({
  title: "Overnight oats",
  plates: 60,
  ingredients: [
    {
      name: "Rolled oats",
      category: "grain",
      quantity: 3,
      unit: "kg",
      allergens: ["gluten"],
    },
    {
      name: "Peanut butter",
      category: "other",
      quantity: 1,
      unit: "kg",
      allergens: ["peanuts"],
    },
    {
      name: "Milk",
      category: "dairy",
      quantity: 6,
      unit: "l",
      allergens: ["milk"],
    },
  ],
  steps: [{ instruction: "Soak.", uses: ["Rolled oats", "Milk"] }],
});

describe("kitchen #245: prices, dietary, plans and prep", () => {
  const h = useTestDb();

  async function leadOf(team: Team) {
    const user = await makeUser(h.db(), { approvalStatus: "approved" });
    await assignTeam({ userId: user.id, team });
    await setLead({ userId: user.id, team, isLead: true });
    return user;
  }

  async function coming(
    displayName: string,
    status: "applied" | "accepted" | "maybe" = "accepted",
  ) {
    const user = await makeUser(h.db(), {
      displayName,
      approvalStatus: "approved",
    });
    await h
      .db()
      .insert(schema.campParticipations)
      .values({
        userId: user.id,
        cycle: YEAR,
        status,
        intent: status === "maybe" ? "maybe" : "yes",
      });
    return user;
  }

  /**
   * Day 1 is Thu 22 Apr 2027, the first Build day in Logistics (two days of
   * Build, version 1); 60 at breakfast on day 2, 50 at dinner.
   */
  async function setUp() {
    await campYear(h.db(), YEAR);
    await h.db().insert(schema.logisticsPhases).values({
      cycle: YEAR,
      phase: "build",
      startDate: "2027-04-22",
      endDate: "2027-04-23",
    });
    const captain = await makeUser(h.db(), {
      rank: "captain",
      approvalStatus: "approved",
    });
    const kitchenLead = await leadOf("kitchen");
    const powerLead = await leadOf(POWER_TEAM as Team);
    const member = await makeUser(h.db(), { approvalStatus: "approved" });
    expect(
      await setMealPlan({
        actorId: captain.id,
        firstDay: "2027-04-22",
        days: [
          { breakfast: 0, dinner: 50 },
          { breakfast: 60, dinner: 50 },
        ],
        expectedVersion: 0,
      }),
    ).toEqual({ ok: true, version: 1 });
    const [row] = await h
      .db()
      .insert(schema.recipes)
      .values({ source: "text", title: OATS.title, status: "accepted" })
      .returning({ id: schema.recipes.id });
    const { versionId } = await seedAcceptedVersion(h.db(), {
      recipeId: row!.id,
      authorId: captain.id,
      recipe: OATS,
    });
    await h
      .db()
      .update(schema.recipes)
      .set({ acceptedVersionId: versionId })
      .where(eq(schema.recipes.id, row!.id));
    const added = await addMenuItem({
      actorId: captain.id,
      day: 2,
      meal: "breakfast",
      recipeId: row!.id,
    });
    if (!added.ok) throw new Error(added.error);
    return {
      captain,
      kitchenLead,
      powerLead,
      member,
      recipeId: row!.id,
      versionId,
      itemId: added.itemId,
    };
  }

  const audit = (action: string) =>
    h
      .db()
      .select()
      .from(schema.auditLog)
      .where(eq(schema.auditLog.action, action));

  describe("prices and shops", () => {
    const price = (
      actorId: string,
      over: Partial<Parameters<typeof setShoppingPrice>[0]> = {},
    ) =>
      setShoppingPrice({
        actorId,
        key: "rolled oats|g",
        shop: "Vlei Farm Stall",
        amountCents: 9600,
        kind: "estimate",
        currency: "ZAR",
        expectedVersion: 0,
        ...over,
      });

    it("lets a Kitchen lead and a captain set a line's price, compare-and-set, audited with it", async () => {
      const { captain, kitchenLead } = await setUp();
      expect(await price(kitchenLead.id)).toEqual({ ok: true, version: 1 });
      // A second editor who saw no price yet loses, and is told.
      expect(await price(captain.id, { amountCents: 1 })).toEqual({
        ok: false,
        error: PRICE_CHANGED,
      });
      expect(
        await price(captain.id, {
          kind: "paid",
          amountCents: 9950,
          expectedVersion: 1,
        }),
      ).toEqual({ ok: true, version: 2 });
      const prices = await getShoppingPricesFor(kitchenLead.id);
      expect(prices).toEqual([
        {
          key: "rolled oats|g",
          shop: "Vlei Farm Stall",
          amountCents: 9950,
          kind: "paid",
          version: 2,
        },
      ]);
      const rows = await audit("camp.kitchen_price.set");
      expect(rows).toHaveLength(2);
      expect(rows.map((r) => r.actorId).sort()).toEqual(
        [captain.id, kitchenLead.id].sort(),
      );
    });

    it("refuses a member and a lead of another team, and writes nothing", async () => {
      const { member, powerLead } = await setUp();
      for (const who of [member, powerLead]) {
        expect(await price(who.id)).toEqual({
          ok: false,
          error: NOT_A_PRICE_KEEPER,
        });
      }
      expect(await h.db().select().from(schema.kitchenShoppingPrices)).toEqual(
        [],
      );
      expect(await audit("camp.kitchen_price.set")).toEqual([]);
    });

    it("keeps money in rands, in whole cents", async () => {
      const { kitchenLead } = await setUp();
      expect(await price(kitchenLead.id, { currency: "zar" })).toEqual({
        ok: false,
        error: PRICE_RANDS_ONLY,
      });
      expect(await price(kitchenLead.id, { currency: "USD" })).toEqual({
        ok: false,
        error: PRICE_RANDS_ONLY,
      });
      expect(await price(kitchenLead.id, { amountCents: 12.5 })).toEqual({
        ok: false,
        error: PRICE_BAD_AMOUNT,
      });
      await expect(
        h.db().insert(schema.kitchenShoppingPrices).values({
          cycle: YEAR,
          itemKey: "x|g",
          currency: "USD",
        }),
      ).rejects.toThrow();
    });

    it("never sends a member a price: their read is null, and the list's facts hold none", async () => {
      const { kitchenLead, member, powerLead } = await setUp();
      expect(await price(kitchenLead.id)).toMatchObject({ ok: true });
      expect(await getShoppingPricesFor(member.id)).toBeNull();
      expect(await getShoppingPricesFor(powerLead.id)).toBeNull();
      expect(await getShoppingPricesFor("not-a-uuid")).toBeNull();
      const facts = JSON.stringify(await getShoppingFacts());
      expect(facts).not.toContain("Vlei Farm Stall");
      expect(facts).not.toContain("9600");
    });
  });

  describe("the dietary pick-list", () => {
    it("saves a member's foods and diets, and keeps the old form's words as they were", async () => {
      await campYear(h.db(), YEAR);
      const thandi = await coming("Thandi Nkosi");
      await h.db().insert(schema.dietaryRequirements).values({
        userId: thandi.id,
        version: "dietary@3",
        allergies: "peanuts, sesame",
        isAnaphylactic: true,
        notes: "Keep my bowl apart",
      });
      const before = await getMyDietary(thandi.id);
      expect(before).toEqual({
        foods: [],
        diets: [],
        savedAt: null,
        old: {
          allergies: "peanuts, sesame",
          isAnaphylactic: true,
          notes: "Keep my bowl apart",
        },
      });
      const saved = await saveMyDietary({
        userId: thandi.id,
        foods: [
          { food: "peanuts", reaction: "anaphylaxis" },
          { food: "sesame", reaction: "allergy" },
        ],
        diets: ["vegetarian"],
      });
      expect(saved.ok).toBe(true);
      const after = await getMyDietary(thandi.id);
      expect(after.foods).toEqual([
        { food: "peanuts", reaction: "anaphylaxis" },
        { food: "sesame", reaction: "allergy" },
      ]);
      expect(after.diets).toEqual(["vegetarian"]);
      expect(after.savedAt).toBeInstanceOf(Date);
      // The old words are untouched.
      expect(after.old).toEqual(before.old);
      const [row] = await h
        .db()
        .select()
        .from(schema.dietaryRequirements)
        .where(eq(schema.dietaryRequirements.userId, thandi.id));
      expect(row).toMatchObject({
        allergies: "peanuts, sesame",
        isAnaphylactic: true,
        version: "dietary@3",
      });
    });

    it("refuses someone who is not a camp member", async () => {
      const gone = await makeUser(h.db(), { sanitised: true });
      expect(
        await saveMyDietary({ userId: gone.id, foods: [], diets: [] }),
      ).toEqual({ ok: false, error: DIETARY_NOT_A_MEMBER });
      expect(
        await saveMyDietary({ userId: "nope", foods: [], diets: [] }),
      ).toEqual({ ok: false, error: DIETARY_NOT_A_MEMBER });
    });

    it("counts the members coming for a captain or a Kitchen lead, never naming anyone", async () => {
      const { captain, kitchenLead, member, powerLead } = await setUp();
      const thandi = await coming("Thandi Nkosi");
      const kyle = await coming("Kyle Jacobs", "applied");
      const maybe = await coming("Ben Maybe", "maybe");
      const oldOnly = await coming("Aisha Patel");
      await saveMyDietary({
        userId: thandi.id,
        foods: [{ food: "peanuts", reaction: "anaphylaxis" }],
        diets: ["vegan"],
      });
      await saveMyDietary({
        userId: kyle.id,
        foods: [
          { food: "peanuts", reaction: "allergy" },
          { food: "milk", reaction: "intolerance" },
        ],
        diets: [],
      });
      await saveMyDietary({
        userId: maybe.id,
        foods: [{ food: "fish", reaction: "anaphylaxis" }],
        diets: [],
      });
      await h.db().insert(schema.dietaryRequirements).values({
        userId: oldOnly.id,
        version: "dietary@3",
        allergies: "shellfish",
      });

      for (const viewer of [captain, kitchenLead]) {
        const box = await getMenuDietaryFor(viewer.id);
        expect(box).toEqual({
          counts: {
            members: 2,
            allergies: [
              { food: "peanuts", label: "Peanuts", count: 2, anaphylactic: 1 },
            ],
            intolerances: [{ food: "milk", label: "Milk", count: 1 }],
            preferences: [{ diet: "vegan", label: "Vegan", count: 1 }],
          },
          oldOnly: 1,
        });
        const text = JSON.stringify(box);
        for (const person of [thandi, kyle, maybe, oldOnly]) {
          expect(text).not.toContain(person.id);
          expect(text).not.toContain(person.displayName!.split(" ")[0]!);
        }
      }
      expect(await getMenuDietaryFor(member.id)).toBeNull();
      expect(await getMenuDietaryFor(powerLead.id)).toBeNull();
    });

    it("prints the pick-list on the daily sheet over the old words", async () => {
      await campYear(h.db(), YEAR);
      const thandi = await coming("Thandi Nkosi");
      const kyle = await coming("Kyle Jacobs");
      await h.db().insert(schema.dietaryRequirements).values({
        userId: thandi.id,
        version: "dietary@3",
        allergies: "peanut-ish",
      });
      await saveMyDietary({
        userId: thandi.id,
        foods: [{ food: "peanuts", reaction: "anaphylaxis" }],
        diets: [],
      });
      // Only an intolerance: not on the allergy line.
      await saveMyDietary({
        userId: kyle.id,
        foods: [{ food: "milk", reaction: "intolerance" }],
        diets: [],
      });
      const rows = await listSheetAllergies(YEAR);
      expect(rows).toEqual([
        expect.objectContaining({
          userId: thandi.id,
          foods: [{ food: "peanuts", reaction: "anaphylaxis" }],
        }),
      ]);
    });
  });

  describe("allergens and plans on the meal plan", () => {
    it("reads Claude's marks, and lets a Kitchen lead correct them, compare-and-set and audited", async () => {
      const { kitchenLead, captain, powerLead, recipeId, versionId } =
        await setUp();
      const menu = await getKitchenMenu();
      expect(menu.recipes[recipeId]).toMatchObject({
        allergens: [
          { allergen: "milk", from: ["Milk"] },
          { allergen: "gluten", from: ["Rolled oats"] },
          { allergen: "peanuts", from: ["Peanut butter"] },
        ],
        allergensMarked: true,
        allergenRevision: 0,
      });
      const fix = (
        actorId: string,
        expectedRevision: number,
        allergens: string[],
      ) =>
        correctRecipeAllergens({
          actorId,
          recipeId,
          versionId,
          allergens,
          expectedRevision,
        });

      expect(await fix(powerLead.id, 0, [])).toEqual({
        ok: false,
        error: NOT_A_MEAL_CHECKER,
      });
      expect(await fix(kitchenLead.id, 0, ["peanuts", "milk"])).toEqual({
        ok: true,
        revision: 1,
      });
      expect(await fix(captain.id, 0, ["sesame"])).toEqual({
        ok: false,
        error: ALLERGENS_CHANGED,
      });
      expect((await getKitchenMenu()).recipes[recipeId]).toMatchObject({
        allergens: [
          { allergen: "milk", from: ["Milk"] },
          { allergen: "peanuts", from: ["Peanut butter"] },
        ],
        allergenRevision: 1,
      });
      expect(
        await correctRecipeAllergens({
          actorId: captain.id,
          recipeId,
          versionId: "00000000-0000-4000-8000-000000000000",
          allergens: [],
          expectedRevision: 1,
        }),
      ).toEqual({ ok: false, error: RECIPE_NEWER_VERSION });
      const rows = await audit("camp.kitchen_allergens.corrected");
      expect(rows).toHaveLength(1);
      expect(rows[0]!.metadata).toMatchObject({
        allergens: ["milk", "peanuts"],
      });
    });

    it("records a plan for an anaphylaxis, compare-and-set and audited; it goes with the recipe off the meal", async () => {
      const { kitchenLead, captain, member, itemId } = await setUp();
      const plan = (
        actorId: string,
        expectedVersion: number,
        details = "One bowl first.",
      ) =>
        recordAllergenPlan({
          actorId,
          itemId,
          kind: "portion",
          details,
          allergens: ["peanuts"],
          expectedVersion,
        });
      expect(await plan(member.id, 0)).toEqual({
        ok: false,
        error: NOT_A_MEAL_CHECKER,
      });
      expect(await plan(kitchenLead.id, 0)).toEqual({ ok: true, version: 1 });
      expect(await plan(captain.id, 0, "Swap it.")).toEqual({
        ok: false,
        error: PLAN_CHANGED,
      });
      expect(
        await plan(captain.id, 1, "Sunflower seed butter for all."),
      ).toEqual({
        ok: true,
        version: 2,
      });
      expect((await getMealChecks()).plans).toEqual([
        {
          menuItemId: itemId,
          kind: "portion",
          details: "Sunflower seed butter for all.",
          allergens: ["peanuts"],
          version: 2,
        },
      ]);
      expect(await audit("camp.kitchen_allergen_plan.recorded")).toHaveLength(
        2,
      );

      expect(await removeMenuItem({ actorId: captain.id, itemId })).toEqual({
        ok: true,
      });
      expect((await getMealChecks()).plans).toEqual([]);
      expect(await plan(captain.id, 2)).toEqual({
        ok: false,
        error: MEAL_ITEM_GONE,
      });
    });
  });

  describe("prep steps", () => {
    const kitchenTasks = (db: DB) =>
      db.select().from(schema.tasks).where(eq(schema.tasks.team, "kitchen"));

    it("puts a step due before we leave on the board for the Kitchen, with its due date", async () => {
      const { kitchenLead, itemId } = await setUp();
      const added = await addPrepStep({
        actorId: kitchenLead.id,
        itemId,
        what: "Toast the oats",
        when: "before_leaving",
        date: "2027-04-19",
      });
      expect(added).toMatchObject({
        ok: true,
        onBoard: true,
        due: "2027-04-19",
      });
      const tasks = await kitchenTasks(h.db());
      expect(tasks).toHaveLength(1);
      expect(tasks[0]).toMatchObject({
        title: "Overnight oats ×60: toast the oats",
        description: "For Day 2 breakfast, Fri 23 Apr",
        team: "kitchen",
        status: "open",
        assigneeId: null,
        createdByUserId: kitchenLead.id,
      });
      expect(tasks[0]!.dueAt).toEqual(new Date("2027-04-19T00:00:00+02:00"));
      expect(await audit("camp.kitchen_prep.added")).toHaveLength(1);
    });

    it("prints a step due on site on the sheet and puts nothing on the board", async () => {
      const { captain, itemId } = await setUp();
      const added = await addPrepStep({
        actorId: captain.id,
        itemId,
        what: "Soak the oats",
        when: "day_before",
        date: null,
      });
      expect(added).toMatchObject({
        ok: true,
        onBoard: false,
        due: "2027-04-22",
      });
      expect(await kitchenTasks(h.db())).toEqual([]);
      expect(await listSheetPrepSteps(YEAR)).toEqual([
        {
          dueDate: "2027-04-22",
          what: "Soak the oats",
          recipeTitle: "Overnight oats",
          day: 2,
          meal: "breakfast",
        },
      ]);
      expect((await getMealChecks()).prepSteps).toEqual([
        expect.objectContaining({
          what: "Soak the oats",
          onBoard: false,
          timing: "day_before",
        }),
      ]);
    });

    it("takes the task off when the step comes off, and refuses a member and a lead of another team", async () => {
      const { kitchenLead, member, powerLead, itemId } = await setUp();
      for (const who of [member, powerLead]) {
        expect(
          await addPrepStep({
            actorId: who.id,
            itemId,
            what: "x",
            when: "same_day",
            date: null,
          }),
        ).toEqual({ ok: false, error: NOT_A_MEAL_CHECKER });
      }
      const added = await addPrepStep({
        actorId: kitchenLead.id,
        itemId,
        what: "Buy fresh milk",
        when: "before_leaving",
        date: "2027-04-21",
      });
      if (!added.ok) throw new Error(added.error);
      expect(
        await removePrepStep({ actorId: powerLead.id, stepId: added.stepId }),
      ).toEqual({
        ok: false,
        error: NOT_A_MEAL_CHECKER,
      });
      expect(
        await removePrepStep({ actorId: kitchenLead.id, stepId: added.stepId }),
      ).toEqual({
        ok: true,
      });
      const [task] = await kitchenTasks(h.db());
      expect(task!.status).toBe("cancelled");
      expect(
        await removePrepStep({ actorId: kitchenLead.id, stepId: added.stepId }),
      ).toEqual({
        ok: false,
        error: PREP_STEP_GONE,
      });
      expect(await audit("camp.kitchen_prep.removed")).toHaveLength(1);
    });

    it("takes the tasks off when the recipe comes off the meal", async () => {
      const { captain, itemId } = await setUp();
      const added = await addPrepStep({
        actorId: captain.id,
        itemId,
        what: "Buy fresh milk",
        when: "before_leaving",
        date: "2027-04-21",
      });
      expect(added.ok).toBe(true);
      expect(await removeMenuItem({ actorId: captain.id, itemId })).toEqual({
        ok: true,
      });
      const tasks = await kitchenTasks(h.db());
      expect(tasks.map((t) => t.status)).toEqual(["cancelled"]);
      expect(
        await h
          .db()
          .select()
          .from(schema.kitchenPrepSteps)
          .where(and(eq(schema.kitchenPrepSteps.menuItemId, itemId))),
      ).toEqual([]);
    });

    it("needs the date of Day 1 and a date before it", async () => {
      const { captain, itemId } = await setUp();
      expect(
        await addPrepStep({
          actorId: captain.id,
          itemId,
          what: "Too late",
          when: "before_leaving",
          date: "2027-04-22",
        }),
      ).toMatchObject({ ok: false });
      // Logistics has no Build or Burn days: there is no Day 1.
      await h
        .db()
        .update(schema.logisticsPhases)
        .set({ startDate: null, endDate: null })
        .where(eq(schema.logisticsPhases.cycle, YEAR));
      const out = await addPrepStep({
        actorId: captain.id,
        itemId,
        what: "Soak",
        when: "same_day",
        date: null,
      });
      expect(out).toMatchObject({ ok: false });
      expect(await h.db().select().from(schema.kitchenPrepSteps)).toEqual([]);
      expect(await kitchenTasks(h.db())).toEqual([]);
    });
  });

  describe("Day 1 moves", () => {
    it("moves every prep step and its Kitchen task by the same days when Build moves in Logistics, audited, and keeps an edited line of detail", async () => {
      const { captain, kitchenLead, itemId } = await setUp();
      const before = await addPrepStep({
        actorId: kitchenLead.id,
        itemId,
        what: "Toast the oats",
        when: "before_leaving",
        date: "2027-04-19",
      });
      const buy = await addPrepStep({
        actorId: kitchenLead.id,
        itemId,
        what: "Buy fresh milk",
        when: "before_leaving",
        date: "2027-04-20",
      });
      const onSite = await addPrepStep({
        actorId: kitchenLead.id,
        itemId,
        what: "Soak the oats",
        when: "day_before",
        date: null,
      });
      if (!before.ok || !buy.ok || !onSite.ok) throw new Error("setup");
      // Someone edits one task's details by hand: that text is theirs.
      const [buyStep] = await h
        .db()
        .select({ taskId: schema.kitchenPrepSteps.taskId })
        .from(schema.kitchenPrepSteps)
        .where(eq(schema.kitchenPrepSteps.id, buy.stepId));
      await h
        .db()
        .update(schema.tasks)
        .set({ description: "Ask Thandi which milk" })
        .where(eq(schema.tasks.id, buyStep!.taskId!));

      // Build gets a longer end in Logistics: Day 1 stays, nothing moves.
      expect(
        await setLogisticsPhase({
          actorId: captain.id,
          phase: "build",
          startDate: "2027-04-22",
          endDate: "2027-04-25",
          place: null,
          note: null,
          expectedVersion: 1,
          newEventId: "evbuild1",
        }),
      ).toMatchObject({ ok: true });
      expect(await audit("camp.kitchen_prep.redated")).toEqual([]);

      // Build starts two days later in Logistics: Day 1 moves with it.
      expect(
        await setLogisticsPhase({
          actorId: captain.id,
          phase: "build",
          startDate: "2027-04-24",
          endDate: "2027-04-25",
          place: null,
          note: null,
          expectedVersion: 2,
          newEventId: "evbuild1",
        }),
      ).toMatchObject({ ok: true });
      expect((await getMealPlan()).firstDay).toBe("2027-04-24");

      const steps = await h
        .db()
        .select({
          what: schema.kitchenPrepSteps.what,
          dueDate: schema.kitchenPrepSteps.dueDate,
        })
        .from(schema.kitchenPrepSteps);
      expect(Object.fromEntries(steps.map((s) => [s.what, s.dueDate]))).toEqual(
        {
          "Toast the oats": "2027-04-21",
          "Buy fresh milk": "2027-04-22",
          "Soak the oats": "2027-04-24",
        },
      );
      const tasks = await h
        .db()
        .select()
        .from(schema.tasks)
        .where(eq(schema.tasks.team, "kitchen"));
      const byTitle = Object.fromEntries(tasks.map((t) => [t.title, t]));
      expect(byTitle["Overnight oats ×60: toast the oats"]).toMatchObject({
        dueAt: new Date("2027-04-21T00:00:00+02:00"),
        description: "For Day 2 breakfast, Sun 25 Apr",
        version: 2,
      });
      expect(byTitle["Overnight oats ×60: buy fresh milk"]).toMatchObject({
        dueAt: new Date("2027-04-22T00:00:00+02:00"),
        description: "Ask Thandi which milk",
      });
      // The step on site has no task, before or after.
      expect(tasks).toHaveLength(2);
      const rows = await audit("camp.kitchen_prep.redated");
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        actorId: captain.id,
        metadata: {
          from: "2027-04-22",
          to: "2027-04-24",
          shift: 2,
          steps: 3,
          tasks: 2,
        },
      });
    });
  });

  describe("Day 1 moves to the Burn", () => {
    it("moves the steps to the first Burn day when the Build days are cleared", async () => {
      const { captain, itemId } = await setUp();
      await h.db().insert(schema.logisticsPhases).values({
        cycle: YEAR,
        phase: "burn",
        startDate: "2027-04-26",
        endDate: "2027-05-01",
      });
      const step = await addPrepStep({
        actorId: captain.id,
        itemId,
        what: "Soak the oats",
        when: "same_day",
        date: null,
      });
      expect(step).toMatchObject({ ok: true, due: "2027-04-23" });
      expect(
        await clearLogisticsPhase({
          actorId: captain.id,
          phase: "build",
          expectedVersion: 1,
        }),
      ).toMatchObject({ ok: true });
      expect(await getMealPlan()).toMatchObject({
        firstDay: "2027-04-26",
        daysOnSite: 6,
      });
      const [stored] = await h.db().select().from(schema.kitchenPrepSteps);
      expect(stored!.dueDate).toBe("2027-04-27");
    });
  });

  describe("Day 1 cleared in Logistics", () => {
    const clearBuild = (actorId: string) =>
      clearLogisticsPhase({ actorId, phase: "build", expectedVersion: 1 });

    it("is refused while there are prep steps, and nothing changes", async () => {
      const { captain, itemId } = await setUp();
      const step = await addPrepStep({
        actorId: captain.id,
        itemId,
        what: "Toast the oats",
        when: "before_leaving",
        date: "2027-04-19",
      });
      expect(step.ok).toBe(true);
      expect(await clearBuild(captain.id)).toEqual({
        ok: false,
        error: DAY_ONE_NEEDED_FOR_PREP,
      });
      expect(await getMealPlan()).toMatchObject({ firstDay: "2027-04-22" });
      const [build] = await h.db().select().from(schema.logisticsPhases);
      expect(build).toMatchObject({ startDate: "2027-04-22", version: 1 });
      const [stored] = await h.db().select().from(schema.kitchenPrepSteps);
      expect(stored!.dueDate).toBe("2027-04-19");
      expect(await audit("logistics.phase_cleared")).toEqual([]);
    });

    it("still works with no prep steps", async () => {
      const { captain } = await setUp();
      expect(await clearBuild(captain.id)).toMatchObject({ ok: true });
      expect(await getMealPlan()).toMatchObject({
        firstDay: null,
        daysOnSite: 11,
      });
    });
  });
});
