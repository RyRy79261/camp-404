import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { canRunLounge } from "@camp404/core";
import type {
  DecideLoungeOfferInput,
  EditLoungeOfferInput,
  LoungeBand,
  LoungeMusicPolicyInput,
  LoungeNeed,
  LoungeOfferInput,
  LoungeOfferKind,
  LoungeOfferStatus,
  PlaceLoungeOfferInput,
} from "@camp404/types";
import { writeAuditEvent, type DbOrTx } from "./audit";
import { lockSenderReach } from "./broadcasts";
import { currentCycleNumber } from "./cycles";
import { createHttpDb, withTransaction, type Tx } from "./index";
import { reachRank } from "./power";
import * as schema from "./schema";

// The lounge programme (#269): the data layer.
//
//  - Any approved member offers an activity or a DJ set (the action's gate
//    checks approval) and changes or withdraws only their OWN offer, while it
//    is still undecided or sent back for changes.
//  - Only a captain or a Ministry of Vibes lead decides offers, places them
//    and writes the music note (canRunLounge). Every such write re-reads the
//    actor's rank and the teams they lead this year INSIDE its own transaction
//    (lockLoungeRunner, through lockSenderReach), so a demotion that committed
//    first is seen and one that comes later waits. A caller passes only who is
//    acting, never a rank or a team list.
//  - A decision is a compare-and-set on the status AND version the reviewer
//    saw, so a host's edit or another reviewer's decision in between is never
//    overwritten; it writes an audit row in the same transaction, because it
//    is a privileged write to another member's offer. So do placing, taking
//    off and the music note.
//  - Everything is the year's: `cycle` is stamped with currentCycleNumber()
//    read through the transaction.
//
// Who READS what is decided here too, never by the screen hiding it: the
// programme (accepted offers, with no host id, status note or preferences) is
// everyone's; a member's own offers are theirs; the whole list is only for
// the people who run the lounge (the page asks for it only for them).
//
// PGlite has ONE connection: everything inside a transaction goes through
// `tx`, never createHttpDb().

export type LoungeWriteResult<T = object> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

export const NOT_A_LOUNGE_RUNNER =
  "Only captains and Ministry of Vibes leads can run the lounge programme.";
export const OFFER_GONE = "That offer isn't there any more. Reload the page.";
export const OFFER_CHANGED =
  "Someone changed this offer first. Reload the page.";
export const NOT_YOUR_OFFER = "You can only change your own offers.";
export const OFFER_DECIDED =
  "This offer has already been accepted or declined, so it can't be changed. Ask a Ministry of Vibes lead.";
export const OFFER_NOT_ACCEPTED =
  "Only an accepted offer can go on the programme. Accept it first.";
export const ALREADY_PLACED = "It's already on the programme at that time.";
export const SLOT_GONE =
  "That item isn't on the programme any more. Reload the page.";
export const SETTINGS_CHANGED =
  "Someone changed the music note first. Reload the page.";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// --- Shapes ------------------------------------------------------------------

