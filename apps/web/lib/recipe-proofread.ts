import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import {
  recipeAdjustPrompt,
  recipePlatesPrompt,
  recipeSourcePrompt,
  recipeSourceRevisionPrompt,
} from "@camp404/ai-prompts";
import {
  PlateProofread,
  SourceProofread,
  checkPlateLines,
  type PlateLine,
} from "@camp404/types";
import { draftPlatesMismatch, type RunStage } from "@camp404/db/recipes";
import { anthropic, MODELS } from "@/lib/anthropic";
import {
  claimPlateRun,
  claimSourceRun,
  completePlateRun,
  completeSourceRun,
  failPlateRun,
  failRun,
  setRunStage,
  type ClaimedPlateRun,
  type ClaimedSourceRun,
} from "@/lib/recipes";
import { isE2ETestMode } from "@/lib/test-mode";

// Kitchen (#243): the worker that has Claude read a recipe's source and either
// ask what it needs to know or write the recipe in the camp's shape (Noble
// Notations' shape) with notes on how it was scaled (SourceProofread), or
// proofread an accepted recipe for another number of plates (PlateProofread).
// It only ever works on a run a reviewer queued (a captain or a Kitchen lead,
// the owner's decision 2A; claimSourceRun and claimPlateRun return nothing
// else), sends Claude the source as text, the name, how many the source
// serves, the plates to write for, the kitchen's meal counts (the
// meal plan's largest day at each meal), the sender's note and every earlier
// round of questions and answers (and, for a recipe already in the book, its
// accepted version and the answers that settled it, so Claude revises
// instead of starting from zero: recipeSourceRevisionPrompt), and stores
// the answer or the failure. There is no cron: a reviewer's click queues the
// run and after() runs it; a run stuck over ten minutes is reset when a
// Kitchen page loads.
//
// "Adjust with Claude" runs through the same worker: an `adjust` run is
// claimed by claimSourceRun too, and sends the version a reviewer picked (as
// JSON, with the questions and answers that settled it) and what they said
// should change, instead of a source (recipeAdjustPrompt). Its answer is the
// same SourceProofread, stored the same way.
//
// Claude's answer goes one of two ways. Questions ("needs more") hand the
// recipe back to where it stood, with the questions kept on the run; the
// editor shows them, and "Send answer" queues a new run carrying the whole
// exchange. A recipe is saved straight into the book as a new version, with
// its scaling notes, and no accept step (completeSourceRun); the editor then
// opens the recipe page, where "How this was scaled" lists the notes.
//
// A source run writes how far it has got on its row (setRunStage), and the
// editor's loading panel shows only that: `sending` (the claim), `reading`
// (the request is going to Claude), `checking` (the answer is back and being
// checked) and `saving`.
//
// What is never sent: the member's note on why the recipe suits the camp,
// anyone's name, audio. ClaimedSourceRun does not carry them, so they cannot
// be. A plate-count run sends the kitchen's accepted recipe alone
// (ClaimedPlateRun), never the member's text.
//
// No automatic retry (owner's ruling): the SDK retries 429s and 5xx twice by
// default, so the call sets maxRetries: 0. A model error, a timeout or a
// reply that does not match the contract hands the recipe back to where it
// stood with a short sentence, and a reviewer decides whether to send it
// again; a plate-count run that fails changes only its own row. There is no
// daily limit on runs (the owner removed it, 2026-09-24).
//
// Under E2E_TEST_MODE (the in-memory run and the real-database run alike) no
// request leaves the machine: a fixed, valid answer stands in for Claude, and
// each stage is held for TEST_MODE_STAGE_MS so Playwright can see the panel
// move. The stages are still written to the run row; nothing is faked on the
// client.

/** A Zod shape as a tool's input schema, without the $schema key. */
function toolInputSchema(shape: z.ZodType): Anthropic.Tool.InputSchema {
  const schema: Record<string, unknown> = { ...z.toJSONSchema(shape) };
  delete schema.$schema;
  return schema as Anthropic.Tool.InputSchema;
}

/**
 * The one tool Claude must call on a source run, its input schema built from
 * SourceProofread: either questions, or the recipe with its report and
 * scaling notes. The schema is part of the pinned prompt: change it and bump
 * PROMPT_VERSIONS.recipeSource (a test holds it to the version).
 */
