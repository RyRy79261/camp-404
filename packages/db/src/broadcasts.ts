import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { createHttpDb, createPooledDb } from "./index";
import * as schema from "./schema";

// Announcements & notifications data layer.
//
// An "announcement" is a `broadcasts` row with `kind = 'announcement'` and
// `scope = 'everyone'`. It starts life as a *draft* (`publishedAt IS NULL`),
// editable only by its author. Publishing stamps `publishedAt` and fans the
// message out into one `notification_deliveries` row per recipient — every
// real camp member except the author — copying the title/body/channel and
// presentation variant onto each delivery so the recipient's inbox and the
// acknowledge gate are self-contained.
//
// All of the captain-facing writers here MUST be gated behind a captain rank
// check by their callers; this module trusts the `senderId` it is handed.

export type AnnouncementPresentation =
  (typeof schema.broadcastPresentationEnum.enumValues)[number];

// Every mutation here targets a draft *announcement* by id + author. Locking
// the predicate to `kind = 'announcement'` and `scope = 'everyone'` keeps
// these writers from ever touching a broadcast of another kind (a team
// message, a reminder) that happened to share an id, even by mistake.
function isOwnedAnnouncementDraft(id: string, senderId: string) {
  return and(
    eq(schema.broadcasts.id, id),
    eq(schema.broadcasts.senderId, senderId),
    eq(schema.broadcasts.kind, "announcement"),
    eq(schema.broadcasts.scope, "everyone"),
    isNull(schema.broadcasts.publishedAt),
  );
}

export interface AnnouncementSummary {
  id: string;
  title: string;
  body: string;
  presentation: AnnouncementPresentation;
  senderId: string | null;
  senderName: string | null;
  /** NULL while a draft; the publish timestamp once sent. */
  publishedAt: Date | null;
  createdAt: Date;
  /** Recipients fanned out to (0 for drafts). */
  recipientCount: number;
  /** How many recipients have acknowledged (acknowledge variant only). */
  acknowledgedCount: number;
}

/**
 * Every announcement (drafts and published), newest first, with sender name
 * and delivery roll-ups for the captain's management view. Captain-only data
 * — gate the caller.
 */
export async function listAnnouncements(): Promise<AnnouncementSummary[]> {
  const db = createHttpDb();
  const rows = await db
    .select({
      id: schema.broadcasts.id,
      title: schema.broadcasts.title,
      body: schema.broadcasts.body,
      presentation: schema.broadcasts.presentation,
      senderId: schema.broadcasts.senderId,
      senderName: schema.users.displayName,
      publishedAt: schema.broadcasts.publishedAt,
      createdAt: schema.broadcasts.createdAt,
      recipientCount: sql<number>`(
        select count(*)::int from notification_deliveries nd
        where nd.broadcast_id = ${schema.broadcasts.id}
      )`,
      acknowledgedCount: sql<number>`(
        select count(*)::int from notification_deliveries nd
        where nd.broadcast_id = ${schema.broadcasts.id}
          and nd.acknowledged_at is not null
      )`,
    })
    .from(schema.broadcasts)
    .leftJoin(schema.users, eq(schema.users.id, schema.broadcasts.senderId))
    .where(eq(schema.broadcasts.kind, "announcement"))
    .orderBy(desc(schema.broadcasts.createdAt));

  return rows.map((r) => ({
    ...r,
    recipientCount: r.recipientCount ?? 0,
    acknowledgedCount: r.acknowledgedCount ?? 0,
  }));
}

export interface DraftInput {
  senderId: string;
  title: string;
  body: string;
  presentation: AnnouncementPresentation;
}

/** Create a new announcement draft (unpublished). Returns its id. */
export async function createAnnouncementDraft(
  input: DraftInput,
): Promise<{ id: string }> {
  const db = createHttpDb();
  const [row] = await db
    .insert(schema.broadcasts)
    .values({
      senderId: input.senderId,
      kind: "announcement",
      scope: "everyone",
      title: input.title,
      body: input.body,
      presentation: input.presentation,
    })
    .returning({ id: schema.broadcasts.id });
  return { id: row!.id };
}

