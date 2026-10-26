import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  addTelegramPlace: vi.fn(),
  moveTelegramChat: vi.fn(),
}));
vi.mock("@camp404/db/telegram-posts", () => db);
vi.mock("@camp404/db/telegram-dm", () => ({}));

import { OL_JEB_SAYS } from "@camp404/core";
import { TelegramApiError, TelegramClient } from "../client";
import { handleGroupMessage, telegramPostSender } from "../group-chat";

const BOT = "jebediah_404_bot";

function client() {
  const c = new TelegramClient({ botToken: "tok", fetchImpl: vi.fn() });
  const sendMessage = vi.spyOn(c, "sendMessage").mockResolvedValue({
    message_id: 1,
    chat: { id: -100, type: "supergroup" },
    date: 0,
  });
  return { c, sendMessage };
}

function groupMessage(
  text: string,
  extra: Record<string, unknown> = {},
  chatType = "supergroup",
) {
  return {
    message_id: 5,
    date: 0,
    text,
    chat: { id: -100500, type: chatType, title: "Camp 404" },
    from: { id: 77, first_name: "Cloud" },
    ...extra,
  };
}

beforeEach(() => vi.clearAllMocks());

describe("handleGroupMessage", () => {
  it("adds the chat for /notifyhere and says Got it", async () => {
    db.addTelegramPlace.mockResolvedValue({ ok: true });
    const { c, sendMessage } = client();
    await handleGroupMessage(groupMessage(`/notifyhere@${BOT}`), c, BOT);
    expect(db.addTelegramPlace).toHaveBeenCalledWith({
      telegramUserId: "77",
      chatId: "-100500",
      threadId: null,
      title: "Camp 404",
      username: null,
    });
    expect(sendMessage).toHaveBeenCalledWith({
      chatId: -100500,
      messageThreadId: undefined,
      text: OL_JEB_SAYS.postingHere,
    });
  });

  it("adds a forum topic, named, and answers in it", async () => {
    db.addTelegramPlace.mockResolvedValue({ ok: true });
    const { c, sendMessage } = client();
    await handleGroupMessage(
      groupMessage("/notifyhere", {
        is_topic_message: true,
        message_thread_id: 12,
        reply_to_message: { forum_topic_created: { name: "Announcements" } },
      }),
      c,
      BOT,
    );
    expect(db.addTelegramPlace.mock.calls[0]![0]).toMatchObject({
      threadId: "12",
      title: "Camp 404 › Announcements",
    });
    expect(sendMessage.mock.calls[0]![0].messageThreadId).toBe(12);
  });

  it("says sorry when the sender is not a connected captain", async () => {
    db.addTelegramPlace.mockResolvedValue({
      ok: false,
      reason: "not_a_captain",
    });
    const { c, sendMessage } = client();
    await handleGroupMessage(groupMessage("/notifyhere"), c, BOT);
    expect(sendMessage.mock.calls[0]![0].text).toBe(OL_JEB_SAYS.notACaptain);
  });

  it("ignores other text, another bot's command, a bot and a private chat", async () => {
    const { c, sendMessage } = client();
    await handleGroupMessage(groupMessage("hello everyone"), c, BOT);
    await handleGroupMessage(groupMessage("/start abc"), c, BOT);
    await handleGroupMessage(groupMessage("/notifyhere@other_bot"), c, BOT);
    await handleGroupMessage(
      { ...groupMessage("/notifyhere"), from: { id: 9, is_bot: true } },
      c,
      BOT,
    );
    await handleGroupMessage(
      groupMessage("/notifyhere", {}, "private"),
      c,
      BOT,
    );
    expect(db.addTelegramPlace).not.toHaveBeenCalled();
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it("follows a group that became a supergroup", async () => {
    const { c } = client();
    await handleGroupMessage(
      groupMessage("", { migrate_to_chat_id: -100999 }, "group"),
      c,
      BOT,
    );
    expect(db.moveTelegramChat).toHaveBeenCalledWith("-100500", "-100999");
  });
});

describe("telegramPostSender", () => {
  const post = {
    text: "New meeting: Build planning",
    button: { text: "Open in Camp 404", url: "https://camp-404.com/calendar" },
  };

  it("posts in the topic with its button", async () => {
    const { c, sendMessage } = client();
    expect(await telegramPostSender(c)("-100500", "12", post)).toEqual({
      ok: true,
    });
    expect(sendMessage).toHaveBeenCalledWith({
      chatId: "-100500",
      messageThreadId: 12,
      text: post.text,
      disableWebPagePreview: true,
      inlineKeyboard: [[post.button]],
    });
  });

  it("answers a rate limit as one", async () => {
    const { c, sendMessage } = client();
    sendMessage.mockRejectedValue(
      new TelegramApiError(429, "Too Many Requests"),
    );
    expect(await telegramPostSender(c)("-100500", null, post)).toMatchObject({
      ok: false,
      rateLimited: true,
    });
  });
});