export const SOURCE_TOOL = {
  name: recipeSourcePrompt.toolName,
  description:
    "Record either the questions you need answered before you can write the recipe safely, or the recipe in the camp's shape (its ingredient lines with categories, its steps with the lines each step uses, its practical notes) with a report of what changed and what was guessed, and notes on how the amounts were scaled.",
  input_schema: toolInputSchema(SourceProofread),
} satisfies Anthropic.Tool;

/**
 * The tool for a plate-count run, its input schema built from PlateProofread.
 * Part of the pinned prompt: change it and bump PROMPT_VERSIONS.recipePlates
 * (a test holds it to the version).
 */
export const PLATES_TOOL = {
  name: recipePlatesPrompt.toolName,
  description:
    "Record the recipe's ingredient lines for the plates asked for, in the recipe's order and with its names, the pots the count needs, practical notes for this count, and a report of what changed and what was unsure.",
  input_schema: toolInputSchema(PlateProofread),
} satisfies Anthropic.Tool;

/** How long one call may take; the page's 300 s maxDuration leaves room. */
export const PROOFREAD_TIMEOUT_MS = 240_000;

/** What a test-mode run reports it spent. */
export const TEST_MODE_USAGE = { inputTokens: 1_200, outputTokens: 900 };

/** How long each stage is held under E2E_TEST_MODE, so Playwright sees it. */
export const TEST_MODE_STAGE_MS = 800;

/** A source the stand-in finds too vague: it says "some" of something. */
const VAGUE_SOURCE = /\bsome\b/i;

/**
 * The answer that stands in for Claude on a source run under E2E_TEST_MODE.
 * A source that says "some" of something, on a run with no answer yet, gets
 * two questions back; anything else gets a fixed, valid "Camp dal" written
 * for the run's plates.
 */
export function testModeSource(
  claim: Pick<ClaimedSourceRun, "sourceText" | "exchange" | "plates"> & {
    adjust?: ClaimedSourceRun["adjust"];
  },
): SourceProofread {
  if (claim.adjust) return testModeAdjust({ ...claim, adjust: claim.adjust });
  if (VAGUE_SOURCE.test(claim.sourceText) && claim.exchange.length === 0) {
    return SourceProofread.parse({
      needsInfo: true,
      questions: [
        'How much coconut milk? The source says "some".',
        "Is the cumin ground or whole?",
      ],
    });
  }
  return SourceProofread.parse({
    needsInfo: false,
    recipe: {
      title: "Camp dal",
      summary: "Red lentils simmered soft in coconut milk with cumin.",
      plates: claim.plates,
      totalTimeMinutes: 45,
      activeTimeMinutes: 15,
      ingredients: [
        {
          name: "Onion",
          category: "produce",
          quantity: 4,
          unit: "piece",
          preparation: "finely chopped",
        },
        {
          name: "Red lentils",
          category: "legume",
          quantity: 2.5,
          unit: "kg",
          preparation: "rinsed",
        },
        {
          name: "Coconut milk",
          category: "liquid",
          quantity: 2,
          unit: "l",
          note: "Five 400 ml tins.",
        },
        { name: "Ground cumin", category: "spice", quantity: 2, unit: "tbsp" },
      ],
      steps: [
        {
          phase: "Prep",
          instruction: "Chop the onions and rinse the lentils.",
          uses: ["Onion", "Red lentils"],
        },
        {
          phase: "Cook",
          instruction: "Fry the onions with the cumin until soft.",
          uses: ["Onion", "Ground cumin"],
          durationMinutes: 10,
          equipment: ["large pot"],
        },
        {
          phase: "Cook",
          instruction:
            "Add the lentils and coconut milk and simmer until the lentils are soft.",
          uses: ["Red lentils", "Coconut milk"],
          durationMinutes: 20,
          durationMaxMinutes: 25,
        },
      ],
      notes: [
        {
          kind: "warning",
          body: "Lentils catch easily. Stir the bottom of the pot often.",
        },
      ],
    },
    report: { changed: [], unsure: [] },
    scalingNotes: [
      "Lentils, onions and coconut milk were scaled in step with the plates.",
      "Salt and cumin were scaled more slowly than the lentils.",
    ],
  });
}

/** An instruction the stand-in finds too vague: it says "something". */
const VAGUE_CHANGE = /\bsomething\b/i;

/** The ingredient the stand-in adds when a change names none it can read. */
const STAND_IN_ADDITION = {
  name: "Fresh coriander",
  category: "herb",
  quantity: 2,
  unit: "bunch",
  preparation: "chopped",
  component: "To serve",
} as const;

