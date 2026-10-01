"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { Button } from "@camp404/ui/components/button";
import { Combobox } from "@camp404/ui/components/combobox";
import { Spinner } from "@camp404/ui/components/spinner";
import { toast } from "@camp404/ui/components/toast";
import { cn } from "@camp404/ui/lib/utils";
import {
  leaveShiftAction,
  placeMemberOnShiftAction,
  setSlotNeededAction,
  signUpForShiftAction,
  takeMemberOffShiftAction,
} from "@/app/(console)/shifts/actions";
import type { ShiftDayView } from "@/lib/shifts";

// One day of the shift roster (#248), as the owner approved it (Option A,
// 2026-10-01): AfrikaBurn's ResponsiveDataTable. A table when its own box is
// 48rem or wider (a container query, as AGENTS.md asks of every table)
// (Time | Shift | Who is on it | Places | your button), and below it the same
// rows as stacked cards. The member's own button (Sign up, Leave, Full, Not
// needed) sits in the same right-hand slot on every row, whoever looks.
//
// Lead tools are never in the row. A lead of the shift's team, or a captain,
// opens a row with the arrow on its left, and the tools open in a shaded,
// labelled panel under it: Put someone on, Take someone off, Skip this day.
// A member gets no arrow column at all; a lead gets the column, with the
// arrow only on their own team's rows. Which rows a viewer may open is the
// server's answer (`type.canManage`, and `people` only reaches those viewers),
// and every write checks again.
//
// A one-tap change reports its failure as a toast and only the pressed
// control spins (AGENTS.md); the member picker shows its problem beside it.

type Slot = ShiftDayView["slots"][number];
type Result = { ok: true } | { ok: false; error: string };

const KICKER =
  "font-pixel text-[10px] leading-4 uppercase tracking-[0.15em] text-primary";
const STATE =
  "inline-flex h-8 items-center justify-center border border-dashed border-border font-pixel text-[10px] uppercase tracking-[0.15em] text-muted-foreground";
const HINT = "text-[13px] leading-5 text-muted-foreground";

/** Run a one-tap write: a toast on failure, a refresh on success. */
function useOneTap() {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const run = (act: () => Promise<Result>) =>
    start(async () => {
      const result = await act();
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      router.refresh();
    });
  return { pending, run };
}

/** "Morning clean on Wed 29 Apr", for accessible names. */
const slotLabel = (slot: Slot, day: ShiftDayView) =>
  `${slot.type.name} on ${day.label}`;

/** The member's own button: always the same slot, whatever the viewer. */
function MainButton({
  slot,
  day,
  wide,
}: {
  slot: Slot;
  day: ShiftDayView;
  wide?: boolean;
}) {
  const { pending, run } = useOneTap();
  const label = slotLabel(slot, day);
  const size = wide ? "w-full" : "w-28";
  if (slot.status !== "open") {
    return (
      <span
        role="status"
        aria-label={`${slot.type.name} is not needed on ${day.label}`}
        className={cn(STATE, size)}
      >
        Not needed
      </span>
    );
  }
  if (!slot.open) {
    return (
      <span
        role="status"
        aria-label={`${label} is on paper now`}
        className={cn(STATE, size)}
      >
        On paper
      </span>
    );
  }
  if (slot.mine) {
    return (
      <Button
        type="button"
        size="sm"
        variant="outline"
        className={cn("h-8", size)}
        disabled={pending}
        aria-label={`Leave ${label}`}
        onClick={() => run(() => leaveShiftAction({ slotId: slot.id }))}
      >
        {pending && <Spinner size="sm" label="Saving…" />}
        Leave
      </Button>
    );
  }
  if (slot.taken >= slot.type.places) {
    return (
      <span
        role="status"
        aria-label={`${label} is full`}
        className={cn(STATE, size)}
      >
        Full
      </span>
    );
  }
  return (
    <Button
      type="button"
      size="sm"
      className={cn("h-8", size)}
      disabled={pending}
      aria-label={`Sign up for ${label}`}
      onClick={() => run(() => signUpForShiftAction({ slotId: slot.id }))}
    >
      {pending && <Spinner size="sm" label="Saving…" />}
      Sign up
    </Button>
  );
}

