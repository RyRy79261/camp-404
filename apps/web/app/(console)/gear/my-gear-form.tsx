"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Send, X } from "lucide-react";
import { maxSharers, rentalEstimate } from "@camp404/core";
import {
  RENTAL_MAX_QUANTITY,
  type RentalChoice,
  type RentalLineInput,
} from "@camp404/types";
import { Button } from "@camp404/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@camp404/ui/components/card";
import { Label } from "@camp404/ui/components/label";
import { SegmentedControl } from "@camp404/ui/components/segmented-control";
import { toast } from "@camp404/ui/components/toast";
import {
  itemPriceText,
  moneyRange,
  sleepsText,
  type PricedItemView,
} from "@/lib/rental-view";
import { changeMyGearAction, saveMyGearAction } from "./actions";

// The member's own gear order (#241). For each item: "I have my own" or "I
// need one", how many, and for a tent that sleeps more than one, who shares
// it. No source and no price is chosen here: a captain decides those. A
// problem with what they picked shows beside the form.

interface ItemView extends PricedItemView {
  id: string;
  name: string;
  isTent: boolean;
  sleeps: number;
}

interface Answer {
  choice: RentalChoice | "";
  quantity: number;
  sharerIds: string[];
}

const NONE: Answer = { choice: "", quantity: 1, sharerIds: [] };

const selectClass =
  "h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50";

