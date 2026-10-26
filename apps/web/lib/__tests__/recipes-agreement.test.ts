// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PROMPT_VERSIONS } from "@camp404/ai-prompts";
import {
  ANSWER_NEEDED,
  CHANGES_NOTE_NEEDED,
  PLATES_OUT_OF_RANGE,
  RECIPE_TEXT_TOO_LONG,
  REJECT_REASON_NEEDED,
  RERUN_NOTE_MAX,
  RERUN_NOTE_NEEDED,
  sourceFromText,
} from "@camp404/core";
import {
  ADJUST_INSTRUCTION_NEEDED,
  NEVER_STARTED_ERROR,
  NO_AI_CONSENT,
  NOT_A_KITCHEN_REVIEWER,
  NOT_AN_APPROVED_MEMBER,
  NOT_YOUR_SUGGESTION,
  ONLY_A_REVIEWER_SENDS,
  RECIPE_CHANGED,
  RECIPE_DECIDED,
  RECIPE_GONE,
  RUN_STAGES,
  SOURCE_CHANGED,
  TEXT_NEEDED,
  forRecipe,
  plateCountIsBase,
  plateCountReady,
  plateRunOpen,
} from "@camp404/db/recipes";
import {
  KitchenRecipe,
  RECIPE_TEXT_MAX,
  type PlateProofread,
  type SourceProofread,
} from "@camp404/types";
import { useTestDb } from "../../../../packages/db/src/__tests__/_harness";
import { MODELS } from "../anthropic";
import { bothWays, type People } from "./_agreement";

// Recipes (#243), through lib/recipes.ts, on the database and on the E2E
// store: the same people, the same calls, the same answers and refusal
// sentences. The checks both sides apply are one set of functions in
// @camp404/core/recipes; this holds the rest (who may decide and send, the
// compare-and-sets, the worker's claims, the plate counts and the reads)
// equal. The Kitchen lead is this domain's lead; the Finance lead is a lead
// of ANOTHER team, refused. See _agreement.ts.

const mode = vi.hoisted(() => ({ on: false }));
vi.mock("@/lib/test-mode", () => ({
  isE2ETestMode: () => mode.on,
  usesTestStore: () => mode.on,
  TEST_USER_COOKIE: "camp404_test_user",
}));

import { testStore } from "../test-store";
import {
  acceptProofread,
  adjustVersion,
  answerProofreadQuestions,
  claimPlateRun,
  claimSourceRun,
  completePlateRun,
  completeSourceRun,
  decideRecipe,
  failRun,
  getAcceptedVersion,
  getPlateCount,
  getProofreadProgress,
  getRecipeDetail,
  getRecipeSource,
  listAwaitingAcceptance,
  listMySuggestions,
  listProofreadRuns,
  listReadyToProofread,
  listRecipeBook,
  listRecipeSources,
  listReviewQueue,
  proofreadTokenTotals,
  queuePlateProofread,
  queueProofread,
  requestRerun,
  resetStaleRuns,
  resubmitRecipe,
  retypeRecipeText,
  sendSourceForProofreading,
  setRunStage,
  suggestRecipe,
} from "../recipes";

const NOW = new Date("2027-02-10T10:00:00Z");
const LATER = new Date("2027-02-10T10:05:00Z");
const NOBODY = "00000000-0000-4000-8000-000000000000";
const USAGE = { inputTokens: 1_200, outputTokens: 800 };
const PLATES = 45;

const RECIPE = KitchenRecipe.parse({
  title: "Red lentil dhal",
  plates: PLATES,
  ingredients: [
    { name: "Red lentils", category: "legume", quantity: 3, unit: "kg" },
    { name: "Salt", category: "spice", quantity: 2, unit: "tbsp" },
  ],
  steps: [
    { instruction: "Simmer the lentils.", uses: ["Red lentils"] },
    { instruction: "Salt them.", uses: ["Salt"] },
  ],
});

