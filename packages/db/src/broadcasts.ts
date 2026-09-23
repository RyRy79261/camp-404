import {
  and,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
  lte,
  ne,
  or,
  sql,
} from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { writeAuditEvent, type DbOrTx } from "./audit";
import {
  announcementNotification,
  notificationLink,
  scheduledBroadcastNotification,
  sortPinned,
  type NotificationKind,
} from "@camp404/core";
import {
  ANNOUNCEMENT_NOTIFICATION_KINDS,
  type InboxFilter,
} from "@camp404/types";
import { deliveryValues } from "./deliveries";
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
    isNull(schema.broadcasts.publishedAt),
  );
}

type Team = (typeof schema.teamEnum.enumValues)[number];

/** Who an announcement goes to. Mirrors AnnouncementAudience in @camp404/types. */
export type Audience = { scope: "everyone" } | { scope: "team"; team: Team };

function audienceColumns(audience: Audience) {
  return audience.scope === "team"
    ? { scope: "team" as const, team: audience.team }
    : { scope: "everyone" as const, team: null };
}

/** Read an announcement row's audience back. Anything else reads as everyone. */
function audienceOf(row: { scope: string; team: Team | null }): Audience {
  return row.scope === "team" && row.team
    ? { scope: "team", team: row.team }
    : { scope: "everyone" };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const DRAFT_MISSING = "This draft no longer exists. Reload the page.";
export const DRAFT_NOT_YOURS =
  "Only the captain who wrote this draft can change or publish it.";
export const DRAFT_PUBLISHED =
  "This announcement is already published, so it can't be changed. Publish a correction instead.";
export const DRAFT_TEAM_NOT_LED =
  "You can only send to a team you lead. Pick one of your teams, or ask a captain to send it.";

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
  allowedTeams?: readonly string[],
): Promise<string> {
  if (!UUID.test(id)) return DRAFT_MISSING;
  const db = createHttpDb();
  const [row] = await db
    .select({
      senderId: schema.broadcasts.senderId,
      kind: schema.broadcasts.kind,
      publishedAt: schema.broadcasts.publishedAt,
      scope: schema.broadcasts.scope,
      team: schema.broadcasts.team,
    })
    .from(schema.broadcasts)
    .where(eq(schema.broadcasts.id, id))
    .limit(1);
  if (!row || row.kind !== "announcement") return DRAFT_MISSING;
  if (row.senderId !== senderId) return DRAFT_NOT_YOURS;
  if (row.publishedAt) return DRAFT_PUBLISHED;
  if (allowedTeams && !isAllowedAudience(audienceOf(row), allowedTeams)) {
    return DRAFT_TEAM_NOT_LED;
  }
  return DRAFT_MISSING;
}

/**
 * Whether a sender limited to `allowedTeams` (a team lead) may send to an
 * audience: only a team on their list, never the whole camp. A captain passes
 * no list and may send to anyone.
 */
export function isAllowedAudience(
  audience: Audience,
  allowedTeams?: readonly string[],
): boolean {
  if (!allowedTeams) return true;
  return audience.scope === "team" && allowedTeams.includes(audience.team);
}

/**
 * How many members a camp-wide announcement from this captain would reach
 * right now: the same audience publishAnnouncement fans out to. The publish
 * confirmation names it.
 */
