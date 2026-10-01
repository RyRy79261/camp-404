"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@camp404/ui/components/button";
import { DateControl } from "@camp404/ui/components/date-control";
import { Field } from "@camp404/ui/components/field";
import { Input } from "@camp404/ui/components/input";
import { Spinner } from "@camp404/ui/components/spinner";
import { toast } from "@camp404/ui/components/toast";
import {
  AddVolunteerShiftInput,
  VOLUNTEER_DEPARTMENT_MAX,
} from "@camp404/types";
import {
  addVolunteerShiftAction,
  removeVolunteerShiftAction,
} from "@/app/(console)/shifts/actions";
import { minutesFromClock } from "@/lib/shifts-copy";

// A member's own AfrikaBurn volunteer shifts (#248): Rangers, Greeters,
// Sanctuary. Not ours to fill; listed only so the member's camp shifts can
// warn about a clash. Only they see them. A problem with what was typed
// shows beside it; removing one is a one-tap change, so its failure is a
// toast.

type Errors = Partial<Record<"department" | "day" | "start" | "end", string>>;

const EMPTY = { department: "", day: "", start: "", end: "" };

export function AddVolunteerShift() {
  const router = useRouter();
  const [form, setForm] = React.useState(EMPTY);
  const [errors, setErrors] = React.useState<Errors>({});
  const [error, setError] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const startMinute = minutesFromClock(form.start);
    const endMinute = minutesFromClock(form.end);
    const next: Errors = {};
    if (startMinute === null) next.start = "Pick a start time.";
    if (endMinute === null) next.end = "Pick an end time.";
    const payload = {
      department: form.department,
      day: form.day,
      startMinute: startMinute ?? -1,
      durationMinutes:
        startMinute !== null && endMinute !== null
          ? (endMinute - startMinute + 1440) % 1440 || 1440
          : 0,
    };
    const check = AddVolunteerShiftInput.safeParse(payload);
    if (!check.success) {
      for (const issue of check.error.issues) {
        const field = String(issue.path[0]);
        const key = (
          field === "startMinute"
            ? "start"
            : field === "durationMinutes"
              ? "end"
              : field
        ) as keyof Errors;
        next[key] ??= issue.message;
      }
    }
    if (Object.keys(next).length > 0 || !check.success) {
      setErrors(next);
      return;
    }
    setErrors({});
    start(async () => {
      const result = await addVolunteerShiftAction(check.data);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setForm(EMPTY);
      router.refresh();
    });
  }

  return (
    <form
      onSubmit={submit}
      noValidate
      aria-label="Add an AfrikaBurn shift"
      className="flex flex-col gap-3"
    >
      <div className="grid gap-3 page-sm:grid-cols-2 page-md:grid-cols-4">
        <Field
          label="Department"
          htmlFor="volunteer-department"
          error={errors.department}
        >
          <Input
            id="volunteer-department"
            value={form.department}
            maxLength={VOLUNTEER_DEPARTMENT_MAX}
            placeholder="Rangers"
            onChange={(e) =>
              setForm((f) => ({ ...f, department: e.target.value }))
            }
            aria-invalid={errors.department ? true : undefined}
          />
        </Field>
        <Field label="Day" htmlFor="volunteer-day" error={errors.day}>
          <DateControl
            id="volunteer-day"
            value={form.day}
            onChange={(e) => setForm((f) => ({ ...f, day: e.target.value }))}
            aria-invalid={errors.day ? true : undefined}
          />
        </Field>
        <Field label="Starts" htmlFor="volunteer-start" error={errors.start}>
          <Input
            id="volunteer-start"
            type="time"
            step={900}
            value={form.start}
            onChange={(e) => setForm((f) => ({ ...f, start: e.target.value }))}
            aria-invalid={errors.start ? true : undefined}
          />
        </Field>
        <Field label="Ends" htmlFor="volunteer-end" error={errors.end}>
          <Input
            id="volunteer-end"
            type="time"
            step={900}
            value={form.end}
            onChange={(e) => setForm((f) => ({ ...f, end: e.target.value }))}
            aria-invalid={errors.end ? true : undefined}
          />
        </Field>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div>
        <Button type="submit" size="sm" variant="outline" disabled={pending}>
          {pending ? (
            <Spinner size="sm" label="Saving…" />
          ) : (
            <Plus aria-hidden />
          )}
          Add it
        </Button>
      </div>
    </form>
  );
}

export function RemoveVolunteerShift({
  id,
  label,
}: {
  id: string;
  label: string;
}) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  return (
    <Button
      type="button"
      size="sm"
      variant="ghost"
      disabled={pending}
      aria-label={`Remove ${label}`}
      onClick={() =>
        start(async () => {
          const result = await removeVolunteerShiftAction({ id });
          if (!result.ok) {
            toast.error(result.error);
            return;
          }
          router.refresh();
        })
      }
    >
      {pending ? (
        <Spinner size="sm" label="Removing…" />
      ) : (
        <Trash2 aria-hidden />
      )}
      Remove
    </Button>
  );
}