/**
 * The answer that stands in for Claude on an adjust run under E2E_TEST_MODE.
 * A change that says "something", with no answer yet, gets one question back.
 * Anything else keeps the version's recipe, written for the run's plates
 * (every amount scaled in step, to one decimal), with fresh coriander added
 * to serve, a step that uses it, and a report and scaling notes that say so.
 */
export function testModeAdjust(
  claim: Pick<ClaimedSourceRun, "exchange" | "plates"> & {
    adjust: NonNullable<ClaimedSourceRun["adjust"]>;
  },
): SourceProofread {
  const { base, instruction } = claim.adjust;
  if (VAGUE_CHANGE.test(instruction) && claim.exchange.length === 0) {
    return SourceProofread.parse({
      needsInfo: true,
      questions: [
        'What should change? The request says "something" without naming an ingredient or a step.',
      ],
    });
  }
  const from = base.recipe.plates;
  const factor = claim.plates / from;
  const scale = (value: number | null | undefined) =>
    value == null ? value : Math.round(value * factor * 10) / 10;
  const hasAddition = base.recipe.ingredients.some(
    (line) => line.name === STAND_IN_ADDITION.name,
  );
  return SourceProofread.parse({
    needsInfo: false,
    recipe: {
      ...base.recipe,
      plates: claim.plates,
      ingredients: [
        ...base.recipe.ingredients.map((line) => ({
          ...line,
          quantity: scale(line.quantity),
          quantityMax: scale(line.quantityMax),
        })),
        ...(hasAddition ? [] : [STAND_IN_ADDITION]),
      ],
      steps: [
        ...base.recipe.steps,
        ...(hasAddition
          ? []
          : [
              {
                phase: "Serve",
                instruction: "Scatter the chopped coriander over each plate.",
                uses: [`To serve: ${STAND_IN_ADDITION.name}`],
              },
            ]),
      ],
    },
    report: {
      changed: [
        `Changed as asked: ${instruction.slice(0, 200)}`,
        "Added fresh coriander to serve.",
      ],
      unsure: [],
    },
    scalingNotes: [
      claim.plates === from
        ? `Kept the amounts for ${from} plates, except where the change moved them.`
        : `Scaled every amount from ${from} to ${claim.plates} plates, in step with the plates.`,
    ],
  });
}

/** What a stand-in plate count scales by: a little under straight. */
const TEST_MODE_EXPONENT = 0.9;

/**
 * The answer that stands in for Claude on a plate run under E2E_TEST_MODE:
 * each amount is base × (to / from)^0.9, to one decimal, with ceil(to / 40)
 * pots. Not a rule the kitchen cooks by; only a deterministic answer that is
 * visibly not a straight multiplication.
 */
export function testModePlates(claim: ClaimedPlateRun): PlateProofread {
  const factor = (claim.plates / claim.fromPlates) ** TEST_MODE_EXPONENT;
  const scale = (value: number | null) =>
    value === null ? null : Math.round(value * factor * 10) / 10;
  return PlateProofread.parse({
    lines: claim.recipe.ingredients.map(
      (line): PlateLine => ({
        name: line.name,
        quantity: scale(line.quantity),
        quantityMax: scale(line.quantityMax),
        unit: line.unit,
        note: null,
      }),
    ),
    pots: Math.ceil(claim.plates / 40),
    notes: [
      "Stir each pot often: at this count the lentils catch on the bottom.",
    ],
    report: { changed: [], unsure: [] },
  });
}

export type ProofreadOutcome = "succeeded" | "failed";

const TIMED_OUT =
  "Claude took too long to answer, so the run stopped. Nothing was retried.";
const UNREACHABLE = "Claude could not be reached. Nothing was retried.";
const BUSY =
  "Claude was too busy to take the run (rate limited). Nothing was retried.";
const KEY_REFUSED = "Anthropic refused the camp's API key. Nothing was sent.";
const NOT_SET_UP =
  "Proofreading is not set up: ANTHROPIC_API_KEY is not set. Nothing was sent.";
const CUT_OFF = "Claude's answer was cut off before it finished.";
const DECLINED = "Claude declined to proofread this recipe.";
const NO_ANSWER = "Claude did not answer with a recipe.";
const FAILED = "The run failed before Claude answered.";
/** A plate answer whose lines are not the recipe's, in the recipe's order. */
export const PLATE_LINES_MISMATCH =
  "Claude's answer did not list the recipe's ingredients in order.";

