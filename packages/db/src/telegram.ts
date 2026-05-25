import { and, eq, gte, isNull, lte, or, sql } from "drizzle-orm";
import { createHttpDb } from "./index";
import * as schema from "./schema";

export type TelegramChatKind = (typeof schema.telegramChatKindEnum.enumValues)[number];
export type TelegramInviteStatus =
  (typeof schema.telegramInviteStatusEnum.enumValues)[number];
export type TelegramAnnouncementStatus =
  (typeof schema.telegramAnnouncementStatusEnum.enumValues)[number];

export interface TelegramChatRow {
  id: string;
  kind: TelegramChatKind;
  chatId: string;
  title: string;
  username: string | null;
  addedByUserId: string | null;
  addedAt: Date;
  archivedAt: Date | null;
}

export interface TelegramInviteRow {
  id: string;
  userId: string;
  chatId: string;
  inviteLink: string;
  status: TelegramInviteStatus;
  expiresAt: Date | null;
  joinedAt: Date | null;
  createdAt: Date;
}

export interface TelegramAnnouncementRow {
  id: string;
  broadcastId: string | null;
  chatId: string;
  body: string;
  status: TelegramAnnouncementStatus;
  messageId: string | null;
  errorMessage: string | null;
  sendAfter: Date;
  sentAt: Date | null;
  createdAt: Date;
}

export async function getActiveChatByKind(
  kind: TelegramChatKind,
): Promise<TelegramChatRow | null> {
  const db = createHttpDb();
  const rows = await db
    .select()
    .from(schema.telegramChats)
    .where(
      and(
        eq(schema.telegramChats.kind, kind),
        isNull(schema.telegramChats.archivedAt),
      ),
    )
    .orderBy(schema.telegramChats.addedAt)
    .limit(1);
  return rows[0] ?? null;
}

export async function upsertChat(input: {
  kind: TelegramChatKind;
  chatId: string;
  title: string;
  username: string | null;
  addedByUserId: string | null;
}): Promise<TelegramChatRow> {
  const db = createHttpDb();
  const [row] = await db
    .insert(schema.telegramChats)
    .values({
      kind: input.kind,
      chatId: input.chatId,
      title: input.title,
      username: input.username,
      addedByUserId: input.addedByUserId,
    })
    .onConflictDoUpdate({
      target: schema.telegramChats.chatId,
      set: {
        kind: input.kind,
        title: input.title,
        username: input.username,
        archivedAt: null,
      },
    })
    .returning();
  if (!row) throw new Error("Failed to upsert telegram chat");
  return row;
}

export async function recordInvite(input: {
  userId: string;
  chatId: string;
  inviteLink: string;
  expiresAt: Date | null;
}): Promise<TelegramInviteRow> {
  const db = createHttpDb();
  const [row] = await db
    .insert(schema.telegramInvites)
    .values({
      userId: input.userId,
      chatId: input.chatId,
      inviteLink: input.inviteLink,
      expiresAt: input.expiresAt,
    })
    .returning();
  if (!row) throw new Error("Failed to insert telegram invite");
  return row;
}

export async function findInviteByLink(
  inviteLink: string,
): Promise<TelegramInviteRow | null> {
  const db = createHttpDb();
  const rows = await db
    .select()
    .from(schema.telegramInvites)
    .where(eq(schema.telegramInvites.inviteLink, inviteLink))
    .limit(1);
  return rows[0] ?? null;
}

export async function markInviteUsed(
  id: string,
  joinedAt: Date,
): Promise<void> {
  const db = createHttpDb();
  await db
    .update(schema.telegramInvites)
    .set({ status: "used", joinedAt })
    .where(eq(schema.telegramInvites.id, id));
}

export async function recordTelegramUserId(input: {
  userId: string;
  telegramUserId: string;
}): Promise<void> {
  const db = createHttpDb();
  await db
    .update(schema.users)
    .set({
      telegramUserId: input.telegramUserId,
      updatedAt: new Date(),
    })
    .where(eq(schema.users.id, input.userId));
}

export async function setUserTelegramHandle(input: {
  userId: string;
  handle: string;
}): Promise<void> {
  const db = createHttpDb();
  await db
    .update(schema.users)
    .set({ telegramHandle: input.handle, updatedAt: new Date() })
    .where(eq(schema.users.id, input.userId));
}

export async function enqueueAnnouncement(input: {
  chatId: string;
  body: string;
  broadcastId?: string | null;
  sendAfter?: Date | null;
}): Promise<TelegramAnnouncementRow> {
  const db = createHttpDb();
  const [row] = await db
    .insert(schema.telegramAnnouncements)
    .values({
      chatId: input.chatId,
      body: input.body,
      broadcastId: input.broadcastId ?? null,
      sendAfter: input.sendAfter ?? new Date(),
    })
    .returning();
  if (!row) throw new Error("Failed to enqueue telegram announcement");
  return row;
}

export async function listDueAnnouncements(
  now: Date,
  limit = 25,
): Promise<TelegramAnnouncementRow[]> {
  const db = createHttpDb();
  return db
    .select()
    .from(schema.telegramAnnouncements)
    .where(
      and(
        eq(schema.telegramAnnouncements.status, "queued"),
        lte(schema.telegramAnnouncements.sendAfter, now),
      ),
    )
    .orderBy(schema.telegramAnnouncements.sendAfter)
    .limit(limit);
}

export async function markAnnouncementSent(input: {
  id: string;
  messageId: string;
  sentAt: Date;
}): Promise<void> {
  const db = createHttpDb();
  await db
    .update(schema.telegramAnnouncements)
    .set({
      status: "sent",
      messageId: input.messageId,
      sentAt: input.sentAt,
      errorMessage: null,
    })
    .where(eq(schema.telegramAnnouncements.id, input.id));
}

export async function markAnnouncementFailed(input: {
  id: string;
  errorMessage: string;
}): Promise<void> {
  const db = createHttpDb();
  await db
    .update(schema.telegramAnnouncements)
    .set({ status: "failed", errorMessage: input.errorMessage })
    .where(eq(schema.telegramAnnouncements.id, input.id));
}

export async function listPendingInvitesForUser(
  userId: string,
  now: Date,
): Promise<TelegramInviteRow[]> {
  const db = createHttpDb();
  return db
    .select()
    .from(schema.telegramInvites)
    .where(
      and(
        eq(schema.telegramInvites.userId, userId),
        eq(schema.telegramInvites.status, "pending"),
        or(
          isNull(schema.telegramInvites.expiresAt),
          gte(schema.telegramInvites.expiresAt, now),
        ),
      ),
    )
    .orderBy(sql`${schema.telegramInvites.createdAt} desc`);
}
