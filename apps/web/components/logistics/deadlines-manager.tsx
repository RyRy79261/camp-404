"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CalendarX, Check, Pencil, Plus, Trash2, Undo2 } from "lucide-react";
import { Badge } from "@camp404/ui/components/badge";
import { Button } from "@camp404/ui/components/button";
import { Card, CardContent } from "@camp404/ui/components/card";
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
import { Textarea } from "@camp404/ui/components/textarea";
import { toast } from "@camp404/ui/components/toast";
import {
  AddDeadlineInput,
  DEADLINE_NOTE_MAX,
  DEADLINE_TITLE_MAX,
} from "@camp404/types";
import {
  addDeadlineAction,
  editDeadlineAction,
  removeDeadlineAction,
  setDeadlineDoneAction,
} from "@/app/(console)/captains/camp-settings/cycle/deadline-actions";
import {
  DEADLINE_NOT_ON_CALENDAR,
  DEADLINES_ANCHOR,
  deadlineDateText,
} from "@/lib/logistics-copy";
import { pickedDayText } from "./phase-editor";

// The year's AfrikaBurn deadlines, for captains (owner, 2026-09-30): added
// one at a time, because the dates are not all known at once. Composed as
// the Logistics load list: one card of rows, each row's buttons in RowActions
// so they sit in the same place on every row and every window width: "Mark
// done" (or "Not done") is the row's one main button, and a quiet Edit icon
// opens the dialog, which holds Remove too. A finished row wears a Done chip;
// open ones come first. A problem with what was typed shows beside it, in the
// dialog; the one-tap done toggle reports a failure as a toast, and only it
// spins. Each save puts a dated deadline on the camp calendar, under the one
// event it owns.

export interface DeadlineItem {
  id: string;
  title: string;
  dueDate: string | null;
  note: string | null;
  done: boolean;
  version: number;
  /** Where it stands on the camp calendar; null when there is nothing to say. */
  calendar: "on" | "pending" | null;
}

type Errors = Partial<Record<"title" | "dueDate" | "note", string>>;

function reportCalendar(
  calendar: "synced" | "not_connected" | "failed",
  done: string,
): void {
  if (calendar === "failed") toast.warning(DEADLINE_NOT_ON_CALENDAR);
  else toast.success(done);
}

