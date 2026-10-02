"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Copy } from "lucide-react";
import { MAX_DAYS_ON_SITE, PowerPlanInput } from "@camp404/types";
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
import { SegmentedControl } from "@camp404/ui/components/segmented-control";
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
  copyLastYearPlanAction,
  saveFuelPlanAction,
} from "@/app/(console)/power/actions";
import { hourText } from "@/lib/power-copy";

// The year's plan (#254), behind the fuel estimate's "Change the plan": the
// generator, when it runs (24 h unless set; the camp runs it 24/7 and tops it
// up), days on site, the first powered day and the margins. The answer leads
// the page and this dialog keeps the settings out of its way (the owner's
// approved redesign, 2026-10-01); a reader sees the plan as a list of facts
// and never this form. It saves the whole plan with the version it opened, so
// a lost race shows its sentence here, beside the button.

export interface FuelPlanValues {
  generatorId: string | null;
  secondGeneratorNote: string | null;
  runFromHour: number | null;
  runToHour: number | null;
  daysOnSite: number;
  firstPoweredDay: string | null;
  powerFactor: number;
  lowLoadFactor: number;
  safetyMarginPct: number;
  canLitres: number;
  cansOwned: number;
  version: number;
}

export interface GeneratorOption {
  id: string;
  label: string;
}

/** The Select's value for "no generator"; Radix has no empty value. */
const NO_GENERATOR = "none";
const HOURS = Array.from({ length: 24 }, (_, h) => h);
const RUN_MODES = [
  { value: "full", label: "24 h" },
  { value: "set", label: "Set hours" },
];

type RunMode = "full" | "set";

interface Schedule {
  mode: RunMode;
  from: string;
  to: string;
}

interface FormState {
  generatorId: string;
  secondGeneratorNote: string;
  run: Schedule;
  daysOnSite: string;
  firstPoweredDay: string;
  powerFactor: string;
  lowLoadFactor: string;
  safetyMarginPct: string;
  canLitres: string;
  cansOwned: string;
}

/** A schedule as the form holds it; set hours start at 18:00–06:00. */
function schedule(from: number | null, to: number | null): Schedule {
  return from === null || to === null
    ? { mode: "full", from: "18", to: "6" }
    : { mode: "set", from: String(from), to: String(to) };
}

function initialState(plan: FuelPlanValues): FormState {
  return {
    generatorId: plan.generatorId ?? NO_GENERATOR,
    secondGeneratorNote: plan.secondGeneratorNote ?? "",
    run: schedule(plan.runFromHour, plan.runToHour),
    daysOnSite: String(plan.daysOnSite),
    firstPoweredDay: plan.firstPoweredDay ?? "",
    powerFactor: String(plan.powerFactor),
    lowLoadFactor: String(plan.lowLoadFactor),
    safetyMarginPct: String(plan.safetyMarginPct),
    canLitres: String(plan.canLitres),
    cansOwned: String(plan.cansOwned),
  };
}

/** A blank or unreadable figure is 0, so the input's own sentence names it. */
function figure(value: string): number {
  const n = Number(value);
  return value.trim() === "" || !Number.isFinite(n) ? 0 : n;
}

function hours(s: Schedule): [number | null, number | null] {
  return s.mode === "full" ? [null, null] : [Number(s.from), Number(s.to)];
}

function toInput(form: FormState, version: number) {
  const [runFromHour, runToHour] = hours(form.run);
  const note = form.secondGeneratorNote.trim();
  return {
    generatorId: form.generatorId === NO_GENERATOR ? null : form.generatorId,
    secondGeneratorNote: note === "" ? null : note,
    runFromHour,
    runToHour,
    daysOnSite: figure(form.daysOnSite),
    firstPoweredDay: form.firstPoweredDay === "" ? null : form.firstPoweredDay,
    powerFactor: figure(form.powerFactor),
    lowLoadFactor: figure(form.lowLoadFactor),
    safetyMarginPct: figure(form.safetyMarginPct),
    canLitres: figure(form.canLitres),
    cansOwned: figure(form.cansOwned),
    expectedVersion: version,
  };
}

/** The first problem for each field, keyed by its top-level name. */
function fieldErrors(
  issues: readonly { path: readonly PropertyKey[]; message: string }[],
): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const issue of issues) {
    errors[String(issue.path[0] ?? "form")] ??= issue.message;
  }
  return errors;
}

