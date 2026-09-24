import { beforeEach, describe, expect, it, vi } from "vitest";

// test-store.ts is server-only; neutralize the import guard under vitest.
vi.mock("server-only", () => ({}));

import {
  ANSWER_NEEDED,
  NEVER_STARTED_ERROR,
  NO_AI_CONSENT,
  NO_TEXT_TO_SEND,
  NOT_AN_APPROVED_MEMBER,
  NOT_A_KITCHEN_REVIEWER,
  ONLY_A_REVIEWER_SENDS,
  ONLY_A_CAPTAIN_SETS_KITCHEN,
  PLATE_RUN_VERSION_GONE,
  RECIPE_CHANGED,
  RECIPE_DECIDED,
  SENDER_NOT_A_REVIEWER,
  SERVES_OUT_OF_RANGE,
  TEXT_TOO_LONG,
  SOURCE_CHANGED,
  SOURCE_INVALID,
  STALE_RUN_ERROR,
  VERSION_CHANGED,
  draftPlatesMismatch,
  forRecipe,
  plateCountIsBase,
  plateCountReady,
  plateRunOpen,
} from "@camp404/db/recipes";
import {
  MEAL_PLAN_CHANGED,
  NOT_A_MEAL_PLAN_EDITOR,
} from "@camp404/db/meal-plan";
import { sourceFromText, sourceText } from "@camp404/core";
import {
  KitchenRecipe,
  RECIPE_TEXT_MAX,
  type PlateProofread,
  type RecipeDraft,
  type RecipeSourceSections,
  type SourceProofread,
} from "@camp404/types";
import { testStore } from "../test-store";

// The E2E recipe twins. Playwright drives the kitchen screens through this
// store, so it must keep the real rules, in the same words: these cases
// mirror packages/db/src/__tests__/recipes.test.ts (who may decide, that only
// a captain queues, the consent rule refusing a whole batch, the compare-and-set sentence, and a worker that claims only what a
// captain queued).

const NOW = new Date("2026-09-24T10:00:00Z");

function makeUser(name: string, rank: "captain" | "member" = "member") {
  return testStore.createUser({
    authUserId: `auth-${name}`,
    displayName: name,
    inviteCode: "seeded",
    rank,
  });
}

function lead(name: string, team: "kitchen" | "structures") {
  const user = makeUser(name);
  testStore.assignTeam({ userId: user.id, team });
  testStore.setLead({ userId: user.id, team, isLead: true });
  return user;
}

function suggest(
  submitterId: string,
  aiConsent = true,
  title: string | null = "Dhal",
  text = "Lentils, salt. Simmer.",
) {
  const made = testStore.suggestRecipe({
    submitterId,
    title,
    source: "text",
    sourceUrl: null,
    text,
    suitabilityNote: null,
    aiConsent,
    now: NOW,
  });
  if (!made.ok) throw new Error(made.error);
  return made.id;
}

function queue(actorId: string, recipeIds: string[]) {
  return testStore.queueProofread({
    recipeIds,
    actorId,
    note: null,
    plates: 45,
    now: NOW,
    promptVersion: "2026-09-25.1",
    model: "claude-opus-4-8",
  });
}

const RECIPE = KitchenRecipe.parse({
  title: "Red lentil dhal",
  plates: 45,
  ingredients: [
    { name: "Red lentils", category: "legume", quantity: 3, unit: "kg" },
    { name: "Salt", category: "spice", quantity: 2, unit: "tbsp" },
  ],
  steps: [
    { instruction: "Simmer the lentils.", uses: ["Red lentils"] },
    { instruction: "Salt them.", uses: ["Salt"] },
  ],
});

const RESULT: RecipeDraft = {
  recipe: RECIPE,
  report: { changed: ["Cups to kilograms."], unsure: [] },
};

/** Claude's answer with a recipe, as SourceProofread holds it. */
function written(overrides: Partial<KitchenRecipe> = {}): SourceProofread {
  return {
    needsInfo: false,
    questions: [],
    recipe: { ...RECIPE, ...overrides },
    report: RESULT.report,
    scalingNotes: ["The source serves 4; the lentils are ten times it."],
  };
}

const QUESTIONS: SourceProofread = {
  needsInfo: true,
  questions: ["How many does the source serve?", "Dry or tinned lentils?"],
  recipe: null,
  report: null,
  scalingNotes: [],
};

const USAGE = { inputTokens: 700, outputTokens: 500 };

beforeEach(() => testStore.reset());