/** A short sentence for a failed call. Never the SDK's body or headers. */
export function describeCallError(error: unknown): string {
  if (error instanceof Anthropic.APIConnectionTimeoutError) return TIMED_OUT;
  if (error instanceof Anthropic.APIConnectionError) return UNREACHABLE;
  if (error instanceof Anthropic.RateLimitError) return BUSY;
  if (error instanceof Anthropic.AuthenticationError) return KEY_REFUSED;
  if (error instanceof Anthropic.APIError) {
    return typeof error.status === "number"
      ? `Claude answered with an error (${error.status}). Nothing was retried.`
      : UNREACHABLE;
  }
  if (error instanceof Error && error.message.includes("ANTHROPIC_API_KEY")) {
    return NOT_SET_UP;
  }
  return FAILED;
}

function invalidShape(error: z.ZodError, shape = "recipe"): string {
  const issue = error.issues[0];
  const where = issue?.path.length ? ` (at ${issue.path.join(".")})` : "";
  return `Claude's answer did not match the ${shape} shape${where}.`;
}

type Usage = { inputTokens: number; outputTokens: number };

export type Attempt<T> =
  | { ok: true; result: T; usage: Usage }
  | { ok: false; error: string; usage: Usage | null };

/**
 * One forced-tool call: Opus, no retries, cut off at PROOFREAD_TIMEOUT_MS.
 * Returns the tool's raw input, or a sentence for what went wrong.
 */
async function callTool(request: {
  system: string;
  user: string;
  tool: Anthropic.Tool;
  maxTokens: number;
}): Promise<Attempt<unknown>> {
  let response: Anthropic.Message;
  try {
    response = await anthropic().messages.create(
      {
        model: MODELS.opus,
        max_tokens: request.maxTokens,
        system: request.system,
        tools: [request.tool],
        tool_choice: { type: "tool", name: request.tool.name },
        messages: [{ role: "user", content: request.user }],
      },
      { timeout: PROOFREAD_TIMEOUT_MS, maxRetries: 0 },
    );
  } catch (error) {
    // Name and status only: the SDK error carries the response body.
    console.error(
      "[recipe-proofread] call failed",
      error instanceof Error ? error.name : typeof error,
      (error as { status?: unknown } | null)?.status ?? "",
    );
    return { ok: false, error: describeCallError(error), usage: null };
  }

  const usage = {
    inputTokens: response.usage?.input_tokens ?? 0,
    outputTokens: response.usage?.output_tokens ?? 0,
  };
  const block = response.content.find(
    (b) => b.type === "tool_use" && b.name === request.tool.name,
  );
  if (!block || block.type !== "tool_use") {
    const error =
      response.stop_reason === "max_tokens"
        ? CUT_OFF
        : response.stop_reason === "refusal"
          ? DECLINED
          : NO_ANSWER;
    return { ok: false, error, usage };
  }
  return { ok: true, result: block.input, usage };
}

/**
 * What one claimed source run sends: an adjust run sends the version it
 * starts from and what should change (the adjust prompt); a recipe in the
 * book is revised from its accepted version and the questions and answers
 * that settled it (the revision prompt, the one the run was queued under);
 * any other is written from its source alone.
 */
export function sourceRequest(claim: ClaimedSourceRun): {
  system: string;
  user: string;
} {
  if (claim.adjust) {
    const { kitchen } = sourceInput(claim);
    return {
      system: recipeAdjustPrompt.system,
      user: recipeAdjustPrompt.user({
        title: claim.title,
        plates: claim.plates,
        kitchen,
        base: claim.adjust.base,
        instruction: claim.adjust.instruction,
        exchange: claim.exchange,
      }),
    };
  }
  if (claim.previous) {
    return {
      system: recipeSourceRevisionPrompt.system,
      user: recipeSourceRevisionPrompt.user({
        ...sourceInput(claim),
        previous: claim.previous,
      }),
    };
  }
  return {
    system: recipeSourcePrompt.system,
    user: recipeSourcePrompt.user(sourceInput(claim)),
  };
}

