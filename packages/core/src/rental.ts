import {
  ViewerRank,
  type ParticipationStatus,
  type RentalChoice,
  type RentalOrderStatus,
  type RentalTentChoice,
  type RentalSource,
} from "@camp404/types";
import { sumMinor } from "./money";

// Gear rental (#241): the year's sleeping gear, each member's order, and what
// the camp takes out of storage or orders from the supplier. Pure: no DB, no
// session, no next/*.
//
// WHO. A member says what they need, for themselves only, and reads only their
// own order. A captain sets the catalogue and its prices, decides for each
// item on an order whether it comes from the camp's stock or the supplier,
// confirms the order and reads every order. Nobody else: this is member money
// data, so a team lead gets nothing extra (the issue's rule, kept over the
// team-tools rule). The rule fails closed on a rank this module does not know.
// Each write re-reads the actor's rank and led teams inside its own
// transaction and passes those here.
//
// MONEY. Whole rand cents, ZAR only (packages/core/src/money.ts). Both sources
// have a price, set by a captain (owner, 2026-09-30). A member sees a range
// until a captain picks the source; the confirmed order keeps the price it was
// confirmed at, so a later price change never moves a confirmed order.
//
// CAMP STOCK. Optional per item (owner, 2026-09-30: only the camp's tents and
// some mattresses): an item the camp has some of carries a camp price AND how
// many the camp has. An item without it comes from the supplier only. A
// captain can never give out more than the camp has: what confirmed orders
// already took, plus an adoptee reserve kept from camp stock, counts against
// the number. The camp's Inventory is not priced and is not linked here.

function isViewerRank(rank: string): rank is ViewerRank {
  return ViewerRank.safeParse(rank).success;
}

/**
 * Whether someone may run gear rental: set the catalogue, read every order,
 * confirm and reopen orders, and label tents. A captain only. `ledTeams` (the
 * team keys they lead this year) is taken and not used yet, so letting the
 * Finance leads in later is a change here and nowhere else.
 */
export function canManageRental(
  rank: string,
  _ledTeams: readonly string[],
): boolean {
  if (!isViewerRank(rank)) return false;
  return rank === "captain";
}

// --- Asking everyone ---------------------------------------------------------
//
// A captain's "Ask everyone" is a nudge on the app's gate spine, never a block:
// one NON-blocking `required_actions` row per member (this key), and a notice.
// The row is completed when the member's order is sent.

/** The `required_actions.action_key` of the gear order nudge. */
export const GEAR_ORDER_ACTION_KEY = "gear_order";
/** What the member is asked to do, in their words. */
export const GEAR_ORDER_ACTION_TITLE = "Say what sleeping gear you need";
/** The `ref_type` of the notice, which opens My gear. */
export const GEAR_ORDER_REF_TYPE = "gear_order";

/**
 * Who "Ask everyone" asks: a member who is coming this year. That is a member
 * who said Yes (`applied`) or whom a captain accepted (`accepted`). Not one
 * who said Maybe or No, not one on the waiting list, and not one who has not
 * answered "Coming this year?" at all.
 */
export function isAskedForGear(status: ParticipationStatus | null): boolean {
  return status === "applied" || status === "accepted";
}

// --- Words -------------------------------------------------------------------

export const RENTAL_SOURCE_LABELS: Readonly<Record<RentalSource, string>> = {
  camp: "Camp stock",
  supplier: "Supplier",
};

export const RENTAL_CHOICE_LABELS: Readonly<Record<RentalChoice, string>> = {
  own: "I have my own",
  need: "I need one",
};

/** An order's state as people read it. Charged is a confirmed order on the dues. */
export type RentalOrderState = RentalOrderStatus | "charged";

export const RENTAL_STATE_LABELS: Readonly<Record<RentalOrderState, string>> = {
  draft: "Draft",
  submitted: "Sent",
  confirmed: "Confirmed",
  charged: "Charged",
};

/**
 * The state an order shows: draft, sent, confirmed (nothing to pay), or
 * charged (confirmed, with its charge on the member's dues).
 */
export function rentalOrderState(order: {
  status: RentalOrderStatus;
  chargeId: string | null;
}): RentalOrderState {
  if (order.status === "confirmed" && order.chargeId !== null) return "charged";
  return order.status;
}

// --- The catalogue -----------------------------------------------------------

