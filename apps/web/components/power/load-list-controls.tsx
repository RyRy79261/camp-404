"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Copy, Pencil, Plus, Settings2, Trash2 } from "lucide-react";
import { Button } from "@camp404/ui/components/button";
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
import { Spinner } from "@camp404/ui/components/spinner";
import { toast } from "@camp404/ui/components/toast";
import { PowerPlanInput, MAX_DAYS_ON_SITE } from "@camp404/types";
import {
  copyLastYearLoadsAction,
  removeLoadAction,
  savePlanSettingsAction,
} from "@/app/(console)/power/actions";
import {
  LoadEditorDialog,
  type EditableLoad,
  type InventoryOption,
} from "./load-editor-dialog";

// The load list's controls (#253), laid out as AfrikaBurn's categories
// manager: an Add button that opens a dialog, Edit and Remove on each row, and
// for a viewer who may not edit, every control PRESENT BUT DISABLED, named as
// not available and described by the one refusal line the page prints above
// the table. The server re-checks regardless; nothing here is the boundary.

/** What a disabled control says it is, and where it points for the reason. */
function refusalProps(canEdit: boolean, name: string, refusalId: string) {
  return canEdit
    ? {}
    : {
        "aria-label": `${name} — not available to you`,
        "aria-describedby": refusalId,
      };
}

export function AddLoadButton({
  canEdit,
  refusalId,
  inventory,
}: {
  canEdit: boolean;
  refusalId: string;
  inventory: InventoryOption[];
}) {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <Button
        disabled={!canEdit}
        onClick={() => setOpen(true)}
        {...refusalProps(canEdit, "Add load", refusalId)}
      >
        <Plus aria-hidden />
        Add load
      </Button>
      {canEdit && (
        <LoadEditorDialog
          open={open}
          onOpenChange={setOpen}
          inventory={inventory}
        />
      )}
    </>
  );
}

/** Edit and Remove for one row. Only the control that was used spins. */
export function LoadRowActions({
  load,
  canEdit,
  refusalId,
  inventory,
}: {
  load: EditableLoad;
  canEdit: boolean;
  refusalId: string;
  inventory: InventoryOption[];
}) {
  const router = useRouter();
  const [editOpen, setEditOpen] = React.useState(false);
  const [confirming, setConfirming] = React.useState(false);
  const [removing, startRemove] = React.useTransition();

  // A one-tap change on a list row, once confirmed: its failure is a toast,
  // and the dialog closes when the answer is in (announcements-manager.tsx).
  function confirmRemove() {
    startRemove(async () => {
      const result = await removeLoadAction({
        loadId: load.id,
        expectedVersion: load.version,
      });
      setConfirming(false);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Load removed");
      router.refresh();
    });
  }

  return (
    <span className="flex items-center justify-end gap-1">
      <Button
        variant="ghost"
        size="icon"
        disabled={!canEdit || removing}
        onClick={() => setEditOpen(true)}
        aria-label={`Edit ${load.name}`}
        {...refusalProps(canEdit, `Edit ${load.name}`, refusalId)}
      >
        <Pencil aria-hidden />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        disabled={!canEdit || removing}
        onClick={() => setConfirming(true)}
        aria-label={`Remove ${load.name}`}
        {...refusalProps(canEdit, `Remove ${load.name}`, refusalId)}
      >
        {removing ? (
          <Spinner size="sm" label="Removing…" />
        ) : (
          <Trash2 aria-hidden />
        )}
      </Button>
      {canEdit && (
        <>
          <LoadEditorDialog
            key={`${load.id}:${load.version}`}
            open={editOpen}
            onOpenChange={setEditOpen}
            editing={load}
            inventory={inventory}
          />
          <ConfirmDialog
            open={confirming}
            onOpenChange={setConfirming}
            title={`Remove ${load.name}?`}
            description="It comes off this year's list, and the totals drop with it."
            confirmLabel="Remove load"
            destructive
            pending={removing}
            onConfirm={confirmRemove}
          />
        </>
      )}
    </span>
  );
}

