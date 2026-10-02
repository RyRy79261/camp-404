"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  foodsInWords,
  prepDueDate,
  prepGoesOnBoard,
  shortDay,
  type AllergenFlag,
} from "@camp404/core";
import {
  ALLERGEN_LABELS,
  KITCHEN_ALLERGENS,
  type AllergenPlanKind,
  type KitchenAllergen,
  type MealOfTheDay,
  type PrepTiming,
} from "@camp404/types";
import { cn } from "@camp404/ui/lib/utils";
import { DateControl } from "@camp404/ui/components/date-control";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@camp404/ui/components/dialog";
import {
  CheckboxCardGroup,
  OptionCardGroup,
} from "@camp404/ui/components/option-card-group";
import { toast } from "@camp404/ui/components/toast";
import { Spin } from "@/components/kitchen/kit";
import { FIELD_LABEL, QUIET_BUTTON } from "@/components/kitchen/labels";
import { UNREACHABLE } from "@/lib/recipe-copy";
import { platesLabel } from "@/lib/recipe-labels";
import {
  addPrepStepAction,
  correctAllergensAction,
  recordAllergenPlanAction,
  removePrepStepAction,
} from "./actions";

// Under each recipe on the meal plan, for a captain or a Kitchen lead (the
// owner's Option A of design/kitchen-dietary.html and kitchen-prep.html,
// 2026-10-02):
//
//  - The allergy flags: a red line for a food someone coming is anaphylactic
//    to, with "Record a plan" until a plan is in (then a green line with the
//    plan and "Change"); an amber line for what someone coming is allergic or
//    intolerant to. Counts only, never names. "Change allergens" on a flag
//    opens a small dialog to correct what the recipe holds (Claude marks it
//    when it proofreads).
//  - Prep steps: each with what and when it is due, an × to take it off, and
//    "+ Prep step", which asks what to do and when (the day before, the same
//    day, or before we leave and a date). No person responsible (the owner).
//    One due before Day 1 goes on Tasks for the Kitchen; one due on site
//    prints on that day's site sheet.
//
// A problem with what someone typed shows in the dialog beside it; a one-tap
// change (taking a step off) reports a refusal as a toast.

/** What a recipe on a meal shows under it. */
export interface MealCheckView {
  recipeId: string;
  versionId: string | null;
  allergens: KitchenAllergen[];
  /** Claude marked (or a lead corrected) the version's allergens. */
  marked: boolean;
  allergenRevision: number;
  red: AllergenFlag[];
  amber: AllergenFlag[];
  /** How many coming are anaphylactic to each red food. */
  anaphylactic: { allergen: KitchenAllergen; count: number }[];
  plan: {
    kind: AllergenPlanKind;
    details: string;
    allergens: KitchenAllergen[];
    version: number;
  } | null;
  /** The plan names every red food. */
  covered: boolean;
  prep: {
    id: string;
    what: string;
    dueDate: string;
    timing: PrepTiming;
  }[];
}

export interface MealContext {
  itemId: string;
  title: string;
  day: number;
  meal: MealOfTheDay;
  /** "Day 3 · Sat 24 Apr" */
  dayLabel: string;
  plates: number;
  /** The plan's saved date of Day 1, or null. */
  firstDay: string | null;
}

const FLAG =
  "mt-1 mb-1 grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 border-l-[3px] px-2.5 py-1.5 text-xs leading-5";

const LINK =
  "text-xs font-semibold whitespace-nowrap text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

const PLAN_WORDS: Record<AllergenPlanKind, string> = {
  portion: "A separate portion",
  substitution: "A substitution",
};

/** "Day 3, Sat 24 Apr, breakfast" from "Day 3 · Sat 24 Apr". */
function mealWords(ctx: MealContext): string {
  return `${ctx.dayLabel.replace(" · ", ", ")}, ${ctx.meal}`;
}

