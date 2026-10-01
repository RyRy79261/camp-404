"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, Loader2 } from "lucide-react";
import { z } from "zod";
import { mealPlanDayLabel } from "@camp404/core";
import {
  MEALS_OF_THE_DAY,
  MEAL_PLAN_MAX_DAYS,
  MealPlanInput,
  type MealOfTheDay,
  type MealPlanDay,
} from "@camp404/types";
import { cn } from "@camp404/ui/lib/utils";
import { DateControl } from "@camp404/ui/components/date-control";
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
import { UNREACHABLE } from "@/lib/recipe-copy";
import { saveMealPlanAction } from "./actions";
import { MenuCell, type MenuLine } from "./menu-cell";
import type { PickerRecipe } from "./recipe-picker";

// The meal plan for a Kitchen lead or a captain (the owner's approved
// mock-up, design/approved-kmp.html, Option A, 2026-10-01): Save in the
// heading; the days on site, the date of day 1 and "Copy Day 1's plates to
// every day" in one card; then the week as a table, Day | Breakfast | Dinner,
// each meal with its plates and, under them, its recipes, each on its own
// line with where its count stands in a fixed column. On a phone each day is
// a card, its meals stacked. The camp does no lunch (the owner, 2026-10-01).
//
// Plates and dates are kept when Save is pressed: the whole plan goes with
// the version the page opened; a problem with a number shows beside it, a
// refusal beside Save. Adding or taking off a recipe is kept at once
// (menu-cell.tsx). Changing the days on site keeps the days already filled in
// and adds empty ones. Everyone else reads the menu (member-menu.tsx).

const MEAL_LABELS: Record<MealOfTheDay, string> = {
  breakfast: "Breakfast",
  dinner: "Dinner",
};

type Row = Record<MealOfTheDay, string>;

const EMPTY_ROW: Row = { breakfast: "0", dinner: "0" };

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

/** Each problem keyed by where it is: "daysOnSite", or "day.meal". */
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
  daysOnSite: z.string().max(20),
  firstDay: z.string().max(40),
  rows: z
    .array(z.object({ breakfast: PlatesField, dinner: PlatesField }))
    .max(MEAL_PLAN_MAX_DAYS),
});
type MealPlanDraft = z.infer<typeof MealPlanDraft>;

type MealPlanEditorProps = {
  daysOnSite: number;
  /** The date of day 1 (YYYY-MM-DD), or null when not set. */
  firstDay: string | null;
  days: MealPlanDay[];
  /** The version the page opened; 0 when no plan is saved yet. */
  version: number;
  /** The recipes on each meal (#244), read for the meals' saved plates. */
  menu?: readonly MenuLine[];
  /** The recipe book, for the picker. */
  book?: readonly PickerRecipe[];
};

/**
 * The meal plan, for a captain or a Kitchen lead (the page decides). Unsaved
 * numbers ask before the window goes. Nothing is kept or restored: PR C
 * changes nothing inside a Kitchen page (plan section 0), and a restored
 * draft would need a note the owner has not approved.
 */
