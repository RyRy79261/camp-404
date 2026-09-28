import {
  and,
  asc,
  count,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
  sql,
} from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { canEditInventory, nextMaintenanceDue } from "@camp404/core";
import type {
  EditInventoryItemInput,
  EditInventoryNeedInput,
  InventoryBookingInput,
  InventoryCategory,
  InventoryCondition,
  InventoryItemInput,
  InventoryLoanInput,
  InventoryLocation,
  InventoryNeedInput,
  InventoryPledgeInput,
  InventoryProposalInput,
  InventoryReviewInput,
  Team,
} from "@camp404/types";
import { writeAuditEvent, type DbOrTx } from "./audit";
import { lockSenderReach } from "./broadcasts";
import { currentCycleNumber } from "./cycles";
import { createHttpDb, withTransaction, type Tx } from "./index";
import * as schema from "./schema";

// Inventory (#246): the data layer.
//
//  - Every member reads the gear, the year's needs and pledges, the bookings
//    and the loans. A booking names its member only to someone who may edit
//    the item; the page asks `canEditInventory` and passes the flag here.
//  - A captain or a lead of the item's OWN team changes it (canEditInventory).
//    Every such write re-reads the actor's rank and the teams they lead this
//    year INSIDE its own transaction (lockSenderReach), so a demotion that
//    committed first is seen and one that comes later waits. A caller passes
//    only who is acting, never a rank or a team list.
//  - Any member proposes a change; approving it is a compare-and-set on
//    `pending`, with its audit row in the same transaction.
//  - A direct edit is a compare-and-set on the item's `version`.
//  - Items outlive the year; needs, pledges, bookings and loans are the
//    year's (stamped with currentCycleNumber, read through the transaction).
//
// PGlite has ONE connection: everything inside a transaction goes through
// `tx`, never createHttpDb().

export type InventoryWriteResult<T = object> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

export const NOT_AN_INVENTORY_EDITOR =
  "Only captains and that team's leads can change this.";
export const ITEM_GONE = "That item isn't there any more. Reload the page.";
export const ITEM_CHANGED = "Someone changed this item first. Reload the page.";
export const PROPOSAL_GONE =
  "That change isn't there any more. Reload the page.";
export const PROPOSAL_DECIDED =
  "Someone reviewed this change first. Reload the page.";
export const CUSTODIAN_UNKNOWN = "Pick a camp member for whose home it is at.";
export const NEED_GONE =
  "That need isn't on the list any more. Reload the page.";
export const NEED_CHANGED = "Someone changed this need first. Reload the page.";
export const NOT_BOOKABLE = "This item can't be booked.";
export const FULLY_BOOKED =
  "It's fully booked. Nobody else can book it this year.";
export const ALREADY_BOOKED = "You've already booked this.";
export const BOOKING_GONE =
  "That booking isn't there any more. Reload the page.";
export const NOT_YOUR_BOOKING =
  "Only the member who booked it, a captain or that team's lead can cancel it.";
export const LOAN_TOO_MANY = "You can't lend more than the camp has.";
export const LOAN_GONE = "That loan isn't there any more. Reload the page.";
export const LOAN_RETURNED =
  "It's already marked as returned. Reload the page.";

const NIL_UUID = "00000000-0000-0000-0000-000000000000";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// --- Shapes ------------------------------------------------------------------

/** One item, as the list and the detail page read it. */
export interface InventoryItemRow {
  id: string;
  name: string;
  details: string | null;
  team: Team;
  category: InventoryCategory;
  condition: InventoryCondition;
  quantity: number;
  unit: string | null;
  weightKg: number | null;
  wattsEach: number | null;
  location: InventoryLocation;
  custodianUserId: string | null;
  custodianName: string | null;
  storageLocation: string | null;
  requiresMaintenance: boolean;
  maintenanceIntervalDays: number | null;
  lastMaintainedAt: Date | null;
  nextMaintenanceDueAt: Date | null;
  lastCheckedAt: Date | null;
  bookableCount: number | null;
  archivedAt: Date | null;
  version: number;
  updatedAt: Date;
}

/** One entry in an item's change log, or a proposal waiting for review. */
export interface InventoryUpdateRow {
  id: string;
  itemId: string | null;
  itemName: string;
  team: Team;
  status: "pending" | "approved" | "rejected";
  quantity: number;
  condition: InventoryCondition | null;
  location: InventoryLocation | null;
  custodianUserId: string | null;
  custodianName: string | null;
  storageLocation: string | null;
  maintenancePerformedAt: Date | null;
  note: string | null;
  proposedById: string | null;
  proposedByName: string | null;
  reviewedByName: string | null;
  reviewedAt: Date | null;
  reviewNote: string | null;
  createdAt: Date;
}

/** One pledge under a need. Pledges are read by every member, by name. */
export interface InventoryPledgeRow {
  userId: string;
  displayName: string;
  quantity: number;
  note: string | null;
}