/** Who is on it, with the viewer as "You". */
function WhoIsOn({ slot, day }: { slot: Slot; day: ShiftDayView }) {
  if (slot.status !== "open") {
    return (
      <span className="text-muted-foreground">Not needed on {day.tab}</span>
    );
  }
  if (slot.taken === 0) {
    return <span className="text-muted-foreground">Nobody yet</span>;
  }
  return (
    <span data-testid={`who-${slot.id}`}>
      {slot.others.join(", ")}
      {slot.mine && (
        <>
          {slot.others.length > 0 ? ", " : ""}
          <b className="font-semibold text-primary">You</b>
        </>
      )}
    </span>
  );
}

/** "3 of 4" and a small bar. */
function Places({ slot, alignEnd }: { slot: Slot; alignEnd?: boolean }) {
  if (slot.status !== "open") {
    return <span className="text-muted-foreground">–</span>;
  }
  const { taken } = slot;
  const { places } = slot.type;
  return (
    <span className={cn("flex flex-col", alignEnd && "items-end")}>
      <span className="tabular-nums">
        {taken} of {places}
      </span>
      <span
        role="progressbar"
        aria-valuenow={taken}
        aria-valuemin={0}
        aria-valuemax={places}
        aria-label={`${taken} of ${places} places taken`}
        className={cn(
          "block h-1 w-16 bg-foreground/10",
          alignEnd ? "mt-1" : "mt-2",
        )}
      >
        <span
          className="block h-full bg-[var(--os-accent)]"
          style={{ width: `${Math.min(100, (taken / places) * 100)}%` }}
        />
      </span>
    </span>
  );
}

function Arrow({
  slot,
  open,
  onToggle,
  panelId,
}: {
  slot: Slot;
  open: boolean;
  onToggle: () => void;
  panelId: string;
}) {
  return (
    <button
      type="button"
      aria-expanded={open}
      aria-controls={panelId}
      aria-label={`Lead tools for ${slot.type.name}`}
      onClick={onToggle}
      className={cn(
        "inline-flex h-7 w-7 items-center justify-center text-muted-foreground hover:bg-foreground/10 hover:text-foreground",
        open && "text-primary",
      )}
    >
      <ChevronRight
        aria-hidden
        className={cn("h-4 w-4 transition-transform", open && "rotate-90")}
      />
    </button>
  );
}