/** The source prompt's input for one claimed run. */
function sourceInput(claim: ClaimedSourceRun) {
  return {
    title: claim.title,
    source: claim.sourceText,
    serves: claim.serves,
    plates: claim.plates,
    kitchen: {
      platesBreakfast: claim.kitchen.kitchenPlatesBreakfast,
      platesLunch: claim.kitchen.kitchenPlatesLunch,
      platesDinner: claim.kitchen.kitchenPlatesDinner,
    },
    note: claim.note,
    exchange: claim.exchange,
  };
}

/**
 * A source answer is SourceProofread, and a recipe in it is written for the
 * plates the run asked for: Claude may copy the source's own "serves 4"
 * instead, and that answer fails the run (its tokens kept), never becomes a
 * version for the wrong count.
 */
export function checkSourceAnswer(
  claim: Pick<ClaimedSourceRun, "plates">,
  input: unknown,
  usage: Usage,
): Attempt<SourceProofread> {
  const parsed = SourceProofread.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: invalidShape(parsed.error), usage };
  }
  const written = parsed.data.recipe;
  if (!parsed.data.needsInfo && written && written.plates !== claim.plates) {
    return {
      ok: false,
      error: draftPlatesMismatch(claim.plates, written.plates),
      usage,
    };
  }
  return { ok: true, result: parsed.data, usage };
}

async function askClaudePlates(
  claim: ClaimedPlateRun,
): Promise<Attempt<PlateProofread>> {
  const attempt = await callTool({
    system: recipePlatesPrompt.system,
    user: recipePlatesPrompt.user({
      title: claim.title,
      recipe: claim.recipe,
      fromPlates: claim.fromPlates,
      toPlates: claim.plates,
    }),
    tool: PLATES_TOOL,
    maxTokens: 8_000,
  });
  if (!attempt.ok) return attempt;
  return checkPlateAnswer(claim, attempt.result, attempt.usage);
}

/** A plate answer is PlateProofread, with the recipe's lines in its order. */
function checkPlateAnswer(
  claim: ClaimedPlateRun,
  input: unknown,
  usage: Usage,
): Attempt<PlateProofread> {
  const parsed = PlateProofread.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: invalidShape(parsed.error, "plate"), usage };
  }
  if (checkPlateLines(claim.recipe, parsed.data) !== null) {
    return { ok: false, error: PLATE_LINES_MISMATCH, usage };
  }
  return { ok: true, result: parsed.data, usage };
}

const pause = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Move a source run to its next stage. Under E2E_TEST_MODE the stage it
 * leaves is held for TEST_MODE_STAGE_MS first, so Playwright sees each one.
 * False when the run is no longer running (a stale reset took it).
 */
async function moveTo(runId: string, stage: RunStage): Promise<boolean> {
  if (isE2ETestMode()) await pause(TEST_MODE_STAGE_MS);
  return setRunStage(runId, stage);
}

/** Fail a source run with a sentence, logging when even that write fails. */
async function failSource(
  runId: string,
  error: string,
  usage: Usage | null,
): Promise<void> {
  const stored = await failRun({ runId, error, usage });
  if (!stored.ok) {
    console.error("[recipe-proofread] could not store the failure", {
      runId,
      error: stored.error,
    });
  }
}

/**
 * Proofread one claimed source run and store the outcome: Claude's questions,
 * which hand the recipe back to the reviewer, or the recipe, saved straight
 * into the book. The claim left the run at `sending`; it moves to `reading`
 * right before the request, `checking` once the answer is back, and `saving`
 * before the write. Never throws: whatever goes wrong ends as a failed run
 * with a short sentence, or (when even that write fails) in the log, where
 * the stale-run reset picks it up.
 */
