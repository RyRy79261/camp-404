import { beforeEach, describe, expect, it, vi } from "vitest";
import type * as Telegram from "@camp404/telegram";

// Telegram posts every update here. Nothing may run before the shared secret
// is checked. A body we do not read is 200 (Telegram would retry it forever),
// a retry of an update already handled is 200 and does nothing, and our own
// failure is 503 after forgetting the update, so the retry is handled.

vi.mock("@/lib/telegram", () => ({
  getWebhookSecret: vi.fn(),
  getTelegramClient: vi.fn(() => ({})),
  telegramBotUsername: vi.fn(() => "jebediah_404_bot"),
}));
vi.mock("@camp404/db/telegram-dm", () => ({
  recordTelegramUpdate: vi.fn(),
  forgetTelegramUpdate: vi.fn(),
}));
vi.mock("@camp404/telegram", async (importOriginal) => ({
  ...(await importOriginal<typeof Telegram>()),
  handleChatMemberUpdate: vi.fn(),
  handleGroupMessage: vi.fn(),
  handleMyChatMember: vi.fn(),
  handlePrivateMessage: vi.fn(),
}));

import { POST } from "./route";
import { getWebhookSecret } from "@/lib/telegram";
import {
  forgetTelegramUpdate,
  recordTelegramUpdate,
} from "@camp404/db/telegram-dm";
import {
  handleChatMemberUpdate,
  handleGroupMessage,
  handleMyChatMember,
  handlePrivateMessage,
} from "@camp404/telegram";

const SECRET = "s3cret-webhook-value";

function post(body: string, secret: string | null = SECRET) {
  const headers = new Headers({ "content-type": "application/json" });
  if (secret !== null) headers.set("x-telegram-bot-api-secret-token", secret);
  return POST(
    new Request("https://camp.test/api/telegram/webhook", {
      method: "POST",
      headers,
      body,
    }),
  );
}

const chatMember = {
  update_id: 1,
  chat_member: {
    chat: { id: -100, type: "supergroup" },
    from: { id: 7, is_bot: false, first_name: "Ada" },
    date: 1,
    old_chat_member: {
      status: "left",
      user: { id: 7, is_bot: false, first_name: "Ada" },
    },
    new_chat_member: {
      status: "member",
      user: { id: 7, is_bot: false, first_name: "Ada" },
    },
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getWebhookSecret).mockReturnValue(SECRET);
  vi.mocked(recordTelegramUpdate).mockResolvedValue(true);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("POST /api/telegram/webhook", () => {
  it("answers 503 when the bot is not configured, and runs nothing", async () => {
    vi.mocked(getWebhookSecret).mockImplementation(() => {
      throw new Error("TELEGRAM_WEBHOOK_SECRET is not set");
    });
    expect((await post(JSON.stringify(chatMember))).status).toBe(503);
    expect(handleChatMemberUpdate).not.toHaveBeenCalled();
  });

  it("refuses a missing, wrong or wrong-length secret before parsing", async () => {
    for (const secret of [null, "wrong-webhook-value!", "short"]) {
      expect((await post(JSON.stringify(chatMember), secret)).status).toBe(401);
    }
    expect(handleChatMemberUpdate).not.toHaveBeenCalled();
  });

  it("acknowledges a body that is not JSON", async () => {
    const res = await post("not json");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, ignored: "non-json" });
  });

  it("hands a chat_member update to its handler once", async () => {
    const res = await post(JSON.stringify(chatMember));
    expect(res.status).toBe(200);
    expect(handleChatMemberUpdate).toHaveBeenCalledOnce();
  });

  it("handles a retry of an update already handled only once", async () => {
    vi.mocked(recordTelegramUpdate).mockResolvedValueOnce(false);
    const res = await post(JSON.stringify(chatMember));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, ignored: "duplicate" });
    expect(handleChatMemberUpdate).not.toHaveBeenCalled();
  });

  it("answers 503 and forgets the update when the handler throws", async () => {
    vi.mocked(handleChatMemberUpdate).mockRejectedValue(new Error("boom"));
    expect((await post(JSON.stringify(chatMember))).status).toBe(503);
    expect(forgetTelegramUpdate).toHaveBeenCalledWith(1);
  });

  it("answers 503 when the update cannot be recorded", async () => {
    vi.mocked(recordTelegramUpdate).mockRejectedValue(new Error("db down"));
    expect((await post(JSON.stringify(chatMember))).status).toBe(503);
    expect(handleChatMemberUpdate).not.toHaveBeenCalled();
  });

  it("acknowledges a body that is not an update", async () => {
    const res = await post(JSON.stringify({ hello: "there" }));
    expect(res.status).toBe(200);
    expect(recordTelegramUpdate).not.toHaveBeenCalled();
  });

  it("hands a private message and a block to their handlers", async () => {
    const message = {
      update_id: 3,
      message: {
        message_id: 1,
        date: 1,
        chat: { id: 7, type: "private" },
        from: { id: 7, first_name: "Ada" },
        text: "/start abc",
      },
    };
    expect((await post(JSON.stringify(message))).status).toBe(200);
    expect(handlePrivateMessage).toHaveBeenCalledOnce();
    const block = {
      update_id: 4,
      my_chat_member: {
        ...chatMember.chat_member,
        chat: { id: 7, type: "private" },
      },
    };
    expect((await post(JSON.stringify(block))).status).toBe(200);
    expect(handleMyChatMember).toHaveBeenCalledOnce();
  });

  it("hands a group message (/notifyhere) to the group handler, with the bot's name", async () => {
    const group = {
      update_id: 5,
      message: {
        message_id: 2,
        date: 1,
        chat: { id: -100, type: "supergroup", title: "Camp 404" },
        from: { id: 7, first_name: "Ada" },
        text: "/notifyhere",
        message_thread_id: 3,
        is_topic_message: true,
      },
    };
    expect((await post(JSON.stringify(group))).status).toBe(200);
    expect(handlePrivateMessage).not.toHaveBeenCalled();
    expect(handleGroupMessage).toHaveBeenCalledOnce();
    expect(vi.mocked(handleGroupMessage).mock.calls[0]![2]).toBe(
      "jebediah_404_bot",
    );
  });
});
