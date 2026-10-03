import { eq } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";
import { buildShoppingList, POWER_TEAM } from "@camp404/core";
import { KitchenRecipe, MAX_RECIPES_PER_MEAL, type Team } from "@camp404/types";
import type { CampConfig } from "../camp-config";
import {
  ALREADY_ON_MEAL,
  MEAL_IS_FULL,
  MENU_DAY_NOT_ON_PLAN,
  MENU_ITEM_GONE,
  MENU_MEAL_HAS_NO_PLATES,
  MENU_RECIPE_NOT_IN_BOOK,
  NOT_A_MENU_EDITOR,
  NOT_A_SNACK_KEEPER,
  NOT_A_TICKER,
  SNACK_GONE,
  addMenuItem,
  addSnack,
  getKitchenMenu,
  getShoppingFacts,
  getSnacks,
  listMenuBook,
  removeMenuItem,
  removeSnack,
  setShoppingTicks,
} from "../kitchen-menu";
import { setFoundingYear } from "../cycle-rollover";
import { setMealPlan } from "../meal-plan";
import * as schema from "../schema";
import { assignTeam, setLead } from "../team-memberships";
import { useTestDb } from "./_harness";
import { makeUser, seedAcceptedVersion } from "./_factories";

// The Kitchen's menu (#244) and shopping list (#245) on a real Postgres
// (PGlite). What matters: only a captain or a Kitchen lead puts recipes on
// the menu and keeps the snacks, checked again inside the write and audited
// with it; a meal holds more than one recipe, each once; the list reads only
// the plate counts that are there (never guessed); and any approved member
// ticks, for the whole camp.

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

const DAL = KitchenRecipe.parse({
  title: "Camp dal",
  plates: 50,
  ingredients: [
    { name: "Red lentils", category: "legume", quantity: 2.5, unit: "kg" },
    { name: "Onions", category: "produce", quantity: 1500, unit: "g" },
    { name: "Salt", category: "spice", quantity: null, unit: null },
  ],
  steps: [{ instruction: "Simmer.", uses: ["Red lentils", "Onions"] }],
});

const RICE = KitchenRecipe.parse({
  title: "Rice",
  plates: 50,
  ingredients: [
    { name: "Rice", category: "grain", quantity: 4, unit: "kg" },
    { name: "onions", category: "produce", quantity: 0.5, unit: "kg" },
  ],
  steps: [{ instruction: "Boil.", uses: ["Rice"] }],
});

