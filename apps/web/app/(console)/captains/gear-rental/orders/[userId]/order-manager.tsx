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
      ? "The camp has none of its own: supplier only."
      : left <= 0
        ? "No camp stock left."
        : `${left} left in camp stock.`;
  };
  const sourcePicker = (
    label: string,
    item: ItemView,
    value: RentalSource | "",
    onChange: (source: RentalSource) => void,
  ) => (
    <div className="flex flex-col gap-1.5">
      <SegmentedControl
        aria-label={label}
        className="page-sm:w-auto page-sm:self-start"
        disabled={pending}
        value={value}
        onValueChange={(v) => onChange(v as RentalSource)}
        options={rentalSources(item).map((source) => ({
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
      <span className="text-xs text-muted-foreground">{leftText(item.id)}</span>
    </div>
  );

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

  return (
    <div className="grid items-start gap-6 page-lg:grid-cols-3">
      {confirmDialog}
      <div className="flex flex-col gap-6 page-lg:col-span-2">
        <Card>
          <CardHeader className="p-5 pb-3">
            <CardTitle className="text-base">Tent</CardTitle>
            <CardDescription>
              {!tent
                ? "They have not said where they sleep."
                : tent.choice === "need"
                  ? confirmed
                    ? "The tent you picked for them."
                    : "They need a tent. Pick which one they get."
                  : tent.choice === "own"
                    ? "They bring their own. Nothing to pick or charge."
                    : "They sleep in another member's tent."}
            </CardDescription>
          </CardHeader>
          <CardContent
            data-testid="tent-panel"
            className="flex flex-col gap-4 p-5 pt-0"
          >
            {!tent && (
              <p className="text-sm text-muted-foreground">No tent answer.</p>
            )}
            {tent?.choice === "own" && (
              <p className="text-sm">
                Their own tent
                {ownTentText(tent) ? `: ${ownTentText(tent)}` : ""}.
              </p>
            )}
            {tent?.choice === "shared" &&
              (order.hostedBy.length > 0 ? (
                <p className="text-sm">
                  In {nameList(order.hostedBy)}&rsquo;s tent.
                </p>
              ) : (
                <p
                  role="status"
                  className="rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm"
                >
                  They say they are in someone else&rsquo;s tent, and nobody has
                  put them in theirs yet.
                </p>
              ))}
            {tent?.choice !== "shared" && order.hostedBy.length > 0 && (
              <p className="text-sm text-muted-foreground">
                {nameList(order.hostedBy)} also has them in their tent.
              </p>
            )}
            {needsTent && (
              <p className="text-sm font-medium">{tentNeedText(tent.people)}</p>
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
                            checked
                              ? "border-accent bg-accent/10"
                              : "border-input bg-background hover:bg-muted/40",
                          )}
                        >
                          <input
                            type="radio"
                            name="tent-item"
                            className="accent-[var(--color-accent)]"
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
            {needsTent && confirmed && assigned && (
              <>
                <p className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-sm">
                  <span className="font-medium">
                    {assigned.itemName}{" "}
                    <span className="text-xs font-normal text-muted-foreground">
                      {sleepsText(assigned.sleeps)}
                    </span>
                  </span>
                  {assigned.source && assigned.unitPriceCents !== null && (
                    <span className="tabular-nums">
                      {RENTAL_SOURCE_LABELS[assigned.source]},{" "}
                      {formatMoney(assigned.unitPriceCents)}
                    </span>
                  )}
                </p>
                <TentLabel lineId={assigned.id} label={assigned.tentLabel} />
              </>
            )}
            {tooSmall && shownTent && (
              <p
                role="status"
                data-testid="tent-too-small"
                className="rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm"
              >
                {tooSmallText(shownTent.sleeps, tent.people ?? 0)}
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="p-5 pb-3">
            <CardTitle className="text-base">Bedding</CardTitle>
            <CardDescription>
              {sent
                ? "Camp stock is only offered for items the camp has some of."
                : confirmed
                  ? "Confirmed at these prices. A later price change doesn't move it."
                  : "The member hasn't sent this yet. It may still change."}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4 p-5 pt-0">
            {needed.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nothing else from the camp.
              </p>
            ) : (
              <ul aria-label="Items they need" className="flex flex-col gap-3">
                {needed.map((line) => {
                  const item = itemOf(line.itemId);
                  return (
                    <li
                      key={line.id}
                      aria-label={line.itemName}
                      className="flex flex-col gap-3 rounded-lg border border-border p-4"
                    >
                      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                        <span className="font-medium">
                          {quantityText(line.quantity, line.itemName)}
                        </span>
                        {confirmed &&
                          line.source &&
                          line.unitPriceCents !== null && (
                            <span className="text-sm tabular-nums">
                              {RENTAL_SOURCE_LABELS[line.source]},{" "}
                              {formatMoney(line.unitPriceCents * line.quantity)}
                            </span>
                          )}
                      </div>
                      {sent &&
                        item &&
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
      </div>

      <Card>
        <CardHeader className="p-5 pb-3">
          <CardTitle className="text-base">
            {confirmed ? "Confirmed" : "Confirm"}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 p-5 pt-0">
          <p className="flex items-baseline justify-between gap-3">
            <span className="text-sm text-muted-foreground">Total</span>
            <span
              role="status"
              aria-label="Order total"
              className="text-2xl font-bold tabular-nums"
            >
              {confirmed
                ? formatMoney(order.totalCents ?? 0)
                : sent && allPicked
                  ? formatMoney(total)
                  : "Not yet"}
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
          {order.status === "draft" && (
            <p className="text-sm text-muted-foreground">
              You can confirm it once the member sends it.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
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
      className="flex flex-wrap items-end gap-2"
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
      <label htmlFor={id} className="flex flex-col gap-1.5 text-sm font-medium">
        Tent label
        <Input
          id={id}
          className="w-32"
          maxLength={TENT_LABEL_MAX}
          placeholder="T1"
          value={value}
          disabled={pending}
          onChange={(e) => setValue(e.currentTarget.value)}
        />
      </label>
      <Button
        type="submit"
        size="sm"
        variant="outline"
        disabled={pending || value.trim() === (label ?? "")}
      >
        {pending && <Loader2 className="animate-spin" aria-hidden />}
        Save label
      </Button>
    </form>
  );
}