/** One of a team's needs this year, with what covers it. */
export interface InventoryNeedRow {
  id: string;
  team: Team;
  name: string;
  quantity: number;
  itemId: string | null;
  itemName: string | null;
  /** The linked item's count, or 0 with no item (or an archived one). */
  have: number;
  boughtQuantity: number;
  note: string | null;
  pledges: InventoryPledgeRow[];
  version: number;
}

/** A bookable item with this year's bookings. */
export interface BookableItemRow {
  itemId: string;
  name: string;
  team: Team;
  bookableCount: number;
  booked: number;
  /** The viewer's own booking of it, if any. */
  myBookingId: string | null;
}

/** A booking of one item. `displayName` is null unless the viewer may see it. */
export interface InventoryBookingRow {
  id: string;
  userId: string | null;
  displayName: string | null;
  mine: boolean;
  note: string | null;
  createdAt: Date;
}

/** A loan to another camp: their camp and site address only. */
export interface InventoryLoanRow {
  id: string;
  itemId: string;
  itemName: string;
  team: Team;
  quantity: number;
  borrowerCamp: string;
  borrowerAddress: string;
  lentAt: Date;
  lentByName: string | null;
  returnedAt: Date | null;
}

/** A member a custodian or a booking can name. */
export interface InventoryMember {
  id: string;
  displayName: string;
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
): Promise<InventoryWriteResult<T>> {
  try {
    const value = await withTransaction(fn);
    return { ok: true, ...value };
  } catch (error) {
    if (error instanceof Refused) return { ok: false, error: error.sentence };
    throw error;
  }
}

/** The rung lockSenderReach's answer stands on: undefined is a captain. */
function reachRank(
  reach: readonly string[] | undefined,
): "captain" | "team_lead" | "camp_member" {
  if (reach === undefined) return "captain";
  return reach.length > 0 ? "team_lead" : "camp_member";
}

/**
 * Whether the actor may change `team`'s gear, read and locked inside the
 * write's own transaction: a captain, or a lead of that team this year.
 */
export async function lockInventoryEditor(
  tx: DbOrTx,
  actorId: string,
  team: string,
): Promise<boolean> {
  if (!UUID.test(actorId)) return false;
  const reach = await lockSenderReach(tx, actorId);
  return canEditInventory(reachRank(reach), reach ?? [], team);
}

async function assertEditor(tx: Tx, actorId: string, team: string) {
  if (!(await lockInventoryEditor(tx, actorId, team))) {
    refuse(NOT_AN_INVENTORY_EDITOR);
  }
}

/** A custodian must be an approved camp member. */
async function assertCustodian(tx: Tx, userId: string | null | undefined) {
  if (!userId) return;
  if (!UUID.test(userId)) refuse(CUSTODIAN_UNKNOWN);
  const [row] = await tx
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(
      and(
        eq(schema.users.id, userId),
        eq(schema.users.approvalStatus, "approved"),
        eq(schema.users.sanitised, false),
        eq(schema.users.isSystem, false),
      ),
    );
  if (!row) refuse(CUSTODIAN_UNKNOWN);
}

/** The live item, locked for the rest of the transaction. */
async function lockItem(tx: Tx, itemId: string) {
  if (!UUID.test(itemId)) refuse(ITEM_GONE);
  const [item] = await tx
    .select()
    .from(schema.inventoryItems)
    .where(
      and(
        eq(schema.inventoryItems.id, itemId),
        isNull(schema.inventoryItems.archivedAt),
      ),
    )
    .for("update");
  if (!item) refuse(ITEM_GONE);
  return item;
}