describe("recipe twins", () => {
  it("lets a Kitchen lead decide, and refuses a Structures lead, a member and a demoted lead", () => {
    const kitchen = lead("Kai", "kitchen");
    const structures = lead("Sam", "structures");
    const member = makeUser("Mo");
    const id = suggest(member.id);
    for (const actorId of [structures.id, member.id]) {
      expect(
        testStore.decideRecipe({ recipeId: id, actorId, decision: "approve" }),
      ).toEqual({ ok: false, error: NOT_A_KITCHEN_REVIEWER });
    }
    testStore.setLead({ userId: kitchen.id, team: "kitchen", isLead: false });
    expect(
      testStore.decideRecipe({
        recipeId: id,
        actorId: kitchen.id,
        decision: "approve",
      }),
    ).toEqual({ ok: false, error: NOT_A_KITCHEN_REVIEWER });
    testStore.setLead({ userId: kitchen.id, team: "kitchen", isLead: true });
    expect(
      testStore.decideRecipe({
        recipeId: id,
        actorId: kitchen.id,
        decision: "approve",
      }),
    ).toEqual({ ok: true });
    expect(
      testStore.decideRecipe({
        recipeId: id,
        actorId: kitchen.id,
        decision: "reject",
        reason: "No.",
      }),
    ).toEqual({ ok: false, error: RECIPE_DECIDED });
  });

  it("lets a Kitchen lead queue proofreading (2A), and only a captain change the kitchen settings", () => {
    const captain = makeUser("Cap", "captain");
    const kitchen = lead("Kai", "kitchen");
    const structures = lead("Sam", "structures");
    const id = suggest(makeUser("Mo").id);
    testStore.decideRecipe({
      recipeId: id,
      actorId: kitchen.id,
      decision: "approve",
    });
    expect(queue(structures.id, [id])).toEqual({
      ok: false,
      error: ONLY_A_REVIEWER_SENDS,
    });
    expect(
      testStore.setKitchenSettings({
        actorId: kitchen.id,
        kitchenLargestPotLitres: null,
        kitchenBurnerCount: null,
      }),
    ).toEqual({ ok: false, error: ONLY_A_CAPTAIN_SETS_KITCHEN });
    expect(queue(kitchen.id, [id]).ok).toBe(true);
    expect(captain.rank).toBe("captain");
  });

  it("has no daily limit, and refuses a batch with text nobody agreed to send as a whole", () => {
    const captain = makeUser("Cap", "captain");
    const member = makeUser("Mo");
    const approve = (id: string) =>
      testStore.decideRecipe({
        recipeId: id,
        actorId: captain.id,
        decision: "approve",
      });
    const a = suggest(member.id);
    const b = suggest(member.id);
    approve(a);
    approve(b);
    const secret = suggest(member.id, false, "Secret curry");
    approve(secret);
    expect(queue(captain.id, [a, secret])).toEqual({
      ok: false,
      error: forRecipe("Secret curry", NO_AI_CONSENT),
    });
    // Refused whole: no run was written.
    expect(testStore.listProofreadRuns()).toHaveLength(0);
    expect(
      testStore.retypeRecipeText({
        recipeId: secret,
        actorId: captain.id,
        text: "Curry, retyped.",
      }),
    ).toEqual({ ok: true });
    // No daily limit: three runs the same day.
    expect(queue(captain.id, [secret]).ok).toBe(true);
    expect(queue(captain.id, [a, b]).ok).toBe(true);
    expect(testStore.listProofreadRuns()).toHaveLength(3);
  });

  it("gives the worker only a run a reviewer queued, and saves its recipe straight into the book", () => {
    const captain = makeUser("Cap", "captain");
    const id = suggest(makeUser("Mo").id);
    testStore.decideRecipe({
      recipeId: id,
      actorId: captain.id,
      decision: "approve",
    });
    const q = queue(captain.id, [id]);
    if (!q.ok) throw new Error(q.error);
    const claimed = testStore.claimSourceRun(q.runIds[0]!, NOW);
    expect(claimed).toMatchObject({
      recipeId: id,
      plates: 45,
      sourceText: "## Steps\nLentils, salt. Simmer.",
    });
    expect(testStore.claimSourceRun(q.runIds[0]!, NOW)).toBeNull();
    expect(
      testStore.completeSourceRun({
        runId: q.runIds[0]!,
        result: written({ plates: 4 }),
        usage: { inputTokens: 10, outputTokens: 5 },
      }),
    ).toEqual({ ok: false, error: draftPlatesMismatch(45, 4) });
    expect(testStore.getRecipeDetail(id)?.status).toBe("analysing");
    expect(
      testStore.completeSourceRun({
        runId: q.runIds[0]!,
        result: written(),
        usage: { inputTokens: 10, outputTokens: 5 },
      }),
    ).toMatchObject({ ok: true, versionId: expect.any(String) });
    expect(testStore.listRecipeBook()).toEqual([
      expect.objectContaining({
        id,
        title: "Red lentil dhal",
        plates: 45,
        readyPlates: [45],
      }),
    ]);
    const detail = testStore.getRecipeDetail(id);
    expect(detail?.status).toBe("accepted");
    expect(detail?.currentVersion).toMatchObject({
      plates: 45,
      recipe: RECIPE,
      report: RESULT.report,
      scalingNotes: written().scalingNotes,
      reason: "Written by Claude",
      authorName: "Cap",
    });
    expect(detail?.plateCounts.map((p) => [p.plates, p.source])).toEqual([
      [45, "version"],
    ]);
    expect(
      testStore.getPlateCount(detail!.currentVersion!.id, 45),
    ).toMatchObject({
      source: "version",
      lines: [
        { name: "Red lentils", quantity: 3, unit: "kg", note: null },
        { name: "Salt", quantity: 2, unit: "tbsp", note: null },
      ],
    });
    expect(testStore.getPlateCount(detail!.currentVersion!.id, 40)).toBeNull();

    testStore.reset();
    expect(testStore.listRecipeBook()).toEqual([]);
    expect(testStore.getKitchenSettings()).toEqual({
      kitchenLargestPotLitres: null,
      kitchenBurnerCount: null,
    });
  });

  it("names a suggestion from its text, and refuses text that is only a link", () => {
    const captain = makeUser("Cap", "captain");
    const named = suggest(captain.id, true, null, "## Gai yang\nTofu.");
    expect(testStore.getRecipeDetail(named)?.title).toBe("Gai yang");
    const link = suggest(
      captain.id,
      true,
      "Linked",
      "https://www.noble-notations.com/recipes/gai-yang-isaan-oven",
    );
    testStore.decideRecipe({
      recipeId: link,
      actorId: captain.id,
      decision: "approve",
    });
    expect(queue(captain.id, [link])).toEqual({
      ok: false,
      error: forRecipe("Linked", NO_TEXT_TO_SEND),
    });
  });

  it("fails a run that was queued and never started, and hands its recipe back", () => {
    const captain = makeUser("Cap", "captain");
    const id = suggest(captain.id);
    testStore.decideRecipe({
      recipeId: id,
      actorId: captain.id,
      decision: "approve",
    });
    const q = queue(captain.id, [id]);
    if (!q.ok) throw new Error(q.error);
    expect(
      testStore.resetStaleRuns(new Date(NOW.getTime() + 9 * 60_000)),
    ).toEqual({ reset: 0 });
    expect(
      testStore.resetStaleRuns(new Date(NOW.getTime() + 11 * 60_000)),
    ).toEqual({ reset: 1 });
    expect(testStore.getRecipeDetail(id)).toMatchObject({
      status: "approved",
      lastError: NEVER_STARTED_ERROR,
    });
    expect(testStore.claimSourceRun(q.runIds[0]!, NOW)).toBeNull();
  });

  it("lets a captain set the pot and the burners, and nothing else", () => {
    const captain = makeUser("Cap", "captain");
    expect(
      testStore.setKitchenSettings({
        actorId: captain.id,
        kitchenLargestPotLitres: 50,
        kitchenBurnerCount: 3,
      }),
    ).toEqual({
      ok: true,
      settings: { kitchenLargestPotLitres: 50, kitchenBurnerCount: 3 },
    });
    expect(testStore.getKitchenSettings()).toEqual({
      kitchenLargestPotLitres: 50,
      kitchenBurnerCount: 3,
    });
  });

  it("keeps an accepted recipe accepted when a re-run fails, and a proofread one on its earlier result", () => {
    const captain = makeUser("Cap", "captain");
    const id = suggest(captain.id);
    testStore.decideRecipe({
      recipeId: id,
      actorId: captain.id,
      decision: "approve",
    });
    // An older draft, still waiting for a reviewer.
    const first = testStore.seedLegacyDraft({
      recipeId: id,
      actorId: captain.id,
      result: RESULT,
      now: NOW,
    });
    const second = queue(captain.id, [id]);
    if (!second.ok) throw new Error(second.error);
    testStore.claimSourceRun(second.runIds[0]!, NOW);
    testStore.failRun({ runId: second.runIds[0]!, error: "Timed out." });
    expect(testStore.getRecipeDetail(id)).toMatchObject({
      status: "proofread",
      latestRun: { id: first },
    });
    expect(
      testStore.acceptProofread({
        recipeId: id,
        runId: first,
        actorId: captain.id,
      }),
    ).toMatchObject({ ok: true, version: 1 });

    const third = queue(captain.id, [id]);
    if (!third.ok) throw new Error(third.error);
    testStore.claimSourceRun(third.runIds[0]!, NOW);
    testStore.resetStaleRuns(new Date(NOW.getTime() + 16 * 60_000));
    expect(testStore.getRecipeDetail(id)).toMatchObject({
      status: "accepted",
      lastError: STALE_RUN_ERROR,
    });
  });

  it("takes a Kitchen lead's re-run request and clears it when a captain queues", () => {
    const captain = makeUser("Cap", "captain");
    const kitchen = lead("Kim", "kitchen");
    const structures = lead("Sam", "structures");
    const id = suggest(captain.id);
    testStore.decideRecipe({
      recipeId: id,
      actorId: captain.id,
      decision: "approve",
    });
    expect(
      testStore.requestRerun({
        recipeId: id,
        actorId: structures.id,
        note: "Grams.",
      }),
    ).toEqual({ ok: false, error: NOT_A_KITCHEN_REVIEWER });
    expect(
      testStore.requestRerun({
        recipeId: id,
        actorId: kitchen.id,
        note: "Grams.",
      }),
    ).toEqual({ ok: true });
    expect(testStore.listReadyToProofread()[0]?.rerunRequest).toEqual({
      note: "Grams.",
      byName: "Kim",
    });
    expect(queue(captain.id, [id]).ok).toBe(true);
    expect(testStore.getRecipeDetail(id)?.rerunRequest).toBeNull();
  });

  it("refuses a resubmission from a member no longer approved", () => {
    const captain = makeUser("Cap", "captain");
    const member = makeUser("Mo");
    const id = suggest(member.id);
    testStore.decideRecipe({
      recipeId: id,
      actorId: captain.id,
      decision: "request_changes",
      note: "How many?",
    });
    testStore.setUserApprovalStatus(member.id, "pending");
    expect(
      testStore.resubmitRecipe({
        recipeId: id,
        actorId: member.id,
        title: "Dhal",
        text: "Feeds 4.",
        suitabilityNote: null,
        aiConsent: true,
      }),
    ).toEqual({ ok: false, error: NOT_AN_APPROVED_MEMBER });
  });

  it("asks the member again when they resubmit their own words after a reviewer's retype", () => {
    const captain = makeUser("Cap", "captain");
    const kitchen = lead("Kit", "kitchen");
    const member = makeUser("Mo");
    const id = suggest(member.id, false, "Unticked soup");
    testStore.retypeRecipeText({
      recipeId: id,
      actorId: kitchen.id,
      text: "Soup, retyped by the Kitchen lead.",
    });
    testStore.decideRecipe({
      recipeId: id,
      actorId: kitchen.id,
      decision: "request_changes",
      note: "How many?",
    });
    expect(
      testStore.resubmitRecipe({
        recipeId: id,
        actorId: member.id,
        title: "Unticked soup",
        text: "Soup for 40, the member's own words.",
        suitabilityNote: null,
        aiConsent: false,
      }),
    ).toEqual({ ok: true });
    testStore.decideRecipe({
      recipeId: id,
      actorId: kitchen.id,
      decision: "approve",
    });
    expect(queue(captain.id, [id])).toEqual({
      ok: false,
      error: forRecipe("Unticked soup", NO_AI_CONSENT),
    });
  });

  describe("plate counts", () => {
    const ANSWER: PlateProofread = {
      lines: [
        {
          name: "Red lentils",
          quantity: 2.7,
          quantityMax: null,
          unit: "kg",
          note: null,
        },
        {
          name: "Salt",
          quantity: 1.5,
          quantityMax: null,
          unit: "tbsp",
          note: null,
        },
      ],
      pots: 1,
      notes: ["One pot is enough."],
      report: { changed: [], unsure: [] },
    };

    /** An accepted recipe written for 45 plates. */
    function acceptedRecipe(captainId: string) {
      const id = suggest(captainId);
      testStore.decideRecipe({
        recipeId: id,
        actorId: captainId,
        decision: "approve",
      });
      const v = testStore.seedAcceptedVersion({
        recipeId: id,
        authorId: captainId,
        reason: "First",
        recipe: RECIPE,
      });
      return { id, versionId: v.versionId };
    }

    function plates(
      actorId: string,
      target: { id: string; versionId: string },
      count: number,
      rerun = false,
    ) {
      return testStore.queuePlateProofread({
        recipeId: target.id,
        versionId: target.versionId,
        plates: count,
        rerun,
        actorId,
        now: NOW,
        promptVersion: "2026-09-25.1",
        model: "claude-opus-4-8",
      });
    }

    function run(actorId: string, target: { id: string; versionId: string }) {
      const q = plates(actorId, target, 40);
      if (!q.ok) throw new Error(q.error);
      const claimed = testStore.claimPlateRun(q.runId, NOW);
      expect(claimed).toMatchObject({
        title: "Red lentil dhal",
        fromPlates: 45,
        plates: 40,
      });
      expect(
        testStore.completePlateRun({
          runId: q.runId,
          result: ANSWER,
          usage: { inputTokens: 1, outputTokens: 1 },
        }),
      ).toEqual({ ok: true });
      return q.runId;
    }

    it("refuses a Structures lead, the version's own count, a ready count and an open run, in the real words", () => {
      const captain = makeUser("Cap", "captain");
      const structures = lead("Sam", "structures");
      const target = acceptedRecipe(captain.id);
      expect(plates(structures.id, target, 40)).toEqual({
        ok: false,
        error: ONLY_A_REVIEWER_SENDS,
      });
      expect(plates(captain.id, target, 45)).toEqual({
        ok: false,
        error: plateCountIsBase(45),
      });
      const q = plates(captain.id, target, 40);
      if (!q.ok) throw new Error(q.error);
      expect(plates(captain.id, target, 40)).toEqual({
        ok: false,
        error: plateRunOpen(40),
      });
      expect(testStore.getRecipeDetail(target.id)?.openPlateRuns).toEqual([40]);
      testStore.claimPlateRun(q.runId, NOW);
      testStore.completePlateRun({
        runId: q.runId,
        result: ANSWER,
        usage: { inputTokens: 1, outputTokens: 1 },
      });
      expect(plates(captain.id, target, 40)).toEqual({
        ok: false,
        error: plateCountReady(40),
      });
      // A ready count is read, never paid for twice: still one run.
      expect(testStore.listProofreadRuns()).toHaveLength(1);
      expect(
        testStore.getRecipeDetail(target.id)?.plateCounts.map((c) => c.plates),
      ).toEqual([40, 45]);
      expect(testStore.getPlateCount(target.versionId, 40)).toMatchObject({
        lines: ANSWER.lines,
        pots: 1,
        notes: ["One pot is enough."],
        source: "proofread",
      });
    });

    it("reports the newest failed run for a count with no result, until it is asked for again", () => {
      const captain = makeUser("Cap", "captain");
      const target = acceptedRecipe(captain.id);
      for (const error of ["First try failed.", "Claude took too long."]) {
        const q = plates(captain.id, target, 60);
        if (!q.ok) throw new Error(q.error);
        testStore.claimPlateRun(q.runId, NOW);
        testStore.failPlateRun({ runId: q.runId, error });
      }
      expect(testStore.getRecipeDetail(target.id)?.failedPlateRuns).toEqual([
        {
          plates: 60,
          error: "Claude took too long.",
          finishedAt: expect.any(Date),
        },
      ]);
      expect(plates(captain.id, target, 60).ok).toBe(true);
      expect(testStore.getRecipeDetail(target.id)).toMatchObject({
        openPlateRuns: [60],
        failedPlateRuns: [],
      });
    });

    it("has no daily limit, and a re-run replaces the stored count", () => {
      const captain = makeUser("Cap", "captain");
      const target = acceptedRecipe(captain.id);
      run(captain.id, target);
      const again = plates(captain.id, target, 40, true);
      if (!again.ok) throw new Error(again.error);
      testStore.claimPlateRun(again.runId, NOW);
      testStore.completePlateRun({
        runId: again.runId,
        result: { ...ANSWER, pots: 2 },
        usage: { inputTokens: 1, outputTokens: 1 },
      });
      expect(testStore.getPlateCount(target.versionId, 40)?.pots).toBe(2);
      expect(
        testStore
          .getRecipeDetail(target.id)
          ?.plateCounts.filter((c) => c.plates === 40),
      ).toHaveLength(1);
      expect(plates(captain.id, target, 60).ok).toBe(true);
    });

    it("refuses an old version, fails a run on it unsent, and resets a stale run without touching the recipe", () => {
      const captain = makeUser("Cap", "captain");
      const target = acceptedRecipe(captain.id);
      const stale = plates(captain.id, target, 40);
      if (!stale.ok) throw new Error(stale.error);
      testStore.claimPlateRun(stale.runId, NOW);
      expect(
        testStore.resetStaleRuns(new Date("2026-09-24T10:11:00Z")),
      ).toEqual({ reset: 1 });
      expect(testStore.getRecipeDetail(target.id)).toMatchObject({
        status: "accepted",
        lastError: null,
        openPlateRuns: [],
      });

      const queued = plates(captain.id, target, 60);
      if (!queued.ok) throw new Error(queued.error);
      testStore.seedAcceptedVersion({
        recipeId: target.id,
        authorId: captain.id,
        reason: "More",
        recipe: { ...RECIPE, plates: 50 },
      });
      expect(plates(captain.id, target, 70)).toEqual({
        ok: false,
        error: VERSION_CHANGED,
      });
      expect(testStore.claimPlateRun(queued.runId, NOW)).toBeNull();
      expect(
        testStore.listProofreadRuns().find((r) => r.id === queued.runId),
      ).toMatchObject({ outcome: "failed", error: PLATE_RUN_VERSION_GONE });
      // A source worker never takes a plate run.
      expect(testStore.claimSourceRun(queued.runId)).toBeNull();
    });
  });

  // The twins of the PGlite "source editor" cases: the same rules, the same
  // words, so the loading panel and the questions modal behave under
  // Playwright as they do on the real database.
  describe("source runs", () => {
    const PROMPT = "2026-09-24.1";
    const MODEL = "claude-opus-4-8";

    /** An approved suggestion of `submitterId`'s, approved by `captainId`. */
    function approvedRecipe(
      submitterId: string,
      captainId: string,
      aiConsent = true,
    ) {
      const id = suggest(submitterId, aiConsent);
      testStore.decideRecipe({
        recipeId: id,
        actorId: captainId,
        decision: "approve",
      });
      return id;
    }

    function send(
      actorId: string,
      recipeId: string,
      input: {
        basedOnSourceId: string | null;
        sections: RecipeSourceSections;
        serves?: number | null;
      },
    ) {
      return testStore.sendSourceForProofreading({
        recipeId,
        actorId,
        basedOnSourceId: input.basedOnSourceId,
        serves: input.serves ?? null,
        sections: input.sections,
        plates: 40,
        now: NOW,
        promptVersion: PROMPT,
        model: MODEL,
      });
    }

    function sendAsIs(actorId: string, recipeId: string) {
      const source = testStore.getRecipeSource(recipeId);
      if (!source) throw new Error("no source");
      return send(actorId, recipeId, {
        basedOnSourceId: source.id,
        serves: source.serves,
        sections: source.sections,
      });
    }

    function answer(
      actorId: string,
      recipeId: string,
      runId: string,
      text: string,
    ) {
      return testStore.answerProofreadQuestions({
        recipeId,
        runId,
        actorId,
        answer: text,
        now: NOW,
        promptVersion: PROMPT,
        model: MODEL,
      });
    }

    const runs = () => testStore.listProofreadRuns({ limit: 200 });

    it("seeds version 1 from a suggestion, and writes one for a resubmission, a retype and a cleared variation", () => {
      const captain = makeUser("Cap", "captain");
      const kitchen = lead("Kai", "kitchen");
      const member = makeUser("Mo");
      const text =
        "Camp dhal\nIngredients:\n- 2 cups red lentils\nMethod\nSimmer.";
      const id = suggest(member.id, true, "Dhal", text);
      expect(testStore.getRecipeSource(id)).toMatchObject({
        version: 1,
        serves: null,
        authorId: member.id,
        sections: sourceFromText(text),
      });
      testStore.decideRecipe({
        recipeId: id,
        actorId: kitchen.id,
        decision: "request_changes",
        note: "How many?",
      });
      testStore.resubmitRecipe({
        recipeId: id,
        actorId: member.id,
        title: "Dhal",
        text: "Feeds 4.\nSimmer.",
        suitabilityNote: null,
        aiConsent: true,
      });
      expect(testStore.getRecipeSource(id)).toMatchObject({
        version: 2,
        authorId: member.id,
      });
      testStore.decideRecipe({
        recipeId: id,
        actorId: captain.id,
        decision: "approve",
      });
      testStore.retypeRecipeText({
        recipeId: id,
        actorId: kitchen.id,
        text: "Retyped.",
      });
      expect(testStore.getRecipeSource(id)).toMatchObject({
        version: 3,
        authorId: kitchen.id,
        sections: sourceFromText("Retyped."),
      });

      // A variation copies a cleared source; an unticked one starts empty.
      testStore.seedAcceptedVersion({
        recipeId: id,
        authorId: captain.id,
        reason: "First",
        recipe: RECIPE,
      });
      const variation = testStore.startVariation({
        recipeId: id,
        actorId: captain.id,
        title: "Dhal, mild",
      });
      if (!variation.ok) throw new Error(variation.error);
      expect(testStore.getRecipeSource(variation.id)).toMatchObject({
        version: 1,
        authorId: captain.id,
        sections: sourceFromText("Retyped."),
      });
      const unticked = approvedRecipe(member.id, captain.id, false);
      testStore.seedAcceptedVersion({
        recipeId: unticked,
        authorId: captain.id,
        reason: "First",
        recipe: RECIPE,
      });
      const empty = testStore.startVariation({
        recipeId: unticked,
        actorId: captain.id,
        title: "Curry, mild",
      });
      if (!empty.ok) throw new Error(empty.error);
      expect(testStore.getRecipeSource(empty.id)).toBeNull();
    });

    it("lets a Kitchen lead send (canRunProofread); a Structures lead, a member and a demoted lead are refused with nothing written", () => {
      const captain = makeUser("Cap", "captain");
      const kitchen = lead("Kai", "kitchen");
      const structures = lead("Sam", "structures");
      const member = makeUser("Mo");
      const id = approvedRecipe(member.id, captain.id);
      const v1 = testStore.getRecipeSource(id)!;
      const edited = sourceFromText(
        "Ingredients\n- 2 kg red lentils\nMethod\nSimmer.",
      );
      for (const actorId of [structures.id, member.id]) {
        expect(
          send(actorId, id, { basedOnSourceId: v1.id, sections: edited }),
        ).toEqual({ ok: false, error: ONLY_A_REVIEWER_SENDS });
      }
      testStore.setLead({ userId: kitchen.id, team: "kitchen", isLead: false });
      expect(sendAsIs(kitchen.id, id)).toEqual({
        ok: false,
        error: ONLY_A_REVIEWER_SENDS,
      });
      expect(testStore.getRecipeSource(id)?.version).toBe(1);
      expect(runs()).toHaveLength(0);
      expect(testStore.getRecipeDetail(id)?.status).toBe("approved");

      testStore.setLead({ userId: kitchen.id, team: "kitchen", isLead: true });
      const sent = send(kitchen.id, id, {
        basedOnSourceId: v1.id,
        sections: edited,
        serves: 4,
      });
      if (!sent.ok) throw new Error(sent.error);
      expect(testStore.getRecipeSource(id)).toMatchObject({
        id: sent.sourceId,
        version: 2,
        serves: 4,
        authorId: kitchen.id,
      });
      const detail = testStore.getRecipeDetail(id);
      expect(detail).toMatchObject({
        status: "queued",
        textAuthorId: kitchen.id,
        text: "## Ingredients\n- 2 kg red lentils\n\n## Steps\nSimmer.",
      });
      expect(detail?.history.map((e) => e.action)).toEqual([
        "recipe.approved",
        "recipe.source_saved",
        "recipe.proofread_queued",
      ]);
      expect(detail?.history[2]?.metadata).toMatchObject({
        runId: sent.runId,
        plates: 40,
        sourceVersion: 2,
      });
      expect(testStore.getProofreadProgress(id)).toEqual({
        runId: sent.runId,
        kind: "source",
        outcome: "queued",
        stage: null,
        questions: null,
        error: null,
      });
    });

    it("saves nothing on an unchanged send, so a member's unticked words stay refused; a change saves v2 as the reviewer's", () => {
      const captain = makeUser("Cap", "captain");
      const kitchen = lead("Kai", "kitchen");
      const member = makeUser("Mo");
      const id = approvedRecipe(member.id, captain.id, false);
      expect(sendAsIs(kitchen.id, id)).toEqual({
        ok: false,
        error: NO_AI_CONSENT,
      });
      expect(testStore.getRecipeSource(id)?.version).toBe(1);
      expect(runs()).toHaveLength(0);

      const v1 = testStore.getRecipeSource(id)!;
      const sent = send(kitchen.id, id, {
        basedOnSourceId: v1.id,
        sections: sourceFromText("Lentils, salt. Simmer gently."),
      });
      if (!sent.ok) throw new Error(sent.error);
      expect(testStore.getRecipeSource(id)).toMatchObject({
        version: 2,
        authorId: kitchen.id,
      });

      // An unchanged send of a source the member ticked for keeps them its author.
      const ticked = approvedRecipe(member.id, captain.id);
      const asIs = sendAsIs(kitchen.id, ticked);
      if (!asIs.ok) throw new Error(asIs.error);
      expect(testStore.getRecipeSource(ticked)?.version).toBe(1);
      expect(testStore.getRecipeDetail(ticked)?.textAuthorId).toBe(member.id);
    });

    it("refuses an editor that opened an older source, what the editor cannot keep, and a serves outside 1..500", () => {
      const captain = makeUser("Cap", "captain");
      const id = approvedRecipe(makeUser("Mo").id, captain.id);
      const v1 = testStore.getRecipeSource(id)!;
      const table = {
        ...v1.sections,
        notes: { type: "doc", content: [{ type: "table" }] },
      } as unknown as RecipeSourceSections;
      expect(
        send(captain.id, id, { basedOnSourceId: v1.id, sections: table }),
      ).toEqual({ ok: false, error: SOURCE_INVALID });
      expect(
        send(captain.id, id, {
          basedOnSourceId: v1.id,
          sections: v1.sections,
          serves: 0,
        }),
      ).toEqual({ ok: false, error: SERVES_OUT_OF_RANGE });
      testStore.retypeRecipeText({
        recipeId: id,
        actorId: captain.id,
        text: "Newer.",
      });
      for (const basedOnSourceId of [v1.id, null]) {
        expect(
          send(captain.id, id, {
            basedOnSourceId,
            sections: sourceFromText("Mine."),
          }),
        ).toEqual({ ok: false, error: SOURCE_CHANGED });
      }
      expect(testStore.getRecipeSource(id)?.version).toBe(2);
      expect(runs()).toHaveLength(0);
    });

    it("has no daily limit on a send", () => {
      const captain = makeUser("Cap", "captain");
      const member = makeUser("Mo");
      const a = approvedRecipe(member.id, captain.id);
      const b = approvedRecipe(member.id, captain.id);
      expect(sendAsIs(captain.id, a).ok).toBe(true);
      const bSource = testStore.getRecipeSource(b)!;
      expect(
        send(captain.id, b, {
          basedOnSourceId: bSource.id,
          sections: sourceFromText("Changed, and sent the same day."),
        }).ok,
      ).toBe(true);
      expect(testStore.getRecipeSource(b)?.version).toBe(2);
      expect(runs()).toHaveLength(2);
    });

    it("hands the worker the source text and nothing private, and moves the stage only while running", () => {
      const captain = makeUser("Cap", "captain");
      const member = makeUser("Mo");
      const id = approvedRecipe(member.id, captain.id);
      const v1 = testStore.getRecipeSource(id)!;
      const sent = send(captain.id, id, {
        basedOnSourceId: v1.id,
        sections: sourceFromText("Ingredients\n- Red lentils\nMethod\nSimmer."),
        serves: 4,
      });
      if (!sent.ok) throw new Error(sent.error);
      expect(testStore.setRunStage(sent.runId, "reading")).toBe(false);
      const claimed = testStore.claimSourceRun(sent.runId, NOW);
      expect(claimed).toEqual({
        runId: sent.runId,
        recipeId: id,
        title: "Dhal",
        sourceText: "## Ingredients\n- Red lentils\n\n## Steps\nSimmer.",
        serves: 4,
        plates: 40,
        exchange: [],
        note: null,
        kitchen: expect.objectContaining({
          kitchenLargestPotLitres: null,
          kitchenBurnerCount: null,
        }),
        previous: null,
      });
      expect(JSON.stringify(claimed)).not.toContain("Mo");
      expect(testStore.getProofreadProgress(id)?.stage).toBe("sending");
      expect(testStore.setRunStage(sent.runId, "reading")).toBe(true);
      expect(testStore.setRunStage(sent.runId, "checking")).toBe(true);
      expect(testStore.getRecipeDetail(id)?.latestRun?.stage).toBe("checking");
      expect(testStore.setRunStage(sent.runId, "dancing" as never)).toBe(false);
      testStore.failRun({ runId: sent.runId, error: "Timed out." });
      expect(testStore.setRunStage(sent.runId, "saving")).toBe(false);
      expect(testStore.getProofreadProgress(id)).toMatchObject({
        outcome: "failed",
        stage: "checking",
        error: "Timed out.",
      });
      expect(testStore.getRecipeDetail(id)).toMatchObject({
        status: "approved",
        lastError: "Timed out.",
      });
    });

    it("hands the recipe back with Claude's questions, then an answer queues the next round once, carrying the exchange", () => {
      const captain = makeUser("Cap", "captain");
      const kitchen = lead("Kai", "kitchen");
      const member = makeUser("Mo");
      const id = approvedRecipe(member.id, captain.id);
      const sent = sendAsIs(kitchen.id, id);
      if (!sent.ok) throw new Error(sent.error);
      testStore.claimSourceRun(sent.runId, NOW);
      expect(
        testStore.completeSourceRun({
          runId: sent.runId,
          result: QUESTIONS,
          usage: USAGE,
        }),
      ).toEqual({ ok: true, versionId: null });
      expect(testStore.getRecipeDetail(id)).toMatchObject({
        status: "approved",
        lastError: null,
        acceptedVersionId: null,
        latestRun: {
          id: sent.runId,
          questions: QUESTIONS.questions,
          draftUnreadable: false,
        },
      });
      expect(testStore.getProofreadProgress(id)).toMatchObject({
        outcome: "succeeded",
        questions: QUESTIONS.questions,
      });
      expect(testStore.listRecipeBook()).toEqual([]);

      expect(answer(kitchen.id, id, sent.runId, "  ")).toEqual({
        ok: false,
        error: ANSWER_NEEDED,
      });
      expect(answer(member.id, id, sent.runId, "Four.")).toEqual({
        ok: false,
        error: ONLY_A_REVIEWER_SENDS,
      });
      const answered = answer(
        kitchen.id,
        id,
        sent.runId,
        " Serves 4. Dry lentils. ",
      );
      if (!answered.ok) throw new Error(answered.error);
      expect(testStore.getRecipeDetail(id)?.status).toBe("queued");
      expect(answer(captain.id, id, sent.runId, "Serves 6.")).toEqual({
        ok: false,
        error: RECIPE_CHANGED,
      });
      expect(runs()).toHaveLength(2);
      const history = testStore.getRecipeDetail(id)?.history ?? [];
      expect(
        history.filter((e) => e.action === "recipe.questions_answered"),
      ).toEqual([
        expect.objectContaining({
          metadata: expect.objectContaining({
            runId: answered.runId,
            answeredRunId: sent.runId,
            round: 1,
          }),
        }),
      ]);
      expect(testStore.claimSourceRun(answered.runId, NOW)?.exchange).toEqual([
        { questions: QUESTIONS.questions, answer: "Serves 4. Dry lentils." },
      ]);

      // Once that round has come back, the old questions stay answered.
      testStore.failRun({ runId: answered.runId, error: "Timed out." });
      expect(testStore.getRecipeDetail(id)?.status).toBe("approved");
      expect(answer(captain.id, id, sent.runId, "Serves 6.")).toEqual({
        ok: false,
        error: RECIPE_CHANGED,
      });
    });

    it("answers with no daily limit, and refuses an answer once the source changed", () => {
      const captain = makeUser("Cap", "captain");
      const member = makeUser("Mo");
      const asked = (id: string) => {
        const sent = sendAsIs(captain.id, id);
        if (!sent.ok) throw new Error(sent.error);
        testStore.claimSourceRun(sent.runId, NOW);
        testStore.completeSourceRun({
          runId: sent.runId,
          result: QUESTIONS,
          usage: USAGE,
        });
        return sent.runId;
      };
      const a = approvedRecipe(member.id, captain.id);
      const aRun = asked(a);
      testStore.retypeRecipeText({
        recipeId: a,
        actorId: captain.id,
        text: "Newer.",
      });
      expect(answer(captain.id, a, aRun, "Four.")).toEqual({
        ok: false,
        error: SOURCE_CHANGED,
      });

      const b = approvedRecipe(member.id, captain.id);
      const bRun = asked(b);
      expect(answer(captain.id, b, bRun, "Four.").ok).toBe(true);
      expect(runs()).toHaveLength(3);
    });

    it("keeps a member's unticked words refused when only Serves changes, and keeps their authorship when they ticked", () => {
      const captain = makeUser("Cap", "captain");
      const kitchen = lead("Kai", "kitchen");
      const member = makeUser("Mo");
      const unticked = approvedRecipe(member.id, captain.id, false);
      const v1 = testStore.getRecipeSource(unticked)!;
      expect(
        send(kitchen.id, unticked, {
          basedOnSourceId: v1.id,
          sections: v1.sections,
          serves: 4,
        }),
      ).toEqual({ ok: false, error: NO_AI_CONSENT });
      expect(testStore.getRecipeSource(unticked)?.version).toBe(1);
      expect(runs()).toHaveLength(0);
      expect(testStore.getRecipeDetail(unticked)?.textAuthorId).toBe(member.id);

      const ticked = approvedRecipe(member.id, captain.id);
      const t1 = testStore.getRecipeSource(ticked)!;
      const sent = send(kitchen.id, ticked, {
        basedOnSourceId: t1.id,
        sections: t1.sections,
        serves: 4,
      });
      if (!sent.ok) throw new Error(sent.error);
      expect(testStore.getRecipeSource(ticked)).toMatchObject({
        version: 2,
        serves: 4,
        authorId: member.id,
      });
      expect(testStore.getRecipeDetail(ticked)?.textAuthorId).toBe(member.id);

      // A retype keeps the Serves the editor set.
      testStore.claimSourceRun(sent.runId, NOW);
      testStore.failRun({ runId: sent.runId, error: "Timed out." });
      testStore.retypeRecipeText({
        recipeId: ticked,
        actorId: kitchen.id,
        text: "Retyped.",
      });
      expect(testStore.getRecipeSource(ticked)).toMatchObject({
        version: 3,
        serves: 4,
        authorId: kitchen.id,
      });
    });

    it("refuses a source longer than pasted text may be, writing nothing", () => {
      const captain = makeUser("Cap", "captain");
      const id = approvedRecipe(makeUser("Mo").id, captain.id);
      const v1 = testStore.getRecipeSource(id)!;
      expect(
        send(captain.id, id, {
          basedOnSourceId: v1.id,
          sections: sourceFromText("x".repeat(RECIPE_TEXT_MAX + 1)),
        }),
      ).toEqual({ ok: false, error: TEXT_TOO_LONG });
      expect(testStore.getRecipeSource(id)?.version).toBe(1);
      expect(runs()).toHaveLength(0);
    });

    it("writes nothing into the book when the sender lost the Kitchen while Claude worked", () => {
      const captain = makeUser("Cap", "captain");
      const kitchen = lead("Kai", "kitchen");
      const id = approvedRecipe(makeUser("Mo").id, captain.id);
      const sent = sendAsIs(kitchen.id, id);
      if (!sent.ok) throw new Error(sent.error);
      testStore.claimSourceRun(sent.runId, NOW);
      testStore.setLead({ userId: kitchen.id, team: "kitchen", isLead: false });
      expect(
        testStore.completeSourceRun({
          runId: sent.runId,
          result: { ...written(), recipe: { ...RECIPE, plates: 40 } },
          usage: USAGE,
        }),
      ).toEqual({ ok: false, error: SENDER_NOT_A_REVIEWER });
      expect(testStore.getRecipeDetail(id)).toMatchObject({
        status: "analysing",
        versions: [],
      });
    });

    it("reports the run the editor started, and a run that never started as failed once reset", () => {
      const captain = makeUser("Cap", "captain");
      const id = approvedRecipe(makeUser("Mo").id, captain.id);
      const older = testStore.seedLegacyDraft({
        recipeId: id,
        actorId: captain.id,
        result: RESULT,
        now: NOW,
      });
      const sent = sendAsIs(captain.id, id);
      if (!sent.ok) throw new Error(sent.error);
      testStore.claimSourceRun(sent.runId, NOW);
      testStore.failRun({ runId: sent.runId, error: "Timed out." });
      expect(testStore.getProofreadProgress(id)).toMatchObject({
        runId: older,
        outcome: "succeeded",
      });
      expect(testStore.getProofreadProgress(id, sent.runId)).toMatchObject({
        outcome: "failed",
        error: "Timed out.",
      });

      // A run whose after() never ran: the poll's reset makes it fail.
      const stuck = approvedRecipe(makeUser("Ro").id, captain.id);
      const queued = sendAsIs(captain.id, stuck);
      if (!queued.ok) throw new Error(queued.error);
      expect(testStore.getProofreadProgress(stuck, queued.runId)).toMatchObject(
        { outcome: "queued" },
      );
      testStore.resetStaleRuns(new Date(NOW.getTime() + 11 * 60_000));
      expect(testStore.getProofreadProgress(stuck, queued.runId)).toMatchObject(
        { outcome: "failed", error: NEVER_STARTED_ERROR },
      );
    });

    it("accepts only an older run's own draft, never a recipe from the caller", () => {
      const captain = makeUser("Cap", "captain");
      const id = approvedRecipe(makeUser("Mo").id, captain.id);
      const runId = testStore.seedLegacyDraft({
        recipeId: id,
        actorId: captain.id,
        result: RESULT,
        now: NOW,
      });
      const accepted = testStore.acceptProofread({
        recipeId: id,
        runId,
        actorId: captain.id,
        recipe: { ...RECIPE, title: "Hand-written" },
      } as Parameters<typeof testStore.acceptProofread>[0]);
      if (!accepted.ok) throw new Error(accepted.error);
      expect(testStore.getRecipeDetail(id)?.currentVersion?.recipe.title).toBe(
        RECIPE.title,
      );
    });

    it("keeps a late reply from changing a recipe already written", () => {
      const captain = makeUser("Cap", "captain");
      const id = approvedRecipe(makeUser("Mo").id, captain.id);
      const sent = sendAsIs(captain.id, id);
      if (!sent.ok) throw new Error(sent.error);
      testStore.claimSourceRun(sent.runId, NOW);
      const done = testStore.completeSourceRun({
        runId: sent.runId,
        result: { ...written(), recipe: { ...RECIPE, plates: 40 } },
        usage: USAGE,
      });
      expect(done).toMatchObject({ ok: true });
      expect(
        testStore.completeSourceRun({
          runId: sent.runId,
          result: { ...written(), recipe: { ...RECIPE, plates: 40 } },
          usage: USAGE,
        }),
      ).toEqual({ ok: false, error: RECIPE_CHANGED });
      expect(testStore.getRecipeDetail(id)?.versions).toHaveLength(1);
      expect(
        testStore.completeSourceRun({
          runId: sent.runId,
          result: { ...QUESTIONS, questions: [] },
          usage: USAGE,
        }).ok,
      ).toBe(false);
      expect(sourceText(testStore.getRecipeSource(id)!.sections)).toBe(
        "## Steps\nLentils, salt. Simmer.",
      );
    });

    it("revises a recipe in the book from its accepted version and the round that settled it, under the revision prompt", () => {
      const captain = makeUser("Cap", "captain");
      const member = makeUser("Mo");
      const id = approvedRecipe(member.id, captain.id);
      const REVISION = "revision-2026-09-24.1";
      const sendNow = () =>
        testStore.sendSourceForProofreading({
          recipeId: id,
          actorId: captain.id,
          basedOnSourceId: testStore.getRecipeSource(id)!.id,
          serves: null,
          sections: testStore.getRecipeSource(id)!.sections,
          plates: RECIPE.plates,
          now: NOW,
          promptVersion: PROMPT,
          revisionPromptVersion: REVISION,
          model: MODEL,
        });
      const first = sendNow();
      if (!first.ok) throw new Error(first.error);
      testStore.claimSourceRun(first.runId, NOW);
      testStore.completeSourceRun({
        runId: first.runId,
        result: QUESTIONS,
        usage: USAGE,
      });
      const round = testStore.answerProofreadQuestions({
        recipeId: id,
        runId: first.runId,
        actorId: captain.id,
        answer: "Four, dry.",
        now: NOW,
        promptVersion: PROMPT,
        revisionPromptVersion: REVISION,
        model: MODEL,
      });
      if (!round.ok) throw new Error(round.error);
      testStore.claimSourceRun(round.runId, NOW);
      testStore.completeSourceRun({
        runId: round.runId,
        result: written(),
        usage: USAGE,
      });
      // Before the book: the source prompt on both rounds.
      expect(
        runs()
          .filter((r) => [first.runId, round.runId].includes(r.id))
          .map((r) => r.promptVersion),
      ).toEqual([PROMPT, PROMPT]);
      expect(testStore.getRecipeDetail(id)?.versions[0]).toMatchObject({
        version: 1,
        plates: RECIPE.plates,
        recipe: written().recipe,
        report: RESULT.report,
      });

      // The meal plan gives the kitchen its plates at each meal.
      expect(
        testStore.setMealPlan({
          actorId: captain.id,
          daysOnSite: 1,
          days: [{ breakfast: 45, lunch: 0, dinner: 60 }],
          expectedVersion: 0,
        }),
      ).toEqual({ ok: true, version: 1 });

      const again = sendNow();
      if (!again.ok) throw new Error(again.error);
      expect(runs().find((r) => r.id === again.runId)?.promptVersion).toBe(
        REVISION,
      );
      const claimed = testStore.claimSourceRun(again.runId, NOW);
      expect(claimed?.previous).toEqual({
        version: 1,
        recipe: written().recipe,
        exchange: [{ questions: QUESTIONS.questions, answer: "Four, dry." }],
      });
      expect(claimed?.exchange).toEqual([]);
      expect(claimed?.kitchen).toMatchObject({
        kitchenPlatesBreakfast: 45,
        kitchenPlatesLunch: null,
        kitchenPlatesDinner: 60,
      });
    });

    it("lists every source version, newest first, with its author", () => {
      const captain = makeUser("Cap", "captain");
      const member = makeUser("Mo");
      const id = approvedRecipe(member.id, captain.id);
      const v1 = testStore.getRecipeSource(id)!;
      expect(
        send(captain.id, id, {
          basedOnSourceId: v1.id,
          sections: sourceFromText("Retyped."),
        }).ok,
      ).toBe(true);
      expect(
        testStore.listRecipeSources(id).map((x) => [x.version, x.authorName]),
      ).toEqual([
        [2, "Cap"],
        [1, "Mo"],
      ]);
    });
  });
});