/** Copies the most recent earlier year's list into an empty year. */
export function CopyLastYearButton({
  fromCycle,
  canEdit,
  refusalId,
}: {
  fromCycle: number;
  canEdit: boolean;
  refusalId: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  return (
    <Button
      variant="outline"
      disabled={!canEdit || pending}
      {...refusalProps(canEdit, "Copy last year's list", refusalId)}
      onClick={() =>
        startTransition(async () => {
          const result = await copyLastYearLoadsAction();
          if (!result.ok) {
            toast.error(result.error);
            return;
          }
          const n = result.data.count;
          toast.success(
            `Copied ${n} load${n === 1 ? "" : "s"} from ${fromCycle}`,
          );
          router.refresh();
        })
      }
    >
      {pending ? <Spinner size="sm" label="Copying…" /> : <Copy aria-hidden />}
      Copy last year&apos;s list
    </Button>
  );
}

export interface PlanSettingsValues {
  daysOnSite: number;
  firstPoweredDay: string | null;
  powerFactor: number;
  version: number;
}

/** The plan's load-list settings: days on site, day 1's date, power factor. */
export function PlanSettingsButton({ plan }: { plan: PlanSettingsValues }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const initial = {
    daysOnSite: String(plan.daysOnSite),
    firstPoweredDay: plan.firstPoweredDay ?? "",
    powerFactor: String(plan.powerFactor),
  };
  const [form, setForm] = React.useState(initial);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  function reset() {
    setForm(initial);
    setErrors({});
    setError(null);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const payload = {
      daysOnSite: form.daysOnSite.trim() === "" ? 0 : Number(form.daysOnSite),
      firstPoweredDay: form.firstPoweredDay || null,
      powerFactor:
        form.powerFactor.trim() === "" ? 0 : Number(form.powerFactor),
      expectedVersion: plan.version,
    };
    // The three fields alone; the action checks them merged onto the plan.
    const check = PowerPlanInput.safeParse({ generatorId: null, ...payload });
    if (!check.success) {
      const next: Record<string, string> = {};
      for (const issue of check.error.issues) {
        next[String(issue.path[0])] ??= issue.message;
      }
      setErrors(next);
      return;
    }
    setErrors({});
    startTransition(async () => {
      const result = await savePlanSettingsAction(payload);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success("Plan settings saved");
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Settings2 aria-hidden />
        Plan settings
      </Button>
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
              <DialogTitle>Plan settings</DialogTitle>
              <DialogDescription>
                This year&apos;s settings for the load list. The fuel estimate
                uses the same power factor.
              </DialogDescription>
            </DialogHeader>
            <Field
              label="Days on site (until the camp calendar can supply them)"
              htmlFor="plan-days"
              error={errors.daysOnSite}
            >
              <Input
                id="plan-days"
                type="number"
                inputMode="numeric"
                min={1}
                max={MAX_DAYS_ON_SITE}
                value={form.daysOnSite}
                onChange={(e) =>
                  setForm((f) => ({ ...f, daysOnSite: e.target.value }))
                }
                aria-invalid={errors.daysOnSite ? true : undefined}
              />
            </Field>
            <Field
              label="First powered day (optional)"
              htmlFor="plan-first-day"
              error={errors.firstPoweredDay}
              help="Only labels the days with dates. Loads keep their day numbers."
            >
              <DateControl
                id="plan-first-day"
                value={form.firstPoweredDay}
                onChange={(e) =>
                  setForm((f) => ({ ...f, firstPoweredDay: e.target.value }))
                }
              />
            </Field>
            <Field
              label="Power factor"
              htmlFor="plan-pf"
              error={errors.powerFactor}
              help="kVA = kW ÷ power factor. 0.8 is usual for a small generator."
            >
              <Input
                id="plan-pf"
                type="number"
                inputMode="decimal"
                min={0.5}
                max={1}
                step={0.01}
                value={form.powerFactor}
                onChange={(e) =>
                  setForm((f) => ({ ...f, powerFactor: e.target.value }))
                }
                aria-invalid={errors.powerFactor ? true : undefined}
              />
            </Field>
            {error ? (
              <p role="alert" className="text-sm font-medium text-destructive">
                {error}
              </p>
            ) : null}
            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                disabled={pending}
                onClick={() => {
                  reset();
                  setOpen(false);
                }}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? "Saving…" : "Save settings"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
