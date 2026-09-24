"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Archive, Pencil, Plus } from "lucide-react";
import {
  EditGeneratorInput,
  FUEL_TYPES,
  GENERATOR_OWNERS,
  GeneratorInput,
  type FuelType,
  type GeneratorOwner,
} from "@camp404/types";
import { Button } from "@camp404/ui/components/button";
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
  addGeneratorAction,
  archiveGeneratorAction,
  updateGeneratorAction,
} from "@/app/(console)/power/actions";
import { FUEL_LABELS, GENERATOR_OWNER_LABELS } from "@/lib/power-copy";

// Add a generator to the camp's gear or, given `editing`, change one (#254),
// laid out as AfrikaBurn's categories manager: Add opens this dialog, and each
// row has Edit and a one-tap Archive whose failure is a toast. For a viewer
// who may not edit, the buttons are PRESENT BUT DISABLED and describe to the
// page's one refusal line. The fields follow GeneratorInput; a problem with
// what was typed shows beside its field, a refusal from the server at the
// foot of the dialog. A generator names no member: a lent one is only "Lent
// by a member".

/** A generator as the dialog edits it. */
export interface EditableGenerator {
  id: string;
  version: number;
  model: string;
  ratedKva: number;
  maxKva: number;
  tankLitres: number;
  runtime50Hours: number;
  runtime100Hours: number;
  fuelType: FuelType;
  owner: GeneratorOwner;
  inventoryItemId: string | null;
  noiseNote: string | null;
}

export interface GeneratorInventoryOption {
  id: string;
  name: string;
}

/** The Select's value for "no inventory link"; Radix has no empty value. */
const NO_ITEM = "none";

interface FormState {
  model: string;
  ratedKva: string;
  maxKva: string;
  tankLitres: string;
  runtime50Hours: string;
  runtime100Hours: string;
  fuelType: FuelType;
  owner: GeneratorOwner;
  inventoryItemId: string;
  noiseNote: string;
}

const text = (n: number | null | undefined) => (n == null ? "" : String(n));

function initialState(gen?: EditableGenerator): FormState {
  return {
    model: gen?.model ?? "",
    ratedKva: text(gen?.ratedKva),
    maxKva: text(gen?.maxKva),
    tankLitres: text(gen?.tankLitres),
    runtime50Hours: text(gen?.runtime50Hours),
    runtime100Hours: text(gen?.runtime100Hours),
    fuelType: gen?.fuelType ?? "petrol",
    owner: gen?.owner ?? "camp",
    inventoryItemId: gen?.inventoryItemId ?? NO_ITEM,
    noiseNote: gen?.noiseNote ?? "",
  };
}

/** A blank or unreadable figure is 0, so the input's own sentence names it. */
function figure(value: string): number {
  const n = Number(value);
  return value.trim() === "" || !Number.isFinite(n) ? 0 : n;
}

function toInput(form: FormState) {
  return {
    model: form.model,
    ratedKva: figure(form.ratedKva),
    maxKva: figure(form.maxKva),
    tankLitres: figure(form.tankLitres),
    runtime50Hours: figure(form.runtime50Hours),
    runtime100Hours: figure(form.runtime100Hours),
    fuelType: form.fuelType,
    owner: form.owner,
    inventoryItemId:
      form.inventoryItemId === NO_ITEM ? null : form.inventoryItemId,
    noiseNote: form.noiseNote,
  };
}

