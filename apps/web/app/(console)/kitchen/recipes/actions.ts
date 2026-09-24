"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { PROMPT_VERSIONS } from "@camp404/ai-prompts";
import {
  canApproveRecipe,
  canRunProofread,
  defaultPlates,
  mealPlanPeaks,
} from "@camp404/core";
import {
  AcceptProofreadInput,
  AddLessonInput,
  AnswerQuestionsInput,
  DecideRecipeInput,
  KitchenSettingsInput,
  QueuePlateProofreadInput,
  QueueProofreadInput,
  RecipeIdInput,
  RequestRerunInput,
  ResubmitRecipeInput,
  RetypeRecipeTextInput,
  SendSourceInput,
  StartVariationInput,
  SuggestRecipeInput,
} from "@camp404/types";
import { runAction, type ActionResult } from "@/lib/action-result";
import { MODELS } from "@/lib/anthropic";
import {
  captainActionGate,
  type CaptainActionAccess,
} from "@/lib/captain-gate";
import { getMealPlan } from "@/lib/meal-plan";
import { processRuns } from "@/lib/recipe-proofread";
import {
  CHECK_RECIPE,
  DECIDE_REFUSAL,
  KITCHEN_SETTINGS_REFUSAL,
  PROOFREAD_NOT_SET_UP,
  RECIPES_PATH,
  RERUN_REQUEST_REFUSAL,
  RETYPE_REFUSAL,
  REVIEW_REFUSAL,
  RUN_REFUSAL,
  VARIATION_REFUSAL,
  VERSION_REFUSAL,
  recipePath,
} from "@/lib/recipe-copy";
import {
  acceptProofread,
  addLesson,
  answerProofreadQuestions,
  decideRecipe,
  getProofreadProgress,
  queuePlateProofread,
  queueProofread,
  requestRerun,
  resetStaleRuns,
  resubmitRecipe,
  retypeRecipeText,
  sendSourceForProofreading,
  setKitchenSettings,
  startVariation,
  suggestRecipe,
  type KitchenSettings,
  type ProofreadProgress,
} from "@/lib/recipes";
import { isE2ETestMode } from "@/lib/test-mode";
import { getLeadTeams } from "@/lib/users";

// The kitchen's recipe writes (#243). Each action: the rank gate
// (captainActionGate), the Zod boundary, then the facade. The gate answers the
// screen; the rule itself (a captain or a lead of Kitchen, who may also send
// recipes to Claude under the owner's decision 2A; a captain alone for the
// kitchen settings) is checked again inside each write's own transaction,
// which re-reads the actor and never takes a team list from here.
//
// A run sent to Claude is processed in after(), in production and under E2E
// alike, so the editor's loading panel sees the stages the worker writes on
// the run row (under E2E the stand-in holds each one for a moment). A plate
// count still runs inline under E2E, so its Playwright flow stays
// deterministic.

type Gate = Extract<CaptainActionAccess, { ok: true }>;

function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? CHECK_RECIPE;
}

function revalidateRecipe(recipeId?: string): void {
  revalidatePath(RECIPES_PATH);
  if (recipeId) revalidatePath(recipePath(recipeId));
}

/**
 * The Kitchen reviewer's gate, following canSendToAudience: the rank gate at
 * team_lead (clearance is global), then the rule on the teams they lead
 * (canApproveRecipe, or canRunProofread for anything sent to Claude), so a
 * lead of another team is told here rather than by the write.
 */
async function kitchenGate(
  refusal: string,
  rule: (rank: string, led: readonly string[]) => boolean = canApproveRecipe,
): Promise<Gate | { ok: false; error: string }> {
  const gate = await captainActionGate("team_lead", refusal);
  if (!gate.ok) return gate;
  const led =
    gate.rank === "captain" ? [] : await getLeadTeams(gate.campUser.id);
  if (!rule(gate.rank, led)) return { ok: false, error: refusal };
  return gate;
}

