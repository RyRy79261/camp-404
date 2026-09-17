import { eq, sql } from "drizzle-orm";
import { createHttpDb, withTransaction } from "./index";
import * as schema from "./schema";

// The two database reads and writes the admin CLI's seed and wipe need
// (apps/admin-cli/src/seed.ts). Every other seeded row goes through the app's
// own writers. The CLI refuses a database with real people before it calls
// wipeAllPublicTables; this module does not check again.

/** Non-system people, and how many of them are not seeded (authUserId prefix). */
export async function countPeople(
  seedPrefix: string,
): Promise<{ all: number; real: number }> {
  const [row] = await createHttpDb()
    .select({
      all: sql<number>`count(*)::int`,
      real: sql<number>`count(*) filter (where ${schema.users.authUserId} not like ${`${seedPrefix}%`})::int`,
    })
    .from(schema.users)
    .where(eq(schema.users.isSystem, false));
  return { all: row?.all ?? 0, real: row?.real ?? 0 };
}

/** Empty every table in the public schema. Migrations (schema "drizzle") stay. */
export async function wipeAllPublicTables(): Promise<void> {
  await withTransaction(async (tx) => {
    const tables = await tx.execute<{ name: string }>(sql`
      select quote_ident(tablename) as name from pg_tables where schemaname = 'public'
    `);
    const names = tables.rows.map((row) => row.name);
    if (names.length > 0) {
      await tx.execute(
        sql.raw(`truncate table ${names.join(", ")} restart identity cascade`),
      );
    }
  });
}
