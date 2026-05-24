import { beforeEach, describe, expect, it, vi } from "vitest";

const dbState: {
  chats: Array<{
    id: string;
    kind: "main_group" | "announcement_channel";
    chatId: string;
    title: string;
    username: string | null;
    addedByUserId: string | null;
    addedAt: Date;
    archivedAt: Date | null;
  }>;
  invites: Array<{
    id: string;
    userId: string;
    chatId: string;
    inviteLink: string;
    status: "pending" | "used" | "expired" | "revoked";
    expiresAt: Date | null;
    joinedAt: Date | null;
    createdAt: Date;
  }>;
  announcements: Array<{
    id: string;
    broadcastId: string | null;
    chatId: string;
    body: string;
    status: "queued" | "sent" | "failed";
    messageId: string | null;
    errorMessage: string | null;
    sendAfter: Date;
    sentAt: Date | null;
    createdAt: Date;
  }>;
  userTelegramIds: Map<string, string>;
} = {
  chats: [],
  invites: [],
  announcements: [],
  userTelegramIds: new Map(),
};

let idCounter = 0;
const newId = () => `id-${++idCounter}`;

vi.mock("@camp404/db/telegram", () => ({
  async getActiveChatByKind(kind: string) {
    return (
      dbState.chats.find((c) => c.kind === kind && !c.archivedAt) ?? null
    );
  },
  async listPendingInvitesForUser(userId: string, now: Date) {
    return dbState.invites
      .filter(
        (i) =>
          i.userId === userId &&
          i.status === "pending" &&
          (!i.expiresAt || i.expiresAt >= now),
      )
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  },
  async recordInvite(input: {
    userId: string;
    chatId: string;
    inviteLink: string;
    expiresAt: Date | null;
  }) {
    const row = {
      id: newId(),
      ...input,
      status: "pending" as const,
      joinedAt: null,
      createdAt: new Date(),
    };
    dbState.invites.push(row);
    return row;
  },
  async findInviteByLink(link: string) {
    return dbState.invites.find((i) => i.inviteLink === link) ?? null;
  },
  async markInviteUsed(id: string, joinedAt: Date) {
    const row = dbState.invites.find((i) => i.id === id);
    if (row) {
      row.status = "used";
      row.joinedAt = joinedAt;
    }
  },
  async recordTelegramUserId(input: { userId: string; telegramUserId: string }) {
    dbState.userTelegramIds.set(input.userId, input.telegramUserId);
  },
  async enqueueAnnouncement(input: {
    chatId: string;
    body: string;
    broadcastId?: string | null;
    sendAfter?: Date | null;
  }) {
    const row = {
      id: newId(),
      broadcastId: input.broadcastId ?? null,
      chatId: input.chatId,
      body: input.body,
      status: "queued" as const,
      messageId: null,
      errorMessage: null,
      sendAfter: input.sendAfter ?? new Date(),
      sentAt: null,
      createdAt: new Date(),
    };
    dbState.announcements.push(row);
    return row;
  },
  async listDueAnnouncements(now: Date, limit = 25) {
    return dbState.announcements
      .filter((a) => a.status === "queued" && a.sendAfter <= now)
      .slice(0, limit);
  },
  async markAnnouncementSent(input: {
    id: string;
    messageId: string;
    sentAt: Date;
  }) {
    const row = dbState.announcements.find((a) => a.id === input.id);
    if (row) {
      row.status = "sent";
      row.messageId = input.messageId;
      row.sentAt = input.sentAt;
    }
  },
  async markAnnouncementFailed(input: { id: string; errorMessage: string }) {
    const row = dbState.announcements.find((a) => a.id === input.id);
    if (row) {
      row.status = "failed";
      row.errorMessage = input.errorMessage;
    }
  },
}));

const {
  dispatchPendingAnnouncements,
  handleChatMemberUpdate,
  issueGroupInviteForUser,
  queueAnnouncement,
} = await import("../handlers");
const { TelegramApiError } = await import("../client");

function resetState() {
  dbState.chats = [];
  dbState.invites = [];
  dbState.announcements = [];
  dbState.userTelegramIds = new Map();
  idCounter = 0;
}

function fakeClient(overrides: Record<string, unknown> = {}) {
  return {
    createChatInviteLink: vi.fn().mockResolvedValue({
      invite_link: "https://t.me/+generated",
    }),
    sendMessage: vi.fn().mockResolvedValue({
      message_id: 99,
      chat: { id: 1, type: "channel" },
      date: 0,
    }),
    ...overrides,
  } as unknown as Parameters<typeof issueGroupInviteForUser>[0]["client"];
}

beforeEach(resetState);

describe("issueGroupInviteForUser", () => {
  it("creates a new invite link when none is pending", async () => {
    dbState.chats.push({
      id: "chat-1",
      kind: "main_group",
      chatId: "-100123",
      title: "Camp 404",
      username: null,
      addedByUserId: null,
      addedAt: new Date(),
      archivedAt: null,
    });
    const client = fakeClient();
    const result = await issueGroupInviteForUser({
      client,
      userId: "user-1",
      now: new Date("2026-05-24T00:00:00Z"),
    });
    expect(result.reused).toBe(false);
    expect(result.invite.inviteLink).toBe("https://t.me/+generated");
    expect(client.createChatInviteLink).toHaveBeenCalledOnce();
  });

  it("reuses the pending invite for the same chat instead of recreating", async () => {
    dbState.chats.push({
      id: "chat-1",
      kind: "main_group",
      chatId: "-100123",
      title: "Camp 404",
      username: null,
      addedByUserId: null,
      addedAt: new Date(),
      archivedAt: null,
    });
    dbState.invites.push({
      id: "existing",
      userId: "user-1",
      chatId: "-100123",
      inviteLink: "https://t.me/+prev",
      status: "pending",
      expiresAt: new Date("2999-01-01"),
      joinedAt: null,
      createdAt: new Date(),
    });
    const client = fakeClient();
    const result = await issueGroupInviteForUser({
      client,
      userId: "user-1",
      now: new Date("2026-05-24"),
    });
    expect(result.reused).toBe(true);
    expect(result.invite.inviteLink).toBe("https://t.me/+prev");
    expect(client.createChatInviteLink).not.toHaveBeenCalled();
  });

  it("throws when no main_group chat is registered", async () => {
    await expect(
      issueGroupInviteForUser({ client: fakeClient(), userId: "u" }),
    ).rejects.toThrow(/main_group/);
  });
});

