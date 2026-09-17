// Apply every committed migration to the local stack (docker-compose.local.yml)
// through the app's own pooled Neon driver. drizzle-kit migrate cannot reach it:
// with only @neondatabase/serverless installed it opens a WebSocket straight to
// the host, with no local proxy.
//
//   pnpm db:local:migrate

import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/neon-serverless/migrator";
import { createPooledDb, LOCAL_PROXY_HOST } from "../src/index";

const url = process.env.DATABASE_URL ?? "";
if (process.env.NEON_LOCAL_PROXY !== "1" || !url.includes(LOCAL_PROXY_HOST)) {
  console.error(
    `Refusing: this script only migrates the local stack. Set NEON_LOCAL_PROXY=1 and a DATABASE_URL on ${LOCAL_PROXY_HOST}.`,
  );
  process.exit(1);
}

const { db, pool } = createPooledDb();
try {
  // Neon Auth owns the neon_auth schema on Neon, and no migration creates it.
  // Locally, make the columns the app reads (src/neon-auth.ts), so a join on a
  // member's email works.
  await pool.query(`
    create schema if not exists neon_auth;
    create table if not exists neon_auth."user" (
      id text primary key,
      email text,
      "emailVerified" boolean
    );
  `);
  await migrate(db, {
    migrationsFolder: fileURLToPath(new URL("../migrations", import.meta.url)),
  });
  console.log("Local database is up to date.");
} finally {
  await pool.end();
}
