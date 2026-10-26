import { and, asc, eq, isNotNull, lt, sql } from "drizzle-orm";
import {
  campDayKey,
  CAPTAIN_ONLY,
  isComingThisYear,
  renderTelegramPost,
  telegramMention,
  type TelegramPost,
  type TelegramPostKind,
} from "@camp404/core";
import { lockActor } from "./actor";
import { writeAuditEvent, type DbOrTx } from "./audit";
import { currentCycleNumber } from "./cycles";
import { createHttpDb, withTransaction, type Tx } from "./index";
import * as schema from "./schema";
import type { TelegramSendResult } from "./telegram-dm";

// Ol' Jeb's posts in the camp's own Telegram chats (step 2 of
// docs/plans/2026-10-25-telegram-ol-jeb.md; owner's mock-up of 2026-10-26).
//
//  - A place is a chat (or one forum topic in a supergroup) Ol' Jeb posts in:
//    a `telegram_chats` row with `posts_since` set, whatever its `kind`, so
//    the camp's main group (its invites) can be a place too. A captain
//    who connected Telegram adds one by sending `/notifyhere` in it; a captain
//    removes one on Camp settings. Both are audited.
//  - Camp settings' three ticks say what he posts: announcements a captain
//    ticks "Also post in Telegram" on, questionnaire reminders that tag who
//    still owes the form, and new meetings.
//  - A post is a `telegram_announcements` row, queued in the transaction of
//    the write it is about (one per place, deduped), and sent by the drain
//    below at most once: Telegram has no idempotency key, so a row is
//    committed as `sending` before it goes out, like the private notices.
//  - A reminder stores no handle. Who still owes the form is read when it is
//    sent, so an erased member's name is never kept here, and someone who
//    answered in the meantime is not tagged.

const chats = schema.telegramChats;
const posts = schema.telegramAnnouncements;

/** The kind a chat Ol' Jeb did not know before `/notifyhere` is stored as. */
const NEW_PLACE_KIND = "announcement_channel" as const;

/** A chat, or a forum topic in one, where Ol' Jeb posts camp news. */
export interface TelegramPlace {
  id: string;
  chatId: string;
  /** The forum topic, or null for the chat itself. */
  threadId: string | null;
  title: string;
  addedAt: Date;
}

/** What Ol' Jeb posts in the camp's chats. */
export interface TelegramPostSettings {
  announcements: boolean;
  reminders: boolean;
  meetings: boolean;
}

/** A camp with no settings row yet posts everything, as the columns' default. */
export const DEFAULT_TELEGRAM_POST_SETTINGS: TelegramPostSettings = {
  announcements: true,
  reminders: true,
  meetings: true,
};

export async function listTelegramPlaces(
  db: DbOrTx = createHttpDb(),
): Promise<TelegramPlace[]> {
  const rows = await db
    .select({
      id: chats.id,
      chatId: chats.chatId,
      threadId: chats.threadId,
      title: chats.title,
      postsSince: chats.postsSince,
    })
    .from(chats)
    .where(isNotNull(chats.postsSince))
    .orderBy(asc(chats.postsSince));
  // `addedAt` is when it became a place (the filter keeps it set).
  return rows.map(({ postsSince, ...place }) => ({
    ...place,
    addedAt: postsSince!,
  }));
}

export async function getTelegramPostSettings(
  db: DbOrTx = createHttpDb(),
): Promise<TelegramPostSettings> {
  const [row] = await db
    .select({
      announcements: schema.campSettings.telegramPostAnnouncements,
      reminders: schema.campSettings.telegramPostReminders,
      meetings: schema.campSettings.telegramPostMeetings,
    })
    .from(schema.campSettings)
    .limit(1);
  return row ?? DEFAULT_TELEGRAM_POST_SETTINGS;
}

export const TELEGRAM_CAPTAINS_ONLY =
  "Only a captain can change where Ol' Jeb posts.";
export const TELEGRAM_PLACE_GONE =
  "Ol' Jeb no longer posts in that chat. Reload the page.";

export type TelegramWriteResult = { ok: true } | { ok: false; error: string };

