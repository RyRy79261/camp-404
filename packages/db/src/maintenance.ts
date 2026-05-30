import { eq } from "drizzle-orm";
import { createPooledDb } from "./index";
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
