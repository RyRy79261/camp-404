import { readFileSync } from "node:fs";
import { SQL, StringChunk, eq, is } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { MEMBERS_GAP_LINE } from "@camp404/core";
import {
  DUTY_CARD_NO_MEMBERS_ONLY,
  GUIDE_CATEGORIES,
  MEMBERS_ONLY_UNCLOSED,
  type DutyCardDraft,
  type GuideCategory,
  type Team,
} from "@camp404/types";
import {
  NOT_A_SECTION,
  NOT_A_SECTION_SWITCHER,
  createGuideChapter,
  getGuideDraft,
  getPublicChapter,
  listGuideSections,
  listPublicChapters,
  listPublishedChapters,
  publishGuideChapter,
  saveGuideChapter,
  setGuideChapterMembersOnly,
  setGuideSectionPublic,
  unpublishGuideChapter,
} from "../documents";
import * as schema from "../schema";
import { assignTeam, setLead } from "../team-memberships";
import { useTestDb } from "./_harness";
import { makeUser } from "./_factories";

// survival-guide.camp-404.com (#250) on a real Postgres (PGlite). A chapter is
// public only when it is published, its section is public and it is not kept
// members only; the public reads cut every members-only part before they
// return; only a captain flips a section or the mark, each audited with its
// change. Every condition below was broken on purpose once (its clause
// dropped from the query) and the test went red.

// One of the guide's own section keys, from the list the code uses.
const [BEFORE, ON_SITE, KITCHEN] = GUIDE_CATEGORIES as unknown as [
  GuideCategory,
  GuideCategory,
  GuideCategory,
];

const CANARY = "CANARY-7f3a91";

const CONVOY = [
  "The drive is part of the burn.",
  "",
  "## Tickets and passes",
  "",
  "Every person needs a ticket.",
  "",
  ":::members",
  "## The convoy plan",
  "",
  `${CANARY} the convoy meets at the Ceres fuel station at 07:00.`,
  ":::",
  "",
  "## The dirt road",
  "",
  "Keep under 60 km/h.",
].join("\n");

const CARD: DutyCardDraft = {
  subRoles: [{ name: "Dishes", min: 2, max: 3 }],
  steps: ["Wash, rinse, sanitise."],
  hardRules: [],
  checklist: [],
  askRole: "the Kitchen lead",
};

