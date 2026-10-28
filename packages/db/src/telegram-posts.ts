import { and, asc, eq, isNotNull, lt, sql } from "drizzle-orm";
import {
  CAPTAIN_ONLY,
  FEE_TELEGRAM_BODY,
  FEE_TELEGRAM_BUTTON,
  FEE_TELEGRAM_TITLE,
  plainPreview,
  questionnaireReminderNotification,
  type TagCandidate,
  type TelegramPost,
  TELEGRAM_LEAD_TITLE,
  TELEGRAM_OPEN_BUTTON,
} from "@camp404/core";
import { lockActor } from "./actor";
import { writeAuditEvent, type DbOrTx } from "./audit";
import { currentCycleNumber } from "./cycles";
import { createHttpDb, withTransaction, type Tx } from "./index";
import * as schema from "./schema";
import {
  questionnairePostCandidates,
  TELEGRAM_POST_KINDS,
  type QueuedPost,
  type TelegramPostKind,
  type TelegramPostTick,
} from "./telegram-post-kinds";
import {
  drainTelegramOutbox,
  type TelegramDrainResult,
  type TelegramOutbox,
  type TelegramSendResult,
} from "./telegram-outbox";

export {
  questionnairePostCandidates,
  reminderTags,
  type ReminderTags,
} from "./telegram-post-kinds";

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
//    the write it is about (one per place, deduped), and sent by the outbox
//    drain (./telegram-outbox) at most once, like the private notices. What
//    each kind ticks, reads and draws is its entry in TELEGRAM_POST_KINDS
//    (./telegram-post-kinds).
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

/** What Ol' Jeb posts in the camp's chats on his own. */
export type TelegramPostSettings = Record<TelegramPostTick, boolean>;

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

/** The camp day of `now` ("2026-10-26"): a reminder posts once a day. */
export { campDayKey } from "@camp404/core";

export interface QueuedTelegramPost {
  kind: TelegramPostKind;
  title: string;
  body: string;
  refId: string | null;
  buttonText: string | null;
  buttonPath: string | null;
  /** The members it names, as ids, never handles (lead, questionnaire). */
  tagUserIds?: readonly string[];
  /**
   * What makes this post one of a kind, without the chat: the chat is added
   * per place. A second queue with the same key does nothing.
   */
  dedupe: string;
}

/**
 * Queue one post per place (or per `places` given), inside the caller's
 * transaction, unless its kind's Camp settings tick is off. Nothing when
 * there is no place. Returns how many were queued.
 */
export async function queueTelegramPosts(
  tx: Tx,
  post: QueuedTelegramPost,
  options: { places?: readonly TelegramPlace[] } = {},
): Promise<number> {
  const tick = TELEGRAM_POST_KINDS[post.kind].tick;
  if (tick && !(await getTelegramPostSettings(tx))[tick]) return 0;
  const places = options.places ?? (await listTelegramPlaces(tx));
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
        tagUserIds: post.tagUserIds ? [...post.tagUserIds] : null,
        buttonText: post.buttonText,
        buttonPath: post.buttonPath,
        dedupeKey: `${post.dedupe}:${place.chatId}`,
      })),
    )
    .onConflictDoNothing()
    .returning({ id: posts.id });
  return rows.length;
}

/**
 * The Finance team's general camp fee reminder in each of Ol' Jeb's chats
 * (camp fees sprint, owner 2A): it names nobody and shows no amount, and
 * opens My dues. Once a camp day per chat; no Camp settings tick switches
 * it off. Inside the caller's transaction. Returns how many were queued.
 */
export async function queueFeeReminderPost(
  tx: Tx,
  input: { cycle: number; day: string },
): Promise<number> {
  return queueTelegramPosts(tx, {
    kind: "fee",
    title: FEE_TELEGRAM_TITLE,
    body: FEE_TELEGRAM_BODY,
    refId: null,
    buttonText: FEE_TELEGRAM_BUTTON,
    buttonPath: "/dues",
    dedupe: `fees:${input.cycle}:${input.day}`,
  });
}

// --- A questionnaire posted by hand (owner's mock-up, 2026-10-27) ---------

/** What the "Post in Telegram" dialog shows for an open send. */
export interface QuestionnairePostDialog {
  /** The post's first line and its short line, as Ol' Jeb will send them. */
  title: string;
  body: string;
  candidates: TagCandidate[];
}

/** The dialog's message and who it may tag, or null for a send that is not open. */
export async function questionnairePostDialog(
  activationId: string,
  db: DbOrTx = createHttpDb(),
): Promise<QuestionnairePostDialog | null> {
  const [act] = await db
    .select({
      title: schema.questionnaireActivations.title,
      status: schema.questionnaireActivations.status,
      dueAt: schema.questionnaireActivations.dueAt,
    })
    .from(schema.questionnaireActivations)
    .where(eq(schema.questionnaireActivations.id, activationId))
    .limit(1);
  if (!act || act.status !== "open") return null;
  const payload = questionnaireReminderNotification({
    activationId,
    title: act.title,
    dueAt: act.dueAt,
  });
  return {
    title: payload.title,
    body: plainPreview(payload.body),
    candidates: await questionnairePostCandidates(activationId, db),
  };
}

// --- A new team lead ----------------------------------------------------------

export const LEAD_POST_CAPTAINS_ONLY =
  "Only a captain can tell the camp about a new lead.";
export const LEAD_POST_NOT_A_LEAD =
  "They don't lead that team this year any more. Reload the page.";
export const LEAD_POST_NO_PLACE =
  "Ol' Jeb has no camp chat to post in yet. Send /notifyhere in one first.";

