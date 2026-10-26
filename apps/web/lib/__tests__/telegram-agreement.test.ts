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
});