/** A catalogue item as the rules need it. */
export interface RentalPricedItem {
  id: string;
  name: string;
  isTent: boolean;
  sleeps: number;
  /** The camp's price, and how many the camp has: both, or neither. */
  campPriceCents: number | null;
  campStockCount: number | null;
  supplierPriceCents: number | null;
}

type ItemSources = Pick<
  RentalPricedItem,
  "campPriceCents" | "campStockCount" | "supplierPriceCents"
>;

/**
 * An item's price from one source, or null when that source has none. Camp
 * stock needs both its price and its count.
 */
export function rentalPrice(
  item: ItemSources,
  source: RentalSource,
): number | null {
  if (source === "supplier") return item.supplierPriceCents;
  return item.campStockCount === null ? null : item.campPriceCents;
}

/** The sources an item can come from: the ones it has. */
export function rentalSources(item: ItemSources): RentalSource[] {
  return (["camp", "supplier"] as const).filter(
    (source) => rentalPrice(item, source) !== null,
  );
}

// --- A member's order ----------------------------------------------------------
//
// THE TENT IS ASKED ONCE (owner, 2026-09-30). The member's form is not built
// from the catalogue's tents: a member answers one tent question, whatever
// tents the camp rents out. "I have my own" (what it is, how many it sleeps),
// "I need one" (for how many people), or "I'm in someone else's tent". A
// captain picks the actual tent, and its source, when they confirm. Every
// other item (a mattress, a sleeping bag) is still one row per catalogue
// item, because there the row and the answer describe the same thing.
//
// WHO IS IN WHOSE TENT has one source of truth: the list of sharers on the
// order of the member whose tent it is. "I'm in someone else's tent" names
// nobody, so it cannot disagree with that list. A sent order is refused when
// it would make two orders disagree (tentConflict below).

/** The member's tent answer as they send it. */
export type RentalTentDraft =
  | {
      choice: "own";
      /** What it is, and how many it sleeps. Both optional. */
      ownDescription?: string | null;
      ownSleeps?: number | null;
      sharerIds: readonly string[];
    }
  | {
      choice: "need";
      /** How many people it is for, the member included. */
      people: number;
      sharerIds: readonly string[];
    }
  | { choice: "shared" };

/** The tent answer as checkRentalOrder leaves it: every field present. */
export interface RentalTentChecked {
  choice: RentalTentChoice;
  people: number | null;
  ownDescription: string | null;
  ownSleeps: number | null;
  sharerIds: string[];
}

/** One line of a member's order as they send it: an item that is not a tent. */
export interface RentalLineDraft {
  itemId: string;
  choice: RentalChoice;
  quantity: number;
}

export const RENTAL_ITEM_GONE =
  "One of those items isn't on this year's list any more. Reload the page.";
export const RENTAL_NOT_WITH_YOURSELF = "You can't share a tent with yourself.";

/** Said when a tent is given more sharers than it holds. */
export function tooManySharers(fits: number): string {
  return fits === 0
    ? "That tent is for one person. Say it is for more people to share it."
    : `That tent fits ${fits} more ${fits === 1 ? "person" : "people"}.`;
}

/** How many people besides the member a tent answer has room for. */
export function tentRoom(tent: {
  choice: RentalTentChoice;
  people?: number | null;
  ownSleeps?: number | null;
}): number {
  if (tent.choice === "need") return Math.max(0, (tent.people ?? 1) - 1);
  if (tent.choice === "own") return Math.max(0, (tent.ownSleeps ?? 1) - 1);
  return 0;
}

/**
 * A member's order checked against the year's live catalogue and tidied. The
 * tent answer: its sharers once each, never the member, never more than it
 * has room for; someone in another member's tent lists nobody. The lines: an
 * item on the list that is NOT a tent, once each; one they have themselves is
 * one. An error is a sentence the member can act on.
 */
