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
  await migrate(db, {
    migrationsFolder: fileURLToPath(new URL("../migrations", import.meta.url)),
  });
  console.log("Local database is up to date.");
} finally {
  await pool.end();
}
