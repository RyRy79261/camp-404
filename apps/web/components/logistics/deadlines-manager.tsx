"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CalendarX, Plus } from "lucide-react";
import {
  AFRIKABURN_DATE_GROUPS,
  AFRIKABURN_DATES,
  AFRIKABURN_OTHER_GROUP_LABEL,
  NO_ROUND_THIS_YEAR,
  afrikaburnEventTitle,
  type AfrikaburnDate,
} from "@camp404/core";
import { Button } from "@camp404/ui/components/button";
import { Card } from "@camp404/ui/components/card";
import { AckRow, Checkbox } from "@camp404/ui/components/checkbox";
import { ConfirmDialog } from "@camp404/ui/components/confirm-dialog";
import { DateControl } from "@camp404/ui/components/date-control";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@camp404/ui/components/dialog";
import { Field } from "@camp404/ui/components/field";
import { Input } from "@camp404/ui/components/input";
import { RowActions } from "@camp404/ui/components/row-actions";
import { Spinner } from "@camp404/ui/components/spinner";
import { toast } from "@camp404/ui/components/toast";
import {
  AddDeadlineInput,
  DEADLINE_NOTE_MAX,
  DEADLINE_TITLE_MAX,
  SetAfrikaburnDateInput,
} from "@camp404/types";
import {
  addDeadlineAction,
  editDeadlineAction,
  removeDeadlineAction,
  setAfrikaburnDateAction,
  setDeadlineDoneAction,
} from "@/app/(console)/captains/camp-settings/cycle/deadline-actions";
import {
  DEADLINE_NOT_ON_CALENDAR,
  DEADLINES_ANCHOR,
  NOT_ANNOUNCED_YET,
  deadlineDateText,
} from "@/lib/logistics-copy";
import { pickedDayText } from "./phase-editor";

// The year's AfrikaBurn dates, for captains (owner, 2026-10-01, mock-up A:
// "The year's standard AfrikaBurn dates are already listed; a captain fills
// in each date when AfrikaBurn announces it"). One card: a heading row, then
// each group of AfrikaBurn's standard dates (AFRIKABURN_DATES), then "Other"
// for anything else, with "+ Add a date". Each row keeps its one action in the
// same place: "Set the date" while it is not announced, "Change" once it is.
// On a wide page the rows are a table (date, when, done, action); on a phone
// each is a name with its date under it and the button on the right, and the
// Change dialog carries the done tick. A problem with what was typed shows in
// the dialog; the one-tap done tick reports a failure as a toast, and only it
// spins. A date goes on the camp calendar as "AfrikaBurn: <name>". The row's
// button sits in RowActions, the same slot on every row (#323), and the tick
// is labelled "<name> done" (the owner's mock-up keeps a Done column).

export interface DeadlineItem {
  id: string;
  /** Which standard date; null for an "Other" one. */
  kind: string | null;
  title: string;
  dueDate: string | null;
  note: string | null;
  done: boolean;
  skipped: boolean;
  version: number;
  /** Where it stands on the camp calendar; null when there is nothing to say. */
  calendar: "on" | "pending" | null;
}

type Errors = Partial<Record<"title" | "dueDate" | "note", string>>;

/** The table's columns on a wide page: date, when, done, action. */
const COLUMNS =
  "page-sm:grid page-sm:grid-cols-[minmax(0,1fr)_10rem_4rem_8.5rem] page-sm:items-center page-sm:gap-4";

function reportCalendar(
  calendar: "synced" | "not_connected" | "failed",
  done: string,
): void {
  if (calendar === "failed") toast.warning(DEADLINE_NOT_ON_CALENDAR);
  else toast.success(done);
}

function issuesOf(issues: { path: PropertyKey[]; message: string }[]): Errors {
  const next: Errors = {};
  for (const issue of issues) {
    const key = String(issue.path[0]) as keyof Errors;
    next[key] ??= issue.message;
  }
  return next;
}

