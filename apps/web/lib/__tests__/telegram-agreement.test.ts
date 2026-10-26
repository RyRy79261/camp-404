// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useTestDb } from "../../../../packages/db/src/__tests__/_harness";
import { bothWays } from "./_agreement";

// A member's own Telegram connection (Ol' Jeb), through
// lib/telegram-connection.ts, on the database and on the E2E store: a link
// code connects once, the setting and Disconnect, and a second use of a code.
// See _agreement.ts.

const mode = vi.hoisted(() => ({ on: false }));
vi.mock("@/lib/test-mode", () => ({
  isE2ETestMode: () => mode.on,
  usesTestStore: () => mode.on,
  TEST_USER_COOKIE: "camp404_test_user",
}));

import { testStore } from "../test-store";
import {
  connectTelegram,
  createTelegramLinkCode,
  disconnectTelegram,
  getTelegramConnection,
  setTelegramNotices,
} from "../telegram-connection";
import {
  addTelegramPlace,
  getTelegramPostSettings,
  listTelegramPlaces,
  removeTelegramPlace,
  setTelegramPostSettings,
} from "../telegram-places";
import {
  postQuestionnaireInTelegram,
  questionnairePostDialog,
} from "../telegram-questionnaire-post";

describe("a member's Telegram: the database and the test store agree", () => {
  const h = useTestDb();
  beforeEach(() => {
    mode.on = false;
    testStore.reset();
  });

  it("connects by a code once, keeps the setting, and disconnects", async () => {
    const { db, store } = await bothWays(mode, h, async (p) => {
      const before = await getTelegramConnection(p.member);
      const code = await createTelegramLinkCode(p.member);
      const first = await connectTelegram({
        code,
        telegramUserId: "777",
        username: "cloud_404",
      });
      const again = await connectTelegram({
        code,
        telegramUserId: "777",
        username: "cloud_404",
      });
      const unknown = await connectTelegram({
        code: "not-a-code",
        telegramUserId: "777",
        username: null,
      });
      const connected = await getTelegramConnection(p.member);
      await setTelegramNotices(p.member, "all");
      const everything = await getTelegramConnection(p.member);
      await disconnectTelegram(p.member);
      const after = await getTelegramConnection(p.member);
      return {
        before,
        first: first.ok,
        again,
        unknown,
        connected,
        everything,
        after,
      };
    });
    expect(store).toEqual(db);
    expect(db).toMatchObject({
      before: { connected: false, handle: null, notices: "mine" },
      first: true,
      again: { ok: false, reason: "link_run_out" },
      connected: { connected: true, handle: "cloud_404", notices: "mine" },
      everything: { connected: true, notices: "all" },
      after: { connected: false, notices: "all" },
    });
  });

  it("adds a chat for a connected captain only, keeps the ticks, and removes it", async () => {
    const { db, store } = await bothWays(mode, h, async (p) => {
      const connect = async (userId: string, telegramUserId: string) =>
        connectTelegram({
          code: await createTelegramLinkCode(userId),
          telegramUserId,
          username: null,
        });
      await connect(p.captain, "555");
      await connect(p.member, "556");
      const place = (telegramUserId: string, threadId: string | null) =>
        addTelegramPlace({
          telegramUserId,
          chatId: "-100500",
          threadId,
          title: "Camp 404 › Announcements",
          username: null,
        });
      const byMember = await place("556", null);
      const byStranger = await place("999", null);
      const byCaptain = await place("555", "7");
      const listed = (await listTelegramPlaces()).map((x) => ({
        chatId: x.chatId,
        threadId: x.threadId,
        title: x.title,
      }));
      const settingsBefore = await getTelegramPostSettings();
      const memberTicks = await setTelegramPostSettings({
        actorId: p.member,
        settings: { announcements: false, reminders: false, meetings: false },
      });
      const captainTicks = await setTelegramPostSettings({
        actorId: p.captain,
        settings: { announcements: true, reminders: false, meetings: true },
      });
      const settingsAfter = await getTelegramPostSettings();
      const id = (await listTelegramPlaces())[0]!.id;
      const memberRemove = await removeTelegramPlace({
        actorId: p.member,
        id,
      });
      const captainRemove = await removeTelegramPlace({
        actorId: p.captain,
        id,
      });
      const again = await removeTelegramPlace({ actorId: p.captain, id });
      const after = await listTelegramPlaces();
      return {
        byMember,
        byStranger,
        byCaptain,
        listed,
        settingsBefore,
        memberTicks,
        captainTicks,
        settingsAfter,
        memberRemove,
        captainRemove,
        again,
        after,
      };
    });
    expect(store).toEqual(db);
    expect(db).toMatchObject({
      byMember: { ok: false, reason: "not_a_captain" },
      byStranger: { ok: false, reason: "not_a_captain" },
      byCaptain: { ok: true },
      // (_agreement's normaliser stands ids in for the chat and topic.)
      listed: [{ title: "Camp 404 › Announcements" }],
      settingsBefore: { announcements: true, reminders: true, meetings: true },
      memberTicks: { ok: false },
      captainTicks: { ok: true },
      settingsAfter: { announcements: true, reminders: false, meetings: true },
      memberRemove: { ok: false },
      captainRemove: { ok: true },
      again: { ok: false },
      after: [],
    });
  });

  it("has no send to post for a questionnaire nobody sent", async () => {
    const { db, store } = await bothWays(mode, h, async (p) => {
      const missing = "00000000-0000-4000-8000-000000000001";
      return {
        dialog: await questionnairePostDialog(missing),
        post: await postQuestionnaireInTelegram({
          actorId: p.captain,
          activationId: missing,
          tagUserIds: [],
          placeIds: [],
          messageConnected: false,
        }),
      };
    });
    expect(store).toEqual(db);
    expect(db).toEqual({
      dialog: null,
      post: { ok: false, error: "That send no longer exists." },
    });
  });
});
