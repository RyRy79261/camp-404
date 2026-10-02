"use client";

import * as React from "react";
import {
  ArrowDown,
  ArrowUp,
  ChevronRight,
  Lock,
  MoreHorizontal,
  Plus,
  Trash2,
} from "lucide-react";
import { Button } from "@camp404/ui/components/button";
import { Card } from "@camp404/ui/components/card";
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@camp404/ui/components/dropdown-menu";
import { Input } from "@camp404/ui/components/input";
import { Textarea } from "@camp404/ui/components/textarea";
import { cn } from "@camp404/ui/lib/utils";

// The Join site editor's three parts (approved mock-up, 2026-10-01, Option A):
// a one-line field, Write beside Preview for long text (MarkdownField), and a
// table whose last row is "Add". Each table row keeps its menu (Move up, Move
// down, Delete) in the last column, the same place on every row; a lock marks
// a row that cannot move. On a phone a table is a list: each row is two lines
// and opens its own small form.

/** A card's small pixel-font heading, as on the About cards. */
export function KitTitle({
  icon,
  children,
}: {
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <h3 className="flex items-center gap-2 font-pixel text-[11px] uppercase leading-4 tracking-[0.2em] [&_svg]:size-4 [&_svg]:text-accent">
      {icon}
      {children}
    </h3>
  );
}

/** A card of fields. */
export function FieldCard({
  title,
  description,
  action,
  children,
  className,
}: {
  title?: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn("flex flex-col gap-4 p-4 page-sm:p-5", className)}>
      {title ? (
        <CardHead title={title} description={description} action={action} />
      ) : null}
      {children}
    </Card>
  );
}

