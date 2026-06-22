import { eq } from "drizzle-orm";
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

export async function makeMembership(
  db: DB,
  input: {
    userId: string;
    team: (typeof schema.teamEnum.enumValues)[number];
    isLead?: boolean;
  },
): Promise<void> {
  await db.insert(schema.teamMemberships).values({
    userId: input.userId,
    team: input.team,
    isLead: input.isLead ?? false,
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