/** Add or edit one deadline: a title, a date if known, a note. */
function DeadlineDialog({
  deadline,
  open,
  onOpenChange,
  onRemove,
}: {
  deadline: DeadlineItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Editing only: close this dialog and ask about removing the deadline. */
  onRemove?: () => void;
}) {
  const router = useRouter();
  const initial = {
    title: deadline?.title ?? "",
    dueDate: deadline?.dueDate ?? "",
    note: deadline?.note ?? "",
  };
  const [form, setForm] = React.useState(initial);
  const [errors, setErrors] = React.useState<Errors>({});
  const [error, setError] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();
  const id = (field: string) => `deadline-${deadline?.id ?? "new"}-${field}`;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const check = AddDeadlineInput.safeParse(form);
    if (!check.success) {
      const next: Errors = {};
      for (const issue of check.error.issues) {
        const key = String(issue.path[0]) as keyof Errors;
        next[key] ??= issue.message;
      }
      setErrors(next);
      return;
    }
    setErrors({});
    start(async () => {
      const result = deadline
        ? await editDeadlineAction({
            ...form,
            id: deadline.id,
            expectedVersion: deadline.version,
          })
        : await addDeadlineAction(form);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      reportCalendar(
        result.data.calendar,
        deadline ? "Deadline saved" : "Deadline added",
      );
      if (!deadline) setForm({ title: "", dueDate: "", note: "" });
      onOpenChange(false);
      router.refresh();
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (pending) return;
        if (!next) {
          setForm(initial);
          setErrors({});
          setError(null);
        }
        onOpenChange(next);
      }}
    >
      <DialogContent data-window-tint>
        <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
          <DialogHeader>
            <DialogTitle>
              {deadline ? "Edit deadline" : "Add a deadline"}
            </DialogTitle>
            <DialogDescription>
              A date AfrikaBurn sets for the camp. With a date, it goes on the
              camp calendar.
            </DialogDescription>
          </DialogHeader>
          <Field label="Title" htmlFor={id("title")} error={errors.title}>
            <Input
              id={id("title")}
              value={form.title}
              maxLength={DEADLINE_TITLE_MAX}
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
            <Textarea
              id={id("note")}
              rows={3}
              value={form.note}
              maxLength={DEADLINE_NOTE_MAX}
              onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
              aria-invalid={errors.note ? true : undefined}
            />
          </Field>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <DialogFooter className="gap-2 page-sm:justify-between">
            {deadline && onRemove ? (
              <Button
                type="button"
                variant="ghost"
                disabled={pending}
                onClick={onRemove}
              >
                <Trash2 aria-hidden />
                Remove
              </Button>
            ) : (
              <span />
            )}
            <Button type="submit" disabled={pending}>
              {pending && <Spinner size="sm" label="Saving…" />}
              {deadline ? "Save" : "Add"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Only the exception says anything: being on the camp calendar is the normal
 * case, and the card's description already says so.
 */
function CalendarChip({ state }: { state: "on" | "pending" }) {
  if (state === "on") return null;
  return (
    <span className="inline-flex items-center gap-1 text-xs text-warning">
      <CalendarX className="h-3.5 w-3.5" aria-hidden />
      Not on the camp calendar yet. It will be tried again.
    </span>
  );
}

/** One deadline's row: the words, the done toggle, and Edit. */
function DeadlineRow({ deadline }: { deadline: DeadlineItem }) {
  const router = useRouter();
  const [editing, setEditing] = React.useState(false);
  const [removing, setRemoving] = React.useState(false);
  const [removeError, setRemoveError] = React.useState<string | null>(null);
  const [ticking, startTick] = React.useTransition();
  const [deleting, startDelete] = React.useTransition();

  function tick(done: boolean) {
    startTick(async () => {
      const result = await setDeadlineDoneAction({
        id: deadline.id,
        done,
        expectedVersion: deadline.version,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      router.refresh();
    });
  }

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
      reportCalendar(result.data.calendar, "Deadline removed");
      setRemoving(false);
      router.refresh();
    });
  }

  return (
    <li
      aria-label={deadline.title}
      className="flex flex-col gap-2 px-4 py-3 page-sm:flex-row page-sm:items-start page-sm:gap-3"
    >
      <div className="grid min-w-0 flex-1 gap-x-4 gap-y-0.5 page-sm:grid-cols-[minmax(0,1fr)_11rem]">
        <h3
          className={
            deadline.done
              ? "flex flex-wrap items-center gap-2 text-sm font-semibold text-muted-foreground"
              : "text-sm font-semibold"
          }
        >
          {deadline.title}
          {deadline.done && <Badge variant="success">Done</Badge>}
        </h3>
        <p className="text-sm tabular-nums text-muted-foreground page-sm:row-span-2 page-sm:text-right">
          {deadline.dueDate
            ? deadlineDateText(deadline.dueDate)
            : "Date not known yet."}
        </p>
        {deadline.note && (
          <p className="whitespace-pre-line text-sm text-muted-foreground">
            {deadline.note}
          </p>
        )}
        {deadline.calendar === "pending" && (
          <div className="page-sm:col-span-2">
            <CalendarChip state={deadline.calendar} />
          </div>
        )}
      </div>
      {/* In a narrow window the words get the row's width and the buttons
          sit under them, at the right, on every row alike (AfrikaBurn's
          stacked card). */}
      <RowActions
        className="shrink-0 self-end page-sm:self-start"
        label={`Actions for ${deadline.title}`}
        primary={
          <Button
            variant="outline"
            size="sm"
            className="w-32"
            disabled={ticking}
            aria-pressed={deadline.done}
            aria-label={`${deadline.title} done`}
            onClick={() => tick(!deadline.done)}
          >
            {ticking ? (
              <Spinner size="sm" label="Saving…" />
            ) : deadline.done ? (
              <Undo2 aria-hidden />
            ) : (
              <Check aria-hidden />
            )}
            {deadline.done ? "Not done" : "Mark done"}
          </Button>
        }
        secondary={
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setEditing(true)}
            aria-label={`Edit ${deadline.title}`}
            title="Edit"
          >
            <Pencil aria-hidden />
          </Button>
        }
      />
      <DeadlineDialog
        key={deadline.version}
        deadline={deadline}
        open={editing}
        onOpenChange={setEditing}
        onRemove={() => {
          setEditing(false);
          setRemoving(true);
        }}
      />
      <ConfirmDialog
        open={removing}
        onOpenChange={(next) => {
          if (!next) setRemoveError(null);
          setRemoving(next);
        }}
        title="Remove this deadline?"
        description={`"${deadline.title}" comes off the list and off the camp calendar.`}
        confirmLabel="Remove"
        destructive
        pending={deleting}
        error={removeError}
        onConfirm={remove}
      />
    </li>
  );
}

export function DeadlinesManager({ deadlines }: { deadlines: DeadlineItem[] }) {
  const [adding, setAdding] = React.useState(false);
  // Open ones first, each group in the date order the page read them in.
  const ordered = [
    ...deadlines.filter((d) => !d.done),
    ...deadlines.filter((d) => d.done),
  ];
  return (
    <Card id={DEADLINES_ANCHOR} className="scroll-mt-4">
      <CardContent className="flex flex-col p-0">
        <div className="flex flex-col gap-3 p-4 page-sm:flex-row page-sm:items-start page-sm:justify-between">
          <div className="flex flex-col gap-2">
            <h2 className="text-base font-semibold">AfrikaBurn deadlines</h2>
            <p className="text-sm text-muted-foreground">
              Add each date when AfrikaBurn publishes it. Every member sees them
              on Logistics, and each one with a date is on the camp calendar.
            </p>
          </div>
          <Button
            size="sm"
            className="shrink-0 self-start"
            onClick={() => setAdding(true)}
          >
            <Plus aria-hidden />
            Add a deadline
          </Button>
        </div>
        {deadlines.length === 0 ? (
          <p className="border-t border-border px-4 py-4 text-sm text-muted-foreground">
            No deadlines yet.
          </p>
        ) : (
          <ol
            aria-label="AfrikaBurn deadlines"
            className="divide-y divide-border border-t border-border"
          >
            {ordered.map((d) => (
              <DeadlineRow key={`${d.id}:${d.version}`} deadline={d} />
            ))}
          </ol>
        )}
      </CardContent>
      <DeadlineDialog deadline={null} open={adding} onOpenChange={setAdding} />
    </Card>
  );
}
