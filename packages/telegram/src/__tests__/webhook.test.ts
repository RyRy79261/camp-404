import { describe, expect, it } from "vitest";
import {
  inviteLinkFromUpdate,
  parseUpdate,
  verifyWebhookSecret,
} from "../webhook";

describe("verifyWebhookSecret", () => {
  it("returns true on exact match", () => {
    expect(verifyWebhookSecret("secret123", "secret123")).toBe(true);
  });

  it("rejects mismatched values", () => {
    expect(verifyWebhookSecret("secret123", "secret124")).toBe(false);
  });

  it("rejects null header", () => {
    expect(verifyWebhookSecret(null, "secret")).toBe(false);
  });

  it("rejects empty expected secret", () => {
    expect(verifyWebhookSecret("anything", "")).toBe(false);
  });

  it("rejects different-length values without short-circuit timing", () => {
    expect(verifyWebhookSecret("a", "abcdef")).toBe(false);
  });
});

describe("parseUpdate", () => {
  it("accepts a chat_member update with an invite_link", () => {
    const raw = {
      update_id: 42,
      chat_member: {
        chat: { id: -1001, type: "supergroup", title: "Camp 404" },
        from: { id: 100, is_bot: false },
        date: 1700000000,
        old_chat_member: { status: "left", user: { id: 200 } },
        new_chat_member: {
          status: "member",
          user: { id: 200, username: "burner" },
        },
        invite_link: { invite_link: "https://t.me/+abc", name: "camp404:u1" },
      },
    };
    const parsed = parseUpdate(raw);
    expect(parsed.update_id).toBe(42);
    expect(inviteLinkFromUpdate(parsed.chat_member!)).toBe(
      "https://t.me/+abc",
    );
  });

  it("returns null invite link when none is on the update", () => {
    const raw = {
      update_id: 1,
      chat_member: {
        chat: { id: -1001, type: "supergroup" },
        from: { id: 100 },
        date: 1700000000,
        old_chat_member: { status: "left", user: { id: 200 } },
        new_chat_member: { status: "member", user: { id: 200 } },
      },
    };
    const parsed = parseUpdate(raw);
    expect(inviteLinkFromUpdate(parsed.chat_member!)).toBeNull();
  });

  it("rejects payloads that are not an update", () => {
    expect(() => parseUpdate({ not_a_real_field: true })).toThrow();
  });
});
