import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Drizzle's migrator reads the newest `created_at` it has applied and skips
// every journal entry whose `when` is not later than it
// (drizzle-orm/pg-core/dialect.js). So a migration renumbered by hand, say a
// branch's 0048 renamed to 0052 after another branch's 0048–0051 landed first,
// keeps its older timestamp and never runs in production, with no error. The
// migration test harness applies every file regardless, so only this check
// sees it. The fix is to delete the unmerged migration and regenerate it with
// `pnpm --filter @camp404/db db:generate` (plus `--custom`), which stamps a
// fresh time; never edit the journal.

interface JournalEntry {
  idx: number;
  when: number;
  tag: string;
}

const MIGRATIONS_DIR = new URL("../../migrations/", import.meta.url);

const entries = (
  JSON.parse(
    readFileSync(new URL("meta/_journal.json", MIGRATIONS_DIR), "utf8"),
  ) as { entries: JournalEntry[] }
).entries;

describe("migration journal", () => {
  it("numbers the entries 0, 1, 2 … and each tag starts with its own number", () => {
    entries.forEach((entry, position) => {
      expect(entry.idx).toBe(position);
      expect(
        entry.tag.startsWith(`${String(position).padStart(4, "0")}_`),
      ).toBe(true);
    });
  });

  it("gives every entry a later timestamp than the one before it, or the migrator skips it", () => {
    const outOfOrder = entries
      .slice(1)
      .filter((entry, i) => entry.when <= entries[i]!.when)
      .map((entry) => entry.tag);
    expect(outOfOrder).toEqual([]);
  });

  it("has one .sql file for each entry and no file without one", () => {
    const files = readdirSync(MIGRATIONS_DIR)
      .filter((name) => name.endsWith(".sql"))
      .sort();
    expect(files).toEqual(entries.map((entry) => `${entry.tag}.sql`).sort());
  });
});
