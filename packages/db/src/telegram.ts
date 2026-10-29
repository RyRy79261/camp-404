import { and, eq, gte, isNull, or, sql } from "drizzle-orm";
import { createHttpDb } from "./index";
import * as schema from "./schema";

export type TelegramChatKind =
  (typeof schema.telegramChatKindEnum.enumValues)[number];
export type TelegramInviteStatus =
  (typeof schema.telegramInviteStatusEnum.enumValues)[number];

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