/** Claude's answer with a recipe for the run's plates. */
const WRITTEN: SourceProofread = {
  needsInfo: false,
  questions: [],
  recipe: RECIPE,
  report: { changed: ["Cups to kilograms."], unsure: [] },
  scalingNotes: ["The source serves 4; the lentils are ten times it."],
};

/** Claude's answer with questions instead. */
const QUESTIONS: SourceProofread = {
  needsInfo: true,
  questions: ["How many does the source serve?"],
  recipe: null,
  report: null,
  scalingNotes: [],
};

const PLATE_ANSWER: PlateProofread = {
  lines: [
    {
      name: "Red lentils",
      quantity: 6,
      quantityMax: null,
      unit: "kg",
      note: null,
    },
    { name: "Salt", quantity: 3, quantityMax: null, unit: "tbsp", note: null },
  ],
  pots: 2,
  notes: ["Two pots."],
  report: { changed: [], unsure: [] },
};

const RUN = {
  now: NOW,
  promptVersion: PROMPT_VERSIONS.recipeSource,
  revisionPromptVersion: PROMPT_VERSIONS.recipeSourceRevision,
  model: MODELS.opus,
};

/** A member's suggestion; its id. */
async function suggest(
  submitterId: string,
  options: { aiConsent?: boolean; title?: string } = {},
): Promise<string> {
  const made = await suggestRecipe({
    submitterId,
    title: options.title ?? "Dhal",
    source: "text",
    sourceUrl: null,
    text: "Lentils, salt. Simmer.",
    suitabilityNote: null,
    aiConsent: options.aiConsent ?? true,
    now: NOW,
  });
  if (!made.ok) throw new Error(made.error);
  return made.id;
}

/** A suggestion a captain approved; its id. */
async function approved(p: People, title = "Dhal"): Promise<string> {
  const id = await suggest(p.member, { title });
  const ok = await decideRecipe({
    recipeId: id,
    actorId: p.captain,
    decision: "approve",
  });
  if (!ok.ok) throw new Error(ok.error);
  return id;
}

/** Queue one recipe for proofreading by `actorId`. */
function send(recipeId: string, actorId: string, plates = PLATES) {
  return queueProofread({
    recipeIds: [recipeId],
    actorId,
    note: null,
    plates,
    ...RUN,
  });
}

/** Queue, claim and answer one run with `answer`. */
async function runWith(
  recipeId: string,
  actorId: string,
  answer: SourceProofread,
) {
  const queued = await send(recipeId, actorId);
  if (!queued.ok) throw new Error(queued.error);
  const runId = queued.runIds[0]!;
  const claimed = await claimSourceRun(runId, NOW);
  const completed = await completeSourceRun({
    runId,
    result: answer,
    usage: USAGE,
    now: NOW,
  });
  return { runId, claimed, completed };
}

/** A recipe in the book (approved, sent and written by Claude); its ids. */
async function inBook(p: People) {
  const recipeId = await approved(p);
  const { completed } = await runWith(recipeId, p.kitchenLead, WRITTEN);
  if (!completed.ok || !completed.versionId) {
    throw new Error("The run did not write a version.");
  }
  return { recipeId, versionId: completed.versionId };
}

