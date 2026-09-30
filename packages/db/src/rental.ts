import { and, asc, eq, inArray, isNull, ne, sql, type SQL } from "drizzle-orm";
import {
  campStockInUse,
  campStockTaken,
  canManageRental,
  checkRentalLines,
  GEAR_ORDER_ACTION_KEY,
  GEAR_ORDER_ACTION_TITLE,
  GEAR_ORDER_REF_TYPE,
  gearOrderAskNotification,
  holdsSharers,
  isAskedForGear,
  priceRentalOrder,
  rentalChargeDescription,
  rentalSummary,
  tentInUse,
  type RentalLineDraft,
  type RentalSummary,
} from "@camp404/core";
import type {
  ParticipationStatus,
  RentalChoice,
  RentalItemInput,
  RentalOrderStatus,
  RentalSource,
} from "@camp404/types";
import { writeAuditEvent, type DbOrTx } from "./audit";
import { lockSenderReach } from "./broadcasts";
import { deliveryValues } from "./deliveries";
import { createHttpDb, withTransaction, type Tx } from "./index";
import { reachRank } from "./power";
import * as schema from "./schema";

// Gear rental (#241): the data layer for the year's sleeping gear and each
// member's order.
//
//  - A member writes only their own order and reads only their own (plus the
//    one tent line someone else put them in). The caller passes the signed-in
//    member's id, never an id from a form.
//  - A captain runs the rest (canManageRental): the catalogue, confirming and
//    reopening orders, tent labels. Every such write re-reads the actor's
//    rank and led teams INSIDE its own transaction (lockSenderReach), so a
//    demotion that committed first is seen and one that comes later waits.
//  - Confirming is a compare-and-set on `submitted` and the version the
//    captain saw, and writes the `rental` charge on the member's dues and the
//    audit row in the same transaction. Reopening cancels that charge the
//    same way.
//  - "Ask everyone" is a nudge on the gate spine, never a block: a
//    NON-blocking `required_actions` row per member who is coming and has not
//    sent an order, and a notice. Sending the order completes the row.
//  - A captain may fill an order in for a member who has not answered. It is
//    audited, a compare-and-set on the version, and marked as filled in by a
//    captain until the member saves it themselves.
//  - Camp stock is a price and a count on the catalogue item, for the few
//    items the camp has (owner, 2026-09-30). A confirmation that gives out
//    more than is left is refused; the year's items are locked first, so two
//    captains confirming at once cannot both take the last one.
//  - Money is whole rand cents, ZAR only; each table's CHECK is the last guard.
//
// PGlite has ONE connection: everything inside a transaction goes through
// `tx`, never createHttpDb().

export type RentalResult<T = object> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

export const NOT_A_RENTAL_MANAGER = "Only captains can run gear rental.";
export const RENTAL_ITEM_MISSING =
  "That item isn't on the list any more. Reload the page.";
export const TOO_MANY_RENTAL_ITEMS = "A year has at most 30 rental items.";
export const RENTAL_NO_SUCH_MEMBER = "That member isn't in the camp.";
export const RENTAL_SHARER_GONE =
  "One of the people you picked isn't a camp member. Pick again.";
export const RENTAL_ORDER_CHANGED =
  "Your order changed somewhere else. Reload the page.";
export const RENTAL_ORDER_SENT =
  "Your order is already sent. Take it back to change it.";
export const RENTAL_ORDER_CONFIRMED =
  "Your order is confirmed. Ask a captain to reopen it if it needs to change.";
export const RENTAL_NOTHING_TO_SEND =
  "Say what you need, or that you have your own, before you send it.";
export const RENTAL_ORDER_MOVED =
  "This order changed since you opened it. Reload the page.";
export const RENTAL_REOPEN_FIRST =
  "This order is confirmed. Reopen it before you change it.";
export const RENTAL_TENT_NOT_CONFIRMED =
  "Only a tent on a confirmed order gets a label.";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// --- Transactions ------------------------------------------------------------

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
): Promise<RentalResult<T>> {
  try {
    const value = await withTransaction(fn);
    return { ok: true, ...value };
  } catch (error) {
    if (error instanceof Refused) return { ok: false, error: error.sentence };
    throw error;
  }
}

/**
 * Whether the actor may run gear rental, read and locked inside the write's
 * own transaction.
 */
export async function lockRentalManager(
  tx: DbOrTx,
  actorId: string,
): Promise<boolean> {
  if (!UUID.test(actorId)) return false;
  const reach = await lockSenderReach(tx, actorId);
  return canManageRental(reachRank(reach), reach ?? []);
}

async function assertRentalManager(tx: Tx, actorId: string): Promise<void> {
  if (!(await lockRentalManager(tx, actorId))) refuse(NOT_A_RENTAL_MANAGER);
}

const nameOf = (name: string | null) => name?.trim() || "Unnamed burner";

// --- The catalogue -----------------------------------------------------------

export interface RentalItem {
  id: string;
  cycle: number;
  name: string;
  isTent: boolean;
  sleeps: number;
  /** The camp's price and how many it has: both, or neither. */
  campPriceCents: number | null;
  campStockCount: number | null;
  supplierPriceCents: number | null;
  currency: string;
  reserveCount: number;
  reserveSource: RentalSource;
  archived: boolean;
}

function toItem(row: typeof schema.rentalItems.$inferSelect): RentalItem {
  return {
    id: row.id,
    cycle: row.cycle,
    name: row.name,
    isTent: row.isTent,
    sleeps: row.sleeps,
    campPriceCents: row.campPriceCents,
    campStockCount: row.campStockCount,
    supplierPriceCents: row.supplierPriceCents,
    currency: row.currency,
    reserveCount: row.reserveCount,
    reserveSource: row.reserveSource,
    archived: row.archivedAt !== null,
  };
}

/** The year's rental items, tents first, then by name. Archived only when asked. */
export async function listRentalItems(
  cycle: number,
  options: { includeArchived?: boolean } = {},
  db: DbOrTx = createHttpDb(),
): Promise<RentalItem[]> {
  const rows = await db
    .select()
    .from(schema.rentalItems)
    .where(
      and(
        eq(schema.rentalItems.cycle, cycle),
        options.includeArchived
          ? undefined
          : isNull(schema.rentalItems.archivedAt),
      ),
    )
    .orderBy(
      sql`${schema.rentalItems.isTent} desc`,
      asc(schema.rentalItems.name),
      asc(schema.rentalItems.id),
    );
  return rows.map(toItem);
}