/** A captain's three ticks, audited. */
export async function setTelegramPostSettings(input: {
  actorId: string;
  settings: TelegramPostSettings;
}): Promise<TelegramWriteResult> {
  return withTransaction(async (tx) => {
    if (!CAPTAIN_ONLY.allows(await lockActor(tx, input.actorId))) {
      return { ok: false, error: TELEGRAM_CAPTAINS_ONLY };
    }
    const values = {
      telegramPostAnnouncements: input.settings.announcements,
      telegramPostReminders: input.settings.reminders,
      telegramPostMeetings: input.settings.meetings,
    };
    await tx
      .insert(schema.campSettings)
      .values({ id: true, ...values })
      .onConflictDoUpdate({
        target: schema.campSettings.id,
        set: { ...values, updatedAt: new Date() },
      });
    await writeAuditEvent(tx, {
      actorId: input.actorId,
      action: "telegram.posts_set",
      target: "camp_settings",
      metadata: { ...input.settings },
    });
    return { ok: true };
  });
}

/** A captain stops Ol' Jeb posting in a chat, audited. */
export async function removeTelegramPlace(input: {
  actorId: string;
  id: string;
}): Promise<TelegramWriteResult> {
  return withTransaction(async (tx) => {
    if (!CAPTAIN_ONLY.allows(await lockActor(tx, input.actorId))) {
      return { ok: false, error: TELEGRAM_CAPTAINS_ONLY };
    }
    const [row] = await tx
      // Only the posting mark: a main group keeps its kind and its invites.
      .update(chats)
      .set({ postsSince: null })
      .where(and(eq(chats.id, input.id), isNotNull(chats.postsSince)))
      .returning({ chatId: chats.chatId, title: chats.title });
    if (!row) return { ok: false, error: TELEGRAM_PLACE_GONE };
    await writeAuditEvent(tx, {
      actorId: input.actorId,
      action: "telegram.chat_removed",
      target: `telegram_chat:${row.chatId}`,
      metadata: { chatId: row.chatId, title: row.title },
    });
    return { ok: true };
  });
}

export type AddPlaceResult =
  | { ok: true }
  | { ok: false; reason: "not_a_captain" };

/**
 * `/notifyhere` in a group or topic: the sender must be a captain who
 * connected Ol' Jeb (their Telegram account is tied to theirs and their
 * private chat is open), checked and locked inside the write. One place per
 * chat: sending it in another topic of the same chat moves it there, and a
 * removed chat comes back.
 */
export async function addTelegramPlace(input: {
  telegramUserId: string;
  chatId: string;
  threadId: string | null;
  title: string;
  username: string | null;
}): Promise<AddPlaceResult> {
  return withTransaction(async (tx) => {
    const [sender] = await tx
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(
        and(
          eq(schema.users.telegramUserId, input.telegramUserId),
          sql`${schema.users.telegramDmAt} IS NOT NULL`,
          eq(schema.users.sanitised, false),
          eq(schema.users.isSystem, false),
        ),
      )
      .limit(1);
    if (!sender || !CAPTAIN_ONLY.allows(await lockActor(tx, sender.id))) {
      return { ok: false, reason: "not_a_captain" };
    }
    const title = input.title.trim().slice(0, 200) || "Telegram chat";
    // A chat Ol' Jeb already knows (the camp's main group, say) keeps its
    // kind, its archive mark and who added it: only the posting mark, the
    // topic and the names change.
    await tx
      .insert(chats)
      .values({
        kind: NEW_PLACE_KIND,
        chatId: input.chatId,
        threadId: input.threadId,
        title,
        username: input.username,
        addedByUserId: sender.id,
        postsSince: new Date(),
      })
      .onConflictDoUpdate({
        target: chats.chatId,
        set: {
          threadId: input.threadId,
          title,
          username: input.username,
          postsSince: new Date(),
        },
      });
    // Posts still waiting for this chat go to the topic it is in now.
    await tx
      .update(posts)
      .set({ threadId: input.threadId })
      .where(and(eq(posts.chatId, input.chatId), eq(posts.status, "queued")));
    await writeAuditEvent(tx, {
      actorId: sender.id,
      action: "telegram.chat_added",
      target: `telegram_chat:${input.chatId}`,
      metadata: { chatId: input.chatId, threadId: input.threadId, title },
    });
    return { ok: true };
  });
}

/**
 * A group became a supergroup, which gives it a new id (Telegram's
 * `migrate_to_chat_id`): keep posting in it, and send what is queued there.
 */
export async function moveTelegramChat(
  fromChatId: string,
  toChatId: string,
): Promise<void> {
  await withTransaction(async (tx) => {
    const [taken] = await tx
      .select({ id: chats.id })
      .from(chats)
      .where(eq(chats.chatId, toChatId))
      .limit(1);
    if (!taken) {
      await tx
        .update(chats)
        .set({ chatId: toChatId })
        .where(eq(chats.chatId, fromChatId));
    }
    await tx
      .update(posts)
      .set({ chatId: toChatId })
      .where(and(eq(posts.chatId, fromChatId), eq(posts.status, "queued")));
  });
}

