import Link from "next/link";
import {
  addDays,
  mealPlanDayLabel,
  recipeBook,
  servedText,
  shortDay,
  type BookPage,
} from "@camp404/core";
import { ALLERGEN_LABELS } from "@camp404/types";
import {
  LIST_TABLE,
  LIST_TD,
  LIST_TH,
  printedOn,
} from "@/components/print/print-kit";
import { PrintPage, PrintSheet } from "@/components/print/print-sheet";
import { RecipeCardBody, cardSubtitle } from "@/components/print/recipe-card";
import { getCurrentCycle } from "@/lib/camp-config";
import { captainPageGate } from "@/lib/captain-gate";
import { getKitchenMenu, type KitchenMenu } from "@/lib/kitchen-menu";
import { getMealPlan } from "@/lib/meal-plan";
import { RECIPES_PATH } from "@/lib/recipe-copy";
import { platesLabel } from "@/lib/recipe-labels";
import { getPlateCount, getRecipeDetail } from "@/lib/recipes";

export const dynamic = "force-dynamic";

export const metadata = { title: "Recipe book to print — Camp 404" };

// The recipe book on A4 (#249; the owner approved Option A of
// design/print-recipe-book.html, 2026-10-02), in the shared print shell with
// a real PDF. Page 1 is the contents: this year's menu by day and meal, each
// dish with its page. Then one page per recipe at each plate count it is
// cooked for (recipeBook in @camp404/core numbers them), drawn like the
// recipe card (components/print/recipe-card.tsx) with the ingredients beside
// the method, and a "Contains:" line from the recipe's allergens (#245:
// Claude's marks, or a Kitchen lead's correction).
//
// The same readers as the book and the menu: every approved member. Food does
// not scale by multiplying, so a dish prints only at a count the Kitchen has
// checked; a dish with no checked recipe for its plates is in the contents
// with no page. It names no member.

const MEAL_NAMES = { breakfast: "Breakfast", dinner: "Dinner" } as const;

type MenuRecipe = KitchenMenu["recipes"][string];

/** "Contains: Eggs · Milk", or what is known when nothing is listed. */
function containsText(recipe: MenuRecipe | undefined): string {
  if (!recipe) return "not marked yet.";
  if (recipe.allergens.length > 0) {
    return recipe.allergens.map((a) => ALLERGEN_LABELS[a.allergen]).join(" · ");
  }
  return recipe.allergensMarked || recipe.allergenRevision > 0
    ? "none of the allergens the Kitchen checks for."
    : "not marked yet: check the ingredients.";
}

/** "11 days, Thu 22 Apr to Sun 2 May". */
function daysText(firstDay: string | null, daysOnSite: number): string {
  const days = `${daysOnSite} ${daysOnSite === 1 ? "day" : "days"}`;
  const last = firstDay ? addDays(firstDay, daysOnSite - 1) : null;
  if (!firstDay || !last) return days;
  return daysOnSite === 1
    ? `${days}, ${shortDay(firstDay)}`
    : `${days}, ${shortDay(firstDay)} to ${shortDay(last)}`;
}

/** "Day 1 · Thu 22 Apr" (or "Day 1" with no date) on one line. */
function DayName({ firstDay, day }: { firstDay: string | null; day: number }) {
  return <>{mealPlanDayLabel(firstDay, day)}</>;
}

