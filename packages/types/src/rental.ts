import { z } from "zod";

// Gear rental (#241): the year's catalogue of sleeping gear, each member's
// order, and what a captain decides when they confirm it. The shapes a form or
// a server action sends. Money is whole rand cents: a screen turns what
// someone typed into cents with parseMoneyToMinor (@camp404/core) before it
// sends. Who may write is the server's rule (canManageRental in
// @camp404/core), never this shape's.

/**
 * An order's stored state. "Charged" is not stored: it is a confirmed order
 * with a charge on the member's dues (rentalOrderState in @camp404/core).
 */
export const RENTAL_ORDER_STATUSES = [
  "draft",
  "submitted",
  "confirmed",
] as const;
export const RentalOrderStatus = z.enum(RENTAL_ORDER_STATUSES);
export type RentalOrderStatus = z.infer<typeof RentalOrderStatus>;

/** What a member says about one item: they have their own, or they need one. */
export const RENTAL_CHOICES = ["own", "need"] as const;
export const RentalChoice = z.enum(RENTAL_CHOICES, {
  error: "Say whether you have your own or need one.",
});
export type RentalChoice = z.infer<typeof RentalChoice>;

/** Where a needed item comes from: the camp's own stock, or the supplier. */
export const RENTAL_SOURCES = ["camp", "supplier"] as const;
export const RentalSource = z.enum(RENTAL_SOURCES, {
  error: "Pick camp stock or the supplier.",
});
export type RentalSource = z.infer<typeof RentalSource>;

/** The longest text each field takes. */
export const RENTAL_ITEM_NAME_MAX = 60;
export const TENT_LABEL_MAX = 20;
/** The most of one item a member may ask for. */
export const RENTAL_MAX_QUANTITY = 10;
/** The most people one tent sleeps. */
export const RENTAL_MAX_SLEEPS = 12;
/** The most items one year's catalogue may have. */
export const RENTAL_MAX_ITEMS = 30;
/** The most of one item the camp's own stock may hold. */
export const RENTAL_MAX_STOCK = 500;
/** The most an item's adoptee reserve may be. */
export const RENTAL_MAX_RESERVE = 200;

const RowId = z.guid();
/**
 * A member's id. Not checked as a uuid here: the E2E test store names its
 * members otherwise, and the database refuses an id that is not one.
 */
const RefId = z.string().trim().min(1).max(64);

/** A price someone typed, already parsed: whole cents, zero or more. */
const Price = z
  .number({ error: "Type a price in rands." })
  .int({ error: "Type a price in rands, like 450 or 450,50." })
  .min(0, { error: "A price can't be below R0." })
  .max(100_000_000, { error: "That price is too large." });

/**
 * One catalogue item as a captain types it. Camp stock is optional per item
 * (owner, 2026-09-30: only the camp's tents and some mattresses): when the
 * camp has some, it has a price AND a count, together; when it has none, both
 * are null and the item can only come from the supplier.
 */
export const RentalItemInput = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, { error: "Give the item a name." })
      .max(RENTAL_ITEM_NAME_MAX, {
        error: `Keep the name to ${RENTAL_ITEM_NAME_MAX} characters.`,
      }),
    /** A tent gets a label and, when it sleeps more than one, sharers. */
    isTent: z.boolean(),
    sleeps: z
      .number()
      .int()
      .min(1, { error: "A tent sleeps at least one." })
      .max(RENTAL_MAX_SLEEPS, {
        error: `A tent sleeps at most ${RENTAL_MAX_SLEEPS}.`,
      }),
    /** Null: the camp has none of its own. */
    campPriceCents: Price.nullable(),
    /** How many the camp has. Null exactly when the camp price is. */
    campStockCount: z
      .number({ error: "Say how many the camp has." })
      .int({ error: "Say how many the camp has, as a whole number." })
      .min(1, { error: "Say how many the camp has: at least 1." })
      .max(RENTAL_MAX_STOCK, {
        error: `The camp has at most ${RENTAL_MAX_STOCK} of one item.`,
      })
      .nullable(),
    /** Null: the supplier does not rent it. */
    supplierPriceCents: Price.nullable(),
    /** Spare ones set aside for the adoptees. */
    reserveCount: z
      .number()
      .int()
      .min(0)
      .max(RENTAL_MAX_RESERVE, {
        error: `A reserve is at most ${RENTAL_MAX_RESERVE}.`,
      }),
    reserveSource: RentalSource,
  })
  .refine((v) => v.isTent || v.sleeps === 1, {
    error: "Only a tent sleeps more than one.",
    path: ["sleeps"],
  })
  .refine((v) => (v.campPriceCents === null) === (v.campStockCount === null), {
    error: "Camp stock needs both a price and how many the camp has.",
    path: ["campStockCount"],
  })
  .refine((v) => v.campPriceCents !== null || v.supplierPriceCents !== null, {
    error: "Give a supplier price, or say the camp has some.",
    path: ["supplierPriceCents"],
  })
  .refine(
    (v) =>
      v.reserveCount === 0 ||
      (v.reserveSource === "camp"
        ? v.campStockCount !== null
        : v.supplierPriceCents !== null),
    {
      error: "The reserve must come from a source this item has.",
      path: ["reserveSource"],
    },
  )
  .refine(
    (v) =>
      v.reserveSource !== "camp" ||
      v.campStockCount === null ||
      v.reserveCount <= v.campStockCount,
    {
      error: "The reserve can't be more than the camp has.",
      path: ["reserveCount"],
    },
  );
