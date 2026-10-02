import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { useTestDb } from "./_harness";

// The fuel can register (#255): 0088 adds owner, material, car and note, 0089
// keeps a name someone typed as the can's note, 0090 drops the old stock
// columns (name, litres, place). The harness has applied all three to an empty
// database, so the test puts back the name column 0088 left, stores rows, and
// runs 0089's own SQL, twice. Every new field of a kept can starts empty:
// owner null (the camp), material null (not said), car null (no car yet).

describe("0089_fuel_can_names_to_notes", () => {
  const h = useTestDb();
  const SQL = readFileSync(
    new URL(
      "../../migrations/0089_fuel_can_names_to_notes.sql",
      import.meta.url,
    ),
    "utf8",
  );

  // DDL outlives the truncate between tests, so each step may run again.
  async function stateAfter0088() {
    await h.client().exec(`
      ALTER TABLE "fuel_cans" ADD COLUMN IF NOT EXISTS "label" text NOT NULL DEFAULT 'Can 1';
    `);
  }

  it("keeps a typed name as the note, drops 'Can N', and a re-run changes nothing", async () => {
    await stateAfter0088();
    await h.client().exec(`
      INSERT INTO "fuel_cans" ("cycle", "capacity_litres", "label", "sort")
      VALUES (1, 20, 'Can 3', 0), (1, 25, 'Red drum', 1);
      INSERT INTO "fuel_cans" ("cycle", "capacity_litres", "label", "note", "sort")
      VALUES (1, 10, 'Blue one', 'Spout in the box', 2);
    `);
    const read = async () =>
      (
        await h
          .client()
          .query<{
            note: string | null;
            material: string | null;
          }>(`SELECT "note", "material" FROM "fuel_cans" ORDER BY "sort"`)
      ).rows;
    await h.client().exec(SQL);
    const once = await read();
    expect(once).toEqual([
      { note: null, material: null },
      { note: "Red drum", material: null },
      { note: "Spout in the box", material: null },
    ]);
    await h.client().exec(SQL);
    expect(await read()).toEqual(once);
    await h.client().exec(`ALTER TABLE "fuel_cans" DROP COLUMN "label";`);
  });
});
