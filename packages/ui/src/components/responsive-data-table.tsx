import * as React from "react";

import { cn } from "../lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./table";
import { TableFit } from "./table-fit";

// ResponsiveDataTable: declare the columns once, get two layouts. A real
// <table> when the TABLE's own box is wide enough, and otherwise the same rows
// as stacked cards, so a phone or a narrow window reads a row down the screen
// instead of scrolling a wide table sideways.
//
// The switch asks how wide the table's box is (a container query on the
// table itself), never the screen: a program window is narrower than the
// screen, and a table laid out by the screen ran past the window's edge with
// its row buttons out of sight. `stackBelow` names the box width a table
// needs; TableFit then measures, and stacks the rows whenever the table would
// still run past its box. Text columns wrap (or cut with an ellipsis and a
// tooltip, `truncate`), and the actions column keeps its own width on the
// right (put a RowActions in it).
//
// Server-safe: a server component can pass cell functions straight in (only
// the small TableFit guard is a client component). Both layouts are in the
// DOM and CSS hides one, so a Playwright locator needs
// `.filter({ visible: true })`.

/**
 * Where a column goes in the phone card. The table always shows every column in
 * declaration order.
 * - `title`   the card heading (a member's name).
 * - `badge`   a chip beside the title.
 * - `actions` controls in the card footer.
 * - `default` a label and value pair, labelled with the column header.
 */
export type ResponsiveColumnRole = "title" | "badge" | "actions" | "default";

export interface ResponsiveColumn<T> {
  /** Unique within the set. */
  id: string;
  /** The <th> text, and the label of the card pair. */
  header: React.ReactNode;
  cell: (row: T) => React.ReactNode;
  /** Defaults to "default". */
  role?: ResponsiveColumnRole;
  /** Leave this column out of the card. The table still shows it. */
  mobileHidden?: boolean;
  /** Keep the <th> for screen readers only (an actions column). */
  hideHeader?: boolean;
  align?: "left" | "right" | "center";
  /**
   * Keep the cell to one line, cut with an ellipsis, with the full text as
   * its tooltip. Returns that full text. Without it a text cell wraps.
   */
  truncate?: (row: T) => string;
  cellClassName?: string;
  headClassName?: string;
  /**
   * Classes for the column's box in the card: `w-full` lets an actions
   * column's control span the card's footer (a two-way choice under the
   * thumb).
   */
  cardClassName?: string;
}

/** Which columns go in which card slot. Pure data, so it is tested directly. */
export interface CardProjection<T> {
  title: ResponsiveColumn<T>[];
  badges: ResponsiveColumn<T>[];
  actions: ResponsiveColumn<T>[];
  pairs: ResponsiveColumn<T>[];
  hidden: ResponsiveColumn<T>[];
}

/**
 * Sort a column set into card slots. `mobileHidden` wins over any role, and
 * declaration order holds within each slot.
 */
export function projectColumnsToCard<T>(
  columns: readonly ResponsiveColumn<T>[],
): CardProjection<T> {
  const projection: CardProjection<T> = {
    title: [],
    badges: [],
    actions: [],
    pairs: [],
    hidden: [],
  };
  for (const column of columns) {
    if (column.mobileHidden) projection.hidden.push(column);
    else if (column.role === "title") projection.title.push(column);
    else if (column.role === "badge") projection.badges.push(column);
    else if (column.role === "actions") projection.actions.push(column);
    else projection.pairs.push(column);
  }
  return projection;
}

const alignText = {
  left: "text-left",
  right: "text-right",
  center: "text-center",
} as const;

/**
 * The table's box width below which the rows are cards (the kit's widths:
 * sm 40rem, md 48rem, lg 64rem, xl 80rem). Literal class names, so Tailwind
 * generates them.
 */
export type StackBelow = "sm" | "md" | "lg" | "xl";

const SHOW_TABLE: Record<StackBelow, string> = {
  sm: "@min-[40rem]/rdt:block",
  md: "@min-[48rem]/rdt:block",
  lg: "@min-[64rem]/rdt:block",
  xl: "@min-[80rem]/rdt:block",
};
const HIDE_CARDS: Record<StackBelow, string> = {
  sm: "@min-[40rem]/rdt:hidden",
  md: "@min-[48rem]/rdt:hidden",
  lg: "@min-[64rem]/rdt:hidden",
  xl: "@min-[80rem]/rdt:hidden",
};

/** The card frame a table sits in (only the table: cards are their own). */
const TABLE_FRAME = "rounded-xl border bg-card text-card-foreground shadow-sm";

/** How a cell wraps, by its column. */
function cellWrapClass<T>(column: ResponsiveColumn<T>): string {
  if (column.role === "actions") return "w-px whitespace-nowrap";
  if (column.role === "badge") return "whitespace-nowrap";
  if (column.truncate) return "max-w-56";
  return "whitespace-normal break-words";
}