function itemValues(item: RentalItemInput) {
  return {
    name: item.name,
    isTent: item.isTent,
    sleeps: item.isTent ? item.sleeps : 1,
    campPriceCents: item.campPriceCents,
    campStockCount: item.campStockCount,
    supplierPriceCents: item.supplierPriceCents,
    reserveCount: item.reserveCount,
    reserveSource: item.reserveSource,
  };
}

/**
 * How many of each item confirmed orders took from camp stock, this year.
 * `exceptOrderId` leaves one order out (the one being confirmed). Call it with
 * the year's items locked.
 */
async function campTakenByOrders(
  tx: Tx,
  cycle: number,
  exceptOrderId?: string,
): Promise<Map<string, number>> {
  const rows = await tx
    .select({
      itemId: schema.rentalOrderLines.itemId,
      taken: sql<number>`sum(${schema.rentalOrderLines.quantity})::int`,
    })
    .from(schema.rentalOrderLines)
    .innerJoin(
      schema.rentalOrders,
      eq(schema.rentalOrders.id, schema.rentalOrderLines.orderId),
    )
    .where(
      and(
        eq(schema.rentalOrders.cycle, cycle),
        eq(schema.rentalOrders.status, "confirmed"),
        eq(schema.rentalOrderLines.choice, "need"),
        eq(schema.rentalOrderLines.source, "camp"),
        exceptOrderId ? ne(schema.rentalOrders.id, exceptOrderId) : undefined,
      ),
    )
    .groupBy(schema.rentalOrderLines.itemId);
  return new Map(rows.map((r) => [r.itemId, r.taken]));
}

function itemAudit(cycle: number, item: RentalItemInput) {
  return {
    cycle,
    name: item.name,
    campPriceCents: item.campPriceCents,
    campStockCount: item.campStockCount,
    supplierPriceCents: item.supplierPriceCents,
    reserveCount: item.reserveCount,
    reserveSource: item.reserveSource,
  };
}

/** Add an item to the year's catalogue. */
export async function addRentalItem(input: {
  cycle: number;
  item: RentalItemInput;
  actorId: string;
}): Promise<RentalResult<{ id: string }>> {
  return write(async (tx) => {
    await assertRentalManager(tx, input.actorId);
    const live = await listRentalItems(input.cycle, {}, tx);
    if (live.length >= 30) refuse(TOO_MANY_RENTAL_ITEMS);
    const [row] = await tx
      .insert(schema.rentalItems)
      .values({ cycle: input.cycle, ...itemValues(input.item) })
      .returning({ id: schema.rentalItems.id });
    await writeAuditEvent(tx, {
      actorId: input.actorId,
      action: "rental.item_added",
      target: row!.id,
      metadata: itemAudit(input.cycle, input.item),
    });
    return { id: row!.id };
  });
}

/**
 * Change a live item: its name, prices, camp stock, size or reserve. An order
 * already confirmed keeps the price it was confirmed at. Refused when it
 * would leave the camp with fewer than confirmed orders and a camp reserve
 * already take, or a tent smaller than the people sharing it on a sent or
 * confirmed order.
 */
export async function editRentalItem(input: {
  itemId: string;
  item: RentalItemInput;
  actorId: string;
}): Promise<RentalResult> {
  return write(async (tx) => {
    await assertRentalManager(tx, input.actorId);
    if (!UUID.test(input.itemId)) refuse(RENTAL_ITEM_MISSING);
    const rows = await tx
      .update(schema.rentalItems)
      .set({ ...itemValues(input.item), updatedAt: new Date() })
      .where(
        and(
          eq(schema.rentalItems.id, input.itemId),
          isNull(schema.rentalItems.archivedAt),
        ),
      )
      .returning({ cycle: schema.rentalItems.cycle });
    if (rows.length === 0) refuse(RENTAL_ITEM_MISSING);
    // The update above holds the item's row, so a confirmation waits here.
    // A tent cannot shrink under the people already sharing it on a sent or
    // confirmed order (a draft is checked again when the member saves it).
    const inUse = await tx
      .select({
        quantity: schema.rentalOrderLines.quantity,
        sharers: sql<number>`count(${schema.rentalLineSharers.userId})::int`,
      })
      .from(schema.rentalOrderLines)
      .innerJoin(
        schema.rentalOrders,
        eq(schema.rentalOrders.id, schema.rentalOrderLines.orderId),
      )
      .leftJoin(
        schema.rentalLineSharers,
        eq(schema.rentalLineSharers.lineId, schema.rentalOrderLines.id),
      )
      .where(
        and(
          eq(schema.rentalOrderLines.itemId, input.itemId),
          eq(schema.rentalOrderLines.choice, "need"),
          ne(schema.rentalOrders.status, "draft"),
        ),
      )
      .groupBy(schema.rentalOrderLines.id, schema.rentalOrderLines.quantity);
    if (!holdsSharers(input.item, inUse)) refuse(tentInUse(input.item.name));
    const taken = campStockTaken(
      input.item,
      (await campTakenByOrders(tx, rows[0]!.cycle)).get(input.itemId) ?? 0,
    );
    if (taken > (input.item.campStockCount ?? 0)) {
      refuse(campStockInUse(input.item.name, taken));
    }
    await writeAuditEvent(tx, {
      actorId: input.actorId,
      action: "rental.item_changed",
      target: input.itemId,
      metadata: itemAudit(rows[0]!.cycle, input.item),
    });
    return {};
  });
}

/** Take an item off the list. Orders that have it keep it. */
export async function archiveRentalItem(input: {
  itemId: string;
  actorId: string;
}): Promise<RentalResult> {
  return write(async (tx) => {
    await assertRentalManager(tx, input.actorId);
    if (!UUID.test(input.itemId)) refuse(RENTAL_ITEM_MISSING);
    const rows = await tx
      .update(schema.rentalItems)
      .set({ archivedAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(schema.rentalItems.id, input.itemId),
          isNull(schema.rentalItems.archivedAt),
        ),
      )
      .returning({
        cycle: schema.rentalItems.cycle,
        name: schema.rentalItems.name,
      });
    if (rows.length === 0) refuse(RENTAL_ITEM_MISSING);
    await writeAuditEvent(tx, {
      actorId: input.actorId,
      action: "rental.item_archived",
      target: input.itemId,
      metadata: { cycle: rows[0]!.cycle, name: rows[0]!.name },
    });
    return {};
  });
}

// --- Orders: reads -----------------------------------------------------------

export interface RentalSharer {
  id: string;
  name: string;
  /**
   * Whether a captain accepted them for this year. Null on a member's own
   * read: a member does not read anyone else's place.
   */
  accepted: boolean | null;
}