export function checkRentalOrder(
  items: readonly RentalPricedItem[],
  order: {
    tent: RentalTentDraft | null;
    lines: readonly RentalLineDraft[];
  },
  memberId: string,
):
  | { ok: true; tent: RentalTentChecked | null; lines: RentalLineDraft[] }
  | { ok: false; error: string } {
  const byId = new Map(items.map((item) => [item.id, item]));
  const seen = new Set<string>();
  const lines: RentalLineDraft[] = [];
  for (const line of order.lines) {
    const item = byId.get(line.itemId);
    // A tent is never a line: the member does not pick one.
    if (!item || item.isTent || seen.has(line.itemId)) {
      return { ok: false, error: RENTAL_ITEM_GONE };
    }
    seen.add(line.itemId);
    lines.push({
      itemId: item.id,
      choice: line.choice,
      quantity: line.choice === "own" ? 1 : line.quantity,
    });
  }

  const draft = order.tent;
  if (draft === null) return { ok: true, tent: null, lines };
  if (draft.choice === "shared") {
    return {
      ok: true,
      tent: {
        choice: "shared",
        people: null,
        ownDescription: null,
        ownSleeps: null,
        sharerIds: [],
      },
      lines,
    };
  }
  const sharerIds = [...new Set(draft.sharerIds)];
  if (sharerIds.includes(memberId)) {
    return { ok: false, error: RENTAL_NOT_WITH_YOURSELF };
  }
  const fits = tentRoom(draft);
  if (sharerIds.length > fits) {
    return { ok: false, error: tooManySharers(fits) };
  }
  return {
    ok: true,
    tent:
      draft.choice === "own"
        ? {
            choice: "own",
            people: null,
            ownDescription: draft.ownDescription?.trim() || null,
            ownSleeps: draft.ownSleeps ?? null,
            sharerIds,
          }
        : {
            choice: "need",
            people: draft.people,
            ownDescription: null,
            ownSleeps: null,
            sharerIds,
          },
    lines,
  };
}

/** What the writer knows about one person a sent order names as a sharer. */
export interface SharerStanding {
  name: string;
  /** Their own sent or confirmed order says they have a tent or need one. */
  hasOwnAnswer: boolean;
  /** Another member's sent or confirmed order already has them in its tent. */
  inAnotherTent: boolean;
}

/** Said to a member another member already has in their tent. */
export function hostedElsewhere(hostName: string): string {
  return `${hostName} has put you in their tent. Pick "I'm in someone else's tent", or ask them to take you off first.`;
}

/**
 * Why a SENT order would make two orders disagree about a tent, or null when
 * it does not. A member in someone's tent cannot also have their own or need
 * one; a sharer cannot have their own answer, nor be in two tents. A draft is
 * not checked: it counts for nothing until it is sent.
 */
export function tentConflict(input: {
  tent: Pick<RentalTentChecked, "choice"> | null;
  /** The member whose sent or confirmed order has this member in its tent. */
  hostName: string | null;
  sharers: readonly SharerStanding[];
}): string | null {
  const choice = input.tent?.choice;
  if (choice !== "own" && choice !== "need") return null;
  if (input.hostName !== null) return hostedElsewhere(input.hostName);
  for (const sharer of input.sharers) {
    if (sharer.hasOwnAnswer) {
      return `${sharer.name} says they have their own tent or need one. Ask them to pick "I'm in someone else's tent" first.`;
    }
    if (sharer.inAnotherTent) {
      return `${sharer.name} is already in someone else's tent.`;
    }
  }
  return null;
}

/** Whether a catalogue tent sleeps the people a member needs it for. */
export function tentSleepsEnough(
  item: Pick<RentalPricedItem, "sleeps">,
  people: number | null,
): boolean {
  return people === null || item.sleeps >= people;
}

/**
 * What a member's order may cost before a captain decides: the cheapest and
 * the dearest it can come to at today's prices. A needed tent is a range
 * across every tent the camp rents out and both sources, because a captain
 * picks the tent; an item is a range across its sources.
 */
export function rentalEstimate(
  items: readonly RentalPricedItem[],
  order: {
    tent: Pick<RentalTentChecked, "choice"> | null;
    lines: readonly Pick<RentalLineDraft, "itemId" | "choice" | "quantity">[];
  },
): { lowCents: number; highCents: number } {
  const byId = new Map(items.map((item) => [item.id, item]));
  const low: number[] = [];
  const high: number[] = [];
  const pricesOf = (item: RentalPricedItem) =>
    rentalSources(item).map((s) => rentalPrice(item, s)!);
  if (order.tent?.choice === "need") {
    const prices = items.filter((i) => i.isTent).flatMap(pricesOf);
    if (prices.length > 0) {
      low.push(Math.min(...prices));
      high.push(Math.max(...prices));
    }
  }
  for (const line of order.lines) {
    if (line.choice !== "need") continue;
    const item = byId.get(line.itemId);
    if (!item || item.isTent) continue;
    const prices = pricesOf(item);
    if (prices.length === 0) continue;
    low.push(Math.min(...prices) * line.quantity);
    high.push(Math.max(...prices) * line.quantity);
  }
  return { lowCents: sumMinor(low), highCents: sumMinor(high) };
}

