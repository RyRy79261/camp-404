import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { useTestDb } from "./_harness";
import { makeMembership, makeUser } from "./_factories";
import {
  assignTeam,
  getTeamMemberships,
  removeTeam,
  setLead,
} from "../team-memberships";
import { isTeamLead } from "../roster";
import { resolveAudience } from "../broadcasts";
import * as schema from "../schema";

// The write path for `team_memberships`, against real Postgres. These run the
// PRODUCTION writers — not the factory — because the bug they exist to prevent
// is a write that lands on the wrong `cycle` and is therefore invisible to
// every year-scoped read. A mocked handle would happily "write" it.

type DB = ReturnType<ReturnType<typeof useTestDb>["db"]>;

/** Tell the camp what year it is, the way setFoundingYear would. */
async function foundedAt(db: DB, year: number): Promise<void> {
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

describe("assignTeam", () => {
  const h = useTestDb();

  it("stamps the camp's CURRENT year, so a current-cycle read sees it", async () => {
    const db = h.db();
    const member = await makeUser(db);
    await foundedAt(db, 2027);

    const result = await assignTeam({ userId: member.id, team: "kitchen" });

    expect(result).toEqual({ created: true, cycle: 2027 });
    // The row itself carries the real year — NOT the DEFAULT 1 sentinel, which
    // would exist and be invisible to every production read.
    const [row] = await db
      .select()
      .from(schema.teamMemberships)
      .where(eq(schema.teamMemberships.userId, member.id));
    expect(row).toMatchObject({ team: "kitchen", cycle: 2027, isLead: false });
    // And the year-scoped read agrees.
    expect(await getTeamMemberships(member.id)).toEqual([
      { team: "kitchen", isLead: false, cycle: 2027 },
    ]);
  });

  it("is a no-op the second time, not a duplicate-key error", async () => {
    const db = h.db();
    const member = await makeUser(db);
    await foundedAt(db, 2027);

    await assignTeam({ userId: member.id, team: "kitchen" });
    const again = await assignTeam({ userId: member.id, team: "kitchen" });

    expect(again.created).toBe(false);
    expect(await getTeamMemberships(member.id)).toHaveLength(1);
    // The no-op writes no audit row either — only the real assignment did.
    const audit = await db.select().from(schema.auditLog);
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ action: "member.team_assigned" });
  });

  it("never touches an existing row's lead flag", async () => {
    const db = h.db();
    const lead = await makeUser(db);
    await foundedAt(db, 2027);
    await assignTeam({ userId: lead.id, team: "kitchen" });
    await setLead({ userId: lead.id, team: "kitchen", isLead: true });

    // A re-assignment must not silently demote them.
    await assignTeam({ userId: lead.id, team: "kitchen" });

    expect(await getTeamMemberships(lead.id)).toEqual([
      { team: "kitchen", isLead: true, cycle: 2027 },
    ]);
  });

  it("records the acting captain in the audit log", async () => {
    const db = h.db();
    const captain = await makeUser(db, { rank: "captain" });
    const member = await makeUser(db);
    await foundedAt(db, 2027);

    await assignTeam({
      userId: member.id,
      team: "structures",
      actorId: captain.id,
    });

    const [event] = await db.select().from(schema.auditLog);
    expect(event).toMatchObject({
      actorId: captain.id,
      action: "member.team_assigned",
      target: member.id,
    });
    expect(event?.metadata).toEqual({ team: "structures", cycle: 2027 });
  });
});

describe("removeTeam", () => {
  const h = useTestDb();

  it("removes THIS year's row and leaves last year's untouched", async () => {
    const db = h.db();
    const member = await makeUser(db);
    // Last year they were on the kitchen team, and led it.
    await makeMembership(db, {
      userId: member.id,
      team: "kitchen",
      isLead: true,
      cycle: 2026,
    });
    await foundedAt(db, 2027);
    await assignTeam({ userId: member.id, team: "kitchen" });

    const result = await removeTeam({ userId: member.id, team: "kitchen" });

    expect(result).toEqual({ removed: true, cycle: 2027 });
    expect(await getTeamMemberships(member.id)).toEqual([]);
    // The year namespace destroys nothing: 2026's record, lead flag intact.
    const rows = await db
      .select()
      .from(schema.teamMemberships)
      .where(eq(schema.teamMemberships.userId, member.id));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ cycle: 2026, isLead: true });
  });

  it("allows removing the team's last lead — a leaderless team is legal", async () => {
    const db = h.db();
    const lead = await makeUser(db);
    await foundedAt(db, 2027);
    await assignTeam({ userId: lead.id, team: "kitchen" });
    await setLead({ userId: lead.id, team: "kitchen", isLead: true });

    await expect(
      removeTeam({ userId: lead.id, team: "kitchen" }),
    ).resolves.toEqual({ removed: true, cycle: 2027 });

    expect(await isTeamLead(lead.id)).toBe(false);
    const [event] = await db
      .select()
      .from(schema.auditLog)
      .where(eq(schema.auditLog.action, "member.team_removed"));
    // Removing a LEAD is a clearance change; the audit row says so.
    expect(event?.metadata).toMatchObject({ wasLead: true });
  });

  it("is a no-op when they were not on the team", async () => {
    const db = h.db();
    const member = await makeUser(db);
    await foundedAt(db, 2027);

    expect(await removeTeam({ userId: member.id, team: "kitchen" })).toEqual({
      removed: false,
      cycle: 2027,
    });
    expect(await db.select().from(schema.auditLog)).toHaveLength(0);
  });
});