/**
 * Edit a draft. No-op (returns false) if the row is missing, already
 * published, or owned by another sender — drafts are author-private.
 */
export async function updateAnnouncementDraft(input: {
  id: string;
  senderId: string;
  title: string;
  body: string;
  presentation: AnnouncementPresentation;
}): Promise<boolean> {
  const db = createHttpDb();
  const rows = await db
    .update(schema.broadcasts)
    .set({
      title: input.title,
      body: input.body,
      presentation: input.presentation,
    })
    .where(isOwnedAnnouncementDraft(input.id, input.senderId))
    .returning({ id: schema.broadcasts.id });
  return rows.length > 0;
}

/** Delete a draft. Refuses (returns false) once published or if not the author. */
export async function deleteAnnouncementDraft(input: {
  id: string;
  senderId: string;
}): Promise<boolean> {
  const db = createHttpDb();
  const rows = await db
    .delete(schema.broadcasts)
    .where(isOwnedAnnouncementDraft(input.id, input.senderId))
    .returning({ id: schema.broadcasts.id });
  return rows.length > 0;
}

export type PublishResult =
  | { ok: true; recipientCount: number }
  | { ok: false; error: string };

/**
 * Publish a draft to the whole camp. In one transaction: stamp
 * `publishedAt`/`dispatchedAt`, then insert a `notification_deliveries` row
 * for every real (non-system, non-sanitised) member except the author. The
 * delivery copies the announcement's title/body/channel/presentation and
 * deep-links back to the broadcast via `refType = 'announcement'`.
 *
 * Idempotent on the draft → published transition: a row already published is
 * rejected, so a double-submit can't double-fan-out.
 */
export async function publishAnnouncement(input: {
  id: string;
  senderId: string;
}): Promise<PublishResult> {
  const { db, pool } = createPooledDb();
  try {
    return await db.transaction(async (tx) => {
      // Claim the draft: only an unpublished row owned by this sender flips.
      const claimed = await tx
        .update(schema.broadcasts)
        .set({ publishedAt: new Date(), dispatchedAt: new Date() })
        .where(isOwnedAnnouncementDraft(input.id, input.senderId))
        .returning({
          id: schema.broadcasts.id,
          title: schema.broadcasts.title,
          body: schema.broadcasts.body,
          channel: schema.broadcasts.channel,
          presentation: schema.broadcasts.presentation,
        });

      const broadcast = claimed[0];
      if (!broadcast) {
        return {
          ok: false as const,
          error: "Draft not found, already published, or not yours.",
        };
      }

      // Resolve the audience: every real member except the author. The camp
      // is small (tens of people), so materialising ids then bulk-inserting
      // is clearer — and just as atomic inside this transaction — as an
      // INSERT…SELECT.
      const recipients = await tx
        .select({ id: schema.users.id })
        .from(schema.users)
        .where(
          and(
            eq(schema.users.isSystem, false),
            eq(schema.users.sanitised, false),
            sql`${schema.users.id} <> ${input.senderId}`,
          ),
        );

      if (recipients.length === 0) {
        return { ok: true as const, recipientCount: 0 };
      }

      await tx.insert(schema.notificationDeliveries).values(
        recipients.map((r) => ({
          broadcastId: broadcast.id,
          userId: r.id,
          title: broadcast.title,
          body: broadcast.body,
          channel: broadcast.channel,
          presentation: broadcast.presentation,
          refType: "announcement",
          refId: broadcast.id,
        })),
      );

      return { ok: true as const, recipientCount: recipients.length };
    });
  } finally {
    await pool.end();
  }
}

// --- Recipient side ------------------------------------------------------

export interface PendingAcknowledgement {
  deliveryId: string;
  title: string;
  body: string;
  senderName: string | null;
  createdAt: Date;
}

/**
 * A user's outstanding full-screen acknowledgements: `presentation =
 * 'acknowledge'` deliveries they have not yet acknowledged. Oldest first so
 * the gate clears them in arrival order.
 */