/** An offer as its host and the people who run the lounge see it. */
export interface LoungeOfferRow {
  id: string;
  cycle: number;
  hostId: string;
  hostName: string;
  kind: LoungeOfferKind;
  title: string;
  description: string | null;
  durationMinutes: number;
  needs: LoungeNeed[];
  needsNote: string | null;
  preferredDays: number[];
  preferredBands: LoungeBand[];
  recurring: boolean;
  publicGuide: boolean;
  status: LoungeOfferStatus;
  decisionNote: string | null;
  decidedAt: Date | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

/** An accepted offer as every member sees it: what, how long, and who. */
export interface PublicLoungeOffer {
  id: string;
  kind: LoungeOfferKind;
  title: string;
  description: string | null;
  durationMinutes: number;
  recurring: boolean;
  publicGuide: boolean;
  hostName: string;
}

/** One item on the programme. */
export interface LoungeSlotRow {
  id: string;
  offerId: string;
  day: number;
  startMinute: number;
}

/** The year's programme: the accepted offers and where they are placed. */
export interface LoungeProgramme {
  offers: PublicLoungeOffer[];
  slots: LoungeSlotRow[];
}

/** The year's settings. Version 0 means none saved yet. */
export interface LoungeSettings {
  cycle: number;
  musicPolicy: string | null;
  version: number;
}

/** What a new offer holds, with who offers it. */
export type AddLoungeOfferArgs = LoungeOfferInput & { actorId: string };
export type EditLoungeOfferArgs = EditLoungeOfferInput & { actorId: string };
export type DecideLoungeOfferArgs = DecideLoungeOfferInput & {
  actorId: string;
};
export type PlaceLoungeOfferArgs = PlaceLoungeOfferInput & { actorId: string };

/**
 * The name a member goes by in the camp. An account that never set a name
 * carries its address there, which is never shown to the camp.
 */
export function hostNameOf(displayName: string | null): string {
  const name = displayName?.trim();
  return name && !name.includes("@") ? name : "Unnamed member";
}

const OFFER_COLUMNS = {
  id: schema.loungeOffers.id,
  cycle: schema.loungeOffers.cycle,
  hostId: schema.loungeOffers.hostId,
  displayName: schema.users.displayName,
  kind: schema.loungeOffers.kind,
  title: schema.loungeOffers.title,
  description: schema.loungeOffers.description,
  durationMinutes: schema.loungeOffers.durationMinutes,
  needs: schema.loungeOffers.needs,
  needsNote: schema.loungeOffers.needsNote,
  preferredDays: schema.loungeOffers.preferredDays,
  preferredBands: schema.loungeOffers.preferredBands,
  recurring: schema.loungeOffers.recurring,
  publicGuide: schema.loungeOffers.publicGuide,
  status: schema.loungeOffers.status,
  decisionNote: schema.loungeOffers.decisionNote,
  decidedAt: schema.loungeOffers.decidedAt,
  version: schema.loungeOffers.version,
  createdAt: schema.loungeOffers.createdAt,
  updatedAt: schema.loungeOffers.updatedAt,
};

type OfferSelect = Omit<LoungeOfferRow, "hostName"> & {
  displayName: string | null;
};

function offerOf(row: OfferSelect): LoungeOfferRow {
  const { displayName, ...rest } = row;
  return {
    ...rest,
    hostName: hostNameOf(displayName),
    needs: [...row.needs],
    preferredDays: [...row.preferredDays].sort((a, b) => a - b),
    preferredBands: [...row.preferredBands],
  };
}

function offerQuery(db: DbOrTx) {
  return db
    .select(OFFER_COLUMNS)
    .from(schema.loungeOffers)
    .innerJoin(schema.users, eq(schema.users.id, schema.loungeOffers.hostId));
}

// --- Transactions ------------------------------------------------------------

/** A refusal thrown inside a transaction, so it rolls back everything. */
class Refused extends Error {
  constructor(readonly sentence: string) {
    super(sentence);
    this.name = "Refused";
  }
}

function refuse(sentence: string): never {
  throw new Refused(sentence);
}

async function write<T extends object>(
  fn: (tx: Tx) => Promise<T>,
): Promise<LoungeWriteResult<T>> {
  try {
    const value = await withTransaction(fn);
    return { ok: true, ...value };
  } catch (error) {
    if (error instanceof Refused) return { ok: false, error: error.sentence };
    throw error;
  }
}

/**
 * Whether the actor may run the lounge programme, read and locked inside the
 * write's own transaction: a captain, or a lead of the Ministry of Vibes this
 * year.
 */
export async function lockLoungeRunner(
  tx: DbOrTx,
  actorId: string,
): Promise<boolean> {
  if (!UUID.test(actorId)) return false;
  const reach = await lockSenderReach(tx, actorId);
  return canRunLounge(reachRank(reach), reach ?? []);
}

async function assertLoungeRunner(tx: Tx, actorId: string): Promise<void> {
  if (!(await lockLoungeRunner(tx, actorId))) refuse(NOT_A_LOUNGE_RUNNER);
}

/** This year's offer, locked for the rest of the transaction, or a refusal. */
async function lockOffer(tx: Tx, offerId: string, cycle: number) {
  if (!UUID.test(offerId)) refuse(OFFER_GONE);
  const [row] = await tx
    .select({
      id: schema.loungeOffers.id,
      hostId: schema.loungeOffers.hostId,
      title: schema.loungeOffers.title,
      status: schema.loungeOffers.status,
      version: schema.loungeOffers.version,
    })
    .from(schema.loungeOffers)
    .where(
      and(
        eq(schema.loungeOffers.id, offerId),
        eq(schema.loungeOffers.cycle, cycle),
      ),
    )
    .for("update");
  if (!row) refuse(OFFER_GONE);
  return row;
}

function offerValues(input: LoungeOfferInput) {
  return {
    kind: input.kind,
    title: input.title,
    description: input.description,
    durationMinutes: input.durationMinutes,
    needs: input.needs,
    needsNote: input.needsNote,
    preferredDays: [...input.preferredDays].sort((a, b) => a - b),
    preferredBands: input.preferredBands,
    recurring: input.recurring,
    publicGuide: input.publicGuide,
  };
}

// --- Reads -------------------------------------------------------------------

/**
 * The year's programme, for every member: the accepted offers (no host id,
 * no preferences, no reviewer's note) and the slots they are placed in.
 */
export async function getLoungeProgramme(
  cycle?: number,
): Promise<LoungeProgramme> {
  const db = createHttpDb();
  const year = cycle ?? (await currentCycleNumber(db));
  const [offers, slots] = await Promise.all([
    db
      .select({
        id: schema.loungeOffers.id,
        kind: schema.loungeOffers.kind,
        title: schema.loungeOffers.title,
        description: schema.loungeOffers.description,
        durationMinutes: schema.loungeOffers.durationMinutes,
        recurring: schema.loungeOffers.recurring,
        publicGuide: schema.loungeOffers.publicGuide,
        displayName: schema.users.displayName,
      })
      .from(schema.loungeOffers)
      .innerJoin(schema.users, eq(schema.users.id, schema.loungeOffers.hostId))
      .where(
        and(
          eq(schema.loungeOffers.cycle, year),
          eq(schema.loungeOffers.status, "accepted"),
        ),
      )
      .orderBy(asc(schema.loungeOffers.title)),
    db
      .select({
        id: schema.loungeSlots.id,
        offerId: schema.loungeSlots.offerId,
        day: schema.loungeSlots.day,
        startMinute: schema.loungeSlots.startMinute,
      })
      .from(schema.loungeSlots)
      .innerJoin(
        schema.loungeOffers,
        eq(schema.loungeOffers.id, schema.loungeSlots.offerId),
      )
      .where(
        and(
          eq(schema.loungeSlots.cycle, year),
          eq(schema.loungeOffers.status, "accepted"),
        ),
      )
      .orderBy(
        asc(schema.loungeSlots.day),
        asc(schema.loungeSlots.startMinute),
      ),
  ]);
  return {
    offers: offers.map(({ displayName, ...o }) => ({
      ...o,
      hostName: hostNameOf(displayName),
    })),
    slots,
  };
}

/** One member's own offers this year, newest first. */
export async function listMyLoungeOffers(
  userId: string,
  cycle?: number,
): Promise<LoungeOfferRow[]> {
  if (!UUID.test(userId)) return [];
  const db = createHttpDb();
  const year = cycle ?? (await currentCycleNumber(db));
  const rows = await offerQuery(db)
    .where(
      and(
        eq(schema.loungeOffers.hostId, userId),
        eq(schema.loungeOffers.cycle, year),
      ),
    )
    .orderBy(sql`${schema.loungeOffers.createdAt} desc`);
  return rows.map(offerOf);
}

/**
 * Every offer this year, oldest first, for the people who run the lounge.
 * The page asks for it only when canRunLounge says so.
 */
export async function listLoungeOffers(
  cycle?: number,
): Promise<LoungeOfferRow[]> {
  const db = createHttpDb();
  const year = cycle ?? (await currentCycleNumber(db));
  const rows = await offerQuery(db)
    .where(eq(schema.loungeOffers.cycle, year))
    .orderBy(asc(schema.loungeOffers.createdAt));
  return rows.map(offerOf);
}

/** The year's settings, or none (version 0). */
export async function getLoungeSettings(
  cycle?: number,
): Promise<LoungeSettings> {
  const db = createHttpDb();
  const year = cycle ?? (await currentCycleNumber(db));
  const [row] = await db
    .select({
      musicPolicy: schema.loungeSettings.musicPolicy,
      version: schema.loungeSettings.version,
    })
    .from(schema.loungeSettings)
    .where(eq(schema.loungeSettings.cycle, year));
  return {
    cycle: year,
    musicPolicy: row?.musicPolicy ?? null,
    version: row?.version ?? 0,
  };
}

// --- A member's own offers ---------------------------------------------------

/** Offer something for this year's lounge. The action checked approval. */
export async function addLoungeOffer(
  input: AddLoungeOfferArgs,
): Promise<LoungeWriteResult<{ id: string }>> {
  if (!UUID.test(input.actorId)) return { ok: false, error: NOT_YOUR_OFFER };
  return write(async (tx) => {
    const cycle = await currentCycleNumber(tx);
    const [row] = await tx
      .insert(schema.loungeOffers)
      .values({ ...offerValues(input), cycle, hostId: input.actorId })
      .returning({ id: schema.loungeOffers.id });
    return { id: row!.id };
  });
}

/**
 * The host changes their own offer while it is undecided or sent back. An
 * offer sent back for changes goes back to waiting for a decision.
 */
export async function updateLoungeOffer(
  input: EditLoungeOfferArgs,
): Promise<LoungeWriteResult> {
  return write(async (tx) => {
    const cycle = await currentCycleNumber(tx);
    const current = await lockOffer(tx, input.offerId, cycle);
    if (current.hostId !== input.actorId) refuse(NOT_YOUR_OFFER);
    if (current.status === "accepted" || current.status === "declined") {
      refuse(OFFER_DECIDED);
    }
    const [row] = await tx
      .update(schema.loungeOffers)
      .set({
        ...offerValues(input),
        status: "offered",
        version: sql`${schema.loungeOffers.version} + 1`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.loungeOffers.id, input.offerId),
          eq(schema.loungeOffers.hostId, input.actorId),
          eq(schema.loungeOffers.version, input.expectedVersion),
          inArray(schema.loungeOffers.status, ["offered", "needs_changes"]),
        ),
      )
      .returning({ id: schema.loungeOffers.id });
    if (!row) refuse(OFFER_CHANGED);
    return {};
  });
}

