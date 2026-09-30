import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { makeUser } from "./_factories";
import { useTestDb } from "./_harness";
import * as schema from "../schema";

// Claims and budgets move to whole rand cents (#242): 0076 adds the cents
// columns, 0077 fills them from the old decimal ones, 0078 drops those. The
// harness has applied all three to an empty database, so each test puts back
// the state 0076 left (the decimal columns beside empty cents), stores rows,
// and runs 0077's own SQL, twice. Amounts are made up.

const BACKFILL_SQL = readFileSync(
  new URL(
    "../../migrations/0077_claims_and_budgets_backfill.sql",
    import.meta.url,
  ),
  "utf8",
);

describe("0077_claims_and_budgets_backfill", () => {
  const h = useTestDb();

  // DDL outlives the truncate between tests, so each step may run again.
  async function stateAfter0076() {
    await h.client().exec(`
      ALTER TABLE "reimbursements" ADD COLUMN IF NOT EXISTS "amount" numeric(12, 2);
      ALTER TABLE "reimbursements" ALTER COLUMN "amount_cents" DROP NOT NULL;
      ALTER TABLE "team_budgets" ADD COLUMN IF NOT EXISTS "assigned_amount" numeric(12, 2);
      ALTER TABLE "team_budgets" ADD COLUMN IF NOT EXISTS "perceived_amount" numeric(12, 2);
    `);
  }

  async function oldClaim(userId: string, amount: string, cycle = 1) {
    await h.client().query(
      `INSERT INTO "reimbursements"
         ("submitter_id", "cycle", "amount", "currency", "account_type",
          "account_details_encrypted", "description")
       VALUES ($1, $2, $3, 'ZAR', 'sa', 'ciphertext', 'Tape')`,
      [userId, cycle, amount],
    );
  }

  async function setYears(cycles: unknown) {
    await h
      .db()
      .insert(schema.campSettings)
      .values({ id: true, config: { cycles } as never })
      .onConflictDoUpdate({
        target: schema.campSettings.id,
        set: { config: { cycles } as never },
      });
  }

  async function claims() {
    const res = await h.client().query<{
      amount_cents: number;
      cycle: number;
    }>(`SELECT "amount_cents", "cycle" FROM "reimbursements" ORDER BY "amount_cents"`);
    return res.rows;
  }

  it("turns a claim's rands into cents, and a re-run changes nothing", async () => {
    await stateAfter0076();
    const user = await makeUser(h.db());
    await oldClaim(user.id, "12.34");
    await oldClaim(user.id, "0.05");
    await oldClaim(user.id, "4500.00");

    await h.client().exec(BACKFILL_SQL);
    const once = await claims();
    expect(once.map((r) => r.amount_cents)).toEqual([5, 1234, 450000]);
    await h.client().exec(BACKFILL_SQL);
    expect(await claims()).toEqual(once);
  });

  it("keeps the assigned budget, or the perceived one when that is all there is", async () => {
    await stateAfter0076();
    await h.client().exec(`
      INSERT INTO "team_budgets" ("team", "cycle", "assigned_amount", "perceived_amount")
      VALUES ('kitchen', 2027, 5000.00, 6200.00),
             ('structures', 2027, NULL, 800.50),
             ('finance', 2027, NULL, NULL);
    `);
    await h.client().exec(BACKFILL_SQL);
    await h.client().exec(BACKFILL_SQL);
    const rows = await h
      .db()
      .select({
        team: schema.teamBudgets.team,
        amountCents: schema.teamBudgets.amountCents,
      })
      .from(schema.teamBudgets)
      .orderBy(schema.teamBudgets.team);
    expect(rows).toEqual([
      { team: "kitchen", amountCents: 500000 },
      { team: "structures", amountCents: 80050 },
      { team: "finance", amountCents: null },
    ]);
  });

  it("moves a sentinel claim into the camp's open year, and leaves a camp with no year alone", async () => {
    await stateAfter0076();
    const user = await makeUser(h.db());
    await oldClaim(user.id, "10.00");
    await h.client().exec(BACKFILL_SQL);
    expect((await claims())[0]!.cycle).toBe(1);

    await setYears([
      {
        year: 2026,
        startedAt: "2026-01-01T00:00:00.000Z",
        endedAt: "2026-06-01T00:00:00.000Z",
      },
      { year: 2027, startedAt: "2026-06-01T00:00:00.000Z", endedAt: null },
    ]);
    await oldClaim(user.id, "20.00", 2026);
    await h.client().exec(BACKFILL_SQL);
    const rows = await h
      .db()
      .select({
        cents: schema.reimbursements.amountCents,
        cycle: schema.reimbursements.cycle,
      })
      .from(schema.reimbursements)
      .where(eq(schema.reimbursements.submitterId, user.id))
      .orderBy(schema.reimbursements.amountCents);
    // The sentinel row moves; a row already in a year stays in it.
    expect(rows).toEqual([
      { cents: 1000, cycle: 2027 },
      { cents: 2000, cycle: 2026 },
    ]);
  });
});
