import Anthropic from "@anthropic-ai/sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The recipe worker (#243): Claude reads a recipe's source and either asks
// what it needs to know or writes the recipe, saved straight into the book.
// No test here reaches Anthropic: the client is mocked, and the data goes to
// the in-memory test store (test mode is mocked so the store is on while the
// E2E stand-in answer is off), so each case checks the recipe's real state
// after the run.
//
//  1. A good reply is stored with the tokens the response reported, and the
//     run moves through sending, reading, checking and saving, in order.
//  2. Questions hand the recipe back with them on the run; an answered round
//     carries the whole exchange to Claude.
//  3. A malformed reply, a model error or a timeout hands the recipe back to
//     `approved` with a short sentence, and nothing throws.
//  4. There is no retry: one run, one call, whatever the error.
//  5. The worker calls Claude only for a run a reviewer queued, named by id:
//     there is no cron and no "take the next one".
//  6. Under E2E_TEST_MODE Claude is never called, and each stage is held for
//     TEST_MODE_STAGE_MS so Playwright can see it.

vi.mock("@/lib/anthropic", () => ({
  anthropic: vi.fn(),
  MODELS: { opus: "claude-opus-4-8", haiku: "claude-haiku-4-5-20251001" },
}));
vi.mock("@/lib/test-mode", () => ({
  isE2ETestMode: vi.fn(() => false),
  usesTestStore: vi.fn(() => true),
}));

import {
  recipeAdjustPrompt,
  recipePlatesPrompt,
  recipeSourcePrompt,
  recipeSourceRevisionPrompt,
} from "@camp404/ai-prompts";
import {
  RecipeDraft,
  SourceProofread,
  type PlateProofread,
} from "@camp404/types";
import { anthropic } from "@/lib/anthropic";
import { isE2ETestMode } from "@/lib/test-mode";
import { testStore } from "@/lib/test-store";
import {
  PLATES_TOOL,
  PLATE_LINES_MISMATCH,
  SOURCE_TOOL,
  TEST_MODE_STAGE_MS,
  TEST_MODE_USAGE,
  processRuns,
  proofreadSourceClaim,
  testModeAdjust,
  testModeSource,
} from "@/lib/recipe-proofread";

const NOW = new Date("2026-09-24T10:00:00Z");

const RECIPE = RecipeDraft.parse({
  recipe: {
    title: "Red lentil dhal",
    plates: 45,
    ingredients: [
      { name: "Red lentils", category: "legume", quantity: 3, unit: "kg" },
    ],
    steps: [{ phase: "Cook", instruction: "Simmer.", uses: ["Red lentils"] }],
  },
  report: { changed: [], unsure: ["The salt."] },
});

const RESULT: SourceProofread = {
  needsInfo: false,
  questions: [],
  recipe: RECIPE.recipe,
  report: RECIPE.report,
  scalingNotes: ["The source serves 4; the salt grew more slowly."],
};

const QUESTIONS: SourceProofread = {
  needsInfo: true,
  questions: ['How much coconut milk? The source says "some".'],
  recipe: null,
  report: null,
  scalingNotes: [],
};

function captainAndRecipe(status: "suggested" | "approved" = "approved") {
  const captain = testStore.createUser({
    authUserId: "auth-cap",
    displayName: "Nomvula Dlamini",
    inviteCode: "seeded",
    rank: "captain",
  });
  const made = testStore.suggestRecipe({
    submitterId: captain.id,
    title: "Dhal",
    source: "text",
    sourceUrl: "https://example.com/dhal",
    text: "Lentils, salt. Simmer.",
    suitabilityNote: "SECRET-SUITABILITY-NOTE",
    aiConsent: true,
    now: NOW,
  });
  if (!made.ok) throw new Error(made.error);
  if (status === "approved") {
    const decided = testStore.decideRecipe({
      recipeId: made.id,
      actorId: captain.id,
      decision: "approve",
    });
    if (!decided.ok) throw new Error(decided.error);
  }
  return { captainId: captain.id, recipeId: made.id };
}

function queue(
  captainId: string,
  recipeId: string,
  note: string | null = null,
) {
  const queued = testStore.queueProofread({
    recipeIds: [recipeId],
    actorId: captainId,
    note,
    plates: 45,
    now: new Date(),
    promptVersion: "2026-09-24.1",
    model: "claude-opus-4-8",
  });
  if (!queued.ok) throw new Error(queued.error);
  return queued.runIds[0]!;
}

function claudeAnswers(response: unknown) {
  const create = vi.fn(async () => response);
  vi.mocked(anthropic).mockReturnValue({ messages: { create } } as never);
  return create;
}

function claudeThrows(error: unknown) {
  const create = vi.fn(async () => {
    throw error;
  });
  vi.mocked(anthropic).mockReturnValue({ messages: { create } } as never);
  return create;
}

const toolReply = (input: unknown) => ({
  content: [{ type: "tool_use", id: "t1", name: SOURCE_TOOL.name, input }],
  stop_reason: "tool_use",
  usage: { input_tokens: 5_000, output_tokens: 3_000 },
});

