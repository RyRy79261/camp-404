"use client";

import * as React from "react";
import Link from "next/link";
import { SlidersHorizontal } from "lucide-react";
import { Button } from "@camp404/ui/components/button";
import { Input } from "@camp404/ui/components/input";
import { cn } from "@camp404/ui/lib/utils";
import { NativeSelect, type SelectOption } from "./native-select";

// The gear list's filter strip (#246 redesign, AfrikaBurn's Registrations
// filters): the search and labelled selects on one row, each select applying
// as it changes, and a Clear link. A plain GET form underneath, so the list
// stays a server render and a filtered view is a link; the search applies on
// Enter. On a phone the selects fold behind one "Filters" button.

/** The filter boxes wear the window's choice tint, like AfrikaBurn's. */
export const FILTER_BOX =
  "h-9 rounded-none border-[var(--color-choice-edge,var(--color-input))] bg-[var(--color-choice,var(--color-background))]";

export interface GearFilterValues {
  q: string;
  team: string;
  condition: string;
  location: string;
}

function Labelled({
  label,
  className,
  labelClassName,
  children,
}: {
  label: string;
  className?: string;
  labelClassName?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={cn("flex flex-col gap-1.5", className)}>
      <span
        className={cn(
          "text-xs font-semibold tracking-[0.06em] text-muted-foreground uppercase",
          labelClassName,
        )}
      >
        {label}
      </span>
      {children}
    </label>
  );
}

export function GearFilters({
  action,
  values,
  teams,
  conditions,
  locations,
}: {
  action: string;
  values: GearFilterValues;
  teams: SelectOption[];
  conditions: SelectOption[];
  locations: SelectOption[];
}) {
  const form = React.useRef<HTMLFormElement>(null);
  const narrowed = [values.team, values.condition, values.location].filter(
    Boolean,
  ).length;
  const [open, setOpen] = React.useState(narrowed > 0);
  const apply = () => form.current?.requestSubmit();
  const any = narrowed > 0 || values.q !== "";

  return (
    <form
      ref={form}
      method="get"
      action={action}
      role="search"
      aria-label="Filter the gear"
      className="mb-3 flex flex-col gap-3 page-md:mb-5 page-md:flex-row page-md:items-end page-md:gap-4"
    >
      <div className="flex min-w-0 flex-1 items-end gap-2">
        {/* The box's own placeholder names it on a phone (the mock-up). */}
        <Labelled
          label="Search"
          className="min-w-0 flex-1"
          labelClassName="hidden page-md:block"
        >
          <Input
            name="q"
            type="search"
            defaultValue={values.q}
            placeholder="Search the gear"
            aria-label="Search the gear"
            className={cn("h-9", FILTER_BOX)}
          />
        </Labelled>
        <Button
          type="button"
          variant="outline"
          className="h-9 page-md:hidden"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
        >
          <SlidersHorizontal aria-hidden />
          Filters{narrowed ? ` (${narrowed})` : ""}
        </Button>
      </div>
      <div
        className={cn(
          "grid-cols-2 gap-3 page-md:flex page-md:items-end page-md:gap-4",
          open ? "grid" : "hidden",
        )}
      >
        <Labelled label="Team" className="page-md:w-36">
          <NativeSelect
            name="team"
            aria-label="Team"
            placeholder="All teams"
            options={teams}
            defaultValue={values.team}
            onChange={apply}
            selectClassName={FILTER_BOX}
          />
        </Labelled>
        <Labelled label="Condition" className="page-md:w-36">
          <NativeSelect
            name="condition"
            aria-label="Condition"
            placeholder="Any"
            options={conditions}
            defaultValue={values.condition}
            onChange={apply}
            selectClassName={FILTER_BOX}
          />
        </Labelled>
        <Labelled label="Where" className="page-md:w-36">
          <NativeSelect
            name="location"
            aria-label="Where"
            placeholder="Anywhere"
            options={locations}
            defaultValue={values.location}
            onChange={apply}
            selectClassName={FILTER_BOX}
          />
        </Labelled>
      </div>
      {/* Enter in the search box sends the form; the button is for a
          screen reader or a keyboard that wants one. */}
      <button type="submit" className="sr-only">
        Apply filters
      </button>
      {any && (
        <Link
          href={action}
          className="flex h-9 items-center text-[13px] text-muted-foreground underline underline-offset-4 hover:text-foreground"
        >
          Clear
        </Link>
      )}
    </form>
  );
}

/**
 * A filter strip of selects only (Needs this year: Team, Show), applying as
 * one changes. Same GET form as the gear's.
 */
export function SelectFilters({
  action,
  label,
  selects,
  className,
}: {
  action: string;
  label: string;
  className?: string;
  selects: {
    name: string;
    label: string;
    placeholder?: string;
    options: SelectOption[];
    value: string;
  }[];
}) {
  const form = React.useRef<HTMLFormElement>(null);
  const narrowed = selects.filter((s) => s.value !== "").length;
  const any = narrowed > 0;
  // Shows in a row on desktop; on a phone it folds behind one "Filters"
  // button (the Gear tab's own GearFilters does the same), open by default
  // only once a filter already narrows the list.
  const [open, setOpen] = React.useState(narrowed > 0);
  return (
    <form
      ref={form}
      method="get"
      action={action}
      role="search"
      aria-label={label}
      className={cn("mb-5 flex flex-col gap-3 page-md:flex-row", className)}
    >
      <Button
        type="button"
        variant="outline"
        className="h-9 w-fit page-md:hidden"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <SlidersHorizontal aria-hidden />
        Filters{narrowed ? ` (${narrowed})` : ""}
      </Button>
      <div
        className={cn(
          "grid-cols-2 items-end gap-3 page-md:flex page-md:gap-4",
          open ? "grid" : "hidden",
        )}
      >
        {selects.map((s) => (
          <Labelled key={s.name} label={s.label} className="page-md:w-52">
            <NativeSelect
              name={s.name}
              aria-label={s.label}
              placeholder={s.placeholder}
              options={s.options}
              defaultValue={s.value}
              onChange={() => form.current?.requestSubmit()}
              selectClassName={FILTER_BOX}
            />
          </Labelled>
        ))}
        <button type="submit" className="sr-only">
          Apply filters
        </button>
        {any && (
          <Link
            href={action}
            className="flex h-9 items-center text-[13px] text-muted-foreground underline underline-offset-4 hover:text-foreground"
          >
            Clear
          </Link>
        )}
      </div>
    </form>
  );
}
