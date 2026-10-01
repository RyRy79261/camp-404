import * as React from "react";

import { cn } from "../lib/utils";

// The read-only view of a form (AfrikaBurn's FieldList, from its
// registration review). A viewer who cannot edit sees CONTENT: the same
// labels the edit form uses, each over its value, in the form's columns. Never
// the form with its inputs disabled, and never a greyed toolbar. Who may
// change it goes in one quiet EditorsNote line, not a lock banner.
// Server-safe (no state).

export interface FieldSpec {
  label: string;
  value: React.ReactNode;
  /** Run across both columns (long text). */
  wide?: boolean;
}

function isEmpty(value: React.ReactNode): boolean {
  return value == null || value === "" || value === "—";
}

export interface FieldListProps {
  fields: readonly FieldSpec[];
  /** Two columns from page-sm up, like a two-column form; or one. */
  columns?: 1 | 2;
  /** Said for a field with no value. */
  emptyText?: string;
  className?: string;
}

/** A definition list of read-only fields. */
function FieldList({
  fields,
  columns = 2,
  emptyText = "Not provided",
  className,
}: FieldListProps) {
  return (
    <dl
      data-slot="field-list"
      className={cn(
        "grid gap-x-8 gap-y-4",
        columns === 2 && "page-sm:grid-cols-2",
        className,
      )}
    >
      {fields.map((f, i) => (
        <div
          key={`${f.label}-${i}`}
          className={f.wide && columns === 2 ? "page-sm:col-span-2" : undefined}
        >
          <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {f.label}
          </dt>
          <dd
            className={
              isEmpty(f.value)
                ? "mt-1 text-sm italic text-muted-foreground/70"
                : "mt-1 text-sm whitespace-pre-wrap text-foreground"
            }
          >
            {isEmpty(f.value) ? emptyText : f.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** A yes/no field as words, or a dash when it was never answered. */
function yesNo(value: boolean | null | undefined): string {
  if (value == null) return "—";
  return value ? "Yes" : "No";
}

/**
 * The one quiet line that tells a read-only viewer who changes this
 * ("Captains and Power & Lighting leads change the load list."). It stands
 * in for the lock banner, the greyed Add button and the dead icons.
 */
function EditorsNote({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="editors-note"
      className={cn("text-xs text-muted-foreground", className)}
      {...props}
    />
  );
}

export { FieldList, EditorsNote, yesNo };
