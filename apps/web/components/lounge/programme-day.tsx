"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { MoreHorizontal, Printer } from "lucide-react";
import { Button } from "@camp404/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@camp404/ui/components/dropdown-menu";
import { toast } from "@camp404/ui/components/toast";
import { cn } from "@camp404/ui/lib/utils";
import { clockText } from "@camp404/core";
import {
  placeOfferAction,
  removeSlotAction,
} from "@/app/(console)/lounge/actions";
import { KIND_LABELS, timeRangeText } from "@/lib/lounge-copy";
import {
  dayRows,
  dayWarnings,
  type DayHeading,
  type DayRow,
  type ProgrammeItem,
} from "@/lib/lounge-view";
import {
  GAP_ROW,
  LoungeCard,
  LoungeCardHeader,
  TABLE,
  TD,
  TH,
  WARN,
} from "./lounge-parts";

// The programme, one day at a time (redesign option A, owner 2026-10-01):
// a day picker (each day's date and how many things are on), then that day as
// a table from 06:00 to 06:00 with the free time between items as quiet
// "Nothing on" rows. A narrow window or a phone gets the same day as rows of
// time over what. Clash warnings are scheduling notes for the people who run
// the lounge (audit, 2026-10-01): only they see the ▲, and only they get the
// ⋯ menu that takes an item off (with Undo, since it is one tap).

function gapTime(row: Extract<DayRow, { kind: "gap" }>): string {
  return row.all ? "All day" : `${clockText(row.from)}–${clockText(row.to)}`;
}

function Warn({ words }: { words: string | undefined }) {
  if (!words) return null;
  return (
    <span
      className={cn("ml-1.5 cursor-help text-xs", WARN)}
      title={words}
      data-testid="programme-warning"
    >
      ▲<span className="sr-only"> {words}</span>
    </span>
  );
}