describe("handleChatMemberUpdate", () => {
  it("marks invite used and records the telegram user id", async () => {
    dbState.invites.push({
      id: "inv1",
      userId: "user-1",
      chatId: "-100123",
      inviteLink: "https://t.me/+link",
      status: "pending",
      expiresAt: null,
      joinedAt: null,
      createdAt: new Date(),
    });
    const out = await handleChatMemberUpdate({
      chat: { id: -100123, type: "supergroup" },
      from: { id: 5 },
      date: 1700000000,
      old_chat_member: { status: "left", user: { id: 200 } },
      new_chat_member: {
        status: "member",
        user: { id: 200, username: "burner" },
      },
      invite_link: { invite_link: "https://t.me/+link" },
    });
    expect(out?.status).toBe("used");
    expect(dbState.invites[0]?.status).toBe("used");
    expect(dbState.userTelegramIds.get("user-1")).toBe("200");
  });

  it("ignores updates that aren't a transition into the group", async () => {
    dbState.invites.push({
      id: "inv1",
      userId: "user-1",
      chatId: "-100123",
      inviteLink: "https://t.me/+link",
      status: "pending",
      expiresAt: null,
      joinedAt: null,
      createdAt: new Date(),
    });
    const out = await handleChatMemberUpdate({
      chat: { id: -100123, type: "supergroup" },
      from: { id: 5 },
      date: 1700000000,
      old_chat_member: { status: "member", user: { id: 200 } },
      new_chat_member: { status: "member", user: { id: 200 } },
      invite_link: { invite_link: "https://t.me/+link" },
    });
    expect(out).toBeNull();
    expect(dbState.invites[0]?.status).toBe("pending");
  });

  it("does nothing when the invite link is unknown", async () => {
    const out = await handleChatMemberUpdate({
      chat: { id: -100123, type: "supergroup" },
      from: { id: 5 },
      date: 1700000000,
      old_chat_member: { status: "left", user: { id: 200 } },
      new_chat_member: { status: "member", user: { id: 200 } },
      invite_link: { invite_link: "https://t.me/+nope" },
    });
    expect(out).toBeNull();
  });
});

describe("announcement queue + dispatch", () => {
  it("queues to the active announcement_channel by default", async () => {
    dbState.chats.push({
      id: "chat-2",
      kind: "announcement_channel",
      chatId: "-100999",
      title: "Camp 404 Announcements",
      username: null,
      addedByUserId: null,
      addedAt: new Date(),
      archivedAt: null,
    });
    const row = await queueAnnouncement({ body: "Phase 2 unlocked" });
    expect(row.chatId).toBe("-100999");
    expect(row.status).toBe("queued");
  });

  it("sends due rows and marks them sent", async () => {
    dbState.announcements.push({
      id: "a1",
      broadcastId: null,
      chatId: "-100999",
      body: "Hello",
      status: "queued",
      messageId: null,
      errorMessage: null,
      sendAfter: new Date("2026-05-23"),
      sentAt: null,
      createdAt: new Date("2026-05-23"),
    });
    const client = fakeClient();
    const result = await dispatchPendingAnnouncements({
      client,
      now: new Date("2026-05-24"),
    });
    expect(result).toEqual({ attempted: 1, sent: 1, failed: 0 });
    expect(dbState.announcements[0]?.status).toBe("sent");
    expect(dbState.announcements[0]?.messageId).toBe("99");
  });

  it("marks rows failed when the API errors out", async () => {
    dbState.announcements.push({
      id: "a1",
      broadcastId: null,
      chatId: "-100999",
      body: "Hello",
      status: "queued",
      messageId: null,
      errorMessage: null,
      sendAfter: new Date("2026-05-23"),
      sentAt: null,
      createdAt: new Date("2026-05-23"),
    });
    const client = fakeClient({
      sendMessage: vi
        .fn()
        .mockRejectedValue(new TelegramApiError(403, "Bot blocked")),
    });
    const result = await dispatchPendingAnnouncements({
      client,
      now: new Date("2026-05-24"),
    });
    expect(result).toEqual({ attempted: 1, sent: 0, failed: 1 });
    expect(dbState.announcements[0]?.status).toBe("failed");
    expect(dbState.announcements[0]?.errorMessage).toBe("Bot blocked");
  });

  it("skips rows scheduled in the future", async () => {
    dbState.announcements.push({
      id: "a-future",
      broadcastId: null,
      chatId: "-100999",
      body: "Later",
      status: "queued",
      messageId: null,
      errorMessage: null,
      sendAfter: new Date("2026-06-01"),
      sentAt: null,
      createdAt: new Date("2026-05-23"),
    });
    const client = fakeClient();
    const result = await dispatchPendingAnnouncements({
      client,
      now: new Date("2026-05-24"),
    });
    expect(result.attempted).toBe(0);
    expect(client.sendMessage).not.toHaveBeenCalled();
  });
});
