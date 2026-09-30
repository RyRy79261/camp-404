import { canEditMealPlan, mealPlates } from "@camp404/core";
import { captainPageGate } from "@/lib/captain-gate";
import { getKitchenMenu, getSnacks } from "@/lib/kitchen-menu";
import { getMealPlan } from "@/lib/meal-plan";
import { listRecipeBook } from "@/lib/recipes";
import { getLeadTeams } from "@/lib/users";
import { MealPlanEditor } from "./meal-plan-editor";
import type { MenuLine } from "./menu-cell";
import { SnackList } from "./snack-list";

export const dynamic = "force-dynamic";

export const metadata = { title: "Meal plan — Camp 404" };

// The kitchen's meal plan (the owner's sketch, 2026-09-24): this year's days
// on site, and the plates at breakfast, lunch and dinner on each. A recipe in
// the book is shown at each distinct count here, and the largest is what
// Claude writes a new recipe for.
//
// The menu sits inside it (#244, the owner's layout A, 2026-09-30): under
// each meal's plates, the recipes on that meal, each on its own line with
// where its plate count stands, and the year's snacks under the table. The
// shopping list (/kitchen/shopping) is worked out from both.
//
// Every approved member reads it. A captain or a Kitchen lead edits it
// (canEditMealPlan, decided here on the server); every write checks again
// inside its own transaction and writes an audit row. The plan holds the date
// of day 1 (the owner, 2026-09-24), so each day is named with its date; with
// no date set yet it is "Day 1", "Day 2".

export default async function MealPlanPage() {
  const { campUser, rank } = await captainPageGate("camp_member");
  const leadTeams = rank === "team_lead" ? await getLeadTeams(campUser.id) : [];
  const canEdit = canEditMealPlan(rank, leadTeams);
  const [plan, menu, snacks, book] = await Promise.all([
    getMealPlan(),
    getKitchenMenu(),
    getSnacks(),
    canEdit ? listRecipeBook() : Promise.resolve([]),
  ]);

  // Each recipe on a day of the plan, with where its count stands for the
  // meal's saved plates. A row for a day past the days on site is left off.
  const lines: MenuLine[] = menu.items.flatMap((item) => {
    if (item.day > plan.daysOnSite) return [];
    const recipe = menu.recipes[item.recipeId];
    if (!recipe) return [];
    const plates = mealPlates(plan.days, item.day, item.meal);
    return [
      {
        id: item.id,
        day: item.day,
        meal: item.meal,
        recipeId: item.recipeId,
        title: recipe.title,
        versionId: recipe.versionId,
        verified: recipe.counts.some((c) => c.plates === plates),
        withClaude: recipe.openPlates.includes(plates),
      },
    ];
  });

  return (
    <div className="flex min-w-0 flex-col gap-8">
      <MealPlanEditor
        // A saved plan comes back with a new version: start from it.
        key={plan.version}
        daysOnSite={plan.daysOnSite}
        firstDay={plan.firstDay}
        days={plan.days}
        version={plan.version}
        canEdit={canEdit}
        menu={lines}
        book={book.map((r) => ({ id: r.id, title: r.title }))}
      />
      <SnackList snacks={snacks} canEdit={canEdit} />
    </div>
  );
}
