"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  AddFuelCansInput,
  CAN_LOCATIONS,
  CorrectRefuelInput,
  EditFuelCanInput,
  RefuelInput,
  type CanLocation,
} from "@camp404/types";
import { Button } from "@camp404/ui/components/button";
import { AckRow } from "@camp404/ui/components/checkbox";
import { ConfirmDialog } from "@camp404/ui/components/confirm-dialog";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@camp404/ui/components/select";
import { Spinner } from "@camp404/ui/components/spinner";
import { toast } from "@camp404/ui/components/toast";
import {
  addFuelCansAction,
  correctRefuelAction,
  logRefuelAction,
  removeFuelCanAction,
  strikeRefuelAction,
  updateFuelCanAction,
} from "@/app/(console)/power/fuel-log/actions";
import { CAN_LOCATION_LABELS, formatNumber } from "@/lib/power-copy";

// The refuelling page's controls (#255), laid out as the load list's: Add
// opens a dialog, each row has one button, and only an editor is shown any.
// A problem with what was typed shows beside its field; a refusal from the
// server at the foot of the dialog; a one-tap change on a row reports its
// failure as a toast. The log has no Edit and no Delete: a
// correction and a strike-out are new entries (append-only).

/** A blank or unreadable figure is 0, so the schema's own sentence names it. */
function figure(value: string): number {
  const n = Number(value);
  return value.trim() === "" || !Number.isFinite(n) ? 0 : n;
}

/** Zod's first sentence for each field, by its name. */
function fieldErrors(issues: { path: PropertyKey[]; message: string }[]) {
  const out: Record<string, string> = {};
  for (const issue of issues)
    out[String(issue.path[0] ?? "form")] ??= issue.message;
  return out;
}

function ServerError({ error }: { error: string | null }) {
  return error ? (
    <p role="alert" className="text-sm font-medium text-destructive">
      {error}
    </p>
  ) : null;
}

// --- Cans ---------------------------------------------------------------------

export interface EditableCan {
  id: string;
  version: number;
  label: string;
  capacityLitres: number;
  litres: number;
  location: CanLocation;
}

