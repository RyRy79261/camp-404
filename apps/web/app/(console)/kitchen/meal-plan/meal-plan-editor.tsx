"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Copy, Loader2, Save } from "lucide-react";
import {
  MEALS_OF_THE_DAY,
  MEAL_PLAN_MAX_DAYS,
  MealPlanInput,
  type MealOfTheDay,
  type MealPlanDay,
} from "@camp404/types";
import { Button } from "@camp404/ui/components/button";
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
import { UNREACHABLE } from "@/lib/recipe-copy";
import { saveMealPlanAction } from "./actions";

// The meal plan's page body (the owner's sketch, 2026-09-24): Save in the
// heading, the days on site, then one row per day with the plates at
// breakfast, lunch and dinner, and "Copy Day 1 to every day". Nothing else.
//
// A Kitchen lead or a captain edits; everyone else reads the same table as
// plain numbers. Save sends the whole plan with the version the page opened:
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

export function MealPlanEditor({
  daysOnSite: savedDays,
  days,
  version,
  canEdit,
}: {
  daysOnSite: number;
  days: MealPlanDay[];
  /** The version the page opened; 0 when no plan is saved yet. */
  version: number;
  /** A captain or a Kitchen lead. */
  canEdit: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [daysOnSite, setDaysOnSite] = useState(String(savedDays));
  const [rows, setRows] = useState<Row[]>(() => toRows(days));
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
        </div>
        {errors.daysOnSite && (
          <p id="days-on-site-error" className="text-sm text-destructive">
            {errors.daysOnSite}
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
                <TableHead scope="row" className="whitespace-nowrap">
                  Day {i + 1}
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
