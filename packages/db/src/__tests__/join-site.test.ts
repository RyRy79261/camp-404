import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import type { AuditAction } from "@camp404/core";
import { DEFAULT_JOIN_CONTENT } from "@camp404/types";
import { useTestDb } from "./_harness";
import { makeUser } from "./_factories";
import { describeTeam } from "../camp-config";
import { setCycleBurnDates } from "../cycle-rollover";
import {
  getJoinSiteContent,
  getJoinSitePublic,
  JoinSectionInvalidError,
  saveJoinSiteSection,
} from "../join-site";
import * as schema from "../schema";

// join.camp-404.com's data against real Postgres: the carried-forward words,
// the section writer and its audit row, the public read's privacy (opted-in
// captains only, counts never names) and the Burn's dates.

type DB = ReturnType<ReturnType<typeof useTestDb>["db"]>;

const SAVED: AuditAction = "join_site.section_saved";
const DATES_SET: AuditAction = "camp.cycle.burn_dates_set";

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

const newMap = { where: "Block 7", lines: ["Right by the big dune."] };

describe("join site words", () => {
  const h = useTestDb();

  it("reads the defaults before anyone saves", async () => {
    const read = await getJoinSiteContent(2027);
    expect(read).toEqual({ content: DEFAULT_JOIN_CONTENT, from: null });
  });

  it("saves one section, keeps the rest, and audits it in the same write", async () => {
    const db = h.db();
    const captain = await makeUser(db, { rank: "captain" });
    await saveJoinSiteSection({
      year: 2027,
      section: "map",
      value: newMap,
      actorUserId: captain.id,
    });

    const { content, from } = await getJoinSiteContent(2027);
    expect(from).toBe(2027);
    expect(content.map).toEqual(newMap);
    expect(content.readme).toEqual(DEFAULT_JOIN_CONTENT.readme);

    const audits = await db
      .select()
      .from(schema.auditLog)
      .where(eq(schema.auditLog.action, SAVED));
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      actorId: captain.id,
      metadata: { section: "map", year: 2027 },
    });
  });

  it("carries the words forward into a year with no row of its own", async () => {
    const db = h.db();
    const captain = await makeUser(db, { rank: "captain" });
    await saveJoinSiteSection({
      year: 2027,
      section: "map",
      value: newMap,
      actorUserId: captain.id,
    });
    const { content, from } = await getJoinSiteContent(2028);
    expect(from).toBe(2027);
    expect(content.map.where).toBe("Block 7");
    // An earlier year never reads a later year's words.
    expect((await getJoinSiteContent(2026)).from).toBeNull();
  });

  it("refuses a section that fails its schema, and writes nothing", async () => {
    const db = h.db();
    const captain = await makeUser(db, { rank: "captain" });
    await expect(
      saveJoinSiteSection({
        year: 2027,
        section: "fee",
        value: { ...DEFAULT_JOIN_CONTENT.fee, currency: "USD" },
        actorUserId: captain.id,
      }),
    ).rejects.toBeInstanceOf(JoinSectionInvalidError);
    expect(await db.select().from(schema.joinSiteContent)).toHaveLength(0);
    expect(
      await db
        .select()
        .from(schema.auditLog)
        .where(eq(schema.auditLog.action, SAVED)),
    ).toHaveLength(0);
  });
});