export function MealChecks({
  ctx,
  view,
}: {
  ctx: MealContext;
  view: MealCheckView;
}) {
  const [planning, setPlanning] = useState(false);
  const [fixing, setFixing] = useState(false);
  const [prepping, setPrepping] = useState(false);
  const redFoods = view.red.map((r) => r.allergen);
  const change = (
    <button
      type="button"
      className={LINK}
      aria-label={`Change allergens: ${ctx.title}`}
      onClick={() => setFixing(true)}
    >
      Change allergens
    </button>
  );

  return (
    <div className="flex flex-col" data-os-private>
      {view.red.length > 0 &&
        (view.covered && view.plan ? (
          <div
            data-testid="flag-planned"
            className={cn(FLAG, "border-success bg-success/10")}
          >
            <span>
              <b className="font-semibold">
                {view.red.map((r) => r.label).join(", ")}: plan recorded.
              </b>{" "}
              {PLAN_WORDS[view.plan.kind]}: {view.plan.details}
            </span>
            <button
              type="button"
              className={LINK}
              aria-label={`Change the plan: ${ctx.title}`}
              onClick={() => setPlanning(true)}
            >
              Change
            </button>
          </div>
        ) : (
          <div
            data-testid="flag-red"
            className={cn(FLAG, "border-destructive bg-destructive/10")}
          >
            <span className="text-destructive">
              {view.red.map((r) => (
                <b key={r.allergen} className="font-semibold">
                  {r.label}: {r.text}.{" "}
                </b>
              ))}
              No plan yet.
            </span>
            <span className="flex flex-col items-end gap-0.5">
              <button
                type="button"
                className={LINK}
                aria-label={`Record a plan: ${ctx.title}`}
                onClick={() => setPlanning(true)}
              >
                Record a plan
              </button>
              {change}
            </span>
          </div>
        ))}
      {view.amber.length > 0 && (
        <div
          data-testid="flag-amber"
          className={cn(FLAG, "border-warning bg-warning/10")}
        >
          <span>
            {view.amber.map((a, i) => (
              <span key={a.allergen}>
                {i > 0 && " · "}
                <b className="font-semibold">{a.label}</b>: {a.text}
              </span>
            ))}
          </span>
          {view.red.length === 0 && change}
        </div>
      )}
      {view.red.length > 0 && view.covered && view.amber.length === 0 && (
        <div className="-mt-0.5 mb-1 text-right">{change}</div>
      )}
      {!view.marked && view.versionId && (
        <div
          data-testid="flag-unmarked"
          className={cn(
            FLAG,
            "border-input bg-foreground/5 text-muted-foreground",
          )}
        >
          <span>Allergens not marked yet.</span>
          {change}
        </div>
      )}

      {view.prep.map((step) => (
        <PrepLine key={step.id} step={step} ctx={ctx} />
      ))}
      <button
        type="button"
        className={cn(LINK, "my-1 self-start text-[13px]")}
        aria-label={`Add a prep step: ${ctx.title}, ${mealWords(ctx)}`}
        onClick={() => setPrepping(true)}
      >
        + Prep step
      </button>

      {view.red.length > 0 && (
        <PlanDialog
          open={planning}
          onOpenChange={setPlanning}
          ctx={ctx}
          view={view}
          foods={redFoods}
        />
      )}
      {view.versionId && (
        <AllergensDialog
          open={fixing}
          onOpenChange={setFixing}
          ctx={ctx}
          view={view}
          versionId={view.versionId}
        />
      )}
      <PrepDialog open={prepping} onOpenChange={setPrepping} ctx={ctx} />
    </div>
  );
}

const WHEN_WORDS: Record<PrepTiming, string> = {
  day_before: "the day before",
  same_day: "the same day",
  before_leaving: "before we leave",
};

function PrepLine({
  step,
  ctx,
}: {
  step: MealCheckView["prep"][number];
  ctx: MealContext;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_28px] items-start gap-x-2 py-0.5 text-xs leading-5">
      <span>
        <span className="mr-2 font-[family-name:var(--os-font-pixel)] text-[9px] tracking-[0.15em] text-primary">
          PREP
        </span>
        <b className="font-semibold">{step.what}</b>
        <span className="text-muted-foreground">
          {" "}
          · due {shortDay(step.dueDate)} ({WHEN_WORDS[step.timing]})
        </span>
      </span>
      <button
        type="button"
        disabled={pending}
        aria-label={`Take this prep step off: ${step.what}`}
        className="grid h-6 w-6 place-items-center text-base leading-none text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-50"
        onClick={() =>
          startTransition(async () => {
            try {
              const result = await removePrepStepAction({ stepId: step.id });
              if (!result.ok) {
                toast.error(result.error);
                return;
              }
            } catch {
              toast.error(UNREACHABLE);
              return;
            }
            router.refresh();
          })
        }
      >
        {pending ? <Spin /> : <span aria-hidden>×</span>}
        <span className="sr-only">{ctx.title}</span>
      </button>
    </div>
  );
}