export function MealPlanEditor(props: MealPlanEditorProps) {
  const { daysOnSite, firstDay, days, version } = props;
  const draft = useEditorDraft<MealPlanDraft>({
    editor: "meal-plan",
    baseline: {
      version,
      daysOnSite: String(daysOnSite),
      firstDay: firstDay ?? "",
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
  version,
  menu = [],
  book = [],
  draft,
}: MealPlanEditorProps & { draft: EditorDraft<MealPlanDraft> }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [daysOnSite, setDaysOnSite] = useState(draft.start.daysOnSite);
  const [firstDay, setFirstDay] = useState(draft.start.firstDay);
  const [rows, setRows] = useState<Row[]>(() => draft.start.rows);
  const { saved } = useDraftAutosave(draft, {
    version,
    daysOnSite,
    firstDay,
    rows,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [refusal, setRefusal] = useState<string | null>(null);

  function changeDays(value: string) {
    setDaysOnSite(value);
    const n = Number(value);
    // Only a count the plan can hold moves the rows; the save names the rest.
    if (Number.isInteger(n) && n >= 1 && n <= MEAL_PLAN_MAX_DAYS) {
      // The days already filled in stay; a new day starts with no meals.
      setRows((current) =>
        Array.from({ length: n }, (_, i) => current[i] ?? { ...EMPTY_ROW }),
      );
    }
  }

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
      daysOnSite: daysOnSite.trim() === "" ? Number.NaN : Number(daysOnSite),
      firstDay: firstDay.trim() === "" ? null : firstDay,
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
        {/* The mock-up's pink Save, in sentence case. */}
        <button
          type="submit"
          disabled={pending}
          className="inline-flex h-9 shrink-0 items-center justify-center gap-2 bg-primary px-6 text-sm font-bold text-primary-foreground hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-60"
        >
          {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
          Save
        </button>
        <p className="col-span-2 mt-2 max-w-[600px] text-[13px] leading-5 text-muted-foreground page-md:col-span-1 page-md:text-sm">
          Plates and dates are kept when you press Save. Adding or taking off a
          recipe is kept at once. Only ✓&nbsp;Verified recipes go on the
          shopping list.
        </p>
      </div>

      {refusal && (
        <p role="alert" className="-mt-2 mb-4 text-sm text-destructive">
          {refusal}
        </p>
      )}

      {/* The plan's settings: labels above their boxes, in one row. */}
      <div className="mb-4 grid grid-cols-[112px_minmax(0,1fr)] items-end gap-4 border border-border bg-card p-4 page-md:flex page-md:gap-6">
        <div className="flex flex-col gap-2 page-md:w-28">
          <label htmlFor="days-on-site" className={PIXEL_LABEL}>
            Days on site
          </label>
          <Input
            id="days-on-site"
            type="number"
            inputMode="numeric"
            min={1}
            max={MEAL_PLAN_MAX_DAYS}
            step={1}
            value={daysOnSite}
            disabled={pending}
            aria-invalid={errors.daysOnSite ? true : undefined}
            aria-describedby={
              errors.daysOnSite ? "days-on-site-error" : undefined
            }
            className={NUMBER_BOX}
            onChange={(e) => changeDays(e.target.value)}
          />
        </div>
        <div className="flex min-w-0 flex-col gap-2 page-md:w-48">
          <label htmlFor="first-day" className={PIXEL_LABEL}>
            Day 1 date
          </label>
          {/* The browser's date box draws the date its own way
              ("04/22/2027"); the mock-up reads "Thu 22 Apr 2027". So the
              real date box lies on top, invisible, and opens its picker on a
              tap; the face under it shows the date in the camp's words. */}
          <div className="relative h-8 w-full border border-input bg-background focus-within:outline-2 focus-within:-outline-offset-1 focus-within:outline-primary">
            <span
              aria-hidden
              className="pointer-events-none absolute inset-0 flex items-center justify-between gap-2 px-3 text-sm"
            >
              <span
                className={cn("truncate", !firstDay && "text-muted-foreground")}
              >
                {longDate(firstDay) ?? "Pick a date"}
              </span>
              <CalendarDays
                className="h-4 w-4 shrink-0 text-muted-foreground"
                aria-hidden
              />
            </span>
            <DateControl
              id="first-day"
              value={firstDay}
              disabled={pending}
              aria-invalid={errors.firstDay ? true : undefined}
              aria-describedby={errors.firstDay ? "first-day-error" : undefined}
              className="absolute inset-0 h-full w-full cursor-pointer border-0 opacity-0"
              onClick={(e) => {
                try {
                  e.currentTarget.showPicker?.();
                } catch {
                  // Not allowed here (an old browser): typing still works.
                }
              }}
              onChange={(e) => setFirstDay(e.target.value)}
            />
          </div>
        </div>
        {rows.length > 1 && (
          <button
            type="button"
            disabled={pending}
            onClick={copyFirstDay}
            className={cn(QUIET_BUTTON, "col-span-2 page-md:ml-auto")}
          >
            Copy Day 1&rsquo;s plates to every day
          </button>
        )}
      </div>
      {(errors.daysOnSite || errors.firstDay) && (
        <div className="-mt-2 mb-4 flex flex-col gap-1">
          {errors.daysOnSite && (
            <p id="days-on-site-error" className="text-sm text-destructive">
              {errors.daysOnSite}
            </p>
          )}
          {errors.firstDay && (
            <p id="first-day-error" className="text-sm text-destructive">
              {errors.firstDay}
            </p>
          )}
        </div>
      )}

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

/** "2027-04-22" as "Thu 22 Apr 2027", or null for no date or a bad one. */
function longDate(iso: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const date = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "";
  return `${part("weekday")} ${part("day")} ${part("month")} ${part("year")}`;
}
