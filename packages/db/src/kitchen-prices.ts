import { and, eq } from "drizzle-orm";
import { canPriceShoppingList, isCurrency } from "@camp404/core";
import {
  MAX_LINE_PRICE_CENTS,
  PRICE_KINDS,
  SHOP_NAME_MAX,
  type PriceKind,
} from "@camp404/types";
import { writeAuditEvent, type DbOrTx } from "./audit";
import { lockSenderReach } from "./broadcasts";
import { currentCycleNumber } from "./cycles";
import { createHttpDb, withTransaction, type Tx } from "./index";
import { reachRank } from "./power";
import * as schema from "./schema";

// The shopping list's shops and prices (#245; the owner approved Option A of
// design/kitchen-prices.html, 2026-10-02). A captain or a Kitchen lead gives a
// line a shop and a price for the whole amount on it, and says whether it is
// an estimate or what was paid. Rands only, whole cents: the Currency rule is
// checked here again (strict: "zar" is refused) and by the table's CHECK.
//
// Members are never sent a price: the one read takes the viewer and answers
// null for anyone but a captain or a Kitchen lead, checked here on the
// server, not in the page. The write re-reads and locks the actor's rank and
// led teams inside its own transaction, is compare-and-set on the line's
// `version`, and writes its audit row in the same transaction.
//
// PGlite has ONE connection: everything inside a transaction goes through
// `tx`, never createHttpDb().

export type PriceWriteResult<T = object> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

export const NOT_A_PRICE_KEEPER =
  "Only a Kitchen lead or a captain can set shops and prices.";
export const PRICE_CHANGED =
  "Someone changed this line first. Reload the page to see their shop and price.";
export const PRICE_RANDS_ONLY = "Prices are in rands (ZAR) only.";
export const PRICE_BAD_AMOUNT = "Type the price in rands, like 96,00.";
export const PRICE_BAD_LINE = "That line isn't on the list. Reload the page.";

/** One line's shop and price. */
export interface ShoppingPrice {
  key: string;
  shop: string | null;
  amountCents: number | null;
  kind: PriceKind;
  /** Compare-and-set: the version an edit names. */
  version: number;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const isKind = (kind: string): kind is PriceKind =>
  (PRICE_KINDS as readonly string[]).includes(kind);

/** A year's prices, read through `db`. No viewer check: callers gate. */
export async function readShoppingPrices(
  db: DbOrTx,
  cycle: number,
): Promise<ShoppingPrice[]> {
  const rows = await db
    .select({
      key: schema.kitchenShoppingPrices.itemKey,
      shop: schema.kitchenShoppingPrices.shop,
      amountCents: schema.kitchenShoppingPrices.amountCents,
      kind: schema.kitchenShoppingPrices.priceKind,
      version: schema.kitchenShoppingPrices.version,
    })
    .from(schema.kitchenShoppingPrices)
    .where(eq(schema.kitchenShoppingPrices.cycle, cycle));
  return rows.map((r) => ({
    ...r,
    kind: isKind(r.kind) ? r.kind : "estimate",
  }));
}

/** Whether someone is a captain or a Kitchen lead now, read on the server. */
export async function mayPrice(db: DbOrTx, viewerId: string): Promise<boolean> {
  if (!UUID.test(viewerId)) return false;
  const reach = await lockSenderReach(db, viewerId);
  return canPriceShoppingList(reachRank(reach), reach ?? []);
}

/**
 * This year's prices for a viewer: every line's shop and price for a captain
 * or a Kitchen lead, and null for anyone else, who is never sent a price.
 */
export async function getShoppingPricesFor(
  viewerId: string,
): Promise<ShoppingPrice[] | null> {
  const db = createHttpDb();
  if (!(await mayPrice(db, viewerId))) return null;
  return readShoppingPrices(db, await currentCycleNumber(db));
}

class Refused extends Error {
  constructor(readonly sentence: string) {
    super(sentence);
    this.name = "Refused";
  }
}

/** A line's key names an ingredient and its unit, or a snack. */
function isLineKey(key: string): boolean {
  return (
    key.length > 0 &&
    key.length <= 300 &&
    (key.includes("|") || /^snack:[0-9a-f-]{36}$/i.test(key))
  );
}

/**
 * Sets a line's shop and price for this year. `expectedVersion` is the
 * version the editor saw (0: the line had none); a change someone made in
 * between is refused, never overwritten.
 */
export async function setShoppingPrice(input: {
  actorId: string;
  key: string;
  shop: string | null;
  amountCents: number | null;
  kind: PriceKind;
  currency: string;
  expectedVersion: number;
}): Promise<PriceWriteResult<{ version: number }>> {
  if (!isCurrency(input.currency))
    return { ok: false, error: PRICE_RANDS_ONLY };
  if (
    input.amountCents !== null &&
    (!Number.isSafeInteger(input.amountCents) ||
      input.amountCents < 0 ||
      input.amountCents > MAX_LINE_PRICE_CENTS)
  ) {
    return { ok: false, error: PRICE_BAD_AMOUNT };
  }
  if (!isLineKey(input.key)) return { ok: false, error: PRICE_BAD_LINE };
  const shop = input.shop?.trim().slice(0, SHOP_NAME_MAX) || null;
  const kind: PriceKind = isKind(input.kind) ? input.kind : "estimate";
  try {
    return await withTransaction(async (tx: Tx) => {
      if (!(await mayPrice(tx, input.actorId))) {
        throw new Refused(NOT_A_PRICE_KEEPER);
      }
      const cycle = await currentCycleNumber(tx);
      const where = and(
        eq(schema.kitchenShoppingPrices.cycle, cycle),
        eq(schema.kitchenShoppingPrices.itemKey, input.key),
      );
      const [row] = await tx
        .select()
        .from(schema.kitchenShoppingPrices)
        .where(where)
        .for("update");
      if ((row?.version ?? 0) !== input.expectedVersion) {
        throw new Refused(PRICE_CHANGED);
      }
      const values = {
        shop,
        amountCents: input.amountCents,
        currency: "ZAR" as const,
        priceKind: kind,
        updatedByUserId: input.actorId,
        updatedAt: new Date(),
      };
      const written = row
        ? await tx
            .update(schema.kitchenShoppingPrices)
            .set({ ...values, version: row.version + 1 })
            .where(
              and(
                where,
                eq(schema.kitchenShoppingPrices.version, input.expectedVersion),
              ),
            )
            .returning({ version: schema.kitchenShoppingPrices.version })
        : await tx
            .insert(schema.kitchenShoppingPrices)
            .values({ cycle, itemKey: input.key, ...values })
            .onConflictDoNothing()
            .returning({ version: schema.kitchenShoppingPrices.version });
      if (written.length === 0) throw new Refused(PRICE_CHANGED);
      await writeAuditEvent(tx, {
        actorId: input.actorId,
        action: "camp.kitchen_price.set",
        target: "kitchen",
        metadata: {
          cycle,
          key: input.key,
          shop,
          amountCents: input.amountCents,
          kind,
          from: row
            ? {
                shop: row.shop,
                amountCents: row.amountCents,
                kind: row.priceKind,
              }
            : null,
        },
      });
      return { ok: true as const, version: written[0]!.version };
    });
  } catch (error) {
    if (error instanceof Refused) return { ok: false, error: error.sentence };
    throw error;
  }
}