/** The host takes their offer back, whatever its answer; its slots go too. */
export async function withdrawLoungeOffer(input: {
  actorId: string;
  offerId: string;
}): Promise<LoungeWriteResult> {
  return write(async (tx) => {
    const cycle = await currentCycleNumber(tx);
    const current = await lockOffer(tx, input.offerId, cycle);
    if (current.hostId !== input.actorId) refuse(NOT_YOUR_OFFER);
    await tx
      .delete(schema.loungeOffers)
      .where(eq(schema.loungeOffers.id, input.offerId));
    return {};
  });
}

// --- Running the programme ---------------------------------------------------

/**
 * Accept, decline or send back an offer: a compare-and-set on the status and
 * version the reviewer saw. Leaving `accepted` takes it off the programme in
 * the same transaction. Audited.
 */
export async function decideLoungeOffer(
  input: DecideLoungeOfferArgs,
): Promise<LoungeWriteResult> {
  return write(async (tx) => {
    await assertLoungeRunner(tx, input.actorId);
    const cycle = await currentCycleNumber(tx);
    const current = await lockOffer(tx, input.offerId, cycle);
    const [row] = await tx
      .update(schema.loungeOffers)
      .set({
        status: input.decision,
        decisionNote: input.decision === "accepted" ? null : input.reason,
        decidedByUserId: input.actorId,
        decidedAt: new Date(),
        version: sql`${schema.loungeOffers.version} + 1`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.loungeOffers.id, input.offerId),
          eq(schema.loungeOffers.status, input.expectedStatus),
          eq(schema.loungeOffers.version, input.expectedVersion),
        ),
      )
      .returning({ id: schema.loungeOffers.id });
    if (!row) refuse(OFFER_CHANGED);
    let unplaced = 0;
    if (input.decision !== "accepted") {
      const gone = await tx
        .delete(schema.loungeSlots)
        .where(eq(schema.loungeSlots.offerId, input.offerId))
        .returning({ id: schema.loungeSlots.id });
      unplaced = gone.length;
    }
    await writeAuditEvent(tx, {
      actorId: input.actorId,
      action: "lounge.offer_decided",
      target: input.offerId,
      metadata: {
        from: current.status,
        to: input.decision,
        title: current.title,
        cycle,
        withReason: input.reason !== null,
        ...(unplaced > 0 ? { unplaced } : {}),
      },
    });
    return {};
  });
}

