import { canEditMealPlan } from "@camp404/core";
import { captainPageGate } from "@/lib/captain-gate";
import { getMealPlan } from "@/lib/meal-plan";
import { getLeadTeams } from "@/lib/users";
import { MealPlanEditor } from "./meal-plan-editor";

export const dynamic = "force-dynamic";

export const metadata = { title: "Meal plan — Camp 404" };

// The kitchen's meal plan (the owner's sketch, 2026-09-24): this year's days
// on site, and the plates at breakfast, lunch and dinner on each. A recipe in
// the book is shown at each distinct count here, and the largest is what
// Claude writes a new recipe for.
//
// Every approved member reads it. A captain or a Kitchen lead edits it
// (canEditMealPlan, decided here on the server); the save checks again inside
// its own transaction, writes an audit row, and compares the version the page
// opened. The plan holds the date of day 1 (the owner, 2026-09-24), so each
// day is named with its date; with no date set yet it is "Day 1", "Day 2".

export default async function MealPlanPage() {
  const { campUser, rank } = await captainPageGate("camp_member");
  const leadTeams = rank === "team_lead" ? await getLeadTeams(campUser.id) : [];
  const plan = await getMealPlan();

  return (
    <MealPlanEditor
      // A saved plan comes back with a new version: start from it.
      key={plan.version}
      daysOnSite={plan.daysOnSite}
      firstDay={plan.firstDay}
      days={plan.days}
      version={plan.version}
      canEdit={canEditMealPlan(rank, leadTeams)}
    />
  );
}
