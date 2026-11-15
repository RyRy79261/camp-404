// @vitest-environment node
import type { McpServer } from "@modelcontextprotocol/server";
import type { CallToolResult } from "@modelcontextprotocol/server";
import { eq } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";
import { KitchenRecipe, type Team } from "@camp404/types";
import type { CampConfig } from "@camp404/db/camp-config";
import { ALREADY_ON_MEAL } from "@camp404/db/kitchen-menu";
import { ALLERGENS_CHANGED, PLAN_CHANGED } from "@camp404/db/kitchen-meals";
import { PRICE_CHANGED } from "@camp404/db/kitchen-prices";
import { MEAL_PLAN_CHANGED } from "@camp404/db/meal-plan";
import * as schema from "@camp404/db/schema";
import { assignTeam, setLead } from "@camp404/db/team-memberships";
import { useTestDb } from "../../../../../packages/db/src/__tests__/_harness";
import {
  makeUser,
  seedAcceptedVersion,
} from "../../../../../packages/db/src/__tests__/_factories";
import {
  MEAL_PLAN_REFUSAL,
  PRICE_REFUSAL,
  SNACK_REFUSAL,
} from "../../recipe-copy";

vi.mock("next/server", () => ({ after: () => undefined }));

import { registerCampMcpTools } from "../server";

// The meal plan's and the shopping list's tools against real Postgres
// (PGlite), through the real handlers: who may, who is refused and in what
// words, the rows and audit rows the page's write leaves, and the
// compare-and-set on what the caller read.

type Handler = (args: unknown, extra: unknown) => Promise<CallToolResult>;
const tools = new Map<string, Handler>();
registerCampMcpTools({
  registerTool: (name: string, _config: unknown, handler: Handler) => {
    tools.set(name, handler);
  },
} as unknown as McpServer);

async function call(name: string, args: unknown, as: string) {
  const result = await tools.get(name)!(args, {
    http: { authInfo: { clientId: "test", extra: { campUserId: as } } },
  });
  const text = (result.content[0] as { text: string }).text;
  return result.isError
    ? { error: text }
    : { data: JSON.parse(text) as Record<string, unknown> };
}

// eslint-disable-next-line react-hooks/rules-of-hooks -- useTestDb is the PGlite harness, not a React Hook
const h = useTestDb();

async function campYear(year = 2026) {
  const cycles: CampConfig["cycles"] = [
    { year, startedAt: `${year}-01-01T00:00:00.000Z`, endedAt: null },
  ];
  await h
    .db()
    .insert(schema.campSettings)
    .values({ id: true })
    .onConflictDoNothing({ target: schema.campSettings.id });
  const [row] = await h
    .db()
    .select({ config: schema.campSettings.config })
    .from(schema.campSettings)
    .limit(1);
  await h
    .db()
    .update(schema.campSettings)
    .set({ config: { ...row!.config, cycles } })
    .where(eq(schema.campSettings.id, true));
}

const member = () => makeUser(h.db(), { approvalStatus: "approved" });
const captain = () =>
  makeUser(h.db(), { approvalStatus: "approved", rank: "captain" });

async function leadOf(team: Team) {
  const user = await member();
  await assignTeam({ userId: user.id, team });
  await setLead({ userId: user.id, team, isLead: true });
  return user;
}

