import { readFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import type { DutyCardDraft, Team } from "@camp404/types";
import { sanitiseAccount } from "../account";
import type { CampConfig } from "../camp-config";
import {
  CHAPTER_EDITED,
  CHAPTER_NOT_PUBLISHED,
  CHAPTER_SLUG_TAKEN,
  NOTHING_TO_PUBLISH,
  NOT_A_CAMP_CHAPTER_WRITER,
  NOT_A_CHAPTER_WRITER,
  NOT_A_MEMBERS_ONLY_MARKER,
  createGuideChapter,
  getChapterVersion,
  getGuideDraft,
  getPublishedChapter,
  listChapterReads,
  listDocumentDrafts,
  listGuideDrafts,
  listPublishedChapters,
  listPublishedDutyCardsInFull,
  markGuideChapterReviewed,
  publishGuideChapter,
  recordChapterRead,
  saveGuideChapter,
  setGuideChapterMembersOnly,
  unpublishGuideChapter,
} from "../documents";
import * as schema from "../schema";
import { assignTeam, setLead } from "../team-memberships";
import { useTestDb } from "./_harness";
import { makeUser } from "./_factories";

// The Survival Guide (#250) on a real Postgres (PGlite). What matters: a
// captain writes any chapter and a lead only their own team's, checked again
// inside each write (a refused write changes nothing); each publish that
// changes something is a new version and the old ones stay readable; a duty
// card is published only when its card is whole; the Public mark is a
// captain's; edits compare and set; audit rows go with their change.

type DB = ReturnType<ReturnType<typeof useTestDb>["db"]>;

async function campYear(db: DB, year: number) {
  const cycles: CampConfig["cycles"] = [
    { year, startedAt: `${year}-01-01T00:00:00.000Z`, endedAt: null },
  ];
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
    .set({ config: { ...row!.config, cycles } })
    .where(eq(schema.campSettings.id, true));
}

const CARD: DutyCardDraft = {
  shiftTypeKey: "morning-clean",
  subRoles: [
    { name: "Dishes", min: 2, max: 3 },
    { name: "Grey water", min: 1, max: 2 },
  ],
  steps: ["Fill the three basins.", "Wash, rinse, sanitise."],
  hardRules: ["Never pour liquid into the burn barrel."],
  checklist: ["Basins empty and upside down."],
  askRole: "The Sanitation lead",
};

describe("survival guide chapters", () => {
  const h = useTestDb();

  async function captain() {
    return makeUser(h.db(), { rank: "captain", approvalStatus: "approved" });
  }
  async function member() {
    return makeUser(h.db(), { approvalStatus: "approved" });
  }
  async function leadOf(team: Team) {
    const user = await member();
    await assignTeam({ userId: user.id, team });
    await setLead({ userId: user.id, team, isLead: true });
    return user;
  }

  function chapter(
    actorId: string,
    over: Partial<Parameters<typeof createGuideChapter>[0]> = {},
  ) {
    return createGuideChapter({
      actorId,
      slug: "dishwashing",
      title: "Dishwashing",
      category: "kitchen",
      team: "kitchen",
      kind: "chapter",
      markdown: "Three basins.",
      card: null,
      ...over,
    });
  }

  it("lets a captain write any chapter and a lead only their own team's", async () => {
    const boss = await captain();
    const cook = await leadOf("kitchen");
    const builder = await leadOf("structures");
    const plain = await member();

    expect(await chapter(cook.id)).toMatchObject({ ok: true });
    expect(
      await chapter(builder.id, { slug: "kitchen-two", title: "Kitchen two" }),
    ).toEqual({ ok: false, error: NOT_A_CHAPTER_WRITER });
    expect(
      await chapter(plain.id, { slug: "kitchen-three", title: "Kitchen 3" }),
    ).toEqual({ ok: false, error: NOT_A_CHAPTER_WRITER });
    expect(await chapter(cook.id, { slug: "camp-rules", team: null })).toEqual({
      ok: false,
      error: NOT_A_CAMP_CHAPTER_WRITER,
    });
    expect(
      await chapter(boss.id, { slug: "camp-rules", team: null }),
    ).toMatchObject({ ok: true });
    expect(await chapter(boss.id)).toEqual({
      ok: false,
      error: CHAPTER_SLUG_TAKEN,
    });
    expect((await listGuideDrafts()).map((d) => d.slug)).toEqual([
      "camp-rules",
      "dishwashing",
    ]);
  });

  it("refuses a lead of another team on save, publish and take-off, and changes nothing", async () => {
    const cook = await leadOf("kitchen");
    const builder = await leadOf("structures");
    await chapter(cook.id);
    const before = await getGuideDraft("dishwashing");

    expect(
      await saveGuideChapter({
        actorId: builder.id,
        slug: "dishwashing",
        expectedVersion: 1,
        change: { markdown: "Hijacked." },
      }),
    ).toEqual({ ok: false, error: NOT_A_CHAPTER_WRITER });
    expect(
      await publishGuideChapter({ actorId: builder.id, slug: "dishwashing" }),
    ).toEqual({ ok: false, error: NOT_A_CHAPTER_WRITER });
    expect(
      await unpublishGuideChapter({ actorId: builder.id, slug: "dishwashing" }),
    ).toEqual({ ok: false, error: NOT_A_CHAPTER_WRITER });
    // Nor may the Kitchen lead move it to a team they do not lead.
    expect(
      await saveGuideChapter({
        actorId: cook.id,
        slug: "dishwashing",
        expectedVersion: 1,
        change: { team: "structures" },
      }),
    ).toEqual({ ok: false, error: NOT_A_CHAPTER_WRITER });

    expect(await getGuideDraft("dishwashing")).toEqual(before);
    expect(await listPublishedChapters()).toEqual([]);
  });

  it("sees a lead removed a moment ago as a member", async () => {
    const cook = await leadOf("kitchen");
    await chapter(cook.id);
    await setLead({ userId: cook.id, team: "kitchen", isLead: false });
    expect(
      await saveGuideChapter({
        actorId: cook.id,
        slug: "dishwashing",
        expectedVersion: 1,
        change: { markdown: "Late." },
      }),
    ).toEqual({ ok: false, error: NOT_A_CHAPTER_WRITER });
  });

  it("publishes versions, keeps the old ones, and edits on the save the writer saw", async () => {
    const db = h.db();
    await campYear(db, 2027);
    const boss = await captain();
    const cook = await leadOf("kitchen");
    await chapter(cook.id, { markdown: "   " });

    expect(
      await publishGuideChapter({ actorId: cook.id, slug: "dishwashing" }),
    ).toEqual({ ok: false, error: NOTHING_TO_PUBLISH });

    const saved = await saveGuideChapter({
      actorId: cook.id,
      slug: "dishwashing",
      expectedVersion: 1,
      change: { markdown: "Three basins." },
    });
    expect(saved.ok && saved.document.version).toBe(2);
    expect(
      await saveGuideChapter({
        actorId: cook.id,
        slug: "dishwashing",
        expectedVersion: 1,
        change: { markdown: "Stale." },
      }),
    ).toEqual({ ok: false, error: CHAPTER_EDITED });
    expect(
      await publishGuideChapter({
        actorId: cook.id,
        slug: "dishwashing",
        expectedVersion: 1,
      }),
    ).toEqual({ ok: false, error: CHAPTER_EDITED });

    expect(
      await publishGuideChapter({
        actorId: cook.id,
        slug: "dishwashing",
        expectedVersion: 2,
      }),
    ).toEqual({ ok: true, version: 1, created: true });
    // Publishing again with nothing changed adds no version.
    expect(
      await publishGuideChapter({ actorId: cook.id, slug: "dishwashing" }),
    ).toEqual({ ok: true, version: 1, created: false });

    // A captain edits the lead's chapter: the draft does not reach members
    // until it is published, and the edit is audited (another's chapter).
    await saveGuideChapter({
      actorId: boss.id,
      slug: "dishwashing",
      expectedVersion: 2,
      change: { markdown: "Four basins." },
    });
    expect((await getPublishedChapter("dishwashing"))?.markdown).toBe(
      "Three basins.",
    );
    expect((await getGuideDraft("dishwashing"))?.changedSincePublish).toBe(
      true,
    );
    expect(
      await publishGuideChapter({ actorId: boss.id, slug: "dishwashing" }),
    ).toEqual({ ok: true, version: 2, created: true });

    const live = await getPublishedChapter("dishwashing");
    expect(live).toMatchObject({
      markdown: "Four basins.",
      version: 2,
      cycleReviewed: 2027,
    });
    expect(live?.versions.map((v) => v.version)).toEqual([2, 1]);
    expect((await getChapterVersion("dishwashing", 1))?.markdown).toBe(
      "Three basins.",
    );
    expect(await getChapterVersion("dishwashing", 3)).toBeNull();
    expect((await getGuideDraft("dishwashing"))?.changedSincePublish).toBe(
      false,
    );

    // Taken off: gone from the list, its versions kept.
    await unpublishGuideChapter({ actorId: cook.id, slug: "dishwashing" });
    expect(await listPublishedChapters()).toEqual([]);
    expect(await getPublishedChapter("dishwashing")).toBeNull();
    expect((await getChapterVersion("dishwashing", 2))?.chapter.published).toBe(
      false,
    );
    expect((await listDocumentDrafts()).map((d) => d.slug)).toEqual([
      "dishwashing",
    ]);

    const audit = (
      await db
        .select({
          action: schema.auditLog.action,
          actor: schema.auditLog.actorId,
        })
        .from(schema.auditLog)
    ).filter((a) => a.action.startsWith("document."));
    expect(audit).toEqual([
      { action: "document.created", actor: cook.id },
      { action: "document.published", actor: cook.id },
      { action: "document.published", actor: cook.id },
      { action: "document.updated", actor: boss.id },
      { action: "document.published", actor: boss.id },
      { action: "document.unpublished", actor: cook.id },
    ]);
  });

  it("publishes a duty card only when its card is whole, with no phone number", async () => {
    const boss = await captain();
    const created = await createGuideChapter({
      actorId: boss.id,
      slug: "morning-clean",
      title: "Morning clean",
      category: "on_site",
      team: null,
      kind: "duty_card",
      markdown: "",
      card: { ...CARD, steps: [] },
    });
    expect(created.ok).toBe(true);
    expect(
      await publishGuideChapter({ actorId: boss.id, slug: "morning-clean" }),
    ).toEqual({ ok: false, error: "Add at least one step." });

    await saveGuideChapter({
      actorId: boss.id,
      slug: "morning-clean",
      expectedVersion: 1,
      change: { card: { ...CARD, askRole: "Call 082 555 1234" } },
    });
    const phone = await publishGuideChapter({
      actorId: boss.id,
      slug: "morning-clean",
    });
    expect(phone.ok).toBe(false);
    expect(!phone.ok && phone.error).toMatch(/never a phone number/);

    await saveGuideChapter({
      actorId: boss.id,
      slug: "morning-clean",
      expectedVersion: 2,
      change: { card: CARD },
    });
    expect(
      await publishGuideChapter({ actorId: boss.id, slug: "morning-clean" }),
    ).toMatchObject({ ok: true, version: 1 });
    expect((await getPublishedChapter("morning-clean"))?.card).toEqual(CARD);
    // Search reads the card too.
    expect(
      (await listPublishedChapters({ query: "burn BARREL" })).map(
        (c) => c.slug,
      ),
    ).toEqual(["morning-clean"]);
    expect(await listPublishedChapters({ query: "100%" })).toEqual([]);
  });

  it("prints every published duty card at its published version, and no draft, plain chapter or card taken off", async () => {
    const boss = await captain();
    const card = async (slug: string, title: string) => {
      await createGuideChapter({
        actorId: boss.id,
        slug,
        title,
        category: "on_site",
        team: "kitchen",
        kind: "duty_card",
        markdown: "Gloves in the blue crate.",
        card: CARD,
      });
    };
    await card("evening-clean", "Evening clean");
    await card("morning-clean", "Morning clean");
    await card("gate-shift", "Gate shift");
    await card("half-written", "Half written");
    await chapter(boss.id);
    for (const slug of [
      "evening-clean",
      "morning-clean",
      "gate-shift",
      "dishwashing",
    ]) {
      await publishGuideChapter({ actorId: boss.id, slug });
    }
    await unpublishGuideChapter({ actorId: boss.id, slug: "gate-shift" });
    // An edit not yet published: the print keeps the published words.
    await saveGuideChapter({
      actorId: boss.id,
      slug: "evening-clean",
      expectedVersion: 1,
      change: { card: { ...CARD, steps: ["Not published yet."] } },
    });

    const cards = await listPublishedDutyCardsInFull();
    expect(cards.map((c) => c.slug)).toEqual([
      "evening-clean",
      "morning-clean",
    ]);
    expect(cards[0]).toMatchObject({
      title: "Evening clean",
      team: "kitchen",
      kind: "duty_card",
      version: 1,
      markdown: "Gloves in the blue crate.",
      card: CARD,
    });
  });

  it("lets only a captain keep a chapter members only, audited with the change", async () => {
    const boss = await captain();
    const cook = await leadOf("kitchen");
    await chapter(cook.id);
    expect(
      await setGuideChapterMembersOnly({
        actorId: cook.id,
        slug: "dishwashing",
        membersOnly: true,
      }),
    ).toEqual({ ok: false, error: NOT_A_MEMBERS_ONLY_MARKER });
    expect((await getGuideDraft("dishwashing"))?.membersOnly).toBe(false);
    expect(
      await setGuideChapterMembersOnly({
        actorId: boss.id,
        slug: "dishwashing",
        membersOnly: true,
      }),
    ).toEqual({ ok: true });
    expect((await getGuideDraft("dishwashing"))?.membersOnly).toBe(true);
    const audit = await h
      .db()
      .select()
      .from(schema.auditLog)
      .where(eq(schema.auditLog.action, "document.members_only_set"));
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      actorId: boss.id,
      target: "dishwashing",
      metadata: { title: "Dishwashing", membersOnly: true },
    });
    // The same mark again changes nothing and writes no second row.
    await setGuideChapterMembersOnly({
      actorId: boss.id,
      slug: "dishwashing",
      membersOnly: true,
    });
    expect(
      await h
        .db()
        .select()
        .from(schema.auditLog)
        .where(eq(schema.auditLog.action, "document.members_only_set")),
    ).toHaveLength(1);
  });

  it("keeps a chapter for a new year without a new version", async () => {
    const db = h.db();
    await campYear(db, 2027);
    const cook = await leadOf("kitchen");
    await chapter(cook.id);
    expect(
      await markGuideChapterReviewed({ actorId: cook.id, slug: "dishwashing" }),
    ).toEqual({ ok: false, error: CHAPTER_NOT_PUBLISHED });
    await publishGuideChapter({ actorId: cook.id, slug: "dishwashing" });
    await campYear(db, 2028);
    // The lead's role was for 2027; a captain keeps it for 2028.
    const boss = await captain();
    expect(
      await markGuideChapterReviewed({ actorId: boss.id, slug: "dishwashing" }),
    ).toEqual({ ok: true, cycle: 2028 });
    const live = await getPublishedChapter("dishwashing");
    expect(live).toMatchObject({ version: 1, cycleReviewed: 2028 });
  });

  it("remembers the newest version a member read, and erasure forgets it", async () => {
    const cook = await leadOf("kitchen");
    const reader = await member();
    await chapter(cook.id);
    await publishGuideChapter({ actorId: cook.id, slug: "dishwashing" });
    const live = (await getPublishedChapter("dishwashing"))!;

    expect(await listChapterReads(reader.id)).toEqual({});
    await recordChapterRead({
      userId: reader.id,
      documentId: live.id,
      version: 2,
    });
    await recordChapterRead({
      userId: reader.id,
      documentId: live.id,
      version: 1,
    });
    expect(await listChapterReads(reader.id)).toEqual({ [live.id]: 2 });

    await sanitiseAccount(reader.id);
    expect(await listChapterReads(reader.id)).toEqual({});
  });
});

describe("0082_survival_guide_published_versions", () => {
  const h = useTestDb();
  const MIGRATION_SQL = readFileSync(
    new URL(
      "../../migrations/0082_survival_guide_published_versions.sql",
      import.meta.url,
    ),
    "utf8",
  );

  it("makes a document published before versions existed version 1, once", async () => {
    const db = h.db();
    const writer = await makeUser(db);
    await db.insert(schema.documents).values([
      {
        title: "Old rules",
        slug: "old-rules",
        category: "manual",
        markdown: "Be kind.",
        published: true,
        authorId: writer.id,
      },
      { title: "Old draft", slug: "old-draft", category: "manual" },
    ]);

    await h.client().exec(MIGRATION_SQL);
    await h.client().exec(MIGRATION_SQL);

    const live = await getPublishedChapter("old-rules");
    expect(live).toMatchObject({ markdown: "Be kind.", version: 1 });
    expect(live?.versions).toHaveLength(1);
    expect(await getPublishedChapter("old-draft")).toBeNull();
    expect(
      (await db.select().from(schema.documentVersions)).map((v) => v.version),
    ).toEqual([1]);
  });
});
