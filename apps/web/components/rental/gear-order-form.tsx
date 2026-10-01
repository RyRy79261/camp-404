"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Send, X } from "lucide-react";
import { rentalEstimate, tentRoom } from "@camp404/core";
import {
  OWN_TENT_DESCRIPTION_MAX,
  RENTAL_MAX_QUANTITY,
  RENTAL_MAX_SLEEPS,
  type RentalChoice,
  type RentalTentChoice,
} from "@camp404/types";
import { Button } from "@camp404/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@camp404/ui/components/card";
import { Input } from "@camp404/ui/components/input";
import { Label } from "@camp404/ui/components/label";
import { SegmentedControl } from "@camp404/ui/components/segmented-control";
import { toast } from "@camp404/ui/components/toast";
import { CHOICE_OFF, CHOICE_ON } from "@camp404/ui/lib/choice";
import { cn } from "@camp404/ui/lib/utils";
import { fillRentalOrderAction } from "@/app/(console)/captains/gear-rental/actions";
import {
  changeMyGearAction,
  saveMyGearAction,
} from "@/app/(console)/gear/actions";
import { TentLabelValue } from "./tent-label-value";
import {
  itemPriceText,
  moneyRange,
  nameList,
  type PricedItemView,
} from "@/lib/rental-view";

// A gear order's form (#241): the member's own, or a captain filling it in
// for a member who has not answered (`forMember`).
//
// THE TENT IS ASKED ONCE, by need (owner, 2026-09-30), whatever tents the
// catalogue holds: "I have my own" (what it is, how many it sleeps), "I need
// one" (for how many people), or "I'm in someone else's tent". The member
// never sees a catalogue tent and never picks one: a captain does, when they
// confirm. Then one row per other item (a mattress, a sleeping bag): "I have
// my own" or "I need" some. No source and no price is chosen here. A problem
// with what was picked shows beside the form.

interface ItemView extends PricedItemView {
  id: string;
  name: string;
  isTent: boolean;
  sleeps: number;
}

/** The tent answer as the form holds it and sends it. */
export type GearTent =
  | {
      choice: "own";
      ownDescription: string | null;
      ownSleeps: number | null;
      sharerIds: string[];
    }
  | { choice: "need"; people: number; sharerIds: string[] }
  | { choice: "shared" };

/** One line for an item that is not a tent. */
export interface GearLine {
  itemId: string;
  choice: RentalChoice;
  quantity: number;
}

interface TentState {
  choice: RentalTentChoice | "";
  people: number;
  ownDescription: string;
  ownSleeps: number | null;
  sharerIds: string[];
}

interface Answer {
  choice: RentalChoice | "";
  quantity: number;
}

const NONE: Answer = { choice: "", quantity: 1 };

const selectClass =
  "h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50";

const upTo = (n: number) => Array.from({ length: n }, (_, i) => i + 1);