async function auditRows(action: string) {
  return h
    .db()
    .select()
    .from(schema.auditLog)
    .where(eq(schema.auditLog.action, action));
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const onThePage = (sentence: string, path: string) =>
  new RegExp(`^${escape(sentence)} On the website: https?://\\S+${path}$`);

/** A recipe in the book for 20 plates. */
async function bookRecipe(by: string, title = "Oats") {
  const [row] = await h
    .db()
    .insert(schema.recipes)
    .values({ source: "text", title, submitterId: by })
    .returning({ id: schema.recipes.id });
  const { versionId } = await seedAcceptedVersion(h.db(), {
    recipeId: row!.id,
    authorId: by,
    recipe: KitchenRecipe.parse({
      title,
      plates: 20,
      ingredients: [
        { name: "Oats", category: "grain", quantity: 2, unit: "kg" },
      ],
      steps: [{ instruction: "Soak overnight.", uses: ["Oats"] }],
    }),
  });
  return { recipeId: row!.id, versionId };
}

/** A camp with Build days (Day 1 is 2026-04-22), a Kitchen lead and a recipe. */
async function kitchenCamp() {
  await campYear();
  const boss = await captain();
  const cook = await leadOf("kitchen");
  const plain = await member();
  const set = await call(
    "set_logistics_days",
    {
      phase: "build",
      startDate: "2026-04-22",
      endDate: "2026-04-24",
      expectedVersion: 0,
    },
    boss.id,
  );
  expect(set.error).toBeUndefined();
  const recipe = await bookRecipe(boss.id);
  return { boss, cook, plain, ...recipe };
}

/** Day 1 breakfast at 20 plates, and the recipe on it. Its menu item id. */
async function oatsOnDayOne(k: Awaited<ReturnType<typeof kitchenCamp>>) {
  const plates = await call(
    "set_meal_plan_plates",
    { expectedVersion: 0, days: [{ day: 1, breakfast: 20 }] },
    k.cook.id,
  );
  expect(plates.error).toBeUndefined();
  const added = await call(
    "add_menu_item",
    { day: 1, meal: "breakfast", recipeId: k.recipeId },
    k.cook.id,
  );
  expect(added.error).toBeUndefined();
  return added.data!.id as string;
}

describe("set_meal_plan_plates", () => {
  it("changes only the days given, on the version read, with the page's audit row", async () => {
    const k = await kitchenCamp();
    const { data, error } = await call(
      "set_meal_plan_plates",
      { expectedVersion: 0, days: [{ day: 2, dinner: 30 }] },
      k.cook.id,
    );
    expect(error).toBeUndefined();
    expect(data).toMatchObject({ version: 1 });
    const again = await call(
      "set_meal_plan_plates",
      { expectedVersion: 1, days: [{ day: 1, breakfast: 12 }] },
      k.cook.id,
    );
    expect(again.data).toMatchObject({ version: 2 });
    const days = await h
      .db()
      .select()
      .from(schema.kitchenMealPlanDays)
      .orderBy(schema.kitchenMealPlanDays.day);
    expect(days.map((d) => [d.day, d.breakfast, d.dinner]).slice(0, 3)).toEqual(
      [
        [1, 12, 0],
        [2, 0, 30],
        [3, 0, 0],
      ],
    );
    expect(await auditRows("camp.kitchen_meal_plan.changed")).toHaveLength(2);
  });

  it("refuses an old version, a day off the plan and a member, writing nothing", async () => {
    const k = await kitchenCamp();
    await call(
      "set_meal_plan_plates",
      { expectedVersion: 0, days: [{ day: 1, breakfast: 5 }] },
      k.cook.id,
    );
    expect(
      (
        await call(
          "set_meal_plan_plates",
          { expectedVersion: 0, days: [{ day: 1, breakfast: 9 }] },
          k.boss.id,
        )
      ).error,
    ).toBe(MEAL_PLAN_CHANGED);
    expect(
      (
        await call(
          "set_meal_plan_plates",
          { expectedVersion: 1, days: [{ day: 25, breakfast: 9 }] },
          k.boss.id,
        )
      ).error,
    ).toMatch(/^Day 25 isn't on the meal plan: it has \d+ days on site\.$/);
    expect(
      (
        await call(
          "set_meal_plan_plates",
          { expectedVersion: 1, days: [{ day: 1, breakfast: 9 }] },
          k.plain.id,
        )
      ).error,
    ).toMatch(onThePage(MEAL_PLAN_REFUSAL, "/kitchen/meal-plan"));
    expect(await auditRows("camp.kitchen_meal_plan.changed")).toHaveLength(1);
  });
});

describe("the menu and the snacks", () => {
  it("puts a recipe on a meal and takes it off, with the page's audit rows", async () => {
    const k = await kitchenCamp();
    const itemId = await oatsOnDayOne(k);
    expect(
      (
        await call(
          "add_menu_item",
          { day: 1, meal: "breakfast", recipeId: k.recipeId },
          k.cook.id,
        )
      ).error,
    ).toBe(ALREADY_ON_MEAL);
    const read = await call("get_meal_plan_for_editing", {}, k.cook.id);
    const days = read.data!.days as {
      breakfast: { recipes: { id: string; title: string }[] };
    }[];
    expect(days[0]!.breakfast.recipes).toMatchObject([
      { id: itemId, title: "Oats" },
    ]);
    expect(
      (await call("remove_menu_item", { itemId }, k.cook.id)).error,
    ).toBeUndefined();
    expect(await h.db().select().from(schema.kitchenMenuItems)).toEqual([]);
    expect(await auditRows("camp.kitchen_menu.added")).toHaveLength(1);
    expect(await auditRows("camp.kitchen_menu.removed")).toHaveLength(1);
  });

  it("will not take off a recipe with a prep step, which re-adding would not bring back", async () => {
    const k = await kitchenCamp();
    const itemId = await oatsOnDayOne(k);
    const prep = await call(
      "add_prep_step",
      {
        itemId,
        what: "Buy oats",
        when: "before_leaving",
        date: "2026-04-10",
      },
      k.cook.id,
    );
    expect(prep.error).toBeUndefined();
    expect(prep.data).toMatchObject({
      due: "2026-04-10",
      onTheTaskBoard: true,
    });
    const tasks = await h.db().select().from(schema.tasks);
    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({ team: "kitchen" });
    expect(await auditRows("camp.kitchen_prep.added")).toHaveLength(1);

    const { error } = await call("remove_menu_item", { itemId }, k.cook.id);
    expect(error).toMatch(/^That recipe has prep steps or an allergy plan/);
    expect(await h.db().select().from(schema.kitchenMenuItems)).toHaveLength(1);
  });

  it("adds and takes off a snack; a member is refused in the page's words", async () => {
    const k = await kitchenCamp();
    const added = await call(
      "add_snack",
      { name: "Rusks", amount: "6 packets" },
      k.cook.id,
    );
    expect(added.error).toBeUndefined();
    expect(
      (await call("add_snack", { name: "Biltong" }, k.plain.id)).error,
    ).toMatch(onThePage(SNACK_REFUSAL, "/kitchen/meal-plan"));
    const [row] = await h.db().select().from(schema.kitchenSnacks);
    expect(row).toMatchObject({ name: "Rusks", amount: "6 packets" });
    expect(
      (await call("remove_snack", { snackId: row!.id }, k.cook.id)).error,
    ).toBeUndefined();
    expect(await h.db().select().from(schema.kitchenSnacks)).toEqual([]);
    expect(await auditRows("camp.kitchen_snack.added")).toHaveLength(1);
    expect(await auditRows("camp.kitchen_snack.removed")).toHaveLength(1);
  });
});

describe("allergy plans and corrections", () => {
  it("records a plan on the version read and refuses a second on the same", async () => {
    const k = await kitchenCamp();
    const itemId = await oatsOnDayOne(k);
    const plan = {
      itemId,
      kind: "substitution",
      details: "Gluten-free oats in a separate pot",
      allergens: ["gluten"],
      expectedVersion: 0,
    };
    expect((await call("record_allergen_plan", plan, k.cook.id)).data).toEqual(
      expect.objectContaining({ version: 1 }),
    );
    expect((await call("record_allergen_plan", plan, k.boss.id)).error).toBe(
      PLAN_CHANGED,
    );
    expect(await auditRows("camp.kitchen_allergen_plan.recorded")).toHaveLength(
      1,
    );
  });

  it("corrects a recipe's allergens on the revision read", async () => {
    const k = await kitchenCamp();
    await oatsOnDayOne(k);
    const fix = {
      recipeId: k.recipeId,
      versionId: k.versionId,
      allergens: ["gluten"],
      expectedRevision: 0,
    };
    expect(
      (await call("correct_recipe_allergens", fix, k.cook.id)).data,
    ).toEqual(expect.objectContaining({ revision: 1 }));
    expect((await call("correct_recipe_allergens", fix, k.cook.id)).error).toBe(
      ALLERGENS_CHANGED,
    );
    const read = await call("get_meal_plan_for_editing", {}, k.cook.id);
    const days = read.data!.days as {
      breakfast: {
        recipes: { allergens: string[]; allergenRevision: number }[];
      };
    }[];
    expect(days[0]!.breakfast.recipes[0]).toMatchObject({
      allergens: ["gluten"],
      allergenRevision: 1,
    });
    expect(await auditRows("camp.kitchen_allergens.corrected")).toHaveLength(1);
  });

  it("does not give a member the editors' read", async () => {
    const k = await kitchenCamp();
    expect(
      (await call("get_meal_plan_for_editing", {}, k.plain.id)).error,
    ).toMatch(onThePage(MEAL_PLAN_REFUSAL, "/kitchen/meal-plan"));
  });
});

describe("the shopping list", () => {
  it("lets any member tick a line at the amount read, and refuses a moved amount or an unknown line", async () => {
    const k = await kitchenCamp();
    await oatsOnDayOne(k);
    const read = await call("list_shopping_lines", {}, k.plain.id);
    const lines = read.data!.lines as {
      key: string;
      name: string;
      amount: string;
      price?: unknown;
    }[];
    const oats = lines.find((l) => l.name === "Oats")!;
    expect(oats.price).toBeUndefined();
    expect(
      (
        await call(
          "set_shopping_ticks",
          { lines: [{ key: oats.key, amount: "99 kg" }], ticked: true },
          k.plain.id,
        )
      ).error,
    ).toBe(
      "The amount on that line changed since you read it. Read the list again.",
    );
    expect(
      (
        await call(
          "set_shopping_ticks",
          { lines: [{ key: "nope", amount: oats.amount }], ticked: true },
          k.plain.id,
        )
      ).error,
    ).toBe("That line isn't on the shopping list now. Read the list again.");
    expect(await h.db().select().from(schema.kitchenShoppingTicks)).toEqual([]);
    expect(
      (
        await call(
          "set_shopping_ticks",
          { lines: [{ key: oats.key, amount: oats.amount }], ticked: true },
          k.plain.id,
        )
      ).error,
    ).toBeUndefined();
    const [tick] = await h.db().select().from(schema.kitchenShoppingTicks);
    expect(tick).toMatchObject({
      itemKey: oats.key,
      amount: oats.amount,
      tickedByUserId: k.plain.id,
    });
  });

  it("sets a price on the version read for a Kitchen lead, and refuses a member", async () => {
    const k = await kitchenCamp();
    await oatsOnDayOne(k);
    const read = await call("list_shopping_lines", {}, k.cook.id);
    const oats = (
      read.data!.lines as {
        key: string;
        name: string;
        price: { version: number };
      }[]
    ).find((l) => l.name === "Oats")!;
    expect(oats.price.version).toBe(0);
    const price = {
      key: oats.key,
      shop: "Makro",
      amountCents: 9600,
      kind: "estimate",
      expectedVersion: 0,
    };
    expect((await call("set_shopping_price", price, k.cook.id)).data).toEqual(
      expect.objectContaining({ version: 1 }),
    );
    expect((await call("set_shopping_price", price, k.boss.id)).error).toBe(
      PRICE_CHANGED,
    );
    expect(
      (
        await call(
          "set_shopping_price",
          { ...price, expectedVersion: 1 },
          k.plain.id,
        )
      ).error,
    ).toMatch(onThePage(PRICE_REFUSAL, "/kitchen/shopping"));
    const [row] = await h.db().select().from(schema.kitchenShoppingPrices);
    expect(row).toMatchObject({
      shop: "Makro",
      amountCents: 9600,
      currency: "ZAR",
      version: 1,
    });
    expect(await auditRows("camp.kitchen_price.set")).toHaveLength(1);
  });
});