// --- A captain's confirmation ---------------------------------------------------

/** A stored line as the confirmation reads it. */
export interface RentalLineToPrice {
  id: string;
  itemId: string;
  choice: RentalChoice;
  quantity: number;
}

export interface RentalPricedLine {
  lineId: string;
  itemName: string;
  quantity: number;
  source: RentalSource;
  unitPriceCents: number;
  lineCents: number;
}

export const RENTAL_PICK_A_TENT =
  "Pick the tent this member gets, and where it comes from.";
export const RENTAL_NOT_A_TENT =
  "That isn't a tent on this year's list. Reload the page.";
export const RENTAL_PICK_EVERY_SOURCE =
  "Pick camp stock or the supplier for every item this member needs.";

/** Said when the source a captain picked is one the item does not have. */
export function noPriceFrom(name: string, source: RentalSource): string {
  return source === "camp"
    ? `The camp has no ${name} of its own. Pick the supplier, or add camp stock to it in the catalogue.`
    : `${name} has no supplier price. Pick camp stock, or set a price in the catalogue.`;
}

/**
 * How many of an item's camp stock are spoken for: what confirmed orders took
 * (`takenByOrders`) plus an adoptee reserve kept from camp stock.
 */
export function campStockTaken(
  item: { reserveCount: number; reserveSource: RentalSource },
  takenByOrders: number,
): number {
  return (
    takenByOrders + (item.reserveSource === "camp" ? item.reserveCount : 0)
  );
}

/** Said when a captain gives out more camp stock than is left. */
export function notEnoughCampStock(
  name: string,
  has: number,
  left: number,
): string {
  const spare = Math.max(0, left);
  return `The camp has ${has} of ${name} and ${spare === 0 ? "none are" : spare === 1 ? "only 1 is" : `only ${spare} are`} left. Pick the supplier, or raise the count in the catalogue.`;
}

/** Said when a catalogue change would leave less camp stock than is given out. */
export function campStockInUse(name: string, taken: number): string {
  return `${taken} of ${name} ${taken === 1 ? "is" : "are"} already given out or kept in reserve from camp stock. The camp can't have fewer than that.`;
}

/**
 * Price an order from the sources a captain picked: every needed line must
 * have exactly one source, and the item must have that source today. Camp
 * stock is refused when the item has none, and when the order asks for more
 * than is left: `campTaken` is what is already spoken for per item (other
 * confirmed orders and a camp reserve; campStockTaken). Lines the member has
 * themselves are left out. The total is a plain rand total.
 */
export function priceRentalOrder(
  items: readonly RentalPricedItem[],
  lines: readonly RentalLineToPrice[],
  sources: readonly { lineId: string; source: RentalSource }[],
  campTaken: ReadonlyMap<string, number> = new Map(),
):
  | { ok: true; lines: RentalPricedLine[]; totalCents: number }
  | { ok: false; error: string } {
  const byId = new Map(items.map((item) => [item.id, item]));
  const picked = new Map(sources.map((s) => [s.lineId, s.source]));
  // In the catalogue's own order (tents first), whatever order they came in.
  const at = new Map(items.map((item, index) => [item.id, index]));
  const needed = lines
    .filter((line) => line.choice === "need")
    .sort((a, b) => (at.get(a.itemId) ?? 0) - (at.get(b.itemId) ?? 0));
  if (
    picked.size !== sources.length ||
    picked.size !== needed.length ||
    needed.some((line) => !picked.has(line.id))
  ) {
    return { ok: false, error: RENTAL_PICK_EVERY_SOURCE };
  }
  const priced: RentalPricedLine[] = [];
  for (const line of needed) {
    const item = byId.get(line.itemId);
    if (!item) return { ok: false, error: RENTAL_ITEM_GONE };
    const source = picked.get(line.id)!;
    const unitPriceCents = rentalPrice(item, source);
    if (unitPriceCents === null) {
      return { ok: false, error: noPriceFrom(item.name, source) };
    }
    if (source === "camp" && item.campStockCount !== null) {
      const left = item.campStockCount - (campTaken.get(item.id) ?? 0);
      if (line.quantity > left) {
        return {
          ok: false,
          error: notEnoughCampStock(item.name, item.campStockCount, left),
        };
      }
    }
    priced.push({
      lineId: line.id,
      itemName: item.name,
      quantity: line.quantity,
      source,
      unitPriceCents,
      lineCents: unitPriceCents * line.quantity,
    });
  }
  return {
    ok: true,
    lines: priced,
    totalCents: sumMinor(priced.map((line) => line.lineCents)),
  };
}

