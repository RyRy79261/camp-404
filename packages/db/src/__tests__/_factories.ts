import { eq, sql } from "drizzle-orm";
import type { KitchenRecipe } from "@camp404/types";
import type { drizzle } from "drizzle-orm/pglite";
import * as schema from "../schema";

// Row factories for the integration suites. They write directly through the
// drizzle handle (arrange), independent of the production writers under test, so
// a writer's bug can't mask itself by also corrupting the fixtures.

type DB = ReturnType<typeof drizzle<typeof schema>>;

let seq = 0;
const uniq = () => `${++seq}`;

export async function makeUser(
  db: DB,
  overrides: Partial<typeof schema.users.$inferInsert> = {},
): Promise<typeof schema.users.$inferSelect> {
  const n = uniq();
  const [row] = await db
    .insert(schema.users)
    .values({
      authUserId: `auth-${n}`,
      displayName: `User ${n}`,
      rank: "member",
      ...overrides,
    })
    .returning();
  return row!;
}

/**
 * A team membership in one year. `cycle` defaults to 1 — the sentinel every
 * pre-namespace row carries and the value currentCycleNumber() returns on a
 * camp that has not named its founding year — so callers that don't care about
 * the year namespace read exactly as they did before it existed.
 */
export async function makeMembership(
  db: DB,
  input: {
    userId: string;
    team: (typeof schema.teamEnum.enumValues)[number];
    isLead?: boolean;
    cycle?: number;
  },
): Promise<void> {
  await db.insert(schema.teamMemberships).values({
    userId: input.userId,
    team: input.team,
    isLead: input.isLead ?? false,
    cycle: input.cycle ?? 1,
  });
}

/** A driver profile for one member in one year. */
export async function makeDriverProfile(
  db: DB,
  input: {
    userId: string;
    cycle?: number;
    intendsToDrive?: boolean;
    completedAt?: Date | null;
  },
): Promise<void> {
  await db.insert(schema.driverProfiles).values({
    userId: input.userId,
    cycle: input.cycle ?? 1,
    intendsToDrive: input.intendsToDrive ?? true,
    completedAt: input.completedAt ?? null,
    version: "1",
  });
}

/**
 * A seat in a driver's car. The composite FK means the driver must already
 * have a driver_profiles row for the SAME year.
 */
export async function makeCarMember(
  db: DB,
  input: { driverUserId: string; memberUserId: string; cycle?: number },
): Promise<void> {
  await db.insert(schema.carMembers).values({
    driverUserId: input.driverUserId,
    memberUserId: input.memberUserId,
    cycle: input.cycle ?? 1,
  });
}

export async function makeActivation(
  db: DB,
  overrides: Partial<typeof schema.questionnaireActivations.$inferInsert> = {},
): Promise<typeof schema.questionnaireActivations.$inferSelect> {
  const [row] = await db
    .insert(schema.questionnaireActivations)
    .values({
      questionnaireKey: "feedback",
      version: "1",
      title: "Camp feedback",
      scope: "everyone",
      ...overrides,
    })
    .returning();
  return row!;
}

export async function addTarget(
  db: DB,
  activationId: string,
  userId: string,
): Promise<void> {
  await db
    .insert(schema.questionnaireActivationTargets)
    .values({ activationId, userId });
}

/** All required_actions rows for a user (assert helper). */
export async function requiredActionsFor(
  db: DB,
  userId: string,
): Promise<(typeof schema.requiredActions.$inferSelect)[]> {
  return db
    .select()
    .from(schema.requiredActions)
    .where(eq(schema.requiredActions.userId, userId));
}

/**
 * A recipe version in the book, written the way the app's insertVersion does
 * (the version row, its own plate count and the catalogue lines), with the
 * recipe pointed at it as `accepted`. Nothing in the app writes a version by
 * hand any more, so the suites that need one in the book seed it here.
 */
export async function seedAcceptedVersion(
  db: DB,
  input: {
    recipeId: string;
    authorId: string | null;
    recipe: KitchenRecipe;
    reason?: string;
  },
): Promise<{ versionId: string; version: number }> {
  const { recipe } = input;
  const [top] = await db
    .select({ max: sql<number | null>`max(${schema.recipeVersions.version})` })
    .from(schema.recipeVersions)
    .where(eq(schema.recipeVersions.recipeId, input.recipeId));
  const version = (top?.max ?? 0) + 1;
  const [row] = await db
    .insert(schema.recipeVersions)
    .values({
      recipeId: input.recipeId,
      version,
      servingsBasis: recipe.plates,
      body: recipe,
      report: null,
      runId: null,
      reason: input.reason ?? "Seeded",
      authorId: input.authorId,
    })
    .returning({ id: schema.recipeVersions.id });
  await db.insert(schema.recipePlateCounts).values({
    versionId: row!.id,
    plates: recipe.plates,
    lines: recipe.ingredients.map((line) => ({
      name: line.name,
      quantity: line.quantity,
      quantityMax: line.quantityMax,
      unit: line.unit,
      note: null,
    })),
    source: "version",
  });
  for (const line of recipe.ingredients) {
    await db.execute(sql`
      INSERT INTO ingredients (name, category)
      VALUES (${line.name.trim()}, ${line.category})
      ON CONFLICT (lower(name)) DO NOTHING
    `);
  }
  await db
    .update(schema.recipes)
    .set({
      status: "accepted",
      acceptedVersionId: row!.id,
      title: recipe.title,
      updatedAt: new Date(),
    })
    .where(eq(schema.recipes.id, input.recipeId));
  return { versionId: row!.id, version };
}
