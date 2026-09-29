import { AlertTriangle } from "lucide-react";
import type { LoungeDay } from "@camp404/core";
import { LOUNGE_BANDS } from "@camp404/types";
import {
  BAND_NAMES,
  KIND_LABELS,
  bandLabel,
  timeRangeText,
} from "@/lib/lounge-copy";
import {
  cellKey,
  type ProgrammeItem,
  type ProgrammeView,
} from "@/lib/lounge-view";
import { RemoveSlotButton } from "./lounge-controls";

// The lounge programme as the whiteboard drew it (#269): days across, time
// bands down, each placed item in its cell and every empty cell marked Open.
// A wide window gets the grid; a narrow one (a phone, a small window) gets one
// card per day with its items in order and its open bands named, since eight
// columns do not fit. Server-rendered; the only control is the runner's
// "take it off" on each item.

function warningsOf(item: ProgrammeItem): string[] {
  const out = item.clashesWith.map((t) => `Overlaps ${t}`);
  if (item.outside?.day) out.push("Not a day the host ticked");
  if (item.outside?.band) out.push("Not a time the host ticked");
  return out;
}

function Item({ item, canRun }: { item: ProgrammeItem; canRun: boolean }) {
  const warnings = warningsOf(item);
  return (
    <li
      data-testid="programme-item"
      className="relative rounded-md border border-border bg-background/60 px-2 py-1.5"
    >
      <div className={`min-w-0 ${canRun ? "pr-6" : ""}`}>
        <p className="text-xs whitespace-nowrap tabular-nums text-muted-foreground">
          {timeRangeText(item.startMinute, item.durationMinutes)}
        </p>
        <p className="text-sm font-medium leading-snug break-words">
          {item.title}
        </p>
        <p
          className="truncate text-xs text-muted-foreground"
          title={`${KIND_LABELS[item.kind]} · ${item.hostName}`}
        >
          {KIND_LABELS[item.kind]}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {item.hostName}
        </p>
        {warnings.length > 0 && (
          <p className="mt-1 flex items-start gap-1 text-xs text-warning">
            <AlertTriangle className="mt-px h-3 w-3 shrink-0" aria-hidden />
            <span>{warnings.join(". ")}.</span>
          </p>
        )}
      </div>
      {canRun && (
        <span className="absolute top-1 right-1">
          <RemoveSlotButton slotId={item.id} title={item.title} />
        </span>
      )}
    </li>
  );
}

export function ProgrammeGrid({
  view,
  days,
  canRun,
  today,
}: {
  view: ProgrammeView;
  days: readonly LoungeDay[];
  canRun: boolean;
  today: number | null;
}) {
  return (
    <>
      {/* The whiteboard: wide windows only. */}
      <div className="hidden overflow-x-auto rounded-xl border border-border bg-card page-lg:block">
        <table className="w-full min-w-[56rem] table-fixed border-collapse text-left">
          <caption className="sr-only">Lounge programme, days by time</caption>
          <thead>
            <tr>
              <th
                scope="col"
                className="w-28 border-b border-border p-2 text-xs font-medium text-muted-foreground"
              >
                Time
              </th>
              {days.map((d) => (
                <th
                  key={d.day}
                  scope="col"
                  className={`border-b border-l border-border p-2 text-xs font-semibold ${d.day === today ? "text-accent" : ""}`}
                >
                  <span className="block">Day {d.day}</span>
                  {d.date && (
                    <span className="block font-normal text-muted-foreground">
                      {d.short}
                    </span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {LOUNGE_BANDS.map((band) => (
              <tr key={band}>
                <th
                  scope="row"
                  className="border-b border-border p-2 align-top text-xs font-medium"
                >
                  <span className="block">{BAND_NAMES[band]}</span>
                  <span className="block font-normal text-muted-foreground">
                    {bandLabel(band).split(", ")[1]}
                  </span>
                </th>
                {days.map((d) => {
                  const items = view.cells.get(cellKey(d.day, band)) ?? [];
                  return (
                    <td
                      key={d.day}
                      className="border-b border-l border-border p-1.5 align-top"
                    >
                      {items.length === 0 ? (
                        <span className="block px-1 py-1 text-xs text-muted-foreground/70">
                          Open
                        </span>
                      ) : (
                        <ul className="flex flex-col gap-1.5">
                          {items.map((item) => (
                            <Item key={item.id} item={item} canRun={canRun} />
                          ))}
                        </ul>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* One card per day: narrow windows. */}
      <ol
        className="flex flex-col gap-3 page-lg:hidden"
        aria-label="Lounge programme by day"
      >
        {days.map((d) => {
          const items = view.items.filter((i) => i.day === d.day);
          const open = LOUNGE_BANDS.filter(
            (b) => (view.cells.get(cellKey(d.day, b)) ?? []).length === 0,
          );
          return (
            <li
              key={d.day}
              className="rounded-xl border border-border bg-card p-3"
            >
              <h3
                className={`text-sm font-semibold ${d.day === today ? "text-accent" : ""}`}
              >
                {d.label}
                {d.day === today ? " (today)" : ""}
              </h3>
              {items.length > 0 && (
                <ul className="mt-2 flex flex-col gap-1.5">
                  {items.map((item) => (
                    <Item key={item.id} item={item} canRun={canRun} />
                  ))}
                </ul>
              )}
              <p className="mt-2 text-xs text-muted-foreground">
                {open.length === LOUNGE_BANDS.length
                  ? "All open."
                  : open.length === 0
                    ? "No open times."
                    : `Open: ${open.map((b) => BAND_NAMES[b]).join(", ")}.`}
              </p>
            </li>
          );
        })}
      </ol>
    </>
  );
}