export async function getPendingAcknowledgements(
  userId: string,
): Promise<PendingAcknowledgement[]> {
  const db = createHttpDb();
  const rows = await db
    .select({
      deliveryId: schema.notificationDeliveries.id,
      title: schema.notificationDeliveries.title,
      body: schema.notificationDeliveries.body,
      senderName: schema.users.displayName,
      createdAt: schema.notificationDeliveries.createdAt,
    })
    .from(schema.notificationDeliveries)
    .leftJoin(
      schema.broadcasts,
      eq(schema.broadcasts.id, schema.notificationDeliveries.broadcastId),
    )
    .leftJoin(schema.users, eq(schema.users.id, schema.broadcasts.senderId))
    .where(
      and(
        eq(schema.notificationDeliveries.userId, userId),
        eq(schema.notificationDeliveries.presentation, "acknowledge"),
        isNull(schema.notificationDeliveries.acknowledgedAt),
      ),
    )
    .orderBy(schema.notificationDeliveries.createdAt);
  return rows;
}

/**
 * Acknowledge (and implicitly read) one delivery on the user's behalf.
 * Scoped to the owner so a user can only dismiss their own. Returns whether a
 * row was affected.
 */
export async function acknowledgeDelivery(input: {
  deliveryId: string;
  userId: string;
}): Promise<boolean> {
  const db = createHttpDb();
  const now = new Date();
  const rows = await db
    .update(schema.notificationDeliveries)
    .set({ acknowledgedAt: now, readAt: now })
    .where(
      and(
        eq(schema.notificationDeliveries.id, input.deliveryId),
        eq(schema.notificationDeliveries.userId, input.userId),
        // Only the full-screen variant carries an acknowledgement; never stamp
        // one on a popup/feed delivery that was never meant to be acknowledged.
        eq(schema.notificationDeliveries.presentation, "acknowledge"),
        isNull(schema.notificationDeliveries.acknowledgedAt),
      ),
    )
    .returning({ id: schema.notificationDeliveries.id });
  return rows.length > 0;
}

export interface InboxItem {
  id: string;
  title: string;
  body: string;
  presentation: AnnouncementPresentation;
  senderName: string | null;
  readAt: Date | null;
  acknowledgedAt: Date | null;
  createdAt: Date;
}

/** A user's notification inbox (everything delivered to them), newest first. */
export async function listInbox(userId: string): Promise<InboxItem[]> {
  const db = createHttpDb();
  return db
    .select({
      id: schema.notificationDeliveries.id,
      title: schema.notificationDeliveries.title,
      body: schema.notificationDeliveries.body,
      presentation: schema.notificationDeliveries.presentation,
      senderName: schema.users.displayName,
      readAt: schema.notificationDeliveries.readAt,
      acknowledgedAt: schema.notificationDeliveries.acknowledgedAt,
      createdAt: schema.notificationDeliveries.createdAt,
    })
    .from(schema.notificationDeliveries)
    .leftJoin(
      schema.broadcasts,
      eq(schema.broadcasts.id, schema.notificationDeliveries.broadcastId),
    )
    .leftJoin(schema.users, eq(schema.users.id, schema.broadcasts.senderId))
    .where(eq(schema.notificationDeliveries.userId, userId))
    .orderBy(desc(schema.notificationDeliveries.createdAt));
}

/** Count of a user's unread deliveries — drives the header bell badge. */
export async function countUnread(userId: string): Promise<number> {
  const db = createHttpDb();
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.notificationDeliveries)
    .where(
      and(
        eq(schema.notificationDeliveries.userId, userId),
        isNull(schema.notificationDeliveries.readAt),
      ),
    );
  return row?.count ?? 0;
}

/**
 * Mark a user's deliveries as read. Pass the exact `ids` the caller just
 * snapshotted (e.g. from {@link listInbox}) so a delivery that arrives between
 * the snapshot and this write isn't silently marked read without being shown.
 * An empty list is a no-op.
 */
export async function markRead(userId: string, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const db = createHttpDb();
  await db
    .update(schema.notificationDeliveries)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(schema.notificationDeliveries.userId, userId),
        inArray(schema.notificationDeliveries.id, ids),
        isNull(schema.notificationDeliveries.readAt),
      ),
    );
}
