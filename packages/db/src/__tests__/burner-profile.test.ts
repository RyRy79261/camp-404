import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { useTestDb } from "./_harness";
import { makeUser } from "./_factories";
import { setUserApproval, setUserApprovalStatus } from "../burner-profile";
import * as schema from "../schema";

// setUserApproval is a compare-and-set on `pending`. Two captains working the
// same vetting queue from separately-rendered rosters can both still see the
// Approve / Reject buttons, so the precondition is the only thing stopping the
// second click from overwriting the first captain's decision AND its audit
// stamp. The predicate lives in the WHERE clause, so this runs against real
// Postgres.

const NIL_UUID = "00000000-0000-0000-0000-000000000000";

async function readUser(
  db: ReturnType<ReturnType<typeof useTestDb>["db"]>,
  userId: string,
) {
  const [row] = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.id, userId));
  return row!;
}

async function auditFor(
  db: ReturnType<ReturnType<typeof useTestDb>["db"]>,
  target: string,
) {
  return db
    .select()
    .from(schema.auditLog)
    .where(eq(schema.auditLog.target, target));
}

describe("setUserApproval", () => {
  const h = useTestDb();

  it("flips a pending member and stamps the deciding captain", async () => {
    const db = h.db();
    const captain = await makeUser(db, { rank: "captain" });
    const applicant = await makeUser(db, { approvalStatus: "pending" });

    const decided = await setUserApproval({
      userId: applicant.id,
      status: "approved",
      decidedByUserId: captain.id,
    });

    expect(decided).toBe(true);
    const row = await readUser(db, applicant.id);
    expect(row.approvalStatus).toBe("approved");
    expect(row.approvalDecidedByUserId).toBe(captain.id);
    expect(row.approvalDecidedAt).not.toBeNull();
    expect(await auditFor(db, applicant.id)).toEqual([
      expect.objectContaining({
        actorId: captain.id,
        action: "member.approval_decided",
        metadata: { status: "approved", withReason: false },
      }),
    ]);
  });

  it("refuses a second decision and leaves the first captain's stamp intact", async () => {
    // THE REFUSED CASE — the defect itself. Captain B, acting on a roster
    // rendered while the applicant was still pending, must change nothing.
    const db = h.db();
    const captainA = await makeUser(db, { rank: "captain" });
    const captainB = await makeUser(db, { rank: "captain" });
    const applicant = await makeUser(db, { approvalStatus: "pending" });

    expect(
      await setUserApproval({
        userId: applicant.id,
        status: "approved",
        decidedByUserId: captainA.id,
      }),
    ).toBe(true);
    const afterA = await readUser(db, applicant.id);

    const second = await setUserApproval({
      userId: applicant.id,
      status: "rejected",
      decidedByUserId: captainB.id,
    });

    expect(second).toBe(false);
    const afterB = await readUser(db, applicant.id);
    expect(afterB.approvalStatus).toBe("approved");
    expect(afterB.approvalDecidedByUserId).toBe(captainA.id);
    expect(afterB.approvalDecidedAt).toEqual(afterA.approvalDecidedAt);
    expect(afterB.updatedAt).toEqual(afterA.updatedAt);
    // Only the decision that happened is on the audit trail.
    expect((await auditFor(db, applicant.id)).map((r) => r.actorId)).toEqual([
      captainA.id,
    ]);
  });

  it("refuses to re-decide a rejected member", async () => {
    // Terminal both ways, not just approved-wins.
    const db = h.db();
    const captain = await makeUser(db, { rank: "captain" });
    const applicant = await makeUser(db, { approvalStatus: "rejected" });

    const decided = await setUserApproval({
      userId: applicant.id,
      status: "approved",
      decidedByUserId: captain.id,
    });

    expect(decided).toBe(false);
    const row = await readUser(db, applicant.id);
    expect(row.approvalStatus).toBe("rejected");
    expect(row.approvalDecidedByUserId).toBeNull();
  });

  it("returns false for an unknown user id, changing nothing", async () => {
    const db = h.db();
    const captain = await makeUser(db, { rank: "captain" });
    const bystander = await makeUser(db, { approvalStatus: "pending" });

    const decided = await setUserApproval({
      userId: NIL_UUID,
      status: "approved",
      decidedByUserId: captain.id,
    });

    expect(decided).toBe(false);
    expect((await readUser(db, bystander.id)).approvalStatus).toBe("pending");
  });
});

describe("the approval decision reason", () => {
  const h = useTestDb();

  it("is stored with the decision and cleared when the status moves again", async () => {
    const db = h.db();
    const captain = await makeUser(db, { rank: "captain" });
    const applicant = await makeUser(db, { approvalStatus: "pending" });

    await setUserApproval({
      userId: applicant.id,
      status: "rejected",
      decidedByUserId: captain.id,
      reason: "  We are full this year.  ",
    });
    expect((await readUser(db, applicant.id)).approvalDecisionReason).toBe(
      "We are full this year.",
    );
    const [audit] = await auditFor(db, applicant.id);
    // The audit row says a reason was given, not what it said.
    expect(audit?.metadata).toEqual({ status: "rejected", withReason: true });

    await setUserApprovalStatus(applicant.id, "pending");
    expect(
      (await readUser(db, applicant.id)).approvalDecisionReason,
    ).toBeNull();
  });

  it("stores a blank reason as none", async () => {
    const db = h.db();
    const captain = await makeUser(db, { rank: "captain" });
    const applicant = await makeUser(db, { approvalStatus: "pending" });

    await setUserApproval({
      userId: applicant.id,
      status: "approved",
      decidedByUserId: captain.id,
      reason: "   ",
    });

    expect(
      (await readUser(db, applicant.id)).approvalDecisionReason,
    ).toBeNull();
  });
});