export function MyGearForm({
  items,
  members,
  version,
  lines,
}: {
  items: ItemView[];
  members: { id: string; name: string }[];
  /** The order's version; 0 before the first save. */
  version: number;
  lines: RentalLineInput[];
}) {
  const router = useRouter();
  const [answers, setAnswers] = useState<Record<string, Answer>>(() =>
    Object.fromEntries(
      lines.map((l) => [
        l.itemId,
        { choice: l.choice, quantity: l.quantity, sharerIds: l.sharerIds },
      ]),
    ),
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [sending, setSending] = useState(false);

  const answerOf = (id: string) => answers[id] ?? NONE;
  const set = (id: string, patch: Partial<Answer>) =>
    setAnswers((all) => ({ ...all, [id]: { ...(all[id] ?? NONE), ...patch } }));
  const nameOf = (id: string) =>
    members.find((m) => m.id === id)?.name ?? "Someone";

  const current: RentalLineInput[] = items.flatMap((item) => {
    const a = answerOf(item.id);
    if (a.choice === "") return [];
    const fits = maxSharers(item, a.quantity);
    return [
      {
        itemId: item.id,
        choice: a.choice,
        quantity: a.choice === "need" ? a.quantity : 1,
        sharerIds: a.choice === "need" ? a.sharerIds.slice(0, fits) : [],
      },
    ];
  });
  const estimate = rentalEstimate(items, current);
  const needsAny = current.some((l) => l.choice === "need");

  function save(submit: boolean) {
    setError(null);
    if (submit && current.length === 0) {
      setError("Say what you have or what you need first.");
      return;
    }
    setSending(submit);
    start(async () => {
      const res = await saveMyGearAction({
        lines: current,
        submit,
        expectedVersion: version,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      toast.success(
        submit ? "Sent. A captain will confirm it." : "Draft saved.",
      );
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader className="p-5 pb-3">
        <CardTitle className="text-base">What you need</CardTitle>
        <CardDescription>
          Answer for each item. Leave one alone if it doesn&rsquo;t matter to
          you.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5 p-5 pt-0">
        <ul aria-label="Gear" className="flex flex-col gap-4">
          {items.map((item) => {
            const a = answerOf(item.id);
            const fits = maxSharers(item, a.quantity);
            const picked = a.sharerIds.slice(0, fits);
            const open = members.filter((m) => !picked.includes(m.id));
            return (
              <li
                key={item.id}
                aria-label={item.name}
                className="flex flex-col gap-3 rounded-lg border border-border p-4"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <span className="font-medium">
                    {item.name}
                    {item.isTent && (
                      <span className="ml-2 text-xs font-normal text-muted-foreground">
                        {sleepsText(item.sleeps)}
                      </span>
                    )}
                  </span>
                  <span className="text-sm tabular-nums text-muted-foreground">
                    {itemPriceText(item)}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <SegmentedControl
                    aria-label={`${item.name}: do you need one?`}
                    className="page-sm:w-auto"
                    disabled={pending}
                    value={a.choice}
                    onValueChange={(choice) =>
                      set(item.id, { choice: choice as RentalChoice })
                    }
                    options={[
                      {
                        value: "own",
                        label: (
                          <span className="whitespace-nowrap">
                            I have my own
                          </span>
                        ),
                      },
                      {
                        value: "need",
                        label: (
                          <span className="whitespace-nowrap">I need one</span>
                        ),
                      },
                    ]}
                  />
                  {a.choice !== "" && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={pending}
                      onClick={() => set(item.id, NONE)}
                    >
                      Clear
                    </Button>
                  )}
                </div>
                {a.choice === "need" && (
                  <div className="grid gap-3 page-sm:grid-cols-[8rem_1fr]">
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor={`qty-${item.id}`}>How many</Label>
                      <select
                        id={`qty-${item.id}`}
                        className={selectClass}
                        disabled={pending}
                        value={a.quantity}
                        onChange={(e) =>
                          set(item.id, { quantity: Number(e.target.value) })
                        }
                      >
                        {Array.from(
                          { length: RENTAL_MAX_QUANTITY },
                          (_, i) => i + 1,
                        ).map((n) => (
                          <option key={n} value={n}>
                            {n}
                          </option>
                        ))}
                      </select>
                    </div>
                    {fits > 0 && (
                      <div className="flex flex-col gap-1.5">
                        <Label htmlFor={`share-${item.id}`}>
                          Who shares it with you?
                        </Label>
                        {picked.length > 0 && (
                          <ul
                            aria-label={`Sharing ${item.name} with`}
                            className="flex flex-wrap gap-1.5"
                          >
                            {picked.map((id) => (
                              <li
                                key={id}
                                className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/40 py-0.5 pl-3 pr-1 text-sm"
                              >
                                {nameOf(id)}
                                <button
                                  type="button"
                                  aria-label={`Remove ${nameOf(id)}`}
                                  disabled={pending}
                                  className="rounded-full p-1 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                  onClick={() =>
                                    set(item.id, {
                                      sharerIds: picked.filter((s) => s !== id),
                                    })
                                  }
                                >
                                  <X className="h-3.5 w-3.5" aria-hidden />
                                </button>
                              </li>
                            ))}
                          </ul>
                        )}
                        {picked.length < fits ? (
                          <select
                            id={`share-${item.id}`}
                            className={selectClass}
                            disabled={pending}
                            value=""
                            onChange={(e) => {
                              if (!e.target.value) return;
                              set(item.id, {
                                sharerIds: [...picked, e.target.value],
                              });
                            }}
                          >
                            <option value="">
                              {picked.length === 0
                                ? "Nobody, or pick someone"
                                : "Add someone else"}
                            </option>
                            {open.map((m) => (
                              <option key={m.id} value={m.id}>
                                {m.name}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <p
                            id={`share-${item.id}`}
                            className="text-xs text-muted-foreground"
                          >
                            That&rsquo;s everyone it fits.
                          </p>
                        )}
                        <p className="text-xs text-muted-foreground">
                          They don&rsquo;t need to order a tent themselves.
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>

        <div className="flex flex-col gap-1 rounded-lg bg-muted/40 p-4">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            What it may cost
          </span>
          <span
            role="status"
            aria-label="What it may cost"
            className="text-xl font-semibold tabular-nums"
          >
            {needsAny
              ? moneyRange(estimate.lowCents, estimate.highCents)
              : "Nothing"}
          </span>
          {needsAny && estimate.lowCents !== estimate.highCents && (
            <span className="text-xs text-muted-foreground">
              A captain decides whether each item comes from the camp&rsquo;s
              own stock or the supplier. You see the exact total once they
              confirm.
            </span>
          )}
        </div>

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button type="button" disabled={pending} onClick={() => save(true)}>
            {pending && sending ? (
              <Loader2 className="animate-spin" aria-hidden />
            ) : (
              <Send aria-hidden />
            )}
            Send my order
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() => save(false)}
          >
            {pending && !sending && (
              <Loader2 className="animate-spin" aria-hidden />
            )}
            Save as a draft
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/** Take a sent order back to change it. */
export function ChangeMyOrder({ version }: { version: number }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-col gap-2">
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Button
        type="button"
        variant="outline"
        className="self-start"
        disabled={pending}
        onClick={() => {
          setError(null);
          start(async () => {
            const res = await changeMyGearAction({ expectedVersion: version });
            if (!res.ok) {
              setError(res.error);
              return;
            }
            router.refresh();
          });
        }}
      >
        {pending && <Loader2 className="animate-spin" aria-hidden />}
        Change my order
      </Button>
    </div>
  );
}