export async function countAnnouncementAudience(
  senderId: string,
  audience: Audience = { scope: "everyone" },
): Promise<number> {
  const ids = await resolveAudience(
    { id: "", ...audienceColumns(audience) },
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
  audience: Audience;
  senderId: string | null;
  senderName: string | null;
  /** NULL while a draft; the publish timestamp once sent. */
  publishedAt: Date | null;
  /** NULL when not pinned. Only a published announcement is ever pinned. */
  pinnedAt: Date | null;
  /**
   * The composer's "keep it at the top" on a DRAFT: publishing spends it into
   * a pin. False once published. The editor reads it back, so reopening a
   * marked draft keeps the mark instead of clearing it on the next save.
   */
  pinOnPublish: boolean;
  createdAt: Date;
  /** Recipients fanned out to (0 for drafts). */
  recipientCount: number;
  /** How many recipients have acknowledged (acknowledge variant only). */
  acknowledgedCount: number;
  /**
   * How many recipients have seen it: its inbox row is marked read, which
   * happens when they open their inbox (or acknowledge a full-screen one).
   */
  readCount: number;
}

/**
 * Every announcement (drafts and published), newest first, with sender name
 * and delivery roll-ups for the captain's management view. Captain-only data
 * — gate the caller.
 */
export async function listAnnouncements(
  options: { senderId?: string } = {},
): Promise<AnnouncementSummary[]> {
  const db = createHttpDb();
  const rows = await db
    .select({
      id: schema.broadcasts.id,
      title: schema.broadcasts.title,
      body: schema.broadcasts.body,
      presentation: schema.broadcasts.presentation,
      scope: schema.broadcasts.scope,
      team: schema.broadcasts.team,
      senderId: schema.broadcasts.senderId,
      senderName: schema.users.displayName,
      publishedAt: schema.broadcasts.publishedAt,
      pinnedAt: schema.broadcasts.pinnedAt,
      pinOnPublish: schema.broadcasts.pinOnPublish,
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
      readCount: sql<number>`(
        select count(*)::int from notification_deliveries nd
        where nd.broadcast_id = ${schema.broadcasts.id}
          and nd.read_at is not null
      )`,
    })
    .from(schema.broadcasts)
    .leftJoin(schema.users, eq(schema.users.id, schema.broadcasts.senderId))
    .where(
      and(
        eq(schema.broadcasts.kind, "announcement"),
        options.senderId
          ? eq(schema.broadcasts.senderId, options.senderId)
          : undefined,
      ),
    )
    .orderBy(desc(schema.broadcasts.createdAt));

  return rows.map(({ scope, team, ...r }) => ({
    ...r,
    audience: audienceOf({ scope, team }),
    recipientCount: r.recipientCount ?? 0,
    acknowledgedCount: r.acknowledgedCount ?? 0,
    readCount: r.readCount ?? 0,
  }));
}

export interface DraftInput {
  senderId: string;
  title: string;
  body: string;
  presentation: AnnouncementPresentation;
  audience?: Audience;
  /**
   * The composer's "keep it at the top". Pinning is the second axis beside
   * `presentation`: presentation is how loudly it lands, this is whether it
   * stays on screen afterwards. Marked on the draft, inert until it is
   * published — `listPinnedForUser` only ever reads a published broadcast the
   * viewer actually received.
   */
  pinned?: boolean;
}

/**
 * The composer's "keep it at the top", recorded on a DRAFT as an intent.
 *
 * A draft must not write `pinned_at`: that column is a pin, and a pin belongs
 * on every recipient's screen, so it is only ever set through the audited
 * path (`setAnnouncementPinned`, or `publishAnnouncement` below, which writes
 * the same audit row). Stamping it here also re-stamped its time on every
 * later edit, which would have made "newest pin first" mean "most recently
 * edited draft first".
 */
function pinIntentColumns(pinned: boolean | undefined) {
  return { pinOnPublish: pinned === true };
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
      ...audienceColumns(input.audience ?? { scope: "everyone" }),
      title: input.title,
      body: input.body,
      presentation: input.presentation,
      ...pinIntentColumns(input.pinned),
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
  audience?: Audience;
  pinned?: boolean;
}): Promise<boolean> {
  const db = createHttpDb();
  const rows = await db
    .update(schema.broadcasts)
    .set({
      title: input.title,
      body: input.body,
      presentation: input.presentation,
      ...audienceColumns(input.audience ?? { scope: "everyone" }),
      ...pinIntentColumns(input.pinned),
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
  // Who the sender may reach, as the transaction saw it — kept for the refusal
  // sentence, which is read after the transaction ends.
  let reach: readonly Team[] | undefined;
  const published = await withTransaction(async (tx) => {
    reach = await lockSenderReach(tx, input.senderId);
    // Claim the draft: only an unpublished row owned by this sender flips,
    // and for a lead only one addressed to a team they lead RIGHT NOW.
    const claimed = await tx
      .update(schema.broadcasts)
      .set({ publishedAt: new Date(), dispatchedAt: new Date() })
      .where(
        and(
          isOwnedAnnouncementDraft(input.id, input.senderId),
          reachClaim(reach),
        ),
      )
      .returning({
        id: schema.broadcasts.id,
        title: schema.broadcasts.title,
        body: schema.broadcasts.body,
        channel: schema.broadcasts.channel,
        presentation: schema.broadcasts.presentation,
        scope: schema.broadcasts.scope,
        team: schema.broadcasts.team,
        pinOnPublish: schema.broadcasts.pinOnPublish,
      });

    const broadcast = claimed[0];
    if (!broadcast) return null;

    // The composer asked for this one to stay at the top. Turn that intent
    // into the real pin here, in the claim's own transaction and through the
    // same audit row a later Pin press writes — a pin reaches every
    // recipient's screen, so no path to one may go unrecorded. The intent is
    // cleared as it is spent, so re-publishing cannot pin twice.
    if (broadcast.pinOnPublish) {
      await tx
        .update(schema.broadcasts)
        .set({
          pinnedAt: new Date(),
          pinnedBy: input.senderId,
          pinOnPublish: false,
        })
        .where(eq(schema.broadcasts.id, broadcast.id));
      await writeAuditEvent(tx, {
        actorId: input.senderId,
        action: "announcement.pinned",
        target: broadcast.id,
        metadata: { scope: broadcast.scope, team: broadcast.team },
      });
    }

    // Resolve the draft's own audience via the shared resolver. ON CONFLICT DO
    // NOTHING pairs with the (broadcast_id, user_id) dedupe index so a retry
    // can never double-deliver. Read inside the transaction: the audience is
    // the camp as it stands when the claim commits, on the same connection
    // that holds the claim.
    const recipientIds = await resolveAudience(
      { id: broadcast.id, scope: broadcast.scope, team: broadcast.team },
      input.senderId,
      tx,
    );

    if (recipientIds.length === 0) {
      return { ok: true as const, recipientCount: 0 };
    }

    const payload = announcementNotification({
      broadcastId: broadcast.id,
      title: broadcast.title,
      body: broadcast.body,
    });
    await tx
      .insert(schema.notificationDeliveries)
      .values(
        recipientIds.map((userId) =>
          deliveryValues(payload, {
            userId,
            broadcastId: broadcast.id,
            channel: broadcast.channel,
            presentation: broadcast.presentation,
          }),
        ),
      )
      .onConflictDoNothing();

    return { ok: true as const, recipientCount: recipientIds.length };
  });
  // Explained after the transaction ends: the claim wrote nothing, and the
  // explanation is a separate read.
  return (
    published ?? {
      ok: false,
      error: await explainDraftRefusal(input.id, input.senderId, reach),
    }
  );
}

// --- Pinning --------------------------------------------------------------
//
// Pinning is the second axis beside `presentation`. Presentation is how loudly
// an announcement LANDS (full-screen, pop-up, quiet); a pin is whether it STAYS
// on screen afterwards, in a banner above every console page. Any presentation
// may be pinned.
//
// PINNING AUTHORITY FOLLOWS POSTING AUTHORITY (owner's call, 2026-09-22): "If I
// am allowed to post to everyone, then that means I'm also allowed to pin
// something that is posted to everyone." The rule itself is `canSendToAudience`
// in @camp404/core, applied by the caller against this broadcast's own
// audience. The caller's answer is a snapshot, so the claim below does not
// trust it: like `publishAnnouncement`, it reads the actor's rank and lead
// teams again inside its own transaction and holds them (`lockSenderReach`).

export const PIN_MISSING =
  "That announcement no longer exists. Reload the page.";
export const PIN_NOT_PUBLISHED =
  "Only a published announcement can be pinned. Publish it first.";
export const PIN_TEAM_NOT_LED =
  "You can only pin an announcement to a team you lead.";
export const PIN_ALREADY = "It's already pinned. Reload the page.";
export const PIN_ALREADY_OFF = "It isn't pinned. Reload the page.";

/** A pinned announcement as the banner shows it. */
export interface PinnedAnnouncement {
  id: string;
  title: string;
  publishedAt: Date;
  /** When it was pinned — what the banner's order is on. */
  pinnedAt: Date;
  /** Whether a captain pinned it; breaks a tie in `comparePinned`. */
  pinnedByCaptain: boolean;
}

/**
 * Every pinned announcement THIS member actually received, in banner order.
 *
 * ALL of them, not a top few (owner's call, 2026-09-22): the banner is a
 * scroller the reader moves through, and it names the count, so a pin can never
 * be silently dropped off the end of a list. The set is small and bounded by
 * what captains bother to pin, and a partial index covers the rows.
 *
 * The audience is not re-resolved here, and must not be: the member already has
 * a `notification_deliveries` row for every broadcast that reached them, so the
 * join IS the audience, settled at fan-out. Re-resolving would leak a team pin
 * to a member who joined the team after the send — and, worse, would need a
 * second, parallel answer to "who may see this".
 *
 * Consequences of the join, each covered by a test: a draft has no deliveries,
 * so a pinned draft never shows; a delivery that was removed takes its pin with
 * it; and a pin on a team announcement is invisible to everyone off that team.
 *
 * The ORDER is `sortPinned` in @camp404/core and nowhere else — newest pinned
 * first, a captain's pin above a lead's on a tie, the id breaking the rest. It
 * is done here rather than in SQL because it must be one function the banner,
 * the test store and the tests all share; a second copy in an ORDER BY is
 * exactly how the two would drift apart.
 */
export async function listPinnedForUser(
  userId: string,
): Promise<PinnedAnnouncement[]> {
  const db = createHttpDb();
  const pinner = alias(schema.users, "pinner");
  const rows = await db
    .select({
      id: schema.broadcasts.id,
      title: schema.broadcasts.title,
      publishedAt: schema.broadcasts.publishedAt,
      pinnedAt: schema.broadcasts.pinnedAt,
      // NULL when nobody is on the other end of `pinned_by` — the column is
      // `set null`, so a deleted captain leaves the pin standing but anonymous.
      pinnerRank: pinner.rank,
    })
    .from(schema.broadcasts)
    .innerJoin(
      schema.notificationDeliveries,
      and(
        eq(schema.notificationDeliveries.broadcastId, schema.broadcasts.id),
        eq(schema.notificationDeliveries.userId, userId),
      ),
    )
    .leftJoin(pinner, eq(pinner.id, schema.broadcasts.pinnedBy))
    .where(
      and(
        eq(schema.broadcasts.kind, "announcement"),
        isNotNull(schema.broadcasts.pinnedAt),
        isNotNull(schema.broadcasts.publishedAt),
      ),
    );
  return sortPinned(
    rows.flatMap((r) =>
      r.publishedAt && r.pinnedAt
        ? [
            {
              id: r.id,
              title: r.title,
              publishedAt: r.publishedAt,
              pinnedAt: r.pinnedAt,
              pinnedByCaptain: r.pinnerRank === "captain",
            },
          ]
        : [],
    ),
  );
}

/** An announcement's audience and state, for the caller's authority check. */
export interface AnnouncementPinContext {
  audience: Audience;
  published: boolean;
  pinned: boolean;
}

/**
 * The stored audience of one announcement, so the caller can ask
 * `canSendToAudience` about it. Null when the id is not an announcement.
 */
export async function getAnnouncementPinContext(
  id: string,
): Promise<AnnouncementPinContext | null> {
  if (!UUID.test(id)) return null;
  const db = createHttpDb();
  const [row] = await db
    .select({
      kind: schema.broadcasts.kind,
      scope: schema.broadcasts.scope,
      team: schema.broadcasts.team,
      publishedAt: schema.broadcasts.publishedAt,
      pinnedAt: schema.broadcasts.pinnedAt,
    })
    .from(schema.broadcasts)
    .where(eq(schema.broadcasts.id, id))
    .limit(1);
  if (!row || row.kind !== "announcement") return null;
  return {
    audience: audienceOf(row),
    published: row.publishedAt !== null,
    pinned: row.pinnedAt !== null,
  };
}

/**
 * Who this sender may address, read INSIDE the write's own transaction and held
 * there until it commits.
 *
 * The action reads the sender's rank and lead teams first, to answer the screen
 * fast. That read is a snapshot. Between it and the write, a captain could
 * remove the lead or demote the captain, and a write that trusted the snapshot
 * would still publish or pin on the old answer (CodeRabbit on #225; owner:
 * "fix it now"). So the write asks again here, and `FOR SHARE` holds every row
 * the answer rests on: the year (`camp_settings`), the rank (`users`) and the
 * lead flags (`team_memberships`). A demotion, a lead removal or a year
 * rollover that committed first is what this read sees. One that comes later
 * waits until this transaction commits. The check and the write cannot fall
 * out of step.
 *
 * Lock order is camp_settings, then users, then team_memberships. No cycle of
 * waits can form, because every other writer of these rows either takes
 * camp_settings first (the year rollover) or takes only one of the three
 * (`setLead` / `removeTeam` touch team_memberships; `setUserRank` and
 * `acceptCaptainPromotion` touch users).
 *
 * `undefined` means a captain: every audience. Otherwise the teams this sender
 * leads this year, which may be none.
 */
async function lockSenderReach(
  tx: DbOrTx,
  senderId: string,
): Promise<readonly Team[] | undefined> {
  await tx
    .select({ id: schema.campSettings.id })
    .from(schema.campSettings)
    .for("share");
  const cycle = await currentCycleNumber(tx);
  const [sender] = await tx
    .select({ rank: schema.users.rank })
    .from(schema.users)
    .where(eq(schema.users.id, senderId))
    .for("share");
  if (sender?.rank === "captain") return undefined;
  const led = await tx
    .select({ team: schema.teamMemberships.team })
    .from(schema.teamMemberships)
    .where(
      and(
        eq(schema.teamMemberships.userId, senderId),
        eq(schema.teamMemberships.cycle, cycle),
        eq(schema.teamMemberships.isLead, true),
      ),
    )
    .for("share");
  return led.map((r) => r.team);
}

/** A lead's claim narrows the WHERE to the teams they lead; a captain's does not. */
function reachClaim(reach: readonly Team[] | undefined) {
  if (!reach) return undefined;
  return and(
    eq(schema.broadcasts.scope, "team"),
    reach.length > 0 ? inArray(schema.broadcasts.team, [...reach]) : sql`false`,
  );
}

export type PinResult = { ok: true } | { ok: false; error: string };

/**
 * Pin or unpin a published announcement, and record it.
 *
 * A compare-and-set: the WHERE names the state it expects to change (pinned or
 * not), so two captains racing cannot silently overwrite each other — the loser
 * gets a sentence. The audit row is written with the SAME transaction as the
 * update, because a pin puts a message on every recipient's screen and leaves
 * it there: that is a camp-config-grade act, and a receipt that can commit
 * without its change is worse than none.
 */
export async function setAnnouncementPinned(input: {
  id: string;
  actorId: string;
  pinned: boolean;
}): Promise<PinResult> {
  if (!UUID.test(input.id)) return { ok: false, error: PIN_MISSING };
  // Who the actor may reach, as the transaction saw it — kept for the refusal
  // sentence, which is read after the transaction ends.
  let reach: readonly Team[] | undefined;
  const done = await withTransaction(async (tx) => {
    reach = await lockSenderReach(tx, input.actorId);
    const claimed = await tx
      .update(schema.broadcasts)
      .set(
        input.pinned
          ? { pinnedAt: new Date(), pinnedBy: input.actorId }
          : { pinnedAt: null, pinnedBy: null },
      )
      .where(
        and(
          eq(schema.broadcasts.id, input.id),
          eq(schema.broadcasts.kind, "announcement"),
          // A pin only exists on a published announcement: enforced here, not
          // only on the screen that offers the button.
          isNotNull(schema.broadcasts.publishedAt),
          input.pinned
            ? isNull(schema.broadcasts.pinnedAt)
            : isNotNull(schema.broadcasts.pinnedAt),
          reachClaim(reach),
        ),
      )
      .returning({
        scope: schema.broadcasts.scope,
        team: schema.broadcasts.team,
      });
    const row = claimed[0];
    if (!row) return false;
    await writeAuditEvent(tx, {
      actorId: input.actorId,
      action: input.pinned ? "announcement.pinned" : "announcement.unpinned",
      target: input.id,
      metadata: { scope: row.scope, team: row.team },
    });
    return true;
  });
  if (done) return { ok: true };
  // Read AFTER the transaction has ended: the claim wrote nothing, and saying
  // which of the four reasons it was is a separate read.
  return {
    ok: false,
    error: await explainPinRefusal(input.id, input.pinned, reach),
  };
}

/** Why a pin or unpin claimed nothing, as the sentence the captain reads. */
async function explainPinRefusal(
  id: string,
  pinned: boolean,
  allowedTeams: readonly Team[] | undefined,
): Promise<string> {
  const context = await getAnnouncementPinContext(id);
  if (!context) return PIN_MISSING;
  if (!context.published) return PIN_NOT_PUBLISHED;
  if (allowedTeams && !isAllowedAudience(context.audience, allowedTeams)) {
    return PIN_TEAM_NOT_LED;
  }
  if (context.pinned === pinned) {
    return pinned ? PIN_ALREADY : PIN_ALREADY_OFF;
  }
  return PIN_MISSING;
}

export interface DispatchFailure {
  broadcastId: string;
  /** The error message, unredacted: the caller scrubs it before showing it. */
  error: string;
}

/**
 * The database's own words for a failure. Drizzle wraps a Postgres error in
 * one whose message is the whole query and its parameters (announcement text,
 * member ids), and keeps the Postgres error as `cause`.
 */
function failureMessage(err: unknown): string {
  if (!(err instanceof Error)) return String(err);
  return err.cause instanceof Error ? err.cause.message : err.message;
}

export interface DispatchResult {
  dispatched: number;
  deliveries: number;
  /**
   * Broadcasts that threw. Each one's claim rolled back, so it is still due
   * and the next run tries it again.
   */
  failures: DispatchFailure[];
}

/**
 * Scheduled fan-out worker. Materialises `notification_deliveries` for every
 * broadcast that is published, not yet dispatched, and whose `send_at` has
 * arrived (or is immediate / NULL). Each broadcast is claimed by atomically
 * flipping `dispatched_at`, so overlapping cron runs can't double-process it;
 * the `(broadcast_id, user_id)` dedupe index makes the insert idempotent too.
 * Immediate camp-wide announcements still fan out inline via
 * {@link publishAnnouncement} — this drains the deferred / scheduled tail.
 *
 * One broadcast that throws does not stop the others. It is reported in
 * `failures` and stays due.
 */
export async function dispatchDueBroadcasts(
  now: Date = new Date(),
): Promise<DispatchResult> {
  const httpDb = createHttpDb();
  const due = await httpDb
    .select({
      id: schema.broadcasts.id,
      kind: schema.broadcasts.kind,
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

  if (due.length === 0) return { dispatched: 0, deliveries: 0, failures: [] };

  const { db, pool } = createPooledDb();
  let dispatched = 0;
  let deliveries = 0;
  const failures: DispatchFailure[] = [];
  try {
    for (const b of due) {
      try {
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
            const payload = scheduledBroadcastNotification(b);
            await tx
              .insert(schema.notificationDeliveries)
              .values(
                recipientIds.map((userId) =>
                  deliveryValues(payload, {
                    userId,
                    broadcastId: b.id,
                    channel: b.channel,
                    presentation: b.presentation,
                  }),
                ),
              )
              .onConflictDoNothing();
          }
          return true;
        });
        if (claimedOk) {
          dispatched += 1;
          deliveries += recipientIds.length;
        }
      } catch (err) {
        failures.push({ broadcastId: b.id, error: failureMessage(err) });
      }
    }
    return { dispatched, deliveries, failures };
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

/** The most pop-ups one claim shows, so a backlog cannot bury the screen. */
export const POPUP_CLAIM_LIMIT = 3;

/** A pop-up delivery, claimed for showing as a toast. */
export interface ClaimedPopup {
  deliveryId: string;
  title: string;
  body: string;
  refType: string | null;
  refId: string | null;
  createdAt: Date;
}

/** Unread pop-up deliveries. The gate's poll reads it to know whether to claim. */
export async function countUnseenPopups(userId: string): Promise<number> {
  const db = createHttpDb();
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.notificationDeliveries)
    .where(
      and(
        eq(schema.notificationDeliveries.userId, userId),
        eq(schema.notificationDeliveries.presentation, "popup"),
        isNull(schema.notificationDeliveries.readAt),
      ),
    );
  return row?.count ?? 0;
}

/**
 * Claim a member's unread pop-up deliveries for showing, oldest first, and
 * mark them read in the same statement.
 *
 * A pop-up shows once (owner's call, 2026-09-16), so the claim IS the showing:
 * read_at is the "shown" mark. Two open tabs cannot both show one pop-up,
 * because the second UPDATE re-checks read_at IS NULL on a row the first has
 * already stamped. The message stays in the inbox, read.
 */
export async function claimPopups(userId: string): Promise<ClaimedPopup[]> {
  const db = createHttpDb();
  const oldest = db
    .select({ id: schema.notificationDeliveries.id })
    .from(schema.notificationDeliveries)
    .where(
      and(
        eq(schema.notificationDeliveries.userId, userId),
        eq(schema.notificationDeliveries.presentation, "popup"),
        isNull(schema.notificationDeliveries.readAt),
      ),
    )
    .orderBy(schema.notificationDeliveries.createdAt)
    .limit(POPUP_CLAIM_LIMIT);
  const rows = await db
    .update(schema.notificationDeliveries)
    .set({ readAt: new Date() })
    .where(
      and(
        inArray(schema.notificationDeliveries.id, oldest),
        eq(schema.notificationDeliveries.userId, userId),
        isNull(schema.notificationDeliveries.readAt),
      ),
    )
    .returning({
      deliveryId: schema.notificationDeliveries.id,
      title: schema.notificationDeliveries.title,
      body: schema.notificationDeliveries.body,
      refType: schema.notificationDeliveries.refType,
      refId: schema.notificationDeliveries.refId,
      createdAt: schema.notificationDeliveries.createdAt,
    });
  return rows.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
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
  /** What the notification is about. */
  kind: NotificationKind;
  /** Where tapping it goes (notificationLink; the inbox when it points nowhere). */
  link: string;
}

/** How many notifications the inbox shows at a time. */
export const INBOX_PAGE_SIZE = 30;

export interface InboxPage {
  items: InboxItem[];
  /** Pass back as `before` for the next (older) page; null on the last page. */
  nextCursor: string | null;
}

// A cursor is the last row's created_at, to the microsecond, and its id. The
// microseconds matter: a JavaScript Date keeps only milliseconds, and rows
// written in the same millisecond would otherwise be skipped between pages.
const INBOX_CURSOR =
  /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6})~([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

/** True when a string from a client is a cursor listInbox made. */
export function isInboxCursor(value: string): boolean {
  return INBOX_CURSOR.test(value);
}

/**
 * The tab's extra WHERE term. `all` adds nothing; drizzle drops an `undefined`
 * arm of an `and(...)` rather than matching everything on it.
 */
function inboxFilterCondition(filter: InboxFilter) {
  if (filter === "unread") return isNull(schema.notificationDeliveries.readAt);
  if (filter === "announcements") {
    return inArray(schema.notificationDeliveries.kind, [
      ...ANNOUNCEMENT_NOTIFICATION_KINDS,
    ]);
  }
  return undefined;
}

/**
 * One page of a member's inbox, newest first. Pass the previous page's
 * `nextCursor` as `before` to read further back. An unrecognised cursor reads
 * nothing, rather than restarting from the top.
 */
export async function listInbox(
  userId: string,
  options: {
    before?: string | null;
    limit?: number;
    filter?: InboxFilter;
  } = {},
): Promise<InboxPage> {
  const limit = options.limit ?? INBOX_PAGE_SIZE;
  let olderThan = undefined as ReturnType<typeof sql> | undefined;
  if (options.before != null) {
    const match = INBOX_CURSOR.exec(options.before);
    if (!match) return { items: [], nextCursor: null };
    olderThan = sql`(${schema.notificationDeliveries.createdAt}, ${schema.notificationDeliveries.id}) < (${match[1]}::timestamp, ${match[2]}::uuid)`;
  }
  // The tab narrows the WHERE, not the page that comes back: filtering a
  // fetched page would hand back short pages and a cursor that skips rows.
  const matchesFilter = inboxFilterCondition(options.filter ?? "all");

  const db = createHttpDb();
  const rows = await db
    .select({
      id: schema.notificationDeliveries.id,
      title: schema.notificationDeliveries.title,
      body: schema.notificationDeliveries.body,
      presentation: schema.notificationDeliveries.presentation,
      senderName: schema.users.displayName,
      readAt: schema.notificationDeliveries.readAt,
      acknowledgedAt: schema.notificationDeliveries.acknowledgedAt,
      createdAt: schema.notificationDeliveries.createdAt,
      kind: schema.notificationDeliveries.kind,
      refType: schema.notificationDeliveries.refType,
      refId: schema.notificationDeliveries.refId,
      cursorAt: sql<string>`to_char(${schema.notificationDeliveries.createdAt}, 'YYYY-MM-DD"T"HH24:MI:SS.US')`,
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
        olderThan,
        matchesFilter,
      ),
    )
    .orderBy(
      desc(schema.notificationDeliveries.createdAt),
      desc(schema.notificationDeliveries.id),
    )
    // One extra row says whether there is another page.
    .limit(limit + 1);

  const page = rows.slice(0, limit);
  const last = page.at(-1);
  return {
    items: page.map(({ refType, refId, cursorAt: _cursorAt, ...row }) => ({
      ...row,
      link: notificationLink(refType, refId),
    })),
    nextCursor:
      rows.length > limit && last ? `${last.cursorAt}~${last.id}` : null,
  };
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
 * The member's unread announcements per team: how many of the deliveries
 * {@link countUnread} counts came from a broadcast addressed to one team. Home
 * puts this on each team's icon, so "something new for Kitchen" is visible
 * without opening the inbox. Teams with nothing unread are absent.
 */
export async function countUnreadByTeam(
  userId: string,
): Promise<Partial<Record<Team, number>>> {
  const db = createHttpDb();
  const rows = await db
    .select({
      team: schema.broadcasts.team,
      count: sql<number>`count(*)::int`,
    })
    .from(schema.notificationDeliveries)
    .innerJoin(
      schema.broadcasts,
      eq(schema.broadcasts.id, schema.notificationDeliveries.broadcastId),
    )
    .where(
      and(
        eq(schema.notificationDeliveries.userId, userId),
        isNull(schema.notificationDeliveries.readAt),
        eq(schema.broadcasts.scope, "team"),
        isNotNull(schema.broadcasts.team),
      ),
    )
    .groupBy(schema.broadcasts.team);
  const out: Partial<Record<Team, number>> = {};
  for (const row of rows) if (row.team) out[row.team] = row.count;
  return out;
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

/**
 * Mark a member's unread deliveries read — the header panel's "Mark all read",
 * which clears the badge without opening the inbox.
 *
 * Same UPDATE as {@link markRead} without the id list, so it is scoped to the
 * caller's own rows by the very same `user_id` term: it can never touch
 * another member's inbox. `.returning()` gives the caller the number of rows
 * it actually cleared, so a second press reports 0 rather than pretending.
 *
 * `presentation = 'popup'` rows are LEFT UNREAD on purpose. For a pop-up,
 * `read_at` is not "the member read this", it is "the member was shown this":
 * {@link claimPopups} stamps it as it hands the pop-up to the screen, and
 * {@link countUnseenPopups} counts the ones still owed. Clearing them here
 * would consume a pop-up the member has never seen — exactly what the note on
 * {@link markRead} warns against — and a questionnaire release that is meant
 * to "shout until it's done" would never shout. They stay in the badge until
 * the poller shows them, which takes seconds; the member loses nothing.
 * {@link unreadClearableCount} is the same predicate, for the button's state.
 */
export async function markAllRead(userId: string): Promise<number> {
  const db = createHttpDb();
  const rows = await db
    .update(schema.notificationDeliveries)
    .set({ readAt: new Date() })
    .where(clearableUnread(userId))
    .returning({ id: schema.notificationDeliveries.id });
  return rows.length;
}

/**
 * The rows {@link markAllRead} would clear: a member's unread deliveries bar
 * the pop-ups it deliberately leaves for the pop-up poller to show.
 */
function clearableUnread(userId: string) {
  return and(
    eq(schema.notificationDeliveries.userId, userId),
    isNull(schema.notificationDeliveries.readAt),
    ne(schema.notificationDeliveries.presentation, "popup"),
  );
}

/**
 * How many rows "Mark all read" would actually clear. The badge's
 * {@link countUnread} is wider — it counts unshown pop-ups too — so the button
 * asks this instead, or it would offer to clear a badge it cannot clear.
 */
export async function unreadClearableCount(userId: string): Promise<number> {
  const db = createHttpDb();
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.notificationDeliveries)
    .where(clearableUnread(userId));
  return row?.count ?? 0;
}
