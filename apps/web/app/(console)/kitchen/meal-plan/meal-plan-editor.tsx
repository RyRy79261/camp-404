"use client";

import { useState, useTransition, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, Printer } from "lucide-react";
import { z } from "zod";
import { mealPlanDayLabel, shortDay } from "@camp404/core";
import {
  MEALS_OF_THE_DAY,
  MEAL_PLAN_MAX_DAYS,
  MealPlanInput,
  type MealOfTheDay,
  type MealPlanDay,
} from "@camp404/types";
import { cn } from "@camp404/ui/lib/utils";
import { Input } from "@camp404/ui/components/input";
import { toast } from "@camp404/ui/components/toast";
import {
  useDraftAutosave,
  useEditorDraft,
  type EditorDraft,
} from "@/components/os/editor-draft";
import {
  PIXEL_LABEL,
  QUIET_BUTTON,
  splitDayLabel,
} from "@/components/kitchen/labels";
import { LOGISTICS_PATH } from "@/lib/logistics-copy";
import { PREP_PLAN_PRINT_PATH, UNREACHABLE } from "@/lib/recipe-copy";
import { saveMealPlanAction } from "./actions";
import { MenuCell, type MenuLine } from "./menu-cell";
import type { PickerRecipe } from "./recipe-picker";

// The meal plan for a Kitchen lead or a captain (the owner's approved
// mock-up, design/approved-kmp.html, Option A, 2026-10-01): Save in the
// heading; the camp's dates and "Copy Day 1's plates to every day" in one
// card; then the week as a table, Day | Breakfast | Dinner,
// each meal with its plates and, under them, its recipes, each on its own
// line with where its count stands in a fixed column. On a phone each day is
// a card, its meals stacked. The camp does no lunch (the owner, 2026-10-01).
//
// The dates are not set here (the owner, 2026-10-03): Day 1 and the days on
// site come from the camp's days in Logistics, shown as a plain line with a
// link there ("Day 1: Thu 22 Apr · 11 days on site, from Logistics"); with no
// dates yet, "Set the camp's dates in Logistics first", and the plan runs by
// day number. Plates are kept when Save is pressed: the whole plan goes with
// the version the page opened; a problem with a number shows beside it, a
// refusal beside Save. Adding or taking off a recipe is kept at once
// (menu-cell.tsx). Everyone else reads the menu (member-menu.tsx).

const MEAL_LABELS: Record<MealOfTheDay, string> = {
  breakfast: "Breakfast",
  dinner: "Dinner",
};

type Row = Record<MealOfTheDay, string>;

function toRows(days: readonly MealPlanDay[]): Row[] {
  return days.map((d) => ({
    breakfast: String(d.breakfast),
    dinner: String(d.dinner),
  }));
}

/** A blank field is 0 plates: no meal. Anything unreadable stays NaN. */
function plates(value: string): number {
  return value.trim() === "" ? 0 : Number(value);
}

/** Each problem keyed by where it is: "day.meal", or the field's name. */
function problems(
  issues: readonly { path: readonly PropertyKey[]; message: string }[],
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of issues) {
    const [field, index, meal] = issue.path;
    const key =
      field === "days" && typeof index === "number" && meal
        ? `${index}.${String(meal)}`
        : String(field ?? "form");
    out[key] ??= issue.message;
  }
  return out;
}

const NUMBER_BOX =
  "h-8 w-16 px-2 text-right text-sm tabular-nums focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:outline-2 focus-visible:-outline-offset-1 focus-visible:outline-primary";

/**
 * The fields as typed, as an unsaved draft (editor-draft.tsx), for the dirty
 * guard. It names the version it was typed over. Not kept or restored while
 * `restore` is off (below); the schema is what a restore would check.
 */
const PlatesField = z.string().max(20);
const MealPlanDraft = z.object({
  version: z.number().int(),
  rows: z
    .array(z.object({ breakfast: PlatesField, dinner: PlatesField }))
    .max(MEAL_PLAN_MAX_DAYS),
});
type MealPlanDraft = z.infer<typeof MealPlanDraft>;

type MealPlanEditorProps = {
  /** From Logistics: Day 1 to the last day on site (11 with no dates). */
  daysOnSite: number;
  /** Day 1 (YYYY-MM-DD) from Logistics, or null when it has no dates. */
  firstDay: string | null;
  days: MealPlanDay[];
  /** The version the page opened; 0 when no plan is saved yet. */
  version: number;
  /** The recipes on each meal (#244), read for the meals' saved plates. */
  menu?: readonly MenuLine[];
  /** The recipe book, for the picker. */
  book?: readonly PickerRecipe[];
  /** Drawn between the plan's settings and the week (the dietary box, #245). */
  above?: ReactNode;
};

