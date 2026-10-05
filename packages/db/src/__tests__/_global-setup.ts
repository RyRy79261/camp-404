import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import type { TestProject } from "vitest/node";

// Migrate one PGlite database once per run and hand every test file a copy
// (tests-ci-4). Measured 2026-10-05 on 102 migrations: a fresh PGlite boot
// took ~1.3 s and the replay ~0.8 s, while starting from a saved data
// directory took ~0.4 s, so each of the ~110 files saves about 1.7 s. The
// harness falls back to the full replay when no copy is provided (apps/web's
// tests that borrow it), and harness-smoke keeps replaying on purpose.

declare module "vitest" {
  export interface ProvidedContext {
    pgliteSnapshot: string;
  }
}

const MIGRATIONS_DIR = fileURLToPath(
  new URL("../../migrations", import.meta.url),
);

export default async function setup(project: TestProject) {
  const client = new PGlite();
  await migrate(drizzle(client), { migrationsFolder: MIGRATIONS_DIR });
  const dump = await client.dumpDataDir("none");
  await client.close();
  const dir = mkdtempSync(join(tmpdir(), "camp404-pglite-"));
  const file = join(dir, "migrated.tar");
  writeFileSync(file, Buffer.from(await dump.arrayBuffer()));
  project.provide("pgliteSnapshot", file);
  return () => rmSync(dir, { recursive: true, force: true });
}
