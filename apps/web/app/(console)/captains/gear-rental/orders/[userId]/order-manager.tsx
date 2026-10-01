"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Loader2, RotateCcw } from "lucide-react";
import {
  formatMoney,
  RENTAL_SOURCE_LABELS,
  rentalPrice,
  rentalSources,
  tentSleepsEnough,
} from "@camp404/core";
import type { RentalLine, RentalTentAnswer } from "@camp404/db/rental";
import {
  TENT_LABEL_MAX,
  type RentalOrderStatus,
  type RentalSource,
} from "@camp404/types";
import { Badge } from "@camp404/ui/components/badge";
import { Button } from "@camp404/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@camp404/ui/components/card";
import { useConfirm } from "@camp404/ui/components/confirm-dialog";
import { Input } from "@camp404/ui/components/input";
import { SegmentedControl } from "@camp404/ui/components/segmented-control";
import { toast } from "@camp404/ui/components/toast";
import { CHOICE_OFF, CHOICE_ON } from "@camp404/ui/lib/choice";
import { cn } from "@camp404/ui/lib/utils";
import {
  nameList,
  ownTentText,
  quantityText,
  sleepsText,
  sourcePriceText,
  tentNeedText,
  type PricedItemView,
} from "@/lib/rental-view";
import {
  confirmRentalOrderAction,
  reopenRentalOrderAction,
  setTentLabelAction,
} from "../../actions";

// One member's gear order for a captain (#241). Sent: for a member who needs
// a tent, the captain picks WHICH catalogue tent and where it comes from (the
// member never picked one); then camp stock or the supplier for each other
// thing they need; then confirms, which charges the member's dues. A tent
// that sleeps fewer than the people it is for gets a plain warning, not a
// refusal: the captain may know better. Confirmed: the tent, sources and
// prices it was confirmed at, the tent's label, and Reopen. A refusal from
// the server (the order changed, no camp stock left) shows beside the button;
// a tent label is a one-tap row action, so its failure is a toast.

interface OrderView {
  id: string;
  version: number;
  status: RentalOrderStatus;
  totalCents: number | null;
  charged: boolean;
  tent: RentalTentAnswer | null;
  hostedBy: string[];
  lines: RentalLine[];
}

interface ItemView extends PricedItemView {
  id: string;
  name: string;
  isTent: boolean;
  sleeps: number;
  archived: boolean;
}

/** Said when the tent a captain picks sleeps fewer than it is for. */
export function tooSmallText(sleeps: number, people: number): string {
  return `This tent sleeps ${sleeps}, and it is for ${people} people. You can still pick it.`;
}

