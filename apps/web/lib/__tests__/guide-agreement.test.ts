// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  CHAPTER_EDITED,
  CHAPTER_GONE,
  CHAPTER_NOT_PUBLISHED,
  CHAPTER_SLUG_TAKEN,
  NOTHING_TO_PUBLISH,
  NOT_A_CAMP_CHAPTER_WRITER,
  NOT_A_CHAPTER_WRITER,
  NOT_A_MEMBERS_ONLY_MARKER,
  NOT_A_SECTION,
  NOT_A_SECTION_SWITCHER,
} from "@camp404/db/documents";
import { GUIDE_CATEGORIES, Team } from "@camp404/types";
import { useTestDb } from "../../../../packages/db/src/__tests__/_harness";
import { YEAR, bothWays } from "./_agreement";

// The Survival Guide (#250), through lib/guide.ts, on the database and on the
// E2E store: who may write which chapter, what may be published and when a
// publish makes a new version, the drafts, the reads, and the captains' public
// switches. Who may write is guideChapterRefusal, what may go out is
// chapterPublishProblem and whether a version is new is sameChapterText, all
// in @camp404/core. The chapters here are the Kitchen's, so the Kitchen lead
// writes them and the Finance lead (a lead of ANOTHER team) is refused. The
// public site's members-only cut is not on this path (apps/guide reads the
// database only). See _agreement.ts.

const mode = vi.hoisted(() => ({ on: false }));
vi.mock("@/lib/test-mode", () => ({
  isE2ETestMode: () => mode.on,
  usesTestStore: () => mode.on,
  TEST_USER_COOKIE: "camp404_test_user",
}));

import { testStore } from "../test-store";
import {
  createGuideChapter,
  getChapterVersion,
  getGuideDraft,
  getPublishedChapter,
  listChapterReads,
  listChapterVersions,
  listGuideDrafts,
  listGuideSections,
  listPublishedChapters,
  listPublishedDutyCards,
  markGuideChapterReviewed,
  publishGuideChapter,
  recordChapterRead,
  saveGuideChapter,
  setGuideChapterMembersOnly,
  setGuideSectionPublic,
  unpublishGuideChapter,
} from "../guide";

const KITCHEN = Team.enum.kitchen;
const FINANCE = Team.enum.finance;
const [BEFORE, ON_SITE] = GUIDE_CATEGORIES;

const chapter = (
  actorId: string,
  slug: string,
  team: Team | null,
  markdown = "",
  kind: "chapter" | "duty_card" = "chapter",
) => ({
  actorId,
  slug,
  kind,
  title: `The ${slug}`,
  category: BEFORE!,
  team,
  markdown,
  card: null,
});

const refused = (error: string) => ({ ok: false, error });