/** A reviewer who may send recipes to Claude (the owner's decision 2A). */
function runGate(): Promise<Gate | { ok: false; error: string }> {
  return kitchenGate(RUN_REFUSAL, canRunProofread);
}

/**
 * The plates Claude writes a recipe for: the largest count in this year's
 * meal plan, or DEFAULT_PLATES when it has none. Worked out here, never
 * taken from the browser.
 */
async function mealPlanPlates(): Promise<number> {
  return defaultPlates(mealPlanPeaks((await getMealPlan()).days));
}

/**
 * The prompts a source run may be recorded under: the revision prompt when
 * the recipe already has an accepted version (the write decides), else the
 * source prompt.
 */
const SOURCE_PROMPTS = {
  promptVersion: PROMPT_VERSIONS.recipeSource,
  revisionPromptVersion: PROMPT_VERSIONS.recipeSourceRevision,
};

/** Outside E2E, a run needs the Anthropic key; say so before queueing. */
function proofreadNotSetUp(): { ok: false; error: string } | null {
  return !isE2ETestMode() && !process.env.ANTHROPIC_API_KEY
    ? { ok: false, error: PROOFREAD_NOT_SET_UP }
    : null;
}

/** Any approved member suggests a recipe. */
export async function suggestRecipeAction(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  return runAction("suggestRecipeAction", async () => {
    const gate = await captainActionGate("camp_member");
    if (!gate.ok) return gate;
    const parsed = SuggestRecipeInput.safeParse(input);
    if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
    const { title, source, url, text, suitabilityNote, aiConsent } =
      parsed.data;
    const result = await suggestRecipe({
      submitterId: gate.campUser.id,
      title: title ?? null,
      source,
      sourceUrl: url ?? null,
      text,
      suitabilityNote: suitabilityNote ?? null,
      aiConsent,
      now: new Date(),
    });
    if (!result.ok) return result;
    revalidateRecipe(result.id);
    return { ok: true, data: { id: result.id } };
  });
}

/** The submitter's edit after a reviewer asked for changes. */
export async function resubmitRecipeAction(
  input: unknown,
): Promise<ActionResult> {
  return runAction("resubmitRecipeAction", async () => {
    const gate = await captainActionGate("camp_member");
    if (!gate.ok) return gate;
    const parsed = ResubmitRecipeInput.safeParse(input);
    if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
    const { recipeId, title, text, suitabilityNote, aiConsent } = parsed.data;
    const result = await resubmitRecipe({
      recipeId,
      actorId: gate.campUser.id,
      title,
      text: text ?? null,
      suitabilityNote: suitabilityNote ?? null,
      aiConsent,
    });
    if (!result.ok) return result;
    revalidateRecipe(recipeId);
    return { ok: true };
  });
}

/** A Kitchen lead or a captain approves, rejects or asks for changes. */
export async function decideRecipeAction(
  input: unknown,
): Promise<ActionResult> {
  return runAction("decideRecipeAction", async () => {
    const gate = await kitchenGate(DECIDE_REFUSAL);
    if (!gate.ok) return gate;
    const parsed = DecideRecipeInput.safeParse(input);
    if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
    const result = await decideRecipe({
      ...parsed.data,
      actorId: gate.campUser.id,
    });
    if (!result.ok) return result;
    revalidateRecipe(parsed.data.recipeId);
    return { ok: true };
  });
}

/** A Kitchen lead or a captain retypes the working text, and becomes its author. */
export async function retypeRecipeTextAction(
  input: unknown,
): Promise<ActionResult> {
  return runAction("retypeRecipeTextAction", async () => {
    const gate = await kitchenGate(RETYPE_REFUSAL);
    if (!gate.ok) return gate;
    const parsed = RetypeRecipeTextInput.safeParse(input);
    if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
    const result = await retypeRecipeText({
      ...parsed.data,
      actorId: gate.campUser.id,
    });
    if (!result.ok) return result;
    revalidateRecipe(parsed.data.recipeId);
    return { ok: true };
  });
}

