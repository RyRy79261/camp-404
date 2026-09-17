import { eq, sql } from "drizzle-orm";
import { createHttpDb, LOCAL_PROXY_HOST, withTransaction } from "./index";
import { neonAuthUsers } from "./neon-auth";
import * as schema from "./schema";

// Helpers for the real-database e2e run (apps/web playwright.db.config.ts).
// Every one refuses unless the process is pointed at the local stack
// (docker-compose.local.yml): wiping or forging rows is never something a
// deployed database may see.

/** Throws unless this process talks to the local stack. */
export function assertLocalE2EDatabase(): void {
  const url = process.env.DATABASE_URL ?? "";
  if (
    process.env.NEON_LOCAL_PROXY !== "1" ||
    !url.includes(`@${LOCAL_PROXY_HOST}`)
  ) {
    throw new Error(
      `Refusing: e2e database helpers run only against the local stack (NEON_LOCAL_PROXY=1, a DATABASE_URL on ${LOCAL_PROXY_HOST}).`,
    );
  }
}

/**
 * Empty every table and start a camp that has finished first-time setup, so
 * /setup does not intercept a spec. The camp has no year yet: a spec that
 * needs one names it through the app, as a captain would.
 */
export async function resetDatabaseForE2E(): Promise<void> {
  assertLocalE2EDatabase();
  await withTransaction(async (tx) => {
    const tables = await tx.execute<{ name: string }>(sql`
      select quote_ident(schemaname) || '.' || quote_ident(tablename) as name
      from pg_tables
      where schemaname in ('public', 'neon_auth')
    `);
    const names = tables.rows.map((row) => row.name);
    if (names.length > 0) {
      await tx.execute(
        sql.raw(`truncate table ${names.join(", ")} restart identity cascade`),
      );
    }
    await tx
      .insert(schema.campSettings)
      .values({ id: true, bootstrappedAt: new Date() });
  });
}

/**
 * The sign-in record Neon Auth would hold for a test login, so reads that join
 * a member's email (the roster, the email drain) find it.
 */
export async function upsertE2EAuthUser(input: {
  id: string;
  email: string | null;
}): Promise<void> {
  assertLocalE2EDatabase();
  await createHttpDb()
    .insert(neonAuthUsers)
    .values({ id: input.id, email: input.email, emailVerified: true })
    .onConflictDoUpdate({
      target: neonAuthUsers.id,
      set: { email: input.email, emailVerified: true },
    });
}

/** Force a member's approval status, as /api/test/set-approval does in the store. */
export async function setApprovalForE2E(
  userId: string,
  status: "pending" | "approved" | "rejected",
  reason: string | null,
): Promise<void> {
  assertLocalE2EDatabase();
  await createHttpDb()
    .update(schema.users)
    .set({ approvalStatus: status, approvalDecisionReason: reason })
    .where(eq(schema.users.id, userId));
}
