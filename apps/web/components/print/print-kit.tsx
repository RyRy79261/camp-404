import type { ReactNode } from "react";
import { CAMP_TIME_ZONE } from "@camp404/core";
import { cn } from "@camp404/ui/lib/utils";

// The small parts the list prints share (#249's prints round: the shopping
// list, recipe book, prep plan, burn timeline and loading checklist, as the
// owner approved them in design/prints-round.html, 2026-10-02): a drawn tick
// box, the table's head and cell styles, a grey group row, and the date a
// sheet was printed. Black on white, sized for A4.

const PRINTED = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: CAMP_TIME_ZONE,
});

/** "18 Apr 2027": the day a sheet was printed, on the camp's clock. */
export function printedOn(date: Date): string {
  return PRINTED.format(date);
}

/** A box to tick by hand: drawn, never ticked. */
export function TickBox() {
  return (
    <span
      aria-hidden
      className="inline-block h-[11px] w-[11px] border-[1.4px] border-neutral-900 align-[-2px]"
    />
  );
}

/** A list table: thin grey rules between rows, small type that prints clearly. */
export const LIST_TABLE = "w-full border-collapse text-[11.5px]";

/** A column head. */
export const LIST_TH =
  "border-b-[1.5px] border-neutral-900 px-[5px] py-1 text-left text-[9.5px] font-semibold tracking-[0.05em] text-neutral-700";

/** A cell. */
export const LIST_TD = "border-b border-neutral-300 px-[5px] py-1 align-top";

/** The grey row that starts a group: "PRODUCE", "TAFELBERG WHOLESALE 14 lines". */
export function GroupRow({
  colSpan,
  children,
  aside,
  plain = false,
}: {
  colSpan: number;
  children: ReactNode;
  /** Small words after the name: "14 lines", "on site". */
  aside?: ReactNode;
  /** A day heading rather than an uppercase group name. */
  plain?: boolean;
}) {
  return (
    <tr className="break-inside-avoid break-after-avoid">
      <th
        colSpan={colSpan}
        scope="colgroup"
        className={cn(
          "border-b border-neutral-500 bg-neutral-100 px-1.5 py-1 text-left",
          plain
            ? "text-[11px] font-bold"
            : "text-[10px] font-bold uppercase tracking-[0.12em] text-neutral-800",
        )}
      >
        {children}
        {aside && (
          <small className="ml-1.5 text-[9.5px] font-medium normal-case tracking-[0.02em] text-neutral-600">
            {aside}
          </small>
        )}
      </th>
    </tr>
  );
}

/** A small date line inside a group: "Sat 17 Apr". */
export function DateRow({
  colSpan,
  children,
}: {
  colSpan: number;
  children: ReactNode;
}) {
  return (
    <tr className="break-after-avoid">
      <th
        colSpan={colSpan}
        scope="rowgroup"
        className="border-b border-neutral-300 px-[5px] pt-1.5 pb-1 text-left text-[10px] font-semibold text-neutral-800"
      >
        {children}
      </th>
    </tr>
  );
}
