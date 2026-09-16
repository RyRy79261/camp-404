import { neon, neonConfig, Pool } from "@neondatabase/serverless";
import { drizzle as drizzleHttp } from "drizzle-orm/neon-http";
import type { NeonHttpDatabase } from "drizzle-orm/neon-http";
import { drizzle as drizzleServerless } from "drizzle-orm/neon-serverless";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";
import * as schema from "./schema";

export * as schema from "./schema";

export type Database = NeonHttpDatabase<typeof schema>;
export type PooledDatabase = { db: NeonDatabase<typeof schema>; pool: Pool };

// In Node.js (e.g. cron jobs, CLI), use the WebSocket-backed serverless driver.
// In edge / route handlers, prefer the HTTP driver — zero connection cost.

// Placeholder used during `next build`'s page-data collection step, when
// real secrets aren't available. Any actual query will fail loudly.
const BUILD_PLACEHOLDER_URL =
  "postgres://build:build@localhost:5432/build?sslmode=disable";

function requireDatabaseUrl(): string {
  return process.env.DATABASE_URL ?? BUILD_PLACEHOLDER_URL;
}

// Test-only dependency-injection seam. Production never calls __setDbOverride,
// so the overrides stay null and createHttpDb/createPooledDb behave exactly as
// before. The PGlite-backed integration suite (packages/db/src/__tests__)
// injects a single in-process handle that serves BOTH the stateless HTTP path
// and the transactional pooled path — PGlite supports transactions, so one
// handle covers both, with a no-op pool. See __tests__/_harness.ts.
let httpOverride: Database | null = null;
let pooledOverride: PooledDatabase | null = null;

/** @internal test-only — inject a db handle for both paths, or clear with null. */
export function __setDbOverride(
  override: { http: Database; pooled: PooledDatabase } | null,
): void {
  httpOverride = override?.http ?? null;
  pooledOverride = override?.pooled ?? null;
}

/**
 * HTTP driver — stateless, ideal for route handlers and server components.
 * No transactions.
 */
export function createHttpDb(): Database {
  if (httpOverride) return httpOverride;
  const sql = neon(requireDatabaseUrl());
  return drizzleHttp(sql, { schema });
}

/**
 * Pooled WebSocket driver — use when transactions are required.
 * Caller is responsible for closing the pool on long-running processes.
 */
export function createPooledDb(): PooledDatabase {
  if (pooledOverride) return pooledOverride;
  // Allow self-hosted Neon proxy in development environments.
  if (process.env.NEON_LOCAL_PROXY === "1") {
    neonConfig.useSecureWebSocket = false;
    neonConfig.wsProxy = (host) => `${host}:5433/v1`;
  }
  const pool = new Pool({ connectionString: requireDatabaseUrl() });
  const db = drizzleServerless(pool, { schema });
  return { db, pool };
}

/**
 * The transaction handle drizzle hands a `db.transaction()` callback. Derived
 * from the pooled driver rather than hand-written, so it can never drift from
 * the driver's actual type.
 */
export type Tx = Parameters<
  Parameters<PooledDatabase["db"]["transaction"]>[0]
>[0];

/**
 * Run `fn` inside one pooled transaction and always close the pool. Replaces
 * the hand-rolled `createPooledDb()` … `try { db.transaction(…) } finally {
 * pool.end() }` shape — forgetting the `finally` leaks a connection per call.
 *
 * A throw from `fn` rolls the transaction back and propagates unchanged (no
 * error mapping — `packages/db` errors nest under `.cause`, and swallowing that
 * here would hide it from every caller).
 */
export async function withTransaction<T>(
  fn: (tx: Tx) => Promise<T>,
): Promise<T> {
  const { db, pool } = createPooledDb();
  try {
    return await db.transaction(fn);
  } finally {
    await pool.end();
  }
}
