import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { useTestDb } from "./_harness";
import { makeUser } from "./_factories";

// Paid is the end of a claim (owner, 2026-10-05). 0101 moves every claim
// marked "reconciled" back to "paid"; 0102 takes the value out of
// reimbursement_status. The harness has run both on an empty database, so
// each test puts back the type 0101 saw (with "reconciled"), stores rows, and
// runs the SQL. DDL outlives the truncate between tests, so the put-back
// works from either type.

const sql = (file: string) =>
  readFileSync(new URL(`../../migrations/${file}`, import.meta.url), "utf8");
const DATA_FIX = sql("0101_claims_paid_is_the_end.sql");
const DROP_VALUE = sql("0102_claims_drop_reconciled_status.sql");

describe("0101_claims_paid_is_the_end and 0102_claims_drop_reconciled_status", () => {
  const h = useTestDb();

  const run = async (text: string) => {
    for (const statement of text.split("--> statement-breakpoint")) {
      await h.client().exec(statement);
    }
  };

  async function stateBefore0101() {
    await h.client().exec(`
      ALTER TABLE "reimbursements" ALTER COLUMN "status" SET DATA TYPE text;
      ALTER TABLE "reimbursements" ALTER COLUMN "status" SET DEFAULT 'submitted'::text;
      DROP TYPE "public"."reimbursement_status";
      CREATE TYPE "public"."reimbursement_status"
        AS ENUM('submitted', 'approved', 'paid', 'reconciled', 'rejected');
      ALTER TABLE "reimbursements" ALTER COLUMN "status"
        SET DEFAULT 'submitted'::"public"."reimbursement_status";
      ALTER TABLE "reimbursements" ALTER COLUMN "status"
        SET DATA TYPE "public"."reimbursement_status"
        USING "status"::"public"."reimbursement_status";
    `);
  }

  async function claim(
    userId: string,
    description: string,
    status: string,
    paidAt: string | null,
    reconciledAt: string | null,
  ) {
    await h.client().query(
      `INSERT INTO "reimbursements"
         ("submitter_id", "cycle", "amount_cents", "currency", "account_type",
          "account_details_encrypted", "description", "status", "paid_at",
          "reconciled_at", "updated_at")
       VALUES ($1, 1, 100, 'ZAR', 'sa', 'ciphertext', $2, $3, $4, $5,
               '2027-01-01T00:00:00Z')`,
      [userId, description, status, paidAt, reconciledAt],
    );
  }

  async function rows() {
    const res = await h.client().query<{
      description: string;
      status: string;
      paid_at: string | null;
    }>(
      `SELECT "description", "status"::text AS "status", "paid_at"::text AS "paid_at"
       FROM "reimbursements" ORDER BY "description"`,
    );
    return res.rows.map((r) => ({
      description: r.description,
      status: r.status,
      paidAt: r.paid_at,
    }));
  }

  async function labels() {
    const res = await h.client().query<{ label: string }>(
      `SELECT e.enumlabel AS "label" FROM pg_enum e
       JOIN pg_type t ON t.oid = e.enumtypid
       WHERE t.typname = 'reimbursement_status' ORDER BY e.enumsortorder`,
    );
    return res.rows.map((r) => r.label);
  }

  it("makes a reconciled claim paid, keeps the rest, and a re-run changes nothing", async () => {
    await stateBefore0101();
    const user = await makeUser(h.db());
    await claim(
      user.id,
      "a reconciled",
      "reconciled",
      "2027-02-01T00:00:00Z",
      "2027-02-05T00:00:00Z",
    );
    await claim(
      user.id,
      "b reconciled, no paid_at",
      "reconciled",
      null,
      "2027-02-05T00:00:00Z",
    );
    await claim(user.id, "c paid", "paid", "2027-02-02T00:00:00Z", null);
    await claim(user.id, "d approved", "approved", null, null);
    await claim(user.id, "e rejected", "rejected", null, null);

    await run(DATA_FIX);
    const once = await rows();
    expect(once).toEqual([
      {
        description: "a reconciled",
        status: "paid",
        paidAt: "2027-02-01 00:00:00",
      },
      {
        description: "b reconciled, no paid_at",
        status: "paid",
        paidAt: "2027-02-05 00:00:00",
      },
      {
        description: "c paid",
        status: "paid",
        paidAt: "2027-02-02 00:00:00",
      },
      { description: "d approved", status: "approved", paidAt: null },
      { description: "e rejected", status: "rejected", paidAt: null },
    ]);
    await run(DATA_FIX);
    expect(await rows()).toEqual(once);

    await run(DROP_VALUE);
    expect(await labels()).toEqual([
      "submitted",
      "approved",
      "paid",
      "rejected",
    ]);
    expect(await rows()).toEqual(once);
  });

  it("stops the deploy when a reconciled row is left for 0102 (why 0101 runs first)", async () => {
    await stateBefore0101();
    const user = await makeUser(h.db());
    await claim(user.id, "left behind", "reconciled", null, null);
    await expect(run(DROP_VALUE)).rejects.toThrow(/reimbursement_status/);
  });
});
