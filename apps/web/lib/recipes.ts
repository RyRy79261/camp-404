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
import { testStore } from "./test-store";
import { twin } from "./twin";

// Recipes (#243), from the database or, under E2E, the test store's twin. The
// checks both sides apply (the plates, a decision's reason, a re-run note, an
// adjust instruction, an answer, the text's length, the statuses a run may be
// queued from) are one set of functions in @camp404/core/recipes;
// lib/__tests__/recipes-agreement.test.ts holds the rest equal. Every write
// re-checks the actor itself, so a caller passes only who is acting, never
// their rank or their teams.

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

const recipes = twin(db, testStore, [
  "suggestRecipe",
  "resubmitRecipe",
  "decideRecipe",
  "retypeRecipeText",
  "requestRerun",
  "queueProofread",
  "sendSourceForProofreading",
  "adjustVersion",
  "answerProofreadQuestions",
  "claimSourceRun",
  "setRunStage",
  "completeSourceRun",
  "failRun",
  "queuePlateProofread",
  "claimPlateRun",
  "completePlateRun",
  "failPlateRun",
  "resetStaleRuns",
  "acceptProofread",
  "addLesson",
  "getRecipeSource",
  "listRecipeSources",
  "getProofreadProgress",
  "listRecipeBook",
  "listMySuggestions",
  "listReviewQueue",
  "listReadyToProofread",
  "listAwaitingAcceptance",
  "getRecipeDetail",
  "getAcceptedVersion",
  "getPlateCount",
  "listProofreadRuns",
  "proofreadTokenTotals",
]);

// --- Writes ------------------------------------------------------------------

export const suggestRecipe = recipes.suggestRecipe;
export const resubmitRecipe = recipes.resubmitRecipe;
export const decideRecipe = recipes.decideRecipe;
export const retypeRecipeText = recipes.retypeRecipeText;
export const requestRerun = recipes.requestRerun;
export const queueProofread = recipes.queueProofread;
/**
 * "Send for proofreading" from the source editor: a new source version when
 * the content changed, then the run, in one transaction.
 */
export const sendSourceForProofreading = recipes.sendSourceForProofreading;
/**
 * "Adjust with Claude": an adjust run on one version, with what should
 * change, queued in one transaction with its audit row.
 */
export const adjustVersion = recipes.adjustVersion;
/** A reviewer's answer to Claude's questions queues the next round. */
export const answerProofreadQuestions = recipes.answerProofreadQuestions;
/** The worker's only way to a source: a run a reviewer queued, or null. */
export const claimSourceRun = recipes.claimSourceRun;
/** How far a running source run has got; true when the run took it. */
export const setRunStage = recipes.setRunStage;
export const completeSourceRun = recipes.completeSourceRun;
export const failRun = recipes.failRun;
/**
 * A captain asks Claude to proofread the accepted version for another plate
 * count. A count with a result is refused unless `rerun` says so.
 */
export const queuePlateProofread = recipes.queuePlateProofread;
/** The worker's only way to a plate-count run: one a captain queued, or null. */
export const claimPlateRun = recipes.claimPlateRun;
export const completePlateRun = recipes.completePlateRun;
export const failPlateRun = recipes.failPlateRun;
/**
 * Fail runs that cannot still be working (stopped, or queued and never
 * started) and hand their recipes back. There is no cron: each Kitchen page
 * calls this when it loads.
 */
export const resetStaleRuns = recipes.resetStaleRuns;
export const acceptProofread = recipes.acceptProofread;
export const addLesson = recipes.addLesson;

// --- Reads -------------------------------------------------------------------

/** A recipe's newest source, for the editor. Null when it has none. */
export const getRecipeSource = recipes.getRecipeSource;
/**
 * Every version of a recipe's source, newest first. The member's words: the
 * caller shows them only to the submitter and the Kitchen's reviewers.
 */
export const listRecipeSources = recipes.listRecipeSources;
/** Where a recipe's newest run stands, for the loading panel. */
export const getProofreadProgress = recipes.getProofreadProgress;
export const listRecipeBook = recipes.listRecipeBook;
export const listMySuggestions = recipes.listMySuggestions;
export const listReviewQueue = recipes.listReviewQueue;
export const listReadyToProofread = recipes.listReadyToProofread;
export const listAwaitingAcceptance = recipes.listAwaitingAcceptance;
export const getRecipeDetail = recipes.getRecipeDetail;
/** Only the recipe's accepted version: for pages that print many recipes. */
export const getAcceptedVersion = recipes.getAcceptedVersion;
/** A version's recipe for one plate count, or null when it has none yet. */
export const getPlateCount = recipes.getPlateCount;
/** Captains only: the caller gates, and the page shows tokens, never a price. */
export const listProofreadRuns = recipes.listProofreadRuns;
export const proofreadTokenTotals = recipes.proofreadTokenTotals;

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