/** Put an accepted offer on the programme at a day and start time. Audited. */
export async function placeLoungeOffer(
  input: PlaceLoungeOfferArgs,
): Promise<LoungeWriteResult<{ id: string }>> {
  return write(async (tx) => {
    await assertLoungeRunner(tx, input.actorId);
    const cycle = await currentCycleNumber(tx);
    // Locked, so a decline that lands meanwhile waits and then clears this.
    const offer = await lockOffer(tx, input.offerId, cycle);
    if (offer.status !== "accepted") refuse(OFFER_NOT_ACCEPTED);
    const [row] = await tx
      .insert(schema.loungeSlots)
      .values({
        cycle,
        offerId: input.offerId,
        day: input.day,
        startMinute: input.startMinute,
        placedByUserId: input.actorId,
      })
      .onConflictDoNothing()
      .returning({ id: schema.loungeSlots.id });
    if (!row) refuse(ALREADY_PLACED);
    await writeAuditEvent(tx, {
      actorId: input.actorId,
      action: "lounge.offer_placed",
      target: input.offerId,
      metadata: {
        title: offer.title,
        day: input.day,
        startMinute: input.startMinute,
        cycle,
      },
    });
    return { id: row.id };
  });
}

/** Take one item off the programme; the offer stays accepted. Audited. */
export async function removeLoungeSlot(input: {
  actorId: string;
  slotId: string;
}): Promise<LoungeWriteResult> {
  return write(async (tx) => {
    await assertLoungeRunner(tx, input.actorId);
    if (!UUID.test(input.slotId)) refuse(SLOT_GONE);
    const cycle = await currentCycleNumber(tx);
    const [gone] = await tx
      .delete(schema.loungeSlots)
      .where(
        and(
          eq(schema.loungeSlots.id, input.slotId),
          eq(schema.loungeSlots.cycle, cycle),
        ),
      )
      .returning({
        offerId: schema.loungeSlots.offerId,
        day: schema.loungeSlots.day,
      });
    if (!gone) refuse(SLOT_GONE);
    const [offer] = await tx
      .select({ title: schema.loungeOffers.title })
      .from(schema.loungeOffers)
      .where(eq(schema.loungeOffers.id, gone.offerId));
    await writeAuditEvent(tx, {
      actorId: input.actorId,
      action: "lounge.slot_removed",
      target: gone.offerId,
      metadata: { title: offer?.title ?? null, day: gone.day, cycle },
    });
    return {};
  });
}

