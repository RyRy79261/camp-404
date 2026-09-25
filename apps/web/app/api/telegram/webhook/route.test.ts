import { beforeEach, describe, expect, it, vi } from "vitest";
import type * as Telegram from "@camp404/telegram";

// Telegram posts every update here. Nothing may run before the shared secret
// is checked, and once it is, the route always answers 200 so Telegram does
// not retry one bad update forever.

vi.mock("@/lib/telegram", () => ({ getWebhookSecret: vi.fn() }));
vi.mock("@camp404/telegram", async (importOriginal) => ({
  ...(await importOriginal<typeof Telegram>()),
  handleChatMemberUpdate: vi.fn(),
}));

import { POST } from "./route";
import { getWebhookSecret } from "@/lib/telegram";
import { handleChatMemberUpdate } from "@camp404/telegram";

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

  it("still answers 200 when the handler throws", async () => {
    vi.mocked(handleChatMemberUpdate).mockRejectedValue(new Error("boom"));
    expect((await post(JSON.stringify(chatMember))).status).toBe(200);
  });

  it("ignores an update with no chat_member", async () => {
    const res = await post(JSON.stringify({ update_id: 2, message: {} }));
    expect(res.status).toBe(200);
    expect(handleChatMemberUpdate).not.toHaveBeenCalled();
  });
});