// --- Queueing -------------------------------------------------------------

const SETTING: Record<TelegramPostKind, keyof TelegramPostSettings> = {
  announcement: "announcements",
  reminder: "reminders",
  meeting: "meetings",
};

/** The camp day of `now` ("2026-10-26"): a reminder posts once a day. */
export { campDayKey };

export interface QueuedTelegramPost {
  kind: TelegramPostKind;
  title: string;
  body: string;
  refId: string | null;
  buttonText: string | null;
  buttonPath: string | null;
  /**
   * What makes this post one of a kind, without the chat: the chat is added
   * per place. A second queue with the same key does nothing.
   */
  dedupe: string;
}

/**
 * Queue one post per place, inside the caller's transaction, when Camp
 * settings' tick for its kind is on. Nothing when there is no place. Returns
 * how many were queued.
 */
export async function queueTelegramPosts(
  tx: Tx,
  post: QueuedTelegramPost,
): Promise<number> {
  const settings = await getTelegramPostSettings(tx);
  if (!settings[SETTING[post.kind]]) return 0;
  const places = await listTelegramPlaces(tx);
  if (places.length === 0) return 0;
  const rows = await tx
    .insert(posts)
    .values(
      places.map((place) => ({
        chatId: place.chatId,
        threadId: place.threadId,
        kind: post.kind,
        title: post.title,
        body: post.body,
        refId: post.refId,
        buttonText: post.buttonText,
        buttonPath: post.buttonPath,
        dedupeKey: `${post.dedupe}:${place.chatId}`,
      })),
    )
    .onConflictDoNothing()
    .returning({ id: posts.id });
  return rows.length;
}

// --- Who a reminder tags --------------------------------------------------

export interface ReminderTags {
  /** Whether the send is still open; a closed one posts nothing. */
  open: boolean;
  /** `@handle` of each member who still owes it and gets no private notice. */
  tags: string[];
  /** The same members with no usable Telegram username. */
  untagged: number;
}

/**
 * Who a questionnaire reminder tags: members who still owe the send (its
 * pending gates), said Coming this year (`isComingThisYear`), and have not
 * connected Ol' Jeb (a connected member gets the reminder privately). A
 * departed or system account is never named.
 */
export async function reminderTags(
  activationId: string,
  db: DbOrTx = createHttpDb(),
): Promise<ReminderTags> {
  const [act] = await db
    .select({
      status: schema.questionnaireActivations.status,
      key: schema.questionnaireActivations.questionnaireKey,
    })
    .from(schema.questionnaireActivations)
    .where(eq(schema.questionnaireActivations.id, activationId))
    .limit(1);
  if (!act || act.status !== "open")
    return { open: false, tags: [], untagged: 0 };
  const cycle = await currentCycleNumber(db);
  const owing = await db
    .selectDistinct({
      userId: schema.users.id,
      handle: schema.users.telegramHandle,
      dmAt: schema.users.telegramDmAt,
      status: schema.campParticipations.status,
    })
    .from(schema.requiredActions)
    .innerJoin(schema.users, eq(schema.users.id, schema.requiredActions.userId))
    .leftJoin(
      schema.campParticipations,
      and(
        eq(schema.campParticipations.userId, schema.users.id),
        eq(schema.campParticipations.cycle, cycle),
      ),
    )
    .where(
      and(
        eq(schema.requiredActions.activationId, activationId),
        eq(schema.requiredActions.actionKey, act.key),
        eq(schema.requiredActions.status, "pending"),
        eq(schema.users.isSystem, false),
        eq(schema.users.sanitised, false),
      ),
    )
    .orderBy(asc(schema.users.id));
  const tags: string[] = [];
  let untagged = 0;
  for (const member of owing) {
    if (!isComingThisYear(member.status)) continue;
    if (member.dmAt !== null) continue;
    const tag = telegramMention(member.handle);
    if (tag) tags.push(tag);
    else untagged += 1;
  }
  return { open: true, tags: [...new Set(tags)].sort(), untagged };
}

// --- The drain ------------------------------------------------------------

export type TelegramPostSend = (
  chatId: string,
  threadId: string | null,
  post: TelegramPost,
) => Promise<TelegramSendResult>;

export interface TelegramPostDrainResult {
  sent: number;
  failed: number;
  skipped: number;
  deferred: number;
  expired: number;
}

