"use client";

import * as React from "react";
import { SEARCH_FOCUS_CLASS, searchFocusProps } from "@/lib/search-focus";
import { useRouter } from "next/navigation";
import { MoreHorizontal } from "lucide-react";
import {
  bandOf,
  clockText,
  durationText,
  outsidePreferences,
  programmeMinute,
} from "@camp404/core";
import type {
  LoungeBand,
  LoungeDecision,
  LoungeNeed,
  LoungeOfferKind,
  LoungeOfferStatus,
} from "@camp404/types";
import { Button } from "@camp404/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@camp404/ui/components/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@camp404/ui/components/dropdown-menu";
import { Field } from "@camp404/ui/components/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@camp404/ui/components/select";
import { Spinner } from "@camp404/ui/components/spinner";
import { Textarea } from "@camp404/ui/components/textarea";
import { toast } from "@camp404/ui/components/toast";
import { cn } from "@camp404/ui/lib/utils";
import {
  decideOfferAction,
  placeOfferAction,
  removeSlotAction,
} from "@/app/(console)/lounge/actions";
import {
  BAND_NAMES,
  KIND_LABELS,
  NEED_LABELS,
  timeRangeText,
} from "@/lib/lounge-copy";
import {
  OFFER_FILTERS,
  START_TIMES,
  alreadyThen,
  clashesOf,
  filterCounts,
  filterOf,
  firstName,
  placedText,
  suggestPlacement,
  wantsText,
  type OfferFilter,
  type OfferStage,
  type PlacedLite,
} from "@/lib/lounge-view";
import {
  LoungeCard,
  NoteBox,
  StageBadge,
  TABLE,
  TD,
  TH,
  WARN,
} from "./lounge-parts";

// The offers table for the people who run the lounge (redesign option A,
// owner 2026-10-01; copied from AfrikaBurn's registrations list): a status
// filter over ONE table, and every offer's main button in one fixed "Next
// step" slot, so Accept, Place and Add another time start and end at the
// same place on every row (the owner's "why does the main button move into
// the row?"). Ask for changes and Decline live in the ⋯ menu. Place opens a
// panel under its own row with the host's choice picked and the first free
// time suggested; the slot's button becomes Close, so the panel's Place is
// the only main button on screen. Below about 52rem the rows are cards with
// the same slot in their footer. A one-tap change reports a failure as a
// toast; a problem with what was typed shows in its dialog or panel.

export interface OfferRowData {
  id: string;
  version: number;
  status: LoungeOfferStatus;
  stage: OfferStage;
  kind: LoungeOfferKind;
  title: string;
  description: string | null;
  durationMinutes: number;
  needs: LoungeNeed[];
  needsNote: string | null;
  preferredDays: number[];
  preferredBands: LoungeBand[];
  recurring: boolean;
  publicGuide: boolean;
  hostName: string;
  decisionNote: string | null;
  /** Its places on the programme. */
  slots: { id: string; day: number; startMinute: number }[];
}

export interface PlaceDay {
  day: number;
  /** "Day 5 · Fri 30 Apr", or "Day 5". */
  label: string;
}

type Placed = PlacedLite & { offerId: string };