/**
 * The meal plan, for a captain or a Kitchen lead (the page decides). Unsaved
 * numbers ask before the window goes. Nothing is kept or restored: PR C
 * changes nothing inside a Kitchen page (plan section 0), and a restored
 * draft would need a note the owner has not approved.
 */
export function MealPlanEditor(props: MealPlanEditorProps) {
  const { days, version } = props;
  const draft = useEditorDraft<MealPlanDraft>({
    editor: "meal-plan",
    baseline: {
      version,
      rows: toRows(days),
    },
    restore: false,
    parse: (raw) => {
      const parsed = MealPlanDraft.safeParse(raw);
      return parsed.success && parsed.data.version === version
        ? parsed.data
        : null;
    },
  });
  return <MealPlanEditorForm key={draft.generation} {...props} draft={draft} />;
}

function MealPlanEditorForm({
  days: savedDayPlates,
  daysOnSite,
  firstDay,
  version,
  menu = [],
  book = [],
  above,
  draft,
}: MealPlanEditorProps & { draft: EditorDraft<MealPlanDraft> }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [rows, setRows] = useState<Row[]>(() => draft.start.rows);
  const { saved } = useDraftAutosave(draft, { version, rows });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [refusal, setRefusal] = useState<string | null>(null);

  function changePlates(index: number, meal: MealOfTheDay, value: string) {
    setRows((current) =>
      current.map((row, i) => (i === index ? { ...row, [meal]: value } : row)),
    );
  }

  function copyFirstDay() {
    setRows((current) =>
      current.length === 0 ? current : current.map(() => ({ ...current[0]! })),
    );
  }

  function save(event: FormEvent) {
    event.preventDefault();
    setRefusal(null);
    const payload = {
      // The Day 1 these rows were typed for: the save refuses them if
      // Logistics has moved it since.
      firstDay,
      days: rows.map((r) => ({
        breakfast: plates(r.breakfast),
        dinner: plates(r.dinner),
      })),
      expectedVersion: version,
    };
    const check = MealPlanInput.safeParse(payload);
    if (!check.success) {
      setErrors(problems(check.error.issues));
      return;
    }
    setErrors({});
    startTransition(async () => {
      let result: Awaited<ReturnType<typeof saveMealPlanAction>>;
      try {
        result = await saveMealPlanAction(payload);
      } catch {
        setRefusal(UNREACHABLE);
        return;
      }
      if (!result.ok) {
        setRefusal(result.error);
        return;
      }
      saved();
      toast.success("Meal plan saved");
      router.refresh();
    });
  }

  return (
    <form onSubmit={save} noValidate className="flex min-w-0 flex-col">
      {/* The page's heading in the mock-up's shape (PageHeading's own
          parts and skin): Save level with the title, on a phone too, and the
          lead under them. */}
      <div
        data-slot="page-heading"
        className="mb-4 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-6 page-md:items-start"
      >
        <div className="flex min-w-0 flex-col gap-1">
          <p
            data-slot="page-eyebrow"
            className="font-mono text-xs tracking-[0.25em] text-accent uppercase"
          >
            Kitchen
          </p>
          <h1
            data-slot="page-title"
            className="text-2xl font-semibold tracking-tight"
          >
            Meal plan
          </h1>
        </div>
        <div className="flex items-center gap-2">
          {/* The prep steps on A4, before we leave then each day (#249). */}
          <Link
            href={PREP_PLAN_PRINT_PATH}
            target="_blank"
            rel="noopener"
            aria-label="Print the prep plan"
            title="Print the prep plan (A4)"
            className="inline-flex h-9 shrink-0 items-center justify-center gap-2 border border-input px-3 text-sm font-medium hover:bg-foreground/[0.04] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            <Printer className="h-4 w-4" aria-hidden />
            <span className="hidden page-sm:inline">Prep plan</span>
          </Link>
          {/* The mock-up's pink Save, in sentence case. */}
          <button
            type="submit"
            disabled={pending}
            className="inline-flex h-9 shrink-0 items-center justify-center gap-2 bg-primary px-6 text-sm font-bold text-primary-foreground hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-60"
          >
            {pending && (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            )}
            Save
          </button>
        </div>
        <p className="col-span-2 mt-2 max-w-[600px] text-[13px] leading-5 text-muted-foreground page-md:col-span-1 page-md:text-sm">
          Plates are kept when you press Save. Adding or taking off a recipe is
          kept at once. Only ✓&nbsp;Verified recipes go on the shopping list.
        </p>
      </div>

      {refusal && (
        <p role="alert" className="-mt-2 mb-4 text-sm text-destructive">
          {refusal}
        </p>
      )}

      {/* The camp's dates, from Logistics (the owner, 2026-10-03): a plain
          line and a link there, never a box to type in. */}
      <div className="mb-4 flex flex-col items-start gap-x-6 gap-y-3 border border-border bg-card p-4 page-md:flex-row page-md:flex-wrap page-md:items-center">
        <p className="min-w-0 text-sm leading-6">
          {firstDay
            ? `Day 1: ${shortDay(firstDay)} · ${
                daysOnSite === 1 ? "1 day" : `${daysOnSite} days`
              } on site, from Logistics`
            : "Set the camp’s dates in Logistics first"}
        </p>
        <Link
          href={LOGISTICS_PATH}
          className="text-sm font-semibold text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          Change the dates in Logistics
        </Link>
        {rows.length > 1 && (
          <button
            type="button"
            disabled={pending}
            onClick={copyFirstDay}
            className={cn(
              QUIET_BUTTON,
              // Full width on a phone, as it always was; at the end wide.
              "self-stretch page-md:ml-auto page-md:self-auto",
            )}
          >
            Copy Day 1&rsquo;s plates to every day
          </button>
        )}
      </div>

      {above}

      {/* The week. On a page at least page-md wide, one table: Day |
          Breakfast | Dinner. Narrower, one card per day. */}
      <div
        role="table"
        aria-label="Plates per day"
        className="flex flex-col gap-3 page-md:gap-0 page-md:border page-md:border-border page-md:bg-card"
      >
        <div
          role="row"
          className="hidden h-10 grid-cols-[112px_minmax(0,1fr)_minmax(0,1fr)] items-center border-b border-border page-md:grid"
        >
          <span role="columnheader" className={cn(PIXEL_LABEL, "px-4")}>
            Day
          </span>
          {MEALS_OF_THE_DAY.map((meal) => (
            <span
              key={meal}
              role="columnheader"
              className={cn(PIXEL_LABEL, "px-4")}
            >
              {MEAL_LABELS[meal]}
            </span>
          ))}
        </div>
        {rows.map((row, i) => {
          const { day, date } = splitDayLabel(
            mealPlanDayLabel(firstDay, i + 1),
          );
          return (
            <div
              key={i}
              role="row"
              className="border border-border bg-card page-md:grid page-md:grid-cols-[112px_minmax(0,1fr)_minmax(0,1fr)] page-md:border-0 page-md:border-b page-md:bg-transparent page-md:last:border-b-0"
            >
              <div
                role="rowheader"
                aria-label={date ? `${day} · ${date}` : day}
                className="flex items-baseline justify-between gap-3 border-b border-border px-4 py-3 page-md:block page-md:border-b-0 page-md:pt-3 page-md:pb-1"
              >
                <b className="text-base leading-6 font-bold page-md:mt-1.5 page-md:block page-md:text-sm page-md:leading-5">
                  {day}
                </b>
                {date && (
                  <span className="text-[13px] text-muted-foreground page-md:block page-md:text-xs page-md:leading-4">
                    {date}
                  </span>
                )}
              </div>
              {MEALS_OF_THE_DAY.map((meal) => {
                const key = `${i}.${meal}`;
                const label = `Day ${i + 1} ${meal}`;
                const saved = savedDayPlates[i]?.[meal] ?? 0;
                const lines = menu.filter(
                  (l) => l.day === i + 1 && l.meal === meal,
                );
                return (
                  <div
                    key={meal}
                    role="cell"
                    className="min-w-0 border-t border-border px-4 pt-3 pb-1 [&:nth-child(2)]:border-t-0 page-md:border-t-0 page-md:border-l"
                  >
                    <MenuCell
                      day={i + 1}
                      dayLabel={mealPlanDayLabel(firstDay, i + 1)}
                      meal={meal}
                      plates={saved}
                      lines={lines}
                      allLines={menu}
                      book={book}
                      firstDay={firstDay}
                      platesControl={
                        <>
                          <div className="flex items-center justify-between gap-3 page-md:justify-start">
                            <span
                              aria-hidden
                              className={cn(PIXEL_LABEL, "page-md:hidden")}
                            >
                              {MEAL_LABELS[meal]}
                            </span>
                            <span className="flex h-8 items-center gap-2 text-[13px] text-muted-foreground">
                              <Input
                                type="number"
                                inputMode="numeric"
                                min={0}
                                max={500}
                                step={1}
                                aria-label={label}
                                value={row[meal]}
                                disabled={pending}
                                aria-invalid={errors[key] ? true : undefined}
                                aria-describedby={
                                  errors[key]
                                    ? `plates-${key}-error`
                                    : undefined
                                }
                                className={NUMBER_BOX}
                                onChange={(e) =>
                                  changePlates(i, meal, e.target.value)
                                }
                              />
                              plates
                            </span>
                          </div>
                          {errors[key] && (
                            <p
                              id={`plates-${key}-error`}
                              className="mt-1 text-xs text-destructive"
                            >
                              {errors[key]}
                            </p>
                          )}
                        </>
                      }
                    />
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </form>
  );
}
