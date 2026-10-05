import { eq, isNotNull, sql } from "drizzle-orm";
import { createHttpDb, withTransaction } from "./index";
import * as schema from "./schema";
import { encrypt } from "./crypto";
import { ID_NUMBER_KEY, splitIdNumber, idColumnsFor } from "./id-documents";

// Data upkeep that runs on its own, once a day on a member's page load
// (apps/web/lib/background-work.ts). Nothing here needs a person to run it.

/**
 * Move any plaintext government ID number still sitting in
 * `burner_profiles.responses` into the encrypted `users` columns, and strip it
 * from `responses`.
 *
 * Idempotent: only rows that still hold an `id.number` are touched, so a run
 * with nothing to do reads one short list. Each row is locked and re-read in
 * its own transaction, so a member saving their profile at the same moment is
 * never overwritten with a stale copy. When the member already has an
 * encrypted ID, that value is newer than the leftover plaintext: the plaintext
 * is stripped and the encrypted value is kept.
 *
 * Needs `PGCRYPTO_KEY` only when there is something to encrypt.
 */
export async function backfillIdEncryption(): Promise<{
  scanned: number;
  migrated: number;
  stripped: number;
}> {
  const candidates = await createHttpDb()
    .select({ userId: schema.burnerProfiles.userId })
    .from(schema.burnerProfiles)
    .where(
      sql`${schema.burnerProfiles.responses} ->> ${ID_NUMBER_KEY} IS NOT NULL`,
    );

  let migrated = 0;
  let stripped = 0;
  for (const { userId } of candidates) {
    const outcome = await encryptLeftoverIdNumber(userId);
    if (outcome === "migrated") migrated++;
    if (outcome === "stripped") stripped++;
  }
  return { scanned: candidates.length, migrated, stripped };
}

/**
 * One member's share of backfillIdEncryption, in its own transaction: an ID
 * number still in their burner profile answers goes to the encrypted column
 * when that is empty, and leaves the answers either way. "none" when there
 * was nothing to do. Throws when encryption is not set up (PGCRYPTO_KEY),
 * having written nothing.
 */
export async function encryptLeftoverIdNumber(
  userId: string,
): Promise<"migrated" | "stripped" | "none"> {
  return withTransaction(async (tx) => {
    const [row] = await tx
      .select({
        responses: schema.burnerProfiles.responses,
        passportEncrypted: schema.users.passportEncrypted,
        saIdEncrypted: schema.users.saIdEncrypted,
      })
      .from(schema.burnerProfiles)
      .innerJoin(
        schema.users,
        eq(schema.users.id, schema.burnerProfiles.userId),
      )
      .where(eq(schema.burnerProfiles.userId, userId))
      .for("update");
    if (!row) return "none" as const;
    const responses = (row.responses as Record<string, unknown>) ?? {};
    if (!(ID_NUMBER_KEY in responses)) return "none" as const;

    const { cleaned, idType, idNumber } = splitIdNumber(responses);
    const hasEncrypted =
      row.passportEncrypted !== null || row.saIdEncrypted !== null;
    if (idNumber && !hasEncrypted) {
      await tx
        .update(schema.users)
        .set({
          ...idColumnsFor(idType, encrypt(idNumber)),
          updatedAt: new Date(),
        })
        .where(eq(schema.users.id, userId));
    }
    await tx
      .update(schema.burnerProfiles)
      .set({ responses: cleaned, updatedAt: new Date() })
      .where(eq(schema.burnerProfiles.userId, userId));
    return idNumber && !hasEncrypted
      ? ("migrated" as const)
      : ("stripped" as const);
  });
}

/**
 * The sign-in (Better Auth) ids of every account that still has a camp row. Erasure
 * rewrites `auth_user_id` to `deleted:<id>`, so an erased member is not here.
 */
export async function listLiveAuthUserIds(): Promise<Set<string>> {
  const rows = await createHttpDb()
    .select({ authUserId: schema.users.authUserId })
    .from(schema.users)
    .where(isNotNull(schema.users.authUserId));
  return new Set(
    rows
      .map((r) => r.authUserId)
      .filter((id): id is string => !!id && !id.startsWith("deleted:")),
  );
}
