"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Field } from "@camp404/ui/components/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@camp404/ui/components/select";

// The Calendar page's team filter, drawn as the task board's: a labelled
// select. The choice lives in the URL (`?team=`), so the server filters, a
// filtered view can be shared, and a team page's "See all" lands on it.

export interface CalendarFilterOption {
  value: string;
  label: string;
}

/** The select's value for "every event": no `?team=` at all. */
export const ALL_EVENTS = "all";

export function CalendarFilter({
  value,
  teams,
  wholeCamp,
}: {
  /** ALL_EVENTS, the whole-camp value, or a team key. */
  value: string;
  teams: CalendarFilterOption[];
  /** The value that asks for whole-camp events only. */
  wholeCamp: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();

  function choose(next: string) {
    startTransition(() => {
      router.push(
        next === ALL_EVENTS
          ? "/calendar"
          : `/calendar?team=${encodeURIComponent(next)}`,
      );
    });
  }

  return (
    <Field
      label="Team"
      htmlFor="calendar-filter-team"
      className="w-full sm:w-60"
    >
      <Select value={value} onValueChange={choose} disabled={pending}>
        <SelectTrigger id="calendar-filter-team">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL_EVENTS}>All events</SelectItem>
          <SelectItem value={wholeCamp}>Whole camp</SelectItem>
          {teams.map((t) => (
            <SelectItem key={t.value} value={t.value}>
              {t.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  );
}