describe("join site public read", () => {
  const h = useTestDb();

  it("shows only captains who opted in, and never an erased one", async () => {
    const db = h.db();
    await makeUser(db, {
      rank: "captain",
      displayName: "Ryan",
      campTitle: "The Original Error Code",
      campBlurb: "Consistently entropic.",
      showOnJoin: true,
    });
    await makeUser(db, {
      rank: "captain",
      displayName: "Shy",
      showOnJoin: false,
    });
    await makeUser(db, {
      rank: "member",
      displayName: "Member",
      showOnJoin: true,
    });
    await makeUser(db, {
      rank: "captain",
      displayName: "Lost Cat #1",
      showOnJoin: true,
      sanitised: true,
    });

    const { captains } = await getJoinSitePublic();
    expect(captains).toEqual([
      {
        name: "Ryan",
        title: "The Original Error Code",
        blurb: "Consistently entropic.",
      },
    ]);
  });

  it("counts this year's members by where they stand, and nothing else", async () => {
    const db = h.db();
    await foundedAt(db, 2027);
    const statuses = [
      "accepted",
      "accepted",
      "applied",
      "maybe",
      "not_attending",
    ] as const;
    for (const status of statuses) {
      const u = await makeUser(db);
      await db.insert(schema.campParticipations).values({
        userId: u.id,
        cycle: 2027,
        status,
        intent:
          status === "maybe"
            ? "maybe"
            : status === "not_attending"
              ? "no"
              : "yes",
      });
    }
    // Last year's answers do not count.
    const old = await makeUser(db);
    await db.insert(schema.campParticipations).values({
      userId: old.id,
      cycle: 2026,
      status: "accepted",
      intent: "yes",
    });

    const read = await getJoinSitePublic();
    expect(read.year).toBe(2027);
    expect(read.headcount).toEqual({ accepted: 2, applied: 1, maybe: 1 });
    // Counts only: nothing in the public read names a member.
    expect(JSON.stringify(read.headcount)).not.toMatch(/User/);
  });

  it("has no headcount before the camp names its year", async () => {
    expect((await getJoinSitePublic()).headcount).toBeNull();
  });

  it("uses a team's own description, else the default line", async () => {
    const db = h.db();
    await db
      .insert(schema.campSettings)
      .values({ id: true })
      .onConflictDoNothing({ target: schema.campSettings.id });
    const [row] = await db.select().from(schema.campSettings).limit(1);
    await db
      .update(schema.campSettings)
      .set({ config: describeTeam(row!.config, "kitchen", "Feeds the lost.") })
      .where(eq(schema.campSettings.id, true));

    const { teams } = await getJoinSitePublic();
    expect(teams.find((t) => t.key === "kitchen")?.description).toBe(
      "Feeds the lost.",
    );
    expect(teams.find((t) => t.key === "finance")?.description).toBe(
      "Fees, budgeting, accounts.",
    );
  });
});

describe("setCycleBurnDates", () => {
  const h = useTestDb();

  it("sets the Burn's dates on the year, audited, and the site reads them", async () => {
    const db = h.db();
    await foundedAt(db, 2027);
    const res = await setCycleBurnDates({
      year: 2027,
      burnStart: "2027-04-26",
      burnEnd: "2027-05-02",
      actorUserId: null,
    });
    expect(res.ok).toBe(true);
    expect((await getJoinSitePublic()).burn).toEqual({
      start: "2027-04-26",
      end: "2027-05-02",
    });
    expect(
      await db
        .select()
        .from(schema.auditLog)
        .where(eq(schema.auditLog.action, DATES_SET)),
    ).toHaveLength(1);
  });

  it("refuses an end before the start, or a day that does not exist", async () => {
    const db = h.db();
    await foundedAt(db, 2027);
    for (const [burnStart, burnEnd] of [
      ["2027-05-02", "2027-04-26"],
      ["2027-02-30", "2027-03-01"],
    ] as const) {
      const res = await setCycleBurnDates({
        year: 2027,
        burnStart,
        burnEnd,
        actorUserId: null,
      });
      expect(res).toEqual({ ok: false, reason: "invalid-dates" });
    }
  });

  it("clears the dates", async () => {
    const db = h.db();
    await foundedAt(db, 2027);
    await setCycleBurnDates({
      year: 2027,
      burnStart: "2027-04-26",
      burnEnd: "2027-05-02",
      actorUserId: null,
    });
    await setCycleBurnDates({
      year: 2027,
      burnStart: null,
      burnEnd: null,
      actorUserId: null,
    });
    expect((await getJoinSitePublic()).burn).toBeNull();
  });
});