/**
 * A Kitchen lead asks a captain to run proofreading again, with what should
 * change. Free: it only leaves a note for the captains, audited.
 */
export async function requestRerunAction(
  input: unknown,
): Promise<ActionResult> {
  return runAction("requestRerunAction", async () => {
    const gate = await kitchenGate(RERUN_REQUEST_REFUSAL);
    if (!gate.ok) return gate;
    const parsed = RequestRerunInput.safeParse(input);
    if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
    const result = await requestRerun({
      ...parsed.data,
      actorId: gate.campUser.id,
    });
    if (!result.ok) return result;
    revalidateRecipe(parsed.data.recipeId);
    revalidatePath(`${RECIPES_PATH}/review`);
    return { ok: true };
  });
}

/**
 * The recipe an older run wrote becomes the next version, exactly as Claude
 * wrote it: the write reads it from the run, never from the browser.
 */
export async function acceptProofreadAction(
  input: unknown,
): Promise<ActionResult<{ version: number }>> {
  return runAction("acceptProofreadAction", async () => {
    const gate = await kitchenGate(VERSION_REFUSAL);
    if (!gate.ok) return gate;
    const parsed = AcceptProofreadInput.safeParse(input);
    if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
    const { recipeId, runId, reason } = parsed.data;
    const result = await acceptProofread({
      recipeId,
      runId,
      reason: reason ?? null,
      actorId: gate.campUser.id,
    });
    if (!result.ok) return result;
    revalidateRecipe(parsed.data.recipeId);
    return { ok: true, data: { version: result.version } };
  });
}

/** A sibling recipe, such as a gluten-free one, linked to the original. */
export async function startVariationAction(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  return runAction("startVariationAction", async () => {
    const gate = await kitchenGate(VARIATION_REFUSAL);
    if (!gate.ok) return gate;
    const parsed = StartVariationInput.safeParse(input);
    if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
    const result = await startVariation({
      ...parsed.data,
      actorId: gate.campUser.id,
    });
    if (!result.ok) return result;
    revalidateRecipe(parsed.data.recipeId);
    revalidatePath(recipePath(result.id));
    return { ok: true, data: { id: result.id } };
  });
}

/** What the cooks learned. Any approved member. */
export async function addLessonAction(input: unknown): Promise<ActionResult> {
  return runAction("addLessonAction", async () => {
    const gate = await captainActionGate("camp_member");
    if (!gate.ok) return gate;
    const parsed = AddLessonInput.safeParse(input);
    if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
    const result = await addLesson({
      ...parsed.data,
      authorId: gate.campUser.id,
    });
    if (!result.ok) return result;
    revalidateRecipe(parsed.data.recipeId);
    return { ok: true };
  });
}

/**
 * A captain sets the kitchen's size (the largest pot and the burners); it is
 * audited. The plates at each meal live in the meal plan now, and the old
 * daily cap is not read: Camp settings sends neither, and the write keeps the
 * stored values.
 */
export async function setKitchenSettingsAction(
  input: unknown,
): Promise<ActionResult<{ settings: KitchenSettings }>> {
  return runAction("setKitchenSettingsAction", async () => {
    const gate = await captainActionGate("captain", KITCHEN_SETTINGS_REFUSAL);
    if (!gate.ok) return gate;
    const parsed = KitchenSettingsInput.safeParse(input);
    if (!parsed.success) {
      return {
        ok: false,
        error: parsed.error.issues[0]?.message ?? "Check the kitchen settings.",
      };
    }
    const result = await setKitchenSettings({
      ...parsed.data,
      actorId: gate.campUser.id,
    });
    if (!result.ok) return result;
    revalidatePath("/captains/camp-settings");
    revalidatePath(RECIPES_PATH);
    return { ok: true, data: { settings: result.settings } };
  });
}