/** The lead tools for one slot: put on, take off, skip the day. */
function LeadPanel({
  slot,
  day,
  members,
  phone,
}: {
  slot: Slot;
  day: ShiftDayView;
  members: { userId: string; name: string }[];
  phone?: boolean;
}) {
  const router = useRouter();
  // Each one-tap control spins on its own (AGENTS.md): a take-off shows on
  // the person pressed, the skip on its own button.
  const remove = useOneTap();
  const skip = useOneTap();
  const [removing, setRemoving] = React.useState<string | null>(null);
  const [who, setWho] = React.useState<string | undefined>();
  const [error, setError] = React.useState<string | null>(null);
  const [putting, startPut] = React.useTransition();
  const needed = slot.status === "open";
  const full = slot.taken >= slot.type.places;
  const people = slot.people ?? [];
  // The viewer leaves with their own Leave button, not from here.
  const removable = people.filter((p) => !p.you);
  const on = new Set(people.map((p) => p.userId));
  const options = members
    .filter((m) => !on.has(m.userId))
    .map((m) => ({ value: m.userId, label: m.name }));
  const pickerId = `put-${slot.id}${phone ? "-phone" : ""}`;

  function put() {
    if (!who) {
      setError("Pick a member.");
      return;
    }
    setError(null);
    startPut(async () => {
      const result = await placeMemberOnShiftAction({
        slotId: slot.id,
        userId: who,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setWho(undefined);
      router.refresh();
    });
  }

  const row = phone
    ? "flex flex-col gap-1"
    : "grid grid-cols-[144px_1fr] items-center gap-4";
  const dt = "text-[13px] leading-5 font-semibold text-muted-foreground";
  const dd = "flex min-h-8 flex-wrap items-center gap-x-3 gap-y-2";

  return (
    <div className="flex flex-col gap-3">
      <p className={KICKER}>
        Lead tools · {slot.type.name}, {day.label}
      </p>
      {!slot.open ? (
        <p className={HINT}>
          This day has started. Change the printed roster instead.
        </p>
      ) : (
        <dl className="flex flex-col gap-3">
          <div className={row}>
            <dt className={dt}>
              <label htmlFor={pickerId}>Put someone on</label>
            </dt>
            <dd className={dd}>
              {!needed ? (
                <span className={HINT}>
                  It is not needed on {day.tab}. Mark it needed first.
                </span>
              ) : full ? (
                <span className={HINT}>Full. Take someone off first.</span>
              ) : (
                <>
                  <Combobox
                    id={pickerId}
                    options={options}
                    value={who}
                    onChange={setWho}
                    placeholder="Pick a member"
                    searchPlaceholder="Type a name"
                    emptyMessage="Nobody by that name."
                    className={cn(
                      "h-8 font-sans! text-sm! font-normal! tracking-normal! normal-case!",
                      phone ? "min-w-0 flex-1" : "w-56",
                    )}
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-8"
                    disabled={putting}
                    onClick={put}
                  >
                    {putting && <Spinner size="sm" label="Saving…" />}
                    Put them on
                  </Button>
                  {error && (
                    <span role="alert" className="text-sm text-destructive">
                      {error}
                    </span>
                  )}
                </>
              )}
            </dd>
          </div>
          <div className={row}>
            <dt className={dt}>Take someone off</dt>
            <dd className={dd}>
              {removable.length === 0 ? (
                <span className={HINT}>
                  {slot.mine
                    ? "Only you. You leave with your own Leave button."
                    : "Nobody is on it yet."}
                </span>
              ) : (
                <>
                  <ul className="flex flex-wrap gap-2">
                    {removable.map((p) => (
                      <li
                        key={p.userId}
                        className="inline-flex h-8 items-center gap-2 border border-border bg-background/40 pr-1 pl-3 text-sm"
                      >
                        {p.name}
                        <button
                          type="button"
                          disabled={remove.pending}
                          aria-label={`Take ${p.name} off ${slot.type.name}`}
                          onClick={() => {
                            setRemoving(p.userId);
                            remove.run(() =>
                              takeMemberOffShiftAction({
                                slotId: slot.id,
                                userId: p.userId,
                              }),
                            );
                          }}
                          className="inline-flex h-6 items-center gap-1 border border-foreground/30 px-2 text-xs font-semibold hover:bg-foreground/10 disabled:opacity-50"
                        >
                          {remove.pending && removing === p.userId && (
                            <Spinner size="sm" label="Saving…" />
                          )}
                          Take off
                        </button>
                      </li>
                    ))}
                  </ul>
                  {slot.mine && (
                    <span className={HINT}>
                      You leave with your own Leave button.
                    </span>
                  )}
                </>
              )}
            </dd>
          </div>
          <div className={row}>
            <dt className={dt}>Skip this day</dt>
            <dd className={dd}>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 disabled:border-dashed"
                disabled={skip.pending || (needed && slot.taken > 0)}
                onClick={() =>
                  skip.run(() =>
                    setSlotNeededAction({
                      slotId: slot.id,
                      needed: !needed,
                      expectedVersion: slot.version,
                    }),
                  )
                }
              >
                {skip.pending && <Spinner size="sm" label="Saving…" />}
                {needed
                  ? `Not needed on ${day.tab}`
                  : `Needed on ${day.tab} after all`}
              </Button>
              <span className={HINT}>
                {!needed
                  ? "Members can sign up for it again."
                  : slot.taken > 0
                    ? "Take everyone off it first."
                    : "Nobody can sign up that day. The other days stay open."}
              </span>
            </dd>
          </div>
        </dl>
      )}
    </div>
  );
}

const TH =
  "h-10 px-3 text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground";
const TD = "p-3 align-top";
const TX = "px-3 py-[18px] align-top";

export function ShiftDay({
  day,
  members,
  arrows,
}: {
  day: ShiftDayView;
  /** Every approved member, for the picker; null for a member. */
  members: { userId: string; name: string }[] | null;
  /** The viewer may open some rows: a lead or a captain. */
  arrows: boolean;
}) {
  const [open, setOpen] = React.useState<ReadonlySet<string>>(new Set());
  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const needed = day.slots.filter((s) => s.status === "open").length;
  const summary = `${needed} ${needed === 1 ? "shift" : "shifts"} · ${day.openPlaces} ${day.openPlaces === 1 ? "place" : "places"} open`;
  const listLabel = `Shifts on ${day.label}`;
  const canOpen = (slot: Slot) =>
    arrows && slot.type.canManage && members !== null;
  const columns = arrows ? 6 : 5;

  return (
    <div data-testid="shift-day" className="@container/shifts">
      {/* A box 48rem or wider: the table, in a card. */}
      <div className="hidden border border-border bg-card @min-[48rem]/shifts:block">
        <div className="flex items-center justify-between gap-4 border-b border-border p-4">
          <h2 className="font-sans text-base font-semibold tracking-normal normal-case">
            {day.longLabel}
          </h2>
          <span className="text-[13px] leading-5 tabular-nums text-muted-foreground">
            {summary}
            {day.outsideBurn ? " · Not a Burn day any more" : ""}
          </span>
        </div>
        {day.slots.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">
            No shifts on this day yet.
          </p>
        ) : (
          <table className="w-full table-fixed border-collapse text-sm leading-5">
            <caption className="sr-only">{listLabel}</caption>
            <colgroup>
              {arrows && <col style={{ width: 44 }} />}
              <col style={{ width: 120 }} />
              <col style={{ width: 216 }} />
              <col />
              <col style={{ width: 96 }} />
              <col style={{ width: 136 }} />
            </colgroup>
            <thead>
              <tr className="border-b border-border">
                {arrows && (
                  <th className={cn(TH, "pr-0 pl-4")}>
                    <span className="sr-only">Lead tools</span>
                  </th>
                )}
                <th className={cn(TH, !arrows && "pl-4")}>Time</th>
                <th className={TH}>Shift</th>
                <th className={TH}>Who is on it</th>
                <th className={TH}>Places</th>
                <th className={cn(TH, "pr-4 text-right")}>
                  <span className="sr-only">Your place</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {day.slots.map((slot, i) => {
                const isOpen = open.has(slot.id) && canOpen(slot);
                const off = slot.status !== "open";
                const last = i === day.slots.length - 1;
                const panelId = `lead-${slot.id}`;
                return (
                  <React.Fragment key={slot.id}>
                    <tr
                      aria-label={slotLabel(slot, day)}
                      className={cn(
                        !(last && !isOpen) && "border-b border-border",
                      )}
                    >
                      {arrows && (
                        <td className="pt-3.5 pr-0 pl-4 align-top">
                          {canOpen(slot) && (
                            <Arrow
                              slot={slot}
                              open={isOpen}
                              onToggle={() => toggle(slot.id)}
                              panelId={panelId}
                            />
                          )}
                        </td>
                      )}
                      <td
                        className={cn(
                          TX,
                          "whitespace-nowrap tabular-nums",
                          !arrows && "pl-4",
                          off && "opacity-60",
                        )}
                      >
                        {slot.type.timeText}
                      </td>
                      <td className={cn(TX, off && "opacity-60")}>
                        <div className="font-semibold">{slot.type.name}</div>
                        <span
                          data-slot="badge"
                          className="mt-1 inline-block border border-border px-1.5 py-0.5 font-pixel text-[9px] leading-3 uppercase tracking-[0.12em] whitespace-nowrap text-muted-foreground"
                        >
                          {slot.type.teamLabel}
                        </span>
                      </td>
                      <td className={cn(TX, off && "opacity-60")}>
                        <WhoIsOn slot={slot} day={day} />
                      </td>
                      <td className={cn(TX, off && "opacity-60")}>
                        <Places slot={slot} />
                      </td>
                      <td className={cn(TD, "pr-4 text-right")}>
                        <MainButton slot={slot} day={day} />
                      </td>
                    </tr>
                    {isOpen && (
                      <tr
                        id={panelId}
                        className={cn(!last && "border-b border-border")}
                      >
                        <td
                          colSpan={columns}
                          className="border-l-2 border-l-primary bg-background/60 py-4 pr-4 pl-4"
                        >
                          <LeadPanel
                            slot={slot}
                            day={day}
                            members={members ?? []}
                          />
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Narrower: AfrikaBurn's stacked cards. */}
      <div className="@min-[48rem]/shifts:hidden">
        <div className="mb-3 flex flex-col gap-1">
          <h2 className="font-sans text-base font-semibold tracking-normal normal-case">
            {day.longLabel}
          </h2>
          <span className="text-[13px] leading-5 tabular-nums text-muted-foreground">
            {summary}
          </span>
        </div>
        {day.slots.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No shifts on this day yet.
          </p>
        ) : (
          <ul aria-label={listLabel} className="flex flex-col gap-3">
            {day.slots.map((slot) => {
              const isOpen = open.has(slot.id) && canOpen(slot);
              const off = slot.status !== "open";
              const panelId = `lead-phone-${slot.id}`;
              return (
                <li
                  key={slot.id}
                  aria-label={slotLabel(slot, day)}
                  className="border border-border bg-card"
                >
                  <div className="flex flex-col gap-3 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className={cn("min-w-0", off && "opacity-60")}>
                        <div className="text-base leading-6 font-semibold">
                          {slot.type.name}
                        </div>
                        <span
                          data-slot="badge"
                          className="mt-1 inline-block border border-border px-1.5 py-0.5 font-pixel text-[9px] leading-3 uppercase tracking-[0.12em] text-muted-foreground"
                        >
                          {slot.type.teamLabel}
                        </span>
                      </div>
                      {canOpen(slot) && (
                        <Arrow
                          slot={slot}
                          open={isOpen}
                          onToggle={() => toggle(slot.id)}
                          panelId={panelId}
                        />
                      )}
                    </div>
                    <dl
                      className={cn("flex flex-col gap-2", off && "opacity-60")}
                    >
                      {(
                        [
                          ["Time", slot.type.timeText],
                          ["Places", <Places slot={slot} alignEnd />],
                          ["On it", <WhoIsOn slot={slot} day={day} />],
                        ] as const
                      ).map(([dtText, value]) => (
                        <div
                          key={dtText}
                          className="flex items-baseline justify-between gap-3"
                        >
                          <dt className="shrink-0 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                            {dtText}
                          </dt>
                          <dd className="min-w-0 text-right text-sm leading-5 tabular-nums">
                            {value}
                          </dd>
                        </div>
                      ))}
                    </dl>
                    <div className="border-t border-border pt-3">
                      <MainButton slot={slot} day={day} wide />
                    </div>
                  </div>
                  {isOpen && (
                    <div
                      id={panelId}
                      className="border-t border-l-2 border-border border-l-primary bg-background/60 p-4"
                    >
                      <LeadPanel
                        slot={slot}
                        day={day}
                        members={members ?? []}
                        phone
                      />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