describe("the public site's reads and switches", () => {
  const h = useTestDb();

  async function captain() {
    return makeUser(h.db(), { rank: "captain", approvalStatus: "approved" });
  }
  async function leadOf(team: Team) {
    const user = await makeUser(h.db(), { approvalStatus: "approved" });
    await assignTeam({ userId: user.id, team });
    await setLead({ userId: user.id, team, isLead: true });
    return user;
  }

  async function published(
    actorId: string,
    slug: string,
    category: string,
    markdown = "Words for anyone.",
  ) {
    const made = await createGuideChapter({
      actorId,
      slug,
      title: slug,
      category,
      team: null,
      kind: "chapter",
      markdown,
      card: null,
    });
    expect(made.ok).toBe(true);
    expect(await publishGuideChapter({ actorId, slug })).toMatchObject({
      ok: true,
    });
  }

  async function auditRows(action: string) {
    return h
      .db()
      .select()
      .from(schema.auditLog)
      .where(eq(schema.auditLog.action, action));
  }

  it("never lets a members-only part out of the public reads", async () => {
    const boss = await captain();
    await published(boss.id, "getting-to-the-tankwa", BEFORE, CONVOY);
    await setGuideSectionPublic({
      actorId: boss.id,
      category: BEFORE,
      public: true,
    });

    const one = await getPublicChapter("getting-to-the-tankwa");
    const all = await listPublicChapters();
    expect(one?.markdown).toContain("## The dirt road");
    expect(one?.markdown).toContain(MEMBERS_GAP_LINE);
    for (const read of [one, all]) {
      const text = JSON.stringify(read);
      expect(text).not.toContain(CANARY);
      expect(text).not.toContain("convoy");
      expect(text).not.toContain(":::");
    }
    // Members still read the whole text in the app.
    expect(
      (await listPublishedChapters()).find(
        (c) => c.slug === "getting-to-the-tankwa",
      )?.hasMembersOnlyPart,
    ).toBe(true);
  });

  it("shows a chapter only when published, in a public section and not kept members only", async () => {
    const boss = await captain();
    await published(boss.id, "packing-list", BEFORE);
    await published(boss.id, "moop", ON_SITE); // its section stays private
    await published(boss.id, "fridge-rules", BEFORE);
    await setGuideChapterMembersOnly({
      actorId: boss.id,
      slug: "fridge-rules",
      membersOnly: true,
    });
    await published(boss.id, "taken-off", BEFORE);
    await unpublishGuideChapter({ actorId: boss.id, slug: "taken-off" });
    await createGuideChapter({
      actorId: boss.id,
      slug: "only-a-draft",
      title: "Only a draft",
      category: BEFORE,
      team: null,
      kind: "chapter",
      markdown: "Not yet.",
      card: null,
    });
    // A topic the Claude connector typed as free text has no section.
    await published(boss.id, "free-text", "manual");

    expect(await listPublicChapters()).toEqual([]);
    await setGuideSectionPublic({
      actorId: boss.id,
      category: BEFORE,
      public: true,
    });

    expect((await listPublicChapters()).map((c) => c.slug)).toEqual([
      "packing-list",
    ]);
    for (const slug of [
      "moop",
      "fridge-rules",
      "taken-off",
      "only-a-draft",
      "free-text",
      "never-used",
    ]) {
      expect(await getPublicChapter(slug)).toBeNull();
    }
    const live = await getPublicChapter("packing-list");
    expect(live).toMatchObject({ category: BEFORE, version: 1 });
    // Nothing of who wrote it.
    expect(Object.keys(live!).sort()).toEqual(
      [
        "card",
        "category",
        "cycleReviewed",
        "kind",
        "markdown",
        "publishedAt",
        "slug",
        "team",
        "title",
        "version",
      ].sort(),
    );
  });

  it("serves the published version, never a newer draft", async () => {
    const boss = await captain();
    await published(boss.id, "packing-list", BEFORE, "Pack a hat.");
    await setGuideSectionPublic({
      actorId: boss.id,
      category: BEFORE,
      public: true,
    });
    await saveGuideChapter({
      actorId: boss.id,
      slug: "packing-list",
      expectedVersion: 1,
      change: { markdown: "DRAFT words nobody published." },
    });
    expect((await getPublicChapter("packing-list"))?.markdown).toBe(
      "Pack a hat.",
    );
    // Moving the draft to a private topic does not move the live version.
    await saveGuideChapter({
      actorId: boss.id,
      slug: "packing-list",
      expectedVersion: 2,
      change: { category: ON_SITE },
    });
    expect(await getPublicChapter("packing-list")).not.toBeNull();
    // Publishing it there takes it off the public site.
    await publishGuideChapter({ actorId: boss.id, slug: "packing-list" });
    expect(await getPublicChapter("packing-list")).toBeNull();
  });

  it("lets only a captain flip a section, audited with the chapters that went out", async () => {
    const boss = await captain();
    const cook = await leadOf("kitchen");
    await published(boss.id, "washing-up", KITCHEN);
    await published(boss.id, "fridge-rules", KITCHEN);
    await setGuideChapterMembersOnly({
      actorId: boss.id,
      slug: "fridge-rules",
      membersOnly: true,
    });

    expect(
      await setGuideSectionPublic({
        actorId: cook.id,
        category: KITCHEN,
        public: true,
      }),
    ).toEqual({ ok: false, error: NOT_A_SECTION_SWITCHER });
    expect(
      await setGuideSectionPublic({
        actorId: boss.id,
        category: "manual",
        public: true,
      }),
    ).toEqual({ ok: false, error: NOT_A_SECTION });
    expect(await listPublicChapters()).toEqual([]);
    expect(await auditRows("guide.section_public_set")).toEqual([]);

    expect(
      await setGuideSectionPublic({
        actorId: boss.id,
        category: KITCHEN,
        public: true,
      }),
    ).toEqual({
      ok: true,
      chapters: [{ slug: "washing-up", title: "washing-up" }],
    });
    expect(
      (await listGuideSections()).find((s) => s.category === KITCHEN),
    ).toEqual({ category: KITCHEN, public: true });
    // Flipping it to where it is already writes nothing.
    await setGuideSectionPublic({
      actorId: boss.id,
      category: KITCHEN,
      public: true,
    });
    // Off is a kill switch: everything in it goes at once.
    await setGuideSectionPublic({
      actorId: boss.id,
      category: KITCHEN,
      public: false,
    });
    expect(await listPublicChapters()).toEqual([]);

    const rows = await auditRows("guide.section_public_set");
    expect(rows.map((r) => r.metadata)).toEqual([
      {
        category: KITCHEN,
        public: true,
        chapters: [{ slug: "washing-up", title: "washing-up" }],
      },
      {
        category: KITCHEN,
        public: false,
        chapters: [{ slug: "washing-up", title: "washing-up" }],
      },
    ]);
    expect(rows.every((r) => r.actorId === boss.id)).toBe(true);
  });

  it("publishes straight onto a public section, and the audit row says so", async () => {
    const boss = await captain();
    await setGuideSectionPublic({
      actorId: boss.id,
      category: BEFORE,
      public: true,
    });
    await published(boss.id, "getting-to-the-tankwa", BEFORE, CONVOY);
    expect(await getPublicChapter("getting-to-the-tankwa")).not.toBeNull();
    const draft = await getGuideDraft("getting-to-the-tankwa");
    expect(draft).toMatchObject({
      sectionPublic: true,
      liveSectionPublic: true,
      liveMembersOnlyParts: 1,
      membersOnly: false,
    });
    const [row] = await auditRows("document.published");
    expect(row?.metadata).toMatchObject({ public: true, membersOnlyParts: 1 });
  });

  it("refuses to publish a broken Members only part, or one on a duty card", async () => {
    const boss = await captain();
    await createGuideChapter({
      actorId: boss.id,
      slug: "unclosed",
      title: "Unclosed",
      category: BEFORE,
      team: null,
      kind: "chapter",
      markdown: "Open.\n\n:::members\nSecret.",
      card: null,
    });
    expect(
      await publishGuideChapter({ actorId: boss.id, slug: "unclosed" }),
    ).toEqual({ ok: false, error: MEMBERS_ONLY_UNCLOSED });

    await createGuideChapter({
      actorId: boss.id,
      slug: "evening-clean-up",
      title: "Evening clean-up",
      category: KITCHEN,
      team: "kitchen",
      kind: "duty_card",
      markdown: "Good to know.\n\n:::members\nThe code is 1234.\n:::",
      card: CARD,
    });
    expect(
      await publishGuideChapter({ actorId: boss.id, slug: "evening-clean-up" }),
    ).toEqual({ ok: false, error: DUTY_CARD_NO_MEMBERS_ONLY });
  });
});

