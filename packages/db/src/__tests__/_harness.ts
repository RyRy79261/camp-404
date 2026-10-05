import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterAll, afterEach, beforeAll, inject } from "vitest";
import type {} from "./_global-setup";
import * as schema from "../schema";
import { __setDbOverride, type Database, type PooledDatabase } from "../index";

// In-process Postgres (PGlite, real PG compiled to WASM) for the db integration
// suite. The committed Drizzle migrations are replayed into a throwaway database
// and the production db modules are pointed at it through the __setDbOverride
// seam — so the tests exercise the REAL queries in activations.ts /
// questionnaire-definitions.ts against real Postgres (jsonb, enums, ON CONFLICT,
// transactions, FK cascades), with no Docker, no Neon, and no secrets.
//
// In this package's own run the migrations are replayed once
// (_global-setup.ts) and each file starts from a copy of that database; a
// caller with no copy (apps/web's tests) or one that asks to (`replay`)
// replays them itself.

const MIGRATIONS_DIR = fileURLToPath(
  new URL("../../migrations", import.meta.url),
);

let client: PGlite | null = null;
let db: ReturnType<typeof drizzle<typeof schema>> | null = null;

/** The migrated copy _global-setup.ts saved, or null outside that run. */
function snapshot(): Blob | null {
  let file: string | undefined;
  try {
    file = inject("pgliteSnapshot");
  } catch {
    return null;
  }
  return file ? new Blob([readFileSync(file)]) : null;
}

async function setup(replay: boolean): Promise<void> {
  const copy = replay ? null : snapshot();
  client = copy ? new PGlite({ loadDataDir: copy }) : new PGlite();
  db = drizzle(client, { schema });
  if (!copy) await migrate(db, { migrationsFolder: MIGRATIONS_DIR });
  // PGlite supports transactions, so one handle backs both the stateless HTTP
  // path (createHttpDb) and the pooled/transactional path (createPooledDb). The
  // pool's only consumed method is end(), which is a no-op for the shared handle.
  __setDbOverride({
    http: db as unknown as Database,
    pooled: {
      db: db as unknown as PooledDatabase["db"],
      pool: { end: async () => {} } as unknown as PooledDatabase["pool"],
    },
  });
}

async function teardown(): Promise<void> {
  __setDbOverride(null);
  await client?.close();
  client = null;
  db = null;
}

async function reset(): Promise<void> {
  if (!client) return;
  const res = await client.query<{ tablename: string }>(
    "select tablename from pg_tables where schemaname = 'public'",
  );
  if (res.rows.length === 0) return;
  // Dynamic SQL is safe here (static-analysis "SQL injection" flag is a false
  // positive): the names come from the pg_tables system catalogue (not user
  // input), are quoted as identifiers, and TRUNCATE cannot be parameterised.
  // The `drizzle` migrations table lives in its own schema and is excluded by
  // the schemaname filter, so the migration journal survives the reset.
  const list = res.rows.map((r) => `"public"."${r.tablename}"`).join(", ");
  await client.query(`truncate ${list} restart identity cascade`);
}

/**
 * Register PGlite lifecycle hooks for one integration test file: a fresh
 * migrated database for the file, truncated between tests. `replay` migrates
 * from empty instead of starting from the run's migrated copy. Returns accessors to
 * the raw drizzle handle / client for arrange + assert; the code under test
 * reaches the same handle through the injected createHttpDb / createPooledDb.
 */
export function useTestDb(options: { replay?: boolean } = {}) {
  beforeAll(() => setup(options.replay ?? false));
  afterEach(reset);
  afterAll(teardown);
  return {
    db: () => {
      if (!db) throw new Error("test db not initialised");
      return db;
    },
    client: () => {
      if (!client) throw new Error("test db not initialised");
      return client;
    },
  };
}