export function OrderManager({
  order,
  items,
  campLeft,
  duesHref,
}: {
  order: OrderView;
  items: ItemView[];
  /** Camp stock not spoken for, per item that has camp stock. */
  campLeft: Record<string, number>;
  duesHref: string;
}) {
  const router = useRouter();
  const [confirm, confirmDialog] = useConfirm();
  const itemOf = (id: string) => items.find((i) => i.id === id);
  const needed = order.lines.filter((l) => l.choice === "need");
  const owned = order.lines.filter((l) => l.choice === "own");
  const tent = order.tent;
  const needsTent = tent?.choice === "need";
  const assigned = tent?.assigned ?? null;
  // The tents a captain may pick: this year's, and the one picked before.
  const tents = items.filter(
    (i) => i.isTent && (!i.archived || i.id === assigned?.itemId),
  );

  /** The one source when the item has only one, else `before`, else nothing. */
  const firstSource = (itemId: string, before: RentalSource | null) => {
    const item = itemOf(itemId);
    const has = item ? rentalSources(item) : [];
    if (has.length === 1) return has[0]!;
    return before && has.includes(before) ? before : "";
  };
  const [sources, setSources] = useState<Record<string, RentalSource | "">>(
    () =>
      Object.fromEntries(
        needed.map((l) => [l.id, firstSource(l.itemId, l.source)]),
      ),
  );
  // What was picked before a reopen, or the only tent there is.
  const [tentId, setTentId] = useState<string>(
    assigned?.itemId ?? (tents.length === 1 ? tents[0]!.id : ""),
  );
  const [tentSource, setTentSource] = useState<RentalSource | "">(() => {
    const id = assigned?.itemId ?? (tents.length === 1 ? tents[0]!.id : "");
    return id ? firstSource(id, assigned?.source ?? null) : "";
  });
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const tentItem = tentId ? itemOf(tentId) : undefined;
  const tentPicked =
    !needsTent || (tentItem !== undefined && tentSource !== "");
  const allPicked = tentPicked && needed.every((l) => sources[l.id]);
  const tentPrice =
    needsTent && tentItem && tentSource
      ? (rentalPrice(tentItem, tentSource) ?? 0)
      : 0;
  const total =
    tentPrice +
    needed.reduce((sum, l) => {
      const item = itemOf(l.itemId);
      const source = sources[l.id];
      const price = item && source ? rentalPrice(item, source) : null;
      return sum + (price ?? 0) * l.quantity;
    }, 0);

  function confirmOrder() {
    setError(null);
    if (!tentPicked) {
      setError("Pick the tent this member gets, and where it comes from.");
      return;
    }
    if (!allPicked) {
      setError("Pick camp stock or the supplier for every item first.");
      return;
    }
    start(async () => {
      const res = await confirmRentalOrderAction({
        orderId: order.id,
        expectedVersion: order.version,
        tent: needsTent ? { itemId: tentId, source: tentSource } : null,
        sources: needed.map((l) => ({ lineId: l.id, source: sources[l.id] })),
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      toast.success(
        res.data.charged
          ? `Confirmed. ${formatMoney(res.data.totalCents)} is on their dues.`
          : "Confirmed. Nothing to pay.",
      );
      router.refresh();
    });
  }

  async function reopen() {
    const sure = await confirm({
      title: "Reopen this order?",
      description: order.charged
        ? "The charge comes off the member's dues, and the order goes back to sent so it can change. Confirm it again when it's right."
        : "The order goes back to sent so it can change. Confirm it again when it's right.",
      confirmLabel: "Reopen",
    });
    if (!sure) return;
    setError(null);
    start(async () => {
      const res = await reopenRentalOrderAction({
        orderId: order.id,
        expectedVersion: order.version,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      toast.success(
        order.charged ? "Reopened. The charge is off their dues." : "Reopened.",
      );
      router.refresh();
    });
  }

  const confirmed = order.status === "confirmed";
  const sent = order.status === "submitted";

  const leftText = (itemId: string) => {
    const left = campLeft[itemId];
    return left === undefined
      ? "The camp has none of its own."
      : left <= 0
        ? "No camp stock left."
        : `${left} left in camp stock.`;
  };
  /**
   * Where one thing comes from. Two sources: a choice, marked while it is
   * unpicked. One source: plain words, since there is nothing to choose.
   */
  const sourcePicker = (
    label: string,
    item: ItemView,
    value: RentalSource | "",
    onChange: (source: RentalSource) => void,
  ) => {
    const has = rentalSources(item);
    if (has.length === 1) {
      const only = has[0]!;
      return (
        <p data-testid="only-source" className="flex flex-col gap-0.5 text-sm">
          <span>
            <span className="font-medium">{RENTAL_SOURCE_LABELS[only]}</span>
            {" · "}
            <span className="tabular-nums">{sourcePriceText(item, only)}</span>
          </span>
          <span className="text-xs text-muted-foreground">
            {leftText(item.id)}
          </span>
        </p>
      );
    }
    return (
      <div className="flex flex-col gap-1.5">
        <SegmentedControl
          aria-label={label}
          className="page-sm:w-auto page-sm:self-start"
          disabled={pending}
          value={value}
          onValueChange={(v) => onChange(v as RentalSource)}
          options={has.map((source) => ({
            value: source,
            label: (
              <span className="flex flex-col">
                <span className="whitespace-nowrap">
                  {RENTAL_SOURCE_LABELS[source]}
                </span>{" "}
                <span className="whitespace-nowrap text-xs font-normal tabular-nums">
                  {sourcePriceText(item, source)}
                </span>
              </span>
            ),
          }))}
        />
        {value === "" ? (
          <span className="text-xs font-medium text-warning">
            Pick camp stock or supplier. {leftText(item.id)}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">
            {leftText(item.id)}
          </span>
        )}
      </div>
    );
  };

  const sharers = tent && tent.sharers.length > 0 && (
    <p className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
      Sharing with
      {tent.sharers.map((s) => (
        <span
          key={s.id}
          className="inline-flex items-center gap-1.5 text-foreground"
        >
          {s.name}
          {s.accepted === false && (
            <Badge variant="outline">Not accepted yet</Badge>
          )}
        </span>
      ))}
    </p>
  );
  const shownTent = confirmed ? assigned : tentItem;
  const tooSmall =
    needsTent &&
    shownTent !== null &&
    shownTent !== undefined &&
    !tentSleepsEnough(shownTent, tent.people);
  const tooSmallNote = tooSmall && shownTent && (
    <p
      role="status"
      data-testid="tent-too-small"
      className="rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm"
    >
      {tooSmallText(shownTent.sleeps, tent.people ?? 0)}
    </p>
  );
  // What the tent answer says, when there is no catalogue tent to pick.
  const tentWords = !tent ? (
    <p className="text-sm text-muted-foreground">No tent answer.</p>
  ) : tent.choice === "own" ? (
    <p className="text-sm">
      Their own tent
      {ownTentText(tent) ? `: ${ownTentText(tent)}` : ""}.
    </p>
  ) : tent.choice === "shared" ? (
    order.hostedBy.length > 0 ? (
      <p className="text-sm">In {nameList(order.hostedBy)}&rsquo;s tent.</p>
    ) : (
      <p
        role="status"
        className="rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm"
      >
        They say they are in someone else&rsquo;s tent, and nobody has put them
        in theirs yet.
      </p>
    )
  ) : null;
  const alsoHosted = tent?.choice !== "shared" && order.hostedBy.length > 0 && (
    <p className="text-sm text-muted-foreground">
      {nameList(order.hostedBy)} also has them in their tent.
    </p>
  );

  // What is still to pick before there is a total.
  const missing = {
    tent: needsTent && tentItem === undefined,
    sources:
      needed.filter((l) => !sources[l.id]).length +
      (needsTent && tentItem !== undefined && tentSource === "" ? 1 : 0),
  };

  return (
    // A column on a phone, so the Confirm card can stay in sight at the
    // bottom of the window (sticky only works inside a flex column, not a
    // grid row); three columns from page-lg.
    <div className="flex flex-col gap-6 page-lg:grid page-lg:grid-cols-3 page-lg:items-start">
      {confirmDialog}
      <div className="flex min-w-0 flex-col gap-6 page-lg:col-span-2">
        {confirmed ? (
          <Card>
            <CardHeader className="p-5 pb-3">
              <CardTitle className="text-base">Their order</CardTitle>
              <CardDescription>
                Confirmed at these prices. A later price change doesn&rsquo;t
                move it.
              </CardDescription>
            </CardHeader>
            <CardContent
              data-testid="tent-panel"
              className="flex flex-col gap-4 p-5 pt-0"
            >
              <ul
                aria-label="Confirmed order"
                className="divide-y divide-border"
              >
                {needsTent && assigned && (
                  <ConfirmedRow
                    name={assigned.itemName}
                    detail={[
                      tentNeedText(tent.people),
                      sleepsText(assigned.sleeps).toLowerCase(),
                    ].join(", ")}
                    source={assigned.source}
                    priceCents={assigned.unitPriceCents}
                  />
                )}
                {needed.map((line) => (
                  <ConfirmedRow
                    key={line.id}
                    name={quantityText(line.quantity, line.itemName)}
                    source={line.source}
                    priceCents={
                      line.unitPriceCents === null
                        ? null
                        : line.unitPriceCents * line.quantity
                    }
                  />
                ))}
              </ul>
              {!needsTent && tentWords}
              {alsoHosted}
              {sharers}
              {needsTent && assigned && (
                <TentLabel lineId={assigned.id} label={assigned.tentLabel} />
              )}
              {tooSmallNote}
              {owned.length > 0 && (
                <p
                  data-testid="what-they-have"
                  className="text-sm text-muted-foreground"
                >
                  Has their own: {owned.map((l) => l.itemName).join(", ")}.
                </p>
              )}
            </CardContent>
          </Card>
        ) : (
          <>
            <Card>
              <CardHeader className="p-5 pb-3">
                <CardTitle className="text-base">Tent</CardTitle>
                <CardDescription>
                  {!tent
                    ? "They have not said where they sleep."
                    : tent.choice === "need"
                      ? "They need a tent. Pick which one they get."
                      : tent.choice === "own"
                        ? "They bring their own. Nothing to pick or charge."
                        : "They sleep in another member's tent."}
                </CardDescription>
              </CardHeader>
              <CardContent
                data-testid="tent-panel"
                className="flex flex-col gap-4 p-5 pt-0"
              >
                {tentWords}
                {alsoHosted}
                {needsTent && (
                  <p className="text-sm font-medium">
                    {tentNeedText(tent.people)}
                  </p>
                )}
                {sharers}

                {needsTent && sent && (
                  <>
                    {tents.length === 0 ? (
                      <p role="alert" className="text-sm text-destructive">
                        There is no tent in the catalogue. Add one first.
                      </p>
                    ) : (
                      <div
                        role="radiogroup"
                        aria-label="Which tent"
                        className="flex flex-col gap-2"
                      >
                        {tents.map((item) => {
                          const checked = tentId === item.id;
                          return (
                            <label
                              key={item.id}
                              className={cn(
                                "flex min-h-[44px] cursor-pointer items-center gap-3 rounded-md border p-3 text-sm",
                                checked ? CHOICE_ON : CHOICE_OFF,
                              )}
                            >
                              <input
                                type="radio"
                                name="tent-item"
                                className="accent-[var(--color-primary)]"
                                checked={checked}
                                disabled={pending}
                                onChange={() => {
                                  setTentId(item.id);
                                  setTentSource(firstSource(item.id, null));
                                }}
                              />
                              <span className="font-medium">{item.name}</span>
                              <span className="text-xs text-muted-foreground">
                                {sleepsText(item.sleeps)}
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    )}
                    {tentItem &&
                      sourcePicker(
                        "Where the tent comes from",
                        tentItem,
                        tentSource,
                        setTentSource,
                      )}
                  </>
                )}
                {tooSmallNote}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="p-5 pb-3">
                <CardTitle className="text-base">Bedding</CardTitle>
                <CardDescription>
                  Camp stock is only offered for items the camp has some of.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4 p-5 pt-0">
                {needed.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Nothing else from the camp.
                  </p>
                ) : (
                  <ul
                    aria-label="Items they need"
                    className="divide-y divide-border"
                  >
                    {needed.map((line) => {
                      const item = itemOf(line.itemId);
                      return (
                        <li
                          key={line.id}
                          aria-label={line.itemName}
                          className="flex flex-col gap-2 py-3"
                        >
                          <span className="text-sm font-medium">
                            {quantityText(line.quantity, line.itemName)}
                          </span>
                          {item &&
                            sourcePicker(
                              `Where ${line.itemName} comes from`,
                              item,
                              sources[line.id] ?? "",
                              (source) =>
                                setSources((all) => ({
                                  ...all,
                                  [line.id]: source,
                                })),
                            )}
                        </li>
                      );
                    })}
                  </ul>
                )}
                {owned.length > 0 && (
                  <p
                    data-testid="what-they-have"
                    className="text-sm text-muted-foreground"
                  >
                    Has their own: {owned.map((l) => l.itemName).join(", ")}.
                  </p>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {/* On a phone a sent order's total and Confirm stay at the foot of
          the window while the captain scrolls the picks. */}
      <Card
        className={cn(
          sent &&
            "sticky bottom-0 z-10 shadow-lg page-sm:static page-sm:shadow-sm",
        )}
      >
        <CardHeader className={cn("p-5 pb-3", sent && "hidden page-sm:flex")}>
          <CardTitle className="text-base">
            {confirmed ? "Confirmed" : "Confirm"}
          </CardTitle>
        </CardHeader>
        <CardContent
          className={cn(
            "flex flex-col gap-3 p-5 pt-0",
            sent && "p-4 page-sm:p-5 page-sm:pt-0",
          )}
        >
          <p className="flex items-baseline justify-between gap-3">
            <span className="text-sm text-muted-foreground">Total</span>
            <span
              role="status"
              aria-label="Order total"
              className={cn(
                "tabular-nums",
                confirmed || allPicked
                  ? "text-2xl font-bold"
                  : "text-right text-sm font-medium text-warning",
              )}
            >
              {confirmed
                ? formatMoney(order.totalCents ?? 0)
                : allPicked
                  ? formatMoney(total)
                  : stillToPickText(missing)}
            </span>
          </p>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          {sent && (
            <Button type="button" disabled={pending} onClick={confirmOrder}>
              {pending ? (
                <Loader2 className="animate-spin" aria-hidden />
              ) : (
                <Check aria-hidden />
              )}
              {total > 0 ? "Confirm and charge" : "Confirm"}
            </Button>
          )}
          {confirmed && (
            <>
              <p
                data-testid="order-on-dues"
                className="text-sm text-muted-foreground"
              >
                {order.charged ? (
                  <>
                    On their dues.{" "}
                    <Link
                      href={duesHref}
                      className="font-medium text-accent hover:underline"
                    >
                      Open their dues
                    </Link>
                  </>
                ) : (
                  "Nothing on their dues for this order."
                )}
              </p>
              <Button
                type="button"
                variant="outline"
                disabled={pending}
                onClick={() => void reopen()}
              >
                {pending ? (
                  <Loader2 className="animate-spin" aria-hidden />
                ) : (
                  <RotateCcw aria-hidden />
                )}
                Reopen
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * What still stands between a sent order and its total: "Pick their tent",
 * "Pick a source for 2 items", or both.
 */
export function stillToPickText(missing: {
  tent: boolean;
  sources: number;
}): string {
  const sources =
    missing.sources === 1
      ? "a source for 1 item"
      : `a source for ${missing.sources} items`;
  if (missing.tent) {
    return missing.sources > 0
      ? `Pick their tent and ${sources}`
      : "Pick their tent";
  }
  return missing.sources > 0 ? `Pick ${sources}` : "Not yet";
}

/** One confirmed line: the thing, where it came from, and what it cost. */
function ConfirmedRow({
  name,
  detail,
  source,
  priceCents,
}: {
  name: string;
  detail?: string;
  source: RentalSource | null;
  priceCents: number | null;
}) {
  return (
    <li className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-0.5 py-2.5 text-sm page-sm:grid-cols-[minmax(0,1fr)_8rem_7rem]">
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="font-medium">{name}</span>
        {detail && (
          <span className="text-xs text-muted-foreground">{detail}</span>
        )}
      </span>
      <span className="col-start-1 row-start-2 text-xs text-muted-foreground page-sm:col-start-2 page-sm:row-start-1 page-sm:text-sm">
        {source ? RENTAL_SOURCE_LABELS[source] : "–"}
      </span>
      <span className="col-start-2 row-start-1 text-right font-medium tabular-nums page-sm:col-start-3">
        {priceCents === null ? "–" : formatMoney(priceCents)}
      </span>
    </li>
  );
}

function TentLabel({
  lineId,
  label,
}: {
  lineId: string;
  label: string | null;
}) {
  const router = useRouter();
  const [value, setValue] = useState(label ?? "");
  const [pending, start] = useTransition();
  const id = `tent-label-${lineId}`;
  return (
    <form
      className="flex flex-col gap-1.5 border-t border-border pt-4"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const res = await setTentLabelAction({ lineId, label: value });
          if (!res.ok) {
            toast.error(res.error);
            return;
          }
          toast.success(value.trim() ? "Label saved" : "Label removed");
          router.refresh();
        });
      }}
    >
      <label htmlFor={id} className="text-sm font-medium">
        Tent label
      </label>
      <span className="flex items-center gap-2">
        <Input
          id={id}
          className="w-32"
          maxLength={TENT_LABEL_MAX}
          placeholder="e.g. T1"
          value={value}
          disabled={pending}
          onChange={(e) => setValue(e.currentTarget.value)}
        />
        <Button
          type="submit"
          size="sm"
          variant="outline"
          className="ml-auto"
          disabled={pending || value.trim() === (label ?? "")}
        >
          {pending && <Loader2 className="animate-spin" aria-hidden />}
          Save label
        </Button>
      </span>
      <span className="text-xs text-muted-foreground">
        The member sees it on My gear and writes it down before the Burn.
      </span>
    </form>
  );
}
