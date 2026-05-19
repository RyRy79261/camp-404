import { eq, sql } from "drizzle-orm";
import { createHttpDb } from "./index";
import * as schema from "./schema";

export async function findUserByStackId(stackUserId: string) {
  const db = createHttpDb();
  const rows = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.stackUserId, stackUserId))
    .limit(1);
  return rows[0] ?? null;
}

export async function createUserFromStack(input: {
  stackUserId: string;
  displayName: string | null;
  inviteCode: string | null;
}) {
  const db = createHttpDb();
  const [created] = await db
    .insert(schema.users)
    .values({
      stackUserId: input.stackUserId,
      displayName: input.displayName,
      inviteCode: input.inviteCode,
    })
    .returning();
  if (!created) throw new Error("Failed to insert camp user row");
  return created;
}

export async function setUserInviteCode(userId: string, code: string) {
  const db = createHttpDb();
  await db
    .update(schema.users)
    .set({ inviteCode: code, updatedAt: new Date() })
    .where(eq(schema.users.id, userId));
}

export async function getBurnerProfileByUserId(userId: string) {
  const db = createHttpDb();
  const rows = await db
    .select()
    .from(schema.burnerProfiles)
    .where(eq(schema.burnerProfiles.userId, userId))
    .limit(1);
  return rows[0] ?? null;
}

export async function upsertBurnerProfile(input: {
  userId: string;
  version: string;
  responses: Record<string, unknown>;
  markComplete: boolean;
}) {
  const db = createHttpDb();
  const now = new Date();
  await db
    .insert(schema.burnerProfiles)
    .values({
      userId: input.userId,
      version: input.version,
      responses: input.responses,
      completedAt: input.markComplete ? now : null,
    })
    .onConflictDoUpdate({
      target: schema.burnerProfiles.userId,
      set: {
        version: input.version,
        responses: input.responses,
        updatedAt: now,
        completedAt: input.markComplete
          ? now
          : sql`${schema.burnerProfiles.completedAt}`,
      },
    });
}
