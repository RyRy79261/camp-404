import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { useTestDb } from "./_harness";
import { makeMembership, makeUser } from "./_factories";
import { setUserApproval, setUserApprovalStatus } from "../burner-profile";
import * as schema from "../schema";

// setUserApproval is a compare-and-set on the status the captain saw. Two
// captains working the same vetting queue from separately-rendered rosters can
// both still see the same controls, so the precondition is the only thing
// stopping the second click from overwriting the first captain's decision AND
// its audit stamp. The predicate lives in the WHERE clause, so this runs
// against real Postgres.

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
      from: "pending",
      to: "approved",
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
        metadata: { from: "pending", status: "approved", withReason: false },
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
        from: "pending",
        to: "approved",
        decidedByUserId: captainA.id,
      }),
    ).toBe(true);
    const afterA = await readUser(db, applicant.id);

    const second = await setUserApproval({
      userId: applicant.id,
      from: "pending",
      to: "rejected",
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

  it("reverses a rejection when the captain saw the rejection", async () => {
    // Owner's call, 2026-09-16: a decision is not final.
    const db = h.db();
    const captain = await makeUser(db, { rank: "captain" });
    const member = await makeUser(db, { approvalStatus: "rejected" });

    expect(
      await setUserApproval({
        userId: member.id,
        from: "rejected",
        to: "approved",
        decidedByUserId: captain.id,
      }),
    ).toBe(true);
    const row = await readUser(db, member.id);
    expect(row.approvalStatus).toBe("approved");
    expect(row.approvalDecidedByUserId).toBe(captain.id);
    // They are told they are in, as on a first approval.
    const told = await db
      .select()
      .from(schema.notificationDeliveries)
      .where(eq(schema.notificationDeliveries.userId, member.id));
    expect(told).toHaveLength(1);
  });

  it("re-opens a decision to pending and clears the reason it carried", async () => {
    const db = h.db();
    const captain = await makeUser(db, { rank: "captain" });
    const member = await makeUser(db, { approvalStatus: "pending" });
    await setUserApproval({
      userId: member.id,
      from: "pending",
      to: "rejected",
      decidedByUserId: captain.id,
      reason: "Full this year.",
    });

    expect(
      await setUserApproval({
        userId: member.id,
        from: "rejected",
        to: "pending",
        decidedByUserId: captain.id,
        reason: "ignored",
      }),
    ).toBe(true);
    const row = await readUser(db, member.id);
    expect(row.approvalStatus).toBe("pending");
    expect(row.approvalDecisionReason).toBeNull();
  });

  it("throws on a move that is not a decision", async () => {
    const db = h.db();
    const captain = await makeUser(db, { rank: "captain" });
    const member = await makeUser(db, { approvalStatus: "approved" });

    await expect(
      setUserApproval({
        userId: member.id,
        from: "approved",
        to: "approved",
        decidedByUserId: captain.id,
      }),
    ).rejects.toThrow("not a decision");
    expect(await auditFor(db, member.id)).toEqual([]);
  });

  it("returns false for an unknown user id, changing nothing", async () => {
    const db = h.db();
    const captain = await makeUser(db, { rank: "captain" });
    const bystander = await makeUser(db, { approvalStatus: "pending" });

    const decided = await setUserApproval({
      userId: NIL_UUID,
      from: "pending",
      to: "approved",
      decidedByUserId: captain.id,
    });

    expect(decided).toBe(false);
    expect((await readUser(db, bystander.id)).approvalStatus).toBe("pending");
  });
});

describe("offboarding: a rejected member leaves this year's teams", () => {
  const h = useTestDb();

  /** Tell the camp what year it is, the way setFoundingYear would. */
  async function foundedAt(year: number): Promise<void> {
    const db = h.db();
    await db
      .insert(schema.campSettings)
      .values({ id: true })
      .onConflictDoNothing({ target: schema.campSettings.id });
    const [row] = await db
      .select({ config: schema.campSettings.config })
      .from(schema.campSettings)
      .limit(1);
    await db
      .update(schema.campSettings)
      .set({
        config: {
          ...row!.config,
          cycles: [
            { year, startedAt: `${year}-01-01T00:00:00.000Z`, endedAt: null },
          ],
        },
      })
      .where(eq(schema.campSettings.id, true));
  }

  async function teamsOf(userId: string) {
    return h
      .db()
      .select({
        team: schema.teamMemberships.team,
        cycle: schema.teamMemberships.cycle,
      })
      .from(schema.teamMemberships)
      .where(eq(schema.teamMemberships.userId, userId));
  }

  it("removes this year's teams, keeps last year's, and audits each removal", async () => {
    const db = h.db();
    await foundedAt(2027);
    const captain = await makeUser(db, { rank: "captain" });
    const member = await makeUser(db, { approvalStatus: "approved" });
    await makeMembership(db, {
      userId: member.id,
      team: "kitchen",
      isLead: true,
      cycle: 2027,
    });
    await makeMembership(db, {
      userId: member.id,
      team: "kitchen",
      cycle: 2026,
    });

    expect(
      await setUserApproval({
        userId: member.id,
        from: "approved",
        to: "rejected",
        decidedByUserId: captain.id,
        reason: "Dropped out.",
      }),
    ).toBe(true);

    expect(await teamsOf(member.id)).toEqual([
      { team: "kitchen", cycle: 2026 },
    ]);
    const audit = await auditFor(db, member.id);
    expect(audit.map((r) => [r.action, r.metadata])).toEqual([
      [
        "member.approval_decided",
        { from: "approved", status: "rejected", withReason: true },
      ],
      [
        "member.team_removed",
        { team: "kitchen", cycle: 2027, wasLead: true, because: "rejected" },
      ],
    ]);
  });

  it("keeps teams when an approval is only re-opened", async () => {
    const db = h.db();
    await foundedAt(2027);
    const captain = await makeUser(db, { rank: "captain" });
    const member = await makeUser(db, { approvalStatus: "approved" });
    await makeMembership(db, {
      userId: member.id,
      team: "kitchen",
      cycle: 2027,
    });

    await setUserApproval({
      userId: member.id,
      from: "approved",
      to: "pending",
      decidedByUserId: captain.id,
    });

    expect(await teamsOf(member.id)).toEqual([
      { team: "kitchen", cycle: 2027 },
    ]);
  });

  it("removes nothing when the compare-and-set loses", async () => {
    const db = h.db();
    await foundedAt(2027);
    const captain = await makeUser(db, { rank: "captain" });
    const member = await makeUser(db, { approvalStatus: "approved" });
    await makeMembership(db, {
      userId: member.id,
      team: "kitchen",
      cycle: 2027,
    });

    expect(
      await setUserApproval({
        userId: member.id,
        from: "pending",
        to: "rejected",
        decidedByUserId: captain.id,
      }),
    ).toBe(false);
    expect(await teamsOf(member.id)).toEqual([
      { team: "kitchen", cycle: 2027 },
    ]);
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
      from: "pending",
      to: "rejected",
      decidedByUserId: captain.id,
      reason: "  We are full this year.  ",
    });
    expect((await readUser(db, applicant.id)).approvalDecisionReason).toBe(
      "We are full this year.",
    );
    const [audit] = await auditFor(db, applicant.id);
    // The audit row says a reason was given, not what it said.
    expect(audit?.metadata).toEqual({
      from: "pending",
      status: "rejected",
      withReason: true,
    });

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
      from: "pending",
      to: "approved",
      decidedByUserId: captain.id,
      reason: "   ",
    });

    expect(
      (await readUser(db, applicant.id)).approvalDecisionReason,
    ).toBeNull();
  });
});