/**
 * A captain or a Kitchen lead presses "Turn into recipes with Claude" on the
 * review page: Claude reads each picked recipe's newest source and writes it
 * for `plates` plates, straight into the book (or asks questions first). The
 * runs are queued (the consent and the source are checked in that one
 * transaction) and
 * processed after the response, all at once, so the button does not wait on
 * Claude and the batch fits inside the page's 300 s (processRuns). There is
 * no cron: a run that never starts is reset when a Kitchen page next loads.
 */
export async function runProofreadingAction(
  input: unknown,
): Promise<ActionResult<{ queued: number }>> {
  return runAction("runProofreadingAction", async () => {
    const gate = await runGate();
    if (!gate.ok) return gate;
    const parsed = QueueProofreadInput.safeParse(input);
    if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
    const notSetUp = proofreadNotSetUp();
    if (notSetUp) return notSetUp;

    const { recipeIds, note, plates } = parsed.data;
    const result = await queueProofread({
      recipeIds,
      actorId: gate.campUser.id,
      note: note ?? null,
      plates,
      now: new Date(),
      ...SOURCE_PROMPTS,
      model: MODELS.opus,
    });
    if (!result.ok) return result;

    const { runIds } = result;
    after(() => processRuns({ runIds }));
    revalidatePath(RECIPES_PATH);
    for (const id of recipeIds) revalidatePath(recipePath(id));
    return { ok: true, data: { queued: runIds.length } };
  });
}

/**
 * "Send for proofreading" from the source editor: the source is saved as a
 * new version when it changed, and the run queued, in one transaction. The
 * plates are the largest count in this year's meal plan, worked out here and
 * never taken from the browser. A recipe already in the book is revised from
 * its accepted version (the revision prompt). The run is processed after the response
 * (under E2E too), and the editor polls proofreadProgressAction for its
 * stages. It answers with the source version it sent, so a second send from
 * the same page (after Claude's questions, say) is based on that version.
 */
export async function sendSourceForProofreadingAction(
  input: unknown,
): Promise<ActionResult<{ runId: string; sourceId: string }>> {
  return runAction("sendSourceForProofreadingAction", async () => {
    const gate = await runGate();
    if (!gate.ok) return gate;
    const parsed = SendSourceInput.safeParse(input);
    if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
    const notSetUp = proofreadNotSetUp();
    if (notSetUp) return notSetUp;

    const { recipeId, basedOnSourceId, serves, sections } = parsed.data;
    const plates = await mealPlanPlates();
    const result = await sendSourceForProofreading({
      recipeId,
      actorId: gate.campUser.id,
      basedOnSourceId,
      serves,
      sections,
      plates,
      now: new Date(),
      ...SOURCE_PROMPTS,
      model: MODELS.opus,
    });
    if (!result.ok) return result;

    const { runId, sourceId } = result;
    after(() => processRuns({ runIds: [runId] }));
    revalidateRecipe(recipeId);
    return { ok: true, data: { runId, sourceId } };
  });
}

/**
 * "Send for proofreading" on the recipe page: Claude reads the recipe's newest
 * source as it stands, for the largest count in this year's meal plan, and
 * writes it straight into the book (revising the accepted version when there
 * is one), or asks questions first. Nothing is edited here: the source editor
 * does that. It answers with the run, which the page polls.
 */
export async function proofreadRecipeAction(
  input: unknown,
): Promise<ActionResult<{ runId: string }>> {
  return runAction("proofreadRecipeAction", async () => {
    const gate = await runGate();
    if (!gate.ok) return gate;
    const parsed = RecipeIdInput.safeParse(input);
    if (!parsed.success) return { ok: false, error: CHECK_RECIPE };
    const notSetUp = proofreadNotSetUp();
    if (notSetUp) return notSetUp;

    const { recipeId } = parsed.data;
    const result = await queueProofread({
      recipeIds: [recipeId],
      actorId: gate.campUser.id,
      note: null,
      plates: await mealPlanPlates(),
      now: new Date(),
      ...SOURCE_PROMPTS,
      model: MODELS.opus,
    });
    if (!result.ok) return result;

    const runId = result.runIds[0]!;
    after(() => processRuns({ runIds: [runId] }));
    revalidateRecipe(recipeId);
    return { ok: true, data: { runId } };
  });
}