describe("the Survival Guide: the database and the test store agree", () => {
  const h = useTestDb();
  beforeEach(() => {
    mode.on = false;
    testStore.reset();
  });

  it("lets a captain write any chapter and a lead only their own team's, with one slug each and a compare-and-set on the version", async () => {
    const { db, store } = await bothWays(mode, h, async (p) => {
      const camp = await createGuideChapter(chapter(p.captain, "gate", null));
      const kitchen = await createGuideChapter(
        chapter(p.kitchenLead, "stove", KITCHEN, "Light it."),
      );
      const otherLead = await createGuideChapter(
        chapter(p.financeLead, "pots", KITCHEN),
      );
      const leadCamp = await createGuideChapter(
        chapter(p.kitchenLead, "camp", null),
      );
      const member = await createGuideChapter(
        chapter(p.member, "mine", KITCHEN),
      );
      const taken = await createGuideChapter(
        chapter(p.captain, "stove", KITCHEN),
      );
      const saved = await saveGuideChapter({
        actorId: p.kitchenLead,
        slug: "stove",
        expectedVersion: 1,
        change: { markdown: "Light it slowly." },
      });
      const stale = await saveGuideChapter({
        actorId: p.kitchenLead,
        slug: "stove",
        expectedVersion: 1,
        change: { markdown: "Again." },
      });
      const moveAway = await saveGuideChapter({
        actorId: p.kitchenLead,
        slug: "stove",
        expectedVersion: 2,
        change: { team: FINANCE },
      });
      const otherSaves = await saveGuideChapter({
        actorId: p.financeLead,
        slug: "stove",
        expectedVersion: 2,
        change: { title: "Mine now" },
      });
      const gone = await saveGuideChapter({
        actorId: p.captain,
        slug: "nowhere",
        expectedVersion: 1,
        change: { title: "x" },
      });
      return {
        camp: camp.ok,
        kitchen: kitchen.ok,
        otherLead,
        leadCamp,
        member,
        taken,
        saved: saved.ok && {
          version: saved.document.version,
          markdown: saved.document.markdown,
        },
        stale,
        moveAway,
        otherSaves,
        gone,
        drafts: (await listGuideDrafts()).map((d) => ({
          slug: d.slug,
          team: d.team,
          version: d.version,
          authorName: d.authorName,
          published: d.published,
          changedSincePublish: d.changedSincePublish,
        })),
      };
    });
    expect(db).toMatchObject({
      camp: true,
      kitchen: true,
      otherLead: refused(NOT_A_CHAPTER_WRITER),
      leadCamp: refused(NOT_A_CAMP_CHAPTER_WRITER),
      member: refused(NOT_A_CHAPTER_WRITER),
      taken: refused(CHAPTER_SLUG_TAKEN),
      saved: { version: 2, markdown: "Light it slowly." },
      stale: refused(CHAPTER_EDITED),
      moveAway: refused(NOT_A_CHAPTER_WRITER),
      otherSaves: refused(NOT_A_CHAPTER_WRITER),
      gone: refused(CHAPTER_GONE),
      drafts: [
        { slug: "gate", authorName: "Cap", changedSincePublish: true },
        { slug: "stove", version: 2, authorName: "Cook" },
      ],
    });
    expect(store).toEqual(db);
  });

  it("publishes only what may go out, makes a version only when the text changed, and keeps the history", async () => {
    const { db, store } = await bothWays(mode, h, async (p) => {
      await createGuideChapter(chapter(p.kitchenLead, "stove", KITCHEN));
      await createGuideChapter(
        chapter(p.captain, "fire-duty", KITCHEN, "", "duty_card"),
      );
      const empty = await publishGuideChapter({
        actorId: p.kitchenLead,
        slug: "stove",
      });
      const card = await publishGuideChapter({
        actorId: p.captain,
        slug: "fire-duty",
      });
      const notReviewable = await markGuideChapterReviewed({
        actorId: p.kitchenLead,
        slug: "stove",
      });
      await saveGuideChapter({
        actorId: p.kitchenLead,
        slug: "stove",
        expectedVersion: 1,
        change: { markdown: "Light it." },
      });
      const first = await publishGuideChapter({
        actorId: p.kitchenLead,
        slug: "stove",
        expectedVersion: 2,
      });
      const again = await publishGuideChapter({
        actorId: p.kitchenLead,
        slug: "stove",
      });
      const otherLead = await publishGuideChapter({
        actorId: p.financeLead,
        slug: "stove",
      });
      await saveGuideChapter({
        actorId: p.captain,
        slug: "stove",
        expectedVersion: 2,
        change: { markdown: "Light it slowly.", category: ON_SITE! },
      });
      const unpublishedChange = (await getGuideDraft("stove"))
        ?.changedSincePublish;
      const second = await publishGuideChapter({
        actorId: p.captain,
        slug: "stove",
      });
      const reviewed = await markGuideChapterReviewed({
        actorId: p.kitchenLead,
        slug: "stove",
      });
      const published = await getPublishedChapter("stove");
      const oldOne = await getChapterVersion("stove", 1);
      const listed = await listPublishedChapters({ query: "slowly" });
      const off = await unpublishGuideChapter({
        actorId: p.kitchenLead,
        slug: "stove",
      });
      return {
        empty,
        card: card.ok,
        notReviewable,
        first,
        again,
        otherLead,
        unpublishedChange,
        second,
        reviewed,
        published: published && {
          title: published.title,
          category: published.category,
          version: published.version,
          markdown: published.markdown,
          sectionPublic: published.sectionPublic,
          cycleReviewed: published.cycleReviewed,
          versions: published.versions.map((v) => ({
            version: v.version,
            publishedByName: v.publishedByName,
          })),
        },
        oldOne: oldOne && {
          version: oldOne.version,
          category: oldOne.category,
          markdown: oldOne.markdown,
          chapter: oldOne.chapter,
        },
        history: (await listChapterVersions(published!.id)).map(
          (v) => v.version,
        ),
        listed: listed.map((c) => c.slug),
        off,
        afterOff: await getPublishedChapter("stove"),
        dutyCards: await listPublishedDutyCards(),
      };
    });
    expect(db).toMatchObject({
      empty: refused(NOTHING_TO_PUBLISH),
      card: false,
      notReviewable: refused(CHAPTER_NOT_PUBLISHED),
      first: { ok: true, version: 1, created: true },
      again: { ok: true, version: 1, created: false },
      otherLead: refused(NOT_A_CHAPTER_WRITER),
      unpublishedChange: true,
      second: { ok: true, version: 2, created: true },
      reviewed: { ok: true, cycle: YEAR },
      published: {
        category: ON_SITE,
        version: 2,
        markdown: "Light it slowly.",
        sectionPublic: false,
        cycleReviewed: YEAR,
        versions: [
          { version: 2, publishedByName: "Cap" },
          { version: 1, publishedByName: "Cook" },
        ],
      },
      oldOne: { version: 1, category: BEFORE, markdown: "Light it." },
      history: [2, 1],
      listed: ["stove"],
      off: { ok: true },
      afterOff: null,
      dutyCards: [],
    });
    expect(store).toEqual(db);
  });

  it("leaves the public switches and the members-only mark to captains, and records each member's reads", async () => {
    const { db, store } = await bothWays(mode, h, async (p) => {
      await createGuideChapter(
        chapter(p.kitchenLead, "stove", KITCHEN, "Light it."),
      );
      await createGuideChapter(chapter(p.captain, "gate", null, "Open it."));
      const stove = await publishGuideChapter({
        actorId: p.kitchenLead,
        slug: "stove",
      });
      await publishGuideChapter({ actorId: p.captain, slug: "gate" });
      const leadMark = await setGuideChapterMembersOnly({
        actorId: p.kitchenLead,
        slug: "stove",
        membersOnly: true,
      });
      const marked = await setGuideChapterMembersOnly({
        actorId: p.captain,
        slug: "gate",
        membersOnly: true,
      });
      const markGone = await setGuideChapterMembersOnly({
        actorId: p.captain,
        slug: "nowhere",
        membersOnly: true,
      });
      const leadSection = await setGuideSectionPublic({
        actorId: p.kitchenLead,
        category: BEFORE!,
        public: true,
      });
      const notASection = await setGuideSectionPublic({
        actorId: p.captain,
        category: "lunch",
        public: true,
      });
      const opened = await setGuideSectionPublic({
        actorId: p.captain,
        category: BEFORE!,
        public: true,
      });
      const openAgain = await setGuideSectionPublic({
        actorId: p.captain,
        category: BEFORE!,
        public: true,
      });
      const docId = (await getPublishedChapter("stove"))!.id;
      await recordChapterRead({
        userId: p.member,
        documentId: docId,
        version: 1,
      });
      await recordChapterRead({
        userId: p.member,
        documentId: docId,
        version: 1,
      });
      return {
        stove: stove.ok,
        leadMark,
        marked,
        markGone,
        leadSection,
        notASection,
        opened,
        openAgain,
        sections: await listGuideSections(),
        reads: Object.values(await listChapterReads(p.member)),
        othersReads: await listChapterReads(p.other),
        drafts: (await listGuideDrafts()).map((d) => ({
          slug: d.slug,
          membersOnly: d.membersOnly,
          sectionPublic: d.sectionPublic,
          liveSectionPublic: d.liveSectionPublic,
        })),
      };
    });
    expect(db).toMatchObject({
      stove: true,
      leadMark: refused(NOT_A_MEMBERS_ONLY_MARKER),
      marked: { ok: true },
      markGone: refused(CHAPTER_GONE),
      leadSection: refused(NOT_A_SECTION_SWITCHER),
      notASection: refused(NOT_A_SECTION),
      opened: { ok: true, chapters: [{ slug: "stove", title: "The stove" }] },
      openAgain: { ok: true, chapters: [] },
      reads: [1],
      othersReads: {},
      drafts: [
        { slug: "gate", membersOnly: true, sectionPublic: true },
        { slug: "stove", membersOnly: false, liveSectionPublic: true },
      ],
    });
    expect(store).toEqual(db);
  });
});