/** How long a queued post may wait; older ones are not posted late. */
export const TELEGRAM_POST_MAX_QUEUED_HOURS = 20;

/** How many posts one run sends; a later page load sends the rest. */
export const TELEGRAM_POST_DRAIN_LIMIT = 25;

/**
 * Send queued posts, oldest first, at most once each: a short transaction
 * claims the rows (FOR UPDATE SKIP LOCKED) and marks the ones to send
 * `sending`, and commits before anything is sent; each answer is written on
 * its own. A post for a chat that was removed is `skipped`; one queued longer
 * than TELEGRAM_POST_MAX_QUEUED_HOURS, or left `sending` that long, is
 * `failed`. A reminder works out its tags as it goes, and is `skipped` when
 * the send closed or nobody is left to tag.
 */
export async function drainTelegramPosts(
  send: TelegramPostSend,
  options: { siteUrl: string; limit?: number },
): Promise<TelegramPostDrainResult> {
  const result: TelegramPostDrainResult = {
    sent: 0,
    failed: 0,
    skipped: 0,
    deferred: 0,
    expired: 0,
  };
  const old = sql`now() - make_interval(hours => ${TELEGRAM_POST_MAX_QUEUED_HOURS})`;

  const claimed = await withTransaction(async (tx) => {
    await tx
      .update(posts)
      .set({ status: "failed" })
      .where(and(eq(posts.status, "sending"), lt(posts.createdAt, old)));

    const queued = await tx
      .select({
        id: posts.id,
        chatId: posts.chatId,
        threadId: posts.threadId,
        kind: posts.kind,
        title: posts.title,
        body: posts.body,
        refId: posts.refId,
        buttonText: posts.buttonText,
        buttonPath: posts.buttonPath,
        expired: sql<boolean>`${posts.createdAt} < ${old}`,
      })
      .from(posts)
      .where(eq(posts.status, "queued"))
      .orderBy(asc(posts.createdAt))
      .limit(options.limit ?? TELEGRAM_POST_DRAIN_LIMIT)
      .for("update", { skipLocked: true });

    // The chats Ol' Jeb still posts in: a post for one removed since it was
    // queued is not sent.
    const live = new Set((await listTelegramPlaces(tx)).map((p) => p.chatId));
    const toSend: typeof queued = [];
    for (const row of queued) {
      let status: "sending" | "failed" | "skipped";
      if (!live.has(row.chatId)) {
        status = "skipped";
        result.skipped += 1;
      } else if (row.expired) {
        status = "failed";
        result.failed += 1;
        result.expired += 1;
      } else {
        status = "sending";
        toSend.push(row);
      }
      await tx.update(posts).set({ status }).where(eq(posts.id, row.id));
    }
    return toSend;
  });

  const db = createHttpDb();
  const finish = async (
    id: string,
    status: "queued" | "sent" | "failed" | "skipped",
  ) => {
    await db
      .update(posts)
      .set({ status, sentAt: status === "sent" ? new Date() : null })
      .where(and(eq(posts.id, id), eq(posts.status, "sending")));
  };

  for (let i = 0; i < claimed.length; i += 1) {
    const row = claimed[i]!;
    let tags: string[] = [];
    let untagged = 0;
    if (row.kind === "reminder") {
      const who = row.refId
        ? await reminderTags(row.refId, db)
        : { open: false, tags: [], untagged: 0 };
      if (!who.open || (who.tags.length === 0 && who.untagged === 0)) {
        await finish(row.id, "skipped");
        result.skipped += 1;
        continue;
      }
      tags = who.tags;
      untagged = who.untagged;
    }
    const post = renderTelegramPost(
      { ...row, tags, untagged },
      options.siteUrl,
    );
    const outcome: TelegramSendResult = await send(
      row.chatId,
      row.threadId,
      post,
    ).catch((err: unknown) => ({
      ok: false,
      error: err instanceof Error ? err.message : "send failed",
      retryable: true,
    }));
    if (!outcome.ok && (outcome.rateLimited || outcome.retryable)) {
      // Telegram did not take it: safe to try again on a later run.
      await finish(row.id, "queued");
      result.deferred += 1;
      if (outcome.rateLimited) {
        for (const rest of claimed.slice(i + 1)) {
          await finish(rest.id, "queued");
        }
        break;
      }
      continue;
    }
    const status = outcome.ok ? "sent" : "failed";
    await finish(row.id, status);
    result[status] += 1;
  }
  return result;
}