export type RentalItemInput = z.infer<typeof RentalItemInput>;

export const EditRentalItemInput = z.object({
  itemId: RowId,
  item: RentalItemInput,
});
export type EditRentalItemInput = z.infer<typeof EditRentalItemInput>;

export const ArchiveRentalItemInput = z.object({ itemId: RowId });

/** What a member says about one item. */
export const RentalLineInput = z.object({
  itemId: RowId,
  choice: RentalChoice,
  quantity: z
    .number()
    .int()
    .min(1, { error: "Ask for at least one." })
    .max(RENTAL_MAX_QUANTITY, {
      error: `Ask for at most ${RENTAL_MAX_QUANTITY}.`,
    }),
  /** Who shares a tent with them. Empty for anything but a shared tent. */
  sharerIds: z.array(RefId).max(RENTAL_MAX_SLEEPS * RENTAL_MAX_QUANTITY),
});
export type RentalLineInput = z.infer<typeof RentalLineInput>;

/**
 * A member's whole order as they save it: one line per item they answered.
 * `submit` sends it to the captains; otherwise it stays a draft.
 * `expectedVersion` is the order they saw (0 before their first save).
 */
export const SaveRentalOrderInput = z
  .object({
    lines: z.array(RentalLineInput).max(RENTAL_MAX_ITEMS),
    submit: z.boolean(),
    expectedVersion: z.number().int().min(0),
  })
  .refine(
    (v) => new Set(v.lines.map((l) => l.itemId)).size === v.lines.length,
    {
      error: "Each item can be on your order once.",
      path: ["lines"],
    },
  );
export type SaveRentalOrderInput = z.infer<typeof SaveRentalOrderInput>;

/** A member takes a sent order back to change it. */
export const WithdrawRentalOrderInput = z.object({
  expectedVersion: z.number().int().min(1),
});

/** A captain's confirmation: where each needed line comes from. */
export const ConfirmRentalOrderInput = z
  .object({
    orderId: RowId,
    expectedVersion: z.number().int().min(1),
    sources: z
      .array(z.object({ lineId: RowId, source: RentalSource }))
      .max(RENTAL_MAX_ITEMS),
  })
  .refine(
    (v) => new Set(v.sources.map((s) => s.lineId)).size === v.sources.length,
    { error: "Pick one source for each item.", path: ["sources"] },
  );
export type ConfirmRentalOrderInput = z.infer<typeof ConfirmRentalOrderInput>;

/** A captain reopens a confirmed order so it can change. */
export const ReopenRentalOrderInput = z.object({
  orderId: RowId,
  expectedVersion: z.number().int().min(1),
});

/** A captain labels a tent. Blank takes the label off. */
export const TentLabelInput = z.object({
  lineId: RowId,
  label: z
    .string()
    .trim()
    .max(TENT_LABEL_MAX, {
      error: `Keep the label to ${TENT_LABEL_MAX} characters.`,
    })
    .transform((v) => (v === "" ? null : v)),
});
export type TentLabelInput = z.infer<typeof TentLabelInput>;