function ItemMenu({ item }: { item: ProgrammeItem }) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();

  function takeOff() {
    startTransition(async () => {
      const result = await removeSlotAction({ slotId: item.id });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      router.refresh();
      toast.success(`${item.title} is off the programme`, {
        action: {
          label: "Undo",
          onClick: async () => {
            const back = await placeOfferAction({
              offerId: item.offerId,
              day: item.day,
              startMinute: item.startMinute,
            });
            if (!back.ok) toast.error(back.error);
            router.refresh();
          },
        },
      });
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          disabled={pending}
          aria-label={`More for ${item.title}`}
        >
          <MoreHorizontal aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          className="text-destructive focus:text-destructive"
          onSelect={takeOff}
        >
          Take it off the programme
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function ProgrammeDay({
  days,
  items,
  canRun,
  initialDay,
  today,
}: {
  days: readonly DayHeading[];
  items: readonly ProgrammeItem[];
  canRun: boolean;
  initialDay: number;
  /** The programme day it is now, during the Burn. */
  today: number | null;
}) {
  const [day, setDay] = React.useState(initialDay);
  const heading = days.find((d) => d.day === day) ?? days[0];
  const onDay = items.filter((i) => i.day === day);
  const rows = dayRows(onDay);
  const warnings = dayWarnings(onDay);
  // Each overlap is two items that clash: count the pairs, not the items.
  const overlaps = canRun
    ? onDay.reduce((n, i) => n + i.clashesWith.length, 0) / 2
    : 0;
  const countOf = (d: number) => items.filter((i) => i.day === d).length;

  return (
    <div className="flex flex-col gap-4">
      {/* The day picker: a row of equal days in a wide window, a strip that
          scrolls sideways on a phone. */}
      <div
        role="group"
        aria-label="Day"
        className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 page-sm:mx-0 page-sm:grid page-sm:gap-0 page-sm:overflow-visible page-sm:border page-sm:border-border page-sm:p-0"
        style={{
          gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))`,
        }}
      >
        {days.map((d) => {
          const on = d.day === day;
          const n = countOf(d.day);
          return (
            <button
              key={d.day}
              type="button"
              aria-pressed={on}
              onClick={() => setDay(d.day)}
              className={cn(
                "flex w-18 shrink-0 flex-col items-center border border-border py-2 text-muted-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring page-sm:w-auto page-sm:border-0 page-sm:border-l page-sm:first:border-l-0",
                on
                  ? "border-primary bg-[var(--color-pick)] page-sm:shadow-[inset_0_-2px_0_var(--color-primary)]"
                  : "hover:bg-[var(--color-choice-hover)]",
              )}
            >
              <span className="text-[13px] leading-5 font-semibold text-foreground">
                Day {d.day}
              </span>
              {(d.chip || d.day === today) && (
                <span
                  className={cn(
                    "text-[11px] leading-4",
                    d.day === today && "font-semibold text-primary",
                  )}
                >
                  {d.day === today ? "Today" : d.chip}
                </span>
              )}
              <span
                className={cn(
                  "text-[11px] leading-4",
                  n > 0 && "font-semibold text-foreground",
                )}
              >
                {n > 0 ? `${n} on` : "–"}
              </span>
            </button>
          );
        })}
      </div>

      <LoungeCard labelledBy="lounge-day-title" testId="programme-day">
        <LoungeCardHeader
          id="lounge-day-title"
          title={
            <>
              <span className="hidden page-sm:inline">{heading?.title}</span>
              <span className="page-sm:hidden">{heading?.shortTitle}</span>
            </>
          }
          aside={
            onDay.length > 0 ? (
              <span className="whitespace-nowrap">
                {onDay.length} on
                {overlaps > 0 && (
                  <>
                    {" · "}
                    <span className={WARN}>▲</span> {overlaps} overlap
                    {overlaps === 1 ? "" : "s"}
                  </>
                )}
              </span>
            ) : undefined
          }
        />

        {/* A wide window: the day as a table. */}
        <table className={cn(TABLE, "hidden page-sm:table")}>
          <caption className="sr-only">{heading?.title}</caption>
          <colgroup>
            <col className="w-36" />
            <col />
            <col className="w-26" />
            <col className="w-48" />
            {canRun && <col className="w-12" />}
          </colgroup>
          <thead>
            <tr>
              <th scope="col" className={TH}>
                Time
              </th>
              <th scope="col" className={TH}>
                What
              </th>
              <th scope="col" className={TH}>
                Kind
              </th>
              <th scope="col" className={TH}>
                Host
              </th>
              {canRun && (
                <th scope="col" className={TH}>
                  <span className="sr-only">Actions</span>
                </th>
              )}
            </tr>
          </thead>
          <tbody className="[&>tr:first-child>td]:border-t-0">
            {rows.map((row) =>
              row.kind === "gap" ? (
                <tr key={`gap-${row.from}`} className={GAP_ROW}>
                  <td className={cn(TD, "py-2 whitespace-nowrap tabular-nums")}>
                    {gapTime(row)}
                  </td>
                  <td className={cn(TD, "py-2")} colSpan={canRun ? 4 : 3}>
                    {row.all ? "Nothing on yet" : "Nothing on"}
                  </td>
                </tr>
              ) : (
                <tr key={row.item.id} data-testid="programme-item">
                  <td className={cn(TD, "whitespace-nowrap tabular-nums")}>
                    {timeRangeText(
                      row.item.startMinute,
                      row.item.durationMinutes,
                    )}
                    {canRun && <Warn words={warnings.get(row.item.id)} />}
                  </td>
                  <td className={TD}>
                    <span className="block font-semibold break-words">
                      {row.item.title}
                    </span>
                    {row.item.description && (
                      <span
                        className="mt-1 block truncate text-xs leading-4 text-muted-foreground"
                        title={row.item.description}
                      >
                        {row.item.description}
                      </span>
                    )}
                  </td>
                  <td className={TD}>{KIND_LABELS[row.item.kind]}</td>
                  <td className={cn(TD, "truncate")} title={row.item.hostName}>
                    {row.item.hostName}
                  </td>
                  {canRun && (
                    <td className={cn(TD, "pr-2 pl-1 text-right")}>
                      <ItemMenu item={row.item} />
                    </td>
                  )}
                </tr>
              ),
            )}
          </tbody>
        </table>

        {/* A phone: time over what. */}
        <ol className="page-sm:hidden" aria-label={heading?.title}>
          {rows.map((row) =>
            row.kind === "gap" ? (
              <li
                key={`gap-${row.from}`}
                className={cn(
                  "grid grid-cols-[96px_1fr] gap-3 border-t border-border px-4 py-2 first:border-t-0",
                  GAP_ROW,
                )}
              >
                <span className="whitespace-nowrap tabular-nums">
                  {gapTime(row)}
                </span>
                <span>{row.all ? "Nothing on yet" : "Nothing on"}</span>
              </li>
            ) : (
              <li
                key={row.item.id}
                data-testid="programme-item"
                className="grid grid-cols-[96px_1fr_auto] items-start gap-3 border-t border-border px-4 py-3 text-sm leading-5 first:border-t-0"
              >
                <span className="whitespace-nowrap text-muted-foreground tabular-nums">
                  {timeRangeText(
                    row.item.startMinute,
                    row.item.durationMinutes,
                  )}
                  {canRun && <Warn words={warnings.get(row.item.id)} />}
                </span>
                <span className="min-w-0">
                  <span className="block font-semibold break-words">
                    {row.item.title}
                  </span>
                  <span className="mt-1 block text-xs leading-4 text-muted-foreground">
                    {KIND_LABELS[row.item.kind]} · {row.item.hostName}
                  </span>
                </span>
                {canRun ? (
                  <span className="-my-1.5">
                    <ItemMenu item={row.item} />
                  </span>
                ) : (
                  <span />
                )}
              </li>
            ),
          )}
        </ol>

        {/* No signal at the Burn: the paper is what people read there. */}
        <p className="flex items-center gap-2 border-t border-border px-4 py-3 text-xs leading-4 text-muted-foreground page-sm:hidden">
          <Printer className="h-3.5 w-3.5 shrink-0" aria-hidden />
          No signal at the Burn: the printed programme hangs in the lounge.
        </p>
      </LoungeCard>
    </div>
  );
}