export function GearOrderForm({
  items,
  members,
  version,
  tent: savedTent,
  lines,
  hostedBy,
  hostedLabel = null,
  forMember,
}: {
  /** The year's live catalogue, tents included (for the price range only). */
  items: ItemView[];
  members: { id: string; name: string }[];
  /** The order's version; 0 before the first save. */
  version: number;
  tent: GearTent | null;
  lines: GearLine[];
  /** The members whose sent orders already have this member in their tent. */
  hostedBy: string[];
  /** That tent's label, once a captain gave it one. */
  hostedLabel?: string | null;
  /** Set when a captain fills the order in for this member. */
  forMember?: { userId: string; name: string };
}) {
  const router = useRouter();
  const theirs = forMember !== undefined;
  const hosted = hostedBy.length > 0;
  const [tentAnswer, setTent] = useState<TentState>(() => ({
    choice: savedTent?.choice ?? "",
    people: savedTent?.choice === "need" ? savedTent.people : 1,
    ownDescription:
      savedTent?.choice === "own" ? (savedTent.ownDescription ?? "") : "",
    ownSleeps: savedTent?.choice === "own" ? savedTent.ownSleeps : null,
    sharerIds:
      savedTent && savedTent.choice !== "shared" ? savedTent.sharerIds : [],
  }));
  // Already in someone's tent: the question is answered, whatever a draft
  // saved before that said (the server refuses "need" or "own" then, and the
  // radios are not shown to change it).
  const tent: TentState = hosted
    ? { ...tentAnswer, choice: "shared", sharerIds: [] }
    : tentAnswer;
  const [answers, setAnswers] = useState<Record<string, Answer>>(() =>
    Object.fromEntries(
      lines.map((l) => [l.itemId, { choice: l.choice, quantity: l.quantity }]),
    ),
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [sending, setSending] = useState(false);

  const others = items.filter((item) => !item.isTent);
  const answerOf = (id: string) => answers[id] ?? NONE;
  const set = (id: string, patch: Partial<Answer>) =>
    setAnswers((all) => ({ ...all, [id]: { ...(all[id] ?? NONE), ...patch } }));
  const nameOf = (id: string) =>
    members.find((m) => m.id === id)?.name ?? "Someone";

  const room =
    tent.choice === "" ? 0 : tentRoom({ ...tent, choice: tent.choice });
  const picked = tent.sharerIds.slice(0, room);
  const currentTent: GearTent | null =
    tent.choice === "own"
      ? {
          choice: "own",
          ownDescription: tent.ownDescription.trim() || null,
          ownSleeps: tent.ownSleeps,
          sharerIds: picked,
        }
      : tent.choice === "need"
        ? { choice: "need", people: tent.people, sharerIds: picked }
        : tent.choice === "shared"
          ? { choice: "shared" }
          : null;
  const currentLines: GearLine[] = others.flatMap((item) => {
    const a = answerOf(item.id);
    return a.choice === ""
      ? []
      : [
          {
            itemId: item.id,
            choice: a.choice,
            quantity: a.choice === "need" ? a.quantity : 1,
          },
        ];
  });
  const estimate = rentalEstimate(items, {
    tent: currentTent,
    lines: currentLines,
  });
  const tentRange = rentalEstimate(items, {
    tent: { choice: "need" },
    lines: [],
  });
  const hasTents = items.some((item) => item.isTent);
  const needsAny =
    currentTent?.choice === "need" ||
    currentLines.some((l) => l.choice === "need");
  const you = theirs ? "they" : "you";

  function save(submit: boolean) {
    setError(null);
    if (submit && currentTent === null && currentLines.length === 0) {
      setError(
        theirs
          ? "Say what they have or what they need first."
          : "Say what you have or what you need first.",
      );
      return;
    }
    setSending(submit);
    start(async () => {
      const res = forMember
        ? await fillRentalOrderAction({
            userId: forMember.userId,
            tent: currentTent,
            lines: currentLines,
            expectedVersion: version,
          })
        : await saveMyGearAction({
            tent: currentTent,
            lines: currentLines,
            submit,
            expectedVersion: version,
          });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      toast.success(
        forMember
          ? `Saved for ${forMember.name}. Pick the tent and the sources, then confirm.`
          : submit
            ? "Sent. A captain will confirm it."
            : "Draft saved.",
      );
      router.refresh();
    });
  }

  const TENT_OPTIONS: {
    value: RentalTentChoice;
    label: string;
    hint: string;
  }[] = [
    {
      value: "own",
      label: theirs ? "They have their own" : "I have my own",
      hint: theirs ? "They bring a tent." : "You bring a tent.",
    },
    {
      value: "need",
      label: theirs ? "They need one" : "I need one",
      hint: "From the camp. A captain picks which tent.",
    },
    {
      value: "shared",
      label: theirs
        ? "They're in someone else's tent"
        : "I'm in someone else's tent",
      hint: theirs
        ? "Another member has room for them."
        : "Another member has room for you.",
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader className="p-5 pb-3">
          <CardTitle className="text-base">Tent</CardTitle>
          <CardDescription>
            {theirs
              ? `You are filling this in for ${forMember.name}. They see on My gear that a captain did.`
              : hosted
                ? "Answered for you by the tent\u2019s owner."
                : "Where do you sleep? One answer."}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 p-5 pt-0">
          {hosted ? (
            // Answered by someone else's order: content, never a locked form.
            <div data-testid="tent-hosted" className="flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <p className="text-base font-semibold">
                  {theirs ? "They\u2019re" : "You\u2019re"} in{" "}
                  {nameList(hostedBy)}&rsquo;s tent.
                </p>
                <p className="text-sm text-muted-foreground">
                  Ask {nameList(hostedBy)} to take {theirs ? "them" : "you"} off
                  if that&rsquo;s wrong. It costs {theirs ? "them" : "you"}{" "}
                  nothing.
                </p>
              </div>
              {hostedLabel && <TentLabelValue label={hostedLabel} />}
            </div>
          ) : (
            <div
              role="radiogroup"
              aria-label="Tent"
              className="flex flex-col gap-2"
            >
              {TENT_OPTIONS.map((option) => {
                const checked = tent.choice === option.value;
                return (
                  <label
                    key={option.value}
                    className={cn(
                      "flex min-h-[44px] cursor-pointer items-start gap-3 rounded-md border p-3 text-sm",
                      checked ? CHOICE_ON : CHOICE_OFF,
                    )}
                  >
                    <input
                      type="radio"
                      name="tent-choice"
                      className="mt-1 accent-[var(--color-primary)]"
                      value={option.value}
                      checked={checked}
                      disabled={pending}
                      onChange={() =>
                        setTent((t) => ({ ...t, choice: option.value }))
                      }
                    />
                    <span className="flex min-w-0 flex-col">
                      <span className="font-medium">{option.label}</span>
                      <span className="text-xs text-muted-foreground">
                        {option.hint}
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
          )}

          {tent.choice === "own" && (
            <div className="grid gap-3 page-sm:grid-cols-[1fr_8rem]">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="own-what">What tent is it? (optional)</Label>
                <Input
                  id="own-what"
                  maxLength={OWN_TENT_DESCRIPTION_MAX}
                  placeholder="3-person dome"
                  value={tent.ownDescription}
                  disabled={pending}
                  onChange={(e) => {
                    const ownDescription = e.currentTarget.value;
                    setTent((t) => ({ ...t, ownDescription }));
                  }}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="own-sleeps">It sleeps (optional)</Label>
                <select
                  id="own-sleeps"
                  className={selectClass}
                  disabled={pending}
                  value={tent.ownSleeps ?? ""}
                  onChange={(e) => {
                    const ownSleeps = e.target.value
                      ? Number(e.target.value)
                      : null;
                    setTent((t) => ({ ...t, ownSleeps }));
                  }}
                >
                  <option value="">Not said</option>
                  {upTo(RENTAL_MAX_SLEEPS).map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </div>
              <p className="text-xs text-muted-foreground page-sm:col-span-2">
                The captains use this for the site plan. It costs nothing.
              </p>
            </div>
          )}

          {tent.choice === "need" && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="tent-people">For how many people?</Label>
              <select
                id="tent-people"
                className={cn(selectClass, "page-sm:w-32")}
                disabled={pending}
                value={tent.people}
                onChange={(e) => {
                  const people = Number(e.target.value);
                  setTent((t) => ({ ...t, people }));
                }}
              >
                {upTo(RENTAL_MAX_SLEEPS).map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">
                {theirs ? "Them" : "You"} included. A captain picks the tent
                {hasTents && tentRange.highCents > 0
                  ? `: ${moneyRange(tentRange.lowCents, tentRange.highCents)}.`
                  : ", and you see the price then."}
              </p>
            </div>
          )}

          {(tent.choice === "own" || tent.choice === "need") &&
            (room > 0 ? (
              <SharerPicker
                theirs={theirs}
                fits={room}
                picked={picked}
                open={members.filter((m) => !picked.includes(m.id))}
                nameOf={nameOf}
                disabled={pending}
                onChange={(sharerIds) => setTent((t) => ({ ...t, sharerIds }))}
              />
            ) : (
              <p className="text-xs text-muted-foreground">
                {tent.choice === "need"
                  ? `Sharing it? Say it is for more than one person, then pick who.`
                  : `Sharing it? Say how many it sleeps, then pick who.`}
              </p>
            ))}

          {tent.choice === "shared" && !hosted && (
            <p
              data-testid="tent-not-hosted"
              className="text-sm text-muted-foreground"
            >
              Nobody has put {theirs ? "them" : "you"} in their tent yet. The
              person whose tent it is adds {theirs ? "them" : "you"} on their
              own My gear, under &ldquo;Who shares it with you?&rdquo;.
            </p>
          )}

          {tent.choice !== "" && !hosted && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="self-start"
              disabled={pending}
              onClick={() =>
                setTent((t) => ({ ...t, choice: "", sharerIds: [] }))
              }
            >
              Clear the tent answer
            </Button>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="p-5 pb-3">
          <CardTitle className="text-base">Bedding</CardTitle>
          <CardDescription>
            {others.length === 0
              ? "The camp rents out nothing else this year."
              : `Pick \u201cI need\u201d for anything ${you} want from the camp. Anything left blank, ${you} don\u2019t need.`}
          </CardDescription>
        </CardHeader>
        {others.length > 0 && (
          <CardContent className="p-5 pt-0">
            <ul aria-label="Bedding" className="divide-y divide-border">
              {others.map((item) => {
                const a = answerOf(item.id);
                return (
                  <li
                    key={item.id}
                    aria-label={item.name}
                    className="flex flex-col gap-2 py-3 page-sm:flex-row page-sm:items-center page-sm:justify-between page-sm:gap-4"
                  >
                    <span className="flex min-w-0 flex-col gap-0.5">
                      <span className="text-sm font-medium">{item.name}</span>
                      <span className="text-xs tabular-nums text-muted-foreground">
                        {itemPriceText(item)}
                      </span>
                    </span>
                    {/* The toggle first, then a slot for how many and one
                        for Clear that keep their width, so the toggle never
                        moves when an answer is picked. */}
                    <span className="flex shrink-0 items-center gap-2">
                      <SegmentedControl
                        aria-label={`${item.name}: ${theirs ? "do they" : "do you"} need one?`}
                        className="flex-1 page-sm:w-auto page-sm:flex-none"
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
                                {theirs
                                  ? "They have their own"
                                  : "I have my own"}
                              </span>
                            ),
                          },
                          {
                            value: "need",
                            label: (
                              <span className="whitespace-nowrap">
                                {theirs ? "They need" : "I need"}
                              </span>
                            ),
                          },
                        ]}
                      />
                      <span className="flex w-16 shrink-0">
                        {a.choice === "need" && (
                          <select
                            aria-label={`How many ${item.name}`}
                            className={cn(selectClass, "w-16")}
                            disabled={pending}
                            value={a.quantity}
                            onChange={(e) =>
                              set(item.id, {
                                quantity: Number(e.target.value),
                              })
                            }
                          >
                            {upTo(RENTAL_MAX_QUANTITY).map((n) => (
                              <option key={n} value={n}>
                                {n}
                              </option>
                            ))}
                          </select>
                        )}
                      </span>
                      <span className="flex w-10 shrink-0 justify-end">
                        {a.choice !== "" && (
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            aria-label={`Clear ${item.name}`}
                            title="Clear"
                            disabled={pending}
                            onClick={() => set(item.id, NONE)}
                          >
                            <X aria-hidden />
                          </Button>
                        )}
                      </span>
                    </span>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        )}
      </Card>

      {/* What it may cost and the buttons, after both questions: they send
          the tent answer and the bedding together. */}
      <Card>
        <CardContent className="flex flex-col gap-4 p-5 page-sm:flex-row page-sm:items-end page-sm:justify-between">
          <div className="flex min-w-0 flex-col gap-1">
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
                {theirs ? "They" : "You"} see the exact total once a captain
                confirms.
              </span>
            )}
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
          </div>
          {/* The main button last, so it sits on the right; on a phone the
              column is reversed, so it sits on top. */}
          <div className="flex shrink-0 flex-col-reverse gap-2 page-sm:flex-row page-sm:flex-wrap">
            {!theirs && (
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
            )}
            <Button type="button" disabled={pending} onClick={() => save(true)}>
              {pending && sending ? (
                <Loader2 className="animate-spin" aria-hidden />
              ) : (
                <Send aria-hidden />
              )}
              {theirs ? "Save for them" : "Send my order"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/** Who shares the tent: the people picked, and a list to add one more. */
function SharerPicker({
  theirs,
  fits,
  picked,
  open,
  nameOf,
  disabled,
  onChange,
}: {
  theirs: boolean;
  fits: number;
  picked: string[];
  open: { id: string; name: string }[];
  nameOf: (id: string) => string;
  disabled: boolean;
  onChange: (sharerIds: string[]) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor="tent-sharers">
        {theirs ? "Who shares it with them?" : "Who shares it with you?"}
      </Label>
      {picked.length > 0 && (
        <ul
          aria-label="Sharing the tent with"
          className="flex flex-wrap gap-1.5"
        >
          {picked.map((sharer) => (
            <li
              key={sharer}
              className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/40 py-0.5 pl-3 pr-1 text-sm"
            >
              {nameOf(sharer)}
              <button
                type="button"
                aria-label={`Remove ${nameOf(sharer)}`}
                disabled={disabled}
                className="rounded-full p-1 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => onChange(picked.filter((s) => s !== sharer))}
              >
                <X className="h-3.5 w-3.5" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
      {picked.length < fits ? (
        <select
          id="tent-sharers"
          className={selectClass}
          disabled={disabled}
          value=""
          onChange={(e) => {
            if (e.target.value) onChange([...picked, e.target.value]);
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
        <p id="tent-sharers" className="text-xs text-muted-foreground">
          That&rsquo;s everyone it fits.
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        They pick &ldquo;I&rsquo;m in someone else&rsquo;s tent&rdquo; on their
        own My gear.
      </p>
    </div>
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
