import { randomUUID } from "node:crypto";
import { PROMPT_VERSIONS } from "@camp404/ai-prompts";
import { setLogisticsPhase } from "@camp404/db/logistics";
import {
  KitchenRecipe,
  type LogisticsPhase,
  type MealPlanDay,
} from "@camp404/types";
import { MODELS } from "../anthropic";
import { getMealPlan, setMealPlan } from "../meal-plan";
import {
  claimSourceRun,
  completeSourceRun,
  decideRecipe,
  queueProofread,
  suggestRecipe,
} from "../recipes";
import { testStore } from "../test-store";
import type { People, Seed } from "./_agreement";

// The Kitchen's half of the agreement suites (kitchen-menu, kitchen-extras,
// meal-plan): a recipe put into the book and a meal plan saved, each through
// the FACADES (lib/recipes.ts, lib/meal-plan.ts), so the same calls seed the
// database and the store. A suite file still mocks "@/lib/test-mode" itself.

export const KITCHEN_NOW = new Date("2027-02-10T10:00:00Z");

/** A recipe Claude wrote for `plates`, named `title`. */
export function kitchenRecipe(title: string, plates = 45): KitchenRecipe {
  return KitchenRecipe.parse({
    title,
    plates,
    ingredients: [
      { name: "Red lentils", category: "legume", quantity: 3, unit: "kg" },
      { name: "Salt", category: "spice", quantity: 2, unit: "tbsp" },
    ],
    steps: [
      { instruction: "Simmer the lentils.", uses: ["Red lentils"] },
      { instruction: "Salt them.", uses: ["Salt"] },
    ],
  });
}

/**
 * A member's suggestion, approved by a captain, sent by the Kitchen lead and
 * written into the book by Claude as `title`. Its recipe and version ids.
 */
export async function recipeInBook(
  p: People,
  title: string,
  plates = 45,
): Promise<{ recipeId: string; versionId: string }> {
  const made = await suggestRecipe({
    submitterId: p.member,
    title,
    source: "text",
    sourceUrl: null,
    text: `${title}: lentils, salt. Simmer.`,
    suitabilityNote: null,
    aiConsent: true,
    now: KITCHEN_NOW,
  });
  if (!made.ok) throw new Error(made.error);
  const approved = await decideRecipe({
    recipeId: made.id,
    actorId: p.captain,
    decision: "approve",
  });
  if (!approved.ok) throw new Error(approved.error);
  const queued = await queueProofread({
    recipeIds: [made.id],
    actorId: p.kitchenLead,
    note: null,
    plates,
    now: KITCHEN_NOW,
    promptVersion: PROMPT_VERSIONS.recipeSource,
    revisionPromptVersion: PROMPT_VERSIONS.recipeSourceRevision,
    model: MODELS.opus,
  });
  if (!queued.ok) throw new Error(queued.error);
  const runId = queued.runIds[0]!;
  await claimSourceRun(runId, KITCHEN_NOW);
  const written = await completeSourceRun({
    runId,
    result: {
      needsInfo: false,
      questions: [],
      recipe: kitchenRecipe(title, plates),
      report: { changed: [], unsure: [] },
      scalingNotes: ["The source serves 4; this is ten times it."],
    },
    usage: { inputTokens: 1, outputTokens: 1 },
    now: KITCHEN_NOW,
  });
  if (!written.ok || !written.versionId) {
    throw new Error(written.ok ? "No version was written." : written.error);
  }
  return { recipeId: made.id, versionId: written.versionId };
}

/**
 * Save this year's meal plan as the captain: `plates(day)` for each day on
 * site (1-based). Its new version.
 */
export async function savedMealPlan(
  p: People,
  plates: (day: number) => MealPlanDay,
): Promise<number> {
  const plan = await getMealPlan();
  const saved = await setMealPlan({
    actorId: p.captain,
    firstDay: plan.firstDay,
    days: plan.days.map((_, i) => plates(i + 1)),
    expectedVersion: plan.version,
  });
  if (!saved.ok) throw new Error(saved.error);
  return saved.version;
}

/**
 * Give a Logistics phase its days this year, as the captain, through each
 * side's own writer (lib/logistics.ts would also write to Google). The meal
 * plan reads Day 1 and the days on site from these. The phase's new version.
 */
export async function phaseDays(
  seed: Seed,
  p: People,
  phase: LogisticsPhase,
  startDate: string,
  endDate: string,
  expectedVersion = 0,
): Promise<number> {
  const input = {
    actorId: p.captain,
    phase,
    startDate,
    endDate,
    place: null,
    note: null,
    expectedVersion,
    newEventId: randomUUID(),
  };
  const saved =
    seed.side === "store"
      ? testStore.setLogisticsPhase(input)
      : await setLogisticsPhase(input);
  if (!saved.ok) throw new Error(saved.error);
  return saved.row.version;
}
