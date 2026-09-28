"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus } from "lucide-react";
import {
  EditInventoryItemInput,
  INVENTORY_CATEGORIES,
  INVENTORY_CONDITIONS,
  INVENTORY_LOCATIONS,
  InventoryItemInput,
  type InventoryCategory,
  type InventoryCondition,
  type InventoryLocation,
} from "@camp404/types";
import { Button } from "@camp404/ui/components/button";
import { AckRow } from "@camp404/ui/components/checkbox";
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
import { Textarea } from "@camp404/ui/components/textarea";
import { toast } from "@camp404/ui/components/toast";
import {
  addItemAction,
  updateItemAction,
} from "@/app/(console)/inventory/actions";
import {
  CATEGORY_LABELS,
  CONDITION_LABELS,
  LOCATION_LABELS,
  inventoryItemPath,
} from "@/lib/inventory-copy";
import { NativeSelect, type SelectOption } from "./native-select";
import { reached } from "@/lib/reach-action";

// Add or edit one item (#246): the AfrikaBurn categories manager's dialog.
// Only a captain or a lead of the item's team sees it; the team picker offers
// only the teams they may change, and the server checks again.

/** An item as the edit dialog takes it. */
export interface EditableItem {
  id: string;
  version: number;
  name: string;
  details: string | null;
  team: string;
  category: InventoryCategory;
  condition: InventoryCondition;
  quantity: number;
  unit: string | null;
  weightKg: number | null;
  wattsEach: number | null;
  location: InventoryLocation;
  custodianUserId: string | null;
  storageLocation: string | null;
  requiresMaintenance: boolean;
  maintenanceIntervalDays: number | null;
  bookableCount: number | null;
}

type Form = Record<
  | "name"
  | "details"
  | "team"
  | "category"
  | "condition"
  | "quantity"
  | "unit"
  | "weightKg"
  | "wattsEach"
  | "location"
  | "custodianUserId"
  | "storageLocation"
  | "maintenanceIntervalDays"
  | "bookableCount",
  string
> & { requiresMaintenance: boolean };

const text = (v: string | number | null | undefined) =>
  v === null || v === undefined ? "" : String(v);

function initialForm(
  item: EditableItem | undefined,
  teams: SelectOption[],
): Form {
  return {
    name: text(item?.name),
    details: text(item?.details),
    team: item?.team ?? teams[0]?.value ?? "",
    category: item?.category ?? "other",
    condition: item?.condition ?? "good",
    quantity: text(item?.quantity ?? 1),
    unit: text(item?.unit),
    weightKg: text(item?.weightKg),
    wattsEach: text(item?.wattsEach),
    location: item?.location ?? "storage_unit",
    custodianUserId: text(item?.custodianUserId),
    storageLocation: text(item?.storageLocation),
    requiresMaintenance: item?.requiresMaintenance ?? false,
    maintenanceIntervalDays: text(item?.maintenanceIntervalDays),
    bookableCount: text(item?.bookableCount),
  };
}

/** A typed number, or null for a blank box (NaN when it isn't a number). */
function num(value: string): number | null {
  return value.trim() === "" ? null : Number(value);
}

function payloadOf(form: Form) {
  return {
    name: form.name,
    details: form.details,
    team: form.team,
    category: form.category,
    condition: form.condition,
    quantity: num(form.quantity) ?? Number.NaN,
    unit: form.unit,
    weightKg: num(form.weightKg),
    wattsEach: num(form.wattsEach),
    location: form.location,
    custodianUserId: form.custodianUserId || null,
    storageLocation: form.storageLocation,
    requiresMaintenance: form.requiresMaintenance,
    maintenanceIntervalDays: num(form.maintenanceIntervalDays),
    bookableCount: num(form.bookableCount),
  };
}

const CATEGORY_OPTIONS = INVENTORY_CATEGORIES.map((v) => ({
  value: v,
  label: CATEGORY_LABELS[v],
}));
const CONDITION_OPTIONS = INVENTORY_CONDITIONS.map((v) => ({
  value: v,
  label: CONDITION_LABELS[v],
}));
const LOCATION_OPTIONS = INVENTORY_LOCATIONS.map((v) => ({
  value: v,
  label: LOCATION_LABELS[v],
}));

