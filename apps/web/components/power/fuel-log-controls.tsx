"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Ban, Fuel, Pencil, Plus, Trash2 } from "lucide-react";
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
  saveLowFuelDaysAction,
  strikeRefuelAction,
  updateFuelCanAction,
} from "@/app/(console)/power/fuel-log/actions";
import { CAN_LOCATION_LABELS, formatNumber } from "@/lib/power-copy";

// The refuelling page's controls (#255), laid out as the load list's: Add
// opens a dialog, each row has its own buttons, and for a viewer who may not
// edit every control is PRESENT BUT DISABLED and describes to the page's one
// refusal line. A problem with what was typed shows beside its field; a
// refusal from the server at the foot of the dialog; a one-tap change on a
// row reports its failure as a toast. The log has no Edit and no Delete: a
// correction and a strike-out are new entries (append-only).

/** What a disabled control says it is, and where it points for the reason. */
function refusalProps(canEdit: boolean, name: string, refusalId: string) {
  return canEdit
    ? { "aria-label": name }
    : {
        "aria-label": `${name} — not available to you`,
        "aria-describedby": refusalId,
      };
}

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
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-lg">
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

export function AddCansButton({
  canEdit,
  refusalId,
}: {
  canEdit: boolean;
  refusalId: string;
}) {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <Button
        variant="outline"
        size="sm"
        disabled={!canEdit}
        onClick={() => setOpen(true)}
        {...refusalProps(canEdit, "Add cans", refusalId)}
      >
        <Plus aria-hidden />
        Add cans
      </Button>
      {canEdit && <AddCansDialog open={open} onOpenChange={setOpen} />}
    </>
  );
}

function EditCanDialog({
  can,
  open,
  onOpenChange,
}: {
  can: EditableCan;
  open: boolean;
  onOpenChange: (open: boolean) => void;
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
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-lg">
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

/** Count and Remove for one can. Only the control that was used spins. */
export function CanRowActions({
  can,
  canEdit,
  refusalId,
}: {
  can: EditableCan;
  canEdit: boolean;
  refusalId: string;
}) {
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
    <span className="flex items-center justify-end gap-1">
      <Button
        variant="ghost"
        size="icon"
        disabled={!canEdit || removing}
        onClick={() => setEditOpen(true)}
        {...refusalProps(canEdit, `Count ${can.label}`, refusalId)}
      >
        <Pencil aria-hidden />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        disabled={!canEdit || removing}
        onClick={() => setConfirming(true)}
        {...refusalProps(canEdit, `Remove ${can.label}`, refusalId)}
      >
        {removing ? (
          <Spinner size="sm" label="Removing…" />
        ) : (
          <Trash2 aria-hidden />
        )}
      </Button>
      {canEdit && (
        <>
          <EditCanDialog
            key={`${can.id}:${can.version}`}
            can={can}
            open={editOpen}
            onOpenChange={setEditOpen}
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
      )}
    </span>
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
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  options: RefuelOptions;
  correcting?: EditableEntry;
}) {
  const router = useRouter();
  const initial = (): RefuelForm => ({
    refuelledAt: correcting?.refuelledAt ?? options.now,
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
    fromPaper: correcting?.fromPaper ?? false,
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
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-xl">
        <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
          <DialogHeader>
            <DialogTitle>
              {correcting ? `Correct ${correcting.label}` : "Log a refuelling"}
            </DialogTitle>
            <DialogDescription>
              {correcting
                ? "Give the right figures. The old entry stays in the log, marked as corrected."
                : "Each time the generator is filled. Say which can it came from, and that can goes down by the litres."}
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

export function LogRefuelButton({
  canEdit,
  refusalId,
  options,
}: {
  canEdit: boolean;
  refusalId: string;
  options: RefuelOptions | null;
}) {
  const [open, setOpen] = React.useState(false);
  const ready = canEdit && options !== null && options.generators.length > 0;
  return (
    <>
      <Button
        disabled={!ready}
        onClick={() => setOpen(true)}
        {...refusalProps(canEdit, "Log refuelling", refusalId)}
      >
        <Fuel aria-hidden />
        Log refuelling
      </Button>
      {ready && (
        <RefuelDialog open={open} onOpenChange={setOpen} options={options} />
      )}
    </>
  );
}

/** Correct and Strike out for one entry of the log. */
export function RefuelRowActions({
  entry,
  canEdit,
  refusalId,
  options,
}: {
  entry: EditableEntry;
  canEdit: boolean;
  refusalId: string;
  options: RefuelOptions | null;
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
    <span className="flex items-center justify-end gap-1">
      <Button
        variant="ghost"
        size="icon"
        disabled={!canEdit || pending}
        onClick={() => setCorrecting(true)}
        {...refusalProps(canEdit, `Correct ${entry.label}`, refusalId)}
      >
        <Pencil aria-hidden />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        disabled={!canEdit || pending}
        onClick={() => setStriking(true)}
        {...refusalProps(canEdit, `Strike out ${entry.label}`, refusalId)}
      >
        {pending ? (
          <Spinner size="sm" label="Striking out…" />
        ) : (
          <Ban aria-hidden />
        )}
      </Button>
      {canEdit && options && (
        <>
          <RefuelDialog
            open={correcting}
            onOpenChange={setCorrecting}
            options={options}
            correcting={entry}
          />
          <ConfirmDialog
            open={striking}
            onOpenChange={setStriking}
            title={`Strike out ${entry.label}?`}
            description="Use this when it never happened, such as an entry logged twice. It stays in the log, struck out, and its litres go back into its can."
            confirmLabel="Strike out"
            destructive
            pending={pending}
            onConfirm={strike}
          />
        </>
      )}
    </span>
  );
}

// --- The warning --------------------------------------------------------------

export function LowFuelForm({
  lowFuelDays,
  version,
  canEdit,
  refusalId,
}: {
  lowFuelDays: number;
  version: number;
  canEdit: boolean;
  refusalId: string;
}) {
  const router = useRouter();
  const [value, setValue] = React.useState(String(lowFuelDays));
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();
  const idBase = React.useId();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    // A blank field is not 0: 0 turns the warning off for everyone.
    if (value.trim() === "" || !Number.isFinite(Number(value))) {
      setError("Give a number of days, or 0 to turn the warning off.");
      return;
    }
    startTransition(async () => {
      const result = await saveLowFuelDaysAction({
        lowFuelDays: Number(value),
        expectedVersion: version,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success("Warning saved");
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2" noValidate>
      <label
        htmlFor={`${idBase}-days`}
        className="text-sm font-medium leading-none text-foreground"
      >
        Warn when the fuel left covers fewer days than
      </label>
      <div className="flex flex-col gap-3 page-sm:flex-row page-sm:items-center">
        <Input
          id={`${idBase}-days`}
          type="number"
          inputMode="numeric"
          min={0}
          step={1}
          value={value}
          disabled={!canEdit}
          onChange={(e) => setValue(e.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={canEdit ? `${idBase}-help` : refusalId}
          className="page-sm:max-w-40"
        />
        <Button
          type="submit"
          variant="outline"
          disabled={!canEdit || pending}
          {...refusalProps(canEdit, "Save warning", refusalId)}
        >
          {pending ? "Saving…" : "Save warning"}
        </Button>
      </div>
      {error ? (
        <p className="text-xs font-medium text-destructive">{error}</p>
      ) : (
        <p id={`${idBase}-help`} className="text-xs text-muted-foreground">
          0 turns the warning off. Near the end of the burn it asks only for the
          days still to come.
        </p>
      )}
    </form>
  );
}
