// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GUIDE_CATEGORIES, Team, ViewerRank } from "@camp404/types";
import { useTestDb } from "../../../../packages/db/src/__tests__/_harness";
import { bothWays, type People } from "./_agreement";

// Ctrl+K's camp entries (#326, #350), through lib/search.ts, on the database
// and on the E2E store: the same chapters, tasks, meetings, announcements and
// people come back for the same words, in the same order, and each viewer gets
// only what they may open (a meeting's notes reach its team and the captains;
// an announcement reaches the people it was sent to). Each side writes its
// rows through the facades themselves. See _agreement.ts.

const mode = vi.hoisted(() => ({ on: false }));
vi.mock("@/lib/test-mode", () => ({
  isE2ETestMode: () => mode.on,
  usesTestStore: () => mode.on,
  TEST_USER_COOKIE: "camp404_test_user",
}));

import { testStore } from "../test-store";
import { createGuideChapter, publishGuideChapter } from "../guide";
import { createMeetingNote } from "../meeting-notes";
import { createAnnouncementDraft, publishAnnouncement } from "../notifications";
import { addTask } from "../tasks";
import { resolveRecent, searchCamp } from "../search";

const KITCHEN = Team.enum.kitchen;
const FINANCE = Team.enum.finance;

const viewers = (p: People) => ({
  captain: {
    userId: p.captain,
    rank: ViewerRank.enum.captain,
    runsLounge: true,
    reviewsRecipes: true,
  },
  member: {
    userId: p.member,
    rank: ViewerRank.enum.camp_member,
    runsLounge: false,
    reviewsRecipes: false,
  },
  other: {
    userId: p.other,
    rank: ViewerRank.enum.camp_member,
    runsLounge: false,
    reviewsRecipes: false,
  },
});

describe("Ctrl+K search: the database and the test store agree", () => {
  const h = useTestDb();
  beforeEach(() => {
    mode.on = false;
    testStore.reset();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2027-03-01T10:00:00Z"));
  });

  it("finds the same entries for the same words, cut to what each viewer may open", async () => {
    const { db, store } = await bothWays(mode, h, async (p, seed) => {
      vi.setSystemTime(new Date("2027-03-01T10:00:00Z"));
      await seed.join(p.member, KITCHEN);
      await createGuideChapter({
        actorId: p.captain,
        slug: "stove-safety",
        kind: "chapter",
        title: "Stove safety",
        category: GUIDE_CATEGORIES[0]!,
        team: null,
        markdown: "Keep the stove clean.",
        card: null,
      });
      await publishGuideChapter({ actorId: p.captain, slug: "stove-safety" });
      await addTask({
        creatorId: p.kitchenLead,
        title: "Stove repair",
        description: null,
        team: KITCHEN,
        assigneeId: p.member,
        dueAt: null,
      });
      await createMeetingNote({
        actorId: p.kitchenLead,
        team: KITCHEN,
        title: "Stove meeting",
        heldAt: new Date("2027-03-02T17:00:00Z"),
        calendarEvent: null,
        agenda: "",
        notes: "",
        attendeeIds: [],
        decisions: [],
        activeTeams: [KITCHEN, FINANCE],
      });
      const sent = await createAnnouncementDraft({
        senderId: p.kitchenLead,
        title: "Stove news",
        body: "It works.",
        presentation: "feed",
        audience: { scope: "team", team: KITCHEN },
        pinned: false,
      });
      await publishAnnouncement({ id: sent.id, senderId: p.kitchenLead });
      const v = viewers(p);
      const found = async (viewer: (typeof v)[keyof typeof v], words: string) =>
        (await searchCamp(viewer, words)).map((e) => ({
          kind: e.kind,
          title: e.title,
          detail: e.detail,
        }));
      const forMember = await searchCamp(v.member, "stove");
      return {
        captain: await found(v.captain, "stove"),
        member: forMember.map((e) => ({ kind: e.kind, title: e.title })),
        other: await found(v.other, "stove"),
        people: await found(v.member, "nova"),
        nothing: await found(v.member, "zebra"),
        // The order is the caller's to restore, so only which come back.
        recent: (
          await resolveRecent(
            v.other,
            forMember.map((e) => ({ kind: e.kind, id: e.id })),
          )
        )
          .map((e) => e.title)
          .sort(),
      };
    });
    // Kind by kind, as the database's branches answer; the announcement
    // reaches only the Kitchen it was sent to.
    expect(db).toMatchObject({
      captain: [
        { kind: "chapter", title: "Stove safety" },
        { kind: "meeting", title: "Stove meeting" },
        { kind: "task", title: "Stove repair" },
      ],
      member: [
        { kind: "chapter" },
        { kind: "meeting" },
        { kind: "task" },
        { kind: "announcement", title: "Stove news" },
      ],
      other: [{ kind: "chapter" }, { kind: "meeting" }, { kind: "task" }],
      people: [{ kind: "person", title: "Nova" }],
      nothing: [],
      recent: ["Stove meeting", "Stove repair", "Stove safety"],
    });
    expect(store).toEqual(db);
    vi.useRealTimers();
  });
});
