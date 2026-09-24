import { readFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { KitchenRecipe, SourceDoc } from "@camp404/types";
import * as schema from "../schema";
import { makeUser } from "./_factories";
import { useTestDb } from "./_harness";

// 0055 maps the stored recipe statuses onto the new lifecycle (#243), and 0056
// (generated) rebuilds the recipe_status type, adds every Kitchen table and
// column (the meal plan's too) and makes recipes.submitter_id nullable. The harness has applied both to an
// empty database, so each test first puts the database back the way
// production has it (the old type, no new tables or columns), stores one
// recipe per old status, and then runs both migrations' own SQL again. All of
// that happens inside a transaction that is rolled back, so a failing test
// leaves the migrated database for the next one.

function migration(name: string): string[] {
  return readFileSync(
    new URL(`../../migrations/${name}.sql`, import.meta.url),
    "utf8",
  )
    .split("--> statement-breakpoint")
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);
}

const TO_TEXT = migration("0055_recipe_status_to_text");
const KITCHEN = migration("0056_recipe_kitchen");

const LEGACY_STATUSES = [
  "pending",
  "analysing",
  "ready",
  "scheduled",
  "rejected",
] as const;

const ADDED_RECIPE_COLUMNS = [
  "title",
  "suitability_note",
  "text_author_id",
  "ai_consent_at",
  "approved_by",
  "approved_at",
  "rejected_by",
  "rejected_at",
  "rejection_reason",
  "changes_note",
  "queued_by",
  "queued_at",
  "last_error",
  "rerun_request",
  "rerun_requested_by",
  "rerun_requested_at",
  "latest_run_id",
  "accepted_version_id",
];

/** The Postgres error code, wherever drizzle nested it. */
function sqlState(err: unknown): string | undefined {
  let current: unknown = err;
  while (current && typeof current === "object") {
    const code = (current as { code?: unknown }).code;
    if (typeof code === "string") return code;
    current = (current as { cause?: unknown }).cause;
  }
  return undefined;
}