describe("recipes: the database and the test store agree", () => {
  const h = useTestDb();
  beforeEach(() => {
    mode.on = false;
    testStore.reset();
  });

  it("takes a suggestion and its decision from the right people only", async () => {
    const { db, store } = await bothWays(mode, h, async (p, seed) => {
      const pending = await seed.user("Pending", { approval: "pending" });
      const id = await suggest(p.member);
      const base = {
        submitterId: p.member,
        title: null,
        source: "text" as const,
        sourceUrl: null,
        suitabilityNote: null,
        aiConsent: true,
        now: NOW,
      };
      return {
        mine: await listMySuggestions(p.member),
        queue: await listReviewQueue(),
        noText: await suggestRecipe({ ...base, text: "   " }),
        tooLong: await suggestRecipe({
          ...base,
          text: "x".repeat(RECIPE_TEXT_MAX + 1),
        }),
        unapproved: await suggestRecipe({
          ...base,
          submitterId: pending,
          text: "Rice.",
        }),
        otherLead: await decideRecipe({
          recipeId: id,
          actorId: p.financeLead,
          decision: "approve",
        }),
        member: await decideRecipe({
          recipeId: id,
          actorId: p.member,
          decision: "approve",
        }),
        noReason: await decideRecipe({
          recipeId: id,
          actorId: p.kitchenLead,
          decision: "reject",
          reason: "  ",
        }),
        noReasonGone: await decideRecipe({
          recipeId: NOBODY,
          actorId: p.kitchenLead,
          decision: "reject",
          reason: "",
        }),
        noNote: await decideRecipe({
          recipeId: id,
          actorId: p.kitchenLead,
          decision: "request_changes",
          note: "",
        }),
        changes: await decideRecipe({
          recipeId: id,
          actorId: p.kitchenLead,
          decision: "request_changes",
          note: "Say how many it serves.",
        }),
        notYours: await resubmitRecipe({
          recipeId: id,
          actorId: p.other,
          title: "Dhal",
          text: "Mine.",
          suitabilityNote: null,
          aiConsent: true,
          now: NOW,
        }),
        resubmitted: await resubmitRecipe({
          recipeId: id,
          actorId: p.member,
          title: "Dhal for 4",
          text: "Lentils, salt. Simmer. Serves 4.",
          suitabilityNote: "Vegan",
          aiConsent: true,
          now: NOW,
        }),
        approve: await decideRecipe({
          recipeId: id,
          actorId: p.captain,
          decision: "approve",
        }),
        again: await decideRecipe({
          recipeId: id,
          actorId: p.kitchenLead,
          decision: "approve",
        }),
        gone: await decideRecipe({
          recipeId: NOBODY,
          actorId: p.kitchenLead,
          decision: "approve",
        }),
        afterwards: await listMySuggestions(p.member),
        ready: await listReadyToProofread(),
      };
    });
    expect(db).toMatchObject({
      noText: { ok: false, error: TEXT_NEEDED },
      tooLong: { ok: false, error: RECIPE_TEXT_TOO_LONG },
      unapproved: { ok: false, error: NOT_AN_APPROVED_MEMBER },
      otherLead: { ok: false, error: NOT_A_KITCHEN_REVIEWER },
      member: { ok: false, error: NOT_A_KITCHEN_REVIEWER },
      noReason: { ok: false, error: REJECT_REASON_NEEDED },
      noReasonGone: { ok: false, error: REJECT_REASON_NEEDED },
      noNote: { ok: false, error: CHANGES_NOTE_NEEDED },
      changes: { ok: true },
      notYours: { ok: false, error: NOT_YOUR_SUGGESTION },
      resubmitted: { ok: true },
      approve: { ok: true },
      again: { ok: false, error: RECIPE_DECIDED },
      gone: { ok: false, error: RECIPE_GONE },
    });
    expect(store).toEqual(db);
  });

  it("lets a reviewer retype the text and ask for a re-run, in the database's order", async () => {
    const { db, store } = await bothWays(mode, h, async (p) => {
      const id = await approved(p);
      return {
        otherLead: await retypeRecipeText({
          recipeId: id,
          actorId: p.financeLead,
          text: "Mine now.",
        }),
        blankGone: await retypeRecipeText({
          recipeId: NOBODY,
          actorId: p.kitchenLead,
          text: " ",
        }),
        retyped: await retypeRecipeText({
          recipeId: id,
          actorId: p.kitchenLead,
          text: "Red lentils 300 g, salt. Simmer 20 minutes.",
        }),
        source: await getRecipeSource(id),
        sources: await listRecipeSources(id),
        // The connector's retype names the source version it read.
        staleSource: await retypeRecipeText({
          recipeId: id,
          actorId: p.kitchenLead,
          text: "Lentils, from an older read.",
          expectedSourceVersion:
            ((await getRecipeSource(id))?.version ?? 0) - 1,
        }),
        onSource: await retypeRecipeText({
          recipeId: id,
          actorId: p.kitchenLead,
          text: "Lentils, from the newest read.",
          expectedSourceVersion: (await getRecipeSource(id))?.version ?? 0,
        }),
        afterSource: (await getRecipeSource(id))?.version,
        noNote: await requestRerun({
          recipeId: id,
          actorId: p.kitchenLead,
          note: " ",
        }),
        noNoteGone: await requestRerun({
          recipeId: NOBODY,
          actorId: p.kitchenLead,
          note: "",
        }),
        tooLong: await requestRerun({
          recipeId: id,
          actorId: p.kitchenLead,
          note: "x".repeat(RERUN_NOTE_MAX + 1),
        }),
        member: await requestRerun({
          recipeId: id,
          actorId: p.member,
          note: "Less salt.",
        }),
        asked: await requestRerun({
          recipeId: id,
          actorId: p.kitchenLead,
          note: "Less salt.",
          now: NOW,
        }),
        ready: await listReadyToProofread(),
      };
    });
    expect(db).toMatchObject({
      otherLead: { ok: false, error: NOT_A_KITCHEN_REVIEWER },
      blankGone: { ok: false, error: TEXT_NEEDED },
      retyped: { ok: true },
      staleSource: { ok: false, error: SOURCE_CHANGED },
      onSource: { ok: true },
      noNote: { ok: false, error: RERUN_NOTE_NEEDED },
      noNoteGone: { ok: false, error: RERUN_NOTE_NEEDED },
      tooLong: { ok: false },
      member: { ok: false, error: NOT_A_KITCHEN_REVIEWER },
      asked: { ok: true },
    });
    expect(store).toEqual(db);
  });

  it("sends only a reviewer's batch, and only what the member agreed to send", async () => {
    const { db, store } = await bothWays(mode, h, async (p) => {
      const id = await approved(p);
      const unticked = await suggest(p.other, {
        aiConsent: false,
        title: "Secret stew",
      });
      await decideRecipe({
        recipeId: unticked,
        actorId: p.captain,
        decision: "approve",
      });
      return {
        otherLead: await send(id, p.financeLead),
        member: await send(id, p.member),
        noPlates: await send(id, p.kitchenLead, 0),
        tooMany: await send(id, p.kitchenLead, 501),
        empty: await queueProofread({
          recipeIds: [],
          actorId: p.captain,
          note: null,
          plates: PLATES,
          ...RUN,
        }),
        noConsent: await queueProofread({
          recipeIds: [id, unticked],
          actorId: p.captain,
          note: null,
          plates: PLATES,
          ...RUN,
        }),
        gone: await send(NOBODY, p.captain),
        sent: await send(id, p.kitchenLead),
        twice: await send(id, p.kitchenLead),
        progress: await getProofreadProgress(id),
      };
    });
    expect(db).toMatchObject({
      otherLead: { ok: false, error: ONLY_A_REVIEWER_SENDS },
      member: { ok: false, error: ONLY_A_REVIEWER_SENDS },
      noPlates: { ok: false, error: PLATES_OUT_OF_RANGE },
      tooMany: { ok: false, error: PLATES_OUT_OF_RANGE },
      noConsent: { ok: false, error: forRecipe("Secret stew", NO_AI_CONSENT) },
      gone: { ok: false, error: RECIPE_GONE },
      sent: { ok: true },
      twice: { ok: false },
    });
    expect(store).toEqual(db);
  });

  it("runs a source run through questions and an answer into the book", async () => {
    const { db, store } = await bothWays(mode, h, async (p) => {
      const id = await approved(p);
      const asked = await runWith(id, p.kitchenLead, QUESTIONS);
      const answer = (text: string, actorId = p.kitchenLead) =>
        answerProofreadQuestions({
          recipeId: id,
          runId: asked.runId,
          actorId,
          answer: text,
          ...RUN,
        });
      const noAnswer = await answer("  ");
      const otherLead = await answer("Four.", p.financeLead);
      const answered = await answer("Four, dry lentils.");
      const twice = await answer("Four.");
      if (!answered.ok) throw new Error(answered.error);
      const claimed = await claimSourceRun(answered.runId, NOW);
      const notClaimedTwice = await claimSourceRun(answered.runId, NOW);
      const staged = await setRunStage(answered.runId, RUN_STAGES[1]);
      const progress = await getProofreadProgress(id, answered.runId);
      const written = await completeSourceRun({
        runId: answered.runId,
        result: WRITTEN,
        usage: USAGE,
        now: NOW,
      });
      const completeTwice = await completeSourceRun({
        runId: answered.runId,
        result: WRITTEN,
        usage: USAGE,
        now: NOW,
      });
      return {
        asked,
        noAnswer,
        otherLead,
        answered,
        twice,
        claimed,
        notClaimedTwice,
        staged,
        stagedAfter: await setRunStage(answered.runId, RUN_STAGES[2]),
        progress,
        written,
        completeTwice,
        book: await listRecipeBook(),
        accepted: await getAcceptedVersion(id),
        awaiting: await listAwaitingAcceptance(),
        noAccepted: await getAcceptedVersion(NOBODY),
        unknownRun: await claimSourceRun(NOBODY, NOW),
      };
    });
    expect(db).toMatchObject({
      asked: { completed: { ok: true, versionId: null } },
      noAnswer: { ok: false, error: ANSWER_NEEDED },
      otherLead: { ok: false, error: ONLY_A_REVIEWER_SENDS },
      answered: { ok: true },
      twice: { ok: false, error: RECIPE_CHANGED },
      notClaimedTwice: null,
      staged: true,
      stagedAfter: false,
      written: { ok: true },
      completeTwice: { ok: false, error: RECIPE_CHANGED },
      noAccepted: null,
      unknownRun: null,
    });
    expect(store).toEqual(db);
  });

  it("adjusts a version, fails a run and hands the recipe back", async () => {
    const { db, store } = await bothWays(mode, h, async (p) => {
      const { recipeId, versionId } = await inBook(p);
      const adjust = (instruction: string, actorId = p.kitchenLead) =>
        adjustVersion({
          recipeId,
          versionId,
          actorId,
          instruction,
          plates: PLATES,
          // Later than the run that wrote the book, so the runs sort the
          // same way on both sides.
          now: LATER,
          promptVersion: PROMPT_VERSIONS.recipeAdjust,
          model: MODELS.opus,
        });
      const blank = await adjust("  ");
      const otherLead = await adjust("Less salt.", p.financeLead);
      const gone = await adjustVersion({
        recipeId,
        versionId: NOBODY,
        actorId: p.kitchenLead,
        instruction: "Less salt.",
        plates: PLATES,
        now: NOW,
        promptVersion: PROMPT_VERSIONS.recipeAdjust,
        model: MODELS.opus,
      });
      const queued = await adjust("Less salt.");
      if (!queued.ok) throw new Error(queued.error);
      const notRunning = await failRun({ runId: queued.runId, error: "x" });
      const claimed = await claimSourceRun(queued.runId, LATER);
      const failed = await failRun({
        runId: queued.runId,
        error: "  ",
        usage: USAGE,
        now: LATER,
      });
      return {
        blank,
        otherLead,
        gone,
        queued,
        notRunning,
        claimed,
        failed,
        detail: await getRecipeDetail(recipeId),
        runs: await listProofreadRuns(),
        tokens: await proofreadTokenTotals(NOW),
      };
    });
    expect(db).toMatchObject({
      blank: { ok: false, error: ADJUST_INSTRUCTION_NEEDED },
      otherLead: { ok: false, error: ONLY_A_REVIEWER_SENDS },
      gone: { ok: false },
      queued: { ok: true },
      notRunning: { ok: false, error: RECIPE_CHANGED },
      failed: { ok: true },
    });
    expect(store).toEqual(db);
  });

  it("proofreads another plate count once, unless a re-run is asked for", async () => {
    const { db, store } = await bothWays(mode, h, async (p) => {
      const { recipeId, versionId } = await inBook(p);
      const plates = (count: number, rerun = false, actorId = p.captain) =>
        queuePlateProofread({
          recipeId,
          versionId,
          plates: count,
          rerun,
          actorId,
          now: NOW,
          promptVersion: PROMPT_VERSIONS.recipePlates,
          model: MODELS.opus,
        });
      const base = await plates(PLATES);
      const otherLead = await plates(90, false, p.financeLead);
      const outOfRange = await plates(0);
      const queued = await plates(90, false, p.kitchenLead);
      const open = await plates(90);
      if (!queued.ok) throw new Error(queued.error);
      const claimed = await claimPlateRun(queued.runId, NOW);
      const completed = await completePlateRun({
        runId: queued.runId,
        result: PLATE_ANSWER,
        usage: USAGE,
        now: NOW,
      });
      return {
        base,
        otherLead,
        outOfRange,
        queued,
        open,
        claimed,
        completed,
        count: await getPlateCount(versionId, 90),
        none: await getPlateCount(versionId, 120),
        ready: await plates(90),
        rerun: await plates(90, true),
      };
    });
    expect(db).toMatchObject({
      base: { ok: false, error: plateCountIsBase(PLATES) },
      otherLead: { ok: false, error: ONLY_A_REVIEWER_SENDS },
      outOfRange: { ok: false, error: PLATES_OUT_OF_RANGE },
      queued: { ok: true },
      open: { ok: false, error: plateRunOpen(90) },
      completed: { ok: true },
      none: null,
      ready: { ok: false, error: plateCountReady(90) },
      rerun: { ok: true },
    });
    expect(store).toEqual(db);
  });

  it("resets a run that never started, sends a changed source, and refuses an old draft", async () => {
    const { db, store } = await bothWays(mode, h, async (p) => {
      const id = await approved(p);
      const queued = await send(id, p.kitchenLead);
      const later = new Date(NOW.getTime() + 60 * 60_000);
      const reset = await resetStaleRuns(later);
      const progress = await getProofreadProgress(id);
      const latest = await getRecipeSource(id);
      const sections = sourceFromText(
        "Ingredients\nRed lentils 300 g\nSalt\n\nMethod\nSimmer 20 minutes.",
      );
      const sendSource = (basedOnSourceId: string | null, actorId: string) =>
        sendSourceForProofreading({
          recipeId: id,
          actorId,
          basedOnSourceId,
          serves: 4,
          sections,
          plates: PLATES,
          ...RUN,
        });
      return {
        queued,
        reset,
        progress,
        otherLead: await sendSource(latest!.id, p.financeLead),
        stale: await sendSource(NOBODY, p.kitchenLead),
        sentSource: await sendSource(latest!.id, p.kitchenLead),
        sources: await listRecipeSources(id),
        noDraft: await acceptProofread({
          recipeId: id,
          runId: NOBODY,
          actorId: p.kitchenLead,
        }),
        otherLeadAccepts: await acceptProofread({
          recipeId: id,
          runId: NOBODY,
          actorId: p.financeLead,
        }),
      };
    });
    expect(db).toMatchObject({
      queued: { ok: true },
      reset: { reset: 1 },
      progress: { outcome: "failed", error: NEVER_STARTED_ERROR },
      otherLead: { ok: false, error: ONLY_A_REVIEWER_SENDS },
      stale: { ok: false },
      sentSource: { ok: true },
      noDraft: { ok: false, error: RECIPE_CHANGED },
      otherLeadAccepts: { ok: false, error: NOT_A_KITCHEN_REVIEWER },
    });
    expect(store).toEqual(db);
  });
});