/** The dialog's shell, in the window's colours, as the recipe picker's. */
function Shell({
  open,
  onOpenChange,
  title,
  description,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="os-window-colours flex max-h-[calc(100dvh-2rem)] flex-col gap-4 overflow-y-auto border-input bg-background p-5 sm:max-w-[480px]">
        <div className="pr-8">
          <DialogTitle className="px-0 font-sans! text-base leading-6 font-bold! tracking-normal! normal-case!">
            {title}
          </DialogTitle>
          <DialogDescription className="mt-1 text-sm leading-5">
            {description}
          </DialogDescription>
        </div>
        {children}
      </DialogContent>
    </Dialog>
  );
}

function Actions({
  busy,
  label,
  onCancel,
  onSave,
}: {
  busy: boolean;
  label: string;
  onCancel: () => void;
  onSave: () => void;
}) {
  return (
    <div className="flex justify-end gap-2">
      <button type="button" className={QUIET_BUTTON} onClick={onCancel}>
        Cancel
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={onSave}
        className="inline-flex h-8 items-center gap-2 bg-primary px-4 text-[13px] font-bold text-primary-foreground hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-60"
      >
        {busy && <Spin />}
        {label}
      </button>
    </div>
  );
}

function PlanDialog({
  open,
  onOpenChange,
  ctx,
  view,
  foods,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ctx: MealContext;
  view: MealCheckView;
  foods: KitchenAllergen[];
}) {
  const router = useRouter();
  const [kind, setKind] = useState<AllergenPlanKind>(
    view.plan?.kind ?? "portion",
  );
  const [details, setDetails] = useState(view.plan?.details ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const total = Math.max(0, ...view.anaphylactic.map((a) => a.count));
  const who =
    total === 1 ? "One member coming is" : `${total} members coming are`;

  async function save() {
    if (!details.trim()) {
      setError("Say what exactly the kitchen will do.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await recordAllergenPlanAction({
        itemId: ctx.itemId,
        kind,
        details,
        allergens: foods,
        expectedVersion: view.plan?.version ?? 0,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onOpenChange(false);
      toast.success("Plan saved");
      router.refresh();
    } catch {
      setError(UNREACHABLE);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Shell
      open={open}
      onOpenChange={onOpenChange}
      title={`Plan for ${foodsInWords(foods)}`}
      description={`${ctx.title} · ${mealWords(ctx)} · ${platesLabel(ctx.plates)}. ${who} anaphylactic to ${foodsInWords(foods)}.`}
    >
      <OptionCardGroup
        aria-label="The plan"
        value={kind}
        onValueChange={(v) => setKind(v as AllergenPlanKind)}
        options={[
          {
            value: "portion",
            label: "A separate portion",
            description:
              "The dish stays the same; one portion is made without it.",
          },
          {
            value: "substitution",
            label: "A substitution",
            description: "The dish changes for everyone.",
          },
        ]}
      />
      <label className="flex flex-col gap-1.5">
        <span className={FIELD_LABEL}>What exactly</span>
        <textarea
          value={details}
          maxLength={500}
          rows={3}
          aria-invalid={error ? true : undefined}
          onChange={(e) => setDetails(e.target.value)}
          className="min-h-20 border border-input bg-background px-3 py-2 text-sm focus-visible:outline-2 focus-visible:-outline-offset-1 focus-visible:outline-primary"
        />
      </label>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Actions
        busy={busy}
        label="Save plan"
        onCancel={() => onOpenChange(false)}
        onSave={save}
      />
    </Shell>
  );
}

function AllergensDialog({
  open,
  onOpenChange,
  ctx,
  view,
  versionId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ctx: MealContext;
  view: MealCheckView;
  versionId: string;
}) {
  const router = useRouter();
  const [picked, setPicked] = useState<string[]>(view.allergens);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const result = await correctAllergensAction({
        recipeId: view.recipeId,
        versionId,
        allergens: KITCHEN_ALLERGENS.filter((a) => picked.includes(a)),
        expectedRevision: view.allergenRevision,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onOpenChange(false);
      toast.success("Allergens saved");
      router.refresh();
    } catch {
      setError(UNREACHABLE);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Shell
      open={open}
      onOpenChange={onOpenChange}
      title={`Allergens in ${ctx.title}`}
      description="What the recipe holds. Claude marks it when it proofreads; correct it here when it is wrong."
    >
      <CheckboxCardGroup
        aria-label={`Allergens in ${ctx.title}`}
        className="grid grid-cols-2 gap-2"
        values={picked}
        onValuesChange={setPicked}
        options={KITCHEN_ALLERGENS.map((a) => ({
          value: a,
          label: ALLERGEN_LABELS[a],
        }))}
      />
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Actions
        busy={busy}
        label="Save allergens"
        onCancel={() => onOpenChange(false)}
        onSave={save}
      />
    </Shell>
  );
}

function PrepDialog({
  open,
  onOpenChange,
  ctx,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ctx: MealContext;
}) {
  const router = useRouter();
  const [what, setWhat] = useState("");
  const [when, setWhen] = useState<PrepTiming>("day_before");
  const [date, setDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const dueOf = (t: PrepTiming) =>
    prepDueDate({
      firstDay: ctx.firstDay,
      day: ctx.day,
      when: t,
      date: t === "before_leaving" ? date || null : null,
    });
  const where = (t: PrepTiming): string => {
    const due = dueOf(t);
    if (!due.ok || !ctx.firstDay)
      return t === "before_leaving" ? "Pick the date" : "";
    const place = prepGoesOnBoard(due.due, ctx.firstDay)
      ? "on Tasks for the Kitchen"
      : "on that day's site sheet";
    return `Due ${shortDay(due.due)} · ${place}`;
  };
  const chosen = dueOf(when);
  const onBoard =
    chosen.ok && ctx.firstDay
      ? prepGoesOnBoard(chosen.due, ctx.firstDay)
      : false;

  function reset() {
    setWhat("");
    setWhen("day_before");
    setDate("");
    setError(null);
  }

  async function save() {
    if (!what.trim()) {
      setError("Say what to do.");
      return;
    }
    if (!chosen.ok) {
      setError(chosen.error);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await addPrepStepAction({
        itemId: ctx.itemId,
        what,
        when,
        date: when === "before_leaving" ? date : null,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onOpenChange(false);
      reset();
      toast.success(
        result.data?.onBoard
          ? "Prep step added to Tasks for the Kitchen"
          : "Prep step added to the site sheet",
      );
      router.refresh();
    } catch {
      setError(UNREACHABLE);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Shell
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) reset();
      }}
      title={`Prep step for ${ctx.title}`}
      description={`${mealWords(ctx)} · ${platesLabel(ctx.plates)}.`}
    >
      <label className="flex flex-col gap-1.5">
        <span className={FIELD_LABEL}>What to do</span>
        <input
          value={what}
          maxLength={160}
          onChange={(e) => setWhat(e.target.value)}
          className="h-9 border border-input bg-background px-3 text-sm focus-visible:outline-2 focus-visible:-outline-offset-1 focus-visible:outline-primary"
        />
      </label>
      <div className="flex flex-col gap-1.5">
        <span className={FIELD_LABEL}>When</span>
        <OptionCardGroup
          aria-label="When"
          value={when}
          onValueChange={(v) => setWhen(v as PrepTiming)}
          options={[
            {
              value: "day_before",
              label: "The day before",
              description: where("day_before"),
            },
            {
              value: "same_day",
              label: "The same day",
              description: where("same_day"),
            },
            {
              value: "before_leaving",
              label: "Before we leave",
              description: where("before_leaving"),
            },
          ]}
        />
      </div>
      {when === "before_leaving" && (
        <label className="flex flex-col gap-1.5">
          <span className={FIELD_LABEL}>Date</span>
          <DateControl
            value={date}
            aria-label="Date"
            onChange={(e) => setDate(e.target.value)}
          />
        </label>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Actions
        busy={busy}
        label={onBoard ? "Add to Kitchen tasks" : "Add prep step"}
        onCancel={() => onOpenChange(false)}
        onSave={save}
      />
    </Shell>
  );
}
