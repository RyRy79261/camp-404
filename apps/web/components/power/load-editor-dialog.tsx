"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Link2Off, Plus, X } from "lucide-react";
import { bulbs, hoursOn, ledStrip, loadWatts } from "@camp404/core";
import {
  CURRENT_KINDS,
  EditLoadInput,
  LOAD_AREA_SUGGESTIONS,
  LOAD_CATEGORIES,
  LOAD_OWNERS,
  LoadInput,
  MAX_DAYS_ON_SITE,
  MAX_LOAD_WINDOWS,
  type CurrentKind,
  type LoadCategory,
  type LoadOwner,
  type LoadSchedule,
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
import { SegmentedControl } from "@camp404/ui/components/segmented-control";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@camp404/ui/components/select";
import { toast } from "@camp404/ui/components/toast";
import { addLoadAction, updateLoadAction } from "@/app/(console)/power/actions";
import {
  CATEGORY_LABELS,
  OWNER_LABELS,
  formatNumber,
  hourText,
  watts,
} from "@/lib/power-copy";

// Add a load to this year's list or, given `editing`, change one (#253). The
// fields follow LoadInput. A quick-add helper sits above them: plain watts, a
// LED strip (volts × W per metre × metres), a string of bulbs, or an item from
// the inventory; each one fills the fields below rather than saving by itself.
// A live line shows this row's running watts and Wh a day from the same core
// functions the page's totals use.
//
// A problem with what was typed shows beside the field (the same Zod input the
// action parses); a refusal from the server shows at the foot of the dialog.

/** A load as the dialog edits it. The page passes the row; no member id. */
export interface EditableLoad {
  id: string;
  version: number;
  name: string;
  area: string;
  category: LoadCategory;
  quantity: number;
  wattsEach: number;
  surgeWattsEach: number | null;
  dutyPct: number;
  schedule: LoadSchedule;
  hoursPerDay: number | null;
  windows: { fromHour: number; toHour: number }[] | null;
  fromDay: number | null;
  toDay: number | null;
  volts: number;
  current: CurrentKind;
  owner: LoadOwner;
  neighbourCamp: string | null;
  inventoryItemId: string | null;
  circuit: string | null;
}

export interface InventoryOption {
  id: string;
  name: string;
  quantity: number;
  wattsEach: number | null;
}

type Helper = "watts" | "led" | "bulbs" | "inventory";

const HELPERS = [
  { value: "watts", label: "Watts" },
  { value: "led", label: "LED strip" },
  { value: "bulbs", label: "Bulbs" },
  { value: "inventory", label: "From inventory" },
];

const SCHEDULES = [
  { value: "full_time", label: "All day" },
  { value: "hours_per_day", label: "Hours a day" },
  { value: "windows", label: "Time windows" },
];

const HOURS = Array.from({ length: 24 }, (_, h) => h);

interface Window {
  from: string;
  to: string;
}

interface FormState {
  name: string;
  area: string;
  category: LoadCategory;
  quantity: string;
  wattsEach: string;
  surgeWattsEach: string;
  dutyPct: string;
  schedule: LoadSchedule;
  hoursPerDay: string;
  windows: Window[];
  fromDay: string;
  toDay: string;
  volts: string;
  current: CurrentKind;
  owner: LoadOwner;
  neighbourCamp: string;
  circuit: string;
  inventoryItemId: string | null;
}

const text = (n: number | null | undefined) => (n == null ? "" : String(n));

function initialState(load?: EditableLoad): FormState {
  return {
    name: load?.name ?? "",
    area: load?.area ?? "",
    category: load?.category ?? "other",
    quantity: text(load?.quantity ?? 1),
    wattsEach: text(load?.wattsEach),
    surgeWattsEach: text(load?.surgeWattsEach),
    dutyPct: text(load?.dutyPct ?? 100),
    schedule: load?.schedule ?? "full_time",
    hoursPerDay: text(load?.hoursPerDay),
    windows: load?.windows?.map((w) => ({
      from: String(w.fromHour),
      to: String(w.toHour),
    })) ?? [{ from: "18", to: "2" }],
    fromDay: text(load?.fromDay),
    toDay: text(load?.toDay),
    volts: text(load?.volts ?? 230),
    current: load?.current ?? "ac",
    owner: load?.owner ?? "camp",
    neighbourCamp: load?.neighbourCamp ?? "",
    circuit: load?.circuit ?? "",
    inventoryItemId: load?.inventoryItemId ?? null,
  };
}

/** A typed figure: blank is no answer; anything unreadable counts as 0. */
function numberOrNull(value: string): number | null {
  if (value.trim() === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/**
 * The form as the action receives it. A blank required figure becomes 0, so
 * the input's own sentence ("Give the watts it draws.") names it; a blank
 * optional one is null, and a blank duty cycle or voltage takes the default.
 */
function toInput(form: FormState) {
  return {
    name: form.name,
    area: form.area,
    category: form.category,
    quantity: numberOrNull(form.quantity) ?? 0,
    wattsEach: numberOrNull(form.wattsEach) ?? 0,
    surgeWattsEach: numberOrNull(form.surgeWattsEach),
    dutyPct: numberOrNull(form.dutyPct) ?? undefined,
    schedule: form.schedule,
    // Only the schedule's own figures: a stale value from another schedule
    // must not block the save.
    hoursPerDay:
      form.schedule === "hours_per_day" ? numberOrNull(form.hoursPerDay) : null,
    windows:
      form.schedule === "windows"
        ? form.windows.map((w) => ({
            fromHour: Number(w.from),
            toHour: Number(w.to),
          }))
        : null,
    fromDay: numberOrNull(form.fromDay),
    toDay: numberOrNull(form.toDay),
    volts: numberOrNull(form.volts) ?? undefined,
    current: form.current,
    owner: form.owner,
    neighbourCamp: form.owner === "neighbour" ? form.neighbourCamp : null,
    inventoryItemId: form.inventoryItemId,
    circuit: form.circuit,
  };
}

/** The first problem for each field, keyed by its top-level name. */
function fieldErrors(
  issues: readonly { path: readonly PropertyKey[]; message: string }[],
): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const issue of issues) {
    const key = String(issue.path[0] ?? "form");
    errors[key] ??= issue.message;
  }
  return errors;
}

/** Running watts and Wh a day for the row as typed, or null while incomplete. */
function preview(form: FormState): { w: number; wh: number } | null {
  const input = toInput(form);
  if (input.quantity <= 0 || input.wattsEach <= 0) return null;
  const w = loadWatts({
    quantity: input.quantity,
    wattsEach: input.wattsEach,
    dutyPct: input.dutyPct ?? 100,
  });
  const hours = hoursOn({
    schedule: input.schedule,
    hoursPerDay: input.hoursPerDay,
    windows: input.windows,
  });
  return { w, wh: w * hours };
}

export function LoadEditorDialog({
  open,
  onOpenChange,
  editing,
  inventory,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing?: EditableLoad;
  inventory: InventoryOption[];
}) {
  const router = useRouter();
  const [form, setForm] = React.useState<FormState>(() =>
    initialState(editing),
  );
  const [helper, setHelper] = React.useState<Helper>("watts");
  const [led, setLed] = React.useState({
    volts: "12",
    perMetre: "",
    metres: "",
  });
  const [bulb, setBulb] = React.useState({ count: "", each: "" });
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();
  const idBase = React.useId();
  const id = (name: string) => `${idBase}-${name}`;

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  function reset() {
    setForm(initialState(editing));
    setHelper("watts");
    setLed({ volts: "12", perMetre: "", metres: "" });
    setBulb({ count: "", each: "" });
    setErrors({});
    setError(null);
  }

  const ledVolts = numberOrNull(led.volts) ?? 0;
  const ledResult =
    ledVolts > 0 &&
    (numberOrNull(led.perMetre) ?? 0) > 0 &&
    (numberOrNull(led.metres) ?? 0) > 0
      ? ledStrip(
          ledVolts,
          numberOrNull(led.perMetre)!,
          numberOrNull(led.metres)!,
        )
      : null;
  const bulbCount = numberOrNull(bulb.count) ?? 0;
  const bulbEach = numberOrNull(bulb.each) ?? 0;

  function applyLed() {
    if (!ledResult) return;
    setForm((f) => ({
      ...f,
      wattsEach: String(ledResult.watts),
      quantity: "1",
      volts: String(ledVolts),
      current: "dc",
      category: "lighting_decorative",
    }));
  }

  function applyBulbs() {
    if (bulbCount <= 0 || bulbEach <= 0) return;
    setForm((f) => ({
      ...f,
      quantity: String(bulbCount),
      wattsEach: String(bulbEach),
    }));
  }

  function pickInventory(itemId: string) {
    const item = inventory.find((i) => i.id === itemId);
    if (!item) return;
    setForm((f) => ({
      ...f,
      name: item.name,
      quantity: String(item.quantity),
      inventoryItemId: item.id,
      wattsEach: item.wattsEach == null ? f.wattsEach : String(item.wattsEach),
    }));
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const input = toInput(form);
    const payload = editing
      ? { ...input, loadId: editing.id, expectedVersion: editing.version }
      : input;
    const check = editing
      ? EditLoadInput.safeParse(payload)
      : LoadInput.safeParse(payload);
    if (!check.success) {
      setErrors(fieldErrors(check.error.issues));
      return;
    }
    setErrors({});
    startTransition(async () => {
      const result = editing
        ? await updateLoadAction(payload)
        : await addLoadAction(payload);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success(editing ? "Load updated" : "Load added");
      if (!editing) reset();
      onOpenChange(false);
      router.refresh();
    });
  }

  const row = preview(form);
  const linked = form.inventoryItemId
    ? (inventory.find((i) => i.id === form.inventoryItemId)?.name ??
      "an inventory item")
    : null;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (pending) return;
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-2xl">
        <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit load" : "Add a load"}</DialogTitle>
            <DialogDescription>
              Everything the camp plugs in, one row per kind of thing. The
              totals update when you save.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-3 rounded-lg border border-border p-3">
            <SegmentedControl
              aria-label="Quick add"
              options={HELPERS}
              value={helper}
              onValueChange={(v) => setHelper(v as Helper)}
            />
            {helper === "watts" && (
              <p className="text-xs text-muted-foreground">
                Type the watts from the label or the plug below.
              </p>
            )}
            {helper === "led" && (
              <div className="flex flex-col gap-3">
                <div className="grid gap-3 sm:grid-cols-3">
                  <Field label="Strip volts" htmlFor={id("led-volts")}>
                    <Input
                      id={id("led-volts")}
                      type="number"
                      inputMode="decimal"
                      min={1}
                      value={led.volts}
                      onChange={(e) =>
                        setLed((l) => ({ ...l, volts: e.target.value }))
                      }
                    />
                  </Field>
                  <Field label="Watts per metre" htmlFor={id("led-wpm")}>
                    <Input
                      id={id("led-wpm")}
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step="any"
                      value={led.perMetre}
                      onChange={(e) =>
                        setLed((l) => ({ ...l, perMetre: e.target.value }))
                      }
                    />
                  </Field>
                  <Field label="Metres" htmlFor={id("led-metres")}>
                    <Input
                      id={id("led-metres")}
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step="any"
                      value={led.metres}
                      onChange={(e) =>
                        setLed((l) => ({ ...l, metres: e.target.value }))
                      }
                    />
                  </Field>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm tabular-nums" aria-live="polite">
                    {ledResult
                      ? `${watts(ledResult.watts)} · ${formatNumber(ledResult.amps, 1)} A at ${formatNumber(ledVolts, 1)} V`
                      : "Give the volts, watts per metre and metres."}
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={!ledResult}
                    onClick={applyLed}
                  >
                    Use these figures
                  </Button>
                </div>
              </div>
            )}
            {helper === "bulbs" && (
              <div className="flex flex-col gap-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Number of bulbs" htmlFor={id("bulb-count")}>
                    <Input
                      id={id("bulb-count")}
                      type="number"
                      inputMode="numeric"
                      min={1}
                      value={bulb.count}
                      onChange={(e) =>
                        setBulb((b) => ({ ...b, count: e.target.value }))
                      }
                    />
                  </Field>
                  <Field label="Watts per bulb" htmlFor={id("bulb-each")}>
                    <Input
                      id={id("bulb-each")}
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step="any"
                      value={bulb.each}
                      onChange={(e) =>
                        setBulb((b) => ({ ...b, each: e.target.value }))
                      }
                    />
                  </Field>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm tabular-nums" aria-live="polite">
                    {bulbCount > 0 && bulbEach > 0
                      ? watts(bulbs(bulbCount, bulbEach))
                      : "Give the number of bulbs and the watts of one."}
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={bulbCount <= 0 || bulbEach <= 0}
                    onClick={applyBulbs}
                  >
                    Use these figures
                  </Button>
                </div>
              </div>
            )}
            {helper === "inventory" &&
              (inventory.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nothing in the inventory yet.
                </p>
              ) : (
                <Field
                  label="Inventory item"
                  htmlFor={id("inventory")}
                  help="Fills the name, the count and, when the item has them, the watts."
                >
                  <Select
                    value={form.inventoryItemId ?? undefined}
                    onValueChange={pickInventory}
                  >
                    <SelectTrigger id={id("inventory")}>
                      <SelectValue placeholder="Pick an item" />
                    </SelectTrigger>
                    <SelectContent>
                      {inventory.map((item) => (
                        <SelectItem key={item.id} value={item.id}>
                          {item.name}
                          {item.wattsEach != null
                            ? ` (${watts(item.wattsEach)})`
                            : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              ))}
          </div>

          {linked && (
            <p className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
              <span>Linked to {linked} in the inventory.</span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => set("inventoryItemId", null)}
              >
                <Link2Off aria-hidden />
                Unlink
              </Button>
            </p>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Name"
              htmlFor={id("name")}
              required
              error={errors.name}
            >
              <Input
                id={id("name")}
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
                maxLength={80}
                aria-invalid={errors.name ? true : undefined}
              />
            </Field>
            <Field
              label="Area"
              htmlFor={id("area")}
              required
              error={errors.area}
              help="Where it is used, such as kitchen or lounge."
            >
              <Input
                id={id("area")}
                value={form.area}
                list={id("areas")}
                onChange={(e) => set("area", e.target.value)}
                maxLength={60}
                aria-invalid={errors.area ? true : undefined}
              />
              <datalist id={id("areas")}>
                {LOAD_AREA_SUGGESTIONS.map((a) => (
                  <option key={a} value={a} />
                ))}
              </datalist>
            </Field>
            <Field label="Category" htmlFor={id("category")}>
              <Select
                value={form.category}
                onValueChange={(v) => set("category", v as LoadCategory)}
              >
                <SelectTrigger id={id("category")}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LOAD_CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {CATEGORY_LABELS[c]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Whose it is" htmlFor={id("owner")}>
              <Select
                value={form.owner}
                onValueChange={(v) => set("owner", v as LoadOwner)}
              >
                <SelectTrigger id={id("owner")}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LOAD_OWNERS.map((o) => (
                    <SelectItem key={o} value={o}>
                      {OWNER_LABELS[o]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            {form.owner === "neighbour" && (
              <Field
                label="Neighbour's camp"
                htmlFor={id("neighbour")}
                error={errors.neighbourCamp}
                className="sm:col-span-2"
              >
                <Input
                  id={id("neighbour")}
                  value={form.neighbourCamp}
                  onChange={(e) => set("neighbourCamp", e.target.value)}
                  maxLength={80}
                />
              </Field>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field
              label="Quantity"
              htmlFor={id("quantity")}
              required
              error={errors.quantity}
            >
              <Input
                id={id("quantity")}
                type="number"
                inputMode="numeric"
                min={1}
                value={form.quantity}
                onChange={(e) => set("quantity", e.target.value)}
                aria-invalid={errors.quantity ? true : undefined}
              />
            </Field>
            <Field
              label="Watts each"
              htmlFor={id("watts")}
              required
              error={errors.wattsEach}
            >
              <Input
                id={id("watts")}
                type="number"
                inputMode="decimal"
                min={0}
                step="any"
                value={form.wattsEach}
                onChange={(e) => set("wattsEach", e.target.value)}
                aria-invalid={errors.wattsEach ? true : undefined}
              />
            </Field>
            <Field
              label="Duty cycle (%)"
              htmlFor={id("duty")}
              error={errors.dutyPct}
              help="How much of the time it draws, such as a fridge's compressor."
            >
              <Input
                id={id("duty")}
                type="number"
                inputMode="decimal"
                min={1}
                max={100}
                value={form.dutyPct}
                onChange={(e) => set("dutyPct", e.target.value)}
                aria-invalid={errors.dutyPct ? true : undefined}
              />
            </Field>
            <Field
              label="Start-up spike, watts each (optional)"
              htmlFor={id("surge")}
              error={errors.surgeWattsEach}
              help="Fridges and freezers draw a short burst when their motor starts, about 3 times their normal draw. Leave it empty to use that."
              className="sm:col-span-3"
            >
              <Input
                id={id("surge")}
                type="number"
                inputMode="decimal"
                min={0}
                step="any"
                value={form.surgeWattsEach}
                onChange={(e) => set("surgeWattsEach", e.target.value)}
                aria-invalid={errors.surgeWattsEach ? true : undefined}
              />
            </Field>
          </div>

          <fieldset className="flex flex-col gap-3">
            <legend className="mb-1.5 text-sm font-medium">When it runs</legend>
            <SegmentedControl
              aria-label="When it runs"
              options={SCHEDULES}
              value={form.schedule}
              onValueChange={(v) => set("schedule", v as LoadSchedule)}
            />
            {form.schedule === "hours_per_day" && (
              <Field
                label="Hours it runs each day"
                htmlFor={id("hours")}
                error={errors.hoursPerDay}
                help="How long, not when. The peak counts it as on at the busiest hour; use time windows if you know when it runs."
              >
                <Input
                  id={id("hours")}
                  type="number"
                  inputMode="decimal"
                  min={0}
                  max={24}
                  step="any"
                  value={form.hoursPerDay}
                  onChange={(e) => set("hoursPerDay", e.target.value)}
                  aria-invalid={errors.hoursPerDay ? true : undefined}
                />
              </Field>
            )}
            {form.schedule === "windows" && (
              <div className="flex flex-col gap-2">
                {form.windows.map((w, i) => (
                  <div key={i} className="flex flex-wrap items-end gap-2">
                    <HourSelect
                      id={id(`w${i}-from`)}
                      label={`Window ${i + 1} from`}
                      value={w.from}
                      onChange={(v) =>
                        set(
                          "windows",
                          form.windows.map((x, j) =>
                            j === i ? { ...x, from: v } : x,
                          ),
                        )
                      }
                    />
                    <HourSelect
                      id={id(`w${i}-to`)}
                      label={`Window ${i + 1} to`}
                      value={w.to}
                      onChange={(v) =>
                        set(
                          "windows",
                          form.windows.map((x, j) =>
                            j === i ? { ...x, to: v } : x,
                          ),
                        )
                      }
                    />
                    {form.windows.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`Remove window ${i + 1}`}
                        onClick={() =>
                          set(
                            "windows",
                            form.windows.filter((_, j) => j !== i),
                          )
                        }
                      >
                        <X aria-hidden />
                      </Button>
                    )}
                  </div>
                ))}
                {errors.windows && (
                  <p className="text-xs font-medium text-destructive">
                    {errors.windows}
                  </p>
                )}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs text-muted-foreground">
                    Whole hours. A window may run past midnight, such as 18:00
                    to 02:00.
                  </p>
                  {form.windows.length < MAX_LOAD_WINDOWS && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        set("windows", [
                          ...form.windows,
                          { from: "6", to: "8" },
                        ])
                      }
                    >
                      <Plus aria-hidden />
                      Add a window
                    </Button>
                  )}
                </div>
              </div>
            )}
          </fieldset>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="First day"
              htmlFor={id("from-day")}
              error={errors.fromDay}
              help="Day numbers on site. Leave both empty for every day."
            >
              <Input
                id={id("from-day")}
                type="number"
                inputMode="numeric"
                min={1}
                max={MAX_DAYS_ON_SITE}
                value={form.fromDay}
                onChange={(e) => set("fromDay", e.target.value)}
                aria-invalid={errors.fromDay ? true : undefined}
              />
            </Field>
            <Field label="Last day" htmlFor={id("to-day")} error={errors.toDay}>
              <Input
                id={id("to-day")}
                type="number"
                inputMode="numeric"
                min={1}
                max={MAX_DAYS_ON_SITE}
                value={form.toDay}
                onChange={(e) => set("toDay", e.target.value)}
                aria-invalid={errors.toDay ? true : undefined}
              />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Volts" htmlFor={id("volts")} error={errors.volts}>
              <Input
                id={id("volts")}
                type="number"
                inputMode="decimal"
                min={1}
                value={form.volts}
                onChange={(e) => set("volts", e.target.value)}
                aria-invalid={errors.volts ? true : undefined}
              />
            </Field>
            <Field label="Current" htmlFor={id("current")}>
              <Select
                value={form.current}
                onValueChange={(v) => set("current", v as CurrentKind)}
              >
                <SelectTrigger id={id("current")}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CURRENT_KINDS.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c.toUpperCase()}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field
              label="Circuit (optional)"
              htmlFor={id("circuit")}
              error={errors.circuit}
            >
              <Input
                id={id("circuit")}
                value={form.circuit}
                onChange={(e) => set("circuit", e.target.value)}
                maxLength={40}
              />
            </Field>
          </div>

          <p
            className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm tabular-nums"
            aria-live="polite"
          >
            {row
              ? `This row: ${watts(row.w)} running · ${formatNumber(row.wh, 0)} Wh a day`
              : "This row: give the quantity and the watts to see its draw."}
          </p>

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
                  : "Add load"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function HourSelect({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <Field label={label} htmlFor={id} className="w-36">
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id={id}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {HOURS.map((h) => (
            <SelectItem key={h} value={String(h)}>
              {hourText(h)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  );
}
