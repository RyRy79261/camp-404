import {
  and,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
  lte,
  or,
  sql,
} from "drizzle-orm";
import type { DbOrTx } from "./audit";
import { createHttpDb, createPooledDb, withTransaction } from "./index";
import * as schema from "./schema";
import { computeAudience, type BroadcastScope } from "./audience";
import { currentCycleNumber } from "./cycles";

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

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const DRAFT_MISSING = "This draft no longer exists. Reload the page.";
export const DRAFT_NOT_YOURS =
  "Only the captain who wrote this draft can change or publish it.";
export const DRAFT_PUBLISHED =
  "This announcement is already published, so it can't be changed. Publish a correction instead.";

/**
 * Why an edit, delete or publish of a draft wrote nothing, as the sentence the
 * captain reads. The writes claim a row with one predicate (owned, still a
 * draft), so a refusal alone cannot say which part failed. This reads the row
 * once to tell the three real causes apart, instead of one message that
 * blames all three.
 */
export async function explainDraftRefusal(
  id: string,
  senderId: string,
): Promise<string> {
  if (!UUID.test(id)) return DRAFT_MISSING;
  const db = createHttpDb();
  const [row] = await db
    .select({
      senderId: schema.broadcasts.senderId,
      kind: schema.broadcasts.kind,
      publishedAt: schema.broadcasts.publishedAt,
    })
    .from(schema.broadcasts)
    .where(eq(schema.broadcasts.id, id))
    .limit(1);
  if (!row || row.kind !== "announcement") return DRAFT_MISSING;
  if (row.senderId !== senderId) return DRAFT_NOT_YOURS;
  if (row.publishedAt) return DRAFT_PUBLISHED;
  return DRAFT_MISSING;
}

/**
 * How many members a camp-wide announcement from this captain would reach
 * right now: the same audience publishAnnouncement fans out to. The publish
 * confirmation names it.
 */
export async function countAnnouncementAudience(
  senderId: string,
): Promise<number> {
  const ids = await resolveAudience(
    { id: "", scope: "everyone", team: null },
    senderId,
  );
  return ids.length;
}

/**
 * Recipient user ids for a broadcast, resolved by scope — the single audience
 * primitive the inline publish and the scheduled dispatch worker share. Reads
 * via the stateless HTTP driver; the pure scope→ids mapping lives in
 * ./audience so it can be unit-tested without a database.
 *
 * Team membership and driver intent are year-scoped, so a `team`, `team_leads`
 * or `drivers` broadcast resolves against THIS YEAR's roster. Unscoped it would
 * reach the union of every year the camp has run — last year's kitchen team
 * would still get this year's kitchen announcement.
 */
