import "server-only";

import * as db from "@camp404/db/recipes";
import type {
  AwaitingAcceptance,
  ClaimedPlateRun,
  ClaimedSourceRun,
  MySuggestion,
  PlateCountDetail,
  PlateCountSummary,
  ProofreadCandidate,
  ProofreadProgress,
  ProofreadRunRow,
  RecipeBookEntry,
  RecipeDetail,
  RecipeRunDetail,
  RecipeSourceHistoryEntry,
  RecipeSourceVersion,
  RecipeVersionDetail,
  RecipeWriteResult,
  ReviewQueueEntry,
  RunStage,
  TokenTotals,
} from "@camp404/db/recipes";
import type { OpenRun } from "@/components/recipes/proofread-questions";
import { usesTestStore } from "./test-mode";
import { testStore } from "./test-store";

// Recipes (#243), from the database or, under E2E, the test store. The rules
// live in @camp404/db/recipes; the store repeats them. Every write re-checks
// the actor itself, so a caller passes only who is acting, never their rank
// or their teams.

export type {
  AwaitingAcceptance,
  ClaimedPlateRun,
  ClaimedSourceRun,
  MySuggestion,
  PlateCountDetail,
  PlateCountSummary,
  ProofreadCandidate,
  ProofreadProgress,
  ProofreadRunRow,
  RecipeBookEntry,
  RecipeDetail,
  RecipeRunDetail,
  RecipeSourceHistoryEntry,
  RecipeSourceVersion,
  RecipeVersionDetail,
  RecipeWriteResult,
  ReviewQueueEntry,
  RunStage,
  TokenTotals,
};

type In<F extends (...args: never[]) => unknown> = Parameters<F>[0];

// --- Writes ------------------------------------------------------------------

export async function suggestRecipe(
  input: In<typeof db.suggestRecipe>,
): Promise<RecipeWriteResult<{ id: string }>> {
  return usesTestStore()
    ? testStore.suggestRecipe(input)
    : db.suggestRecipe(input);
}

export async function resubmitRecipe(
  input: In<typeof db.resubmitRecipe>,
): Promise<RecipeWriteResult> {
  return usesTestStore()
    ? testStore.resubmitRecipe(input)
    : db.resubmitRecipe(input);
}

export async function decideRecipe(
  input: In<typeof db.decideRecipe>,
): Promise<RecipeWriteResult> {
  return usesTestStore()
    ? testStore.decideRecipe(input)
    : db.decideRecipe(input);
}

export async function retypeRecipeText(
  input: In<typeof db.retypeRecipeText>,
): Promise<RecipeWriteResult> {
  return usesTestStore()
    ? testStore.retypeRecipeText(input)
    : db.retypeRecipeText(input);
}

export async function requestRerun(
  input: In<typeof db.requestRerun>,
): Promise<RecipeWriteResult> {
  return usesTestStore()
    ? testStore.requestRerun(input)
    : db.requestRerun(input);
}

export async function queueProofread(
  input: In<typeof db.queueProofread>,
): Promise<RecipeWriteResult<{ runIds: string[] }>> {
  return usesTestStore()
    ? testStore.queueProofread(input)
    : db.queueProofread(input);
}

/**
 * "Send for proofreading" from the source editor: a new source version when
 * the content changed, then the run, in one transaction.
 */
export async function sendSourceForProofreading(
  input: In<typeof db.sendSourceForProofreading>,
): Promise<RecipeWriteResult<{ runId: string; sourceId: string }>> {
  return usesTestStore()
    ? testStore.sendSourceForProofreading(input)
    : db.sendSourceForProofreading(input);
}

/**
 * "Adjust with Claude": an adjust run on one version, with what should
 * change, queued in one transaction with its audit row.
 */
export async function adjustVersion(
  input: In<typeof db.adjustVersion>,
): Promise<RecipeWriteResult<{ runId: string }>> {
  return usesTestStore()
    ? testStore.adjustVersion(input)
    : db.adjustVersion(input);
}

/** A reviewer's answer to Claude's questions queues the next round. */
export async function answerProofreadQuestions(
  input: In<typeof db.answerProofreadQuestions>,
): Promise<RecipeWriteResult<{ runId: string }>> {
  return usesTestStore()
    ? testStore.answerProofreadQuestions(input)
    : db.answerProofreadQuestions(input);
}

/** The worker's only way to a source: a run a reviewer queued, or null. */
export async function claimSourceRun(
  runId: string,
  now?: Date,
): Promise<ClaimedSourceRun | null> {
  return usesTestStore()
    ? testStore.claimSourceRun(runId, now)
    : db.claimSourceRun(runId, now);
}

/** How far a running source run has got; true when the run took it. */
export async function setRunStage(
  runId: string,
  stage: RunStage,
): Promise<boolean> {
  return usesTestStore()
    ? testStore.setRunStage(runId, stage)
    : db.setRunStage(runId, stage);
}

export async function completeSourceRun(
  input: In<typeof db.completeSourceRun>,
): Promise<RecipeWriteResult<{ versionId: string | null }>> {
  return usesTestStore()
    ? testStore.completeSourceRun(input)
    : db.completeSourceRun(input);
}

export async function failRun(
  input: In<typeof db.failRun>,
): Promise<RecipeWriteResult> {
  return usesTestStore() ? testStore.failRun(input) : db.failRun(input);
}

/**
 * A captain asks Claude to proofread the accepted version for another plate
 * count. A count with a result is refused unless `rerun` says so.
 */