describe("0055_recipe_status_to_text and 0056_recipe_kitchen", () => {
  const h = useTestDb();

  async function run(statements: string[]) {
    for (const statement of statements) await h.client().exec(statement);
  }

  /** Runs `body` on the legacy database, then undoes everything it did. */
  async function onLegacyDb(body: () => Promise<void>) {
    await h.client().exec("BEGIN");
    try {
      await toLegacy();
      await body();
    } finally {
      await h.client().exec("ROLLBACK");
    }
  }

  /** The database as it was before #243. Safe to run from either state. */
  async function toLegacy() {
    await h.client().exec(`
      DROP TABLE IF EXISTS "recipe_plate_counts", "recipe_version_ingredients",
        "recipe_versions", "recipe_proofread_runs", "recipe_sources",
        "recipe_lessons", "ingredients", "kitchen_meal_plan_days",
        "kitchen_meal_plans" CASCADE;
      ${ADDED_RECIPE_COLUMNS.map(
        (c) => `ALTER TABLE "recipes" DROP COLUMN IF EXISTS "${c}";`,
      ).join("\n")}
      DROP TYPE IF EXISTS "recipe_run_outcome", "recipe_unit",
        "recipe_scaling_class", "ingredient_keeping_class";
      ALTER TABLE "recipes" ALTER COLUMN "status" DROP DEFAULT;
      ALTER TABLE "recipes" ALTER COLUMN "status" SET DATA TYPE text;
      DROP TYPE IF EXISTS "recipe_status";
      CREATE TYPE "recipe_status" AS ENUM('pending', 'analysing', 'ready', 'scheduled', 'rejected');
      ALTER TABLE "recipes" ALTER COLUMN "status"
        SET DATA TYPE "recipe_status" USING "status"::"recipe_status";
      ALTER TABLE "recipes" ALTER COLUMN "status" SET DEFAULT 'pending';
      ALTER TABLE "recipes" ALTER COLUMN "submitter_id" SET NOT NULL;
    `);
  }

  /** One recipe per old status, written the way the old code wrote them. */
  async function storeLegacyRecipes(submitterId: string) {
    for (const status of LEGACY_STATUSES) {
      await h.client().query(
        `INSERT INTO "recipes" ("submitter_id", "source", "status", "raw_text")
         VALUES ($1, 'text', $2, $3)`,
        [submitterId, status, `was ${status}`],
      );
    }
  }

  async function statusesByText() {
    const res = await h.client().query<{
      raw_text: string;
      status: string;
    }>(`SELECT "raw_text", "status"::text AS "status" FROM "recipes" ORDER BY "raw_text"`);
    return Object.fromEntries(res.rows.map((r) => [r.raw_text, r.status]));
  }

  it("maps every old status onto the new lifecycle, and a second run of 0055 changes nothing", () =>
    onLegacyDb(async () => {
      const user = await makeUser(h.db());
      await storeLegacyRecipes(user.id);

      await run(TO_TEXT);
      const once = await statusesByText();
      await run(TO_TEXT);
      expect(await statusesByText()).toEqual(once);

      await run(KITCHEN);

      expect(await statusesByText()).toEqual({
        "was analysing": "approved",
        "was pending": "suggested",
        "was ready": "approved",
        "was rejected": "rejected",
        "was scheduled": "approved",
      });

      // The column is the new enum again, with the new default.
      const [fresh] = await h
        .db()
        .insert(schema.recipes)
        .values({ submitterId: user.id, source: "text", title: "Dhal" })
        .returning();
      expect(fresh!.status).toBe("suggested");
      const err = await h
        .client()
        .query(`UPDATE "recipes" SET "status" = 'pending'`)
        .catch((e: unknown) => e);
      expect(sqlState(err)).toBe("22P02");
    }));

  it("cannot rebuild the type without 0055 first, because an old status has no place in it", () =>
    onLegacyDb(async () => {
      const user = await makeUser(h.db());
      await storeLegacyRecipes(user.id);

      await h.client().exec("SAVEPOINT without_0055");
      const err = await run(KITCHEN).catch((e: unknown) => e);
      await h.client().exec("ROLLBACK TO SAVEPOINT without_0055");
      expect(sqlState(err)).toBe("22P02");
    }));

  it("keeps a recipe whose submitter row is deleted, with no submitter", () =>
    onLegacyDb(async () => {
      const user = await makeUser(h.db());
      await storeLegacyRecipes(user.id);
      await run(TO_TEXT);
      await run(KITCHEN);

      await h.db().delete(schema.users).where(eq(schema.users.id, user.id));

      const rows = await h.db().select().from(schema.recipes);
      expect(rows).toHaveLength(LEGACY_STATUSES.length);
      expect(rows.every((r) => r.submitterId === null)).toBe(true);

      await h
        .db()
        .insert(schema.recipes)
        .values({ submitterId: null, source: "url", title: "Found online" });
      expect(await h.db().select().from(schema.recipes)).toHaveLength(
        LEGACY_STATUSES.length + 1,
      );
    }));

  it("adds no Kitchen setting to camp_settings: no pot, no burners, no daily cap, no plates", async () => {
    const columns = await h.client().query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name = 'camp_settings'
         AND (column_name LIKE 'kitchen_%' OR column_name LIKE 'recipe_%')
       ORDER BY column_name`,
    );
    expect(columns.rows.map((r) => r.column_name)).toEqual([]);
  });

  it("matches ingredient names without regard to case", async () => {
    await h
      .db()
      .insert(schema.ingredients)
      .values({ name: "Nutritional yeast" });
    const err = await h
      .db()
      .insert(schema.ingredients)
      .values({ name: "nutritional YEAST" })
      .catch((e: unknown) => e);
    expect(sqlState(err)).toBe("23505");
  });
});

// 0056 (generated) adds recipe_versions.body and the plate-count table next
// to the first draft's recipe_version_ingredients; 0057 (custom) converts any
// version written without a body, from its method and ingredient rows, into a
// body in Noble Notations' shape and gives each its own plate-count row. Each
// test stores such versions inside a transaction that is rolled back.
describe("0057_recipe_versions_body", () => {
  const h = useTestDb();
  const CONVERT = migration("0057_recipe_versions_body");

  async function run(statements: string[]) {
    for (const statement of statements) await h.client().exec(statement);
  }

  async function inRolledBackTx(body: () => Promise<void>) {
    await h.client().exec("BEGIN");
    try {
      await body();
    } finally {
      await h.client().exec("ROLLBACK");
    }
  }

  /** A first-draft recipe with two versions, written the way the old code did. */
  async function storeLegacyVersions(authorId: string) {
    const recipe = await h.client().query<{ id: string }>(
      `INSERT INTO "recipes" ("submitter_id", "source", "status", "title")
       VALUES ($1, 'text', 'accepted', 'Camp dal') RETURNING "id"`,
      [authorId],
    );
    const recipeId = recipe.rows[0]!.id;
    const version = async (n: number, method: string | null) =>
      (
        await h.client().query<{ id: string }>(
          `INSERT INTO "recipe_versions"
             ("recipe_id", "version", "servings_basis", "method", "report", "author_id")
           VALUES ($1, $2, 4, $3, $4, $5) RETURNING "id"`,
          [
            recipeId,
            n,
            method,
            JSON.stringify({
              changed: ["Cups to grams."],
              unsure: [],
              batchLimits: { maxServingsPerBatch: 40, basis: "A 50 L pot." },
            }),
            authorId,
          ],
        )
      ).rows[0]!.id;
    const first = await version(
      1,
      "1. Rinse the lentils.\n\n2. Simmer in the coconut milk, 20 minutes.\r\n",
    );
    const second = await version(2, null);

    const ingredient = async (name: string, category: string | null) =>
      (
        await h.client().query<{
          id: string;
        }>(`INSERT INTO "ingredients" ("name", "category") VALUES ($1, $2) RETURNING "id"`, [name, category])
      ).rows[0]!.id;
    const lentils = await ingredient("Red lentils", null);
    const coconut = await ingredient("Coconut milk", "liquid");
    const bay = await ingredient("Bay leaf", "leafy things");
    const line = (
      versionId: string,
      ingredientId: string,
      position: number,
      perServing: number,
      unit: string,
      extra: { prep?: string; conversion?: string } = {},
    ) =>
      h.client().query(
        `INSERT INTO "recipe_version_ingredients"
           ("version_id", "ingredient_id", "position", "quantity_per_serving",
            "unit", "scaling_class", "prep_note", "conversion_note")
         VALUES ($1, $2, $3, $4, $5, 'linear', $6, $7)`,
        [
          versionId,
          ingredientId,
          position,
          perServing,
          unit,
          extra.prep ?? null,
          extra.conversion ?? null,
        ],
      );
    await line(first, lentils, 0, 62.5, "g", { prep: "rinsed" });
    await line(first, coconut, 1, 100, "ml", {
      conversion: "1 tin (400 ml) serves 4",
    });
    await line(first, bay, 2, 0.25, "each");
    await line(first, lentils, 3, 10, "g");
    await line(second, coconut, 0, 100, "ml");
    return { first, second };
  }

  async function bodies() {
    const res = await h.client().query<{
      id: string;
      body: unknown;
    }>(`SELECT "id", "body" FROM "recipe_versions" ORDER BY "version"`);
    return res.rows;
  }

  async function plateRows() {
    const res = await h.client().query<{
      version_id: string;
      plates: number;
      lines: unknown;
      source: string;
    }>(`SELECT "version_id", "plates", "lines", "source" FROM "recipe_plate_counts" ORDER BY "version_id"`);
    return res.rows;
  }

  it("turns each first-draft version into a valid body with its own plate count, once", () =>
    inRolledBackTx(async () => {
      const user = await makeUser(h.db());
      const { first, second } = await storeLegacyVersions(user.id);

      await run(CONVERT);

      const [one, two] = await bodies();
      const parsedOne = KitchenRecipe.safeParse(one!.body);
      expect(parsedOne.error?.issues ?? []).toEqual([]);
      const recipe = parsedOne.data!;
      expect(recipe.title).toBe("Camp dal");
      expect(recipe.plates).toBe(4);
      expect(recipe.ingredients).toEqual([
        {
          component: null,
          name: "Red lentils",
          category: "other",
          quantity: 250,
          quantityMax: null,
          unit: "g",
          preparation: "rinsed",
          note: null,
          optional: false,
        },
        {
          component: null,
          name: "Coconut milk",
          category: "liquid",
          quantity: 400,
          quantityMax: null,
          unit: "ml",
          preparation: null,
          note: "1 tin (400 ml) serves 4",
          optional: false,
        },
        {
          component: null,
          name: "Bay leaf",
          category: "other",
          quantity: 1,
          quantityMax: null,
          unit: "piece",
          preparation: null,
          note: null,
          optional: false,
        },
        {
          component: "Part 2",
          name: "Red lentils",
          category: "other",
          quantity: 40,
          quantityMax: null,
          unit: "g",
          preparation: null,
          note: null,
          optional: false,
        },
      ]);
      expect(recipe.steps.map((s) => s.instruction)).toEqual([
        "Rinse the lentils.",
        "Simmer in the coconut milk, 20 minutes.",
      ]);
      expect(recipe.notes).toEqual([]);

      const parsedTwo = KitchenRecipe.safeParse(two!.body);
      expect(parsedTwo.success).toBe(true);
      expect(parsedTwo.data!.steps.map((s) => s.instruction)).toEqual([
        "See the original recipe.",
      ]);

      const plates = await plateRows();
      expect(plates).toHaveLength(2);
      const own = plates.find((p) => p.version_id === first)!;
      expect(own.plates).toBe(4);
      expect(own.source).toBe("version");
      const lines = own.lines as { name: string; quantity: number }[];
      expect(lines.map((l) => [l.name, l.quantity])).toEqual([
        ["Red lentils", 250],
        ["Coconut milk", 400],
        ["Bay leaf", 1],
        ["Red lentils", 40],
      ]);
      expect(plates.some((p) => p.version_id === second)).toBe(true);

      // A second run finds nothing to do: no body changes, no duplicate rows.
      const before = await bodies();
      await run(CONVERT);
      expect(await bodies()).toEqual(before);
      expect(await plateRows()).toHaveLength(2);
    }));

  it("leaves a version that already has a body alone", () =>
    inRolledBackTx(async () => {
      const user = await makeUser(h.db());
      const { first } = await storeLegacyVersions(user.id);
      await h
        .client()
        .query(`UPDATE "recipe_versions" SET "body" = $1 WHERE "id" = $2`, [
          JSON.stringify({
            title: "Written since",
            plates: 12,
            ingredients: [{ name: "Rice", category: "grain" }],
            steps: [{ instruction: "Cook it." }],
          }),
          first,
        ]);
      await run(CONVERT);
      const [one] = await bodies();
      expect((one!.body as { title: string }).title).toBe("Written since");
      const own = (await plateRows()).find((p) => p.version_id === first)!;
      expect(own.plates).toBe(12);
    }));
});

// 0058 (custom) gives every recipe with pasted text version 1 of its source,
// all of it in Steps, one paragraph per non-blank line. The harness has
// applied it to an empty database, so each test stores recipes the way the
// app wrote them before the source editor and runs the migration's SQL again.
describe("0058_recipe_sources_seed", () => {
  const h = useTestDb();
  const SEED = migration("0058_recipe_sources_seed");
  const EMPTY = { type: "doc", content: [{ type: "paragraph" }] };

  async function run(statements: string[]) {
    for (const statement of statements) await h.client().exec(statement);
  }

  async function storeRecipe(
    authorId: string | null,
    rawText: string | null,
  ): Promise<string> {
    const res = await h.client().query<{ id: string }>(
      `INSERT INTO "recipes" ("submitter_id", "source", "status", "title", "raw_text", "text_author_id")
       VALUES ($1, 'text', 'approved', 'Camp dal', $2, $1) RETURNING "id"`,
      [authorId, rawText],
    );
    return res.rows[0]!.id;
  }

  async function sources() {
    const res = await h.client().query<{
      recipe_id: string;
      version: number;
      serves: number | null;
      ingredients: unknown;
      equipment: unknown;
      steps: unknown;
      notes: unknown;
      author_id: string | null;
    }>(
      `SELECT "recipe_id", "version", "serves", "ingredients", "equipment", "steps", "notes", "author_id"
       FROM "recipe_sources" ORDER BY "recipe_id", "version"`,
    );
    return res.rows;
  }

  it("seeds version 1 from the pasted text, all in Steps, and a second run adds nothing", async () => {
    const user = await makeUser(h.db());
    const legacy = await storeRecipe(
      user.id,
      "Camp dal\r\n\n  2 cups red lentils  \n\t\nSimmer 20 minutes.\n",
    );
    const blank = await storeRecipe(user.id, " \n\t ");
    const none = await storeRecipe(user.id, null);

    await run(SEED);
    await run(SEED);

    const rows = await sources();
    expect(rows).toHaveLength(1);
    const [row] = rows;
    expect(row).toMatchObject({
      recipe_id: legacy,
      version: 1,
      serves: null,
      ingredients: EMPTY,
      equipment: EMPTY,
      notes: EMPTY,
      author_id: user.id,
    });
    const steps = SourceDoc.safeParse(row!.steps);
    expect(steps.error?.issues ?? []).toEqual([]);
    expect(steps.data).toEqual({
      type: "doc",
      content: ["Camp dal", "2 cups red lentils", "Simmer 20 minutes."].map(
        (text) => ({ type: "paragraph", content: [{ type: "text", text }] }),
      ),
    });
    for (const doc of [row!.ingredients, row!.equipment, row!.notes]) {
      expect(SourceDoc.safeParse(doc).success).toBe(true);
    }
    expect(
      rows.some((r) => r.recipe_id === blank || r.recipe_id === none),
    ).toBe(false);
  });

  it("skips a recipe that already has a source", async () => {
    const user = await makeUser(h.db());
    const edited = await storeRecipe(user.id, "Old pasted text");
    await h
      .db()
      .insert(schema.recipeSources)
      .values({
        recipeId: edited,
        version: 2,
        serves: 4,
        ingredients: EMPTY as SourceDoc,
        equipment: EMPTY as SourceDoc,
        steps: {
          type: "doc",
          content: [
            { type: "paragraph", content: [{ type: "text", text: "Edited" }] },
          ],
        },
        notes: EMPTY as SourceDoc,
        authorId: user.id,
      });
    await run(SEED);
    const rows = await sources();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ version: 2, serves: 4 });
  });

  it("keeps the author unknown when the text had none, so it stays refused", async () => {
    const user = await makeUser(h.db());
    const id = await storeRecipe(user.id, "Pasted before #243");
    await h
      .client()
      .query(`UPDATE "recipes" SET "text_author_id" = NULL WHERE "id" = $1`, [
        id,
      ]);
    await run(SEED);
    const [row] = await sources();
    expect(row).toMatchObject({ recipe_id: id, author_id: null });
    const [recipe] = await h
      .db()
      .select({ id: schema.recipes.id })
      .from(schema.recipes)
      .where(eq(schema.recipes.id, id));
    expect(recipe?.id).toBe(id);
  });
});
