import { eq } from "drizzle-orm";
import {
  renderLeadPost,
  renderPlainPost,
  renderQuestionnairePost,
  renderReminderPost,
  type TagCandidate,
  type TelegramPost,
  type TelegramPostFields,
} from "@camp404/core";
import type { DbOrTx } from "./audit";
import { currentCycleNumber } from "./cycles";
import { createHttpDb } from "./index";
import {
  GROUP_TAG,
  OWED_NUDGE,
  owingMembers,
  pickedMember,
} from "./recipients";
import * as schema from "./schema";

// Ol' Jeb's post kinds: one entry each, so a new kind is one entry here (and
// a value in `telegramPostKindEnum`). An entry says which Camp settings tick
// switches it off (null: a post someone asked for, never off), and how a
// queued row of its kind is read and drawn as it is sent (null: not posted).
// Every kind is queued by `queueTelegramPosts` (./telegram-posts) and sent by
// the outbox drain.

export type TelegramPostKind =
  (typeof schema.telegramPostKindEnum.enumValues)[number];

/** Camp settings' ticks: what Ol' Jeb posts on his own. */
export type TelegramPostTick = "announcements" | "reminders" | "meetings";

/** A queued post, as the drain hands it to its kind. */
export interface QueuedPost extends TelegramPostFields {
  kind: TelegramPostKind;
  /** The questionnaire send (reminder, questionnaire) it is about, or null. */
  refId: string | null;
  /** The members it names, as ids (lead, questionnaire). */
  tagUserIds: string[] | null;
}

export interface TelegramPostKindEntry {
  tick: TelegramPostTick | null;
  render(
    post: QueuedPost,
    siteUrl: string,
    db: DbOrTx,
  ): Promise<TelegramPost | null>;
}

const plain: TelegramPostKindEntry["render"] = async (post, siteUrl) =>
  renderPlainPost(post, siteUrl);

export const TELEGRAM_POST_KINDS: Readonly<
  Record<TelegramPostKind, TelegramPostKindEntry>
> = {
  /** A captain's announcement to everyone, "Also post in Telegram" ticked. */
  announcement: { tick: "announcements", render: plain },
  /** The Finance team's general fee reminder: names nobody, no amount. */
  fee: { tick: null, render: plain },
  /** A new meeting in the Calendar (not one for picked people). */
  meeting: { tick: "meetings", render: plain },
  /**
   * A questionnaire reminder: tags who still owes it, worked out as it is
   * sent. Not posted once the send closed or nobody is left to name.
   */
  reminder: {
    tick: "reminders",
    async render(post, siteUrl, db) {
      const who = post.refId
        ? await reminderTags(post.refId, db)
        : { open: false, tags: [], untagged: 0 };
      if (!who.open || (who.tags.length === 0 && who.untagged === 0)) {
        return null;
      }
      return renderReminderPost({ ...post, ...who }, siteUrl);
    },
  },
  /**
   * A questionnaire posted by hand: the poster's picks, read now, so whoever
   * answered or left since is not tagged. A send closed since is not posted;
   * "Nobody" still posts.
   */
  questionnaire: {
    tick: null,
    async render(post, siteUrl, db) {
      const tags = post.refId
        ? await questionnairePostTags(post.refId, post.tagUserIds ?? [], db)
        : null;
      if (tags === null) return null;
      return renderQuestionnairePost({ ...post, tags }, siteUrl);
    },
  },
  /**
   * A captain's "Tell the camp on Telegram" after a new lead: the lead, read
   * now; an erased or departed member is not posted.
   */
  lead: {
    tick: null,
    async render(post, siteUrl, db) {
      const userId = post.tagUserIds?.[0];
      const lead = userId ? await pickedMember(userId, db) : null;
      if (!lead) return null;
      return renderLeadPost({ ...post, lead }, siteUrl);
    },
  },
};

// --- What the tagging kinds read as they are sent ---------------------------

export interface ReminderTags {
  /** Whether the send is still open; a closed one posts nothing. */
  open: boolean;
  /** `@handle` of each member who still owes it and gets no private notice. */
  tags: string[];
  /** The same members with no usable Telegram username. */
  untagged: number;
}

async function openSend(
  activationId: string,
  db: DbOrTx,
): Promise<{ questionnaireKey: string } | null> {
  const [act] = await db
    .select({
      status: schema.questionnaireActivations.status,
      questionnaireKey: schema.questionnaireActivations.questionnaireKey,
    })
    .from(schema.questionnaireActivations)
    .where(eq(schema.questionnaireActivations.id, activationId))
    .limit(1);
  return act?.status === "open" ? act : null;
}

/**
 * Who a questionnaire reminder tags: members who still owe the send (its
 * pending gates) under {@link GROUP_TAG} (said Coming this year), and have
 * not connected Ol' Jeb (a connected member gets the reminder privately). A
 * departed or system account is never named.
 */
export async function reminderTags(
  activationId: string,
  db: DbOrTx = createHttpDb(),
): Promise<ReminderTags> {
  const act = await openSend(activationId, db);
  if (!act) return { open: false, tags: [], untagged: 0 };
  const { reaches } = await owingMembers(
    db,
    { activationId, questionnaireKey: act.questionnaireKey },
    GROUP_TAG,
    await currentCycleNumber(db),
  );
  const tags: string[] = [];
  let untagged = 0;
  for (const member of reaches) {
    if (member.connected) continue;
    if (member.mention) tags.push(member.mention);
    else untagged += 1;
  }
  return { open: true, tags: [...new Set(tags)].sort(), untagged };
}

/**
 * The members a send still waits on, for the "Post in Telegram" dialog,
 * under {@link OWED_NUDGE}: a member who said Not coming is not chased in the
 * camp's chat, nor messaged about it (owner, 2026-10-27); they may still
 * answer. Empty for a send that is not open. Who owes a form and what they
 * said read at team lead and up; the caller gates who sees this.
 */
export async function questionnairePostCandidates(
  activationId: string,
  db: DbOrTx = createHttpDb(),
): Promise<TagCandidate[]> {
  const act = await openSend(activationId, db);
  if (!act) return [];
  const { reaches } = await owingMembers(
    db,
    { activationId, questionnaireKey: act.questionnaireKey },
    OWED_NUDGE,
    await currentCycleNumber(db),
  );
  return reaches
    .map((m) => ({
      userId: m.userId,
      name: m.name,
      intent: m.intent,
      status: m.status,
      mention: m.mention,
      connected: m.connected,
    }))
    .sort(
      (a, b) =>
        a.name.localeCompare(b.name, "en") || a.userId.localeCompare(b.userId),
    );
}

/**
 * The tags of a hand-posted questionnaire, read as it is sent: of the members
 * its poster picked, those who still owe it and are still here. Null when
 * the send is no longer open.
 */
async function questionnairePostTags(
  activationId: string,
  userIds: readonly string[],
  db: DbOrTx,
): Promise<string[] | null> {
  if (!(await openSend(activationId, db))) return null;
  const candidates = await questionnairePostCandidates(activationId, db);
  const picked = new Set(userIds);
  const tags = candidates
    .filter((c) => picked.has(c.userId) && c.mention)
    .map((c) => c.mention!);
  return [...new Set(tags)].sort();
}
