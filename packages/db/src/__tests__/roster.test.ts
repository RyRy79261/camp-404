import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { useTestDb } from "./_harness";
import {
  makeCarMember,
  makeDriverProfile,
  makeMembership,
  makeUser,
} from "./_factories";
import {
  getCampManagementRoster,
  getCampMemberDetail,
  isTeamLead,
} from "../roster";
import * as schema from "../schema";

// The government-ID columns are the most sensitive material in the schema, and
// getCampMemberDetail backs both a captain-gated read and a member-facing one.
// These run the REAL query against real Postgres, so they prove the ciphertext
// leaves the SELECT list by default — not that it is projected away afterwards.

describe("getCampMemberDetail — ID ciphertext", () => {
  const h = useTestDb();

  it("omits the ID ciphertext columns by default", async () => {
    const db = h.db();
    const user = await makeUser(db, {
      passportEncrypted: "CIPHER-P",
      saIdEncrypted: "CIPHER-S",
    });

    const detail = await getCampMemberDetail(user.id);

    expect(detail).not.toBeNull();
    // Absent keys, not null values: the columns never entered the query.
    expect(Object.keys(detail!)).not.toContain("passportEncrypted");
    expect(Object.keys(detail!)).not.toContain("saIdEncrypted");
    // And nothing else on the row smuggles them back in.
    expect(JSON.stringify(detail)).not.toContain("CIPHER");
  });

  it("includes them when the caller opts in with includeIdDocuments", async () => {
    const db = h.db();
    const user = await makeUser(db, {
      passportEncrypted: "CIPHER-P",
      saIdEncrypted: "CIPHER-S",
    });

    const detail = await getCampMemberDetail(user.id, {
      includeIdDocuments: true,
    });

    // The captain modal still gets its ID — guards against over-narrowing.
    expect(detail?.passportEncrypted).toBe("CIPHER-P");
    expect(detail?.saIdEncrypted).toBe("CIPHER-S");
  });

  it("treats an explicit includeIdDocuments: false as the default", async () => {
    const db = h.db();
    const user = await makeUser(db, {
      passportEncrypted: "CIPHER-P",
      saIdEncrypted: "CIPHER-S",
    });

    const detail = await getCampMemberDetail(user.id, {
      includeIdDocuments: false,
    });

    expect(JSON.stringify(detail)).not.toContain("CIPHER");
  });

  it("returns null for an unknown member", async () => {
    expect(
      await getCampMemberDetail("00000000-0000-0000-0000-000000000000"),
    ).toBeNull();
  });
});

// --- The year-scoped roster facts -----------------------------------------
// team_memberships, driver_profiles and car_members each carry a `cycle`, and
// every read here filters to the camp's current year. That is the whole of
// what makes teams, team leads and car seats "fresh" at a rollover: nothing is
// copied forward and nothing is deleted — the question is just asked of the
// new year, which has no rows in it yet.

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

type DB = ReturnType<ReturnType<typeof useTestDb>["db"]>;

/**
 * PGlite hands the `array_agg` column back as the raw Postgres array literal
 * ("{kitchen}") where the Neon driver parses it into a JS array. Normalise, so
 * these assertions are about the YEAR and not about driver array handling.
 */
function teamsOf(member: { teams: string[] }): string[] {
  return String(member.teams).replace(/[{}"]/g, "").split(",").filter(Boolean);
}

describe("isTeamLead is asked of the camp's current year", () => {
  const h = useTestDb();

  it("leads in 2026, leads nothing in 2027 — and the 2026 row survives", async () => {
    const db = h.db();
    const lead = await makeUser(db);
    await makeMembership(db, {
      userId: lead.id,
      team: "kitchen",
      isLead: true,
      cycle: 2026,
    });

    await foundedAt(db, 2026);
    expect(await isTeamLead(lead.id)).toBe(true);

    // The rollover writes nothing to team_memberships; moving the camp's year
    // is all it takes for the lead role to lapse.
    await foundedAt(db, 2027);
    expect(await isTeamLead(lead.id)).toBe(false);

    // Nothing was destroyed — 2026's row is still on file, is_lead intact.
    const rows = await db
      .select()
      .from(schema.teamMemberships)
      .where(eq(schema.teamMemberships.userId, lead.id));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ cycle: 2026, isLead: true });

    // Reappointed for 2027 → a lead again, alongside the 2026 record.
    await makeMembership(db, {
      userId: lead.id,
      team: "kitchen",
      isLead: true,
      cycle: 2027,
    });
    expect(await isTeamLead(lead.id)).toBe(true);
    expect(
      await db
        .select()
        .from(schema.teamMemberships)
        .where(eq(schema.teamMemberships.userId, lead.id)),
    ).toHaveLength(2);
  });
});

describe("getCampManagementRoster is asked of the camp's current year", () => {
  const h = useTestDb();

  it("shows this year's teams, leads and driver intent — and not last year's", async () => {
    const db = h.db();
    const driver = await makeUser(db, { displayName: "Ada" });
    const rider = await makeUser(db, { displayName: "Bo" });
    await makeMembership(db, {
      userId: driver.id,
      team: "kitchen",
      isLead: true,
      cycle: 2026,
    });
    await makeDriverProfile(db, {
      userId: driver.id,
      cycle: 2026,
      completedAt: new Date(),
    });
    await makeCarMember(db, {
      driverUserId: driver.id,
      memberUserId: rider.id,
      cycle: 2026,
    });

    await foundedAt(db, 2026);
    const before = await getCampManagementRoster();
    expect(before.find((m) => m.id === driver.id)).toMatchObject({
      isLead: true,
      intendsToDrive: true,
      driverProfileComplete: true,
    });
    expect(teamsOf(before.find((m) => m.id === driver.id)!)).toEqual([
      "kitchen",
    ]);

    await foundedAt(db, 2027);
    const after = await getCampManagementRoster();
    // Still one row per member — the join is year-scoped, so a driver with two
    // years of profiles is never duplicated onto two roster rows.
    expect(after).toHaveLength(2);
    expect(after.find((m) => m.id === driver.id)).toMatchObject({
      isLead: false,
      intendsToDrive: false,
      driverProfileComplete: false,
    });
    expect(teamsOf(after.find((m) => m.id === driver.id)!)).toEqual([]);

    // The car seat and the driver profile are both still on file for 2026.
    expect(await db.select().from(schema.carMembers)).toHaveLength(1);
    expect(await db.select().from(schema.driverProfiles)).toHaveLength(1);
  });
});