export default async function RecipeBookPrintPage() {
  await captainPageGate("camp_member");
  const [plan, menu, cycle] = await Promise.all([
    getMealPlan(),
    getKitchenMenu(),
    getCurrentCycle(),
  ]);
  const book = recipeBook({
    days: plan.days,
    menu: menu.items.filter((i) => i.day <= plan.daysOnSite),
    recipes: Object.fromEntries(
      Object.entries(menu.recipes).map(([id, r]) => [
        id,
        { title: r.title, plates: r.counts.map((c) => c.plates) },
      ]),
    ),
  });

  // Each recipe once, then each page's count of its book version, all at once.
  const recipeIds = [...new Set(book.pages.map((p) => p.recipeId))];
  const details = new Map(
    await Promise.all(
      recipeIds.map(async (id) => [id, await getRecipeDetail(id)] as const),
    ),
  );
  const counts = await Promise.all(
    book.pages.map((p) => {
      const version = details.get(p.recipeId)?.currentVersion;
      return version ? getPlateCount(version.id, p.plates) : null;
    }),
  );

  const printed = printedOn(new Date());
  const footerEnd = (page: number) =>
    `Printed ${printed} · page ${page} of ${book.pageCount}`;
  const subtitle = [
    cycle ? `AfrikaBurn ${cycle.year}` : null,
    daysText(plan.firstDay, plan.daysOnSite),
    "breakfast and dinner",
    `${book.pages.length} recipe ${book.pages.length === 1 ? "page" : "pages"}`,
  ]
    .filter((p): p is string => p !== null)
    .join(" · ");

  return (
    <PrintSheet
      area="Kitchen"
      title="Recipe book"
      options={
        <Link href={RECIPES_PATH} className="underline">
          Back to the recipe book
        </Link>
      }
      marginMm={12}
      paged
    >
      <PrintPage
        area="Kitchen"
        title="Recipe book"
        subtitle={subtitle}
        footer="Kitchen"
        footerEnd={footerEnd(1)}
        label="Contents"
      >
        {book.contents.length === 0 ? (
          <p className="text-[12px]">
            Nothing is on the menu yet. A captain or a Kitchen lead puts recipes
            on the meal plan.
          </p>
        ) : (
          <table className={LIST_TABLE} aria-label="Contents">
            <thead>
              <tr>
                <th className={`${LIST_TH} w-[124px]`}>Day</th>
                <th className={`${LIST_TH} w-[64px]`}>
                  <span className="sr-only">Meal</span>
                </th>
                <th className={LIST_TH}>On the menu</th>
                <th className={`${LIST_TH} w-[44px]`}>
                  <span className="sr-only">Page</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {book.contents.flatMap((day) =>
                day.meals.map((meal, j) => (
                  <tr
                    key={`${day.day}-${meal.meal}`}
                    data-testid="contents-meal"
                    className="break-inside-avoid"
                  >
                    <td
                      className={`${LIST_TD} whitespace-nowrap py-[3px] text-[11px] font-semibold`}
                    >
                      {j === 0 && (
                        <DayName firstDay={plan.firstDay} day={day.day} />
                      )}
                    </td>
                    <td
                      className={`${LIST_TD} py-[3px] text-[11px] text-neutral-600`}
                    >
                      {MEAL_NAMES[meal.meal]}
                    </td>
                    <td className={`${LIST_TD} py-[3px] text-[11px]`}>
                      {meal.entries.map((e, k) =>
                        e.page === null ? (
                          <div
                            key={k}
                            data-testid="contents-missing"
                            className="italic text-neutral-600"
                          >
                            {e.title} · {platesLabel(e.plates)}: no checked
                            recipe yet, not in the book
                          </div>
                        ) : (
                          <div key={k}>
                            {e.title}{" "}
                            <span className="text-[10px] text-neutral-600">
                              · {platesLabel(e.plates)}
                            </span>
                          </div>
                        ),
                      )}
                    </td>
                    <td
                      className={`${LIST_TD} py-[3px] text-right text-[11px] tabular-nums`}
                    >
                      {meal.entries.map((e, k) => (
                        <div key={k} data-testid="contents-page">
                          {e.page === null ? " " : `p. ${e.page}`}
                        </div>
                      ))}
                    </td>
                  </tr>
                )),
              )}
            </tbody>
          </table>
        )}
      </PrintPage>

      {book.pages.map((page, i) => (
        <RecipePage
          key={page.page}
          page={page}
          detail={details.get(page.recipeId) ?? null}
          count={counts[i] ?? null}
          facts={menu.recipes[page.recipeId]}
          footerEnd={footerEnd(page.page)}
        />
      ))}
    </PrintSheet>
  );
}

function RecipePage({
  page,
  detail,
  count,
  facts,
  footerEnd,
}: {
  page: BookPage;
  detail: Awaited<ReturnType<typeof getRecipeDetail>>;
  count: Awaited<ReturnType<typeof getPlateCount>>;
  facts: MenuRecipe | undefined;
  footerEnd: string;
}) {
  const version = detail?.currentVersion ?? null;
  const served = servedText(page.meals);
  const subtitle = (
    <>
      {[
        version && count
          ? cardSubtitle(version.recipe, version.version, count)
          : `For ${platesLabel(page.plates)}`,
        served,
      ]
        .filter(Boolean)
        .join(" · ")}
      <span
        data-testid="contains"
        className="mt-1.5 block text-[11px] text-neutral-900"
      >
        <b>Contains:</b> {containsText(facts)}
      </span>
    </>
  );
  return (
    <PrintPage
      area="Kitchen"
      title={page.title}
      subtitle={subtitle}
      footer="Kitchen"
      footerEnd={footerEnd}
      label={`${page.title}, ${platesLabel(page.plates)}`}
    >
      {version && count ? (
        <RecipeCardBody
          recipe={version.recipe}
          count={count}
          layout="columns"
          idPrefix={`p${page.page}`}
        />
      ) : (
        <p className="text-[12px]">
          This recipe changed while the book was made: print the book again.
        </p>
      )}
    </PrintPage>
  );
}