export async function queuePlateProofread(
  input: In<typeof db.queuePlateProofread>,
): Promise<RecipeWriteResult<{ runId: string }>> {
  return usesTestStore()
    ? testStore.queuePlateProofread(input)
    : db.queuePlateProofread(input);
}

/** The worker's only way to a plate-count run: one a captain queued, or null. */
export async function claimPlateRun(
  runId: string,
  now?: Date,
): Promise<ClaimedPlateRun | null> {
  return usesTestStore()
    ? testStore.claimPlateRun(runId, now)
    : db.claimPlateRun(runId, now);
}

export async function completePlateRun(
  input: In<typeof db.completePlateRun>,
): Promise<RecipeWriteResult> {
  return usesTestStore()
    ? testStore.completePlateRun(input)
    : db.completePlateRun(input);
}

export async function failPlateRun(
  input: In<typeof db.failPlateRun>,
): Promise<RecipeWriteResult> {
  return usesTestStore()
    ? testStore.failPlateRun(input)
    : db.failPlateRun(input);
}

/**
 * Fail runs that cannot still be working (stopped, or queued and never
 * started) and hand their recipes back. There is no cron: each Kitchen page
 * calls this when it loads.
 */
export async function resetStaleRuns(
  now: Date,
  staleAfterMs?: number,
): Promise<{ reset: number }> {
  return usesTestStore()
    ? testStore.resetStaleRuns(now, staleAfterMs)
    : db.resetStaleRuns(now, staleAfterMs);
}

export async function acceptProofread(
  input: In<typeof db.acceptProofread>,
): Promise<RecipeWriteResult<{ versionId: string; version: number }>> {
  return usesTestStore()
    ? testStore.acceptProofread(input)
    : db.acceptProofread(input);
}

export async function addLesson(
  input: In<typeof db.addLesson>,
): Promise<RecipeWriteResult<{ id: string }>> {
  return usesTestStore() ? testStore.addLesson(input) : db.addLesson(input);
}

// --- Reads -------------------------------------------------------------------

/** A recipe's newest source, for the editor. Null when it has none. */
export async function getRecipeSource(
  recipeId: string,
): Promise<RecipeSourceVersion | null> {
  return usesTestStore()
    ? testStore.getRecipeSource(recipeId)
    : db.getRecipeSource(recipeId);
}

/**
 * Every version of a recipe's source, newest first. The member's words: the
 * caller shows them only to the submitter and the Kitchen's reviewers.
 */
export async function listRecipeSources(
  recipeId: string,
): Promise<RecipeSourceHistoryEntry[]> {
  return usesTestStore()
    ? testStore.listRecipeSources(recipeId)
    : db.listRecipeSources(recipeId);
}

/** Where a recipe's newest run stands, for the loading panel. */
export async function getProofreadProgress(
  recipeId: string,
  runId?: string | null,
): Promise<ProofreadProgress | null> {
  return usesTestStore()
    ? testStore.getProofreadProgress(recipeId, runId)
    : db.getProofreadProgress(recipeId, runId);
}

export async function listRecipeBook(): Promise<RecipeBookEntry[]> {
  return usesTestStore() ? testStore.listRecipeBook() : db.listRecipeBook();
}

export async function listMySuggestions(
  userId: string,
): Promise<MySuggestion[]> {
  return usesTestStore()
    ? testStore.listMySuggestions(userId)
    : db.listMySuggestions(userId);
}

export async function listReviewQueue(): Promise<ReviewQueueEntry[]> {
  return usesTestStore() ? testStore.listReviewQueue() : db.listReviewQueue();
}

export async function listReadyToProofread(): Promise<ProofreadCandidate[]> {
  return usesTestStore()
    ? testStore.listReadyToProofread()
    : db.listReadyToProofread();
}

export async function listAwaitingAcceptance(): Promise<AwaitingAcceptance[]> {
  return usesTestStore()
    ? testStore.listAwaitingAcceptance()
    : db.listAwaitingAcceptance();
}

export async function getRecipeDetail(
  recipeId: string,
): Promise<RecipeDetail | null> {
  return usesTestStore()
    ? testStore.getRecipeDetail(recipeId)
    : db.getRecipeDetail(recipeId);
}

/** A version's recipe for one plate count, or null when it has none yet. */
export async function getPlateCount(
  versionId: string,
  plates: number,
): Promise<PlateCountDetail | null> {
  return usesTestStore()
    ? testStore.getPlateCount(versionId, plates)
    : db.getPlateCount(versionId, plates);
}

/** Captains only: the caller gates, and the page shows tokens, never a price. */
export async function listProofreadRuns(
  options: { limit?: number } = {},
): Promise<ProofreadRunRow[]> {
  return usesTestStore()
    ? testStore.listProofreadRuns(options)
    : db.listProofreadRuns(options);
}

export async function proofreadTokenTotals(now: Date): Promise<TokenTotals> {
  return usesTestStore()
    ? testStore.proofreadTokenTotals(now)
    : db.proofreadTokenTotals(now);
}

/**
 * The recipe's newest run on the recipe itself (a source send or an adjust,
 * not a plate count), for the heading's buttons to follow.
 */
export async function getOpenRun(recipeId: string): Promise<OpenRun | null> {
  const progress = await getProofreadProgress(recipeId);
  if (!progress || progress.kind === "plates") return null;
  return {
    runId: progress.runId,
    stage: progress.stage,
    outcome: progress.outcome,
    questions: progress.questions,
  };
}