/**
 * The reviewer's answer to Claude's questions queues the next round, which
 * carries the whole exchange; it runs after the response, as a send does.
 */
export async function answerProofreadQuestionsAction(
  input: unknown,
): Promise<ActionResult<{ runId: string }>> {
  return runAction("answerProofreadQuestionsAction", async () => {
    const gate = await runGate();
    if (!gate.ok) return gate;
    const parsed = AnswerQuestionsInput.safeParse(input);
    if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
    const notSetUp = proofreadNotSetUp();
    if (notSetUp) return notSetUp;

    const { recipeId, runId: answeredRunId, answer } = parsed.data;
    const result = await answerProofreadQuestions({
      recipeId,
      runId: answeredRunId,
      actorId: gate.campUser.id,
      answer,
      now: new Date(),
      ...SOURCE_PROMPTS,
      model: MODELS.opus,
    });
    if (!result.ok) return result;

    const { runId } = result;
    after(() => processRuns({ runIds: [runId] }));
    revalidateRecipe(recipeId);
    return { ok: true, data: { runId } };
  });
}

const ProgressInput = z.object({
  recipeId: z.guid(),
  runId: z.guid().optional(),
});

/**
 * What the editor's loading panel polls: the stage the worker last wrote on
 * the run it started (`runId`; the recipe's newest run when it has none), its
 * outcome, Claude's questions and the error. Nothing else leaves: no tokens,
 * no answer, no run id. Null when there is no such run.
 *
 * There is no cron, so a run that will never finish (its after() never ran,
 * or the function was killed) is reset here first, as a Kitchen page load
 * does: the poll then reads it as failed and the Send button comes back.
 */
export async function proofreadProgressAction(
  input: unknown,
): Promise<
  ActionResult<Pick<
    ProofreadProgress,
    "stage" | "outcome" | "questions" | "error"
  > | null>
> {
  return runAction("proofreadProgressAction", async () => {
    const gate = await kitchenGate(REVIEW_REFUSAL);
    if (!gate.ok) return gate;
    const parsed = ProgressInput.safeParse(input);
    if (!parsed.success) return { ok: false, error: CHECK_RECIPE };
    await resetStaleRuns(new Date());
    const progress = await getProofreadProgress(
      parsed.data.recipeId,
      parsed.data.runId,
    );
    if (!progress) return { ok: true, data: null };
    const { stage, outcome, questions, error } = progress;
    return { ok: true, data: { stage, outcome, questions, error } };
  });
}

/**
 * A captain or a Kitchen lead has Claude proofread the accepted version for
 * another plate count, because food does not scale by multiplying. A count
 * that already has a result is refused by the write unless `rerun` asks for
 * it, so moving a day from 50 to 45 and back never pays twice. The run
 * sends Claude the kitchen's recipe alone (never the member's
 * text), and runs after the response, or inline under E2E.
 */
export async function proofreadPlatesAction(
  input: unknown,
): Promise<ActionResult<{ runId: string }>> {
  return runAction("proofreadPlatesAction", async () => {
    const gate = await runGate();
    if (!gate.ok) return gate;
    const parsed = QueuePlateProofreadInput.safeParse(input);
    if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
    const notSetUp = proofreadNotSetUp();
    if (notSetUp) return notSetUp;

    const { recipeId, versionId, plates, rerun } = parsed.data;
    const result = await queuePlateProofread({
      recipeId,
      versionId,
      plates,
      rerun,
      actorId: gate.campUser.id,
      now: new Date(),
      promptVersion: PROMPT_VERSIONS.recipePlates,
      model: MODELS.opus,
    });
    if (!result.ok) return result;

    const runIds = [result.runId];
    if (isE2ETestMode()) {
      await processRuns({ runIds });
    } else {
      after(() => processRuns({ runIds }));
    }
    revalidatePath(recipePath(recipeId));
    return { ok: true, data: { runId: result.runId } };
  });
}