describe("setLead", () => {
  const h = useTestDb();

  it("flips the flag, and isTeamLead sees it", async () => {
    const db = h.db();
    const member = await makeUser(db);
    await foundedAt(db, 2027);
    await assignTeam({ userId: member.id, team: "kitchen" });
    expect(await isTeamLead(member.id)).toBe(false);

    expect(
      await setLead({ userId: member.id, team: "kitchen", isLead: true }),
    ).toEqual({ ok: true, changed: true });

    expect(await isTeamLead(member.id)).toBe(true);
    expect(await getTeamMemberships(member.id)).toEqual([
      { team: "kitchen", isLead: true, cycle: 2027 },
    ]);
  });

  it("clears the flag again without removing the membership", async () => {
    const db = h.db();
    const member = await makeUser(db);
    await foundedAt(db, 2027);
    await assignTeam({ userId: member.id, team: "kitchen" });
    await setLead({ userId: member.id, team: "kitchen", isLead: true });

    expect(
      await setLead({ userId: member.id, team: "kitchen", isLead: false }),
    ).toEqual({ ok: true, changed: true });

    expect(await isTeamLead(member.id)).toBe(false);
    expect(await getTeamMemberships(member.id)).toEqual([
      { team: "kitchen", isLead: false, cycle: 2027 },
    ]);
  });

  it("refuses a non-member and creates nothing", async () => {
    const db = h.db();
    const stranger = await makeUser(db);
    await foundedAt(db, 2027);

    expect(
      await setLead({ userId: stranger.id, team: "kitchen", isLead: true }),
    ).toEqual({ ok: false, reason: "not_a_member" });

    // No membership was minted through the lead control.
    expect(await db.select().from(schema.teamMemberships)).toHaveLength(0);
    expect(await db.select().from(schema.auditLog)).toHaveLength(0);
  });

  it("refuses when the only membership is in a PRIOR year", async () => {
    const db = h.db();
    const member = await makeUser(db);
    await makeMembership(db, {
      userId: member.id,
      team: "kitchen",
      cycle: 2026,
    });
    await foundedAt(db, 2027);

    // Last year's membership is not this year's — the lead role goes fresh.
    expect(
      await setLead({ userId: member.id, team: "kitchen", isLead: true }),
    ).toEqual({ ok: false, reason: "not_a_member" });

    const [row] = await db.select().from(schema.teamMemberships);
    expect(row).toMatchObject({ cycle: 2026, isLead: false });
  });

  it("is idempotent and writes no audit row for a no-change call", async () => {
    const db = h.db();
    const member = await makeUser(db);
    await foundedAt(db, 2027);
    await assignTeam({ userId: member.id, team: "kitchen" });
    await setLead({ userId: member.id, team: "kitchen", isLead: true });

    expect(
      await setLead({ userId: member.id, team: "kitchen", isLead: true }),
    ).toEqual({ ok: true, changed: false });

    expect(
      await db
        .select()
        .from(schema.auditLog)
        .where(eq(schema.auditLog.action, "member.team_lead_set")),
    ).toHaveLength(1);
  });
});

// --- The keystone -----------------------------------------------------------
// Eight harvest units independently found that `team_memberships` had no write
// path, which made every team-scoped send a success toast delivered to nobody.
// This is the assertion that would have caught it: the broadcast audience is
// resolved through the SAME year-scoped query production uses, after a real
// assignment through the real writer.

describe("a team broadcast reaches the members a captain just assigned", () => {
  const h = useTestDb();

  it("resolves scope:'team' to a NON-EMPTY recipient list", async () => {
    const db = h.db();
    const captain = await makeUser(db, { rank: "captain" });
    const cook = await makeUser(db);
    const builder = await makeUser(db);
    await foundedAt(db, 2027);

    await assignTeam({
      userId: cook.id,
      team: "kitchen",
      actorId: captain.id,
    });
    await assignTeam({
      userId: builder.id,
      team: "structures",
      actorId: captain.id,
    });

    const audience = await resolveAudience(
      { id: "b1", scope: "team", team: "kitchen" },
      captain.id,
    );

    expect(audience).toEqual([cook.id]);
  });

  it("resolves scope:'team_leads' to the leads, and to nobody before one is set", async () => {
    const db = h.db();
    const captain = await makeUser(db, { rank: "captain" });
    const cook = await makeUser(db);
    await foundedAt(db, 2027);
    await assignTeam({ userId: cook.id, team: "kitchen" });

    // A member is not a lead: the tier is empty until a captain says otherwise.
    expect(
      await resolveAudience(
        { id: "b1", scope: "team_leads", team: null },
        captain.id,
      ),
    ).toEqual([]);

    await setLead({ userId: cook.id, team: "kitchen", isLead: true });

    expect(
      await resolveAudience(
        { id: "b1", scope: "team_leads", team: null },
        captain.id,
      ),
    ).toEqual([cook.id]);
  });

  it("does NOT reach last year's team — the membership must be this year's", async () => {
    const db = h.db();
    const captain = await makeUser(db, { rank: "captain" });
    const cook = await makeUser(db);
    await makeMembership(db, {
      userId: cook.id,
      team: "kitchen",
      cycle: 2026,
    });
    await foundedAt(db, 2027);

    expect(
      await resolveAudience(
        { id: "b1", scope: "team", team: "kitchen" },
        captain.id,
      ),
    ).toEqual([]);

    // Re-established for 2027 by the production writer, and it lands.
    await assignTeam({ userId: cook.id, team: "kitchen" });
    expect(
      await resolveAudience(
        { id: "b1", scope: "team", team: "kitchen" },
        captain.id,
      ),
    ).toEqual([cook.id]);
  });
});