function numberOrNull(value: string | number | null): number | null {
  if (value === null) return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

// --- Reads -------------------------------------------------------------------

const custodian = alias(schema.users, "custodian");

function itemColumns() {
  return {
    id: schema.inventoryItems.id,
    name: schema.inventoryItems.name,
    details: schema.inventoryItems.details,
    team: schema.inventoryItems.team,
    category: schema.inventoryItems.category,
    condition: schema.inventoryItems.condition,
    quantity: schema.inventoryItems.quantity,
    unit: schema.inventoryItems.unit,
    weightKg: schema.inventoryItems.weightKg,
    wattsEach: schema.inventoryItems.wattsEach,
    location: schema.inventoryItems.location,
    custodianUserId: schema.inventoryItems.custodianUserId,
    custodianName: custodian.displayName,
    storageLocation: schema.inventoryItems.storageLocation,
    requiresMaintenance: schema.inventoryItems.requiresMaintenance,
    maintenanceIntervalDays: schema.inventoryItems.maintenanceIntervalDays,
    lastMaintainedAt: schema.inventoryItems.lastMaintainedAt,
    nextMaintenanceDueAt: schema.inventoryItems.nextMaintenanceDueAt,
    lastCheckedAt: schema.inventoryItems.lastCheckedAt,
    bookableCount: schema.inventoryItems.bookableCount,
    archivedAt: schema.inventoryItems.archivedAt,
    version: schema.inventoryItems.version,
    updatedAt: schema.inventoryItems.updatedAt,
  };
}

type RawItem = Omit<InventoryItemRow, "weightKg"> & { weightKg: string | null };

function itemOf(row: RawItem): InventoryItemRow {
  return { ...row, weightKg: numberOrNull(row.weightKg) };
}

/** Every item the camp still keeps, by name. */
export async function listInventoryItems(): Promise<InventoryItemRow[]> {
  const rows = await createHttpDb()
    .select(itemColumns())
    .from(schema.inventoryItems)
    .leftJoin(
      custodian,
      eq(custodian.id, schema.inventoryItems.custodianUserId),
    )
    .where(isNull(schema.inventoryItems.archivedAt))
    .orderBy(asc(schema.inventoryItems.name), asc(schema.inventoryItems.id));
  return rows.map(itemOf);
}

/** One item, archived or not. Null when there is none. */
export async function getInventoryItem(
  itemId: string,
): Promise<InventoryItemRow | null> {
  if (!UUID.test(itemId)) return null;
  const [row] = await createHttpDb()
    .select(itemColumns())
    .from(schema.inventoryItems)
    .leftJoin(
      custodian,
      eq(custodian.id, schema.inventoryItems.custodianUserId),
    )
    .where(eq(schema.inventoryItems.id, itemId));
  return row ? itemOf(row) : null;
}

function updateColumns() {
  const proposer = alias(schema.users, "proposer");
  const reviewer = alias(schema.users, "reviewer");
  const keeper = alias(schema.users, "keeper");
  return {
    proposer,
    reviewer,
    keeper,
    columns: {
      id: schema.inventoryUpdates.id,
      itemId: schema.inventoryUpdates.itemId,
      itemName: schema.inventoryItems.name,
      team: schema.inventoryItems.team,
      status: schema.inventoryUpdates.status,
      quantity: schema.inventoryUpdates.quantity,
      condition: schema.inventoryUpdates.condition,
      location: schema.inventoryUpdates.location,
      custodianUserId: schema.inventoryUpdates.custodianUserId,
      custodianName: keeper.displayName,
      storageLocation: schema.inventoryUpdates.storageLocation,
      maintenancePerformedAt: schema.inventoryUpdates.maintenancePerformedAt,
      note: schema.inventoryUpdates.note,
      proposedById: schema.inventoryUpdates.proposedByUserId,
      proposedByName: proposer.displayName,
      reviewedByName: reviewer.displayName,
      reviewedAt: schema.inventoryUpdates.reviewedAt,
      reviewNote: schema.inventoryUpdates.reviewNote,
      createdAt: schema.inventoryUpdates.createdAt,
    },
  };
}

/** An item's change log and open proposals, newest first. */
export async function listItemUpdates(
  itemId: string,
): Promise<InventoryUpdateRow[]> {
  if (!UUID.test(itemId)) return [];
  const { proposer, reviewer, keeper, columns } = updateColumns();
  return createHttpDb()
    .select(columns)
    .from(schema.inventoryUpdates)
    .innerJoin(
      schema.inventoryItems,
      eq(schema.inventoryItems.id, schema.inventoryUpdates.itemId),
    )
    .leftJoin(
      proposer,
      eq(proposer.id, schema.inventoryUpdates.proposedByUserId),
    )
    .leftJoin(
      reviewer,
      eq(reviewer.id, schema.inventoryUpdates.reviewedByUserId),
    )
    .leftJoin(keeper, eq(keeper.id, schema.inventoryUpdates.custodianUserId))
    .where(eq(schema.inventoryUpdates.itemId, itemId))
    .orderBy(desc(schema.inventoryUpdates.createdAt))
    .limit(50);
}

/** Every proposal waiting for review, oldest first, on items still kept. */
export async function listPendingProposals(): Promise<InventoryUpdateRow[]> {
  const { proposer, reviewer, keeper, columns } = updateColumns();
  return createHttpDb()
    .select(columns)
    .from(schema.inventoryUpdates)
    .innerJoin(
      schema.inventoryItems,
      eq(schema.inventoryItems.id, schema.inventoryUpdates.itemId),
    )
    .leftJoin(
      proposer,
      eq(proposer.id, schema.inventoryUpdates.proposedByUserId),
    )
    .leftJoin(
      reviewer,
      eq(reviewer.id, schema.inventoryUpdates.reviewedByUserId),
    )
    .leftJoin(keeper, eq(keeper.id, schema.inventoryUpdates.custodianUserId))
    .where(
      and(
        eq(schema.inventoryUpdates.status, "pending"),
        isNull(schema.inventoryItems.archivedAt),
      ),
    )
    .orderBy(asc(schema.inventoryUpdates.createdAt));
}

/** This year's needs, by team then name, each with its pledges. */
export async function listInventoryNeeds(): Promise<InventoryNeedRow[]> {
  const db = createHttpDb();
  const cycle = await currentCycleNumber(db);
  const needs = await db
    .select({
      id: schema.inventoryNeeds.id,
      team: schema.inventoryNeeds.team,
      name: schema.inventoryNeeds.name,
      quantity: schema.inventoryNeeds.quantity,
      itemId: schema.inventoryNeeds.itemId,
      itemName: schema.inventoryItems.name,
      itemQuantity: schema.inventoryItems.quantity,
      itemArchivedAt: schema.inventoryItems.archivedAt,
      boughtQuantity: schema.inventoryNeeds.boughtQuantity,
      note: schema.inventoryNeeds.note,
      version: schema.inventoryNeeds.version,
    })
    .from(schema.inventoryNeeds)
    .leftJoin(
      schema.inventoryItems,
      eq(schema.inventoryItems.id, schema.inventoryNeeds.itemId),
    )
    .where(eq(schema.inventoryNeeds.cycle, cycle))
    .orderBy(asc(schema.inventoryNeeds.team), asc(schema.inventoryNeeds.name));
  if (needs.length === 0) return [];
  const pledges = await db
    .select({
      needId: schema.inventoryPledges.needId,
      userId: schema.inventoryPledges.userId,
      displayName: schema.users.displayName,
      quantity: schema.inventoryPledges.quantity,
      note: schema.inventoryPledges.note,
    })
    .from(schema.inventoryPledges)
    .innerJoin(
      schema.users,
      eq(schema.users.id, schema.inventoryPledges.userId),
    )
    .where(
      inArray(
        schema.inventoryPledges.needId,
        needs.map((n) => n.id),
      ),
    )
    .orderBy(asc(schema.inventoryPledges.createdAt));
  return needs.map((n) => ({
    id: n.id,
    team: n.team,
    name: n.name,
    quantity: n.quantity,
    itemId: n.itemId,
    itemName: n.itemName,
    have: n.itemId && n.itemArchivedAt === null ? (n.itemQuantity ?? 0) : 0,
    boughtQuantity: n.boughtQuantity,
    note: n.note,
    version: n.version,
    pledges: pledges
      .filter((p) => p.needId === n.id)
      .map((p) => ({
        userId: p.userId,
        displayName: p.displayName ?? "Unnamed member",
        quantity: p.quantity,
        note: p.note,
      })),
  }));
}

/** The items members can book, with this year's count and the viewer's own. */
export async function listBookableItems(
  viewerId: string,
): Promise<BookableItemRow[]> {
  const db = createHttpDb();
  const cycle = await currentCycleNumber(db);
  const mine = alias(schema.inventoryBookings, "mine");
  const rows = await db
    .select({
      itemId: schema.inventoryItems.id,
      name: schema.inventoryItems.name,
      team: schema.inventoryItems.team,
      bookableCount: schema.inventoryItems.bookableCount,
      booked: sql<number>`(
        select count(*)::int from ${schema.inventoryBookings}
        where ${schema.inventoryBookings.itemId} = ${schema.inventoryItems.id}
          and ${schema.inventoryBookings.cycle} = ${cycle}
      )`,
      myBookingId: mine.id,
    })
    .from(schema.inventoryItems)
    .leftJoin(
      mine,
      and(
        eq(mine.itemId, schema.inventoryItems.id),
        eq(mine.cycle, cycle),
        eq(mine.userId, UUID.test(viewerId) ? viewerId : NIL_UUID),
      ),
    )
    .where(
      and(
        isNull(schema.inventoryItems.archivedAt),
        isNotNull(schema.inventoryItems.bookableCount),
      ),
    )
    .orderBy(asc(schema.inventoryItems.name));
  return rows.map((r) => ({
    ...r,
    bookableCount: r.bookableCount ?? 0,
    booked: Number(r.booked),
  }));
}

/**
 * This year's bookings of one item, first come first. Each names its member
 * only when `withNames` is set (the viewer may edit the item); the viewer's
 * own booking is always marked.
 */
export async function listItemBookings(
  itemId: string,
  viewerId: string,
  withNames: boolean,
): Promise<InventoryBookingRow[]> {
  if (!UUID.test(itemId)) return [];
  const db = createHttpDb();
  const cycle = await currentCycleNumber(db);
  const rows = await db
    .select({
      id: schema.inventoryBookings.id,
      userId: schema.inventoryBookings.userId,
      displayName: schema.users.displayName,
      note: schema.inventoryBookings.note,
      createdAt: schema.inventoryBookings.createdAt,
    })
    .from(schema.inventoryBookings)
    .innerJoin(
      schema.users,
      eq(schema.users.id, schema.inventoryBookings.userId),
    )
    .where(
      and(
        eq(schema.inventoryBookings.itemId, itemId),
        eq(schema.inventoryBookings.cycle, cycle),
      ),
    )
    .orderBy(asc(schema.inventoryBookings.createdAt));
  return rows.map((r) => {
    const mine = r.userId === viewerId;
    const named = withNames || mine;
    return {
      id: r.id,
      userId: named ? r.userId : null,
      displayName: named ? (r.displayName ?? "Unnamed member") : null,
      mine,
      note: named ? r.note : null,
      createdAt: r.createdAt,
    };
  });
}

/** This year's loans (open ones first), or one item's. */
export async function listInventoryLoans(
  itemId?: string,
): Promise<InventoryLoanRow[]> {
  const db = createHttpDb();
  const cycle = await currentCycleNumber(db);
  const lender = alias(schema.users, "lender");
  if (itemId !== undefined && !UUID.test(itemId)) return [];
  return db
    .select({
      id: schema.inventoryLoans.id,
      itemId: schema.inventoryLoans.itemId,
      itemName: schema.inventoryItems.name,
      team: schema.inventoryItems.team,
      quantity: schema.inventoryLoans.quantity,
      borrowerCamp: schema.inventoryLoans.borrowerCamp,
      borrowerAddress: schema.inventoryLoans.borrowerAddress,
      lentAt: schema.inventoryLoans.lentAt,
      lentByName: lender.displayName,
      returnedAt: schema.inventoryLoans.returnedAt,
    })
    .from(schema.inventoryLoans)
    .innerJoin(
      schema.inventoryItems,
      eq(schema.inventoryItems.id, schema.inventoryLoans.itemId),
    )
    .leftJoin(lender, eq(lender.id, schema.inventoryLoans.lentByUserId))
    .where(
      and(
        eq(schema.inventoryLoans.cycle, cycle),
        itemId ? eq(schema.inventoryLoans.itemId, itemId) : undefined,
      ),
    )
    .orderBy(
      sql`${schema.inventoryLoans.returnedAt} is not null`,
      desc(schema.inventoryLoans.lentAt),
    );
}

// --- Items -------------------------------------------------------------------

function itemValues(input: InventoryItemInput) {
  return {
    name: input.name,
    details: input.details ?? null,
    team: input.team,
    category: input.category,
    condition: input.condition,
    quantity: input.quantity,
    unit: input.unit ?? null,
    weightKg: input.weightKg == null ? null : String(input.weightKg),
    wattsEach: input.wattsEach ?? null,
    location: input.location,
    custodianUserId: input.custodianUserId ?? null,
    storageLocation: input.storageLocation ?? null,
    requiresMaintenance: input.requiresMaintenance,
    maintenanceIntervalDays: input.maintenanceIntervalDays ?? null,
    bookableCount: input.bookableCount ?? null,
  };
}

/** The change-log row for a direct change: already approved, by its author. */
async function logDirectChange(
  tx: Tx,
  itemId: string,
  actorId: string,
  note: string,
) {
  const [item] = await tx
    .select()
    .from(schema.inventoryItems)
    .where(eq(schema.inventoryItems.id, itemId));
  const now = new Date();
  await tx.insert(schema.inventoryUpdates).values({
    itemId,
    proposedByUserId: actorId,
    status: "approved",
    name: item!.name,
    details: item!.details,
    team: item!.team,
    quantity: item!.quantity,
    unit: item!.unit,
    weightKg: item!.weightKg,
    requiresMaintenance: item!.requiresMaintenance,
    maintenanceIntervalDays: item!.maintenanceIntervalDays,
    custodianUserId: item!.custodianUserId,
    storageLocation: item!.storageLocation,
    condition: item!.condition,
    location: item!.location,
    note,
    reviewedByUserId: actorId,
    reviewedAt: now,
  });
}

/** Adds an item, for a team the actor may edit. */
export async function addInventoryItem(
  input: InventoryItemInput & { actorId: string },
): Promise<InventoryWriteResult<{ id: string }>> {
  return write(async (tx) => {
    await assertEditor(tx, input.actorId, input.team);
    await assertCustodian(tx, input.custodianUserId);
    const [row] = await tx
      .insert(schema.inventoryItems)
      .values({ ...itemValues(input), createdByUserId: input.actorId })
      .returning({ id: schema.inventoryItems.id });
    await logDirectChange(tx, row!.id, input.actorId, "Added");
    return { id: row!.id };
  });
}

/**
 * Changes an item directly. Compare-and-set on the version the editor opened.
 * Moving it to another team needs edit rights on both teams.
 */
export async function updateInventoryItem(
  input: EditInventoryItemInput & { actorId: string },
): Promise<InventoryWriteResult<{ version: number }>> {
  return write(async (tx) => {
    const item = await lockItem(tx, input.itemId);
    await assertEditor(tx, input.actorId, item.team);
    if (input.team !== item.team) {
      await assertEditor(tx, input.actorId, input.team);
    }
    if (item.version !== input.expectedVersion) refuse(ITEM_CHANGED);
    await assertCustodian(tx, input.custodianUserId);
    const values = itemValues(input);
    const [row] = await tx
      .update(schema.inventoryItems)
      .set({
        ...values,
        nextMaintenanceDueAt: nextMaintenanceDue(
          values.requiresMaintenance,
          values.maintenanceIntervalDays,
          item.lastMaintainedAt,
        ),
        version: sql`${schema.inventoryItems.version} + 1`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.inventoryItems.id, input.itemId),
          eq(schema.inventoryItems.version, input.expectedVersion),
        ),
      )
      .returning({ version: schema.inventoryItems.version });
    if (!row) refuse(ITEM_CHANGED);
    await logDirectChange(tx, input.itemId, input.actorId, "Edited");
    return { version: row.version };
  });
}

