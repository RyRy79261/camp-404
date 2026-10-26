import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  connectTelegram: vi.fn(),
  isTelegramConnected: vi.fn(),
  stopTelegramByTelegramId: vi.fn(),
}));
vi.mock("@camp404/db/telegram-dm", () => db);

import { OL_JEB_SAYS } from "@camp404/core";
import { TelegramApiError, TelegramClient } from "../client";
import {
  handleMyChatMember,
  handlePrivateMessage,
  telegramNoticeSender,
} from "../private-chat";

function client() {
  const c = new TelegramClient({ botToken: "tok", fetchImpl: vi.fn() });
  const sendMessage = vi
    .spyOn(c, "sendMessage")
    .mockResolvedValue({
      message_id: 1,
      chat: { id: 1, type: "private" },
      date: 0,
    });
  return { c, sendMessage };
}

function message(text: string, chatType = "private") {
  return {
    message_id: 1,
    date: 0,
    text,
    chat: { id: 42, type: chatType },
    from: { id: 42, first_name: "Cloud", username: "cloud_404" },
  };
}

beforeEach(() => vi.clearAllMocks());

describe("handlePrivateMessage", () => {
  it("connects with /start <code> and says hey", async () => {
    db.connectTelegram.mockResolvedValue({ ok: true, userId: "u1" });
    const { c, sendMessage } = client();
    await handlePrivateMessage(message("/start abc"), c);
    expect(db.connectTelegram).toHaveBeenCalledWith({
      code: "abc",
      telegramUserId: "42",
      username: "cloud_404",
    });
    expect(sendMessage).toHaveBeenCalledWith({
      chatId: 42,
      text: OL_JEB_SAYS.connected("Cloud"),
    });
  });

  it("says the link ran out when the code is no good", async () => {
    db.connectTelegram.mockResolvedValue({ ok: false, reason: "link_run_out" });
    const { c, sendMessage } = client();
    await handlePrivateMessage(message("/start@jebediah_404_bot old"), c);
    expect(sendMessage.mock.calls[0]![0].text).toBe(OL_JEB_SAYS.linkRunOut);
  });

  it("says hello to /start with no code", async () => {
    db.isTelegramConnected.mockResolvedValue(false);
    const { c, sendMessage } = client();
    await handlePrivateMessage(message("/start"), c);
    expect(db.connectTelegram).not.toHaveBeenCalled();
    expect(sendMessage.mock.calls[0]![0].text).toBe(OL_JEB_SAYS.hello);
  });

  it("stops with /stop", async () => {
    db.stopTelegramByTelegramId.mockResolvedValue(true);
    const { c, sendMessage } = client();
    await handlePrivateMessage(message("/stop"), c);
    expect(db.stopTelegramByTelegramId).toHaveBeenCalledWith("42");
    expect(sendMessage.mock.calls[0]![0].text).toBe(OL_JEB_SAYS.stopped);
  });

  it("answers anything else with the one sentence, and does nothing", async () => {
    const { c, sendMessage } = client();
    await handlePrivateMessage(message("delete everything"), c);
    expect(db.connectTelegram).not.toHaveBeenCalled();
    expect(db.stopTelegramByTelegramId).not.toHaveBeenCalled();
    expect(sendMessage.mock.calls[0]![0].text).toBe(OL_JEB_SAYS.onlyNotices);
  });

  it("ignores group messages", async () => {
    const { c, sendMessage } = client();
    await handlePrivateMessage(message("/start abc", "supergroup"), c);
    expect(db.connectTelegram).not.toHaveBeenCalled();
    expect(sendMessage).not.toHaveBeenCalled();
  });
});

describe("handleMyChatMember", () => {
  const update = (chatType: string, status: string) => ({
    chat: { id: 42, type: chatType },
    from: { id: 42 },
    date: 0,
    old_chat_member: { status: "member", user: { id: 7 } },
    new_chat_member: { status, user: { id: 7 } },
  });

  it("stops notices when a member blocks Ol' Jeb", async () => {
    await handleMyChatMember(update("private", "kicked"));
    expect(db.stopTelegramByTelegramId).toHaveBeenCalledWith("42");
  });

  it("ignores a group, and an unblock", async () => {
    await handleMyChatMember(update("supergroup", "kicked"));
    await handleMyChatMember(update("private", "member"));
    expect(db.stopTelegramByTelegramId).not.toHaveBeenCalled();
  });
});

describe("telegramNoticeSender", () => {
  const notice = { text: "Form due", url: "https://camp-404.com/x" };

  it("sends the text with an Open in Camp 404 button", async () => {
    const { c, sendMessage } = client();
    expect(await telegramNoticeSender(c)("42", notice)).toEqual({ ok: true });
    expect(sendMessage).toHaveBeenCalledWith({
      chatId: "42",
      text: "Form due",
      disableWebPagePreview: true,
      inlineKeyboard: [[{ text: "Open in Camp 404", url: notice.url }]],
    });
  });

  it.each([
    [429, "Too Many Requests", { rateLimited: true }],
    [403, "Forbidden: bot was blocked by the user", { blocked: true }],
    [400, "Bad Request: chat not found", { blocked: true }],
    [502, "Bad Gateway", { retryable: true }],
    [400, "Bad Request: message is too long", {}],
  ])("maps %i %s", async (code, description, flags) => {
    const { c, sendMessage } = client();
    sendMessage.mockRejectedValue(new TelegramApiError(code, description));
    expect(await telegramNoticeSender(c)("42", notice)).toEqual({
      ok: false,
      error: `Telegram ${code}`,
      ...flags,
    });
  });
});
