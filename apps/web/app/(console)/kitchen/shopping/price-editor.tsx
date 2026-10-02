"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { formatMoney, parseMoneyToMinor } from "@camp404/core";
import type { PriceKind } from "@camp404/types";
import { cn } from "@camp404/ui/lib/utils";
import { FilterToggle } from "@/components/kitchen/kit";
import { FIELD_LABEL } from "@/components/kitchen/labels";
import { UNREACHABLE } from "@/lib/recipe-copy";
import { setShoppingPriceAction } from "./actions";

// A shopping line's shop and price, for a captain or a Kitchen lead only (the
// owner's Option A of design/kitchen-prices.html, 2026-10-02): one grey line
// under the item's name ("Vlei Farm Stall · R 96,00 estimate", "paid", or "No
// shop or price yet"), and in the line's open panel, above "Comes from", the
// Shop, the Price and "This price is: An estimate / What we paid". Saved as
// you go: a box when you leave it, the choice when you tap it. The price is
// for the whole amount on the line, in rands. A problem with what was typed
// shows under the boxes. Members are never sent any of it.

export interface LinePrice {
  shop: string | null;
  amountCents: number | null;
  kind: PriceKind;
  /** The line's version; 0 when it has no shop or price yet. */
  version: number;
}

/** The grey line under the name. */
export function PriceLine({ price }: { price: LinePrice }) {
  if (!price.shop && price.amountCents === null) {
    return (
      <span className="mt-0.5 block text-xs font-medium text-warning">
        No shop or price yet
      </span>
    );
  }
  return (
    <span className="mt-0.5 block text-xs font-medium text-muted-foreground">
      {price.shop}
      {price.shop && " · "}
      {price.amountCents === null ? (
        <span className="text-warning">no price yet</span>
      ) : (
        <>
          <span className="tabular-nums">{formatMoney(price.amountCents)}</span>{" "}
          {price.kind === "paid" ? (
            <span className="text-success">paid</span>
          ) : (
            "estimate"
          )}
        </>
      )}
    </span>
  );
}

/** "96,00" for the price box; empty for no price. */
function priceText(cents: number | null): string {
  if (cents === null) return "";
  return (cents / 100).toFixed(2).replace(".", ",");
}

const BOX =
  "h-9 w-full border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-2 focus-visible:-outline-offset-1 focus-visible:outline-primary disabled:opacity-60";

/** The boxes in the open panel. Calls `onSaved` with what was saved. */
export function PriceEditor({
  lineKey,
  name,
  price,
  onSaved,
}: {
  lineKey: string;
  name: string;
  price: LinePrice;
  onSaved: (price: LinePrice) => void;
}) {
  const router = useRouter();
  const [shop, setShop] = useState(price.shop ?? "");
  const [amount, setAmount] = useState(priceText(price.amountCents));
  const [kind, setKind] = useState<PriceKind>(price.kind);
  const [error, setError] = useState<string | null>(null);
  // Saves go one after another, each with the version the last one returned,
  // and the boxes stay open to typing while one is on its way.
  const saved = useRef(price);
  const chain = useRef<Promise<void>>(Promise.resolve());
  const id = `price-${lineKey.replace(/[^a-z0-9]+/gi, "-")}`;

  async function send(next: { shop: string; amount: string; kind: PriceKind }) {
    const amountCents =
      next.amount.trim() === "" ? null : parseMoneyToMinor(next.amount);
    if (amountCents === null && next.amount.trim() !== "") {
      setError("Type the price in rands, like 96,00.");
      return;
    }
    const shopName = next.shop.trim() || null;
    const last = saved.current;
    if (
      shopName === last.shop &&
      amountCents === last.amountCents &&
      next.kind === last.kind
    ) {
      setError(null);
      return;
    }
    setError(null);
    try {
      const result = await setShoppingPriceAction({
        key: lineKey,
        shop: shopName,
        amountCents,
        kind: next.kind,
        currency: "ZAR",
        expectedVersion: last.version,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      const now = {
        shop: shopName,
        amountCents,
        kind: next.kind,
        version: result.data!.version,
      };
      saved.current = now;
      onSaved(now);
      router.refresh();
    } catch {
      setError(UNREACHABLE);
    }
  }

  function save(next: { shop: string; amount: string; kind: PriceKind }) {
    chain.current = chain.current.then(() => send(next));
    return chain.current;
  }

  return (
    <div className="mb-3 flex flex-col gap-1">
      <div className="grid grid-cols-1 gap-3 page-md:grid-cols-[minmax(0,1fr)_112px_auto] page-md:items-end">
        <label className="flex min-w-0 flex-col gap-1.5">
          <span className={FIELD_LABEL}>Shop</span>
          <input
            id={`${id}-shop`}
            className={BOX}
            value={shop}
            maxLength={80}
            placeholder="Where to buy it"
            aria-label={`Shop: ${name}`}
            onChange={(e) => setShop(e.target.value)}
            onBlur={() => void save({ shop, amount, kind })}
          />
        </label>
        <label className="flex flex-col gap-1.5 page-md:w-28">
          <span className={FIELD_LABEL}>Price</span>
          <span
            className={cn(
              BOX,
              "flex items-center gap-2 focus-within:outline-2 focus-within:-outline-offset-1 focus-within:outline-primary",
            )}
          >
            <span aria-hidden className="text-muted-foreground">
              R
            </span>
            <input
              id={`${id}-amount`}
              className="min-w-0 flex-1 bg-transparent text-right font-semibold tabular-nums outline-none"
              inputMode="decimal"
              value={amount}
              placeholder="0,00"
              aria-label={`Price in rands: ${name}`}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? `${id}-error` : undefined}
              onChange={(e) => setAmount(e.target.value)}
              onBlur={() => {
                const cents = parseMoneyToMinor(amount);
                if (cents !== null) setAmount(priceText(cents));
                void save({ shop, amount, kind });
              }}
            />
          </span>
        </label>
        <div className="flex flex-col gap-1.5">
          <span className={FIELD_LABEL}>This price is</span>
          <FilterToggle
            label={`This price is: ${name}`}
            className="h-9"
            value={kind}
            onChange={(k) => {
              setKind(k);
              void save({ shop, amount, kind: k });
            }}
            options={[
              { value: "estimate", label: "An estimate" },
              { value: "paid", label: "What we paid" },
            ]}
          />
        </div>
      </div>
      {error && (
        <p id={`${id}-error`} role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