export interface RentalLine {
  id: string;
  itemId: string;
  itemName: string;
  isTent: boolean;
  sleeps: number;
  choice: RentalChoice;
  quantity: number;
  /** The captain's decision and the price it was confirmed at. */
  source: RentalSource | null;
  unitPriceCents: number | null;
  tentLabel: string | null;
  /** For a tent they have themselves: what it is, and how many it sleeps. */
  ownDescription: string | null;
  ownSleeps: number | null;
  sharers: RentalSharer[];
}

export interface RentalOrder {
  id: string;
  userId: string;
  memberName: string;
  /** The member's place this year, or null when they have no row. */
  participation: ParticipationStatus | null;
  cycle: number;
  status: RentalOrderStatus;
  version: number;
  submittedAt: Date | null;
  confirmedAt: Date | null;
  /** The confirmed total; null until a captain confirms. */
  totalCents: number | null;
  /** The live charge on the member's dues; null when none, or cancelled. */
  chargeId: string | null;
  /** A captain filled it in for the member, who has not saved it since. */
  filledByCaptain: boolean;
  lines: RentalLine[];
}

/** Orders matching `where`, each with its lines and their sharers. */
async function loadOrders(db: DbOrTx, where: SQL | undefined) {
  const orders = await db
    .select({
      id: schema.rentalOrders.id,
      userId: schema.rentalOrders.userId,
      memberName: schema.users.displayName,
      participation: schema.campParticipations.status,
      cycle: schema.rentalOrders.cycle,
      status: schema.rentalOrders.status,
      version: schema.rentalOrders.version,
      submittedAt: schema.rentalOrders.submittedAt,
      confirmedAt: schema.rentalOrders.confirmedAt,
      totalCents: schema.rentalOrders.totalCents,
      chargeId: schema.rentalOrders.chargeId,
      chargeCancelledAt: schema.duesCharges.cancelledAt,
      filledByUserId: schema.rentalOrders.filledByUserId,
    })
    .from(schema.rentalOrders)
    .innerJoin(schema.users, eq(schema.users.id, schema.rentalOrders.userId))
    .leftJoin(
      schema.campParticipations,
      and(
        eq(schema.campParticipations.userId, schema.rentalOrders.userId),
        eq(schema.campParticipations.cycle, schema.rentalOrders.cycle),
      ),
    )
    .leftJoin(
      schema.duesCharges,
      eq(schema.duesCharges.id, schema.rentalOrders.chargeId),
    )
    .where(where);
  if (orders.length === 0) return [];
  const orderIds = orders.map((o) => o.id);
  const lines = await db
    .select({
      id: schema.rentalOrderLines.id,
      orderId: schema.rentalOrderLines.orderId,
      itemId: schema.rentalOrderLines.itemId,
      itemName: schema.rentalItems.name,
      isTent: schema.rentalItems.isTent,
      sleeps: schema.rentalItems.sleeps,
      choice: schema.rentalOrderLines.choice,
      quantity: schema.rentalOrderLines.quantity,
      source: schema.rentalOrderLines.source,
      unitPriceCents: schema.rentalOrderLines.unitPriceCents,
      tentLabel: schema.rentalOrderLines.tentLabel,
      ownDescription: schema.rentalOrderLines.ownDescription,
      ownSleeps: schema.rentalOrderLines.ownSleeps,
    })
    .from(schema.rentalOrderLines)
    .innerJoin(
      schema.rentalItems,
      eq(schema.rentalItems.id, schema.rentalOrderLines.itemId),
    )
    .where(inArray(schema.rentalOrderLines.orderId, orderIds))
    .orderBy(
      sql`${schema.rentalItems.isTent} desc`,
      asc(schema.rentalItems.name),
      asc(schema.rentalOrderLines.id),
    );
  const sharers =
    lines.length === 0
      ? []
      : await db
          .select({
            lineId: schema.rentalLineSharers.lineId,
            id: schema.users.id,
            name: schema.users.displayName,
            place: schema.campParticipations.status,
          })
          .from(schema.rentalLineSharers)
          .innerJoin(
            schema.rentalOrderLines,
            eq(schema.rentalOrderLines.id, schema.rentalLineSharers.lineId),
          )
          .innerJoin(
            schema.rentalOrders,
            eq(schema.rentalOrders.id, schema.rentalOrderLines.orderId),
          )
          .innerJoin(
            schema.users,
            eq(schema.users.id, schema.rentalLineSharers.userId),
          )
          .leftJoin(
            schema.campParticipations,
            and(
              eq(
                schema.campParticipations.userId,
                schema.rentalLineSharers.userId,
              ),
              eq(schema.campParticipations.cycle, schema.rentalOrders.cycle),
            ),
          )
          .where(inArray(schema.rentalOrderLines.orderId, orderIds));
  return orders.map(
    (o): RentalOrder => ({
      id: o.id,
      userId: o.userId,
      memberName: nameOf(o.memberName),
      participation: o.participation,
      cycle: o.cycle,
      status: o.status,
      version: o.version,
      submittedAt: o.submittedAt,
      confirmedAt: o.confirmedAt,
      totalCents: o.totalCents,
      chargeId: o.chargeCancelledAt === null ? o.chargeId : null,
      filledByCaptain: o.filledByUserId !== null,
      lines: lines
        .filter((l) => l.orderId === o.id)
        .map((l) => ({
          id: l.id,
          itemId: l.itemId,
          itemName: l.itemName,
          isTent: l.isTent,
          sleeps: l.sleeps,
          choice: l.choice,
          quantity: l.quantity,
          source: l.source,
          unitPriceCents: l.unitPriceCents,
          tentLabel: l.tentLabel,
          ownDescription: l.ownDescription,
          ownSleeps: l.ownSleeps,
          sharers: sharers
            .filter((s) => s.lineId === l.id)
            .map((s) => ({
              id: s.id,
              name: nameOf(s.name),
              accepted: s.place === "accepted",
            }))
            .sort((a, b) => a.name.localeCompare(b.name)),
        })),
    }),
  );
}

/** What a member's own tent is called when they gave no words for it. */
export const OWN_TENT = "Their own tent";

/** A tent someone else put the member in. */
export interface SharedTent {
  lineId: string;
  /** The camp's item, or the owner's words for a tent of their own. */
  itemName: string;
  /** The label, once a captain confirmed the order and gave it one. */
  tentLabel: string | null;
  /** Whether the order it is on is confirmed. */
  confirmed: boolean;
  /** Who ordered it, or whose own tent it is. */
  ownerName: string;
  /** Everyone else in it, by name. */
  otherSharers: string[];
}