function subLine(row: OfferRowData): string {
  return [
    KIND_LABELS[row.kind],
    durationText(row.durationMinutes),
    row.recurring ? "can repeat" : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

/** Whether any of the offer's places clash or sit outside the host's ticks. */
function placeWarning(row: OfferRowData, placed: readonly Placed[]): string {
  const words: string[] = [];
  for (const slot of row.slots) {
    const others = placed.filter((p) => p.id !== slot.id);
    // An overlap is told once, on the place that starts inside the other
    // (as on the programme), so two clashing sets do not both wear a ▲.
    const mine = programmeMinute(slot.startMinute);
    for (const c of clashesOf(
      { ...slot, durationMinutes: row.durationMinutes },
      others,
    ).filter((c) => {
      const theirs = programmeMinute(c.startMinute);
      return theirs < mine || (theirs === mine && c.id < slot.id);
    })) {
      words.push(`Day ${slot.day}: overlaps ${c.title}.`);
    }
    const outside = outsidePreferences(row, slot);
    if (outside.day) {
      words.push(
        `Day ${slot.day} is not a day ${firstName(row.hostName)} ticked.`,
      );
    }
    if (outside.band) {
      words.push(
        `${clockText(slot.startMinute)} is not a time ${firstName(row.hostName)} ticked.`,
      );
    }
  }
  return words.join(" ");
}

// --- The row's one action ----------------------------------------------------

function useAccept(row: OfferRowData) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const accept = () =>
    start(async () => {
      const result = await decideOfferAction({
        offerId: row.id,
        decision: "accepted",
        expectedStatus: row.status,
        expectedVersion: row.version,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(`${row.title} accepted. Place it on the programme next.`);
      router.refresh();
    });
  return { accept, pending };
}

/** The fixed "Next step" slot: one button, or a quiet note, never moving. */
function NextStep({
  row,
  placing,
  onPlace,
  className,
}: {
  row: OfferRowData;
  placing: boolean;
  onPlace: () => void;
  /** The slot's width: 168px in the table, the card's half in a card. */
  className: string;
}) {
  const { accept, pending } = useAccept(row);
  const slot = cn("flex", className);
  if (row.stage === "new") {
    return (
      <div className={slot}>
        <Button
          size="sm"
          className="w-full"
          disabled={pending}
          onClick={accept}
          aria-label={`Accept ${row.title}`}
        >
          {pending && <Spinner size="sm" label="Accepting…" />}
          Accept
        </Button>
      </div>
    );
  }
  if (row.stage === "to_place" || row.stage === "on") {
    const words = row.stage === "to_place" ? "Place" : "Add another time";
    return (
      <div className={slot}>
        <Button
          size="sm"
          className="w-full"
          variant={placing || row.stage === "on" ? "outline" : "default"}
          aria-expanded={placing}
          aria-label={
            placing ? `Close placing ${row.title}` : `${words}: ${row.title}`
          }
          onClick={onPlace}
        >
          {placing ? "Close" : words}
        </Button>
      </div>
    );
  }
  return (
    <div className={cn(slot, "min-h-8 items-center")}>
      <span className="text-[13px] leading-4 text-muted-foreground">
        {row.stage === "changes"
          ? `Waiting for ${firstName(row.hostName)}`
          : "Nothing to do"}
      </span>
    </div>
  );
}

// --- The ⋯ menu ----------------------------------------------------------------

function RowMenu({
  row,
  days,
  onDetails,
  onDecide,
  trigger,
}: {
  row: OfferRowData;
  days: readonly PlaceDay[];
  onDetails: () => void;
  onDecide: (d: Exclude<LoungeDecision, "accepted">) => void;
  trigger: "icon" | "button";
}) {
  const router = useRouter();
  const { accept, pending } = useAccept(row);
  const [removing, startRemove] = React.useTransition();
  const labelOf = (day: number) =>
    days.find((d) => d.day === day)?.label ?? `Day ${day}`;

  function takeOff(slot: OfferRowData["slots"][number]) {
    startRemove(async () => {
      const result = await removeSlotAction({ slotId: slot.id });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(`${row.title} is off ${labelOf(slot.day)}`);
      router.refresh();
    });
  }

  const red = "text-destructive focus:text-destructive";
  const busy = pending || removing;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {trigger === "icon" ? (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            disabled={busy}
            aria-label={`More for ${row.title}`}
          >
            {busy ? <Spinner size="sm" /> : <MoreHorizontal aria-hidden />}
          </Button>
        ) : (
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            disabled={busy}
            aria-label={`More for ${row.title}`}
          >
            {busy ? <Spinner size="sm" /> : <MoreHorizontal aria-hidden />}
            More
          </Button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-56">
        {row.stage === "changes" ? (
          <>
            <DropdownMenuItem onSelect={onDetails}>
              See what you asked
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={accept}>
              Accept it as it is
            </DropdownMenuItem>
            <DropdownMenuItem
              className={red}
              onSelect={() => onDecide("declined")}
            >
              Decline
            </DropdownMenuItem>
          </>
        ) : row.stage === "declined" ? (
          <>
            <DropdownMenuItem onSelect={onDetails}>
              See the reason you gave
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={accept}>
              Accept it after all
            </DropdownMenuItem>
          </>
        ) : (
          <>
            <DropdownMenuItem onSelect={onDetails}>
              See the whole offer
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onDecide("needs_changes")}>
              Ask for changes
            </DropdownMenuItem>
            {row.stage === "on" ? (
              row.slots.map((slot) => (
                <DropdownMenuItem
                  key={slot.id}
                  className={red}
                  onSelect={() => takeOff(slot)}
                >
                  Take it off Day {slot.day}, {clockText(slot.startMinute)}
                </DropdownMenuItem>
              ))
            ) : (
              <DropdownMenuItem
                className={red}
                onSelect={() => onDecide("declined")}
              >
                Decline
              </DropdownMenuItem>
            )}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// --- Placing, under the row ------------------------------------------------------

/** The place panel's field labels: the table header's small capitals. */
const PLACE_LABEL =
  "text-[11px] leading-4 font-semibold tracking-[0.08em] text-muted-foreground uppercase";
/** Its selects: 36px, the hint pushed to the right edge before the chevron. */
const PLACE_SELECT = "h-9 gap-2 [&>span]:flex-1 [&>span]:text-left";

function PlacePanel({
  row,
  days,
  placed,
  onDone,
}: {
  row: OfferRowData;
  days: readonly PlaceDay[];
  placed: readonly Placed[];
  onDone: () => void;
}) {
  const router = useRouter();
  const [first] = React.useState(() =>
    suggestPlacement(
      row,
      days.map((d) => d.day),
      placed,
    ),
  );
  const [day, setDay] = React.useState(first.day);
  const [start, setStart] = React.useState(first.startMinute);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();
  const host = firstName(row.hostName);

  const outside = outsidePreferences(row, { day, startMinute: start });
  const clashes = clashesOf(
    { day, startMinute: start, durationMinutes: row.durationMinutes },
    placed,
  );
  const already = alreadyThen(day, start, placed);
  const own = row.slots.some((s) => s.day === day);

  function place() {
    setError(null);
    startTransition(async () => {
      const result = await placeOfferAction({
        offerId: row.id,
        day,
        startMinute: start,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success(`${row.title} is on Day ${day} at ${clockText(start)}`);
      onDone();
      router.refresh();
    });
  }

  const uid = React.useId();
  const dayId = `${uid}-day`;
  const startId = `${uid}-start`;
  return (
    <div
      role="group"
      aria-label={`Place ${row.title}`}
      data-testid="place-panel"
      className="grid gap-4 border border-border bg-[color-mix(in_oklab,var(--color-background)_55%,var(--color-card))] p-4 page-sm:grid-cols-3"
    >
      <div className="flex flex-col gap-2">
        <label htmlFor={dayId} className={PLACE_LABEL}>
          Day
        </label>
        <Select value={String(day)} onValueChange={(v) => setDay(Number(v))}>
          <SelectTrigger id={dayId} className={PLACE_SELECT}>
            <SelectValue>
              <span className="flex w-full items-center gap-2">
                {days.find((d) => d.day === day)?.label ?? `Day ${day}`}
                {row.preferredDays.includes(day) && (
                  <span className="ml-auto text-xs text-muted-foreground">
                    {host}&apos;s choice
                  </span>
                )}
              </span>
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {days.map((d) => (
              <SelectItem key={d.day} value={String(d.day)}>
                {d.label}
                {row.preferredDays.includes(d.day) && (
                  <span className="ml-3 text-xs text-muted-foreground">
                    {host}&apos;s choice
                  </span>
                )}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-col gap-2">
        <label htmlFor={startId} className={PLACE_LABEL}>
          Starts at
        </label>
        <Select
          value={String(start)}
          onValueChange={(v) => setStart(Number(v))}
        >
          <SelectTrigger id={startId} className={PLACE_SELECT}>
            <SelectValue>
              <span className="flex w-full items-center gap-2">
                {clockText(start)}
                <span className="ml-auto text-xs text-muted-foreground">
                  {BAND_NAMES[bandOf(start)]}
                </span>
              </span>
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {START_TIMES.map((m) => (
              <SelectItem key={m} value={String(m)}>
                {clockText(m)}
                <span className="ml-3 text-xs text-muted-foreground">
                  {BAND_NAMES[bandOf(m)]}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-col gap-2">
        <p className={PLACE_LABEL}>Runs</p>
        <p className="flex h-9 items-center text-sm tabular-nums">
          {timeRangeText(start, row.durationMinutes)} ·{" "}
          {durationText(row.durationMinutes)}
        </p>
      </div>

      <div className="flex flex-col gap-3 border-t border-border pt-4 text-[13px] leading-5 page-sm:col-span-3 page-sm:flex-row page-sm:items-center page-sm:justify-between">
        <div className="flex min-w-0 flex-col gap-1">
          <p className="text-muted-foreground" data-testid="already-then">
            Already on Day {day} then:{" "}
            {already.length === 0
              ? "nothing."
              : `${already
                  .map(
                    (a) =>
                      `${a.title} ${timeRangeText(a.startMinute, a.durationMinutes)}`,
                  )
                  .join(", ")}.`}
          </p>
          {(outside.day || outside.band || clashes.length > 0 || own) && (
            <ul
              data-testid="place-warnings"
              className={cn("flex flex-col", WARN)}
            >
              {own && <li>▲ It is on Day {day} already.</li>}
              {outside.day && <li>▲ {host} didn&apos;t tick this day.</li>}
              {outside.band && <li>▲ {host} didn&apos;t tick this time.</li>}
              {clashes.map((c) => (
                <li key={c.id}>
                  ▲ It overlaps {c.title} (
                  {timeRangeText(c.startMinute, c.durationMinutes)}).
                </li>
              ))}
            </ul>
          )}
          {error && (
            <p role="alert" className="text-destructive">
              {error}
            </p>
          )}
        </div>
        <Button
          size="sm"
          className="shrink-0"
          onClick={place}
          disabled={pending}
        >
          {pending && <Spinner size="sm" label="Placing…" />}
          Place on Day {day} at {clockText(start)}
        </Button>
      </div>
    </div>
  );
}

// --- Dialogs ------------------------------------------------------------------

const DECIDE_WORDS: Record<
  Exclude<LoungeDecision, "accepted">,
  {
    title: (t: string) => string;
    help: string;
    label: string;
    button: string;
    buttonPlaced: string;
    done: string;
  }
> = {
  needs_changes: {
    title: () => "Ask for changes",
    help: "Say what to change. The host changes it and sends it back.",
    label: "What should they change?",
    button: "Ask for changes",
    buttonPlaced: "Ask for changes and take it off",
    done: "Changes asked for",
  },
  declined: {
    title: (t) => `Decline ${t}`,
    help: "Say why, kindly.",
    label: "Why (the host reads this)",
    button: "Decline offer",
    buttonPlaced: "Decline and take it off",
    done: "Offer declined",
  },
};

function DecideDialog({
  row,
  decision,
  onClose,
}: {
  row: OfferRowData;
  decision: Exclude<LoungeDecision, "accepted">;
  onClose: () => void;
}) {
  const router = useRouter();
  const [reason, setReason] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();
  const words = DECIDE_WORDS[decision];
  const placed = row.slots.length > 0;
  const reasonId = `reason-${row.id}`;

  function send() {
    if (!reason.trim()) {
      setError("Say why, so the host knows what to do.");
      return;
    }
    start(async () => {
      const result = await decideOfferAction({
        offerId: row.id,
        decision,
        expectedStatus: row.status,
        expectedVersion: row.version,
        reason,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success(words.done);
      onClose();
      router.refresh();
    });
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent data-window-tint>
        <DialogHeader>
          <DialogTitle>{words.title(row.title)}</DialogTitle>
          <DialogDescription>
            {row.title}, from {row.hostName}. {words.help}
          </DialogDescription>
        </DialogHeader>
        {placed && (
          <p
            data-testid="decide-warning"
            className="border border-warning/40 bg-warning/10 px-3 py-2 text-sm"
          >
            This takes {row.title} off{" "}
            {row.slots
              .map((s) => `Day ${s.day} ${clockText(s.startMinute)}`)
              .join(" and ")}
            .
          </p>
        )}
        <Field label={words.label} htmlFor={reasonId} error={error}>
          <Textarea
            id={reasonId}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            aria-invalid={error ? true : undefined}
          />
        </Field>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button
            variant={decision === "declined" ? "destructive" : "default"}
            onClick={send}
            disabled={pending}
          >
            {pending && <Spinner size="sm" label="Sending…" />}
            {placed ? words.buttonPlaced : words.button}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DetailsDialog({
  row,
  placed,
  onClose,
}: {
  row: OfferRowData;
  placed: readonly Placed[];
  onClose: () => void;
}) {
  const wants = wantsText(row);
  const needs = [
    ...row.needs.map((n) => NEED_LABELS[n]),
    ...(row.needsNote ? [row.needsNote] : []),
  ];
  const facts: [string, string][] = [
    ["Wants", `${wants.days} · ${wants.times}`],
    ["Needs", needs.length > 0 ? needs.join(", ") : "Nothing"],
    ["Can repeat", row.recurring ? "Yes" : "No"],
    ["Event guide", row.publicGuide ? "Yes" : "No"],
  ];
  if (row.slots.length > 0) {
    facts.push(["On the programme", placedText(row.slots)]);
  }
  const warning = placeWarning(row, placed);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent data-window-tint>
        <DialogHeader>
          <DialogTitle>{row.title}</DialogTitle>
          <DialogDescription>
            {subLine(row)} · offered by {row.hostName}
          </DialogDescription>
        </DialogHeader>
        {row.decisionNote &&
          (row.stage === "changes" || row.stage === "declined") && (
            <NoteBox
              title={row.stage === "changes" ? "You asked" : "Your reason"}
            >
              {row.decisionNote}
            </NoteBox>
          )}
        {row.description && (
          <p className="text-sm whitespace-pre-line">{row.description}</p>
        )}
        <dl className="grid grid-cols-[8rem_1fr] gap-x-3 gap-y-2 text-[13px] leading-5">
          {facts.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-muted-foreground">{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
        {warning && <p className={cn("text-[13px]", WARN)}>▲ {warning}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// --- The table ----------------------------------------------------------------

/** Where an offer is on the programme, with a ▲ when a place needs a look. */
function PlacedLine({
  row,
  placed,
}: {
  row: OfferRowData;
  placed: readonly Placed[];
}) {
  const warning = placeWarning(row, placed);
  return (
    <>
      {placedText(row.slots)}
      {warning && (
        <span
          className={cn("ml-1.5 cursor-help", WARN)}
          title={warning}
          data-testid="offer-warning"
        >
          ▲<span className="sr-only"> {warning}</span>
        </span>
      )}
    </>
  );
}

function StatusCell({
  row,
  placed,
}: {
  row: OfferRowData;
  placed: readonly Placed[];
}) {
  return (
    <>
      <StageBadge stage={row.stage} />
      {row.stage === "to_place" && (
        <span className="mt-1 block text-xs leading-4 text-muted-foreground">
          Not placed yet
        </span>
      )}
      {row.stage === "on" && (
        <span className="mt-1 block text-xs leading-4 text-muted-foreground tabular-nums">
          <PlacedLine row={row} placed={placed} />
        </span>
      )}
    </>
  );
}

export function OffersTable({
  rows,
  days,
  placed,
  initialFilter,
  focusOffer,
}: {
  rows: readonly OfferRowData[];
  days: readonly PlaceDay[];
  placed: readonly Placed[];
  initialFilter: OfferFilter;
  /** The offer a search result named (`?offer=`): its row is marked. */
  focusOffer?: string;
}) {
  const [filter, setFilter] = React.useState<OfferFilter>(initialFilter);
  const [placing, setPlacing] = React.useState<string | null>(null);
  const [details, setDetails] = React.useState<OfferRowData | null>(null);
  const [deciding, setDeciding] = React.useState<{
    row: OfferRowData;
    decision: Exclude<LoungeDecision, "accepted">;
  } | null>(null);

  const counts = filterCounts(rows.map((r) => r.stage));
  const shown = rows.filter(
    (r) => filter === "all" || filterOf(r.stage) === filter,
  );
  const toggle = (id: string) => setPlacing((p) => (p === id ? null : id));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <span
          id="offers-filter-label"
          className="text-[11px] leading-4 font-semibold tracking-[0.08em] text-muted-foreground uppercase"
        >
          Show
        </span>
        <div className="pt-px pl-px">
          <div
            role="group"
            aria-labelledby="offers-filter-label"
            className="flex flex-wrap"
          >
            {OFFER_FILTERS.map((f) => {
              const on = f.value === filter;
              return (
                <button
                  key={f.value}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setFilter(f.value)}
                  className={cn(
                    "-mt-px -ml-px inline-flex h-8 items-center gap-2 border border-border px-3 text-[13px] font-medium whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    on
                      ? "bg-[var(--color-pick)] text-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {f.label}
                  <b className="font-bold text-foreground tabular-nums">
                    {counts[f.value]}
                  </b>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <LoungeCard
        className="@container/offers"
        labelledBy="offers-table-title"
        testId="offers"
      >
        <h3 id="offers-table-title" className="sr-only">
          Offers
        </h3>
        {shown.length === 0 ? (
          <p className="px-4 py-4 text-sm text-muted-foreground">
            {rows.length === 0
              ? "No offers yet. When a member offers something, it shows here."
              : "Nothing here."}
          </p>
        ) : (
          <>
            {/* A wide window: one table. */}
            <table className={cn(TABLE, "hidden @min-[52rem]/offers:table")}>
              <caption className="sr-only">Offers</caption>
              <colgroup>
                <col />
                <col className="w-44" />
                <col className="w-30" />
                <col className="w-36" />
                <col className="w-[11.25rem]" />
                <col className="w-11" />
              </colgroup>
              <thead>
                <tr>
                  <th scope="col" className={TH}>
                    Offer
                  </th>
                  <th scope="col" className={TH}>
                    Host
                  </th>
                  <th scope="col" className={TH}>
                    Wants
                  </th>
                  <th scope="col" className={TH}>
                    Status
                  </th>
                  <th scope="col" className={cn(TH, "pr-0")}>
                    Next step
                  </th>
                  <th scope="col" className={TH}>
                    <span className="sr-only">More</span>
                  </th>
                </tr>
              </thead>
              <tbody className="[&>tr:first-child>td]:border-t-0">
                {shown.map((row) => {
                  const wants = wantsText(row);
                  const open = placing === row.id;
                  const sel =
                    "bg-[color-mix(in_oklab,var(--color-primary)_10%,var(--color-card))]";
                  return (
                    <React.Fragment key={row.id}>
                      <tr
                        data-testid="offer-row"
                        data-stage={row.stage}
                        aria-label={row.title}
                        {...searchFocusProps(row.id === focusOffer)}
                        className={cn(
                          open && sel,
                          row.id === focusOffer && SEARCH_FOCUS_CLASS,
                        )}
                      >
                        <td className={TD}>
                          <span className="block font-semibold break-words">
                            {row.title}
                          </span>
                          <span className="mt-1 block text-xs leading-4 text-muted-foreground">
                            {subLine(row)}
                          </span>
                        </td>
                        <td className={cn(TD, "truncate")} title={row.hostName}>
                          {row.hostName}
                        </td>
                        <td className={TD}>
                          {wants.days}
                          <span className="mt-1 block text-xs leading-4 text-muted-foreground">
                            {wants.times}
                          </span>
                        </td>
                        <td className={TD}>
                          <StatusCell row={row} placed={placed} />
                        </td>
                        <td className={cn(TD, "pr-0")}>
                          <NextStep
                            row={row}
                            placing={open}
                            onPlace={() => toggle(row.id)}
                            className="w-42"
                          />
                        </td>
                        <td className={cn(TD, "pr-2 pl-1 text-right")}>
                          <RowMenu
                            row={row}
                            days={days}
                            trigger="icon"
                            onDetails={() => setDetails(row)}
                            onDecide={(decision) =>
                              setDeciding({ row, decision })
                            }
                          />
                        </td>
                      </tr>
                      {open && (
                        <tr className={sel}>
                          <td colSpan={6} className="px-4 pb-4">
                            <PlacePanel
                              row={row}
                              days={days}
                              placed={placed}
                              onDone={() => setPlacing(null)}
                            />
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>

            {/* A narrow window or a phone: one card per offer. */}
            <ul
              className="flex flex-col @min-[52rem]/offers:hidden"
              aria-label="Offers"
            >
              {shown.map((row) => {
                const wants = wantsText(row);
                const open = placing === row.id;
                return (
                  <li
                    key={row.id}
                    data-testid="offer-row"
                    data-stage={row.stage}
                    aria-label={row.title}
                    {...searchFocusProps(row.id === focusOffer)}
                    className={cn(
                      "flex flex-col gap-3 border-t border-border p-4 first:border-t-0",
                      row.id === focusOffer && SEARCH_FOCUS_CLASS,
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-base leading-5 font-semibold break-words">
                          {row.title}
                        </p>
                        <p className="mt-1 text-xs leading-4 text-muted-foreground">
                          {subLine(row)}
                        </p>
                      </div>
                      <StageBadge stage={row.stage} />
                    </div>
                    <dl className="grid grid-cols-[8rem_1fr] items-baseline gap-x-3 gap-y-2">
                      <dt className="text-[13px] leading-5 text-muted-foreground">
                        Host
                      </dt>
                      <dd className="text-sm leading-5">{row.hostName}</dd>
                      <dt className="text-[13px] leading-5 text-muted-foreground">
                        Wants
                      </dt>
                      <dd className="text-sm leading-5">
                        {wants.days} · {wants.times}
                      </dd>
                      {(row.stage === "to_place" || row.stage === "on") && (
                        <>
                          <dt className="text-[13px] leading-5 text-muted-foreground">
                            On the programme
                          </dt>
                          <dd className="text-sm leading-5 tabular-nums">
                            {row.stage === "on" ? (
                              <PlacedLine row={row} placed={placed} />
                            ) : (
                              <span className="text-muted-foreground">
                                Not placed yet
                              </span>
                            )}
                          </dd>
                        </>
                      )}
                    </dl>
                    <div className="grid grid-cols-2 gap-2 border-t border-border pt-3">
                      <RowMenu
                        row={row}
                        days={days}
                        trigger="button"
                        onDetails={() => setDetails(row)}
                        onDecide={(decision) => setDeciding({ row, decision })}
                      />
                      <NextStep
                        row={row}
                        placing={open}
                        onPlace={() => toggle(row.id)}
                        className="w-full justify-center"
                      />
                    </div>
                    {open && (
                      <PlacePanel
                        row={row}
                        days={days}
                        placed={placed}
                        onDone={() => setPlacing(null)}
                      />
                    )}
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </LoungeCard>

      {details && (
        <DetailsDialog
          row={details}
          placed={placed}
          onClose={() => setDetails(null)}
        />
      )}
      {deciding && (
        <DecideDialog
          row={deciding.row}
          decision={deciding.decision}
          onClose={() => setDeciding(null)}
        />
      )}
    </div>
  );
}