export async function proofreadSourceClaim(
  claim: ClaimedSourceRun,
): Promise<ProofreadOutcome> {
  try {
    // A run reset as stale while it waited is not sent at all.
    if (!(await moveTo(claim.runId, "reading"))) return "failed";
    const call: Attempt<unknown> = isE2ETestMode()
      ? { ok: true, result: testModeSource(claim), usage: TEST_MODE_USAGE }
      : await callTool({
          ...sourceRequest(claim),
          tool: SOURCE_TOOL,
          maxTokens: 16_000,
        });
    // An answer came back (a usable one or not): it is being checked.
    if (call.usage !== null) await moveTo(claim.runId, "checking");
    if (!call.ok) {
      await failSource(claim.runId, call.error, call.usage);
      return "failed";
    }
    const attempt = checkSourceAnswer(claim, call.result, call.usage);
    if (!attempt.ok) {
      await failSource(claim.runId, attempt.error, attempt.usage);
      return "failed";
    }

    await moveTo(claim.runId, "saving");
    if (isE2ETestMode()) await pause(TEST_MODE_STAGE_MS);
    const stored = await completeSourceRun({
      runId: claim.runId,
      result: attempt.result,
      usage: attempt.usage,
    });
    if (stored.ok) return "succeeded";
    // The write refused the answer: the run fails with the write's sentence,
    // its tokens kept, rather than waiting ten minutes for the stale reset.
    console.error("[recipe-proofread] could not store the result", {
      runId: claim.runId,
      error: stored.error,
    });
    await failSource(claim.runId, stored.error, attempt.usage);
    return "failed";
  } catch (error) {
    console.error("[recipe-proofread] run failed", {
      runId: claim.runId,
      error: error instanceof Error ? error.name : typeof error,
    });
    try {
      await failRun({ runId: claim.runId, error: FAILED });
    } catch {
      // The stale-run reset hands the recipe back later.
    }
    return "failed";
  }
}

/**
 * Proofread one claimed plate-count run and store the outcome. Never throws,
 * and never touches the recipe: a failure fails the run alone.
 */
export async function proofreadPlateClaim(
  claim: ClaimedPlateRun,
): Promise<ProofreadOutcome> {
  try {
    const attempt: Attempt<PlateProofread> = isE2ETestMode()
      ? checkPlateAnswer(claim, testModePlates(claim), TEST_MODE_USAGE)
      : await askClaudePlates(claim);

    if (attempt.ok) {
      const stored = await completePlateRun({
        runId: claim.runId,
        result: attempt.result,
        usage: attempt.usage,
      });
      if (stored.ok) return "succeeded";
      console.error("[recipe-proofread] could not store the plate count", {
        runId: claim.runId,
        error: stored.error,
      });
      return "failed";
    }

    const stored = await failPlateRun({
      runId: claim.runId,
      error: attempt.error,
      usage: attempt.usage,
    });
    if (!stored.ok) {
      console.error("[recipe-proofread] could not store the failure", {
        runId: claim.runId,
        error: stored.error,
      });
    }
    return "failed";
  } catch (error) {
    console.error("[recipe-proofread] plate run failed", {
      runId: claim.runId,
      error: error instanceof Error ? error.name : typeof error,
    });
    try {
      await failPlateRun({ runId: claim.runId, error: FAILED });
    } catch {
      // The stale-run reset fails it later.
    }
    return "failed";
  }
}

export interface ProcessReport {
  processed: number;
  succeeded: number;
  failed: number;
}

/**
 * Claim the runs a reviewer just queued, then run every claimed one AT THE
 * SAME TIME. A run that is not queued any more is skipped.
 *
 * All at once, because the work runs inside one function with a 300 s limit
 * (the Run button's after()) and a single call may take PROOFREAD_TIMEOUT_MS
 * (240 s): one after another, the second call of a batch would be killed
 * halfway, its tokens spent and never stored, and its recipe left
 * `analysing` until the stale-run reset. Together, the batch takes as long as
 * its slowest call. A batch is at most MAX_PROOFREAD_BATCH runs, so this
 * never floods Anthropic; a rate-limited call fails like any
 * other, and is not retried.
 */
export async function processRuns(options: {
  runIds: readonly string[];
}): Promise<ProcessReport> {
  // Each run is claimed by its kind's own compare-and-set: a source run by
  // claimSourceRun, a plate-count run by claimPlateRun. Neither claims the
  // other's, and an older `recipe` run is claimed by neither.
  const work: (() => Promise<ProofreadOutcome>)[] = [];
  for (const runId of options.runIds) {
    try {
      const source = await claimSourceRun(runId);
      if (source) {
        work.push(() => proofreadSourceClaim(source));
        continue;
      }
      const plates = await claimPlateRun(runId);
      if (plates) work.push(() => proofreadPlateClaim(plates));
    } catch (error) {
      console.error("[recipe-proofread] claim failed", {
        error: error instanceof Error ? error.name : typeof error,
      });
    }
  }

  // Neither proofreader throws, so one failure cannot stop the others.
  const outcomes = await Promise.all(work.map((run) => run()));
  return {
    processed: outcomes.length,
    succeeded: outcomes.filter((o) => o === "succeeded").length,
    failed: outcomes.filter((o) => o === "failed").length,
  };
}