export interface MyRental {
  /** The year's live catalogue. */
  items: RentalItem[];
  order: RentalOrder | null;
  sharedWithMe: SharedTent[];
  /** A captain asked them for their order, and they have not sent it yet. */
  asked: boolean;
}

/**
 * What a member reads: the year's catalogue, their own order, and the tents
 * other members put them in. Nothing else about anyone: a sharer is a name,
 * and the captain's source and price show only once the order is confirmed.
 */
export async function getMyRental(
  userId: string,
  cycle: number,
): Promise<MyRental> {
  if (!UUID.test(userId)) {
    return { items: [], order: null, sharedWithMe: [], asked: false };
  }
  const db = createHttpDb();
  const [items, orders, asks, shared] = await Promise.all([
    listRentalItems(cycle, {}, db),
    loadOrders(
      db,
      and(
        eq(schema.rentalOrders.userId, userId),
        eq(schema.rentalOrders.cycle, cycle),
      ),
    ),
    db
      .select({ id: schema.requiredActions.id })
      .from(schema.requiredActions)
      .where(
        and(
          eq(schema.requiredActions.userId, userId),
          eq(schema.requiredActions.actionKey, GEAR_ORDER_ACTION_KEY),
          eq(schema.requiredActions.status, "pending"),
        ),
      )
      .limit(1),
    db
      .select({
        lineId: schema.rentalOrderLines.id,
        itemName: schema.rentalItems.name,
        choice: schema.rentalOrderLines.choice,
        ownDescription: schema.rentalOrderLines.ownDescription,
        tentLabel: schema.rentalOrderLines.tentLabel,
        status: schema.rentalOrders.status,
        ownerName: schema.users.displayName,
      })
      .from(schema.rentalLineSharers)
      .innerJoin(
        schema.rentalOrderLines,
        eq(schema.rentalOrderLines.id, schema.rentalLineSharers.lineId),
      )
      .innerJoin(
        schema.rentalOrders,
        eq(schema.rentalOrders.id, schema.rentalOrderLines.orderId),
      )
      .innerJoin(
        schema.rentalItems,
        eq(schema.rentalItems.id, schema.rentalOrderLines.itemId),
      )
      .innerJoin(schema.users, eq(schema.users.id, schema.rentalOrders.userId))
      .where(
        and(
          eq(schema.rentalLineSharers.userId, userId),
          eq(schema.rentalOrders.cycle, cycle),
          // A draft is not an offer yet: the member may still change it.
          sql`${schema.rentalOrders.status} <> 'draft'`,
          // A camp tent someone needs, or a tent of their own they share.
          eq(schema.rentalItems.isTent, true),
        ),
      ),
  ]);
  const others =
    shared.length === 0
      ? []
      : await db
          .select({
            lineId: schema.rentalLineSharers.lineId,
            userId: schema.rentalLineSharers.userId,
            name: schema.users.displayName,
          })
          .from(schema.rentalLineSharers)
          .innerJoin(
            schema.users,
            eq(schema.users.id, schema.rentalLineSharers.userId),
          )
          .where(
            inArray(
              schema.rentalLineSharers.lineId,
              shared.map((s) => s.lineId),
            ),
          );
  const mine = orders[0] ?? null;
  const confirmed = mine?.status === "confirmed";
  return {
    items,
    asked: asks.length > 0 && (mine === null || mine.status === "draft"),
    order: mine && {
      ...mine,
      participation: null,
      totalCents: confirmed ? mine.totalCents : null,
      lines: mine.lines.map((l) => ({
        ...l,
        source: confirmed ? l.source : null,
        unitPriceCents: confirmed ? l.unitPriceCents : null,
        tentLabel: confirmed ? l.tentLabel : null,
        sharers: l.sharers.map((s) => ({ ...s, accepted: null })),
      })),
    },
    sharedWithMe: shared
      .map((s) => ({
        lineId: s.lineId,
        itemName:
          s.choice === "own" ? (s.ownDescription ?? OWN_TENT) : s.itemName,
        tentLabel: s.status === "confirmed" ? s.tentLabel : null,
        confirmed: s.status === "confirmed",
        ownerName: nameOf(s.ownerName),
        otherSharers: others
          .filter((o) => o.lineId === s.lineId && o.userId !== userId)
          .map((o) => nameOf(o.name))
          .sort((a, b) => a.localeCompare(b)),
      }))
      .sort((a, b) => a.ownerName.localeCompare(b.ownerName)),
  };
}