/** Stops keeping an item. Its history, bookings and loans stay readable. */
export async function archiveInventoryItem(input: {
  actorId: string;
  itemId: string;
  expectedVersion: number;
}): Promise<InventoryWriteResult> {
  return write(async (tx) => {
    const item = await lockItem(tx, input.itemId);
    await assertEditor(tx, input.actorId, item.team);
    if (item.version !== input.expectedVersion) refuse(ITEM_CHANGED);
    await tx
      .update(schema.inventoryItems)
      .set({
        archivedAt: new Date(),
        version: sql`${schema.inventoryItems.version} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(schema.inventoryItems.id, input.itemId));
    return {};
  });
}

// --- Proposals ---------------------------------------------------------------

/** Any member proposes a new count, condition, place or maintenance done. */
export async function proposeInventoryChange(
  input: InventoryProposalInput & { actorId: string },
): Promise<InventoryWriteResult<{ id: string }>> {
  return write(async (tx) => {
    const item = await lockItem(tx, input.itemId);
    await assertCustodian(tx, input.custodianUserId);
    const [row] = await tx
      .insert(schema.inventoryUpdates)
      .values({
        itemId: item.id,
        proposedByUserId: input.actorId,
        status: "pending",
        name: item.name,
        details: item.details,
        team: item.team,
        quantity: input.quantity,
        unit: item.unit,
        weightKg: item.weightKg,
        requiresMaintenance: item.requiresMaintenance,
        maintenanceIntervalDays: item.maintenanceIntervalDays,
        custodianUserId: input.custodianUserId ?? null,
        storageLocation: input.storageLocation ?? null,
        condition: input.condition,
        location: input.location,
        maintenancePerformedAt: input.maintenanceDone ? new Date() : null,
        note: input.note ?? null,
      })
      .returning({ id: schema.inventoryUpdates.id });
    return { id: row!.id };
  });
}

/**
 * A captain or a lead of the item's team approves or rejects a proposal.
 * Compare-and-set on `pending`: of two reviewers, the second is told. An
 * approval copies the count, condition, place and maintenance onto the item.
 * The audit row is written in the same transaction.
 */
export async function reviewInventoryChange(
  input: InventoryReviewInput & { actorId: string },
): Promise<InventoryWriteResult> {
  return write(async (tx) => {
    if (!UUID.test(input.updateId)) refuse(PROPOSAL_GONE);
    const [proposal] = await tx
      .select()
      .from(schema.inventoryUpdates)
      .where(eq(schema.inventoryUpdates.id, input.updateId));
    if (!proposal?.itemId) refuse(PROPOSAL_GONE);
    const item = await lockItem(tx, proposal.itemId);
    await assertEditor(tx, input.actorId, item.team);
    const now = new Date();
    const [decided] = await tx
      .update(schema.inventoryUpdates)
      .set({
        status: input.decision,
        reviewedByUserId: input.actorId,
        reviewedAt: now,
        reviewNote: input.reviewNote ?? null,
      })
      .where(
        and(
          eq(schema.inventoryUpdates.id, input.updateId),
          eq(schema.inventoryUpdates.status, "pending"),
        ),
      )
      .returning({ id: schema.inventoryUpdates.id });
    if (!decided) refuse(PROPOSAL_DECIDED);

    if (input.decision === "approved") {
      const maintained = proposal.maintenancePerformedAt;
      const lastMaintainedAt = maintained ?? item.lastMaintainedAt;
      await tx
        .update(schema.inventoryItems)
        .set({
          quantity: proposal.quantity,
          condition: proposal.condition ?? item.condition,
          location: proposal.location ?? item.location,
          custodianUserId: proposal.custodianUserId,
          storageLocation: proposal.storageLocation,
          lastMaintainedAt,
          nextMaintenanceDueAt: nextMaintenanceDue(
            item.requiresMaintenance,
            item.maintenanceIntervalDays,
            lastMaintainedAt,
          ),
          lastCheckedAt: proposal.createdAt,
          lastCheckedByUserId: proposal.proposedByUserId,
          version: sql`${schema.inventoryItems.version} + 1`,
          updatedAt: now,
        })
        .where(eq(schema.inventoryItems.id, item.id));
    }
    await writeAuditEvent(tx, {
      actorId: input.actorId,
      action:
        input.decision === "approved"
          ? "inventory.change_approved"
          : "inventory.change_rejected",
      target: item.id,
      metadata: {
        item: item.name,
        team: item.team,
        updateId: input.updateId,
        proposedBy: proposal.proposedByUserId,
      },
    });
    return {};
  });
}

// --- Needs and pledges ---------------------------------------------------------

async function assertLiveItem(tx: Tx, itemId: string | null | undefined) {
  if (!itemId) return;
  await lockItem(tx, itemId);
}

/** Adds one of a team's needs for this year. */
export async function addInventoryNeed(
  input: InventoryNeedInput & { actorId: string },
): Promise<InventoryWriteResult<{ id: string }>> {
  return write(async (tx) => {
    await assertEditor(tx, input.actorId, input.team);
    await assertLiveItem(tx, input.itemId);
    const cycle = await currentCycleNumber(tx);
    const [row] = await tx
      .insert(schema.inventoryNeeds)
      .values({
        cycle,
        team: input.team,
        name: input.name,
        quantity: input.quantity,
        itemId: input.itemId ?? null,
        boughtQuantity: input.boughtQuantity,
        note: input.note ?? null,
        createdByUserId: input.actorId,
      })
      .returning({ id: schema.inventoryNeeds.id });
    return { id: row!.id };
  });
}

/** This year's need, locked. */
async function lockNeed(tx: Tx, needId: string) {
  if (!UUID.test(needId)) refuse(NEED_GONE);
  const cycle = await currentCycleNumber(tx);
  const [need] = await tx
    .select()
    .from(schema.inventoryNeeds)
    .where(
      and(
        eq(schema.inventoryNeeds.id, needId),
        eq(schema.inventoryNeeds.cycle, cycle),
      ),
    )
    .for("update");
  if (!need) refuse(NEED_GONE);
  return need;
}

/** Changes a need; compare-and-set on its version. */
export async function updateInventoryNeed(
  input: EditInventoryNeedInput & { actorId: string },
): Promise<InventoryWriteResult> {
  return write(async (tx) => {
    const need = await lockNeed(tx, input.needId);
    await assertEditor(tx, input.actorId, need.team);
    if (input.team !== need.team) {
      await assertEditor(tx, input.actorId, input.team);
    }
    if (need.version !== input.expectedVersion) refuse(NEED_CHANGED);
    await assertLiveItem(tx, input.itemId);
    await tx
      .update(schema.inventoryNeeds)
      .set({
        team: input.team,
        name: input.name,
        quantity: input.quantity,
        itemId: input.itemId ?? null,
        boughtQuantity: input.boughtQuantity,
        note: input.note ?? null,
        version: sql`${schema.inventoryNeeds.version} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(schema.inventoryNeeds.id, input.needId));
    return {};
  });
}

/** Takes a need off the list, with its pledges. */
export async function removeInventoryNeed(input: {
  actorId: string;
  needId: string;
  expectedVersion: number;
}): Promise<InventoryWriteResult> {
  return write(async (tx) => {
    const need = await lockNeed(tx, input.needId);
    await assertEditor(tx, input.actorId, need.team);
    if (need.version !== input.expectedVersion) refuse(NEED_CHANGED);
    await tx
      .delete(schema.inventoryNeeds)
      .where(eq(schema.inventoryNeeds.id, input.needId));
    return {};
  });
}

/** A member pledges to bring some; pledging again changes their pledge. */
export async function pledgeToNeed(
  input: InventoryPledgeInput & { actorId: string },
): Promise<InventoryWriteResult> {
  return write(async (tx) => {
    await lockNeed(tx, input.needId);
    const now = new Date();
    await tx
      .insert(schema.inventoryPledges)
      .values({
        needId: input.needId,
        userId: input.actorId,
        quantity: input.quantity,
        note: input.note ?? null,
      })
      .onConflictDoUpdate({
        target: [
          schema.inventoryPledges.needId,
          schema.inventoryPledges.userId,
        ],
        set: {
          quantity: input.quantity,
          note: input.note ?? null,
          updatedAt: now,
        },
      });
    return {};
  });
}

/** A member takes back their own pledge. */
export async function withdrawPledge(input: {
  actorId: string;
  needId: string;
}): Promise<InventoryWriteResult> {
  return write(async (tx) => {
    await lockNeed(tx, input.needId);
    await tx
      .delete(schema.inventoryPledges)
      .where(
        and(
          eq(schema.inventoryPledges.needId, input.needId),
          eq(schema.inventoryPledges.userId, input.actorId),
        ),
      );
    return {};
  });
}

// --- Bookings ------------------------------------------------------------------

/**
 * A member books an item for this year. The item row is locked, then the
 * year's bookings are counted, so two members pressing at once cannot both
 * take the last one: the second waits, counts again and is told.
 */
export async function bookInventoryItem(
  input: InventoryBookingInput & { actorId: string },
): Promise<InventoryWriteResult<{ id: string }>> {
  return write(async (tx) => {
    const item = await lockItem(tx, input.itemId);
    if (item.bookableCount === null) refuse(NOT_BOOKABLE);
    const cycle = await currentCycleNumber(tx);
    const [mine] = await tx
      .select({ id: schema.inventoryBookings.id })
      .from(schema.inventoryBookings)
      .where(
        and(
          eq(schema.inventoryBookings.itemId, item.id),
          eq(schema.inventoryBookings.userId, input.actorId),
          eq(schema.inventoryBookings.cycle, cycle),
        ),
      );
    if (mine) refuse(ALREADY_BOOKED);
    const [booked] = await tx
      .select({ n: count() })
      .from(schema.inventoryBookings)
      .where(
        and(
          eq(schema.inventoryBookings.itemId, item.id),
          eq(schema.inventoryBookings.cycle, cycle),
        ),
      );
    if ((booked?.n ?? 0) >= item.bookableCount) refuse(FULLY_BOOKED);
    const [row] = await tx
      .insert(schema.inventoryBookings)
      .values({
        cycle,
        itemId: item.id,
        userId: input.actorId,
        note: input.note ?? null,
      })
      .returning({ id: schema.inventoryBookings.id });
    return { id: row!.id };
  });
}

/**
 * Cancels a booking: the member's own, or anyone's by a captain or a lead of
 * the item's team (that one is audited, as a change to another member's
 * booking).
 */
export async function cancelInventoryBooking(input: {
  actorId: string;
  bookingId: string;
}): Promise<InventoryWriteResult> {
  return write(async (tx) => {
    if (!UUID.test(input.bookingId)) refuse(BOOKING_GONE);
    const [booking] = await tx
      .select({
        id: schema.inventoryBookings.id,
        userId: schema.inventoryBookings.userId,
        itemId: schema.inventoryBookings.itemId,
        itemName: schema.inventoryItems.name,
        team: schema.inventoryItems.team,
      })
      .from(schema.inventoryBookings)
      .innerJoin(
        schema.inventoryItems,
        eq(schema.inventoryItems.id, schema.inventoryBookings.itemId),
      )
      .where(eq(schema.inventoryBookings.id, input.bookingId))
      .for("update", { of: schema.inventoryBookings });
    if (!booking) refuse(BOOKING_GONE);
    const own = booking.userId === input.actorId;
    if (!own && !(await lockInventoryEditor(tx, input.actorId, booking.team))) {
      refuse(NOT_YOUR_BOOKING);
    }
    await tx
      .delete(schema.inventoryBookings)
      .where(eq(schema.inventoryBookings.id, input.bookingId));
    if (!own) {
      await writeAuditEvent(tx, {
        actorId: input.actorId,
        action: "inventory.booking_cancelled",
        target: booking.userId,
        metadata: {
          item: booking.itemName,
          team: booking.team,
          itemId: booking.itemId,
        },
      });
    }
    return {};
  });
}

// --- Loans ---------------------------------------------------------------------

/** Logs gear lent to another camp this year. */
export async function lendInventoryItem(
  input: InventoryLoanInput & { actorId: string },
): Promise<InventoryWriteResult<{ id: string }>> {
  return write(async (tx) => {
    const item = await lockItem(tx, input.itemId);
    await assertEditor(tx, input.actorId, item.team);
    const cycle = await currentCycleNumber(tx);
    const [out] = await tx
      .select({
        n: sql<number>`coalesce(sum(${schema.inventoryLoans.quantity}), 0)::int`,
      })
      .from(schema.inventoryLoans)
      .where(
        and(
          eq(schema.inventoryLoans.itemId, item.id),
          isNull(schema.inventoryLoans.returnedAt),
        ),
      );
    if (Number(out?.n ?? 0) + input.quantity > item.quantity) {
      refuse(LOAN_TOO_MANY);
    }
    const [row] = await tx
      .insert(schema.inventoryLoans)
      .values({
        cycle,
        itemId: item.id,
        quantity: input.quantity,
        borrowerCamp: input.borrowerCamp,
        borrowerAddress: input.borrowerAddress,
        lentByUserId: input.actorId,
      })
      .returning({ id: schema.inventoryLoans.id });
    return { id: row!.id };
  });
}

/** Marks a loan returned. Compare-and-set on it still being out. */
export async function returnInventoryLoan(input: {
  actorId: string;
  loanId: string;
}): Promise<InventoryWriteResult> {
  return write(async (tx) => {
    if (!UUID.test(input.loanId)) refuse(LOAN_GONE);
    const [loan] = await tx
      .select({
        id: schema.inventoryLoans.id,
        team: schema.inventoryItems.team,
      })
      .from(schema.inventoryLoans)
      .innerJoin(
        schema.inventoryItems,
        eq(schema.inventoryItems.id, schema.inventoryLoans.itemId),
      )
      .where(eq(schema.inventoryLoans.id, input.loanId));
    if (!loan) refuse(LOAN_GONE);
    await assertEditor(tx, input.actorId, loan.team);
    const [row] = await tx
      .update(schema.inventoryLoans)
      .set({ returnedAt: new Date(), returnedByUserId: input.actorId })
      .where(
        and(
          eq(schema.inventoryLoans.id, input.loanId),
          isNull(schema.inventoryLoans.returnedAt),
        ),
      )
      .returning({ id: schema.inventoryLoans.id });
    if (!row) refuse(LOAN_RETURNED);
    return {};
  });
}