function CardHead({
  title,
  description,
  action,
}: {
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
      <div className="flex min-w-0 flex-col gap-1">
        <KitTitle>{title}</KitTitle>
        {description ? (
          <p className="text-[13px] leading-5 text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      {action}
    </div>
  );
}

/** A labelled field: its label in the body font, help under it. */
export function Field({
  label,
  htmlFor,
  help,
  children,
}: {
  label: string;
  htmlFor?: string;
  help?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      {htmlFor ? (
        // A plain label, not the kit's: the OS skin sets that one in small
        // pixel capitals, which the audit found too hard to read on a form.
        <label
          htmlFor={htmlFor}
          className="text-[13px] font-semibold leading-4"
        >
          {label}
        </label>
      ) : (
        <span className="text-[13px] font-semibold leading-4">{label}</span>
      )}
      {children}
      {help ? (
        <p className="text-xs leading-4 text-muted-foreground">{help}</p>
      ) : null}
    </div>
  );
}

/** A text box that grows with its words, one line tall to start. */
export const GrowArea = React.forwardRef<
  HTMLTextAreaElement,
  React.ComponentProps<typeof Textarea>
>(function GrowArea({ className, onKeyDown, ...props }, ref) {
  return (
    <Textarea
      ref={ref}
      rows={1}
      onKeyDown={(e) => {
        // One paragraph: Enter does not start a second.
        if (e.key === "Enter") e.preventDefault();
        onKeyDown?.(e);
      }}
      className={cn(
        "min-h-10 resize-none py-[9px] leading-5 [field-sizing:content]",
        className,
      )}
      {...props}
    />
  );
});

const groupDigits = (n: number) =>
  String(Math.trunc(n)).replace(/\B(?=(\d{3})+(?!\d))/g, " ");

/** Whole rands, typed with an R in front and the thousands spaced. */
export function RandInput({
  value,
  onChange,
  id,
  label,
  placeholder,
}: {
  value: number | null;
  onChange: (rands: number | null) => void;
  id?: string;
  label?: string;
  placeholder?: string;
}) {
  return (
    <div className="flex h-10 items-center rounded-md border border-input bg-background focus-within:ring-2 focus-within:ring-ring">
      <span aria-hidden className="pl-3 pr-2 text-sm text-muted-foreground">
        R
      </span>
      <input
        id={id}
        aria-label={label}
        inputMode="numeric"
        placeholder={placeholder}
        value={value === null || Number.isNaN(value) ? "" : groupDigits(value)}
        onChange={(e) => {
          const digits = e.target.value.replace(/\D/g, "");
          onChange(digits === "" ? null : Number(digits));
        }}
        className="h-full w-full min-w-0 bg-transparent pr-3 text-right text-sm tabular-nums outline-none placeholder:text-muted-foreground"
      />
    </div>
  );
}

// ---- Tables of rows -------------------------------------------------------

export type RowColumn<T> = {
  key: string;
  header: string;
  /** A fixed width (Tailwind w- class); one column is left to grow. */
  width?: string;
  align?: "left" | "center" | "right";
  /** The column's control. `id` and `label` name it for its row. */
  cell: (
    row: T,
    set: (next: T) => void,
    a11y: { id: string; label: string; index: number },
  ) => React.ReactNode;
};

export type RowGroup<T> = {
  /** A label row above the group ("BEFORE THE BURN"). */
  label?: string;
  rows: T[];
  onChange: (rows: T[]) => void;
  /** The add row's words: "Add a schedule line". */
  addLabel: string;
  blank: () => T;
  /** A row that cannot move: drawn before or after the group's own rows. */
  fixedBefore?: FixedRow;
  fixedAfter?: FixedRow;
  /** At most this many rows; the add row hides at the limit. */
  max?: number;
};

export type FixedRow = {
  /** The row's cells, in the table's column order, without the menu cell. */
  cells: React.ReactNode[];
  /** The same row on a phone. */
  phone: React.ReactNode;
  /** Why it cannot move ("Always first"). */
  lockTitle: string;
};

function move<T>(rows: T[], from: number, to: number): T[] {
  const next = [...rows];
  const [row] = next.splice(from, 1);
  next.splice(to, 0, row!);
  return next;
}

export function RowMenu({
  name,
  index,
  count,
  onMove,
  onDelete,
}: {
  name: string;
  index: number;
  count: number;
  onMove: (to: number) => void;
  onDelete: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-8 text-muted-foreground"
          aria-label={`${name}: move or delete`}
        >
          <MoreHorizontal aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          disabled={index === 0}
          onSelect={() => onMove(index - 1)}
        >
          <ArrowUp className="size-4" aria-hidden />
          Move up
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={index === count - 1}
          onSelect={() => onMove(index + 1)}
        >
          <ArrowDown className="size-4" aria-hidden />
          Move down
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={onDelete}
          className="text-destructive focus:text-destructive"
        >
          <Trash2 className="size-4" aria-hidden />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function AddChip() {
  return (
    <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-md border border-border bg-secondary text-accent">
      <Plus className="size-4" aria-hidden />
    </span>
  );
}

const ALIGN = { left: "text-left", center: "text-center", right: "text-right" };

/**
 * A table of rows a captain edits in place, with "Add" as its last row. From
 * a medium window up it is a table; below that, a list whose rows open a small
 * form (the controls are the same columns, each with its label).
 */
export function RowTable<T>({
  name,
  columns,
  groups,
  rowName,
  phoneLine,
}: {
  /** The table's name, for screen readers ("Schedule"). */
  name: string;
  columns: RowColumn<T>[];
  groups: RowGroup<T>[];
  /** One row's name for its menu and its form ("Line 3", "The lounge"). */
  rowName: (row: T, index: number) => string;
  /** One row on a phone: its main line and an optional second line. */
  phoneLine: (row: T) => { main: string; sub?: string; lead?: React.ReactNode };
}) {
  const [editing, setEditing] = React.useState<{
    group: number;
    index: number;
  } | null>(null);
  const id = React.useId();
  const span = columns.length + 1;
  const open = editing ? groups[editing.group] : undefined;
  const openRow = open && editing ? open.rows[editing.index] : undefined;

  return (
    <>
      <div className="hidden page-md:block">
        <table aria-label={name} className="w-full table-fixed text-sm">
          <thead>
            <tr className="border-b border-border/70">
              {columns.map((c, i) => (
                <th
                  key={c.key}
                  scope="col"
                  className={cn(
                    "px-3 py-2 text-xs font-semibold text-muted-foreground",
                    ALIGN[c.align ?? "left"],
                    c.width,
                    i === 0 && "pl-5",
                  )}
                >
                  {c.header}
                </th>
              ))}
              <th scope="col" className="w-14 pr-4">
                <span className="sr-only">Move or delete</span>
              </th>
            </tr>
          </thead>
          {groups.map((g, gi) => (
            <tbody key={gi}>
              {g.label ? (
                <tr className="border-t border-border/70 bg-muted/40">
                  <td
                    colSpan={span}
                    className="py-2 pl-5 font-pixel text-[10px] uppercase tracking-[0.15em] text-muted-foreground"
                  >
                    {g.label}
                  </td>
                </tr>
              ) : null}
              {g.fixedBefore ? <FixedTableRow row={g.fixedBefore} /> : null}
              {g.rows.map((row, ri) => {
                const label = `${g.label ? `${g.label}, ` : ""}${rowName(row, ri)}`;
                const set = (next: T) =>
                  g.onChange(g.rows.map((r, j) => (j === ri ? next : r)));
                return (
                  <tr
                    key={ri}
                    className="border-t border-border/70 first:border-t-0"
                  >
                    {columns.map((c, ci) => (
                      <td
                        key={c.key}
                        className={cn(
                          "px-3 py-2 align-top",
                          ALIGN[c.align ?? "left"],
                          ci === 0 && "pl-5",
                        )}
                      >
                        {c.cell(row, set, {
                          id: `${id}-${gi}-${ri}-${c.key}`,
                          label: `${c.header}, ${label}`,
                          index: ri,
                        })}
                      </td>
                    ))}
                    <td className="py-2 pr-4 text-right align-top">
                      <div className="pt-1">
                        <RowMenu
                          name={label}
                          index={ri}
                          count={g.rows.length}
                          onMove={(to) => g.onChange(move(g.rows, ri, to))}
                          onDelete={() =>
                            g.onChange(g.rows.filter((_, j) => j !== ri))
                          }
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
              {g.max === undefined || g.rows.length < g.max ? (
                <tr className="border-t border-dashed border-border/70">
                  <td colSpan={span} className="py-2 pl-5">
                    <button
                      type="button"
                      onClick={() => g.onChange([...g.rows, g.blank()])}
                      className="inline-flex items-center gap-3 text-[13px] font-semibold hover:text-accent"
                    >
                      <AddChip />
                      {g.addLabel}
                    </button>
                  </td>
                </tr>
              ) : null}
              {g.fixedAfter ? <FixedTableRow row={g.fixedAfter} /> : null}
            </tbody>
          ))}
        </table>
      </div>

      <div
        className="flex flex-col page-md:hidden"
        role="group"
        aria-label={name}
      >
        {groups.map((g, gi) => (
          <React.Fragment key={gi}>
            {g.label ? (
              <p className="border-t border-border/70 bg-muted/40 px-4 py-2 font-pixel text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
                {g.label}
              </p>
            ) : null}
            {g.fixedBefore ? (
              <div className="border-t border-border/70 px-4 py-3">
                {g.fixedBefore.phone}
              </div>
            ) : null}
            {g.rows.map((row, ri) => {
              const line = phoneLine(row);
              return (
                <button
                  key={ri}
                  type="button"
                  onClick={() => setEditing({ group: gi, index: ri })}
                  className={cn(
                    "grid w-full items-center gap-3 border-t border-border/70 px-4 py-3 text-left first:border-t-0",
                    line.lead
                      ? "grid-cols-[auto_minmax(0,1fr)_1.25rem]"
                      : "grid-cols-[minmax(0,1fr)_1.25rem]",
                  )}
                >
                  {line.lead ? <span>{line.lead}</span> : null}
                  <span className="min-w-0">
                    <span className="line-clamp-2 text-sm leading-5">
                      {line.main || (
                        <span className="text-muted-foreground">Empty</span>
                      )}
                    </span>
                    {line.sub ? (
                      <span className="block truncate text-[13px] leading-[18px] text-muted-foreground">
                        {line.sub}
                      </span>
                    ) : null}
                  </span>
                  <ChevronRight
                    className="size-4 justify-self-end text-muted-foreground"
                    aria-hidden
                  />
                </button>
              );
            })}
            {g.max === undefined || g.rows.length < g.max ? (
              <button
                type="button"
                onClick={() => {
                  g.onChange([...g.rows, g.blank()]);
                  setEditing({ group: gi, index: g.rows.length });
                }}
                className="flex w-full items-center gap-3 border-t border-dashed border-border/70 px-4 py-3 text-left text-[13px] font-semibold"
              >
                <AddChip />
                {g.addLabel}
              </button>
            ) : null}
            {g.fixedAfter ? (
              <div className="border-t border-border/70 px-4 py-3">
                {g.fixedAfter.phone}
              </div>
            ) : null}
          </React.Fragment>
        ))}
      </div>

      <Dialog
        open={openRow !== undefined}
        onOpenChange={(o) => (o ? null : setEditing(null))}
      >
        {open && editing && openRow !== undefined ? (
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {open.label ? `${open.label}, ` : ""}
                {rowName(openRow, editing.index)}
              </DialogTitle>
              <DialogDescription>
                {name}. Changes are kept until you save the page.
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-4">
              {columns.map((c) => {
                const cid = `${id}-sheet-${c.key}`;
                return (
                  <Field key={c.key} label={c.header} htmlFor={cid}>
                    {c.cell(
                      openRow,
                      (next) =>
                        open.onChange(
                          open.rows.map((r, j) =>
                            j === editing.index ? next : r,
                          ),
                        ),
                      { id: cid, label: c.header, index: editing.index },
                    )}
                  </Field>
                );
              })}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant="secondary"
                disabled={editing.index === 0}
                onClick={() => {
                  open.onChange(
                    move(open.rows, editing.index, editing.index - 1),
                  );
                  setEditing({ ...editing, index: editing.index - 1 });
                }}
              >
                <ArrowUp aria-hidden />
                Move up
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={editing.index === open.rows.length - 1}
                onClick={() => {
                  open.onChange(
                    move(open.rows, editing.index, editing.index + 1),
                  );
                  setEditing({ ...editing, index: editing.index + 1 });
                }}
              >
                <ArrowDown aria-hidden />
                Move down
              </Button>
            </div>
            <DialogFooter className="flex-row justify-between gap-2 sm:justify-between">
              <Button
                type="button"
                variant="ghost"
                className="text-destructive"
                onClick={() => {
                  open.onChange(
                    open.rows.filter((_, j) => j !== editing.index),
                  );
                  setEditing(null);
                }}
              >
                <Trash2 aria-hidden />
                Delete
              </Button>
              <Button type="button" onClick={() => setEditing(null)}>
                Done
              </Button>
            </DialogFooter>
          </DialogContent>
        ) : null}
      </Dialog>
    </>
  );
}

function FixedTableRow({ row }: { row: FixedRow }) {
  return (
    <tr className="border-t border-border/70 first:border-t-0">
      {row.cells.map((cell, i) => (
        <td key={i} className={cn("px-3 py-2 align-top", i === 0 && "pl-5")}>
          {cell}
        </td>
      ))}
      <td className="py-2 pr-4 text-right align-top">
        <span
          title={row.lockTitle}
          aria-label={row.lockTitle}
          className="inline-flex size-8 items-center justify-center pt-1 text-muted-foreground/60"
        >
          <Lock className="size-4" aria-hidden />
        </span>
      </td>
    </tr>
  );
}

/** A row's text control inside a table: a single line that grows. */
export function CellArea({
  value,
  onChange,
  a11y,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  a11y: { id: string; label: string; index?: number };
  placeholder?: string;
}) {
  return (
    <GrowArea
      id={a11y.id}
      aria-label={a11y.label}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

export function CellInput({
  value,
  onChange,
  a11y,
  placeholder,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  a11y: { id: string; label: string; index?: number };
  placeholder?: string;
  className?: string;
}) {
  return (
    <Input
      id={a11y.id}
      aria-label={a11y.label}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className={className}
    />
  );
}
