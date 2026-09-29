import { z } from "zod";
import { Team } from "./roles";

// Inventory (#246): the camp's gear, what each team needs this year, who
// pledged to bring what, bookings of camp gear, and gear lent to other camps.
// Who may change what is the server's rule (canEditInventory in
// @camp404/core), never this shape's.
//
// Gear lasts across years, so an item is not year-scoped. Needs, pledges,
// bookings and loans are: a new year starts with none.

/** What kind of gear an item is; the list groups by it. */
export const INVENTORY_CATEGORIES = [
  "kitchen",
  "cooling",
  "structures",
  "power",
  "water_and_sanitation",
  "decor",
  "tools",
  "other",
] as const;
export const InventoryCategory = z.enum(INVENTORY_CATEGORIES);
export type InventoryCategory = z.infer<typeof InventoryCategory>;

/** What state an item is in. */
export const INVENTORY_CONDITIONS = ["good", "needs_repair", "broken"] as const;
export const InventoryCondition = z.enum(INVENTORY_CONDITIONS);
export type InventoryCondition = z.infer<typeof InventoryCondition>;

/**
 * Where an item is: the camp's storage unit, a member's home (the custodian),
 * or on site at the burn.
 */
export const INVENTORY_LOCATIONS = [
  "storage_unit",
  "custodian_home",
  "on_site",
] as const;
export const InventoryLocation = z.enum(INVENTORY_LOCATIONS);
export type InventoryLocation = z.infer<typeof InventoryLocation>;

/** The most of one item the camp counts, and the most one booking holds. */
export const INVENTORY_MAX_QUANTITY = 10_000;
/** The most bookings one item takes in a year. */
export const INVENTORY_MAX_BOOKINGS = 500;

/**
 * Row ids. Postgres accepts any 8-4-4-4-12 hex string as a uuid, and so does
 * this; z.uuid() would also demand the RFC version bits.
 */
const RowId = z.guid();

/**
 * A member id. Checked as a real member by the server; any short string here,
 * as the task board's assignee (the E2E store's ids are not uuids).
 */
const MemberId = z.string().min(1).max(100);

/** A blank form field is no answer, not an empty string. */
const optionalText = (max: number, message: string) =>
  z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.string().trim().max(max, message).nullish(),
  );

const Count = z
  .number()
  .int("Count whole items.")
  .min(0, "A count can't be below 0.")
  .max(INVENTORY_MAX_QUANTITY, `Count at most ${INVENTORY_MAX_QUANTITY}.`);

/** A positive count, for a need, a pledge or a loan. */
const PositiveCount = z
  .number()
  .int("Count whole items.")
  .min(1, "Count at least 1.")
  .max(INVENTORY_MAX_QUANTITY, `Count at most ${INVENTORY_MAX_QUANTITY}.`);

// --- Items -----------------------------------------------------------------

const itemFields = {
  name: z
    .string()
    .trim()
    .min(1, "Name the item.")
    .max(80, "Keep the name under 80 characters."),
  details: optionalText(500, "Keep the details under 500 characters."),
  team: Team,
  category: InventoryCategory,
  condition: InventoryCondition,
  quantity: Count,
  unit: optionalText(30, "Keep the unit under 30 characters."),
  /** Total weight in kilograms. */
  weightKg: z
    .number()
    .min(0, "A weight can't be below 0.")
    .max(100_000, "That weight is too large.")
    .nullish(),
  /** The running draw of one unit in watts, for gear that plugs in. */
  wattsEach: z
    .number()
    .gt(0, "Give the watts it draws, or leave it blank.")
    .max(20_000, "One item draws at most 20000 W.")
    .nullish(),
  location: InventoryLocation,
  /** The member it lives with, when it is at a member's home. */
  custodianUserId: MemberId.nullish(),
  /** The spot within the location: "shelf 3", "garage". */
  storageLocation: optionalText(80, "Keep the spot under 80 characters."),
  requiresMaintenance: z.boolean().default(false),
  maintenanceIntervalDays: z
    .number()
    .int("Use whole days.")
    .min(1, "Use at least 1 day.")
    .max(3_650, "Use at most 3650 days.")
    .nullish(),
  /** How many members may book it each year; blank means it isn't booked. */
  bookableCount: z
    .number()
    .int("Use a whole number.")
    .min(1, "Allow at least 1 booking, or leave it blank.")
    .max(
      INVENTORY_MAX_BOOKINGS,
      `Allow at most ${INVENTORY_MAX_BOOKINGS} bookings.`,
    )
    .nullish(),
};

type ItemFields = z.infer<z.ZodObject<typeof itemFields>>;

function checkItem(item: ItemFields, ctx: z.RefinementCtx) {
  if (item.location === "custodian_home" && !item.custodianUserId) {
    ctx.addIssue({
      code: "custom",
      path: ["custodianUserId"],
      message: "Say whose home it is at.",
    });
  }
  if (item.requiresMaintenance && item.maintenanceIntervalDays == null) {
    ctx.addIssue({
      code: "custom",
      path: ["maintenanceIntervalDays"],
      message: "Say how often it needs maintenance.",
    });
  }
}

