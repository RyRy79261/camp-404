import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { useTestDb } from "./_harness";
import { makeUser } from "./_factories";
import { getCampManagementRoster, setMembershipTier } from "../roster";
import * as schema from "../schema";

// A captain sets how long a member stays (#129), on a real Postgres. The write
// is a compare-and-set on the value the captain saw, including "not set"
// (NULL, which plain `=` never matches), and its audit row lands with it or
// not at all.

type DB = ReturnType<ReturnType<typeof useTestDb>["db"]>;

async function tierOf(db: DB, userId: string) {
  const [row] = await db
    .select({ tier: schema.users.membershipTier })
    .from(schema.users)
    .where(eq(schema.users.id, userId));
  return row!.tier;
}

async function auditRows(db: DB, target: string) {
  return await db
    .select()
    .from(schema.auditLog)
    .where(eq(schema.auditLog.target, target));
}

describe("setMembershipTier", () => {
  const h = useTestDb();

  it("sets a tier that was not set, with an audit row", async () => {
    const db = h.db();
    const captain = await makeUser(db, { rank: "captain" });
    const member = await makeUser(db);

    expect(
      await setMembershipTier({
        userId: member.id,
        from: null,
        to: "build_week_only",
        actorId: captain.id,
      }),
    ).toBe(true);

    expect(await tierOf(db, member.id)).toBe("build_week_only");
    const audit = await auditRows(db, member.id);
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      actorId: captain.id,
      action: "member.membership_tier_set",
      metadata: { from: null, to: "build_week_only" },
    });
  });

  it("changes a set tier when the captain saw the current value", async () => {
    const db = h.db();
    const captain = await makeUser(db, { rank: "captain" });
    const member = await makeUser(db, { membershipTier: "full" });

    expect(
      await setMembershipTier({
        userId: member.id,
        from: "full",
        to: "build_week_only",
        actorId: captain.id,
      }),
    ).toBe(true);
    expect(await tierOf(db, member.id)).toBe("build_week_only");
  });

  it("refuses a stale value and writes nothing, not even the audit row", async () => {
    const db = h.db();
    const captain = await makeUser(db, { rank: "captain" });
    // The member set it themselves after the captain opened the panel.
    const member = await makeUser(db, { membershipTier: "full" });

    expect(
      await setMembershipTier({
        userId: member.id,
        from: null,
        to: "build_week_only",
        actorId: captain.id,
      }),
    ).toBe(false);
    expect(
      await setMembershipTier({
        userId: member.id,
        from: "build_week_only",
        to: "full",
        actorId: captain.id,
      }),
    ).toBe(false);

    expect(await tierOf(db, member.id)).toBe("full");
    expect(await auditRows(db, member.id)).toHaveLength(0);
  });

  it("never writes an erased account", async () => {
    const db = h.db();
    const captain = await makeUser(db, { rank: "captain" });
    const gone = await makeUser(db, { sanitised: true });

    expect(
      await setMembershipTier({
        userId: gone.id,
        from: null,
        to: "full",
        actorId: captain.id,
      }),
    ).toBe(false);
    expect(await tierOf(db, gone.id)).toBeNull();
  });

  it("reaches the captain's roster read", async () => {
    const db = h.db();
    const captain = await makeUser(db, { rank: "captain" });
    const member = await makeUser(db, { displayName: "Tier Test" });
    await setMembershipTier({
      userId: member.id,
      from: null,
      to: "full",
      actorId: captain.id,
    });

    const roster = await getCampManagementRoster();
    expect(roster.find((m) => m.id === member.id)?.membershipTier).toBe("full");
  });
});
