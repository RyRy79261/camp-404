import { neon, neonConfig, Pool } from "@neondatabase/serverless";
import { drizzle as drizzleHttp } from "drizzle-orm/neon-http";
import { drizzle as drizzleServerless } from "drizzle-orm/neon-serverless";
import * as schema from "./schema";

export * as schema from "./schema";

// In Node.js (e.g. cron jobs, CLI), use the WebSocket-backed serverless driver.
// In edge / route handlers, prefer the HTTP driver — zero connection cost.

// Placeholder used during `next build`'s page-data collection step, when
// real secrets aren't available. Any actual query will fail loudly.
const BUILD_PLACEHOLDER_URL =
  "postgres://build:build@localhost:5432/build?sslmode=disable";

function requireDatabaseUrl(): string {
  return process.env.DATABASE_URL ?? BUILD_PLACEHOLDER_URL;
}

/**
 * HTTP driver — stateless, ideal for route handlers and server components.
 * No transactions.
 */
export function createHttpDb() {
  const sql = neon(requireDatabaseUrl());
  return drizzleHttp(sql, { schema });
}

/**
 * Pooled WebSocket driver — use when transactions are required.
 * Caller is responsible for closing the pool on long-running processes.
 */
export function createPooledDb() {
  // Allow self-hosted Neon proxy in development environments.
  if (process.env.NEON_LOCAL_PROXY === "1") {
    neonConfig.useSecureWebSocket = false;
    neonConfig.wsProxy = (host) => `${host}:5433/v1`;
  }
  const pool = new Pool({ connectionString: requireDatabaseUrl() });
  const db = drizzleServerless(pool, { schema });
  return { db, pool };
}

export type Database = ReturnType<typeof createHttpDb>;
