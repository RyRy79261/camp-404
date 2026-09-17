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

// ResponsiveDataTable: declare the columns once, get two layouts. A real
// <table> from md up, and below md the same rows as stacked cards, so a phone
// reads a row down the screen instead of scrolling a wide table sideways.
//
// No state, so it stays server-safe: a server component can pass cell
// functions straight in. Both layouts are in the DOM and CSS hides one, so a
// Playwright locator needs `.filter({ visible: true })`.

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
  cellClassName?: string;
  headClassName?: string;
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
  className?: string;
}

function ResponsiveDataTable<T>({
  columns,
  data,
  getRowKey,
  pairLayout = "inline",
  label,
  className,
}: ResponsiveDataTableProps<T>) {
  const projection = projectColumnsToCard(columns);
  const hasHeading =
    projection.title.length > 0 || projection.badges.length > 0;

  return (
    <div data-slot="responsive-data-table" className={className}>
      <div className="hidden md:block">
        <Table>
          {label ? <caption className="sr-only">{label}</caption> : null}
          <TableHeader>
            <TableRow>
              {columns.map((column) => (
                <TableHead
                  key={column.id}
                  className={cn(
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
                      column.align && alignText[column.align],
                      column.cellClassName,
                    )}
                  >
                    {column.cell(row)}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <ul
        className="flex list-none flex-col gap-3 md:hidden"
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
                  <div key={column.id}>{column.cell(row)}</div>
                ))}
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

export { ResponsiveDataTable };