const recipe = (id: string) => testStore.getRecipeDetail(id);
const run = (id: string) =>
  testStore.listProofreadRuns({}).find((r) => r.id === id);

/**
 * Every stage the run row holds, in the order it was written: after the
 * claim, and after each move. Read from the store, not from the worker.
 */
function watchStages(recipeId: string): string[] {
  const seen: string[] = [];
  const note = () => {
    const stage = testStore.getProofreadProgress(recipeId)?.stage;
    if (stage && seen[seen.length - 1] !== stage) seen.push(stage);
  };
  const claim = testStore.claimSourceRun.bind(testStore);
  vi.spyOn(testStore, "claimSourceRun").mockImplementation((...args) => {
    const claimed = claim(...args);
    note();
    return claimed;
  });
  const move = testStore.setRunStage.bind(testStore);
  vi.spyOn(testStore, "setRunStage").mockImplementation((...args) => {
    const moved = move(...args);
    note();
    return moved;
  });
  return seen;
}

beforeEach(() => {
  testStore.reset();
  vi.clearAllMocks();
  vi.mocked(isE2ETestMode).mockReturnValue(false);
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("processRuns with a queued source run", () => {
  it("saves Claude's recipe straight into the book, with the tokens and the stages in order", async () => {
    const { captainId, recipeId } = captainAndRecipe();
    const runId = queue(captainId, recipeId, "Use tinned tomatoes.");
    const stages = watchStages(recipeId);
    let stageAtCall: string | null | undefined;
    const create = vi.fn(async () => {
      stageAtCall = testStore.getProofreadProgress(recipeId)?.stage;
      return toolReply(RESULT);
    });
    vi.mocked(anthropic).mockReturnValue({ messages: { create } } as never);

    expect(await processRuns({ runIds: [runId] })).toEqual({
      processed: 1,
      succeeded: 1,
      failed: 0,
    });

    expect(stages).toEqual(["sending", "reading", "checking", "saving"]);
    expect(stageAtCall).toBe("reading");
    const detail = recipe(recipeId);
    expect(detail?.status).toBe("accepted");
    expect(detail?.currentVersion).toMatchObject({
      version: 1,
      plates: 45,
      recipe: RESULT.recipe,
      report: RESULT.report,
      scalingNotes: RESULT.scalingNotes,
    });
    expect(run(runId)).toMatchObject({
      outcome: "succeeded",
      inputTokens: 5_000,
      outputTokens: 3_000,
    });

    // One call, the pinned model, the forced tool, no retries, 240 s.
    expect(create).toHaveBeenCalledTimes(1);
    const [body, options] = create.mock.calls[0] as unknown as [
      Record<string, unknown>,
      Record<string, unknown>,
    ];
    expect(body).toMatchObject({
      model: "claude-opus-4-8",
      max_tokens: 16_000,
      system: recipeSourcePrompt.system,
      tools: [SOURCE_TOOL],
      tool_choice: { type: "tool", name: SOURCE_TOOL.name },
    });
    expect(options).toEqual({ timeout: 240_000, maxRetries: 0 });
    expect(body.messages).toEqual([
      {
        role: "user",
        content: recipeSourcePrompt.user({
          title: "Dhal",
          source: "## Steps\nLentils, salt. Simmer.",
          serves: null,
          plates: 45,
          kitchen: {
            platesBreakfast: null,
            platesLunch: null,
            platesDinner: null,
          },
          note: "Use tinned tomatoes.",
          exchange: [],
        }),
      },
    ]);
  });

  it("revises a recipe already in the book: the revision prompt, with the accepted version and the meal plan's plates", async () => {
    const { captainId, recipeId } = captainAndRecipe();
    const seeded = testStore.seedAcceptedVersion({
      recipeId,
      authorId: captainId,
      recipe: RECIPE.recipe,
    });
    expect(
      testStore.setMealPlan({
        actorId: captainId,
        daysOnSite: 1,
        days: [{ breakfast: 30, lunch: 0, dinner: 45 }],
        expectedVersion: 0,
      }).ok,
    ).toBe(true);
    const queued = testStore.queueProofread({
      recipeIds: [recipeId],
      actorId: captainId,
      note: null,
      plates: 45,
      now: new Date(),
      promptVersion: "2026-09-24.1",
      revisionPromptVersion: "revision-1",
      model: "claude-opus-4-8",
    });
    if (!queued.ok) throw new Error(queued.error);
    const create = claudeAnswers(toolReply(RESULT));
    await processRuns({ runIds: queued.runIds });

    const [body] = create.mock.calls[0] as unknown as [Record<string, unknown>];
    expect(body.system).toBe(recipeSourceRevisionPrompt.system);
    expect(body.messages).toEqual([
      {
        role: "user",
        content: recipeSourceRevisionPrompt.user({
          // The book's version named the recipe.
          title: "Red lentil dhal",
          source: "## Steps\nLentils, salt. Simmer.",
          serves: null,
          plates: 45,
          kitchen: {
            platesBreakfast: 30,
            platesLunch: null,
            platesDinner: 45,
          },
          note: null,
          exchange: [],
          previous: {
            version: seeded.version,
            recipe: RECIPE.recipe,
            exchange: [],
          },
        }),
      },
    ]);
    expect(run(queued.runIds[0]!)?.promptVersion).toBe("revision-1");
    expect(recipe(recipeId)?.currentVersion?.version).toBe(2);
  });

  it("never sends the member's note on why it suits the camp, the link or a name", async () => {
    const { captainId, recipeId } = captainAndRecipe();
    const runId = queue(captainId, recipeId);
    const create = claudeAnswers(toolReply(RESULT));
    await processRuns({ runIds: [runId] });
    const sent = JSON.stringify(create.mock.calls[0]);
    expect(sent).not.toContain("SECRET-SUITABILITY-NOTE");
    expect(sent).not.toContain("Nomvula");
    expect(sent).not.toContain("example.com");
  });

  it("hands the recipe back with Claude's questions, then sends the answered round with the whole exchange", async () => {
    const { captainId, recipeId } = captainAndRecipe();
    const runId = queue(captainId, recipeId);
    const stages = watchStages(recipeId);
    claudeAnswers(toolReply(QUESTIONS));

    expect(await processRuns({ runIds: [runId] })).toMatchObject({
      succeeded: 1,
    });
    expect(stages).toEqual(["sending", "reading", "checking", "saving"]);
    expect(recipe(recipeId)).toMatchObject({
      status: "approved",
      acceptedVersionId: null,
      lastError: null,
      latestRun: { id: runId, questions: QUESTIONS.questions },
    });
    expect(testStore.getProofreadProgress(recipeId)).toMatchObject({
      outcome: "succeeded",
      questions: QUESTIONS.questions,
    });
    expect(run(runId)).toMatchObject({ inputTokens: 5_000 });

    const answered = testStore.answerProofreadQuestions({
      recipeId,
      runId,
      actorId: captainId,
      answer: "Two 400 ml tins.",
      now: new Date(),
      promptVersion: "2026-09-24.1",
      model: "claude-opus-4-8",
    });
    if (!answered.ok) throw new Error(answered.error);
    const create = claudeAnswers(toolReply(RESULT));
    expect(await processRuns({ runIds: [answered.runId] })).toMatchObject({
      succeeded: 1,
    });
    const [body] = create.mock.calls[0] as unknown as [
      { messages: { content: string }[] },
    ];
    expect(body.messages[0]!.content).toContain(
      `Round 1:\n<questions>\n- ${QUESTIONS.questions[0]}\n</questions>\n<answer>\nTwo 400 ml tins.\n</answer>`,
    );
    expect(recipe(recipeId)?.status).toBe("accepted");
  });

  it("hands the recipe back on a malformed reply, keeps the tokens, stops at checking, and does not throw", async () => {
    const { captainId, recipeId } = captainAndRecipe();
    const runId = queue(captainId, recipeId);
    const stages = watchStages(recipeId);
    const create = claudeAnswers(
      toolReply({
        ...RESULT,
        recipe: {
          ...RESULT.recipe,
          ingredients: [{ name: "Lentils", unit: "oz" }],
        },
      }),
    );

    expect(await processRuns({ runIds: [runId] })).toEqual({
      processed: 1,
      succeeded: 0,
      failed: 1,
    });
    expect(create).toHaveBeenCalledTimes(1);
    expect(stages).toEqual(["sending", "reading", "checking"]);
    const detail = recipe(recipeId);
    expect(detail?.status).toBe("approved");
    expect(detail?.lastError).toMatch(
      /^Claude's answer did not match the recipe shape \(at recipe\.ingredients\.0\./,
    );
    expect(run(runId)).toMatchObject({
      outcome: "failed",
      inputTokens: 5_000,
      outputTokens: 3_000,
    });
  });

  it("fails questions with a recipe beside them, which the contract refuses", async () => {
    const { captainId, recipeId } = captainAndRecipe();
    const runId = queue(captainId, recipeId);
    claudeAnswers(toolReply({ ...RESULT, needsInfo: true, questions: ["?"] }));
    expect(await processRuns({ runIds: [runId] })).toMatchObject({
      failed: 1,
    });
    expect(recipe(recipeId)).toMatchObject({
      status: "approved",
      lastError: "Claude's answer did not match the recipe shape (at recipe).",
    });
  });

  it("fails a recipe written for other plates than the reviewer asked for, and keeps the tokens", async () => {
    const { captainId, recipeId } = captainAndRecipe();
    const runId = queue(captainId, recipeId);
    const stages = watchStages(recipeId);
    // The source said "serves 4"; the reviewer asked for 45.
    claudeAnswers(
      toolReply({ ...RESULT, recipe: { ...RESULT.recipe, plates: 4 } }),
    );
    expect(await processRuns({ runIds: [runId] })).toMatchObject({
      succeeded: 0,
      failed: 1,
    });
    expect(recipe(recipeId)).toMatchObject({
      status: "approved",
      lastError: "Claude wrote the recipe for 4 plates, not the 45 asked for.",
    });
    // Refused while checking: it never reaches the write.
    expect(stages).toEqual(["sending", "reading", "checking"]);
    expect(run(runId)).toMatchObject({
      outcome: "failed",
      inputTokens: 5_000,
      outputTokens: 3_000,
    });
  });

  it("fails a reply whose step uses a line the recipe does not have, saying where", async () => {
    const { captainId, recipeId } = captainAndRecipe();
    const runId = queue(captainId, recipeId);
    claudeAnswers(
      toolReply({
        ...RESULT,
        recipe: {
          ...RESULT.recipe,
          steps: [{ instruction: "Simmer.", uses: ["Red lentils", "Cumin"] }],
        },
      }),
    );
    expect(await processRuns({ runIds: [runId] })).toMatchObject({
      failed: 1,
    });
    expect(recipe(recipeId)).toMatchObject({
      status: "approved",
      lastError:
        "Claude's answer did not match the recipe shape (at recipe.steps.0.uses.1).",
    });
  });

  it("fails the run with the write's own sentence when the store refuses the answer", async () => {
    const { captainId, recipeId } = captainAndRecipe();
    const runId = queue(captainId, recipeId);
    claudeAnswers(toolReply(RESULT));
    vi.spyOn(testStore, "completeSourceRun").mockReturnValueOnce({
      ok: false,
      error: "This recipe changed since you opened it. Reload the page.",
    });
    expect(await processRuns({ runIds: [runId] })).toMatchObject({
      failed: 1,
    });
    expect(recipe(recipeId)).toMatchObject({
      status: "approved",
      lastError: "This recipe changed since you opened it. Reload the page.",
    });
    expect(run(runId)).toMatchObject({ outcome: "failed", inputTokens: 5_000 });
  });

  it("hands the recipe back when there is no tool call, and says a cut-off answer was cut off", async () => {
    const { captainId, recipeId } = captainAndRecipe();
    const runId = queue(captainId, recipeId);
    claudeAnswers({
      content: [{ type: "text", text: "Here is your recipe..." }],
      stop_reason: "max_tokens",
      usage: { input_tokens: 4_000, output_tokens: 16_000 },
    });
    await processRuns({ runIds: [runId] });
    expect(recipe(recipeId)).toMatchObject({
      status: "approved",
      lastError: "Claude's answer was cut off before it finished.",
    });
    expect(run(runId)?.outputTokens).toBe(16_000);
  });

  it("calls Claude once on a model error: no retry, a plain sentence, no SDK body, and no checking", async () => {
    const { captainId, recipeId } = captainAndRecipe();
    const runId = queue(captainId, recipeId);
    const stages = watchStages(recipeId);
    const create = claudeThrows(
      new Anthropic.RateLimitError(
        429,
        { type: "error", error: { type: "rate_limit_error", message: "x" } },
        "429 rate_limit_error SDK-BODY",
        new Headers(),
      ),
    );

    const report = await processRuns({ runIds: [runId] });
    expect(report).toEqual({ processed: 1, succeeded: 0, failed: 1 });
    expect(create).toHaveBeenCalledTimes(1);
    expect(stages).toEqual(["sending", "reading"]);
    const detail = recipe(recipeId);
    expect(detail?.status).toBe("approved");
    expect(detail?.lastError).toBe(
      "Claude was too busy to take the run (rate limited). Nothing was retried.",
    );
    expect(detail?.lastError).not.toContain("SDK-BODY");
    expect(run(runId)).toMatchObject({ outcome: "failed", inputTokens: null });
  });

  it("says a timeout was a timeout", async () => {
    const { captainId, recipeId } = captainAndRecipe();
    const runId = queue(captainId, recipeId);
    const create = claudeThrows(new Anthropic.APIConnectionTimeoutError());
    await processRuns({ runIds: [runId] });
    expect(create).toHaveBeenCalledTimes(1);
    expect(recipe(recipeId)?.lastError).toBe(
      "Claude took too long to answer, so the run stopped. Nothing was retried.",
    );
  });

  it("says so when the key is not set, and still does not throw", async () => {
    const { captainId, recipeId } = captainAndRecipe();
    const runId = queue(captainId, recipeId);
    vi.mocked(anthropic).mockImplementation(() => {
      throw new Error("ANTHROPIC_API_KEY is not set");
    });
    await expect(processRuns({ runIds: [runId] })).resolves.toMatchObject({
      failed: 1,
    });
    expect(recipe(recipeId)).toMatchObject({
      status: "approved",
      lastError:
        "Proofreading is not set up: ANTHROPIC_API_KEY is not set. Nothing was sent.",
    });
  });

  it("sends nothing for a claimed run that was reset before it could be read", async () => {
    const { captainId, recipeId } = captainAndRecipe();
    const runId = queue(captainId, recipeId);
    const claim = testStore.claimSourceRun(runId, new Date());
    if (!claim) throw new Error("not claimed");
    testStore.failRun({ runId, error: "The run stopped before it finished." });
    const create = claudeAnswers(toolReply(RESULT));
    expect(await proofreadSourceClaim(claim)).toBe("failed");
    expect(create).not.toHaveBeenCalled();
    expect(recipe(recipeId)?.currentVersion).toBeNull();
  });
});

describe("the worker only touches what a reviewer queued", () => {
  it("never calls Claude when no run is named", async () => {
    const create = claudeAnswers(toolReply(RESULT));
    captainAndRecipe("suggested");
    captainAndRecipe("approved");
    expect(await processRuns({ runIds: [] })).toEqual({
      processed: 0,
      succeeded: 0,
      failed: 0,
    });
    expect(create).not.toHaveBeenCalled();
    expect(anthropic).not.toHaveBeenCalled();
  });

  it("never calls Claude again for a run it has done, or for an unknown one", async () => {
    const { captainId, recipeId } = captainAndRecipe();
    const runId = queue(captainId, recipeId);
    claudeAnswers(toolReply(RESULT));
    await processRuns({ runIds: [runId] }); // now accepted
    expect(recipe(recipeId)?.status).toBe("accepted");

    const create = claudeAnswers(toolReply(RESULT));
    expect(
      await processRuns({ runIds: [runId, crypto.randomUUID()] }),
    ).toMatchObject({ processed: 0 });
    expect(create).not.toHaveBeenCalled();
  });

  it("proofreads a reviewer's batch at the same time, so it fits in one function's time limit", async () => {
    const a = captainAndRecipe();
    const second = testStore.suggestRecipe({
      submitterId: a.captainId,
      title: "Chakalaka",
      source: "text",
      sourceUrl: null,
      text: "Beans, peppers.",
      suitabilityNote: null,
      aiConsent: true,
      now: NOW,
    });
    if (!second.ok) throw new Error(second.error);
    testStore.decideRecipe({
      recipeId: second.id,
      actorId: a.captainId,
      decision: "approve",
    });
    const queued = testStore.queueProofread({
      recipeIds: [a.recipeId, second.id],
      actorId: a.captainId,
      note: null,
      plates: 45,
      now: new Date(),
      promptVersion: "2026-09-24.1",
      model: "claude-opus-4-8",
    });
    if (!queued.ok) throw new Error(queued.error);

    let inFlight = 0;
    let most = 0;
    const create = vi.fn(async () => {
      inFlight += 1;
      most = Math.max(most, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 20));
      inFlight -= 1;
      return toolReply(RESULT);
    });
    vi.mocked(anthropic).mockReturnValue({ messages: { create } } as never);

    expect(await processRuns({ runIds: queued.runIds })).toEqual({
      processed: 2,
      succeeded: 2,
      failed: 0,
    });
    expect(create).toHaveBeenCalledTimes(2);
    expect(most).toBe(2);
  });
});

describe("under E2E_TEST_MODE", () => {
  it("never calls Anthropic, holds each stage for TEST_MODE_STAGE_MS on the run row, and saves the stand-in", async () => {
    vi.useFakeTimers();
    vi.mocked(isE2ETestMode).mockReturnValue(true);
    const { captainId, recipeId } = captainAndRecipe();
    const runId = queue(captainId, recipeId);
    const stage = () => testStore.getProofreadProgress(recipeId)?.stage;

    const done = processRuns({ runIds: [runId] });
    await vi.advanceTimersByTimeAsync(0);
    expect(stage()).toBe("sending");
    await vi.advanceTimersByTimeAsync(TEST_MODE_STAGE_MS - 1);
    expect(stage()).toBe("sending");
    await vi.advanceTimersByTimeAsync(1);
    expect(stage()).toBe("reading");
    await vi.advanceTimersByTimeAsync(TEST_MODE_STAGE_MS);
    expect(stage()).toBe("checking");
    await vi.advanceTimersByTimeAsync(TEST_MODE_STAGE_MS);
    expect(stage()).toBe("saving");
    expect(recipe(recipeId)?.status).toBe("analysing");
    await vi.advanceTimersByTimeAsync(TEST_MODE_STAGE_MS);
    expect(await done).toMatchObject({ succeeded: 1 });

    expect(anthropic).not.toHaveBeenCalled();
    const detail = recipe(recipeId);
    expect(detail?.status).toBe("accepted");
    // A fixed "Camp dal" written for the run's plates.
    expect(detail?.currentVersion).toMatchObject({
      plates: 45,
      recipe: { title: "Camp dal", plates: 45 },
      scalingNotes: [
        "Lentils, onions and coconut milk were scaled in step with the plates.",
        "Salt and cumin were scaled more slowly than the lentils.",
      ],
    });
    expect(run(runId)).toMatchObject({
      outcome: "succeeded",
      inputTokens: TEST_MODE_USAGE.inputTokens,
      outputTokens: TEST_MODE_USAGE.outputTokens,
    });
  });
});

describe("testModeSource", () => {
  const claim = { sourceText: "## Steps\nSimmer.", exchange: [], plates: 120 };

  it("is a valid Camp dal at the claim's plates, with categories, phases, uses, a note and scaling notes", () => {
    const answer = testModeSource(claim);
    expect(SourceProofread.safeParse(answer).success).toBe(true);
    expect(answer.needsInfo).toBe(false);
    const written = answer.recipe!;
    expect(written.plates).toBe(120);
    expect(
      new Set(written.ingredients.map((l) => l.category)).size,
    ).toBeGreaterThanOrEqual(3);
    expect(new Set(written.steps.map((s) => s.phase)).size).toBe(2);
    expect(written.steps.every((s) => s.uses.length > 0)).toBe(true);
    expect(written.notes).toHaveLength(1);
    expect(answer.scalingNotes).toEqual([
      "Lentils, onions and coconut milk were scaled in step with the plates.",
      "Salt and cumin were scaled more slowly than the lentils.",
    ]);
    // Nothing a page shows says it came from a stand-in.
    expect(answer.report).toEqual({ changed: [], unsure: [] });
    expect(JSON.stringify(answer)).not.toMatch(/test mode|not called/i);
  });

  it("asks two questions about a source that says `some`, until it has an answer", () => {
    const vague = {
      ...claim,
      sourceText: "## Ingredients\n- Some coconut milk",
    };
    expect(testModeSource(vague)).toEqual({
      needsInfo: true,
      questions: [
        'How much coconut milk? The source says "some".',
        "Is the cumin ground or whole?",
      ],
      recipe: null,
      report: null,
      scalingNotes: [],
    });
    expect(
      testModeSource({
        ...vague,
        exchange: [{ questions: ["How much?"], answer: "Two tins." }],
      }).needsInfo,
    ).toBe(false);
    // A word that only contains it is no question.
    expect(
      testModeSource({ ...claim, sourceText: "A handsome dal." }).needsInfo,
    ).toBe(false);
  });
});

describe("an adjust run", () => {
  /** A recipe in the book at version 1 (45 plates), from a first run. */
  async function inTheBook() {
    const { captainId, recipeId } = captainAndRecipe();
    claudeAnswers(toolReply(RESULT));
    await processRuns({ runIds: [queue(captainId, recipeId)] });
    const detail = recipe(recipeId)!;
    return { captainId, recipeId, versionId: detail.currentVersion!.id };
  }

  function adjust(
    captainId: string,
    recipeId: string,
    versionId: string,
    instruction = "Use butternut instead of the lentils.",
  ) {
    const asked = testStore.adjustVersion({
      recipeId,
      versionId,
      actorId: captainId,
      instruction,
      plates: 45,
      now: new Date(),
      promptVersion: "adjust-1",
      model: "claude-opus-4-8",
    });
    if (!asked.ok) throw new Error(asked.error);
    return asked.runId;
  }

  it("sends the version and the words with the adjust prompt, and writes the next version into the book", async () => {
    const { captainId, recipeId, versionId } = await inTheBook();
    const runId = adjust(captainId, recipeId, versionId);
    const stages = watchStages(recipeId);
    const butternut = {
      ...RESULT,
      recipe: { ...RESULT.recipe!, title: "Butternut dhal" },
    };
    const create = claudeAnswers(toolReply(butternut));

    expect(await processRuns({ runIds: [runId] })).toMatchObject({
      succeeded: 1,
    });
    expect(stages).toEqual(["sending", "reading", "checking", "saving"]);
    const [body] = create.mock.calls[0] as unknown as [Record<string, unknown>];
    expect(body).toMatchObject({
      system: recipeAdjustPrompt.system,
      tools: [SOURCE_TOOL],
    });
    const content = (body.messages as { content: string }[])[0]!.content;
    expect(content).toBe(
      recipeAdjustPrompt.user({
        title: "Red lentil dhal",
        plates: 45,
        kitchen: {
          platesBreakfast: null,
          platesLunch: null,
          platesDinner: null,
        },
        base: { version: 1, recipe: RESULT.recipe!, exchange: [] },
        instruction: "Use butternut instead of the lentils.",
        exchange: [],
      }),
    );
    // Never the member's note or the source text.
    expect(content).not.toContain("SECRET-SUITABILITY-NOTE");
    expect(content).not.toContain("<source>");

    const detail = recipe(recipeId);
    expect(detail?.status).toBe("accepted");
    expect(detail?.currentVersion).toMatchObject({
      version: 2,
      recipe: { title: "Butternut dhal" },
      reason: "Changed by Claude: Use butternut instead of the lentils.",
    });
  });

  it("asks questions under E2E, then writes the stand-in once answered", async () => {
    const { captainId, recipeId, versionId } = await inTheBook();
    vi.mocked(anthropic).mockClear();
    vi.mocked(isE2ETestMode).mockReturnValue(true);
    vi.useFakeTimers();
    const vague = adjust(
      captainId,
      recipeId,
      versionId,
      "Add something green.",
    );
    const first = processRuns({ runIds: [vague] });
    await vi.advanceTimersByTimeAsync(TEST_MODE_STAGE_MS * 5);
    await first;
    const progress = testStore.getProofreadProgress(recipeId);
    expect(progress).toMatchObject({ kind: "adjust", outcome: "succeeded" });
    expect(progress?.questions).toHaveLength(1);

    const answered = testStore.answerProofreadQuestions({
      recipeId,
      runId: vague,
      actorId: captainId,
      answer: "Fresh coriander to serve.",
      now: new Date(),
      promptVersion: "source-1",
      model: "claude-opus-4-8",
    });
    if (!answered.ok) throw new Error(answered.error);
    const second = processRuns({ runIds: [answered.runId] });
    await vi.advanceTimersByTimeAsync(TEST_MODE_STAGE_MS * 5);
    expect(await second).toMatchObject({ succeeded: 1 });
    expect(anthropic).not.toHaveBeenCalled();
    const current = recipe(recipeId)?.currentVersion;
    expect(current?.version).toBe(2);
    expect(current?.recipe.ingredients.map((l) => l.name)).toContain(
      "Fresh coriander",
    );
  });
});

describe("testModeAdjust", () => {
  const base = {
    version: 1,
    recipe: RECIPE.recipe,
    exchange: [],
  };

  it("keeps the version, written for the claim's plates, with coriander added and a report that says so", () => {
    const answer = testModeAdjust({
      exchange: [],
      plates: 90,
      adjust: { base, instruction: "Add fresh herbs to serve." },
    });
    expect(SourceProofread.safeParse(answer).success).toBe(true);
    const written = answer.recipe!;
    expect(written.plates).toBe(90);
    expect(written.title).toBe(RECIPE.recipe.title);
    expect(written.ingredients[0]).toMatchObject({
      name: "Red lentils",
      quantity: 6,
    });
    expect(written.ingredients.at(-1)).toMatchObject({
      name: "Fresh coriander",
      component: "To serve",
    });
    expect(answer.report?.changed[0]).toBe(
      "Changed as asked: Add fresh herbs to serve.",
    );
    expect(answer.scalingNotes).toEqual([
      "Scaled every amount from 45 to 90 plates, in step with the plates.",
    ]);
    // Nothing a page shows says it came from a stand-in.
    expect(JSON.stringify(answer)).not.toMatch(
      /test mode|stand-in|not called/i,
    );
  });

  it("asks one question about a change that says `something`, until it has an answer", () => {
    const vague = {
      exchange: [],
      plates: 45,
      adjust: { base, instruction: "Change something." },
    };
    expect(testModeAdjust(vague).needsInfo).toBe(true);
    expect(
      testModeAdjust({
        ...vague,
        exchange: [{ questions: ["What?"], answer: "Less salt." }],
      }).needsInfo,
    ).toBe(false);
    // testModeSource hands an adjust claim to it.
    expect(testModeSource({ ...vague, sourceText: "" }).needsInfo).toBe(true);
  });
});

describe("a plate-count run", () => {
  const BASE = RecipeDraft.parse({
    recipe: {
      title: "Red lentil dhal",
      plates: 50,
      ingredients: [
        { name: "Red lentils", category: "legume", quantity: 2.5, unit: "kg" },
        {
          name: "Garlic",
          category: "produce",
          quantity: 8,
          quantityMax: 10,
          unit: "clove",
        },
        { name: "Salt", category: "spice", unit: null },
      ],
      steps: [
        {
          instruction: "Simmer.",
          uses: ["Red lentils", "Garlic", "Salt"],
        },
      ],
    },
    report: { changed: [], unsure: [] },
  }).recipe;

  const ANSWER: PlateProofread = {
    lines: [
      {
        name: "Red lentils",
        quantity: 2.3,
        quantityMax: null,
        unit: "kg",
        note: null,
      },
      {
        name: "Garlic",
        quantity: 8,
        quantityMax: null,
        unit: "clove",
        note: null,
      },
      {
        name: "Salt",
        quantity: null,
        quantityMax: null,
        unit: null,
        note: null,
      },
    ],
    pots: 1,
    notes: ["One pot is enough."],
    report: { changed: ["Kept the garlic."], unsure: [] },
  };

  /** A captain, an accepted version for 50 plates and a queued run for 45. */
  function queuedPlates(plates = 45) {
    const { captainId, recipeId } = captainAndRecipe();
    const v = testStore.seedAcceptedVersion({
      recipeId,
      authorId: captainId,
      reason: "First",
      recipe: BASE,
    });
    const q = testStore.queuePlateProofread({
      recipeId,
      versionId: v.versionId,
      plates,
      rerun: false,
      actorId: captainId,
      now: new Date(),
      promptVersion: "2026-09-25.1",
      model: "claude-opus-4-8",
    });
    if (!q.ok) throw new Error(q.error);
    return { recipeId, versionId: v.versionId, runId: q.runId };
  }

  const platesReply = (input: unknown) => ({
    content: [{ type: "tool_use", id: "t1", name: PLATES_TOOL.name, input }],
    stop_reason: "tool_use",
    usage: { input_tokens: 2_000, output_tokens: 400 },
  });

  it("sends the accepted recipe alone through its own forced tool, and stores the count", async () => {
    const { recipeId, versionId, runId } = queuedPlates();
    const create = claudeAnswers(platesReply(ANSWER));

    expect(await processRuns({ runIds: [runId] })).toEqual({
      processed: 1,
      succeeded: 1,
      failed: 0,
    });
    expect(create).toHaveBeenCalledTimes(1);
    const [body, options] = create.mock.calls[0] as unknown as [
      Record<string, unknown>,
      Record<string, unknown>,
    ];
    expect(body).toMatchObject({
      model: "claude-opus-4-8",
      system: recipePlatesPrompt.system,
      tools: [PLATES_TOOL],
      tool_choice: { type: "tool", name: "record_plate_quantities" },
    });
    expect(options).toEqual({ timeout: 240_000, maxRetries: 0 });
    expect(body.messages).toEqual([
      {
        role: "user",
        content: recipePlatesPrompt.user({
          title: "Red lentil dhal",
          recipe: BASE,
          fromPlates: 50,
          toPlates: 45,
        }),
      },
    ]);
    // Never the member's text, their note or a name.
    const sent = JSON.stringify(body);
    expect(sent).not.toContain("Lentils, salt. Simmer.");
    expect(sent).not.toContain("SECRET-SUITABILITY-NOTE");
    expect(sent).not.toContain("Nomvula");

    expect(testStore.getPlateCount(versionId, 45)).toMatchObject({
      lines: ANSWER.lines,
      pots: 1,
      notes: ["One pot is enough."],
      source: "proofread",
    });
    expect(run(runId)).toMatchObject({
      outcome: "succeeded",
      inputTokens: 2_000,
      outputTokens: 400,
    });
    expect(recipe(recipeId)).toMatchObject({
      status: "accepted",
      lastError: null,
    });
  });

  it("fails a reply whose lines are not the recipe's, in its order, and keeps the tokens", async () => {
    const { recipeId, versionId, runId } = queuedPlates();
    claudeAnswers(
      platesReply({
        ...ANSWER,
        lines: [ANSWER.lines[1], ANSWER.lines[0], ANSWER.lines[2]],
      }),
    );
    expect(await processRuns({ runIds: [runId] })).toMatchObject({
      failed: 1,
    });
    expect(run(runId)).toMatchObject({
      outcome: "failed",
      error: PLATE_LINES_MISMATCH,
      inputTokens: 2_000,
    });
    expect(PLATE_LINES_MISMATCH).toBe(
      "Claude's answer did not list the recipe's ingredients in order.",
    );
    expect(testStore.getPlateCount(versionId, 45)).toBeNull();
    // The recipe is not touched.
    expect(recipe(recipeId)).toMatchObject({
      status: "accepted",
      lastError: null,
    });

    // A line too few fails the same way.
    const second = queuedPlates(60);
    claudeAnswers(platesReply({ ...ANSWER, lines: ANSWER.lines.slice(0, 2) }));
    await processRuns({ runIds: [second.runId] });
    expect(run(second.runId)).toMatchObject({ error: PLATE_LINES_MISMATCH });
  });

  it("calls Claude once on an error, and fails the run alone", async () => {
    const { recipeId, runId } = queuedPlates();
    const create = claudeThrows(
      new Anthropic.APIConnectionTimeoutError({ message: "timeout" }),
    );
    expect(await processRuns({ runIds: [runId] })).toMatchObject({
      failed: 1,
    });
    expect(create).toHaveBeenCalledTimes(1);
    expect(run(runId)).toMatchObject({
      outcome: "failed",
      error:
        "Claude took too long to answer, so the run stopped. Nothing was retried.",
    });
    expect(recipe(recipeId)?.status).toBe("accepted");
  });

  it("under E2E_TEST_MODE stores base × (to/from)^0.9, to one decimal, and ceil(to/40) pots", async () => {
    vi.mocked(isE2ETestMode).mockReturnValue(true);
    const { versionId, runId } = queuedPlates(45);
    expect(await processRuns({ runIds: [runId] })).toMatchObject({
      succeeded: 1,
    });
    expect(anthropic).not.toHaveBeenCalled();
    const factor = 0.9 ** 0.9;
    expect(testStore.getPlateCount(versionId, 45)).toMatchObject({
      lines: [
        {
          name: "Red lentils",
          quantity: Math.round(2.5 * factor * 10) / 10,
          quantityMax: null,
          unit: "kg",
        },
        {
          name: "Garlic",
          quantity: Math.round(8 * factor * 10) / 10,
          quantityMax: Math.round(10 * factor * 10) / 10,
          unit: "clove",
        },
        { name: "Salt", quantity: null, quantityMax: null, unit: null },
      ],
      pots: 2,
      notes: [
        "Stir each pot often: at this count the lentils catch on the bottom.",
      ],
    });
    expect(testStore.getPlateCount(versionId, 45)?.lines[0]?.quantity).toBe(
      2.3,
    );
  });
});