function CellContent<T>({
  column,
  row,
}: {
  column: ResponsiveColumn<T>;
  row: T;
}) {
  if (!column.truncate) return <>{column.cell(row)}</>;
  return (
    <span className="block truncate" title={column.truncate(row)}>
      {column.cell(row)}
    </span>
  );
}

export interface ResponsiveDataTableProps<T> {
  columns: readonly ResponsiveColumn<T>[];
  data: readonly T[];
  getRowKey: (row: T) => string;
  /**
   * Card pairs side by side (short labels) or label above value (long labels,
   * such as a question's prompt).
   */
  pairLayout?: "inline" | "stacked";
  /** Names the table (as a caption) and the card list. */
  label?: string;
  /**
   * The table's box width below which rows are cards. A table with many
   * columns asks for more (`lg`) so the window it opens in shows cards.
   * Whatever this says, rows become cards when the table would not fit.
   */
  stackBelow?: StackBelow;
  /** Draw the table in a card frame (the cards are framed on their own). */
  framed?: boolean;
  className?: string;
}

function ResponsiveDataTable<T>({
  columns,
  data,
  getRowKey,
  pairLayout = "inline",
  label,
  stackBelow = "md",
  framed = false,
  className,
}: ResponsiveDataTableProps<T>) {
  const projection = projectColumnsToCard(columns);
  const hasHeading =
    projection.title.length > 0 || projection.badges.length > 0;

  return (
    <TableFit
      data-slot="responsive-data-table"
      className={cn("group/rdt @container/rdt w-full", className)}
    >
      <div
        data-rdt-layout="table"
        className={cn(
          "hidden",
          SHOW_TABLE[stackBelow],
          "group-data-[stacked=true]/rdt:hidden!",
          framed && TABLE_FRAME,
        )}
      >
        <Table>
          {label ? <caption className="sr-only">{label}</caption> : null}
          <TableHeader>
            <TableRow>
              {columns.map((column) => (
                <TableHead
                  key={column.id}
                  className={cn(
                    column.role === "actions"
                      ? "w-px"
                      : column.role !== "badge" && "whitespace-normal",
                    column.align && alignText[column.align],
                    column.headClassName,
                  )}
                >
                  {column.hideHeader ? (
                    <span className="sr-only">{column.header}</span>
                  ) : (
                    column.header
                  )}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((row) => (
              <TableRow key={getRowKey(row)}>
                {columns.map((column) => (
                  <TableCell
                    key={column.id}
                    className={cn(
                      "align-top",
                      cellWrapClass(column),
                      column.align && alignText[column.align],
                      column.cellClassName,
                    )}
                  >
                    <CellContent column={column} row={row} />
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <ul
        data-rdt-layout="cards"
        className={cn(
          "flex list-none flex-col gap-3",
          HIDE_CARDS[stackBelow],
          "group-data-[stacked=true]/rdt:flex!",
        )}
        aria-label={label}
      >
        {data.map((row) => (
          <li
            key={getRowKey(row)}
            className="flex flex-col gap-3 rounded-xl border bg-card p-4 text-card-foreground"
          >
            {hasHeading && (
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1 space-y-1">
                  {projection.title.map((column) => (
                    <div key={column.id} className="text-base font-medium">
                      {column.cell(row)}
                    </div>
                  ))}
                </div>
                {projection.badges.length > 0 && (
                  <div className="flex shrink-0 items-center gap-2">
                    {projection.badges.map((column) => (
                      <div key={column.id}>{column.cell(row)}</div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {projection.pairs.length > 0 && (
              <dl className="flex flex-col gap-2">
                {projection.pairs.map((column) =>
                  pairLayout === "stacked" ? (
                    <div key={column.id} className="flex flex-col gap-0.5">
                      <dt className="text-xs text-muted-foreground">
                        {column.header}
                      </dt>
                      <dd className="text-sm break-words">
                        {column.cell(row)}
                      </dd>
                    </div>
                  ) : (
                    <div
                      key={column.id}
                      className="flex items-baseline justify-between gap-3"
                    >
                      <dt className="shrink-0 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        {column.header}
                      </dt>
                      <dd
                        className={cn(
                          "min-w-0 text-sm break-words",
                          column.align === "left" ? "text-left" : "text-right",
                        )}
                      >
                        {column.cell(row)}
                      </dd>
                    </div>
                  ),
                )}
              </dl>
            )}

            {projection.actions.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 border-t pt-3">
                {projection.actions.map((column) => (
                  <div key={column.id} className={column.cardClassName}>
                    {column.cell(row)}
                  </div>
                ))}
              </div>
            )}
          </li>
        ))}
      </ul>
    </TableFit>
  );
}

export { ResponsiveDataTable };