describe("meal plan twin", () => {
  it("reads 11 empty days, saves for a Kitchen lead or a captain, compare-and-set, audited", () => {
    const captain = makeUser("Cap", "captain");
    const kitchen = lead("Kai", "kitchen");
    const structures = lead("Sam", "structures");
    const member = makeUser("Mo");
    expect(testStore.getMealPlan()).toMatchObject({
      daysOnSite: 11,
      version: 0,
    });
    const two = {
      daysOnSite: 2,
      days: [
        { breakfast: 20, lunch: 0, dinner: 25 },
        { breakfast: 45, lunch: 0, dinner: 50 },
      ],
    };
    for (const actor of [structures, member]) {
      expect(
        testStore.setMealPlan({
          actorId: actor.id,
          ...two,
          expectedVersion: 0,
        }),
      ).toEqual({ ok: false, error: NOT_A_MEAL_PLAN_EDITOR });
    }
    expect(
      testStore.setMealPlan({
        actorId: kitchen.id,
        ...two,
        expectedVersion: 0,
      }),
    ).toEqual({ ok: true, version: 1 });
    // A second save from the version the first one replaced is refused.
    expect(
      testStore.setMealPlan({
        actorId: captain.id,
        ...two,
        expectedVersion: 0,
      }),
    ).toEqual({ ok: false, error: MEAL_PLAN_CHANGED });
    expect(
      testStore.setMealPlan({
        actorId: captain.id,
        daysOnSite: 1,
        days: [{ breakfast: 501, lunch: 0, dinner: 0 }],
        expectedVersion: 1,
      }).ok,
    ).toBe(false);
    expect(testStore.getMealPlan()).toMatchObject({ ...two, version: 1 });
  });
});