export function ChangePlanButton({
  plan,
  generators,
}: {
  plan: FuelPlanValues;
  generators: GeneratorOption[];
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [form, setForm] = React.useState<FormState>(() => initialState(plan));
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();
  const idBase = React.useId();
  const id = (name: string) => `${idBase}-${name}`;

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  function reset() {
    setForm(initialState(plan));
    setErrors({});
    setError(null);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const payload = toInput(form, plan.version);
    const check = PowerPlanInput.safeParse(payload);
    if (!check.success) {
      setErrors(fieldErrors(check.error.issues));
      return;
    }
    setErrors({});
    startTransition(async () => {
      const result = await saveFuelPlanAction(payload);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success("Fuel plan saved");
      setOpen(false);
      router.refresh();
    });
  }

  /** A number field of the plan. */
  const numberField = (
    key:
      | "daysOnSite"
      | "powerFactor"
      | "lowLoadFactor"
      | "safetyMarginPct"
      | "canLitres"
      | "cansOwned",
    label: string,
    attrs: { min: number; max?: number; step?: number | "any" },
    help?: string,
  ) => (
    <Field label={label} htmlFor={id(key)} error={errors[key]} help={help}>
      <Input
        id={id(key)}
        type="number"
        inputMode="decimal"
        min={attrs.min}
        max={attrs.max}
        step={attrs.step ?? "any"}
        value={form[key]}
        disabled={pending}
        onChange={(e) => set(key, e.target.value)}
        aria-invalid={errors[key] ? true : undefined}
      />
    </Field>
  );

  return (
    <>
      <Button onClick={() => setOpen(true)}>Change the plan</Button>
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
          className="max-h-[90svh] overflow-y-auto sm:max-w-2xl"
        >
          <form onSubmit={submit} className="flex flex-col gap-5" noValidate>
            <DialogHeader>
              <DialogTitle>The plan</DialogTitle>
              <DialogDescription>
                This year&apos;s generator, how long it runs and the margins.
                The load list and the fuel estimate both follow it.
              </DialogDescription>
            </DialogHeader>
            <div className="grid items-start gap-4 sm:grid-cols-2">
              <Field
                label="Generator"
                htmlFor={id("generator")}
                error={errors.generatorId}
              >
                <Select
                  value={form.generatorId}
                  onValueChange={(v) => set("generatorId", v)}
                  disabled={pending}
                >
                  <SelectTrigger id={id("generator")}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_GENERATOR}>None chosen</SelectItem>
                    {generators.map((g) => (
                      <SelectItem key={g.id} value={g.id}>
                        {g.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field
                label="Spare generator (optional)"
                htmlFor={id("second")}
                error={errors.secondGeneratorNote}
                help="A note only: the fuel sums plan one generator."
              >
                <Input
                  id={id("second")}
                  value={form.secondGeneratorNote}
                  maxLength={200}
                  disabled={pending}
                  onChange={(e) => set("secondGeneratorNote", e.target.value)}
                  aria-invalid={errors.secondGeneratorNote ? true : undefined}
                />
              </Field>
            </div>

            <ScheduleField
              idBase={id("run")}
              legend="Hours running"
              help="24 h unless you set hours. Each day repeats; hours may run past midnight."
              value={form.run}
              onChange={(v) => set("run", v)}
              disabled={pending}
              error={errors.runFromHour ?? errors.runToHour}
            />

            <div className="grid items-start gap-4 sm:grid-cols-2">
              {numberField("daysOnSite", "Days on site", {
                min: 1,
                max: MAX_DAYS_ON_SITE,
                step: 1,
              })}
              <Field
                label="First powered day"
                htmlFor={id("first-day")}
                error={errors.firstPoweredDay}
                help="Optional. Only puts dates on the days."
              >
                <DateControl
                  id={id("first-day")}
                  value={form.firstPoweredDay}
                  onChange={(e) => set("firstPoweredDay", e.target.value)}
                />
              </Field>
              {numberField(
                "safetyMarginPct",
                "Safety margin (%)",
                { min: 0, max: 100, step: 1 },
                "Added to the litres for the burn.",
              )}
              {numberField(
                "powerFactor",
                "Power factor",
                { min: 0.5, max: 1, step: 0.01 },
                "kVA = kW ÷ power factor. 0.8 is usual for a small generator.",
              )}
              {numberField("canLitres", "Jerry can size (L)", { min: 1 })}
              {numberField(
                "cansOwned",
                "Cans we already own",
                { min: 0, step: 1 },
                "Taken off the cans to buy.",
              )}
              {numberField(
                "lowLoadFactor",
                "Extra fuel when lightly loaded (×)",
                { min: 1, max: 3, step: 0.05 },
                "Under half load a generator burns more for what it gives. 1 adds nothing.",
              )}
            </div>

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
                {pending ? "Saving…" : "Save plan"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

function ScheduleField({
  idBase,
  legend,
  help,
  value,
  onChange,
  disabled,
  error,
}: {
  idBase: string;
  legend: string;
  help: string;
  value: Schedule;
  onChange: (value: Schedule) => void;
  disabled: boolean;
  error?: string;
}) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1.5 text-sm font-medium">{legend}</legend>
      <SegmentedControl
        aria-label={legend}
        options={RUN_MODES}
        value={value.mode}
        disabled={disabled}
        onValueChange={(v) => onChange({ ...value, mode: v as RunMode })}
      />
      {value.mode === "set" && (
        <div className="grid grid-cols-2 gap-2">
          <HourSelect
            id={`${idBase}-from`}
            label="From"
            name={`${legend}: from`}
            value={value.from}
            disabled={disabled}
            onChange={(from) => onChange({ ...value, from })}
          />
          <HourSelect
            id={`${idBase}-to`}
            label="To"
            name={`${legend}: to`}
            value={value.to}
            disabled={disabled}
            onChange={(to) => onChange({ ...value, to })}
          />
        </div>
      )}
      {error ? (
        <p className="text-xs font-medium text-destructive">{error}</p>
      ) : (
        <p className="text-xs text-muted-foreground">{help}</p>
      )}
    </fieldset>
  );
}

function HourSelect({
  id,
  label,
  name,
  value,
  disabled,
  onChange,
}: {
  id: string;
  /** The short label shown above it. */
  label: string;
  /** Its accessible name, which says which schedule. */
  name: string;
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-xs text-muted-foreground">
        {label}
      </label>
      <Select value={value} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger id={id} aria-label={name}>
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
    </div>
  );
}

/** Copies the most recent earlier year's plan into a year with none. */
export function CopyLastYearPlanButton({ fromCycle }: { fromCycle: number }) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  return (
    <Button
      variant="outline"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await copyLastYearPlanAction();
          if (!result.ok) {
            toast.error(result.error);
            return;
          }
          toast.success(`Copied ${fromCycle}'s plan`);
          router.refresh();
        })
      }
    >
      {pending ? <Spinner size="sm" label="Copying…" /> : <Copy aria-hidden />}
      Copy last year&apos;s plan
    </Button>
  );
}