export function GeneratorDialog({
  open,
  onOpenChange,
  editing,
  inventory,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing?: EditableGenerator;
  inventory: GeneratorInventoryOption[];
}) {
  const router = useRouter();
  const [form, setForm] = React.useState<FormState>(() =>
    initialState(editing),
  );
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();
  const idBase = React.useId();
  const id = (name: string) => `${idBase}-${name}`;

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  function reset() {
    setForm(initialState(editing));
    setErrors({});
    setError(null);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const input = toInput(form);
    const payload = editing
      ? { ...input, generatorId: editing.id, expectedVersion: editing.version }
      : input;
    const check = editing
      ? EditGeneratorInput.safeParse(payload)
      : GeneratorInput.safeParse(payload);
    if (!check.success) {
      const next: Record<string, string> = {};
      for (const issue of check.error.issues) {
        next[String(issue.path[0] ?? "form")] ??= issue.message;
      }
      setErrors(next);
      return;
    }
    setErrors({});
    startTransition(async () => {
      const result = editing
        ? await updateGeneratorAction(payload)
        : await addGeneratorAction(payload);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success(editing ? "Generator updated" : "Generator added");
      if (!editing) reset();
      onOpenChange(false);
      router.refresh();
    });
  }

  /** A number field: label, id, the form key and its error. */
  const numberField = (
    key:
      | "ratedKva"
      | "maxKva"
      | "tankLitres"
      | "runtime50Hours"
      | "runtime100Hours",
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
        onChange={(e) => set(key, e.target.value)}
        aria-invalid={errors[key] ? true : undefined}
      />
    </Field>
  );

  const linkable = inventory.length > 0 || form.inventoryItemId !== NO_ITEM;

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
              {editing ? "Edit generator" : "Add a generator"}
            </DialogTitle>
            <DialogDescription>
              The figures on its datasheet. The fuel estimate draws its line
              through the two runtimes.
            </DialogDescription>
          </DialogHeader>

          <Field
            label="Model"
            htmlFor={id("model")}
            required
            error={errors.model}
          >
            <Input
              id={id("model")}
              value={form.model}
              onChange={(e) => set("model", e.target.value)}
              maxLength={80}
              aria-invalid={errors.model ? true : undefined}
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-3">
            {numberField("ratedKva", "Rated kVA", "What it gives all day.")}
            {numberField(
              "maxKva",
              "Max kVA",
              "For a moment, as a motor starts.",
            )}
            {numberField("tankLitres", "Tank (L)")}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {numberField("runtime50Hours", "Runtime at 50% load (h)")}
            {numberField("runtime100Hours", "Runtime at 100% load (h)")}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Fuel" htmlFor={id("fuel")}>
              <Select
                value={form.fuelType}
                onValueChange={(v) => set("fuelType", v as FuelType)}
              >
                <SelectTrigger id={id("fuel")}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FUEL_TYPES.map((f) => (
                    <SelectItem key={f} value={f}>
                      {FUEL_LABELS[f]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Whose it is" htmlFor={id("owner")}>
              <Select
                value={form.owner}
                onValueChange={(v) => set("owner", v as GeneratorOwner)}
              >
                <SelectTrigger id={id("owner")}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {GENERATOR_OWNERS.map((o) => (
                    <SelectItem key={o} value={o}>
                      {GENERATOR_OWNER_LABELS[o]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>

          <Field
            label="Noise note (optional)"
            htmlFor={id("noise")}
            error={errors.noiseNote}
            help="Such as 'quiet inverter' or 'park it behind the truck'."
          >
            <Input
              id={id("noise")}
              value={form.noiseNote}
              onChange={(e) => set("noiseNote", e.target.value)}
              maxLength={200}
              aria-invalid={errors.noiseNote ? true : undefined}
            />
          </Field>

          {linkable ? (
            <Field
              label="Inventory item (optional)"
              htmlFor={id("inventory")}
              error={errors.inventoryItemId}
            >
              <Select
                value={form.inventoryItemId}
                onValueChange={(v) => set("inventoryItemId", v)}
              >
                <SelectTrigger id={id("inventory")}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_ITEM}>Not linked</SelectItem>
                  {form.inventoryItemId !== NO_ITEM &&
                    !inventory.some((i) => i.id === form.inventoryItemId) && (
                      <SelectItem value={form.inventoryItemId}>
                        The linked item (no longer stocked)
                      </SelectItem>
                    )}
                  {inventory.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          ) : (
            <p className="text-xs text-muted-foreground">
              Nothing in the inventory to link it to yet.
            </p>
          )}

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
                onOpenChange(false);
              }}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {editing
                ? pending
                  ? "Saving…"
                  : "Save changes"
                : pending
                  ? "Adding…"
                  : "Add generator"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** What a disabled control says it is, and where it points for the reason. */
function refusalProps(canEdit: boolean, name: string, refusalId: string) {
  return canEdit
    ? { "aria-label": name }
    : {
        "aria-label": `${name} — not available to you`,
        "aria-describedby": refusalId,
      };
}

export function AddGeneratorButton({
  canEdit,
  refusalId,
  inventory,
}: {
  canEdit: boolean;
  refusalId: string;
  inventory: GeneratorInventoryOption[];
}) {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <Button
        variant="outline"
        size="sm"
        disabled={!canEdit}
        onClick={() => setOpen(true)}
        {...refusalProps(canEdit, "Add generator", refusalId)}
      >
        <Plus aria-hidden />
        Add generator
      </Button>
      {canEdit && (
        <GeneratorDialog
          open={open}
          onOpenChange={setOpen}
          inventory={inventory}
        />
      )}
    </>
  );
}

/** Edit and Archive for one row. Only the control that was used spins. */
export function GeneratorRowActions({
  generator,
  canEdit,
  refusalId,
  inventory,
}: {
  generator: EditableGenerator;
  canEdit: boolean;
  refusalId: string;
  inventory: GeneratorInventoryOption[];
}) {
  const router = useRouter();
  const [editOpen, setEditOpen] = React.useState(false);
  const [archiving, startArchive] = React.useTransition();

  // A one-tap change on a list row: its failure is a toast.
  function archive() {
    startArchive(async () => {
      const result = await archiveGeneratorAction({
        generatorId: generator.id,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(`${generator.model} archived`);
      router.refresh();
    });
  }

  return (
    <span className="flex items-center justify-end gap-1">
      <Button
        variant="ghost"
        size="icon"
        disabled={!canEdit || archiving}
        onClick={() => setEditOpen(true)}
        {...refusalProps(canEdit, `Edit ${generator.model}`, refusalId)}
      >
        <Pencil aria-hidden />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        disabled={!canEdit || archiving}
        onClick={archive}
        {...refusalProps(canEdit, `Archive ${generator.model}`, refusalId)}
      >
        {archiving ? (
          <Spinner size="sm" label="Archiving…" />
        ) : (
          <Archive aria-hidden />
        )}
      </Button>
      {canEdit && (
        <GeneratorDialog
          key={`${generator.id}:${generator.version}`}
          open={editOpen}
          onOpenChange={setEditOpen}
          editing={generator}
          inventory={inventory}
        />
      )}
    </span>
  );
}
