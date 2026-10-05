import { describe, expect, it } from "vitest";
import { useTestDb } from "./_harness";

// 0103: paid is the end of a claim (0101, 0102), so nothing writes
// "reconciled_at" any more and the column goes. The harness has run every
// migration; the column must be gone and the ones beside it kept.

describe("0103_drop_reconciled_at", () => {
  const h = useTestDb();

  async function columns() {
    const res = await h.client().query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'reimbursements'`,
    );
    return res.rows.map((r) => r.column_name);
  }

  it("drops reimbursements.reconciled_at and keeps paid_at", async () => {
    const cols = await columns();
    expect(cols).toContain("paid_at");
    expect(cols).not.toContain("reconciled_at");
  });
});