export async function resolveAudience(
  broadcast: { id: string; scope: BroadcastScope; team: string | null },
  senderId: string | null,
  db: DbOrTx = createHttpDb(),
): Promise<string[]> {
  const cycle = await currentCycleNumber(db);
  const [members, memberships, drivers, targets] = await Promise.all([
    db
      .select({
        id: schema.users.id,
        isSystem: schema.users.isSystem,
        sanitised: schema.users.sanitised,
        approvalStatus: schema.users.approvalStatus,
      })
      .from(schema.users),
    db
      .select({
        userId: schema.teamMemberships.userId,
        team: schema.teamMemberships.team,
        isLead: schema.teamMemberships.isLead,
      })
      .from(schema.teamMemberships)
      .where(eq(schema.teamMemberships.cycle, cycle)),
    db
      .select({ userId: schema.driverProfiles.userId })
      .from(schema.driverProfiles)
      .where(
        and(
          eq(schema.driverProfiles.intendsToDrive, true),
          eq(schema.driverProfiles.cycle, cycle),
        ),
      ),
    broadcast.scope === "individual"
      ? db
          .select({ userId: schema.broadcastTargets.userId })
          .from(schema.broadcastTargets)
          .where(eq(schema.broadcastTargets.broadcastId, broadcast.id))
      : Promise.resolve([] as { userId: string }[]),
  ]);

  return computeAudience(
    broadcast,
    {
      members,
      memberships,
      driverUserIds: drivers.map((d) => d.userId),
      targetUserIds: targets.map((t) => t.userId),
    },
    senderId,
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
  const published = await withTransaction(async (tx) => {
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
    if (!broadcast) return null;

    // Resolve the audience via the shared resolver (scope = 'everyone' for a
    // camp-wide announcement — same recipient set as before). ON CONFLICT DO
    // NOTHING pairs with the new (broadcast_id, user_id) dedupe index so a
    // retry can never double-deliver.
    // Read inside the transaction: the audience is the camp as it stands when
    // the claim commits, on the same connection that holds the claim.
    const recipientIds = await resolveAudience(
      { id: broadcast.id, scope: "everyone", team: null },
      input.senderId,
      tx,
    );

    if (recipientIds.length === 0) {
      return { ok: true as const, recipientCount: 0 };
    }

    await tx
      .insert(schema.notificationDeliveries)
      .values(
        recipientIds.map((userId) => ({
          broadcastId: broadcast.id,
          userId,
          title: broadcast.title,
          body: broadcast.body,
          channel: broadcast.channel,
          presentation: broadcast.presentation,
          refType: "announcement",
          refId: broadcast.id,
        })),
      )
      .onConflictDoNothing();

    return { ok: true as const, recipientCount: recipientIds.length };
  });
  // Explained after the transaction ends: the claim wrote nothing, and the
  // explanation is a separate read.
  return (
    published ?? {
      ok: false,
      error: await explainDraftRefusal(input.id, input.senderId),
    }
  );
}

export interface DispatchResult {
  dispatched: number;
  deliveries: number;
}

/**
 * Scheduled fan-out worker. Materialises `notification_deliveries` for every
 * broadcast that is published, not yet dispatched, and whose `send_at` has
 * arrived (or is immediate / NULL). Each broadcast is claimed by atomically
 * flipping `dispatched_at`, so overlapping cron runs can't double-process it;
 * the `(broadcast_id, user_id)` dedupe index makes the insert idempotent too.
 * Immediate camp-wide announcements still fan out inline via
 * {@link publishAnnouncement} — this drains the deferred / scheduled tail.
 */
export async function dispatchDueBroadcasts(
  now: Date = new Date(),
): Promise<DispatchResult> {
  const httpDb = createHttpDb();
  const due = await httpDb
    .select({
      id: schema.broadcasts.id,
      senderId: schema.broadcasts.senderId,
      scope: schema.broadcasts.scope,
      team: schema.broadcasts.team,
      title: schema.broadcasts.title,
      body: schema.broadcasts.body,
      channel: schema.broadcasts.channel,
      presentation: schema.broadcasts.presentation,
      refType: schema.broadcasts.refType,
      refId: schema.broadcasts.refId,
    })
    .from(schema.broadcasts)
    .where(
      and(
        isNotNull(schema.broadcasts.publishedAt),
        isNull(schema.broadcasts.dispatchedAt),
        or(
          isNull(schema.broadcasts.sendAt),
          lte(schema.broadcasts.sendAt, now),
        ),
      ),
    );

  if (due.length === 0) return { dispatched: 0, deliveries: 0 };

  const { db, pool } = createPooledDb();
  let dispatched = 0;
  let deliveries = 0;
  try {
    for (const b of due) {
      const recipientIds = await resolveAudience(
        { id: b.id, scope: b.scope, team: b.team },
        b.senderId,
      );
      const claimedOk = await db.transaction(async (tx) => {
        const claimed = await tx
          .update(schema.broadcasts)
          .set({ dispatchedAt: now })
          .where(
            and(
              eq(schema.broadcasts.id, b.id),
              isNull(schema.broadcasts.dispatchedAt),
            ),
          )
          .returning({ id: schema.broadcasts.id });
        if (!claimed[0]) return false; // another run already dispatched it
        if (recipientIds.length > 0) {
          await tx
            .insert(schema.notificationDeliveries)
            .values(
              recipientIds.map((userId) => ({
                broadcastId: b.id,
                userId,
                title: b.title,
                body: b.body,
                channel: b.channel,
                presentation: b.presentation,
                refType: b.refType ?? null,
                refId: b.refId ?? b.id,
              })),
            )
            .onConflictDoNothing();
        }
        return true;
      });
      if (claimedOk) {
        dispatched += 1;
        deliveries += recipientIds.length;
      }
    }
    return { dispatched, deliveries };
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
  /** What the notification is about; notificationLink maps it to a page. */
  refType: string | null;
  refId: string | null;
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
      refType: schema.notificationDeliveries.refType,
      refId: schema.notificationDeliveries.refId,
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

export interface AnnouncementReading {
  deliveryId: string;
  title: string;
  body: string;
  presentation: AnnouncementPresentation;
  senderName: string | null;
  publishedAt: Date;
  acknowledgedAt: Date | null;
}

/**
 * One announcement, as the member it was delivered to reads it.
 *
 * The delivery row is the permission. Publishing wrote a delivery for exactly
 * the members the announcement was for, so a member with no delivery gets
 * null, and the broadcast row is not read at all: the answer for "not for you"
 * and "does not exist" is the same. There is no second audience rule here to
 * drift from resolveAudience.
 *
 * The member reads the copy delivered to them, not the broadcast's current
 * text. A draft has no deliveries, so it can never be read here.
 */
export async function getAnnouncementForMember(
  userId: string,
  broadcastId: string,
): Promise<AnnouncementReading | null> {
  if (!UUID.test(broadcastId)) return null;
  const db = createHttpDb();
  const [delivery] = await db
    .select({
      id: schema.notificationDeliveries.id,
      title: schema.notificationDeliveries.title,
      body: schema.notificationDeliveries.body,
      presentation: schema.notificationDeliveries.presentation,
      acknowledgedAt: schema.notificationDeliveries.acknowledgedAt,
    })
    .from(schema.notificationDeliveries)
    .where(
      and(
        eq(schema.notificationDeliveries.userId, userId),
        eq(schema.notificationDeliveries.broadcastId, broadcastId),
      ),
    )
    .limit(1);
  if (!delivery) return null;

  const [broadcast] = await db
    .select({
      kind: schema.broadcasts.kind,
      publishedAt: schema.broadcasts.publishedAt,
      senderName: schema.users.displayName,
    })
    .from(schema.broadcasts)
    .leftJoin(schema.users, eq(schema.users.id, schema.broadcasts.senderId))
    .where(eq(schema.broadcasts.id, broadcastId))
    .limit(1);
  if (!broadcast?.publishedAt || broadcast.kind !== "announcement") {
    return null;
  }

  return {
    deliveryId: delivery.id,
    title: delivery.title,
    body: delivery.body,
    presentation: delivery.presentation,
    senderName: broadcast.senderName ?? null,
    publishedAt: broadcast.publishedAt,
    acknowledgedAt: delivery.acknowledgedAt,
  };
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
