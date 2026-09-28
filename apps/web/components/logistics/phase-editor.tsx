"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import { Button } from "@camp404/ui/components/button";
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
import { Spinner } from "@camp404/ui/components/spinner";
import { Textarea } from "@camp404/ui/components/textarea";
import { toast } from "@camp404/ui/components/toast";
import {
  LOGISTICS_NOTE_MAX,
  LOGISTICS_PHASE_HINTS,
  LOGISTICS_PHASE_LABELS,
  LOGISTICS_PLACE_MAX,
  SetLogisticsPhaseInput,
  type LogisticsPhase,
} from "@camp404/types";
import {
  clearLogisticsPhaseAction,
  saveLogisticsPhaseAction,
} from "@/app/(console)/logistics/actions";
import { SAVED_NOT_ON_CALENDAR } from "@/lib/logistics-copy";

// Editing one logistics phase (#247): a dialog with the first and last day,
// the place and a note, as the load list's editor. A problem with what was
// typed shows beside it; a refusal or a lost race shows in the dialog. For a
// viewer who may not edit, the Edit button is PRESENT BUT DISABLED and points
// at the one refusal line on the page. The server re-checks regardless.

export interface EditablePhase {
  phase: LogisticsPhase;
  startDate: string | null;
  endDate: string | null;
  place: string | null;
  note: string | null;
  /** 0 when the phase has no row yet. */
  version: number;
}

type Errors = Partial<
  Record<"startDate" | "endDate" | "place" | "note", string>
>;

/** What a finished save or clear tells the editor about the camp calendar. */
function reportCalendar(
  calendar: "synced" | "not_connected" | "failed",
  done: string,
): void {
  if (calendar === "failed") toast.warning(SAVED_NOT_ON_CALENDAR);
  else toast.success(done);
}

export function PhaseEditButton({
  phase,
  canEdit,
  refusalId,
  suggestion,
}: {
  phase: EditablePhase;
  canEdit: boolean;
  refusalId: string;
  /** Days to start from when the phase has none (the Burn's own dates). */
  suggestion?: { startDate: string; endDate: string } | null;
}) {
  const router = useRouter();
  const label = LOGISTICS_PHASE_LABELS[phase.phase];
  const hasDays = phase.startDate !== null;
  const initial = {
    startDate: phase.startDate ?? suggestion?.startDate ?? "",
    endDate: phase.endDate ?? suggestion?.endDate ?? "",
    place: phase.place ?? "",
    note: phase.note ?? "",
  };
  const [open, setOpen] = React.useState(false);
  const [form, setForm] = React.useState(initial);
  const [errors, setErrors] = React.useState<Errors>({});
  const [error, setError] = React.useState<string | null>(null);
  const [saving, startSave] = React.useTransition();
  const [clearing, startClear] = React.useTransition();
  const pending = saving || clearing;

  function reset() {
    setForm(initial);
    setErrors({});
    setError(null);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const payload = {
      phase: phase.phase,
      startDate: form.startDate,
      endDate: form.endDate,
      place: form.place,
      note: form.note,
      expectedVersion: phase.version,
    };
    const check = SetLogisticsPhaseInput.safeParse(payload);
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
    startSave(async () => {
      const result = await saveLogisticsPhaseAction(payload);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      reportCalendar(result.data.calendar, `${label} saved`);
      setOpen(false);
      router.refresh();
    });
  }

  function clear() {
    setError(null);
    startClear(async () => {
      const result = await clearLogisticsPhaseAction({
        phase: phase.phase,
        expectedVersion: phase.version,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      reportCalendar(result.data.calendar, `${label} days cleared`);
      setOpen(false);
      router.refresh();
    });
  }

  const id = (field: string) => `logistics-${phase.phase}-${field}`;

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        disabled={!canEdit}
        onClick={() => setOpen(true)}
        aria-label={
          canEdit ? `Edit ${label}` : `Edit ${label} — not available to you`
        }
        {...(canEdit ? {} : { "aria-describedby": refusalId })}
      >
        <Pencil aria-hidden />
        Edit
      </Button>
      {canEdit && (
        <Dialog
          open={open}
          onOpenChange={(next) => {
            if (pending) return;
            if (!next) reset();
            setOpen(next);
          }}
        >
          <DialogContent>
            <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
              <DialogHeader>
                <DialogTitle>{label}</DialogTitle>
                <DialogDescription>
                  {LOGISTICS_PHASE_HINTS[phase.phase]} Saving puts it on the
                  camp calendar.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 page-sm:grid-cols-2">
                <Field
                  label="First day"
                  htmlFor={id("start")}
                  error={errors.startDate}
                >
                  <DateControl
                    id={id("start")}
                    value={form.startDate}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        startDate: e.target.value,
                        // A one-day phase is the usual start.
                        endDate: f.endDate || e.target.value,
                      }))
                    }
                    aria-invalid={errors.startDate ? true : undefined}
                  />
                </Field>
                <Field
                  label="Last day"
                  htmlFor={id("end")}
                  error={errors.endDate}
                >
                  <DateControl
                    id={id("end")}
                    value={form.endDate}
                    min={form.startDate || undefined}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, endDate: e.target.value }))
                    }
                    aria-invalid={errors.endDate ? true : undefined}
                  />
                </Field>
              </div>
              <Field
                label="Place (optional)"
                htmlFor={id("place")}
                error={errors.place}
                help="A place everyone knows, like the storage unit. Never a home address."
              >
                <Input
                  id={id("place")}
                  value={form.place}
                  maxLength={LOGISTICS_PLACE_MAX}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, place: e.target.value }))
                  }
                  aria-invalid={errors.place ? true : undefined}
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
                  maxLength={LOGISTICS_NOTE_MAX}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, note: e.target.value }))
                  }
                  aria-invalid={errors.note ? true : undefined}
                />
              </Field>
              {error && (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              )}
              <DialogFooter className="gap-2 page-sm:justify-between">
                {hasDays ? (
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={pending}
                    onClick={clear}
                  >
                    {clearing && <Spinner size="sm" label="Clearing…" />}
                    Clear days
                  </Button>
                ) : (
                  <span />
                )}
                <Button type="submit" disabled={pending}>
                  {saving && <Spinner size="sm" label="Saving…" />}
                  Save
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