function LocationSelect({
  id,
  value,
  onChange,
}: {
  id: string;
  value: CanLocation;
  onChange: (v: CanLocation) => void;
}) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as CanLocation)}>
      <SelectTrigger id={id}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {CAN_LOCATIONS.map((l) => (
          <SelectItem key={l} value={l}>
            {CAN_LOCATION_LABELS[l]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function AddCansDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const blank = { count: "1", capacityLitres: "20", litres: "20" };
  const [form, setForm] = React.useState(blank);
  const [location, setLocation] = React.useState<CanLocation>("storage");
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();
  const idBase = React.useId();
  const id = (n: string) => `${idBase}-${n}`;

  function reset() {
    setForm(blank);
    setLocation("storage");
    setErrors({});
    setError(null);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const payload = {
      count: figure(form.count),
      capacityLitres: figure(form.capacityLitres),
      litres: figure(form.litres),
      location,
    };
    const check = AddFuelCansInput.safeParse(payload);
    if (!check.success) {
      setErrors(fieldErrors(check.error.issues));
      return;
    }
    setErrors({});
    startTransition(async () => {
      const result = await addFuelCansAction(payload);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      const n = result.data.count;
      toast.success(`${n} can${n === 1 ? "" : "s"} added`);
      reset();
      onOpenChange(false);
      router.refresh();
    });
  }

  const numberField = (
    key: keyof typeof blank,
    label: string,
    help?: string,
  ) => (
    <Field
      label={label}
      htmlFor={id(key)}
      required
      error={errors[key]}
      help={help}
    >
      <Input
        id={id(key)}
        type="number"
        inputMode="decimal"
        min={0}
        step="any"
        value={form[key]}
        onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
        aria-invalid={errors[key] ? true : undefined}
      />
    </Field>
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (pending) return;
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent
        data-window-tint
        className="max-h-[90svh] overflow-y-auto sm:max-w-lg"
      >
        <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
          <DialogHeader>
            <DialogTitle>Add cans</DialogTitle>
            <DialogDescription>
              Cans that are alike go in together. Each gets a name you can
              change: Can 1, Can 2 and on.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-3">
            {numberField("count", "How many")}
            {numberField("capacityLitres", "Size (L)")}
            {numberField("litres", "Litres in each", "Full is the size.")}
          </div>
          <Field label="Where they are" htmlFor={id("where")}>
            <LocationSelect
              id={id("where")}
              value={location}
              onChange={setLocation}
            />
          </Field>
          <ServerError error={error} />
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              disabled={pending}
              onClick={() => {
                reset();
                onOpenChange(false);
              }}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Adding…" : "Add cans"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function AddCansButton() {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        Add cans
      </Button>
      <AddCansDialog open={open} onOpenChange={setOpen} />
    </>
  );
}

function EditCanDialog({
  can,
  open,
  onOpenChange,
  onRemove,
}: {
  can: EditableCan;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRemove: () => void;
}) {
  const router = useRouter();
  const initial = {
    label: can.label,
    capacityLitres: String(can.capacityLitres),
    litres: String(can.litres),
  };
  const [form, setForm] = React.useState(initial);
  const [location, setLocation] = React.useState<CanLocation>(can.location);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();
  const idBase = React.useId();
  const id = (n: string) => `${idBase}-${n}`;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const payload = {
      canId: can.id,
      expectedVersion: can.version,
      label: form.label,
      capacityLitres: figure(form.capacityLitres),
      litres: figure(form.litres),
      location,
    };
    const check = EditFuelCanInput.safeParse(payload);
    if (!check.success) {
      setErrors(fieldErrors(check.error.issues));
      return;
    }
    setErrors({});
    startTransition(async () => {
      const result = await updateFuelCanAction(payload);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success(`${form.label} updated`);
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
      <DialogContent
        data-window-tint
        className="max-h-[90svh] overflow-y-auto sm:max-w-lg"
      >
        <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
          <DialogHeader>
            <DialogTitle>Count this can</DialogTitle>
            <DialogDescription>
              What is in it now and where it is.
            </DialogDescription>
          </DialogHeader>
          <Field
            label="Name"
            htmlFor={id("label")}
            required
            error={errors.label}
          >
            <Input
              id={id("label")}
              value={form.label}
              maxLength={40}
              onChange={(e) =>
                setForm((f) => ({ ...f, label: e.target.value }))
              }
              aria-invalid={errors.label ? true : undefined}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Size (L)"
              htmlFor={id("size")}
              required
              error={errors.capacityLitres}
            >
              <Input
                id={id("size")}
                type="number"
                inputMode="decimal"
                min={0}
                step="any"
                value={form.capacityLitres}
                onChange={(e) =>
                  setForm((f) => ({ ...f, capacityLitres: e.target.value }))
                }
              />
            </Field>
            <Field
              label="Litres in it"
              htmlFor={id("litres")}
              required
              error={errors.litres}
            >
              <Input
                id={id("litres")}
                type="number"
                inputMode="decimal"
                min={0}
                step="any"
                value={form.litres}
                onChange={(e) =>
                  setForm((f) => ({ ...f, litres: e.target.value }))
                }
              />
            </Field>
          </div>
          <Field label="Where it is" htmlFor={id("where")}>
            <LocationSelect
              id={id("where")}
              value={location}
              onChange={setLocation}
            />
          </Field>
          <ServerError error={error} />
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              disabled={pending}
              className="text-destructive sm:mr-auto"
              onClick={() => {
                onOpenChange(false);
                onRemove();
              }}
            >
              Remove can
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={pending}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save can"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * A can's name, which opens its own dialog for an editor: what is in it,
 * where it is, and Remove at the foot. Only the control that was used spins.
 */
export function CanRowActions({ can }: { can: EditableCan }) {
  const router = useRouter();
  const [editOpen, setEditOpen] = React.useState(false);
  const [confirming, setConfirming] = React.useState(false);
  const [removing, startRemove] = React.useTransition();

  function confirmRemove() {
    startRemove(async () => {
      const result = await removeFuelCanAction({
        canId: can.id,
        expectedVersion: can.version,
      });
      setConfirming(false);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(`${can.label} removed`);
      router.refresh();
    });
  }

  return (
    <>
      <button
        type="button"
        className="truncate text-left font-semibold underline decoration-muted-foreground/50 underline-offset-4 hover:text-primary"
        disabled={removing}
        onClick={() => setEditOpen(true)}
        aria-label={`Count ${can.label}`}
      >
        {removing ? <Spinner size="sm" label="Removing…" /> : can.label}
      </button>
      <EditCanDialog
        key={`${can.id}:${can.version}`}
        can={can}
        open={editOpen}
        onOpenChange={setEditOpen}
        onRemove={() => setConfirming(true)}
      />
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={`Remove ${can.label}?`}
        description="It comes out of this year's stock. Refuellings from it keep their litres."
        confirmLabel="Remove can"
        destructive
        pending={removing}
        onConfirm={confirmRemove}
      />
    </>
  );
}

/**
 * Count every can at once: one litres field a can, and Save writes the cans
 * that changed, each with the version it was counted from.
 */
export function CountCansButton({ cans }: { cans: EditableCan[] }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const initial = () =>
    Object.fromEntries(cans.map((c) => [c.id, String(c.litres)]));
  const [values, setValues] = React.useState<Record<string, string>>(initial);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();
  const idBase = React.useId();

  function reset() {
    setValues(initial());
    setErrors({});
    setError(null);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const changed = cans.filter((c) => figure(values[c.id] ?? "") !== c.litres);
    const next: Record<string, string> = {};
    const payloads = changed.map((c) => ({
      canId: c.id,
      expectedVersion: c.version,
      label: c.label,
      capacityLitres: c.capacityLitres,
      litres: figure(values[c.id] ?? ""),
      location: c.location,
    }));
    for (const payload of payloads) {
      const check = EditFuelCanInput.safeParse(payload);
      if (!check.success) {
        next[payload.canId] = check.error.issues[0]?.message ?? "Check it.";
      }
    }
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    if (payloads.length === 0) {
      setOpen(false);
      return;
    }
    startTransition(async () => {
      for (const payload of payloads) {
        const result = await updateFuelCanAction(payload);
        if (!result.ok) {
          const message = `${payload.label}: ${result.error}`;
          setError(message);
          // A can before this one in the loop already saved, so its
          // version moved on; the key above remounts this dialog on the
          // refresh below and drops the inline error with it. The toast
          // is what the user is left to see.
          toast.error(message);
          router.refresh();
          return;
        }
      }
      toast.success(
        `${payloads.length} can${payloads.length === 1 ? "" : "s"} counted`,
      );
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        disabled={cans.length === 0}
        onClick={() => setOpen(true)}
      >
        Count the cans
      </Button>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (pending) return;
          if (!next) reset();
          setOpen(next);
        }}
      >
        <DialogContent
          data-window-tint
          className="max-h-[90svh] overflow-y-auto sm:max-w-lg"
        >
          <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
            <DialogHeader>
              <DialogTitle>Count the cans</DialogTitle>
              <DialogDescription>
                The litres in each can now. Only the cans you change are saved.
              </DialogDescription>
            </DialogHeader>
            <ul className="flex flex-col gap-3">
              {cans.map((c) => (
                <li
                  key={c.id}
                  className="grid grid-cols-[minmax(0,1fr)_112px_56px] items-center gap-3"
                >
                  <label
                    htmlFor={`${idBase}-${c.id}`}
                    className="truncate text-sm font-semibold"
                  >
                    {c.label}
                  </label>
                  <Input
                    id={`${idBase}-${c.id}`}
                    type="number"
                    inputMode="decimal"
                    min={0}
                    max={c.capacityLitres}
                    step="any"
                    value={values[c.id] ?? ""}
                    onChange={(e) =>
                      setValues((v) => ({ ...v, [c.id]: e.target.value }))
                    }
                    aria-invalid={errors[c.id] ? true : undefined}
                    aria-describedby={
                      errors[c.id] ? `${idBase}-${c.id}-error` : undefined
                    }
                  />
                  <span className="text-sm tabular-nums text-muted-foreground">
                    of {formatNumber(c.capacityLitres, 1)} L
                  </span>
                  {errors[c.id] && (
                    <p
                      id={`${idBase}-${c.id}-error`}
                      className="col-span-3 text-xs font-medium text-destructive"
                    >
                      {errors[c.id]}
                    </p>
                  )}
                </li>
              ))}
            </ul>
            <ServerError error={error} />
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
                {pending ? "Saving…" : "Save the count"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

// --- The log ------------------------------------------------------------------

export interface RefuelOptions {
  generators: { id: string; label: string }[];
  cans: { id: string; label: string; litres: number }[];
  members: { id: string; displayName: string }[];
  /** The generator the plan runs on, the form's first choice. */
  defaultGeneratorId: string | null;
  /** Who is logging, the form's first choice for who filled it. */
  selfId: string;
  /** Now, in camp time, YYYY-MM-DDTHH:MM, worked out on the server. */
  now: string;
}

/** An entry as a correction starts from. */
export interface EditableEntry {
  id: string;
  generatorId: string;
  refuelledAt: string;
  litres: number;
  fromCanId: string | null;
  doneByUserId: string | null;
  hourMeter: number | null;
  note: string | null;
  fromPaper: boolean;
  label: string;
}

/** The Select's value for "not from a can"; Radix has no empty value. */
const NO_CAN = "none";

interface RefuelForm {
  refuelledAt: string;
  litres: string;
  generatorId: string;
  fromCanId: string;
  doneByUserId: string;
  hourMeter: string;
  note: string;
  fromPaper: boolean;
}

function RefuelDialog({
  open,
  onOpenChange,
  options,
  correcting,
  onStrike,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  options: RefuelOptions;
  correcting?: EditableEntry;
  /** Offers Strike out at the foot of a correction. */
  onStrike?: () => void;
}) {
  const router = useRouter();
  const initial = (): RefuelForm => ({
    // Typed in after the burn from the paper sheet: no "now" to guess at.
    refuelledAt: correcting?.refuelledAt ?? "",
    litres: correcting ? String(correcting.litres) : "",
    generatorId:
      correcting?.generatorId ??
      options.defaultGeneratorId ??
      options.generators[0]?.id ??
      "",
    fromCanId: correcting?.fromCanId ?? NO_CAN,
    doneByUserId: correcting?.doneByUserId ?? options.selfId,
    hourMeter:
      correcting?.hourMeter != null ? String(correcting.hourMeter) : "",
    note: correcting?.note ?? "",
    fromPaper: correcting?.fromPaper ?? true,
  });
  const [form, setForm] = React.useState<RefuelForm>(initial);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();
  const idBase = React.useId();
  const id = (n: string) => `${idBase}-${n}`;
  const set = <K extends keyof RefuelForm>(key: K, value: RefuelForm[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  function reset() {
    setForm(initial());
    setErrors({});
    setError(null);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const input = {
      generatorId: form.generatorId,
      refuelledAt: form.refuelledAt,
      litres: figure(form.litres),
      fromCanId: form.fromCanId === NO_CAN ? null : form.fromCanId,
      doneByUserId: form.doneByUserId,
      hourMeter: form.hourMeter.trim() === "" ? null : figure(form.hourMeter),
      note: form.note,
      fromPaper: form.fromPaper,
    };
    const payload = correcting
      ? { ...input, correctsEntryId: correcting.id }
      : input;
    const check = correcting
      ? CorrectRefuelInput.safeParse(payload)
      : RefuelInput.safeParse(payload);
    if (!check.success) {
      setErrors(fieldErrors(check.error.issues));
      return;
    }
    setErrors({});
    startTransition(async () => {
      const result = correcting
        ? await correctRefuelAction(payload)
        : await logRefuelAction(payload);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success(correcting ? "Correction logged" : "Refuelling logged");
      if (!correcting) reset();
      onOpenChange(false);
      router.refresh();
    });
  }

  // A correction may name the can it came from even if it is empty now: its
  // own litres go back into it first.
  const cans = options.cans;
  const members = options.members.some((m) => m.id === form.doneByUserId)
    ? options.members
    : [
        ...options.members,
        { id: form.doneByUserId, displayName: "Who filled it before" },
      ];

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (pending) return;
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent
        data-window-tint
        className="max-h-[90svh] overflow-y-auto sm:max-w-xl"
      >
        <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
          <DialogHeader>
            <DialogTitle>
              {correcting
                ? `Correct ${correcting.label}`
                : "Type in a line from the sheet"}
            </DialogTitle>
            <DialogDescription>
              {correcting
                ? "Give the right figures. The old entry stays in the log, marked as corrected."
                : "One line of the paper log kept at the generator. Say which can it came from, and that can goes down by the litres."}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="When"
              htmlFor={id("when")}
              required
              error={errors.refuelledAt}
              help="Camp time."
            >
              <Input
                id={id("when")}
                type="datetime-local"
                value={form.refuelledAt}
                onChange={(e) => set("refuelledAt", e.target.value)}
                aria-invalid={errors.refuelledAt ? true : undefined}
              />
            </Field>
            <Field
              label="Litres put in"
              htmlFor={id("litres")}
              required
              error={errors.litres}
            >
              <Input
                id={id("litres")}
                type="number"
                inputMode="decimal"
                min={0}
                step="any"
                value={form.litres}
                onChange={(e) => set("litres", e.target.value)}
                aria-invalid={errors.litres ? true : undefined}
              />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Generator"
              htmlFor={id("gen")}
              required
              error={errors.generatorId}
            >
              <Select
                value={form.generatorId}
                onValueChange={(v) => set("generatorId", v)}
              >
                <SelectTrigger id={id("gen")}>
                  <SelectValue placeholder="Pick the generator" />
                </SelectTrigger>
                <SelectContent>
                  {options.generators.map((g) => (
                    <SelectItem key={g.id} value={g.id}>
                      {g.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field
              label="From can"
              htmlFor={id("can")}
              error={errors.fromCanId}
            >
              <Select
                value={form.fromCanId}
                onValueChange={(v) => set("fromCanId", v)}
              >
                <SelectTrigger id={id("can")}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_CAN}>Not from a listed can</SelectItem>
                  {cans.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {`${c.label} (${formatNumber(c.litres, 1)} L)`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Filled by"
              htmlFor={id("who")}
              required
              error={errors.doneByUserId}
            >
              <Select
                value={form.doneByUserId}
                onValueChange={(v) => set("doneByUserId", v)}
              >
                <SelectTrigger id={id("who")}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {members.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.id === options.selfId
                        ? `${m.displayName} (you)`
                        : m.displayName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field
              label="Hour meter (optional)"
              htmlFor={id("meter")}
              error={errors.hourMeter}
            >
              <Input
                id={id("meter")}
                type="number"
                inputMode="decimal"
                min={0}
                step="any"
                value={form.hourMeter}
                onChange={(e) => set("hourMeter", e.target.value)}
              />
            </Field>
          </div>

          <Field
            label="Note (optional)"
            htmlFor={id("note")}
            error={errors.note}
          >
            <Input
              id={id("note")}
              value={form.note}
              maxLength={200}
              onChange={(e) => set("note", e.target.value)}
            />
          </Field>

          <AckRow
            checked={form.fromPaper}
            onCheckedChange={(v) => set("fromPaper", v === true)}
          >
            Typed in from the paper sheet at the generator
          </AckRow>

          <ServerError error={error} />
          <DialogFooter>
            {onStrike && (
              <Button
                type="button"
                variant="ghost"
                disabled={pending}
                className="text-destructive sm:mr-auto"
                onClick={() => {
                  reset();
                  onOpenChange(false);
                  onStrike();
                }}
              >
                Strike out
              </Button>
            )}
            <Button
              type="button"
              variant="ghost"
              disabled={pending}
              onClick={() => {
                reset();
                onOpenChange(false);
              }}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending
                ? "Saving…"
                : correcting
                  ? "Log correction"
                  : "Log refuelling"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Types in a line from the paper sheet. The sheet at the generator is the
 * record on site (there is no signal there); the app is filled in after.
 * Only an editor is shown it.
 */
export function LogRefuelButton({ options }: { options: RefuelOptions }) {
  const [open, setOpen] = React.useState(false);
  const ready = options.generators.length > 0;
  return (
    <>
      <Button variant="outline" disabled={!ready} onClick={() => setOpen(true)}>
        Type in from the sheet
      </Button>
      {ready && (
        <RefuelDialog open={open} onOpenChange={setOpen} options={options} />
      )}
    </>
  );
}

/**
 * One Correct button for an entry that counts; Strike out sits at the foot
 * of the correction dialog and asks first. Neither deletes anything.
 */
export function RefuelRowActions({
  entry,
  options,
}: {
  entry: EditableEntry;
  options: RefuelOptions;
}) {
  const router = useRouter();
  const [correcting, setCorrecting] = React.useState(false);
  const [striking, setStriking] = React.useState(false);
  const [pending, startStrike] = React.useTransition();

  function strike() {
    startStrike(async () => {
      const result = await strikeRefuelAction({ entryId: entry.id });
      setStriking(false);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Entry struck out");
      router.refresh();
    });
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="h-7 px-2.5 text-[10px]"
        disabled={pending}
        onClick={() => setCorrecting(true)}
        aria-label={`Correct ${entry.label}`}
      >
        {pending ? <Spinner size="sm" label="Striking out…" /> : "Correct"}
      </Button>
      <RefuelDialog
        open={correcting}
        onOpenChange={setCorrecting}
        options={options}
        correcting={entry}
        onStrike={() => setStriking(true)}
      />
      <ConfirmDialog
        open={striking}
        onOpenChange={setStriking}
        title={`Strike out ${entry.label}?`}
        description="Use this when it never happened, such as an entry typed in twice. It stays in the log, struck out, and its litres go back into its can."
        confirmLabel="Strike out"
        destructive
        pending={pending}
        onConfirm={strike}
      />
    </>
  );
}
