import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { useTestDb } from "./_harness";
import { makeUser } from "./_factories";

// 0105 (audit 2, data-1): on a camp that named its year, rows still on the
// sentinel year (1) move into the founding year, a table at a time, and only
// when the founding year holds none of that table's rows. The harness has run
// every migration already, so each test stores rows and runs the SQL, twice.

const SQL = readFileSync(
  new URL(
    "../../migrations/0105_adopt_sentinel_year_rows.sql",
    import.meta.url,
  ),
  "utf8",
);

/** The camp's years: founded in 2026, rolled to 2027. */
const FOUNDED_AND_ROLLED = {
  cycles: [
    {
      year: 2026,
      startedAt: "2026-09-01T00:00:00.000Z",
      endedAt: "2026-09-30T00:00:00.000Z",
    },
    { year: 2027, startedAt: "2026-09-30T00:00:00.000Z", endedAt: null },
  ],
};

describe("0105_adopt_sentinel_year_rows", () => {
  const h = useTestDb();

  async function q<T = Record<string, unknown>>(
    text: string,
    params: unknown[] = [],
  ): Promise<T[]> {
    return (await h.client().query<T>(text, params)).rows;
  }

  const cyclesOf = async (table: string) =>
    (
      await q<{ cycle: number }>(`SELECT cycle FROM ${table} ORDER BY cycle`)
    ).map((r) => r.cycle);

  async function settings(config: unknown) {
    await q(`INSERT INTO camp_settings (id, config) VALUES (true, $1)`, [
      JSON.stringify(config),
    ]);
  }

  async function strandedRows(memberId: string, riderId: string) {
    await q(
      `INSERT INTO payments (user_id, cycle, amount_cents, reference)
       VALUES ($1, 1, 50000, 'PAY-1')`,
      [memberId],
    );
    await q(
      `INSERT INTO meeting_notes (cycle, title, held_at) VALUES (1, 'Build day', now())`,
    );
    await q(
      `INSERT INTO driver_profiles (user_id, cycle, intends_to_drive, version) VALUES ($1, 1, true, '1')`,
      [memberId],
    );
    await q(
      `INSERT INTO car_members (driver_user_id, member_user_id, cycle) VALUES ($1, $2, 1)`,
      [memberId, riderId],
    );
    await q(`INSERT INTO kitchen_meal_plans (cycle) VALUES (1)`);
    await q(`INSERT INTO kitchen_meal_plan_days (cycle, day) VALUES (1, 1)`);
    await q(
      `INSERT INTO camp_layouts (cycle, latest_version, share_token) VALUES (1, 1, 'share-1')`,
    );
    await q(
      `INSERT INTO camp_layout_versions (cycle, number, body) VALUES (1, 1, '{}')`,
    );
  }

  it("moves stranded rows into the founding year, and a second run changes nothing", async () => {
    const member = await makeUser(h.db());
    const rider = await makeUser(h.db());
    await settings(FOUNDED_AND_ROLLED);
    await strandedRows(member.id, rider.id);

    await h.client().exec(SQL);
    await h.client().exec(SQL);

    for (const table of [
      "payments",
      "meeting_notes",
      "driver_profiles",
      "car_members",
      "kitchen_meal_plans",
      "kitchen_meal_plan_days",
      "camp_layouts",
      "camp_layout_versions",
    ]) {
      expect({ table, cycles: await cyclesOf(table) }).toEqual({
        table,
        cycles: [2026],
      });
    }
    expect(await q(`SELECT share_token FROM camp_layouts`)).toEqual([
      { share_token: "share-1" },
    ]);
  });

  it("leaves a table alone when the founding year already holds rows of it", async () => {
    const member = await makeUser(h.db());
    await settings(FOUNDED_AND_ROLLED);
    await q(
      `INSERT INTO payments (user_id, cycle, amount_cents, reference)
       VALUES ($1, 1, 50000, 'PAY-1'), ($1, 2026, 50000, 'PAY-2')`,
      [member.id],
    );
    await q(
      `INSERT INTO meeting_notes (cycle, title, held_at) VALUES (1, 'Build day', now())`,
    );

    await h.client().exec(SQL);

    // Payments in 2026 may be the same ones entered again: not merged.
    expect(await cyclesOf("payments")).toEqual([1, 2026]);
    // Meeting notes had nothing in 2026: moved.
    expect(await cyclesOf("meeting_notes")).toEqual([2026]);
  });

  it("does nothing on a camp that has not named its year", async () => {
    const member = await makeUser(h.db());
    const rider = await makeUser(h.db());
    await settings({});
    await strandedRows(member.id, rider.id);

    await h.client().exec(SQL);

    expect(await cyclesOf("payments")).toEqual([1]);
    expect(await cyclesOf("camp_layouts")).toEqual([1]);
    expect(await cyclesOf("kitchen_meal_plan_days")).toEqual([1]);
  });
});
