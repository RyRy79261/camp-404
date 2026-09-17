import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { useTestDb } from "./_harness";
import { makeUser } from "./_factories";
import {
  getReimbursementForReview,
  listReimbursementsForReview,
  moveReimbursement,
} from "../reimbursements";
import * as schema from "../schema";

// A claim moves submitted -> approved or rejected, approved -> paid,
// paid -> reconciled, one compare-and-set at a time, each with its audit row.

type DB = ReturnType<ReturnType<typeof useTestDb>["db"]>;

async function claim(
  db: DB,
  submitterId: string,
  team: "kitchen" | "structures" | null,
  status: (typeof schema.reimbursementStatusEnum.enumValues)[number] = "submitted",
) {
  const [row] = await db
    .insert(schema.reimbursements)
    .values({
      submitterId,
      team,
      amount: "120.50",
      currency: "ZAR",
      accountType: "sa",
      accountDetailsEncrypted: "ciphertext",
      description: "Gas bottles",
      status,
    })
    .returning({ id: schema.reimbursements.id });
  return row!.id;
}

describe("reimbursement review", () => {
  const h = useTestDb();

  it("lists by team, general only, and status, with the submitter's name", async () => {
    const db = h.db();
    const member = await makeUser(db, {
      displayName: "Ada",
      aiDataConsent: true,
    });
    const kitchen = await claim(db, member.id, "kitchen");
    const general = await claim(db, member.id, null);
    await claim(db, member.id, "structures", "paid");

    const kitchenOnly = await listReimbursementsForReview({
      teams: ["kitchen"],
    });
    expect(kitchenOnly.map((r) => r.id)).toEqual([kitchen]);
    expect(kitchenOnly[0]).toMatchObject({
      submitterName: "Ada",
      submitterAiDataConsent: true,
    });
    expect(
      (await listReimbursementsForReview({ generalOnly: true })).map(
        (r) => r.id,
      ),
    ).toEqual([general]);
    expect(await listReimbursementsForReview({ status: "paid" })).toHaveLength(
      1,
    );
    expect(await listReimbursementsForReview({ teams: [] })).toEqual([]);
    expect(await listReimbursementsForReview()).toHaveLength(3);
  });

  it("approves once, stamps the reviewer, and writes the audit row", async () => {
    const db = h.db();
    const member = await makeUser(db);
    const lead = await makeUser(db);
    const id = await claim(db, member.id, "kitchen");

    expect(
      await moveReimbursement({
        id,
        from: "submitted",
        to: "approved",
        actorId: lead.id,
      }),
    ).toEqual({ ok: true });
    // A second reviewer who read it as submitted loses.
    expect(
      await moveReimbursement({
        id,
        from: "submitted",
        to: "rejected",
        actorId: lead.id,
      }),
    ).toEqual({ ok: false, reason: "stale" });

    const row = await getReimbursementForReview(id);
    expect(row).toMatchObject({ status: "approved", approverId: lead.id });
    expect(row?.approvedAt).toBeInstanceOf(Date);

    const audit = await db
      .select()
      .from(schema.auditLog)
      .where(eq(schema.auditLog.action, "reimbursement.status_changed"));
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ actorId: lead.id, target: member.id });
    expect(audit[0]!.metadata).toMatchObject({
      reimbursementId: id,
      from: "submitted",
      to: "approved",
      amount: "120.50",
      currency: "ZAR",
    });
  });

  it("refuses a move the status does not allow, and writes nothing", async () => {
    const db = h.db();
    const member = await makeUser(db);
    const id = await claim(db, member.id, null, "rejected");
    expect(
      await moveReimbursement({
        id,
        from: "rejected",
        to: "paid",
        actorId: member.id,
      }),
    ).toEqual({ ok: false, reason: "not_allowed" });
    expect(
      await moveReimbursement({
        id,
        from: "submitted",
        to: "reconciled",
        actorId: member.id,
      }),
    ).toEqual({ ok: false, reason: "not_allowed" });
    expect(await db.select().from(schema.auditLog)).toHaveLength(0);
  });

  it("walks approved to paid to reconciled, stamping each time", async () => {
    const db = h.db();
    const member = await makeUser(db);
    const captain = await makeUser(db, { rank: "captain" });
    const id = await claim(db, member.id, "kitchen", "approved");
    await moveReimbursement({
      id,
      from: "approved",
      to: "paid",
      actorId: captain.id,
    });
    await moveReimbursement({
      id,
      from: "paid",
      to: "reconciled",
      actorId: captain.id,
    });
    const row = await getReimbursementForReview(id);
    expect(row?.status).toBe("reconciled");
    expect(row?.paidAt).toBeInstanceOf(Date);
    expect(row?.reconciledAt).toBeInstanceOf(Date);
  });
});