describe("0099_seed_private_guide_sections", () => {
  const h = useTestDb();
  const MIGRATION_SQL = readFileSync(
    new URL(
      "../../migrations/0099_seed_private_guide_sections.sql",
      import.meta.url,
    ),
    "utf8",
  );

  it("starts every section private, once, and keeps a switch already flipped", async () => {
    const db = h.db();
    await db.delete(schema.guideSections);
    await db.insert(schema.guideSections).values({
      category: GUIDE_CATEGORIES[1],
      public: true,
    });
    await h.client().exec(MIGRATION_SQL);
    await h.client().exec(MIGRATION_SQL);
    const rows = await db.select().from(schema.guideSections);
    expect(rows.map((r) => r.category).sort()).toEqual(
      [...GUIDE_CATEGORIES].sort(),
    );
    expect(rows.filter((r) => r.public).map((r) => r.category)).toEqual([
      GUIDE_CATEGORIES[1],
    ]);
  });
});

describe("guide_sections' CHECK", () => {
  it("names exactly the guide's sections", () => {
    const [check] = getTableConfig(schema.guideSections).checks;
    let text = "";
    const walk = (chunk: unknown): void => {
      if (is(chunk, SQL)) for (const inner of chunk.queryChunks) walk(inner);
      else if (is(chunk, StringChunk)) text += chunk.value.join("");
    };
    walk(check?.value);
    const keys = [...text.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
    expect(keys).toEqual([...GUIDE_CATEGORIES]);
  });
});
