import Link from "next/link";
import {
  canEditMealPlan,
  prepPlan,
  shortDay,
  type PlanPrepStep,
} from "@camp404/core";
import {
  DateRow,
  GroupRow,
  LIST_TABLE,
  LIST_TD,
  LIST_TH,
  TickBox,
  printedOn,
} from "@/components/print/print-kit";
import {
  PrintPage,
  PrintRefusal,
  PrintSheet,
} from "@/components/print/print-sheet";
import { getCurrentCycle } from "@/lib/camp-config";
import { captainPageGate } from "@/lib/captain-gate";
import { listSheetPrepSteps } from "@/lib/kitchen-menu";
import { getMealPlan } from "@/lib/meal-plan";
import { MEAL_PLAN_PATH, PREP_PLAN_REFUSAL } from "@/lib/recipe-copy";
import { getLeadTeams } from "@/lib/users";

export const dynamic = "force-dynamic";

export const metadata = { title: "Prep plan to print — Camp 404" };

// The prep plan on A4 (#249; the owner approved Option A of
// design/print-prep-plan.html, 2026-10-02), from the prep steps on the meal
// plan (#245), in the shared print shell with a real PDF. "Before we leave"
// first, by date, then each day on site in order (prepPlan in @camp404/core),
// each step with a tick box, what to do, and the dish and meal it is for. No
// names: a prep step has no person (the owner).
//
// The same readers as the prep steps: they show only to the people who edit
// the meal plan, a captain or a Kitchen lead (canEditMealPlan, decided here
// on the server). Anyone else reads a refusal outside the sheet, so it is
// never a PDF.

function StepRows({ steps }: { steps: readonly PlanPrepStep[] }) {
  return steps.map((s, i) => (
    <tr
      key={`${s.dueDate}-${i}`}
      data-testid="prep-step"
      className="break-inside-avoid"
    >
      <td className={`${LIST_TD} w-[18px]`}>
        <TickBox />
      </td>
      <td className={LIST_TD}>{s.what}</td>
      <td className={`${LIST_TD} w-[210px] text-[10.5px] text-neutral-700`}>
        {s.recipeTitle} · Day {s.day} {s.meal}
      </td>
    </tr>
  ));
}

export default async function PrepPlanPrintPage() {
  const { campUser, rank } = await captainPageGate("camp_member");
  const leadTeams = rank === "team_lead" ? await getLeadTeams(campUser.id) : [];
  if (!canEditMealPlan(rank, leadTeams)) {
    return (
      <PrintRefusal>
        <p data-testid="prep-refusal">{PREP_PLAN_REFUSAL}</p>
        <p className="mt-3">
          <Link href={MEAL_PLAN_PATH} className="underline">
            Back to the meal plan
          </Link>
        </p>
      </PrintRefusal>
    );
  }

  const [plan, cycle] = await Promise.all([getMealPlan(), getCurrentCycle()]);
  const steps = await listSheetPrepSteps(plan.cycle);
  const sheet = prepPlan({
    steps,
    firstDay: plan.firstDay,
    daysOnSite: plan.daysOnSite,
  });

  const subtitle = [
    cycle ? `AfrikaBurn ${cycle.year}` : null,
    `${sheet.beforeCount} ${sheet.beforeCount === 1 ? "step" : "steps"} before we leave`,
    plan.firstDay ? `${sheet.onSiteCount} on site` : null,
  ]
    .filter((p): p is string => p !== null)
    .join(" · ");

  return (
    <PrintSheet
      area="Kitchen"
      title="Prep plan"
      options={
        <Link href={MEAL_PLAN_PATH} className="underline">
          Back to the meal plan
        </Link>
      }
      marginMm={12}
      paged
    >
      <PrintPage
        area="Kitchen"
        title="Prep plan"
        subtitle={subtitle}
        footer="Kitchen"
        footerEnd={`Printed ${printedOn(new Date())}`}
      >
        {!plan.firstDay && (
          <p className="mb-2 text-[11px]">
            Day 1 has no date on the meal plan yet, so the steps are listed by
            date only.
          </p>
        )}
        <table className={LIST_TABLE} aria-label="Prep plan">
          <thead>
            <tr>
              <th className={`${LIST_TH} w-[18px]`}>
                <span className="sr-only">Done</span>
              </th>
              <th className={LIST_TH}>What to do</th>
              <th className={`${LIST_TH} w-[210px]`}>For</th>
            </tr>
          </thead>
          <tbody>
            <GroupRow
              colSpan={3}
              plain
              aside={plan.firstDay ? "in Cape Town" : undefined}
            >
              {plan.firstDay ? "Before we leave" : "Prep steps"}
            </GroupRow>
            {sheet.before.length === 0 && (
              <tr>
                <td className={LIST_TD} />
                <td
                  colSpan={2}
                  className={`${LIST_TD} italic text-neutral-500`}
                >
                  Nothing to prep before we leave.
                </td>
              </tr>
            )}
            {sheet.before.flatMap((d) => [
              <DateRow key={`d-${d.date}`} colSpan={3}>
                {shortDay(d.date)}
              </DateRow>,
              <StepRows key={`s-${d.date}`} steps={d.steps} />,
            ])}
            {sheet.onSite.flatMap((d) => [
              <GroupRow key={`d-${d.day}`} colSpan={3} plain aside="on site">
                Day {d.day} · {shortDay(d.date)}
              </GroupRow>,
              d.steps.length === 0 ? (
                <tr key={`e-${d.day}`}>
                  <td className={LIST_TD} />
                  <td
                    colSpan={2}
                    className={`${LIST_TD} italic text-neutral-500`}
                  >
                    Nothing to prep.
                  </td>
                </tr>
              ) : (
                <StepRows key={`s-${d.day}`} steps={d.steps} />
              ),
            ])}
          </tbody>
        </table>
      </PrintPage>
    </PrintSheet>
  );
}
