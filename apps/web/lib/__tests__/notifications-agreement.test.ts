// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Team } from "@camp404/types";
import { useTestDb } from "../../../../packages/db/src/__tests__/_harness";
import { bothWays, type People } from "./_agreement";

// Announcements and the inbox, through lib/notifications.ts, on the database
// and on the E2E store: who may publish to which audience (canSendToAudience,
// @camp404/core: a captain anyone, a lead only a team they lead), who it
// reaches, what each member's inbox and counts say, reading, and pins. The
// Kitchen lead sends to Kitchen; the Finance lead is a lead of ANOTHER team
// and is refused it. See _agreement.ts.

const mode = vi.hoisted(() => ({ on: false }));
vi.mock("@/lib/test-mode", () => ({
  isE2ETestMode: () => mode.on,
  usesTestStore: () => mode.on,
  TEST_USER_COOKIE: "camp404_test_user",
}));

import { testStore } from "../test-store";
import {
  countUnread,
  countUnreadByTeam,
  countUnreadSplit,
  createAnnouncementDraft,
  deleteAnnouncementDraft,
  explainDraftRefusal,
  getAnnouncementForMember,
  listAnnouncements,
  listInbox,
  listPinnedForUser,
  markAllRead,
  markRead,
  publishAnnouncement,
  setAnnouncementPinned,
  updateAnnouncementDraft,
} from "../notifications";

const KITCHEN = Team.enum.kitchen;

const draft = (
  senderId: string,
  title: string,
  audience: Parameters<typeof createAnnouncementDraft>[0]["audience"],
) =>
  createAnnouncementDraft({
    senderId,
    title,
    body: `${title}, in full.`,
    presentation: "feed",
    audience,
    pinned: false,
  });

/** One member's inbox as they read it: titles, newest first, and counts. */
async function inboxOf(userId: string) {
  const page = await listInbox(userId);
  const split = await countUnreadSplit(userId);
  return {
    titles: page.items.map((i) => i.title),
    unread: await countUnread(userId),
    split: split.total,
    byTeam: await countUnreadByTeam(userId),
  };
}

const sentBy = async (p: People) =>
  (await listAnnouncements()).map((a) => ({
    title: a.title,
    published: a.publishedAt !== null,
    byCaptain: a.senderId === p.captain,
  }));

describe("announcements and the inbox: the database and the test store agree", () => {
  const h = useTestDb();
  beforeEach(() => {
    mode.on = false;
    testStore.reset();
  });

  it("publishes only to an audience the sender may address, and delivers it to that audience", async () => {
    const { db, store } = await bothWays(mode, h, async (p, seed) => {
      await seed.join(p.member, KITCHEN);
      const camp = await draft(p.captain, "Gate opens", { scope: "everyone" });
      const kitchen = await draft(p.kitchenLead, "Soup tonight", {
        scope: "team",
        team: KITCHEN,
      });
      const notMine = await draft(p.financeLead, "Kitchen news", {
        scope: "team",
        team: KITCHEN,
      });
      const wide = await draft(p.kitchenLead, "To everyone", {
        scope: "everyone",
      });
      const campSent = await publishAnnouncement({
        id: camp.id,
        senderId: p.captain,
      });
      const kitchenSent = await publishAnnouncement({
        id: kitchen.id,
        senderId: p.kitchenLead,
      });
      const notMineSent = await publishAnnouncement({
        id: notMine.id,
        senderId: p.financeLead,
      });
      const wideSent = await publishAnnouncement({
        id: wide.id,
        senderId: p.kitchenLead,
      });
      const why = await explainDraftRefusal(wide.id, p.kitchenLead);
      const stranger = await publishAnnouncement({
        id: kitchen.id,
        senderId: p.member,
      });
      const edited = await updateAnnouncementDraft({
        id: wide.id,
        senderId: p.kitchenLead,
        title: "To Kitchen",
        body: "Changed.",
        presentation: "feed",
        audience: { scope: "team", team: KITCHEN },
        pinned: false,
      });
      const deleted = await deleteAnnouncementDraft({
        id: notMine.id,
        senderId: p.financeLead,
      });
      return {
        campSent,
        kitchenSent,
        notMineSent,
        wideSent,
        why,
        stranger,
        edited,
        deleted,
        sent: await sentBy(p),
        member: await inboxOf(p.member),
        other: await inboxOf(p.other),
        captain: await inboxOf(p.captain),
      };
    });
    expect(db).toMatchObject({
      campSent: { ok: true, recipientCount: 4 },
      kitchenSent: { ok: true, recipientCount: 1 },
      notMineSent: { ok: false },
      wideSent: { ok: false },
      edited: true,
      deleted: true,
      member: {
        titles: ["Soup tonight", "Gate opens"],
        unread: 2,
        split: 2,
      },
      other: { titles: ["Gate opens"], unread: 1 },
      captain: { titles: [], unread: 0 },
    });
    expect(store).toEqual(db);
  });

  it("reads, marks read and pins the same way", async () => {
    const { db, store } = await bothWays(mode, h, async (p, seed) => {
      await seed.join(p.member, KITCHEN);
      const camp = await draft(p.captain, "Gate opens", { scope: "everyone" });
      await publishAnnouncement({ id: camp.id, senderId: p.captain });
      const kitchen = await draft(p.kitchenLead, "Soup tonight", {
        scope: "team",
        team: KITCHEN,
      });
      await publishAnnouncement({ id: kitchen.id, senderId: p.kitchenLead });
      const reading = await getAnnouncementForMember(p.member, camp.id);
      const notTheirs = await getAnnouncementForMember(p.other, kitchen.id);
      const firstPage = await listInbox(p.member);
      await markRead(
        p.member,
        firstPage.items
          .filter((i) => i.title === "Soup tonight")
          .map((i) => i.id),
      );
      const afterOne = await inboxOf(p.member);
      const cleared = await markAllRead(p.member);
      const leadPin = await setAnnouncementPinned({
        id: kitchen.id,
        actorId: p.kitchenLead,
        pinned: true,
      });
      const otherLeadPin = await setAnnouncementPinned({
        id: kitchen.id,
        actorId: p.financeLead,
        pinned: false,
      });
      const twice = await setAnnouncementPinned({
        id: kitchen.id,
        actorId: p.captain,
        pinned: true,
      });
      return {
        reading: reading && { title: reading.title, body: reading.body },
        notTheirs,
        afterOne,
        cleared,
        afterAll: await inboxOf(p.member),
        leadPin,
        otherLeadPin,
        twice,
        pinned: (await listPinnedForUser(p.member)).map((a) => a.title),
        othersPins: await listPinnedForUser(p.other),
      };
    });
    expect(db).toMatchObject({
      reading: { title: "Gate opens" },
      notTheirs: null,
      afterOne: { unread: 1 },
      cleared: 1,
      afterAll: { unread: 0 },
      leadPin: { ok: true },
      otherLeadPin: { ok: false },
      twice: { ok: false },
      pinned: ["Soup tonight"],
      othersPins: [],
    });
    expect(store).toEqual(db);
  });
});
