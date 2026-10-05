import {
  allergenFlags,
  canEditMealPlan,
  mealPlates,
  planCovers,
  type DietaryCounts,
} from "@camp404/core";
import { captainPageGate } from "@/lib/captain-gate";
import { dailySheetHref } from "@/lib/daily-sheet-copy";
import {
  getKitchenMenu,
  getMealChecks,
  getMenuDietaryFor,
  getSnacks,
  listMenuBook,
  type MealChecks,
} from "@/lib/kitchen-menu";
import { getMealPlan } from "@/lib/meal-plan";
import { getLeadTeams } from "@/lib/users";
import { DietaryBox } from "./dietary-box";
import type { MealCheckView } from "./meal-checks";
import { MealPlanEditor } from "./meal-plan-editor";
import { MemberMenu } from "./member-menu";
import type { MenuLine } from "./menu-cell";
import { SnackList } from "./snack-list";

export const dynamic = "force-dynamic";

// A menu line's plate chip runs Claude in after() (proofreadPlatesAction),
// inside this page's time budget, as the recipe pages do. PROOFREAD_TIMEOUT_MS
// (240 s) assumes it.
export const maxDuration = 300;

export const metadata = { title: "Meal plan — Camp 404" };

// The kitchen's meal plan (the owner's sketch, 2026-09-24): this year's days
// on site, and the plates at breakfast and dinner on each (the camp does no
// lunch, the owner, 2026-10-01). A recipe in the book is shown at each
// distinct count here, and the largest is what Claude writes a new recipe
// for.
//
// The menu sits inside it (#244): under each meal's plates, the recipes on
// that meal, and the year's snacks under the week. The shopping list
// (/kitchen/shopping) is worked out from both. Two views, both approved by
// the owner on 2026-10-01: a captain or a Kitchen lead (canEditMealPlan,
// decided here on the server) gets the week as a table to edit
// (design/approved-kmp.html, Option A), with the recipe picker
// (approved-rp.html, Option B); every other member reads the menu as a card
// per day (approved-kmenu.html, Option A), and is never sent the book.
// Every write checks again inside its own transaction and writes an audit
// row. Day 1 and the days on site come from the camp's days in Logistics
// (the owner, 2026-10-03: one place to set dates), so each day is named with
// its date; with no dates there yet it is "Day 1", "Day 2".
//
// #245 (the owner's Option A of kitchen-dietary.html and kitchen-prep.html,
// 2026-10-02): the editors also get the dietary counts box above the week
// (counts only, from the members coming this year: getMenuDietaryFor answers
// null to anyone else, on the server), a flag under each recipe that holds
// something someone coming reacts to (red for anaphylaxis until a plan is
// recorded), and its prep steps with "+ Prep step". A member's page reads
// none of it.

const NO_COUNTS: DietaryCounts = {
  members: 0,
  allergies: [],
  intolerances: [],
  preferences: [],
};

/** What shows under one recipe on a meal, worked out here on the server. */
function checkView(
  item: { id: string; recipeId: string },
  recipe: Awaited<ReturnType<typeof getKitchenMenu>>["recipes"][string],
  counts: DietaryCounts,
  checks: MealChecks,
): MealCheckView {
  const flags = allergenFlags(recipe.allergens, counts);
  const plan = checks.plans.find((p) => p.menuItemId === item.id) ?? null;
  return {
    recipeId: item.recipeId,
    versionId: recipe.versionId,
    allergens: recipe.allergens.map((a) => a.allergen),
    marked: recipe.allergensMarked || recipe.allergenRevision > 0,
    allergenRevision: recipe.allergenRevision,
    red: flags.red,
    amber: flags.amber,
    anaphylactic: flags.red.map((r) => ({
      allergen: r.allergen,
      count:
        counts.allergies.find((a) => a.food === r.allergen)?.anaphylactic ?? 0,
    })),
    plan: plan
      ? {
          kind: plan.kind,
          details: plan.details,
          allergens: plan.allergens,
          version: plan.version,
        }
      : null,
    covered: planCovers(plan?.allergens ?? null, flags.red),
    prep: checks.prepSteps
      .filter((s) => s.menuItemId === item.id)
      .map(({ id, what, dueDate, timing }) => ({ id, what, dueDate, timing })),
  };
}

export default async function MealPlanPage() {
  const { campUser, rank } = await captainPageGate("camp_member");
  const leadTeams = rank === "team_lead" ? await getLeadTeams(campUser.id) : [];
  const canEdit = canEditMealPlan(rank, leadTeams);
  const [plan, menu, snacks, book, dietary, checks] = await Promise.all([
    getMealPlan(),
    getKitchenMenu(),
    getSnacks(),
    canEdit ? listMenuBook() : Promise.resolve([]),
    canEdit ? getMenuDietaryFor(campUser.id) : Promise.resolve(null),
    canEdit ? getMealChecks() : Promise.resolve(null),
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
        ...(checks
          ? {
              check: checkView(
                item,
                recipe,
                dietary?.counts ?? NO_COUNTS,
                checks,
              ),
            }
          : {}),
      },
    ];
  });

  if (!canEdit) {
    return (
      <MemberMenu
        daysOnSite={plan.daysOnSite}
        firstDay={plan.firstDay}
        days={plan.days}
        lines={lines}
        snacks={snacks}
      />
    );
  }

  return (
    <div className="flex min-w-0 flex-col">
      <MealPlanEditor
        // A saved plan comes back with a new version: start from it.
        key={plan.version}
        daysOnSite={plan.daysOnSite}
        firstDay={plan.firstDay}
        days={plan.days}
        version={plan.version}
        menu={lines}
        book={book}
        above={
          dietary ? (
            <DietaryBox
              counts={dietary.counts}
              oldOnly={dietary.oldOnly}
              whoHref={dailySheetHref(null)}
            />
          ) : null
        }
      />
      <SnackList snacks={snacks} />
    </div>
  );
}