export function ItemDialog({
  open,
  onOpenChange,
  editing,
  teams,
  members,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing?: EditableItem;
  /** The teams this person may put gear under. */
  teams: SelectOption[];
  members: SelectOption[];
}) {
  const router = useRouter();
  const [form, setForm] = React.useState(() => initialForm(editing, teams));
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();
  const idPrefix = editing ? `item-${editing.id}` : "item-new";
  const id = (field: string) => `${idPrefix}-${field}`;

  function set<K extends keyof Form>(key: K, value: Form[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function reset() {
    setForm(initialForm(editing, teams));
    setErrors({});
    setError(null);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const payload = editing
      ? {
          ...payloadOf(form),
          itemId: editing.id,
          expectedVersion: editing.version,
        }
      : payloadOf(form);
    const check = (
      editing ? EditInventoryItemInput : InventoryItemInput
    ).safeParse(payload);
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
      if (editing) {
        const result = await reached(updateItemAction(payload));
        if (!result.ok) {
          setError(result.error);
          return;
        }
        toast.success("Item saved");
        onOpenChange(false);
        router.refresh();
        return;
      }
      const result = await reached(addItemAction(payload));
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success("Item added");
      onOpenChange(false);
      reset();
      router.push(inventoryItemPath(result.data.id));
    });
  }

  const numberInput = (
    field: keyof Form,
    label: string,
    extra: React.InputHTMLAttributes<HTMLInputElement> = {},
    help?: string,
  ) => (
    <Field label={label} htmlFor={id(field)} error={errors[field]} help={help}>
      <Input
        id={id(field)}
        type="number"
        inputMode="decimal"
        value={form[field] as string}
        onChange={(e) => set(field, e.target.value as never)}
        aria-invalid={errors[field] ? true : undefined}
        {...extra}
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
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
          <DialogHeader>
            <DialogTitle>
              {editing ? `Edit ${editing.name}` : "Add an item"}
            </DialogTitle>
            <DialogDescription>
              {editing
                ? "Change what the camp has. The change log keeps the old values."
                : "Something the camp owns and keeps from year to year."}
            </DialogDescription>
          </DialogHeader>

          <Field label="Name" htmlFor={id("name")} error={errors.name} required>
            <Input
              id={id("name")}
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              aria-invalid={errors.name ? true : undefined}
            />
          </Field>

          <div className="grid gap-4 page-sm:grid-cols-2">
            <Field label="Team" htmlFor={id("team")} error={errors.team}>
              <NativeSelect
                id={id("team")}
                options={teams}
                value={form.team}
                onChange={(e) => set("team", e.target.value)}
              />
            </Field>
            <Field label="Kind of gear" htmlFor={id("category")}>
              <NativeSelect
                id={id("category")}
                options={CATEGORY_OPTIONS}
                value={form.category}
                onChange={(e) => set("category", e.target.value)}
              />
            </Field>
          </div>

          <div className="grid gap-4 page-sm:grid-cols-3">
            {numberInput("quantity", "How many", {
              min: 0,
              inputMode: "numeric",
            })}
            <Field
              label="Unit (optional)"
              htmlFor={id("unit")}
              error={errors.unit}
            >
              <Input
                id={id("unit")}
                placeholder="box, metre"
                value={form.unit}
                onChange={(e) => set("unit", e.target.value)}
              />
            </Field>
            <Field label="Condition" htmlFor={id("condition")}>
              <NativeSelect
                id={id("condition")}
                options={CONDITION_OPTIONS}
                value={form.condition}
                onChange={(e) => set("condition", e.target.value)}
              />
            </Field>
          </div>

          <div className="grid gap-4 page-sm:grid-cols-2">
            <Field label="Where it is" htmlFor={id("location")}>
              <NativeSelect
                id={id("location")}
                options={LOCATION_OPTIONS}
                value={form.location}
                onChange={(e) => set("location", e.target.value)}
              />
            </Field>
            {form.location === "custodian_home" ? (
              <Field
                label="Whose home"
                htmlFor={id("custodianUserId")}
                error={errors.custodianUserId}
              >
                <NativeSelect
                  id={id("custodianUserId")}
                  options={members}
                  placeholder="Pick a member"
                  value={form.custodianUserId}
                  onChange={(e) => set("custodianUserId", e.target.value)}
                />
              </Field>
            ) : (
              <Field
                label="Spot (optional)"
                htmlFor={id("storageLocation")}
                error={errors.storageLocation}
              >
                <Input
                  id={id("storageLocation")}
                  placeholder="Shelf 3"
                  value={form.storageLocation}
                  onChange={(e) => set("storageLocation", e.target.value)}
                />
              </Field>
            )}
          </div>

          <div className="grid gap-4 page-sm:grid-cols-3">
            {numberInput("weightKg", "Weight in kg", {
              min: 0,
              step: 0.1,
            })}
            {numberInput(
              "wattsEach",
              "Watts each",
              { min: 0 },
              "Only for gear that plugs in. The power plan reads it.",
            )}
            {numberInput(
              "bookableCount",
              "Bookings a year",
              { min: 1, inputMode: "numeric" },
              "How many members can book it. Leave blank if it isn't booked.",
            )}
          </div>

          <AckRow
            checked={form.requiresMaintenance}
            onCheckedChange={(v) => set("requiresMaintenance", v === true)}
          >
            It needs regular maintenance
          </AckRow>
          {form.requiresMaintenance &&
            numberInput("maintenanceIntervalDays", "Every how many days", {
              min: 1,
              inputMode: "numeric",
            })}

          <Field
            label="Details (optional)"
            htmlFor={id("details")}
            error={errors.details}
          >
            <Textarea
              id={id("details")}
              rows={3}
              value={form.details}
              onChange={(e) => set("details", e.target.value)}
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
                onOpenChange(false);
              }}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : editing ? "Save item" : "Add item"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** The heading's Add button; disabled, with the reason, for anyone else. */
export function AddItemButton({
  teams,
  members,
  refusalId,
}: {
  teams: SelectOption[];
  members: SelectOption[];
  refusalId: string;
}) {
  const [open, setOpen] = React.useState(false);
  const canAdd = teams.length > 0;
  return (
    <>
      <Button
        disabled={!canAdd}
        onClick={() => setOpen(true)}
        {...(canAdd
          ? {}
          : {
              "aria-label": "Add item — not available to you",
              "aria-describedby": refusalId,
            })}
      >
        <Plus aria-hidden />
        Add item
      </Button>
      {canAdd && (
        <ItemDialog
          open={open}
          onOpenChange={setOpen}
          teams={teams}
          members={members}
        />
      )}
    </>
  );
}

/** Edit on the item's page, for a captain or a lead of its team. */
export function EditItemButton({
  item,
  teams,
  members,
}: {
  item: EditableItem;
  teams: SelectOption[];
  members: SelectOption[];
}) {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Pencil aria-hidden />
        Edit
      </Button>
      <ItemDialog
        key={`${item.id}:${item.version}`}
        open={open}
        onOpenChange={setOpen}
        editing={item}
        teams={teams}
        members={members}
      />
    </>
  );
}
