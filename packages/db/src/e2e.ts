import { and, eq, ne, sql } from "drizzle-orm";
import type { ParticipationStatus } from "@camp404/types";
import { currentCycleNumber } from "./cycles";
import { createHttpDb, LOCAL_PROXY_HOST, withTransaction } from "./index";
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
      where schemaname = 'public'
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
 * The sign-in identity a test login stands for, so reads that join a member's
 * email (the roster, the email drain) find it. An email names one identity
 * (`user.email` is unique), so a login that reuses an address takes it over,
 * as the newest sign-up for that address would. A login with no email has no
 * identity row, and every email join reads null for it.
 */
export async function upsertE2EAuthUser(input: {
  id: string;
  email: string | null;
}): Promise<void> {
  assertLocalE2EDatabase();
  const email = input.email?.trim().toLowerCase() || null;
  await withTransaction(async (tx) => {
    if (!email) {
      await tx.delete(schema.user).where(eq(schema.user.id, input.id));
      return;
    }
    await tx
      .delete(schema.user)
      .where(and(eq(schema.user.email, email), ne(schema.user.id, input.id)));
    await tx
      .insert(schema.user)
      .values({ id: input.id, name: email, email, emailVerified: true })
      .onConflictDoUpdate({
        target: schema.user.id,
        set: { email, emailVerified: true },
      });
  });
}

/** Force a member's approval status, as /api/test/set-approval does in the store. */
/**
 * Put a member at any attendance status for the camp's current year, replacing
 * what is there. A fixture: no production path sets a status directly.
 */
export async function seedParticipationForE2E(
  userId: string,
  status: ParticipationStatus,
): Promise<void> {
  assertLocalE2EDatabase();
  const cycle = await currentCycleNumber();
  await createHttpDb()
    .insert(schema.campParticipations)
    .values({ userId, cycle, status })
    .onConflictDoUpdate({
      target: [
        schema.campParticipations.userId,
        schema.campParticipations.cycle,
      ],
      set: { status, updatedAt: new Date() },
    });
}

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