export type LeadPostResult =
  | { ok: true; places: number }
  | { ok: false; error: string };

/**
 * A captain's "Tell the camp on Telegram" after making someone a lead (owner,
 * 2026-10-27: an option offered after the switch, never automatic). Checked
 * under lock: the captain, and that the member leads `team` this year. One
 * post per place, deduped per lead, team and year, so a second press posts
 * nothing. The lead is stored as an id; the drain reads their name when it
 * sends. Audited.
 */
export async function postTeamLeadInTelegram(input: {
  actorId: string;
  userId: string;
  team: string;
  teamLabel: string;
}): Promise<LeadPostResult> {
  return withTransaction(async (tx) => {
    if (!CAPTAIN_ONLY.allows(await lockActor(tx, input.actorId))) {
      return { ok: false, error: LEAD_POST_CAPTAINS_ONLY };
    }
    const cycle = await currentCycleNumber(tx);
    const [membership] = await tx
      .select({ isLead: schema.teamMemberships.isLead })
      .from(schema.teamMemberships)
      .innerJoin(
        schema.users,
        eq(schema.users.id, schema.teamMemberships.userId),
      )
      .where(
        and(
          eq(schema.teamMemberships.userId, input.userId),
          sql`${schema.teamMemberships.team} = ${input.team}`,
          eq(schema.teamMemberships.cycle, cycle),
          eq(schema.users.sanitised, false),
        ),
      )
      .limit(1)
      .for("update");
    if (!membership?.isLead) return { ok: false, error: LEAD_POST_NOT_A_LEAD };
    const places = await listTelegramPlaces(tx);
    if (places.length === 0) return { ok: false, error: LEAD_POST_NO_PLACE };
    const queued = await queueTelegramPosts(
      tx,
      {
        kind: "lead",
        title: TELEGRAM_LEAD_TITLE,
        body: input.teamLabel,
        refId: null,
        tagUserIds: [input.userId],
        buttonText: TELEGRAM_OPEN_BUTTON,
        buttonPath: "/help-wanted",
        dedupe: `lead:${cycle}:${input.team}:${input.userId}`,
      },
      { places },
    );
    await writeAuditEvent(tx, {
      actorId: input.actorId,
      action: "telegram.lead_posted",
      target: input.userId,
      metadata: { team: input.team, cycle, places: queued },
    });
    return { ok: true, places: queued };
  });
}

// --- The drain ------------------------------------------------------------

export type TelegramPostSend = (
  chatId: string,
  threadId: string | null,
  post: TelegramPost,
) => Promise<TelegramSendResult>;

interface PostRow extends QueuedPost {
  id: string;
  chatId: string;
  threadId: string | null;
}

/**
 * The camp's chats as an outbox: each queued post, to its chat and topic. A
 * post for a chat that was removed is `skipped` at the claim; its kind
 * (TELEGRAM_POST_KINDS) reads and draws it as it goes, and skips one with
 * nothing left to post. The tags that did not fit follow a sent post, best
 * effort, after it is recorded sent, so a failure there never sends the post
 * itself twice.
 */
function postOutbox(
  send: TelegramPostSend,
  siteUrl: string,
): TelegramOutbox<PostRow> {
  return {
    async failStuck(tx, cutoff) {
      await tx
        .update(posts)
        .set({ status: "failed" })
        .where(and(eq(posts.status, "sending"), lt(posts.createdAt, cutoff)));
    },
    claim(tx, limit, cutoff) {
      return tx
        .select({
          id: posts.id,
          chatId: posts.chatId,
          threadId: posts.threadId,
          kind: posts.kind,
          title: posts.title,
          body: posts.body,
          refId: posts.refId,
          tagUserIds: posts.tagUserIds,
          buttonText: posts.buttonText,
          buttonPath: posts.buttonPath,
          expired: sql<boolean>`${posts.createdAt} < ${cutoff}`,
        })
        .from(posts)
        .where(eq(posts.status, "queued"))
        .orderBy(asc(posts.createdAt))
        .limit(limit)
        .for("update", { skipLocked: true });
    },
    async skipAtClaim(tx) {
      // The chats Ol' Jeb still posts in: a post for one removed since it
      // was queued is not sent.
      const live = new Set((await listTelegramPlaces(tx)).map((p) => p.chatId));
      return (row) => !live.has(row.chatId);
    },
    async mark(db, id, status, fromSending) {
      await db
        .update(posts)
        .set(
          fromSending
            ? { status, sentAt: status === "sent" ? new Date() : null }
            : { status },
        )
        .where(
          fromSending
            ? and(eq(posts.id, id), eq(posts.status, "sending"))
            : eq(posts.id, id),
        );
    },
    async prepare(row, db) {
      const post = await TELEGRAM_POST_KINDS[row.kind].render(row, siteUrl, db);
      if (!post) return null;
      return {
        send: () => send(row.chatId, row.threadId, post),
        async afterSent() {
          for (const text of post.more ?? []) {
            await send(row.chatId, row.threadId, { text, button: null }).catch(
              () => undefined,
            );
          }
        },
      };
    },
  };
}

/**
 * Send queued posts, oldest first, at most once each, by the outbox drain
 * (`./telegram-outbox`, which holds the protocol).
 */
export async function drainTelegramPosts(
  send: TelegramPostSend,
  options: { siteUrl: string; limit?: number },
): Promise<TelegramDrainResult> {
  return drainTelegramOutbox(postOutbox(send, options.siteUrl), {
    limit: options.limit,
  });
}
