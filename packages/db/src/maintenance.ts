import { and, eq } from "drizzle-orm";
import { createHttpDb, createPooledDb } from "./index";
import * as schema from "./schema";
import { encrypt } from "./crypto";
import { splitIdNumber, idColumnsFor } from "./id-documents";

/**
 * Idempotent backfill: move any plaintext government ID number still sitting in
 * `burner_profiles.responses` into the encrypted `users` columns, then strip it
 * from `responses`. Safe to re-run — rows whose responses no longer carry an
 * `id.number` are skipped. Each row is migrated in its own transaction, so a
 * mid-run failure never leaves a row half-migrated. Uses the pooled
 * (transactional) WebSocket driver and requires `PGCRYPTO_KEY` + `DATABASE_URL`.
 */
export async function backfillIdEncryption(): Promise<{
  scanned: number;
  migrated: number;
}> {
  const { db, pool } = createPooledDb();
  let scanned = 0;
  let migrated = 0;
  try {
    const profiles = await db.select().from(schema.burnerProfiles);
    for (const p of profiles) {
      scanned++;
      const { cleaned, idType, idNumber } = splitIdNumber(
        (p.responses as Record<string, unknown>) ?? {},
      );
      if (!idNumber) continue; // already migrated / nothing to do — idempotent
      await db.transaction(async (tx) => {
        await tx
          .update(schema.users)
          .set({
            ...idColumnsFor(idType, encrypt(idNumber)),
            updatedAt: new Date(),
          })
          .where(eq(schema.users.id, p.userId));
        await tx
          .update(schema.burnerProfiles)
          .set({ responses: cleaned, updatedAt: new Date() })
          .where(eq(schema.burnerProfiles.userId, p.userId));
      });
      migrated++;
    }
    return { scanned, migrated };
  } finally {
    await pool.end();
  }
}

/**
 * Idempotent backfill: give every real member who predates signup seeding a
 * `burner_profile` required action, so the required_actions gate covers them
 * and the `completedAt` fallback can go. A member whose profile is already
 * complete gets a COMPLETED row stamped with that time, never a pending one,
 * or finished members would be sent back to onboarding. Everyone else gets a
 * pending row with no version, so any completion satisfies it. The system
 * account and erased accounts are skipped. A member who already has the row
 * keeps it untouched (ON CONFLICT on required_actions_user_action_idx).
 */
export async function backfillBurnerProfileActions(): Promise<{
  scanned: number;
  seededPending: number;
  seededCompleted: number;
}> {
  const db = createHttpDb();
  const members = await db
    .select({
      userId: schema.users.id,
      completedAt: schema.burnerProfiles.completedAt,
    })
    .from(schema.users)
    .leftJoin(
      schema.burnerProfiles,
      eq(schema.burnerProfiles.userId, schema.users.id),
    )
    .where(
      and(eq(schema.users.isSystem, false), eq(schema.users.sanitised, false)),
    );
  if (members.length === 0) {
    return { scanned: 0, seededPending: 0, seededCompleted: 0 };
  }
  const seeded = await db
    .insert(schema.requiredActions)
    .values(
      members.map((m) => ({
        userId: m.userId,
        type: "questionnaire" as const,
        actionKey: "burner_profile",
        title: "Complete your burner profile",
        status: m.completedAt ? ("completed" as const) : ("pending" as const),
        completedAt: m.completedAt,
      })),
    )
    .onConflictDoNothing({
      target: [schema.requiredActions.userId, schema.requiredActions.actionKey],
    })
    .returning({ status: schema.requiredActions.status });
  return {
    scanned: members.length,
    seededPending: seeded.filter((r) => r.status === "pending").length,
    seededCompleted: seeded.filter((r) => r.status === "completed").length,
  };
}