/**
 * The team's music note for DJs, this year. A compare-and-set on the version
 * the editor saw (0 when none is saved). Audited.
 */
export async function setLoungeMusicPolicy(
  input: LoungeMusicPolicyInput & { actorId: string },
): Promise<LoungeWriteResult<{ version: number }>> {
  return write(async (tx) => {
    await assertLoungeRunner(tx, input.actorId);
    const cycle = await currentCycleNumber(tx);
    let version: number;
    if (input.expectedVersion === 0) {
      const [row] = await tx
        .insert(schema.loungeSettings)
        .values({
          cycle,
          musicPolicy: input.musicPolicy,
          updatedByUserId: input.actorId,
        })
        .onConflictDoNothing()
        .returning({ version: schema.loungeSettings.version });
      if (!row) refuse(SETTINGS_CHANGED);
      version = row.version;
    } else {
      const [row] = await tx
        .update(schema.loungeSettings)
        .set({
          musicPolicy: input.musicPolicy,
          updatedByUserId: input.actorId,
          version: sql`${schema.loungeSettings.version} + 1`,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(schema.loungeSettings.cycle, cycle),
            eq(schema.loungeSettings.version, input.expectedVersion),
          ),
        )
        .returning({ version: schema.loungeSettings.version });
      if (!row) refuse(SETTINGS_CHANGED);
      version = row.version;
    }
    await writeAuditEvent(tx, {
      actorId: input.actorId,
      action: "lounge.music_policy_changed",
      target: `lounge:${cycle}`,
      metadata: { cycle, cleared: input.musicPolicy === null },
    });
    return { version };
  });
}