/** The charge's words on the member's dues: "Gear rental: 1 × Tent, 2 × Mattress". */
export function rentalChargeDescription(
  lines: readonly Pick<RentalPricedLine, "itemName" | "quantity">[],
): string {
  const text = `Gear rental: ${lines
    .map((line) => `${line.quantity} × ${line.itemName}`)
    .join(", ")}`;
  return text.length > 200 ? `${text.slice(0, 199)}…` : text;
}

// --- The captain's summary -------------------------------------------------------

/** A catalogue item as the summary needs it. */
export interface RentalSummaryItem {
  id: string;
  name: string;
  /** How many the camp has; null when it has none of its own. */
  campStockCount: number | null;
  reserveCount: number;
  reserveSource: RentalSource;
}

/** One confirmed, needed line. */
export interface RentalConfirmedLine {
  itemId: string;
  quantity: number;
  source: RentalSource;
  unitPriceCents: number;
}

export interface RentalSummaryRow {
  itemId: string;
  name: string;
  /** Members' confirmed items from each source. */
  campCount: number;
  supplierCount: number;
  /** Spare ones for the adoptees, and where they come from. */
  reserveCount: number;
  reserveSource: RentalSource;
  /** What comes out of the camp's storage: members' plus a camp reserve. */
  fromStorage: number;
  /** What the camp orders from the supplier: members' plus a supplier reserve. */
  toOrder: number;
  /** How many the camp has, and how many of those are not spoken for. */
  campStockCount: number | null;
  campStockLeft: number | null;
  /** What members are charged for this item, by source. */
  campCents: number;
  supplierCents: number;
}

export interface RentalSummary {
  rows: RentalSummaryRow[];
  fromStorage: number;
  toOrder: number;
  campCents: number;
  supplierCents: number;
  /** Everything members are charged: the two sources together. */
  chargedCents: number;
}

/**
 * The year's totals by item across the confirmed orders, split by source, with
 * the adoptee reserve added to the source it comes from. The supplier column
 * is what the camp orders; the camp stock column is what comes out of storage.
 * Items keep the order they are given in.
 */
export function rentalSummary(
  items: readonly RentalSummaryItem[],
  lines: readonly RentalConfirmedLine[],
): RentalSummary {
  const rows = items.map((item): RentalSummaryRow => {
    const mine = lines.filter((line) => line.itemId === item.id);
    const from = (source: RentalSource) =>
      mine.filter((line) => line.source === source);
    const count = (source: RentalSource) =>
      from(source).reduce((n, line) => n + line.quantity, 0);
    const cents = (source: RentalSource) =>
      sumMinor(from(source).map((line) => line.unitPriceCents * line.quantity));
    const campCount = count("camp");
    const supplierCount = count("supplier");
    const fromStorage = campStockTaken(item, campCount);
    return {
      itemId: item.id,
      name: item.name,
      campCount,
      supplierCount,
      reserveCount: item.reserveCount,
      reserveSource: item.reserveSource,
      fromStorage,
      campStockCount: item.campStockCount,
      campStockLeft:
        item.campStockCount === null ? null : item.campStockCount - fromStorage,
      toOrder:
        supplierCount +
        (item.reserveSource === "supplier" ? item.reserveCount : 0),
      campCents: cents("camp"),
      supplierCents: cents("supplier"),
    };
  });
  const campCents = sumMinor(rows.map((row) => row.campCents));
  const supplierCents = sumMinor(rows.map((row) => row.supplierCents));
  return {
    rows,
    fromStorage: rows.reduce((n, row) => n + row.fromStorage, 0),
    toOrder: rows.reduce((n, row) => n + row.toOrder, 0),
    campCents,
    supplierCents,
    chargedCents: campCents + supplierCents,
  };
}
