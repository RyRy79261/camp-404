import { eq, sql } from "drizzle-orm";
import { createHttpDb } from "./index";
import * as schema from "./schema";

export async function findUserByAuthId(authUserId: string) {
  const db = createHttpDb();
  const rows = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.authUserId, authUserId))
    .limit(1);
  return rows[0] ?? null;
}

export async function findUserById(userId: string) {
  const db = createHttpDb();
  const rows = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1);
  return rows[0] ?? null;
}

export async function createCampUser(input: {
  authUserId: string;
  displayName: string | null;
  inviteCode: string | null;
  rank?: "captain" | "member";
  approvalStatus?: "pending" | "approved" | "rejected";
}) {
  const db = createHttpDb();
  const [created] = await db
    .insert(schema.users)
    .values({
      authUserId: input.authUserId,
      displayName: input.displayName,
      inviteCode: input.inviteCode,
      ...(input.rank ? { rank: input.rank } : {}),
      ...(input.approvalStatus
        ? { approvalStatus: input.approvalStatus }
        : {}),
    })
    .returning();
  if (!created) throw new Error("Failed to insert camp user row");
  return created;
}

/**
 * Set a member's approval status without a deciding captain — used to drop a
 * redeemer into the `pending` queue at signup. Captain decisions go through
 * {@link setUserApproval}, which also records who decided.
 */
export async function setUserApprovalStatus(
  userId: string,
  status: "pending" | "approved" | "rejected",
) {
  const db = createHttpDb();
  await db
    .update(schema.users)
    .set({ approvalStatus: status, updatedAt: new Date() })
    .where(eq(schema.users.id, userId));
}

/**
 * Record a captain's vetting decision on a pending member. Stamps who
 * decided and when for the camp-management audit trail.
 */
export async function setUserApproval(input: {
  userId: string;
  status: "approved" | "rejected";
  decidedByUserId: string;
}) {
  const db = createHttpDb();
  await db
    .update(schema.users)
    .set({
      approvalStatus: input.status,
      approvalDecidedByUserId: input.decidedByUserId,
      approvalDecidedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(schema.users.id, input.userId));
}

export async function setUserInviteCode(userId: string, code: string) {
  const db = createHttpDb();
  await db
    .update(schema.users)
    .set({ inviteCode: code, updatedAt: new Date() })
    .where(eq(schema.users.id, userId));
}

export async function setUserRank(userId: string, rank: "captain" | "member") {
  const db = createHttpDb();
  await db
    .update(schema.users)
    .set({ rank, updatedAt: new Date() })
    .where(eq(schema.users.id, userId));
}

export async function setUserProfileImage(
  userId: string,
  profileImageUrl: string | null,
) {
  const db = createHttpDb();
  await db
    .update(schema.users)
    .set({ profileImageUrl, updatedAt: new Date() })
    .where(eq(schema.users.id, userId));
}

export async function setUserDisplayName(
  userId: string,
  displayName: string | null,
) {
  const db = createHttpDb();
  await db
    .update(schema.users)
    .set({ displayName, updatedAt: new Date() })
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
        // Preserve the ORIGINAL completion timestamp on replay (OD10): stamp
        // `now` only when it was never completed; otherwise keep the existing
        // value so completedAt doesn't drift to the most-recent edit.
        completedAt: input.markComplete
          ? sql`coalesce(${schema.burnerProfiles.completedAt}, ${now})`
          : sql`${schema.burnerProfiles.completedAt}`,
      },
    });
}

/** Raw text read of the two ID-number ciphertext columns (no decrypt). */
export async function getIdDocumentColumns(userId: string) {
  const db = createHttpDb();
  const rows = await db
    .select({
      passportEncrypted: schema.users.passportEncrypted,
      saIdEncrypted: schema.users.saIdEncrypted,
    })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1);
  return rows[0] ?? null;
}

/** Raw text write of the two ID-number ciphertext columns. */
export async function setIdDocumentColumns(
  userId: string,
  cols: { passportEncrypted: string | null; saIdEncrypted: string | null },
) {
  const db = createHttpDb();
  await db
    .update(schema.users)
    .set({ ...cols, updatedAt: new Date() })
    .where(eq(schema.users.id, userId));
}
