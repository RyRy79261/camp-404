import Link from "next/link";
import { mealPlanDayLabel } from "@camp404/core";
import {
  MEALS_OF_THE_DAY,
  type MealOfTheDay,
  type MealPlanDay,
} from "@camp404/types";
import { cn } from "@camp404/ui/lib/utils";
import { PageHeading } from "@camp404/ui/components/page-heading";
import {
  FIELD_LABEL,
  PIXEL_LABEL,
  splitDayLabel,
  mealName,
} from "@/components/kitchen/labels";
import { recipePath } from "@/lib/recipe-copy";
import type { MenuLine } from "./menu-cell";
import type { SnackRow } from "./snack-list";

// The menu as every member reads it (the owner's approved mock-up,
// design/approved-kmenu.html, Option A, 2026-10-01): a card per day, its
// breakfast and dinner side by side (stacked on a phone), each with its
// plates and its dishes as links to their recipes, then the snacks. Nothing
// to change and no proofreading words: those are the Kitchen's business (the
// editor's view, meal-plan-editor.tsx). The camp does no lunch.

const MEAL_LABEL: Record<MealOfTheDay, string> = {
  breakfast: "Breakfast",
  dinner: "Dinner",
};

/** "Thu 22 – Mon 26 Apr", or across a month "Thu 30 Apr – Fri 1 May". */
function dateRange(firstDay: string | null, days: number): string | null {
  const first = splitDayLabel(mealPlanDayLabel(firstDay, 1)).date;
  const last = splitDayLabel(mealPlanDayLabel(firstDay, days)).date;
  if (!first || !last) return null;
  if (days === 1) return first;
  const [fw, fd, fm] = first.split(" ");
  const lm = last.split(" ")[2];
  return fm === lm ? `${fw} ${fd} – ${last}` : `${first} – ${last}`;
}

export function MemberMenu({
  daysOnSite,
  firstDay,
  days,
  lines,
  snacks,
}: {
  daysOnSite: number;
  firstDay: string | null;
  days: readonly MealPlanDay[];
  lines: readonly MenuLine[];
  snacks: readonly SnackRow[];
}) {
  const range = dateRange(firstDay, daysOnSite);
  // The days on site are left off on a phone, as the mock-up does, so the
  // line fits on one row.
  const meta = [
    { text: range, wide: false },
    {
      text: `${daysOnSite} day${daysOnSite === 1 ? "" : "s"} on site`,
      wide: true,
    },
    { text: "Breakfast and dinner", wide: false },
  ].filter((m): m is { text: string; wide: boolean } => m.text !== null);

  return (
    <div className="flex min-w-0 flex-col">
      <PageHeading
        eyebrow="Kitchen"
        title="Meal plan"
        description="What the camp eats each day. Tap a dish to read its recipe."
      />
      <p className="-mt-5 mb-4 flex flex-wrap gap-x-2 text-xs leading-4 text-muted-foreground page-md:mb-6">
        {meta.flatMap((m, i) => [
          ...(i > 0
            ? [
                <span
                  key={`dot-${i}`}
                  aria-hidden="true"
                  className={cn(
                    (m.wide || meta.slice(0, i).every((x) => x.wide)) &&
                      "hidden page-sm:inline",
                  )}
                >
                  ·
                </span>,
              ]
            : []),
          <span key={m.text} className={cn(m.wide && "hidden page-sm:inline")}>
            {m.text}
          </span>,
        ])}
      </p>

      <div className="flex flex-col gap-3">
        {days.slice(0, daysOnSite).map((plates, i) => {
          const day = i + 1;
          const { date } = splitDayLabel(mealPlanDayLabel(firstDay, day));
          return (
            <section
              key={day}
              aria-labelledby={`menu-day-${day}`}
              className="border border-border bg-card"
            >
              <header className="flex items-center gap-3 border-b border-border px-4 py-3 page-md:px-5">
                {date && (
                  <span className={cn(PIXEL_LABEL, "w-14 text-primary")}>
                    Day {day}
                  </span>
                )}
                <h2
                  id={`menu-day-${day}`}
                  // A day's date reads in the body face, not the pixel one.
                  className="font-sans! text-base leading-6 font-semibold! tracking-normal! normal-case!"
                >
                  {date ?? `Day ${day}`}
                  {date && <span className="sr-only"> (day {day})</span>}
                </h2>
              </header>
              <div className="grid page-md:grid-cols-2">
                {MEALS_OF_THE_DAY.map((meal) => {
                  const count = plates[meal];
                  const dishes = lines.filter(
                    (l) => l.day === day && l.meal === meal,
                  );
                  return (
                    <div
                      key={meal}
                      className="grid content-start gap-2 border-t border-border px-4 py-3 first:border-t-0 page-md:border-t-0 page-md:px-5 page-md:py-4 page-md:[&:nth-child(2)]:border-l"
                    >
                      <div className="flex items-baseline justify-between gap-3">
                        <h3 className={FIELD_LABEL}>{MEAL_LABEL[meal]}</h3>
                        {count > 0 && (
                          <span className="text-xs leading-4 whitespace-nowrap text-muted-foreground tabular-nums">
                            <b className="font-semibold text-foreground">
                              {count}
                            </b>{" "}
                            plates
                          </span>
                        )}
                      </div>
                      {dishes.length > 0 ? (
                        <ul
                          aria-label={`Recipes for ${mealName(day, meal)}`}
                          className="m-0 grid list-none gap-1 p-0"
                        >
                          {dishes.map((dish) => (
                            <li key={dish.id} className="leading-5">
                              <Link
                                href={`${recipePath(dish.recipeId)}${count > 0 ? `?plates=${count}` : ""}`}
                                className="text-sm leading-5 font-semibold text-foreground underline decoration-muted-foreground/45 decoration-1 underline-offset-4 hover:text-primary hover:decoration-current"
                              >
                                {dish.title}
                              </Link>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="m-0 text-sm leading-5 text-muted-foreground/75 italic">
                          {count > 0
                            ? "Dishes not chosen yet"
                            : `No camp ${meal} this day`}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>

      {snacks.length > 0 && (
        <section
          aria-labelledby="menu-snacks"
          className="mt-6 border border-border bg-card"
        >
          <header className="border-b border-border px-4 py-3 page-md:px-5">
            <h2
              id="menu-snacks"
              className="text-[11px] leading-4 tracking-[0.2em]"
            >
              Snacks
            </h2>
            <p className="mt-1 text-xs leading-4 text-muted-foreground">
              Out all week, between meals.
            </p>
          </header>
          <ul
            aria-label="Snacks"
            className="m-0 grid list-none px-4 py-1 page-md:grid-cols-2 page-md:gap-x-10 page-md:px-5"
          >
            {snacks.map((snack) => (
              <li
                key={snack.id}
                className="flex justify-between gap-3 border-t border-border py-2 text-sm leading-5 first:border-t-0 page-md:[&:nth-child(2)]:border-t-0"
              >
                <span className="min-w-0 break-words">{snack.name}</span>
                {snack.amount && (
                  <span className="whitespace-nowrap text-muted-foreground tabular-nums">
                    {snack.amount}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
