"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Copy } from "lucide-react";
import { MAX_DAYS_ON_SITE, PowerPlanInput } from "@camp404/types";
import { Button } from "@camp404/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@camp404/ui/components/card";
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

// The fuel page's plan card (#254): the generator, when it runs, the
// comparison schedule, days on site and the margins. Everyone sees the same
// fields; for a viewer who may not edit, each one is DISABLED and Save
// describes to the page's one refusal line (AfrikaBurn's categories screen:
// transparent, not hidden). It saves the whole card with the version it
// opened, so a lost race shows its sentence here, beside the button, and the
// figures below the card come from the server once the save is in.

export interface FuelPlanValues {
  generatorId: string | null;
  secondGeneratorNote: string | null;
  runFromHour: number | null;
  runToHour: number | null;
  compareRunFromHour: number | null;
  compareRunToHour: number | null;
  daysOnSite: number;
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
  compare: Schedule;
  daysOnSite: string;
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
    compare: schedule(plan.compareRunFromHour, plan.compareRunToHour),
    daysOnSite: String(plan.daysOnSite),
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
  const [compareRunFromHour, compareRunToHour] = hours(form.compare);
  const note = form.secondGeneratorNote.trim();
  return {
    generatorId: form.generatorId === NO_GENERATOR ? null : form.generatorId,
    secondGeneratorNote: note === "" ? null : note,
    runFromHour,
    runToHour,
    compareRunFromHour,
    compareRunToHour,
    daysOnSite: figure(form.daysOnSite),
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

export function FuelPlanForm({
  plan,
  generators,
  canEdit,
  refusalId,
}: {
  plan: FuelPlanValues;
  generators: GeneratorOption[];
  canEdit: boolean;
  refusalId: string;
}) {
  const router = useRouter();
  const [form, setForm] = React.useState<FormState>(() => initialState(plan));
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();
  const idBase = React.useId();
  const id = (name: string) => `${idBase}-${name}`;
  const locked = !canEdit || pending;

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canEdit) return;
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
    label: React.ReactNode,
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
        disabled={locked}
        onChange={(e) => set(key, e.target.value)}
        aria-invalid={errors[key] ? true : undefined}
      />
    </Field>
  );

  return (
    <Card role="article" aria-labelledby="fuel-plan">
      <CardHeader>
        <CardTitle id="fuel-plan" className="text-base">
          Plan
        </CardTitle>
        <CardDescription>
          This year&apos;s generator and how long it runs. The figures below
          follow what is saved.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="flex flex-col gap-5" noValidate>
          <div className="grid gap-4 md:grid-cols-2">
            <Field
              label="Generator"
              htmlFor={id("generator")}
              error={errors.generatorId}
            >
              <Select
                value={form.generatorId}
                onValueChange={(v) => set("generatorId", v)}
                disabled={locked}
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
              label="Second generator (a note)"
              htmlFor={id("second")}
              error={errors.secondGeneratorNote}
              help="The app plans one generator for now; note a second here."
            >
              <Input
                id={id("second")}
                value={form.secondGeneratorNote}
                maxLength={200}
                disabled={locked}
                onChange={(e) => set("secondGeneratorNote", e.target.value)}
                aria-invalid={errors.secondGeneratorNote ? true : undefined}
              />
            </Field>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <ScheduleField
              idBase={id("run")}
              legend="Hours running"
              help="Each day repeats. Hours may run past midnight."
              value={form.run}
              onChange={(v) => set("run", v)}
              disabled={locked}
              error={errors.runFromHour ?? errors.runToHour}
            />
            <ScheduleField
              idBase={id("compare")}
              legend="Comparison schedule"
              help="Shown beside the plan below. 18:00–06:00 (12 h) unless you change it."
              value={form.compare}
              onChange={(v) => set("compare", v)}
              disabled={locked}
              error={errors.compareRunFromHour ?? errors.compareRunToHour}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {numberField(
              "daysOnSite",
              <span className="leading-snug">
                Days on site (typed in; the camp calendar doesn&apos;t supply
                them yet)
              </span>,
              { min: 1, max: MAX_DAYS_ON_SITE, step: 1 },
            )}
            {numberField(
              "powerFactor",
              "Power factor",
              { min: 0.5, max: 1, step: 0.01 },
              "Shared with the load list.",
            )}
            {numberField(
              "lowLoadFactor",
              "Extra margin at low load",
              { min: 1, max: 3, step: 0.05 },
              "Multiplies each running hour under half load. 1 adds nothing.",
            )}
            {numberField(
              "safetyMarginPct",
              "Safety margin (%)",
              { min: 0, max: 100, step: 1 },
              "Added to the litres for the burn.",
            )}
            {numberField("canLitres", "Can size (L)", { min: 1 })}
            {numberField(
              "cansOwned",
              "Cans already owned",
              { min: 0, step: 1 },
              "Taken off the cans to buy.",
            )}
          </div>

          <div className="flex flex-wrap items-center justify-end gap-3">
            {error ? (
              <p
                role="alert"
                className="mr-auto text-sm font-medium text-destructive"
              >
                {error}
              </p>
            ) : null}
            <Button
              type="submit"
              disabled={locked}
              {...(canEdit
                ? {}
                : {
                    "aria-label": "Save plan — not available to you",
                    "aria-describedby": refusalId,
                  })}
            >
              {pending ? <Spinner size="sm" label="Saving…" /> : null}
              {pending ? "Saving…" : "Save plan"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
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
export function CopyLastYearPlanButton({
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
      {...(canEdit
        ? {}
        : {
            "aria-label": "Copy last year's plan — not available to you",
            "aria-describedby": refusalId,
          })}
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