/** Who a member may pick to share a tent with: every approved member but them. */
export async function listRentalSharerChoices(
  userId: string,
): Promise<{ id: string; name: string }[]> {
  const rows = await createHttpDb()
    .select({ id: schema.users.id, name: schema.users.displayName })
    .from(schema.users)
    .where(
      and(
        eq(schema.users.isSystem, false),
        eq(schema.users.sanitised, false),
        eq(schema.users.approvalStatus, "approved"),
      ),
    );
  return rows
    .filter((r) => r.id !== userId)
    .map((r) => ({ id: r.id, name: nameOf(r.name) }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Every order of the year, for the captains: sent ones first, then by name. */
export async function listRentalOrders(cycle: number): Promise<RentalOrder[]> {
  const orders = await loadOrders(
    createHttpDb(),
    eq(schema.rentalOrders.cycle, cycle),
  );
  const rank: Record<RentalOrderStatus, number> = {
    submitted: 0,
    confirmed: 1,
    draft: 2,
  };
  return orders.sort(
    (a, b) =>
      rank[a.status] - rank[b.status] ||
      a.memberName.localeCompare(b.memberName),
  );
}

/** One member's order for the captains, or null when they have none. */
export async function getRentalOrderOf(
  userId: string,
  cycle: number,
): Promise<RentalOrder | null> {
  if (!UUID.test(userId)) return null;
  const [order] = await loadOrders(
    createHttpDb(),
    and(
      eq(schema.rentalOrders.userId, userId),
      eq(schema.rentalOrders.cycle, cycle),
    ),
  );
  return order ?? null;
}

/** One tent on a confirmed order, for the tent list. */
export interface RentalTent {
  lineId: string;
  itemName: string;
  quantity: number;
  tentLabel: string | null;
  source: RentalSource | null;
  ownerName: string;
  sharers: string[];
}

/** A tent a member brings themselves, on a sent or confirmed order. */
export interface RentalOwnTent {
  lineId: string;
  ownerName: string;
  /** Their words for it; null when they gave none. */
  description: string | null;
  sleeps: number | null;
  sharers: string[];
}

export interface RentalOverview {
  summary: RentalSummary;
  /** Orders sent and not confirmed yet: not in the totals. */
  waiting: number;
  confirmed: number;
  tents: RentalTent[];
  /** Members' own tents, for the site plan. */
  ownTents: RentalOwnTent[];
}

/**
 * The captains' summary: totals by item across the CONFIRMED orders, split by
 * source, with the adoptee reserve; and the confirmed tents with who is in
 * each. An archived item still shows when a confirmed order has it.
 */
export async function getRentalOverview(
  cycle: number,
): Promise<RentalOverview> {
  const db = createHttpDb();
  const [items, orders] = await Promise.all([
    listRentalItems(cycle, { includeArchived: true }, db),
    loadOrders(db, eq(schema.rentalOrders.cycle, cycle)),
  ]);
  const confirmed = orders.filter((o) => o.status === "confirmed");
  const lines = confirmed.flatMap((o) =>
    o.lines.flatMap((l) =>
      l.choice === "need" && l.source !== null && l.unitPriceCents !== null
        ? [
            {
              itemId: l.itemId,
              quantity: l.quantity,
              source: l.source,
              unitPriceCents: l.unitPriceCents,
            },
          ]
        : [],
    ),
  );
  const used = new Set(lines.map((l) => l.itemId));
  return {
    summary: rentalSummary(
      items.filter((i) => !i.archived || used.has(i.id)),
      lines,
    ),
    waiting: orders.filter((o) => o.status === "submitted").length,
    confirmed: confirmed.length,
    tents: confirmed
      .flatMap((o) =>
        o.lines
          .filter((l) => l.isTent && l.choice === "need")
          .map((l) => ({
            lineId: l.id,
            itemName: l.itemName,
            quantity: l.quantity,
            tentLabel: l.tentLabel,
            source: l.source,
            ownerName: o.memberName,
            sharers: l.sharers.map((s) => s.name),
          })),
      )
      .sort(
        (a, b) =>
          (a.tentLabel ?? "￿").localeCompare(b.tentLabel ?? "￿", undefined, {
            numeric: true,
          }) || a.ownerName.localeCompare(b.ownerName),
      ),
    ownTents: orders
      .filter((o) => o.status !== "draft")
      .flatMap((o) =>
        o.lines
          .filter((l) => l.isTent && l.choice === "own")
          .map((l) => ({
            lineId: l.id,
            ownerName: o.memberName,
            description: l.ownDescription,
            sleeps: l.ownSleeps,
            sharers: l.sharers.map((s) => s.name),
          })),
      )
      .sort((a, b) => a.ownerName.localeCompare(b.ownerName)),
  };
}

/** A member who is coming this year and has not sent a gear order. */
export interface RentalUnanswered {
  userId: string;
  name: string;
  participation: ParticipationStatus;
  /** They started an order and have not sent it. */
  draft: boolean;
  /** A captain asked them, and the ask is still open. */
  asked: boolean;
}

/** The members "Ask everyone" would ask, read in the caller's transaction or out of one. */
async function unanswered(db: DbOrTx, cycle: number) {
  const rows = await db
    .select({
      userId: schema.users.id,
      name: schema.users.displayName,
      participation: schema.campParticipations.status,
      orderStatus: schema.rentalOrders.status,
      askId: schema.requiredActions.id,
      askStatus: schema.requiredActions.status,
    })
    .from(schema.users)
    .innerJoin(
      schema.campParticipations,
      and(
        eq(schema.campParticipations.userId, schema.users.id),
        eq(schema.campParticipations.cycle, cycle),
      ),
    )
    .leftJoin(
      schema.rentalOrders,
      and(
        eq(schema.rentalOrders.userId, schema.users.id),
        eq(schema.rentalOrders.cycle, cycle),
      ),
    )
    .leftJoin(
      schema.requiredActions,
      and(
        eq(schema.requiredActions.userId, schema.users.id),
        eq(schema.requiredActions.actionKey, GEAR_ORDER_ACTION_KEY),
      ),
    )
    .where(
      and(
        eq(schema.users.isSystem, false),
        eq(schema.users.sanitised, false),
        eq(schema.users.approvalStatus, "approved"),
      ),
    );
  return rows.filter(
    (r) =>
      isAskedForGear(r.participation) &&
      (r.orderStatus === null || r.orderStatus === "draft"),
  );
}

/**
 * Who has not answered, by name, for the captains' Orders list: every member
 * who is coming this year (isAskedForGear) with no order, or only a draft.
 */
export async function listRentalUnanswered(
  cycle: number,
): Promise<RentalUnanswered[]> {
  const rows = await unanswered(createHttpDb(), cycle);
  return rows
    .map((r) => ({
      userId: r.userId,
      name: nameOf(r.name),
      participation: r.participation,
      draft: r.orderStatus === "draft",
      asked: r.askStatus === "pending",
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** One approved member, for the captain's page of a member with no order yet. */
export async function getRentalMember(
  userId: string,
  cycle: number,
): Promise<{
  userId: string;
  name: string;
  participation: ParticipationStatus | null;
} | null> {
  if (!UUID.test(userId)) return null;
  const [row] = await createHttpDb()
    .select({
      name: schema.users.displayName,
      participation: schema.campParticipations.status,
    })
    .from(schema.users)
    .leftJoin(
      schema.campParticipations,
      and(
        eq(schema.campParticipations.userId, schema.users.id),
        eq(schema.campParticipations.cycle, cycle),
      ),
    )
    .where(
      and(
        eq(schema.users.id, userId),
        eq(schema.users.isSystem, false),
        eq(schema.users.sanitised, false),
        eq(schema.users.approvalStatus, "approved"),
      ),
    )
    .limit(1);
  return row
    ? { userId, name: nameOf(row.name), participation: row.participation }
    : null;
}

// --- Orders: a member's writes ---------------------------------------------------

/**
 * Write an order's row and its lines inside the caller's transaction: the
 * member's own save, or a captain filling it in for them. A compare-and-set
 * on the version the writer saw (0 when there is no order) and on the states
 * the writer may change it from. Sending it completes the member's open
 * "Ask everyone" nudge and reads its notice, in the same transaction.
 */
async function storeOrder(
  tx: Tx,
  input: {
    userId: string;
    cycle: number;
    lines: readonly RentalLineDraft[];
    submit: boolean;
    expectedVersion: number;
    /** The states this writer may change the order from. */
    from: readonly RentalOrderStatus[];
    /** The captain filling it in, or null for the member's own save. */
    filledBy: string | null;
    /** The sentence for each state the writer may not change it from. */
    locked: (status: RentalOrderStatus | undefined) => string;
  },
): Promise<{ orderId: string; version: number; status: RentalOrderStatus }> {
  if (!UUID.test(input.userId)) refuse(RENTAL_NO_SUCH_MEMBER);
  const [member] = await tx
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(
      and(
        eq(schema.users.id, input.userId),
        eq(schema.users.isSystem, false),
        eq(schema.users.sanitised, false),
      ),
    )
    .limit(1);
  if (!member) refuse(RENTAL_NO_SUCH_MEMBER);

  // The year's items are share-locked before the lines are checked against
  // them, so a catalogue edit that shrinks a tent (which takes each row it
  // updates) waits for this order, and then sees it. Members saving at the
  // same moment do not wait for each other.
  await tx
    .select({ id: schema.rentalItems.id })
    .from(schema.rentalItems)
    .where(eq(schema.rentalItems.cycle, input.cycle))
    .orderBy(asc(schema.rentalItems.id))
    .for("share");
  const items = await listRentalItems(input.cycle, {}, tx);
  const checked = checkRentalLines(items, input.lines, input.userId);
  if (!checked.ok) refuse(checked.error);
  if (input.submit && checked.lines.length === 0) {
    refuse(RENTAL_NOTHING_TO_SEND);
  }
  const sharerIds = [...new Set(checked.lines.flatMap((l) => l.sharerIds))];
  if (sharerIds.some((id) => !UUID.test(id))) refuse(RENTAL_SHARER_GONE);
  if (sharerIds.length > 0) {
    const real = await tx
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(
        and(
          inArray(schema.users.id, sharerIds),
          eq(schema.users.isSystem, false),
          eq(schema.users.sanitised, false),
          eq(schema.users.approvalStatus, "approved"),
        ),
      );
    if (real.length !== sharerIds.length) refuse(RENTAL_SHARER_GONE);
  }

  const now = new Date();
  const status: RentalOrderStatus = input.submit ? "submitted" : "draft";
  const next = input.expectedVersion + 1;
  const fields = {
    status,
    version: next,
    submittedAt: input.submit ? now : null,
    filledByUserId: input.filledBy,
    updatedAt: now,
  };
  let orderId: string | undefined;
  if (input.expectedVersion === 0) {
    const rows = await tx
      .insert(schema.rentalOrders)
      .values({ userId: input.userId, cycle: input.cycle, ...fields })
      .onConflictDoNothing({
        target: [schema.rentalOrders.userId, schema.rentalOrders.cycle],
      })
      .returning({ id: schema.rentalOrders.id });
    orderId = rows[0]?.id;
  } else {
    const rows = await tx
      .update(schema.rentalOrders)
      .set(fields)
      .where(
        and(
          eq(schema.rentalOrders.userId, input.userId),
          eq(schema.rentalOrders.cycle, input.cycle),
          inArray(schema.rentalOrders.status, [...input.from]),
          eq(schema.rentalOrders.version, input.expectedVersion),
        ),
      )
      .returning({ id: schema.rentalOrders.id });
    orderId = rows[0]?.id;
  }
  if (!orderId) {
    const [current] = await tx
      .select({ status: schema.rentalOrders.status })
      .from(schema.rentalOrders)
      .where(
        and(
          eq(schema.rentalOrders.userId, input.userId),
          eq(schema.rentalOrders.cycle, input.cycle),
        ),
      )
      .limit(1);
    refuse(
      input.locked(
        current && !input.from.includes(current.status)
          ? current.status
          : undefined,
      ),
    );
  }

  await tx
    .delete(schema.rentalOrderLines)
    .where(eq(schema.rentalOrderLines.orderId, orderId));
  for (const line of checked.lines) {
    const [row] = await tx
      .insert(schema.rentalOrderLines)
      .values({
        orderId,
        itemId: line.itemId,
        choice: line.choice,
        quantity: line.quantity,
        ownDescription: line.ownDescription,
        ownSleeps: line.ownSleeps,
      })
      .returning({ id: schema.rentalOrderLines.id });
    if (line.sharerIds.length > 0) {
      await tx
        .insert(schema.rentalLineSharers)
        .values(line.sharerIds.map((userId) => ({ lineId: row!.id, userId })));
    }
  }

  if (input.submit) {
    // The order is sent: the nudge is answered, and its notice is read.
    await tx
      .update(schema.requiredActions)
      .set({ status: "completed", completedAt: now })
      .where(
        and(
          eq(schema.requiredActions.userId, input.userId),
          eq(schema.requiredActions.actionKey, GEAR_ORDER_ACTION_KEY),
          eq(schema.requiredActions.status, "pending"),
        ),
      );
    await tx
      .update(schema.notificationDeliveries)
      .set({ readAt: now })
      .where(
        and(
          eq(schema.notificationDeliveries.userId, input.userId),
          eq(schema.notificationDeliveries.refType, GEAR_ORDER_REF_TYPE),
          isNull(schema.notificationDeliveries.readAt),
        ),
      );
  }
  return { orderId, version: next, status };
}

/**
 * Save a member's own order, as a draft or sent to the captains. The lines
 * replace the ones before. A compare-and-set on the version the member saw (0
 * before their first save), and only a draft can change: a sent order is
 * taken back first, a confirmed one is reopened by a captain. An order a
 * captain filled in becomes the member's own again.
 */
export async function saveRentalOrder(input: {
  userId: string;
  cycle: number;
  lines: readonly RentalLineDraft[];
  submit: boolean;
  expectedVersion: number;
}): Promise<RentalResult<{ version: number; status: RentalOrderStatus }>> {
  return write(async (tx) => {
    const saved = await storeOrder(tx, {
      ...input,
      from: ["draft"],
      filledBy: null,
      locked: (status) =>
        status === "submitted"
          ? RENTAL_ORDER_SENT
          : status === "confirmed"
            ? RENTAL_ORDER_CONFIRMED
            : RENTAL_ORDER_CHANGED,
    });
    return { version: saved.version, status: saved.status };
  });
}

/** A member takes their sent order back to change it. */
export async function withdrawRentalOrder(input: {
  userId: string;
  cycle: number;
  expectedVersion: number;
}): Promise<RentalResult<{ version: number }>> {
  return write(async (tx) => {
    if (!UUID.test(input.userId)) refuse(RENTAL_NO_SUCH_MEMBER);
    const next = input.expectedVersion + 1;
    const rows = await tx
      .update(schema.rentalOrders)
      .set({
        status: "draft",
        version: next,
        submittedAt: null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.rentalOrders.userId, input.userId),
          eq(schema.rentalOrders.cycle, input.cycle),
          eq(schema.rentalOrders.status, "submitted"),
          eq(schema.rentalOrders.version, input.expectedVersion),
        ),
      )
      .returning({ id: schema.rentalOrders.id });
    if (rows.length === 0) {
      const [current] = await tx
        .select({ status: schema.rentalOrders.status })
        .from(schema.rentalOrders)
        .where(
          and(
            eq(schema.rentalOrders.userId, input.userId),
            eq(schema.rentalOrders.cycle, input.cycle),
          ),
        )
        .limit(1);
      refuse(
        current?.status === "confirmed"
          ? RENTAL_ORDER_CONFIRMED
          : RENTAL_ORDER_CHANGED,
      );
    }
    return { version: next };
  });
}

// --- Orders: a captain's writes --------------------------------------------------

/**
 * Fill an order in for a member who has not answered, as a captain. It is
 * sent at once, for a captain to confirm as usual, and marked as filled in by
 * a captain. A privileged write to another member's data: the audit row is
 * in the same transaction, and it is a compare-and-set on the version the
 * captain saw (0 when the member has no order). A draft or a sent order can
 * be changed this way; a confirmed one is reopened first.
 */
export async function fillRentalOrderFor(input: {
  userId: string;
  cycle: number;
  lines: readonly RentalLineDraft[];
  expectedVersion: number;
  actorId: string;
}): Promise<RentalResult<{ version: number }>> {
  return write(async (tx) => {
    await assertRentalManager(tx, input.actorId);
    const saved = await storeOrder(tx, {
      userId: input.userId,
      cycle: input.cycle,
      lines: input.lines,
      submit: true,
      expectedVersion: input.expectedVersion,
      from: ["draft", "submitted"],
      filledBy: input.actorId,
      locked: (status) =>
        status === "confirmed" ? RENTAL_REOPEN_FIRST : RENTAL_ORDER_MOVED,
    });
    await writeAuditEvent(tx, {
      actorId: input.actorId,
      action: "rental.order_filled",
      target: input.userId,
      metadata: {
        cycle: input.cycle,
        orderId: saved.orderId,
        lines: input.lines.length,
      },
    });
    return { version: saved.version };
  });
}

/**
 * "Ask everyone": nudge each member who is coming this year and has not sent
 * a gear order (isAskedForGear; no order, or only a draft). A nudge, never a
 * block: one NON-blocking `required_actions` row per member, opened again
 * when it was answered in an earlier year, and one notice. Pressing it again
 * reaches only the members who still have not answered, and never stacks: a
 * member whose notice is still unread gets no second one. Audited.
 */
export async function askForGearOrders(input: {
  cycle: number;
  actorId: string;
}): Promise<RentalResult<{ asked: number; notified: number }>> {
  return write(async (tx) => {
    await assertRentalManager(tx, input.actorId);
    const targets = await unanswered(tx, input.cycle);
    if (targets.length === 0) return { asked: 0, notified: 0 };
    const now = new Date();
    const userIds = targets.map((t) => t.userId);
    await tx
      .insert(schema.requiredActions)
      .values(
        userIds.map((userId) => ({
          userId,
          type: "questionnaire" as const,
          actionKey: GEAR_ORDER_ACTION_KEY,
          title: GEAR_ORDER_ACTION_TITLE,
          blocking: false,
        })),
      )
      .onConflictDoUpdate({
        target: [
          schema.requiredActions.userId,
          schema.requiredActions.actionKey,
        ],
        set: { status: "pending", completedAt: null, blocking: false },
      });
    const rows = await tx
      .select({
        id: schema.requiredActions.id,
        userId: schema.requiredActions.userId,
      })
      .from(schema.requiredActions)
      .where(
        and(
          inArray(schema.requiredActions.userId, userIds),
          eq(schema.requiredActions.actionKey, GEAR_ORDER_ACTION_KEY),
        ),
      );
    const unread = await tx
      .select({ userId: schema.notificationDeliveries.userId })
      .from(schema.notificationDeliveries)
      .where(
        and(
          inArray(schema.notificationDeliveries.userId, userIds),
          eq(schema.notificationDeliveries.refType, GEAR_ORDER_REF_TYPE),
          isNull(schema.notificationDeliveries.readAt),
        ),
      );
    const stillUnread = new Set(unread.map((u) => u.userId));
    const toNotify = rows.filter((r) => !stillUnread.has(r.userId));
    if (toNotify.length > 0) {
      await tx.insert(schema.notificationDeliveries).values(
        toNotify.map((row) =>
          deliveryValues(
            gearOrderAskNotification({ requiredActionId: row.id }),
            {
              userId: row.userId,
              broadcastId: null,
              channel: "both",
              presentation: "feed",
              createdAt: now,
            },
          ),
        ),
      );
    }
    await writeAuditEvent(tx, {
      actorId: input.actorId,
      action: "rental.orders_asked",
      target: String(input.cycle),
      metadata: {
        cycle: input.cycle,
        asked: targets.length,
        notified: toNotify.length,
      },
    });
    return { asked: targets.length, notified: toNotify.length };
  });
}

/**
 * Confirm a sent order: the captain's source for each needed item, the price
 * each is confirmed at, the total, and the `rental` charge on the member's
 * dues, all in one transaction with the audit row. A compare-and-set on
 * `submitted` and the version the captain saw, so an order the member took
 * back or changed in between is refused, never confirmed as it was.
 */
export async function confirmRentalOrder(input: {
  orderId: string;
  expectedVersion: number;
  sources: readonly { lineId: string; source: RentalSource }[];
  actorId: string;
}): Promise<RentalResult<{ totalCents: number; chargeId: string | null }>> {
  return write(async (tx) => {
    await assertRentalManager(tx, input.actorId);
    if (!UUID.test(input.orderId)) refuse(RENTAL_ORDER_MOVED);
    const now = new Date();
    const [order] = await tx
      .update(schema.rentalOrders)
      .set({
        status: "confirmed",
        version: input.expectedVersion + 1,
        confirmedAt: now,
        confirmedByUserId: input.actorId,
        updatedAt: now,
      })
      .where(
        and(
          eq(schema.rentalOrders.id, input.orderId),
          eq(schema.rentalOrders.status, "submitted"),
          eq(schema.rentalOrders.version, input.expectedVersion),
        ),
      )
      .returning({
        userId: schema.rentalOrders.userId,
        cycle: schema.rentalOrders.cycle,
      });
    if (!order) refuse(RENTAL_ORDER_MOVED);

    const lines = await tx
      .select({
        id: schema.rentalOrderLines.id,
        itemId: schema.rentalOrderLines.itemId,
        choice: schema.rentalOrderLines.choice,
        quantity: schema.rentalOrderLines.quantity,
      })
      .from(schema.rentalOrderLines)
      .where(eq(schema.rentalOrderLines.orderId, input.orderId));
    // The year's items are locked before the camp stock is counted, so two
    // confirmations at once cannot both take the last one.
    await tx
      .select({ id: schema.rentalItems.id })
      .from(schema.rentalItems)
      .where(eq(schema.rentalItems.cycle, order.cycle))
      .orderBy(asc(schema.rentalItems.id))
      .for("update");
    // Archived items too: an order keeps an item taken off the list.
    const items = await listRentalItems(
      order.cycle,
      { includeArchived: true },
      tx,
    );
    const orders = await campTakenByOrders(tx, order.cycle, input.orderId);
    const taken = new Map(
      items.map((item) => [
        item.id,
        campStockTaken(item, orders.get(item.id) ?? 0),
      ]),
    );
    const priced = priceRentalOrder(items, lines, input.sources, taken);
    if (!priced.ok) refuse(priced.error);
    for (const line of priced.lines) {
      await tx
        .update(schema.rentalOrderLines)
        .set({ source: line.source, unitPriceCents: line.unitPriceCents })
        .where(eq(schema.rentalOrderLines.id, line.lineId));
    }

    let chargeId: string | null = null;
    if (priced.totalCents > 0) {
      const [charge] = await tx
        .insert(schema.duesCharges)
        .values({
          userId: order.userId,
          cycle: order.cycle,
          kind: "rental",
          description: rentalChargeDescription(priced.lines),
          amountCents: priced.totalCents,
          createdByUserId: input.actorId,
        })
        .returning({ id: schema.duesCharges.id });
      chargeId = charge!.id;
    }
    await tx
      .update(schema.rentalOrders)
      .set({ totalCents: priced.totalCents, chargeId })
      .where(eq(schema.rentalOrders.id, input.orderId));
    await writeAuditEvent(tx, {
      actorId: input.actorId,
      action: "rental.order_confirmed",
      target: order.userId,
      metadata: {
        cycle: order.cycle,
        orderId: input.orderId,
        totalCents: priced.totalCents,
        fromCamp: priced.lines
          .filter((l) => l.source === "camp")
          .reduce((n, l) => n + l.quantity, 0),
        fromSupplier: priced.lines
          .filter((l) => l.source === "supplier")
          .reduce((n, l) => n + l.quantity, 0),
      },
    });
    return { totalCents: priced.totalCents, chargeId };
  });
}

/**
 * Reopen a confirmed order so it can change: it goes back to sent, and the
 * charge it made is cancelled in the same transaction, with the audit row. A
 * compare-and-set on `confirmed` and the version the captain saw.
 */
export async function reopenRentalOrder(input: {
  orderId: string;
  expectedVersion: number;
  actorId: string;
}): Promise<RentalResult> {
  return write(async (tx) => {
    await assertRentalManager(tx, input.actorId);
    if (!UUID.test(input.orderId)) refuse(RENTAL_ORDER_MOVED);
    const [before] = await tx
      .select({
        chargeId: schema.rentalOrders.chargeId,
        totalCents: schema.rentalOrders.totalCents,
      })
      .from(schema.rentalOrders)
      .where(eq(schema.rentalOrders.id, input.orderId))
      .limit(1)
      .for("update");
    const now = new Date();
    const [order] = await tx
      .update(schema.rentalOrders)
      .set({
        status: "submitted",
        version: input.expectedVersion + 1,
        confirmedAt: null,
        confirmedByUserId: null,
        totalCents: null,
        chargeId: null,
        updatedAt: now,
      })
      .where(
        and(
          eq(schema.rentalOrders.id, input.orderId),
          eq(schema.rentalOrders.status, "confirmed"),
          eq(schema.rentalOrders.version, input.expectedVersion),
        ),
      )
      .returning({
        userId: schema.rentalOrders.userId,
        cycle: schema.rentalOrders.cycle,
      });
    if (!order || !before) refuse(RENTAL_ORDER_MOVED);
    if (before.chargeId) {
      await tx
        .update(schema.duesCharges)
        .set({
          cancelledAt: now,
          cancelledByUserId: input.actorId,
          updatedAt: now,
        })
        .where(
          and(
            eq(schema.duesCharges.id, before.chargeId),
            isNull(schema.duesCharges.cancelledAt),
          ),
        );
    }
    await writeAuditEvent(tx, {
      actorId: input.actorId,
      action: "rental.order_reopened",
      target: order.userId,
      metadata: {
        cycle: order.cycle,
        orderId: input.orderId,
        totalCents: before.totalCents,
      },
    });
    return {};
  });
}

/** Label a tent on a confirmed order, or take the label off (null). */
export async function setTentLabel(input: {
  lineId: string;
  label: string | null;
  actorId: string;
}): Promise<RentalResult> {
  return write(async (tx) => {
    await assertRentalManager(tx, input.actorId);
    if (!UUID.test(input.lineId)) refuse(RENTAL_TENT_NOT_CONFIRMED);
    const [line] = await tx
      .select({
        userId: schema.rentalOrders.userId,
        cycle: schema.rentalOrders.cycle,
        status: schema.rentalOrders.status,
        choice: schema.rentalOrderLines.choice,
        isTent: schema.rentalItems.isTent,
        name: schema.rentalItems.name,
      })
      .from(schema.rentalOrderLines)
      .innerJoin(
        schema.rentalOrders,
        eq(schema.rentalOrders.id, schema.rentalOrderLines.orderId),
      )
      .innerJoin(
        schema.rentalItems,
        eq(schema.rentalItems.id, schema.rentalOrderLines.itemId),
      )
      .where(eq(schema.rentalOrderLines.id, input.lineId))
      .limit(1)
      // The order row is locked, so a reopen at the same moment waits.
      .for("update", { of: schema.rentalOrders });
    if (
      !line ||
      line.status !== "confirmed" ||
      !line.isTent ||
      line.choice !== "need"
    ) {
      refuse(RENTAL_TENT_NOT_CONFIRMED);
    }
    await tx
      .update(schema.rentalOrderLines)
      .set({ tentLabel: input.label })
      .where(eq(schema.rentalOrderLines.id, input.lineId));
    await writeAuditEvent(tx, {
      actorId: input.actorId,
      action: "rental.tent_labelled",
      target: line.userId,
      metadata: { cycle: line.cycle, name: line.name, label: input.label },
    });
    return {};
  });
}
