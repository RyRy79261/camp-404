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

// The meetings list's team filter, drawn as the Calendar page's: a labelled
// select whose choice lives in the URL (`?team=`), so the server filters and a
// team page's "See all meetings" lands on it.

export interface MeetingsFilterOption {
  value: string;
  label: string;
}

/** The select's value for "every meeting": no `?team=` at all. */
export const ALL_MEETINGS = "all";

export function MeetingsFilter({
  value,
  teams,
  wholeCamp,
}: {
  value: string;
  teams: MeetingsFilterOption[];
  /** The value that asks for whole-camp meetings only. */
  wholeCamp: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();

  function choose(next: string) {
    startTransition(() => {
      router.push(
        next === ALL_MEETINGS
          ? "/meetings"
          : `/meetings?team=${encodeURIComponent(next)}`,
      );
    });
  }

  return (
    <Field
      label="Team"
      htmlFor="meetings-filter-team"
      className="w-full sm:w-60"
    >
      <Select value={value} onValueChange={choose} disabled={pending}>
        <SelectTrigger id="meetings-filter-team">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL_MEETINGS}>All meetings</SelectItem>
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