describe("kitchen menu and shopping list", () => {
  const h = useTestDb();

  async function leadOf(team: Team) {
    const user = await makeUser(h.db(), { approvalStatus: "approved" });
    await assignTeam({ userId: user.id, team });
    await setLead({ userId: user.id, team, isLead: true });
    return user;
  }

  async function recipe(body: KitchenRecipe, authorId: string) {
    const [row] = await h
      .db()
      .insert(schema.recipes)
      .values({ source: "text", title: body.title })
      .returning({ id: schema.recipes.id });
    const { versionId } = await seedAcceptedVersion(h.db(), {
      recipeId: row!.id,
      authorId,
      recipe: body,
    });
    return { recipeId: row!.id, versionId };
  }

  /**
   * Two days on site (two days of Build in Logistics): 50 at dinner on both,
   * 30 at breakfast on day 2.
   */
  async function setUp() {
    await campYear(h.db(), 2026);
    await h.db().insert(schema.logisticsPhases).values({
      cycle: 2026,
      phase: "build",
      startDate: "2026-04-22",
      endDate: "2026-04-23",
    });
    const captain = await makeUser(h.db(), {
      rank: "captain",
      approvalStatus: "approved",
    });
    const kitchenLead = await leadOf("kitchen");
    const powerLead = await leadOf(POWER_TEAM as Team);
    const member = await makeUser(h.db(), { approvalStatus: "approved" });
    const applicant = await makeUser(h.db(), { approvalStatus: "pending" });
    expect(
      await setMealPlan({
        actorId: captain.id,
        days: [
          { breakfast: 0, dinner: 50 },
          { breakfast: 30, dinner: 50 },
        ],
        expectedVersion: 0,
      }),
    ).toEqual({ ok: true, version: 1 });
    const dal = await recipe(DAL, captain.id);
    const rice = await recipe(RICE, captain.id);
    return { captain, kitchenLead, powerLead, member, applicant, dal, rice };
  }

  const audit = (action: string) =>
    h
      .db()
      .select()
      .from(schema.auditLog)
      .where(eq(schema.auditLog.action, action));

  it("lists the book for the picker: by name, with each recipe's summary, time and where its counts stand", async () => {
    const { captain, dal, rice } = await setUp();
    // Camp dal is also counted for 30 plates, and Claude is on 40 for it.
    await h.db().insert(schema.recipePlateCounts).values({
      versionId: dal.versionId,
      plates: 30,
      lines: [],
      source: "proofread",
    });
    await h
      .db()
      .insert(schema.recipeProofreadRuns)
      .values([
        {
          recipeId: dal.recipeId,
          requestedBy: captain.id,
          promptVersion: "test",
          model: "test",
          kind: "plates",
          plates: 40,
          versionId: dal.versionId,
          outcome: "running",
        },
        // A finished run is not open.
        {
          recipeId: rice.recipeId,
          requestedBy: captain.id,
          promptVersion: "test",
          model: "test",
          kind: "plates",
          plates: 40,
          versionId: rice.versionId,
          outcome: "failed",
        },
      ]);
    // A suggestion with no version is not in the book.
    await h
      .db()
      .insert(schema.recipes)
      .values({ source: "text", title: "Aardvark stew" });
    await h
      .db()
      .update(schema.recipeVersions)
      .set({
        body: {
          ...DAL,
          summary: "Red lentils and onions",
          totalTimeMinutes: 70,
        },
      })
      .where(eq(schema.recipeVersions.id, dal.versionId));

    expect(await listMenuBook()).toEqual([
      {
        id: dal.recipeId,
        title: "Camp dal",
        summary: "Red lentils and onions",
        totalMinutes: 70,
        readyPlates: [30, 50],
        openPlates: [40],
      },
      {
        id: rice.recipeId,
        title: "Rice",
        summary: null,
        totalMinutes: null,
        readyPlates: [50],
        openPlates: [],
      },
    ]);
  });

  it("lets a Kitchen lead put two recipes on one meal, in order, each audited", async () => {
    const { kitchenLead, captain, dal, rice } = await setUp();
    const first = await addMenuItem({
      actorId: kitchenLead.id,
      day: 1,
      meal: "dinner",
      recipeId: dal.recipeId,
    });
    expect(first.ok).toBe(true);
    const second = await addMenuItem({
      actorId: captain.id,
      day: 1,
      meal: "dinner",
      recipeId: rice.recipeId,
    });
    expect(second.ok).toBe(true);

    const menu = await getKitchenMenu();
    expect(
      menu.items.map((i) => [i.day, i.meal, i.position, i.recipeId]),
    ).toEqual([
      [1, "dinner", 1, dal.recipeId],
      [1, "dinner", 2, rice.recipeId],
    ]);
    expect(menu.recipes[dal.recipeId]).toMatchObject({
      title: "Camp dal",
      versionId: dal.versionId,
      categories: ["legume", "produce", "spice"],
      openPlates: [],
    });
    expect(menu.recipes[dal.recipeId]!.counts.map((c) => c.plates)).toEqual([
      50,
    ]);

    const rows = await audit("camp.kitchen_menu.added");
    expect(rows.map((r) => r.actorId)).toEqual([kitchenLead.id, captain.id]);
    expect(rows[0]!.metadata).toMatchObject({
      cycle: 2026,
      day: 1,
      meal: "dinner",
      recipeId: dal.recipeId,
      title: "Camp dal",
    });
  });

  it("refuses a member and a lead of another team inside the write, and writes nothing", async () => {
    const { member, powerLead, dal } = await setUp();
    for (const actor of [member, powerLead]) {
      expect(
        await addMenuItem({
          actorId: actor.id,
          day: 1,
          meal: "dinner",
          recipeId: dal.recipeId,
        }),
      ).toEqual({ ok: false, error: NOT_A_MENU_EDITOR });
      expect(
        await addSnack({ actorId: actor.id, name: "Crisps", amount: null }),
      ).toEqual({ ok: false, error: NOT_A_SNACK_KEEPER });
    }
    expect((await getKitchenMenu()).items).toEqual([]);
    expect(await getSnacks()).toEqual([]);
    expect(await audit("camp.kitchen_menu.added")).toEqual([]);
  });

  it("refuses a recipe twice on a meal, a day off the plan, a meal with no plates, a recipe not in the book, and a full meal", async () => {
    const { captain, dal } = await setUp();
    const add = (
      day: number,
      meal: "breakfast" | "dinner",
      recipeId = dal.recipeId,
    ) => addMenuItem({ actorId: captain.id, day, meal, recipeId });
    expect((await add(1, "dinner")).ok).toBe(true);
    expect(await add(1, "dinner")).toEqual({
      ok: false,
      error: ALREADY_ON_MEAL,
    });
    expect(await add(3, "dinner")).toEqual({
      ok: false,
      error: MENU_DAY_NOT_ON_PLAN,
    });
    expect(await add(1, "breakfast")).toEqual({
      ok: false,
      error: MENU_MEAL_HAS_NO_PLATES,
    });
    // A suggestion that never reached the book.
    const [draft] = await h
      .db()
      .insert(schema.recipes)
      .values({ source: "text", title: "Not yet" })
      .returning({ id: schema.recipes.id });
    expect(await add(2, "dinner", draft!.id)).toEqual({
      ok: false,
      error: MENU_RECIPE_NOT_IN_BOOK,
    });

    for (let i = 0; i < MAX_RECIPES_PER_MEAL; i += 1) {
      const more = await recipe({ ...DAL, title: `Side ${i}` }, captain.id);
      expect((await add(2, "breakfast", more.recipeId)).ok).toBe(true);
    }
    const one = await recipe({ ...DAL, title: "One too many" }, captain.id);
    expect(await add(2, "breakfast", one.recipeId)).toEqual({
      ok: false,
      error: MEAL_IS_FULL,
    });
  });

  it("takes a recipe off, audited, and says so when it is already off", async () => {
    const { kitchenLead, member, dal } = await setUp();
    const added = await addMenuItem({
      actorId: kitchenLead.id,
      day: 2,
      meal: "dinner",
      recipeId: dal.recipeId,
    });
    if (!added.ok) throw new Error(added.error);
    expect(
      await removeMenuItem({ actorId: member.id, itemId: added.itemId }),
    ).toEqual({ ok: false, error: NOT_A_MENU_EDITOR });
    expect(
      await removeMenuItem({ actorId: kitchenLead.id, itemId: added.itemId }),
    ).toEqual({ ok: true });
    expect(
      await removeMenuItem({ actorId: kitchenLead.id, itemId: added.itemId }),
    ).toEqual({ ok: false, error: MENU_ITEM_GONE });
    expect((await getKitchenMenu()).items).toEqual([]);
    expect(await audit("camp.kitchen_menu.removed")).toHaveLength(1);
  });

  it("adds up only the counts that are there: day 2 breakfast at 30 plates is not counted yet", async () => {
    const { captain, dal, rice } = await setUp();
    for (const [day, meal, recipeId] of [
      [1, "dinner", dal.recipeId],
      [1, "dinner", rice.recipeId],
      [2, "dinner", dal.recipeId],
      [2, "breakfast", dal.recipeId],
    ] as const) {
      expect(
        (await addMenuItem({ actorId: captain.id, day, meal, recipeId })).ok,
      ).toBe(true);
    }
    const facts = await getShoppingFacts();
    const list = buildShoppingList({
      days: facts.plan.days,
      menu: facts.menu.items,
      recipes: facts.menu.recipes,
    });
    expect(list.notCounted).toEqual([
      {
        day: 2,
        meal: "breakfast",
        recipeId: dal.recipeId,
        title: "Camp dal",
        plates: 30,
      },
    ]);
    expect(list.meals).toBe(2);
    const onions = list.groups
      .find((g) => g.category === "produce")!
      .lines.find((l) => l.name === "Onions")!;
    // 1.5 kg + 0.5 kg (Rice's "onions") on day 1, 1.5 kg on day 2.
    expect(onions.amount).toEqual({
      quantity: 3.5,
      quantityMax: null,
      unit: "kg",
      toTaste: false,
    });
    expect(onions.sources.map((s) => `${s.day} ${s.meal} ${s.title}`)).toEqual([
      "1 dinner Camp dal",
      "1 dinner Rice",
      "2 dinner Camp dal",
    ]);

    // A proofread count for 30 plates brings day 2 breakfast in.
    await h
      .db()
      .insert(schema.recipePlateCounts)
      .values({
        versionId: dal.versionId,
        plates: 30,
        lines: [
          {
            name: "Red lentils",
            quantity: 1.6,
            quantityMax: null,
            unit: "kg",
            note: null,
          },
          {
            name: "Onions",
            quantity: 1,
            quantityMax: null,
            unit: "kg",
            note: null,
          },
          {
            name: "Salt",
            quantity: null,
            quantityMax: null,
            unit: null,
            note: null,
          },
        ],
        source: "proofread",
      });
    const again = await getShoppingFacts();
    const full = buildShoppingList({
      days: again.plan.days,
      menu: again.menu.items,
      recipes: again.menu.recipes,
    });
    expect(full.notCounted).toEqual([]);
    expect(
      full.groups.find((g) => g.category === "legume")!.lines[0]!.amount,
    ).toMatchObject({ quantity: 6.6, unit: "kg" });
  });

  it("keeps snacks for the year, audited, and says so when one is already gone", async () => {
    const { kitchenLead } = await setUp();
    const added = await addSnack({
      actorId: kitchenLead.id,
      name: "  Rusks ",
      amount: "4 boxes",
    });
    if (!added.ok) throw new Error(added.error);
    expect(await getSnacks()).toEqual([
      { id: added.snackId, name: "Rusks", amount: "4 boxes" },
    ]);
    expect(
      await removeSnack({ actorId: kitchenLead.id, snackId: added.snackId }),
    ).toEqual({ ok: true });
    expect(
      await removeSnack({ actorId: kitchenLead.id, snackId: added.snackId }),
    ).toEqual({ ok: false, error: SNACK_GONE });
    expect(await audit("camp.kitchen_snack.added")).toHaveLength(1);
    expect(await audit("camp.kitchen_snack.removed")).toHaveLength(1);
  });

  /**
   * The SQL each write sends inside its transaction. PGlite has one
   * connection, so two writes cannot race here; what can be checked is that
   * each write takes the year's lock BEFORE it counts what is there.
   */
  async function sqlOf(run: () => Promise<unknown>): Promise<string[]> {
    const pg = h.client();
    const seen: string[] = [];
    const original = pg.transaction.bind(pg);
    const spy = vi.spyOn(pg, "transaction").mockImplementation((callback) =>
      original(async (inner) => {
        const query = inner.query.bind(inner);
        inner.query = ((text: string, ...rest: unknown[]) => {
          seen.push(text);
          return (query as (...a: unknown[]) => unknown)(text, ...rest);
        }) as typeof inner.query;
        return callback(inner);
      }),
    );
    try {
      await run();
    } finally {
      spy.mockRestore();
    }
    return seen;
  }

  const lockBeforeCount = (statements: string[], table: string) => {
    const lock = statements.findIndex((q) =>
      q.includes("pg_advisory_xact_lock"),
    );
    const count = statements.findIndex(
      (q) => q.includes("count(*)") && q.includes(`"${table}"`),
    );
    expect(count).toBeGreaterThan(-1);
    expect(lock).toBeGreaterThan(-1);
    expect(lock).toBeLessThan(count);
  };

  it("takes the year's lock before counting a meal or the snacks, so two editors cannot both pass the cap", async () => {
    const { kitchenLead, dal } = await setUp();
    const menu = await sqlOf(async () => {
      const added = await addMenuItem({
        actorId: kitchenLead.id,
        day: 1,
        meal: "dinner",
        recipeId: dal.recipeId,
      });
      expect(added.ok).toBe(true);
    });
    lockBeforeCount(menu, "kitchen_menu_items");
    const snacks = await sqlOf(async () => {
      const added = await addSnack({
        actorId: kitchenLead.id,
        name: "Rusks",
        amount: null,
      });
      expect(added.ok).toBe(true);
    });
    lockBeforeCount(snacks, "kitchen_snacks");
  });

  it("is adopted by the founding year: the plan and its days, the menu, the snacks and the ticks", async () => {
    // No year yet: everything is written under the sentinel, the Build
    // days in Logistics too (two days on site).
    await h.db().insert(schema.logisticsPhases).values({
      cycle: 1,
      phase: "build",
      startDate: "2027-04-22",
      endDate: "2027-04-23",
    });
    const captain = await makeUser(h.db(), {
      rank: "captain",
      approvalStatus: "approved",
    });
    expect(
      await setMealPlan({
        actorId: captain.id,
        days: [
          { breakfast: 0, dinner: 50 },
          { breakfast: 30, dinner: 50 },
        ],
        expectedVersion: 0,
      }),
    ).toEqual({ ok: true, version: 1 });
    const dal = await recipe(DAL, captain.id);
    expect(
      (
        await addMenuItem({
          actorId: captain.id,
          day: 1,
          meal: "dinner",
          recipeId: dal.recipeId,
        })
      ).ok,
    ).toBe(true);
    expect(
      (await addSnack({ actorId: captain.id, name: "Rusks", amount: null })).ok,
    ).toBe(true);
    expect(
      await setShoppingTicks({
        actorId: captain.id,
        lines: [{ key: "onions|g", amount: "800 g" }],
        ticked: true,
      }),
    ).toEqual({ ok: true });

    expect(
      (await setFoundingYear({ year: 2027, actorUserId: captain.id })).ok,
    ).toBe(true);

    const facts = await getShoppingFacts();
    expect(facts.plan).toMatchObject({
      cycle: 2027,
      daysOnSite: 2,
      version: 1,
    });
    expect(facts.plan.days[1]).toEqual({ breakfast: 30, dinner: 50 });
    expect(facts.menu.items.map((i) => [i.day, i.meal, i.recipeId])).toEqual([
      [1, "dinner", dal.recipeId],
    ]);
    expect(facts.snacks.map((s) => s.name)).toEqual(["Rusks"]);
    expect(facts.ticks).toEqual([{ key: "onions|g", amount: "800 g" }]);
    expect(await h.db().select().from(schema.kitchenMealPlans)).toHaveLength(1);
  });

  it("lets any approved member tick for the whole camp, and refuses an applicant", async () => {
    const { member, kitchenLead, applicant } = await setUp();
    expect(
      await setShoppingTicks({
        actorId: applicant.id,
        lines: [{ key: "onions|g", amount: "3.5 kg" }],
        ticked: true,
      }),
    ).toEqual({ ok: false, error: NOT_A_TICKER });
    expect((await getShoppingFacts()).ticks).toEqual([]);

    expect(
      await setShoppingTicks({
        actorId: member.id,
        lines: [
          { key: "onions|g", amount: "3.5 kg" },
          { key: "rice|g", amount: "4 kg" },
        ],
        ticked: true,
      }),
    ).toEqual({ ok: true });
    // Ticking again at a new amount replaces the old tick; everyone sees it.
    expect(
      await setShoppingTicks({
        actorId: kitchenLead.id,
        lines: [{ key: "onions|g", amount: "5 kg" }],
        ticked: true,
      }),
    ).toEqual({ ok: true });
    expect(
      (await getShoppingFacts()).ticks.sort((a, b) =>
        a.key.localeCompare(b.key),
      ),
    ).toEqual([
      { key: "onions|g", amount: "5 kg" },
      { key: "rice|g", amount: "4 kg" },
    ]);

    expect(
      await setShoppingTicks({
        actorId: member.id,
        lines: [{ key: "rice|g", amount: "4 kg" }],
        ticked: false,
      }),
    ).toEqual({ ok: true });
    expect((await getShoppingFacts()).ticks).toEqual([
      { key: "onions|g", amount: "5 kg" },
    ]);
  });
});
