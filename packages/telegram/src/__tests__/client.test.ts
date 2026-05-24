import { describe, expect, it, vi } from "vitest";
import {
  TelegramApiError,
  TelegramClient,
  escapeMarkdownV2,
} from "../client";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("TelegramClient", () => {
  it("posts to the bot endpoint and returns the `result` field", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        jsonResponse({
          ok: true,
          result: { id: 1, is_bot: true, first_name: "TestBot" },
        }),
      );
    const client = new TelegramClient({ botToken: "abc", fetchImpl });
    const me = await client.getMe();
    expect(me.first_name).toBe("TestBot");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const url = fetchImpl.mock.calls[0]?.[0];
    expect(url).toBe("https://api.telegram.org/botabc/getMe");
  });

  it("throws TelegramApiError when ok is false", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        jsonResponse(
          { ok: false, error_code: 403, description: "Forbidden" },
          200,
        ),
      );
    const client = new TelegramClient({ botToken: "abc", fetchImpl });
    await expect(client.sendMessage({ chatId: "1", text: "hi" })).rejects.toBeInstanceOf(
      TelegramApiError,
    );
  });

  it("sends createChatInviteLink with snake_case payload", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({
        ok: true,
        result: { invite_link: "https://t.me/+abc", member_limit: 1 },
      }),
    );
    const client = new TelegramClient({ botToken: "tok", fetchImpl });
    await client.createChatInviteLink({
      chatId: "-100123",
      memberLimit: 1,
      expireDate: 1000,
      name: "camp404:u1",
    });
    const body = fetchImpl.mock.calls[0]?.[1]?.body as string;
    expect(JSON.parse(body)).toEqual({
      chat_id: "-100123",
      member_limit: 1,
      expire_date: 1000,
      name: "camp404:u1",
    });
  });
});

describe("escapeMarkdownV2", () => {
  it("escapes every MarkdownV2 special character", () => {
    const input = "Phase 2 unlocked! See _details_ at *home*.";
    const escaped = escapeMarkdownV2(input);
    expect(escaped).toBe(
      "Phase 2 unlocked\\! See \\_details\\_ at \\*home\\*\\.",
    );
  });

  it("escapes backslashes themselves", () => {
    expect(escapeMarkdownV2("a\\b")).toBe("a\\\\b");
  });
});
