"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Copy, Loader2, Save } from "lucide-react";
import { z } from "zod";
import { mealPlanDayLabel } from "@camp404/core";
import {
  MEALS_OF_THE_DAY,
  MEAL_PLAN_MAX_DAYS,
  MealPlanInput,
  type MealOfTheDay,
  type MealPlanDay,
} from "@camp404/types";
import { Button } from "@camp404/ui/components/button";
import { DateControl } from "@camp404/ui/components/date-control";
import { Input } from "@camp404/ui/components/input";
import { PageHeading } from "@camp404/ui/components/page-heading";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@camp404/ui/components/table";
import { toast } from "@camp404/ui/components/toast";
import {
  useDraftAutosave,
  useEditorDraft,
  type EditorDraft,
} from "@/components/os/editor-draft";
import { UNREACHABLE } from "@/lib/recipe-copy";
import { saveMealPlanAction } from "./actions";

// The meal plan's page body (the owner's sketch, 2026-09-24): Save in the
// heading, the days on site and the date of day 1, then one row per day, named
// with its date ("Day 1 · Sat 25 Apr"), with the plates at breakfast, lunch
// and dinner, and "Copy Day 1 to every day". Nothing else.
//
// A Kitchen lead or a captain edits; everyone else reads the same table, with
// the same dates, as plain numbers. Save sends the whole plan with the version the page opened:
// a problem with a number shows beside it, and a refusal (a lost race, say)
// beside Save. Changing the days on site keeps the days already filled in and
// adds empty ones.

const MEAL_LABELS: Record<MealOfTheDay, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
};

type Row = Record<MealOfTheDay, string>;

const EMPTY_ROW: Row = { breakfast: "0", lunch: "0", dinner: "0" };

function toRows(days: readonly MealPlanDay[]): Row[] {
  return days.map((d) => ({
    breakfast: String(d.breakfast),
    lunch: String(d.lunch),
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

/**
 * "Day 1 · Sat 25 Apr", with the date on its own line on a phone so the table's
 * last column stays on screen; "Day 1" alone when there is no date.
 */
function DayLabel({ label }: { label: string }) {
  const [day, date] = label.split(" · ");
  return (
    <>
      <span className="whitespace-nowrap">
        {day}
        {date ? " ·" : ""}
      </span>
      {date ? (
        <>
          {" "}
          <span className="block whitespace-nowrap sm:inline">{date}</span>
        </>
      ) : null}
    </>
  );
}

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
    .array(
      z.object({
        breakfast: PlatesField,
        lunch: PlatesField,
        dinner: PlatesField,
      }),
    )
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
  /** A captain or a Kitchen lead. */
  canEdit: boolean;
};

/**
 * The meal plan. For an editor, unsaved numbers ask before the window goes.
 * Nothing is kept or restored: PR C changes nothing inside a Kitchen page
 * (plan section 0), and a restored draft would need a note the owner has not
 * approved.
 */
export function MealPlanEditor(props: MealPlanEditorProps) {
  const { daysOnSite, firstDay, days, version, canEdit } = props;
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
      if (!canEdit) return null;
      const parsed = MealPlanDraft.safeParse(raw);
      return parsed.success && parsed.data.version === version
        ? parsed.data
        : null;
    },
  });
  return <MealPlanEditorForm key={draft.generation} {...props} draft={draft} />;
}

function MealPlanEditorForm({
  daysOnSite: savedDays,
  firstDay: savedFirstDay,
  version,
  canEdit,
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
        lunch: plates(r.lunch),
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
    <form onSubmit={save} noValidate className="flex min-w-0 flex-col gap-6">
      <PageHeading
        eyebrow="Kitchen"
        title="Meal plan"
        actions={
          canEdit ? (
            <Button type="submit" disabled={pending}>
              {pending ? (
                <Loader2 className="animate-spin" aria-hidden />
              ) : (
                <Save aria-hidden />
              )}
              Save
            </Button>
          ) : undefined
        }
      />

      {refusal && (
        <p role="alert" className="-mt-4 text-sm text-destructive">
          {refusal}
        </p>
      )}

      <div className="flex flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <label htmlFor="days-on-site" className="font-medium">
            Days on site
          </label>
          {canEdit ? (
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
              className="w-20"
              onChange={(e) => changeDays(e.target.value)}
            />
          ) : (
            <output id="days-on-site" className="tabular-nums">
              {savedDays}
            </output>
          )}
          {canEdit && (
            <span className="flex items-center gap-3">
              <label htmlFor="first-day" className="font-medium">
                Day 1 date
              </label>
              <DateControl
                id="first-day"
                value={firstDay}
                disabled={pending}
                aria-invalid={errors.firstDay ? true : undefined}
                aria-describedby={
                  errors.firstDay ? "first-day-error" : undefined
                }
                className="w-auto"
                onChange={(e) => setFirstDay(e.target.value)}
              />
            </span>
          )}
        </div>
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

      <div className="md:rounded-xl md:border md:bg-card md:text-card-foreground md:shadow-sm">
        <Table aria-label="Plates per day">
          <TableHeader>
            <TableRow>
              <TableHead scope="col">Day</TableHead>
              {MEALS_OF_THE_DAY.map((meal) => (
                <TableHead key={meal} scope="col">
                  {MEAL_LABELS[meal]}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, i) => (
              <TableRow key={i}>
                <TableHead scope="row" className="whitespace-normal">
                  <DayLabel
                    label={mealPlanDayLabel(
                      canEdit ? firstDay : savedFirstDay,
                      i + 1,
                    )}
                  />
                </TableHead>
                {MEALS_OF_THE_DAY.map((meal) => {
                  const key = `${i}.${meal}`;
                  const label = `Day ${i + 1} ${MEAL_LABELS[meal].toLowerCase()}`;
                  return (
                    <TableCell key={meal} className="align-top">
                      {canEdit ? (
                        <>
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
                              errors[key] ? `plates-${key}-error` : undefined
                            }
                            className="w-16 sm:w-20"
                            onChange={(e) =>
                              changePlates(i, meal, e.target.value)
                            }
                          />
                          {errors[key] && (
                            <p
                              id={`plates-${key}-error`}
                              className="mt-1 text-xs text-destructive"
                            >
                              {errors[key]}
                            </p>
                          )}
                        </>
                      ) : (
                        <span className="tabular-nums">{row[meal]}</span>
                      )}
                    </TableCell>
                  );
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {canEdit && rows.length > 1 && (
        <div>
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={copyFirstDay}
          >
            <Copy aria-hidden />
            Copy Day 1 to every day
          </Button>
        </div>
      )}
    </form>
  );
}
