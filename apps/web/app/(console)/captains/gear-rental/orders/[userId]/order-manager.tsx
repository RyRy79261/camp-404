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
} from "@camp404/core";
import type { RentalLine } from "@camp404/db/rental";
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
import {
  quantityText,
  sourcePriceText,
  type PricedItemView,
} from "@/lib/rental-view";
import {
  confirmRentalOrderAction,
  reopenRentalOrderAction,
  setTentLabelAction,
} from "../../actions";

// One member's gear order for a captain (#241). Sent: the captain picks camp
// stock or the supplier for each needed item and confirms, which charges the
// member's dues. Confirmed: the sources and prices it was confirmed at, a
// label for each tent, and Reopen. A refusal from the server (the order
// changed, no camp stock left) shows beside the button; a tent label is a
// one-tap row action, so its failure is a toast.

interface OrderView {
  id: string;
  version: number;
  status: RentalOrderStatus;
  totalCents: number | null;
  charged: boolean;
  lines: RentalLine[];
}

export function OrderManager({
  order,
  items,
  campLeft,
  duesHref,
}: {
  order: OrderView;
  items: (PricedItemView & { id: string })[];
  /** Camp stock not spoken for, per item that has camp stock. */
  campLeft: Record<string, number>;
  duesHref: string;
}) {
  const router = useRouter();
  const [confirm, confirmDialog] = useConfirm();
  const itemOf = (id: string) => items.find((i) => i.id === id);
  const needed = order.lines.filter((l) => l.choice === "need");
  const owned = order.lines.filter((l) => l.choice === "own");

  // The captain's pick per line: the one source when the item has only one,
  // else what was picked before a reopen, else nothing yet.
  const [sources, setSources] = useState<Record<string, RentalSource | "">>(
    () =>
      Object.fromEntries(
        needed.map((l) => {
          const item = itemOf(l.itemId);
          const has = item ? rentalSources(item) : [];
          const before = l.source && has.includes(l.source) ? l.source : "";
          return [l.id, has.length === 1 ? has[0]! : before];
        }),
      ),
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const allPicked = needed.every((l) => sources[l.id]);
  const total = needed.reduce((sum, l) => {
    const item = itemOf(l.itemId);
    const source = sources[l.id];
    const price = item && source ? rentalPrice(item, source) : null;
    return sum + (price ?? 0) * l.quantity;
  }, 0);

  function confirmOrder() {
    setError(null);
    if (!allPicked) {
      setError("Pick camp stock or the supplier for every item first.");
      return;
    }
    start(async () => {
      const res = await confirmRentalOrderAction({
        orderId: order.id,
        expectedVersion: order.version,
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
      toast.success("Reopened. The charge is off their dues.");
      router.refresh();
    });
  }

  const confirmed = order.status === "confirmed";
  const sent = order.status === "submitted";

  return (
    <div className="grid items-start gap-6 page-lg:grid-cols-3">
      {confirmDialog}
      <Card className="page-lg:col-span-2">
        <CardHeader className="p-5 pb-3">
          <CardTitle className="text-base">What they need</CardTitle>
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
              Nothing from the camp.
            </p>
          ) : (
            <ul aria-label="Items they need" className="flex flex-col gap-3">
              {needed.map((line) => {
                const item = itemOf(line.itemId);
                const has = item ? rentalSources(item) : [];
                const left = campLeft[line.itemId];
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
                    {line.sharers.length > 0 && (
                      <p className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
                        Sharing with
                        {line.sharers.map((s) => (
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
                    )}
                    {sent && item && (
                      <div className="flex flex-col gap-1.5">
                        <SegmentedControl
                          aria-label={`Where ${line.itemName} comes from`}
                          className="page-sm:w-auto page-sm:self-start"
                          disabled={pending}
                          value={sources[line.id] ?? ""}
                          onValueChange={(value) =>
                            setSources((all) => ({
                              ...all,
                              [line.id]: value as RentalSource,
                            }))
                          }
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
                        <span className="text-xs text-muted-foreground">
                          {left === undefined
                            ? "The camp has none of its own: supplier only."
                            : left <= 0
                              ? "No camp stock left."
                              : `${left} left in camp stock.`}
                        </span>
                      </div>
                    )}
                    {confirmed && line.isTent && (
                      <TentLabel lineId={line.id} label={line.tentLabel} />
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          {owned.length > 0 && (
            <p className="text-sm text-muted-foreground">
              Has their own: {owned.map((l) => l.itemName).join(", ")}.
            </p>
          )}
        </CardContent>
      </Card>

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
              <p className="text-sm text-muted-foreground">
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