/** The dialog's footer: Cancel, then the one primary button. */
function Footer({
  pending,
  label,
  onCancel,
  extra,
}: {
  pending: boolean;
  label: string;
  onCancel: () => void;
  extra?: React.ReactNode;
}) {
  return (
    <DialogFooter className="sm:items-center">
      {extra}
      <Button
        type="button"
        variant="outline"
        className="sm:w-32"
        disabled={pending}
        onClick={onCancel}
      >
        Cancel
      </Button>
      <Button type="submit" className="sm:w-32" disabled={pending}>
        {pending && <Spinner size="sm" label="Saving…" />}
        {label}
      </Button>
    </DialogFooter>
  );
}

/** Set or change one of AfrikaBurn's standard dates. */
function StandardDateDialog({
  standard,
  row,
  open,
  onOpenChange,
}: {
  standard: AfrikaburnDate;
  row: DeadlineItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const initial = {
    dueDate: row?.dueDate ?? "",
    note: row?.note ?? "",
    skipped: row?.skipped ?? false,
    done: row?.done ?? false,
  };
  const [form, setForm] = React.useState(initial);
  const [errors, setErrors] = React.useState<Errors>({});
  const [error, setError] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();
  const id = (field: string) => `ab-date-${standard.kind}-${field}`;
  const isSet = row !== null && (row.dueDate !== null || row.skipped);

  function close(next: boolean) {
    if (pending) return;
    if (!next) {
      setForm(initial);
      setErrors({});
      setError(null);
    }
    onOpenChange(next);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const input = {
      kind: standard.kind,
      dueDate: form.dueDate,
      note: form.note,
      skipped: form.skipped,
      // The tick rides along only where the dialog shows it.
      ...(row ? { done: form.done } : {}),
      expectedVersion: row?.version ?? null,
    };
    const check = SetAfrikaburnDateInput.safeParse(input);
    if (!check.success) {
      setErrors(issuesOf(check.error.issues));
      return;
    }
    setErrors({});
    start(async () => {
      const result = await setAfrikaburnDateAction(input);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      reportCalendar(result.data.calendar, "Date saved");
      onOpenChange(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent data-window-tint>
        <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
          <DialogHeader>
            <DialogTitle>
              {isSet ? "Change the date" : "Set the date"} · {standard.name}
            </DialogTitle>
            <DialogDescription>
              {`Goes on the camp calendar as “${afrikaburnEventTitle({ kind: standard.kind, title: standard.name })}”.`}
            </DialogDescription>
          </DialogHeader>
          {standard.mayBeSkipped && (
            <AckRow
              checked={form.skipped}
              onCheckedChange={(v) =>
                setForm((f) => ({ ...f, skipped: v === true }))
              }
            >
              {NO_ROUND_THIS_YEAR}
            </AckRow>
          )}
          <Field
            label="Date"
            htmlFor={id("date")}
            error={errors.dueDate}
            help={form.skipped ? undefined : pickedDayText(form.dueDate)}
          >
            <DateControl
              id={id("date")}
              aria-describedby={`${id("date")}-${errors.dueDate ? "error" : "help"}`}
              className="sm:w-56"
              value={form.skipped ? "" : form.dueDate}
              disabled={form.skipped}
              onChange={(e) =>
                setForm((f) => ({ ...f, dueDate: e.target.value }))
              }
              aria-invalid={errors.dueDate ? true : undefined}
            />
          </Field>
          <Field
            label="Note (optional)"
            htmlFor={id("note")}
            error={errors.note}
          >
            <Input
              id={id("note")}
              value={form.note}
              maxLength={DEADLINE_NOTE_MAX}
              onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
              aria-invalid={errors.note ? true : undefined}
            />
          </Field>
          {row && (
            <AckRow
              checked={form.done}
              onCheckedChange={(v) =>
                setForm((f) => ({ ...f, done: v === true }))
              }
            >
              Done
            </AckRow>
          )}
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <Footer
            pending={pending}
            label="Save"
            onCancel={() => close(false)}
          />
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Add or change an "Other" date: a title, a date if known, a note. */
function OtherDateDialog({
  deadline,
  open,
  onOpenChange,
  onRemove,
}: {
  deadline: DeadlineItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRemove?: () => void;
}) {
  const router = useRouter();
  const initial = {
    title: deadline?.title ?? "",
    dueDate: deadline?.dueDate ?? "",
    note: deadline?.note ?? "",
    done: deadline?.done ?? false,
  };
  const [form, setForm] = React.useState(initial);
  const [errors, setErrors] = React.useState<Errors>({});
  const [error, setError] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();
  const id = (field: string) => `ab-other-${deadline?.id ?? "new"}-${field}`;
  const title = form.title.trim();

  function close(next: boolean) {
    if (pending) return;
    if (!next) {
      setForm(initial);
      setErrors({});
      setError(null);
    }
    onOpenChange(next);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const words = {
      title: form.title,
      dueDate: form.dueDate,
      note: form.note,
    };
    const check = AddDeadlineInput.safeParse(words);
    if (!check.success) {
      setErrors(issuesOf(check.error.issues));
      return;
    }
    setErrors({});
    start(async () => {
      const result = deadline
        ? await editDeadlineAction({
            ...words,
            done: form.done,
            id: deadline.id,
            expectedVersion: deadline.version,
          })
        : await addDeadlineAction(words);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      reportCalendar(
        result.data.calendar,
        deadline ? "Date saved" : "Date added",
      );
      if (!deadline) setForm(initial);
      onOpenChange(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent data-window-tint>
        <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
          <DialogHeader>
            <DialogTitle>
              {deadline
                ? `${deadline.dueDate ? "Change" : "Set the date"} · ${deadline.title}`
                : "Add a date"}
            </DialogTitle>
            <DialogDescription>
              {title
                ? `Anything else AfrikaBurn sets this year. With a date, it goes on the camp calendar as “${afrikaburnEventTitle({ kind: null, title })}”.`
                : "Anything else AfrikaBurn sets this year. With a date, it goes on the camp calendar."}
            </DialogDescription>
          </DialogHeader>
          <Field label="Name" htmlFor={id("title")} error={errors.title}>
            <Input
              id={id("title")}
              value={form.title}
              maxLength={DEADLINE_TITLE_MAX}
              placeholder="Mutant vehicle registration closes"
              onChange={(e) =>
                setForm((f) => ({ ...f, title: e.target.value }))
              }
              aria-invalid={errors.title ? true : undefined}
            />
          </Field>
          <Field
            label="Date (optional)"
            htmlFor={id("date")}
            error={errors.dueDate}
            help={
              pickedDayText(form.dueDate) ??
              "Leave it empty until AfrikaBurn says."
            }
          >
            <DateControl
              id={id("date")}
              aria-describedby={`${id("date")}-${errors.dueDate ? "error" : "help"}`}
              className="sm:w-56"
              value={form.dueDate}
              onChange={(e) =>
                setForm((f) => ({ ...f, dueDate: e.target.value }))
              }
              aria-invalid={errors.dueDate ? true : undefined}
            />
          </Field>
          <Field
            label="Note (optional)"
            htmlFor={id("note")}
            error={errors.note}
          >
            <Input
              id={id("note")}
              value={form.note}
              maxLength={DEADLINE_NOTE_MAX}
              onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
              aria-invalid={errors.note ? true : undefined}
            />
          </Field>
          {deadline && (
            <AckRow
              checked={form.done}
              onCheckedChange={(v) =>
                setForm((f) => ({ ...f, done: v === true }))
              }
            >
              Done
            </AckRow>
          )}
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <Footer
            pending={pending}
            label={deadline ? "Save" : "Add"}
            onCancel={() => close(false)}
            extra={
              onRemove && (
                <Button
                  type="button"
                  variant="ghost"
                  className="text-destructive sm:mr-auto"
                  disabled={pending}
                  onClick={onRemove}
                >
                  Remove
                </Button>
              )
            }
          />
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** What the When column says. */
function whenText(row: DeadlineItem | null): string {
  if (row?.skipped) return NO_ROUND_THIS_YEAR;
  return row?.dueDate ? deadlineDateText(row.dueDate) : NOT_ANNOUNCED_YET;
}

/** The done tick: one tap, a toast on failure, only it spins. */
function DoneTick({ row, name }: { row: DeadlineItem | null; name: string }) {
  const router = useRouter();
  const [ticking, start] = React.useTransition();
  const live = row !== null && row.dueDate !== null && !row.skipped;
  if (ticking) return <Spinner size="sm" label="Saving…" />;
  return (
    <Checkbox
      checked={row?.done ?? false}
      disabled={!live}
      aria-label={`${name} done`}
      onCheckedChange={(v) => {
        if (!row) return;
        start(async () => {
          const result = await setDeadlineDoneAction({
            id: row.id,
            done: v === true,
            expectedVersion: row.version,
          });
          if (!result.ok) {
            toast.error(result.error);
            return;
          }
          router.refresh();
        });
      }}
    />
  );
}

/** One date's row. */
function DateRow({
  name,
  shortName,
  help,
  row,
  onOpen,
}: {
  name: string;
  shortName: string;
  help: string | null;
  row: DeadlineItem | null;
  onOpen: () => void;
}) {
  const set = row !== null && (row.dueDate !== null || row.skipped);
  const known = row?.dueDate != null || row?.skipped === true;
  const when = whenText(row);
  return (
    <li
      aria-label={name}
      className={`flex items-center justify-between gap-3 border-t border-border px-4 py-3 page-sm:px-3 ${COLUMNS}`}
    >
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="text-sm font-semibold">
          <span className="page-sm:hidden">{shortName}</span>
          <span className="hidden page-sm:inline">{name}</span>
        </span>
        {help && (
          <span className="hidden text-xs text-muted-foreground page-sm:block">
            {help}
          </span>
        )}
        <span
          className={`text-xs tabular-nums text-muted-foreground page-sm:hidden ${known && !row?.skipped ? "" : "italic"}`}
        >
          {when}
          {row?.done ? " · done" : ""}
        </span>
        {row?.note && (
          <span className="whitespace-pre-line text-xs text-muted-foreground">
            {row.note}
          </span>
        )}
        {row?.calendar === "pending" && (
          <span className="inline-flex items-center gap-1 text-xs text-warning">
            <CalendarX className="h-3.5 w-3.5" aria-hidden />
            Not on the camp calendar yet. It will be tried again.
          </span>
        )}
      </div>
      <span
        className={`hidden text-sm tabular-nums page-sm:block ${known && !row?.skipped ? "" : "italic text-muted-foreground"}`}
      >
        {when}
      </span>
      <span className="hidden h-5 items-center page-sm:flex">
        <DoneTick row={row} name={name} />
      </span>
      <RowActions
        className="shrink-0"
        label={`Actions for ${name}`}
        primary={
          <Button
            size="sm"
            variant={set ? "outline" : "default"}
            className="page-sm:w-[8.5rem]"
            onClick={onOpen}
            aria-label={set ? `Change ${name}` : `Set the date for ${name}`}
          >
            {set ? (
              "Change"
            ) : (
              <>
                <span className="page-sm:hidden">Set date</span>
                <span className="hidden page-sm:inline">Set the date</span>
              </>
            )}
          </Button>
        }
      />
    </li>
  );
}

/** A standard date's row and its dialog. */
function StandardRow({
  standard,
  row,
}: {
  standard: AfrikaburnDate;
  row: DeadlineItem | null;
}) {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <DateRow
        name={standard.name}
        shortName={standard.shortName}
        help={standard.help}
        row={row}
        onOpen={() => setOpen(true)}
      />
      <StandardDateDialog
        key={row?.version ?? 0}
        standard={standard}
        row={row}
        open={open}
        onOpenChange={setOpen}
      />
    </>
  );
}

/** An "Other" date's row, its dialog and its removal. */
function OtherRow({ deadline }: { deadline: DeadlineItem }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [removing, setRemoving] = React.useState(false);
  const [removeError, setRemoveError] = React.useState<string | null>(null);
  const [deleting, startDelete] = React.useTransition();

  function remove() {
    setRemoveError(null);
    startDelete(async () => {
      const result = await removeDeadlineAction({
        id: deadline.id,
        expectedVersion: deadline.version,
      });
      if (!result.ok) {
        setRemoveError(result.error);
        return;
      }
      reportCalendar(result.data.calendar, "Date removed");
      setRemoving(false);
      router.refresh();
    });
  }

  return (
    <>
      <DateRow
        name={deadline.title}
        shortName={deadline.title}
        help={null}
        row={{ ...deadline, skipped: false }}
        onOpen={() => setOpen(true)}
      />
      <OtherDateDialog
        key={deadline.version}
        deadline={deadline}
        open={open}
        onOpenChange={setOpen}
        onRemove={() => {
          setOpen(false);
          setRemoving(true);
        }}
      />
      <ConfirmDialog
        open={removing}
        onOpenChange={(next) => {
          if (!next) setRemoveError(null);
          setRemoving(next);
        }}
        title="Remove this date?"
        description={`"${deadline.title}" comes off the list and off the camp calendar.`}
        confirmLabel="Remove"
        destructive
        pending={deleting}
        error={removeError}
        onConfirm={remove}
      />
    </>
  );
}

/** A group: its heading in pixel letters (shorter on a phone), its rows. */
function Group({
  label,
  short,
  children,
}: {
  label: string;
  short: string;
  children: React.ReactNode;
}) {
  return (
    <section aria-label={label} className="flex flex-col">
      <h3 className="border-t border-border px-4 pb-2 pt-4 font-pixel text-xs font-normal uppercase tracking-[0.2em] page-sm:bg-muted/40 page-sm:px-3 page-sm:py-2 page-sm:text-[10px] page-sm:text-muted-foreground">
        <span className="page-sm:hidden">{short}</span>
        <span className="hidden page-sm:inline">{label}</span>
      </h3>
      <ul className="flex flex-col">{children}</ul>
    </section>
  );
}

export function DeadlinesManager({ deadlines }: { deadlines: DeadlineItem[] }) {
  const [adding, setAdding] = React.useState(false);
  const byKind = new Map(
    deadlines.filter((d) => d.kind).map((d) => [d.kind as string, d]),
  );
  const others = deadlines.filter((d) => d.kind === null);
  return (
    <Card
      id={DEADLINES_ANCHOR}
      className="scroll-mt-4 overflow-hidden rounded-none"
    >
      <div
        aria-hidden
        className={`hidden px-3 py-2.5 font-pixel text-[10px] uppercase tracking-[0.15em] text-muted-foreground ${COLUMNS}`}
      >
        <span>AfrikaBurn date</span>
        <span>When</span>
        <span>Done</span>
        <span className="text-right">Action</span>
      </div>
      {AFRIKABURN_DATE_GROUPS.map((group) => (
        <Group key={group.key} label={group.label} short={group.shortLabel}>
          {AFRIKABURN_DATES.filter((d) => d.group === group.key).map((d) => (
            <StandardRow
              key={`${d.kind}:${byKind.get(d.kind)?.version ?? 0}`}
              standard={d}
              row={byKind.get(d.kind) ?? null}
            />
          ))}
        </Group>
      ))}
      <Group
        label={AFRIKABURN_OTHER_GROUP_LABEL}
        short={AFRIKABURN_OTHER_GROUP_LABEL}
      >
        {others.map((d) => (
          <OtherRow key={`${d.id}:${d.version}`} deadline={d} />
        ))}
        <li className="flex items-center justify-between gap-3 border-t border-border px-4 py-3 page-sm:px-3">
          <span className="text-sm italic text-muted-foreground">
            Anything else AfrikaBurn adds this year.
          </span>
          <Button
            size="sm"
            variant="outline"
            className="shrink-0 page-sm:w-[8.5rem]"
            onClick={() => setAdding(true)}
          >
            <Plus aria-hidden />
            Add a date
          </Button>
        </li>
      </Group>
      <OtherDateDialog deadline={null} open={adding} onOpenChange={setAdding} />
    </Card>
  );
}