/** Normalises the fields that only mean something together. */
function normaliseItem<T extends ItemFields>(item: T): T {
  return {
    ...item,
    custodianUserId:
      item.location === "custodian_home" ? item.custodianUserId : null,
    maintenanceIntervalDays: item.requiresMaintenance
      ? item.maintenanceIntervalDays
      : null,
  };
}

/** A new item, added directly by a captain or a lead of its team. */
export const InventoryItemInput = z
  .object(itemFields)
  .superRefine(checkItem)
  .transform(normaliseItem);
export type InventoryItemInput = z.infer<typeof InventoryItemInput>;

/** A direct edit, compare-and-set on the version the editor opened. */
export const EditInventoryItemInput = z
  .object({
    ...itemFields,
    itemId: RowId,
    expectedVersion: z.number().int().min(1),
  })
  .superRefine(checkItem)
  .transform(normaliseItem);
export type EditInventoryItemInput = z.infer<typeof EditInventoryItemInput>;

// --- Proposals ---------------------------------------------------------------

/**
 * A member's proposed change: the count, the condition, where it is, and
 * whether maintenance was done. A captain or a lead of the item's team
 * approves it.
 */
export const InventoryProposalInput = z
  .object({
    itemId: RowId,
    quantity: Count,
    condition: InventoryCondition,
    location: InventoryLocation,
    custodianUserId: MemberId.nullish(),
    storageLocation: optionalText(80, "Keep the spot under 80 characters."),
    maintenanceDone: z.boolean().default(false),
    note: optionalText(300, "Keep the note under 300 characters."),
  })
  .superRefine((p, ctx) => {
    if (p.location === "custodian_home" && !p.custodianUserId) {
      ctx.addIssue({
        code: "custom",
        path: ["custodianUserId"],
        message: "Say whose home it is at.",
      });
    }
  })
  .transform((p) => ({
    ...p,
    custodianUserId: p.location === "custodian_home" ? p.custodianUserId : null,
  }));
export type InventoryProposalInput = z.infer<typeof InventoryProposalInput>;

/** Approving or rejecting a pending proposal. */
export const InventoryReviewInput = z.object({
  updateId: RowId,
  decision: z.enum(["approved", "rejected"]),
  reviewNote: optionalText(300, "Keep the note under 300 characters."),
});
export type InventoryReviewInput = z.infer<typeof InventoryReviewInput>;

// --- Needs and pledges ---------------------------------------------------------

const needFields = {
  team: Team,
  name: z
    .string()
    .trim()
    .min(1, "Name what is needed.")
    .max(80, "Keep the name under 80 characters."),
  quantity: PositiveCount,
  /** The camp's own item that covers it, when there is one. */
  itemId: RowId.nullish(),
  /** How many were bought for it. */
  boughtQuantity: Count.default(0),
  note: optionalText(300, "Keep the note under 300 characters."),
};

/** A team's need for this year. */
export const InventoryNeedInput = z.object(needFields);
export type InventoryNeedInput = z.infer<typeof InventoryNeedInput>;

export const EditInventoryNeedInput = z.object({
  ...needFields,
  needId: RowId,
  expectedVersion: z.number().int().min(1),
});
export type EditInventoryNeedInput = z.infer<typeof EditInventoryNeedInput>;

/** "I'm bringing 2 camping chairs": a member's pledge against a need. */
export const InventoryPledgeInput = z.object({
  needId: RowId,
  quantity: PositiveCount,
  note: optionalText(200, "Keep the note under 200 characters."),
});
export type InventoryPledgeInput = z.infer<typeof InventoryPledgeInput>;

// --- Bookings ------------------------------------------------------------------

export const InventoryBookingInput = z.object({
  itemId: RowId,
  note: optionalText(200, "Keep the note under 200 characters."),
});
export type InventoryBookingInput = z.infer<typeof InventoryBookingInput>;

// --- Loans ---------------------------------------------------------------------

/**
 * Gear lent to another camp on site. The borrower is their CAMP's name and
 * site address only: never a person's name or phone number. The address is
 * enough to walk over and ask for it back. There is no free-text note, so
 * there is nowhere to type a name.
 */
export const InventoryLoanInput = z.object({
  itemId: RowId,
  quantity: PositiveCount,
  borrowerCamp: z
    .string()
    .trim()
    .min(1, "Name the camp that borrowed it.")
    .max(80, "Keep the camp's name under 80 characters."),
  borrowerAddress: z
    .string()
    .trim()
    .min(1, "Give the camp's site address.")
    .max(80, "Keep the address under 80 characters."),
});
export type InventoryLoanInput = z.infer<typeof InventoryLoanInput>;
