import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The recipe actions (#243). What matters here:
//  1. A captain or a Kitchen lead sends recipes to Claude (the owner's
//     decision 2A); a lead of another team and a member are refused, and
//     nothing is queued or scheduled.
//  2. Deciding needs a captain or a lead of Kitchen: a lead of any other team
//     is refused here, although their clearance is the global team_lead rung.
//  3. The data layer's refusals reach the caller. There is no daily limit.
//  4. A run sent to Claude is processed after the response, under E2E too, so
//     the loading panel sees its stages; it is recorded with the pinned
//     prompt versions (the source prompt, or the revision prompt for a recipe
//     already in the book: the write picks) and model. The plates come from
//     the meal plan's largest count, never from the browser.
//  5. Every write names the signed-in actor, never an id from the browser.
// The rules are checked again inside each write (packages/db, on PGlite).

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("next/navigation", () => ({ unstable_rethrow: vi.fn() }));
vi.mock("@/lib/captain-gate", () => ({ captainActionGate: vi.fn() }));
vi.mock("@/lib/users", () => ({ getLeadTeams: vi.fn(async () => []) }));
vi.mock("@/lib/anthropic", () => ({
  anthropic: vi.fn(),
  MODELS: { opus: "claude-opus-4-8", haiku: "claude-haiku-4-5-20251001" },
}));
vi.mock("@/lib/test-mode", () => ({
  isE2ETestMode: vi.fn(() => false),
  usesTestStore: vi.fn(() => false),
}));
vi.mock("@/lib/meal-plan", () => ({
  getMealPlan: vi.fn(async () => ({
    cycle: 2026,
    daysOnSite: 2,
    days: [
      { breakfast: 60, lunch: 0, dinner: 45 },
      { breakfast: 50, lunch: 20, dinner: 45 },
    ],
    version: 3,
    updatedAt: null,
  })),
}));
vi.mock("@/lib/recipe-proofread", () => ({
  processRuns: vi.fn(async () => ({ processed: 1, succeeded: 1, failed: 0 })),
}));
vi.mock("@/lib/recipes", () => ({
  suggestRecipe: vi.fn(async () => ({ ok: true, id: "r-new" })),
  resubmitRecipe: vi.fn(async () => ({ ok: true })),
  decideRecipe: vi.fn(async () => ({ ok: true })),
  retypeRecipeText: vi.fn(async () => ({ ok: true })),
  requestRerun: vi.fn(async () => ({ ok: true })),
  acceptProofread: vi.fn(async () => ({
    ok: true,
    versionId: "v",
    version: 1,
  })),
  startVariation: vi.fn(async () => ({ ok: true, id: "r-var" })),
  addLesson: vi.fn(async () => ({ ok: true, id: "l" })),
  setKitchenSettings: vi.fn(async (input: Record<string, unknown>) => ({
    ok: true,
    settings: input,
  })),
  queueProofread: vi.fn(async () => ({ ok: true, runIds: ["run-1", "run-2"] })),
  queuePlateProofread: vi.fn(async () => ({ ok: true, runId: "run-p" })),
  sendSourceForProofreading: vi.fn(async () => ({
    ok: true,
    runId: "run-s",
    sourceId: "source-2",
  })),
  answerProofreadQuestions: vi.fn(async () => ({ ok: true, runId: "run-a" })),
  resetStaleRuns: vi.fn(async () => ({ reset: 0 })),
  getProofreadProgress: vi.fn(async () => ({
    runId: "run-s",
    kind: "source",
    outcome: "running",
    stage: "checking",
    questions: null,
    error: null,
  })),
}));

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { PROMPT_VERSIONS } from "@camp404/ai-prompts";
import type { ViewerRank } from "@camp404/types";
import { captainActionGate } from "@/lib/captain-gate";
import { getLeadTeams } from "@/lib/users";
import { isE2ETestMode } from "@/lib/test-mode";
import { getMealPlan } from "@/lib/meal-plan";
import { processRuns } from "@/lib/recipe-proofread";
import {
  DECIDE_REFUSAL,
  KITCHEN_SETTINGS_REFUSAL,
  PROOFREAD_NOT_SET_UP,
  RERUN_REQUEST_REFUSAL,
  REVIEW_REFUSAL,
  RUN_EXPLAINED,
  RUN_REFUSAL,
} from "@/lib/recipe-copy";
import {
  acceptProofread,
  answerProofreadQuestions,
  decideRecipe,
  getProofreadProgress,
  queuePlateProofread,
  queueProofread,
  requestRerun,
  resetStaleRuns,
  resubmitRecipe,
  sendSourceForProofreading,
  setKitchenSettings,
  suggestRecipe,
} from "@/lib/recipes";
import {
  acceptProofreadAction,
  answerProofreadQuestionsAction,
  decideRecipeAction,
  proofreadPlatesAction,
  proofreadProgressAction,
  proofreadRecipeAction,
  requestRerunAction,
  resubmitRecipeAction,
  runProofreadingAction,
  sendSourceForProofreadingAction,
  setKitchenSettingsAction,
  suggestRecipeAction,
} from "./actions";

const RECIPE_A = "0f8fad5b-d9cb-469f-a165-70867728950e";
const RECIPE_B = "7c9e6679-7425-40de-944b-e07fc1f90ae7";
const LADDER: ViewerRank[] = ["camp_member", "team_lead", "captain"];

/** Signed in as `id` on `rank`, leading `led`; the gate walks the real ladder. */
function actAs(rank: ViewerRank, led: string[] = [], id = "user-1") {
  vi.mocked(captainActionGate).mockImplementation(async (required, refusal) =>
    LADDER.indexOf(rank) >= LADDER.indexOf(required)
      ? { ok: true, campUser: { id } as never, rank }
      : { ok: false, error: refusal ?? "refused" },
  );
  vi.mocked(getLeadTeams).mockResolvedValue(led);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(isE2ETestMode).mockReturnValue(false);
  process.env.ANTHROPIC_API_KEY = "test-key";
  actAs("captain", [], "captain-1");
});
afterEach(() => {
  delete process.env.ANTHROPIC_API_KEY;
});

describe("resubmitRecipeAction", () => {
  it("passes the member's fresh tick to the write, and refuses without one", async () => {
    actAs("camp_member", [], "member-1");
    const input = {
      recipeId: RECIPE_A,
      title: "Dhal",
      text: "Dhal for 40.",
      suitabilityNote: "",
    };
    expect((await resubmitRecipeAction(input)).ok).toBe(false);
    expect(resubmitRecipe).not.toHaveBeenCalled();

    expect(await resubmitRecipeAction({ ...input, aiConsent: false })).toEqual({
      ok: true,
    });
    expect(resubmitRecipe).toHaveBeenCalledWith(
      expect.objectContaining({ actorId: "member-1", aiConsent: false }),
    );
  });
});

describe("runProofreadingAction", () => {
  const RUN = {
    recipeIds: [RECIPE_A, RECIPE_B],
    note: "Use tinned tomatoes.",
    plates: 45,
  };

  it("refuses a lead of another team and a member, and queues nothing", async () => {
    for (const [rank, led] of [
      ["team_lead", ["structures"]],
      ["camp_member", []],
    ] as const) {
      actAs(rank, [...led]);
      expect(await runProofreadingAction(RUN)).toEqual({
        ok: false,
        error: RUN_REFUSAL,
      });
    }
    expect(captainActionGate).toHaveBeenCalledWith("team_lead", RUN_REFUSAL);
    expect(queueProofread).not.toHaveBeenCalled();
    expect(processRuns).not.toHaveBeenCalled();
    expect(after).not.toHaveBeenCalled();
  });

  it("lets a Kitchen lead send (2A), as themselves", async () => {
    actAs("team_lead", ["structures", "kitchen"], "lead-1");
    expect(await runProofreadingAction(RUN)).toEqual({
      ok: true,
      data: { queued: 2 },
    });
    expect(queueProofread).toHaveBeenCalledWith(
      expect.objectContaining({ actorId: "lead-1" }),
    );
    expect(after).toHaveBeenCalledTimes(1);
  });

  it("queues source runs as the captain with the pinned prompt and model, and processes after the response", async () => {
    const result = await runProofreadingAction({ ...RUN, actorId: "someone" });
    expect(result).toEqual({ ok: true, data: { queued: 2 } });
    expect(queueProofread).toHaveBeenCalledWith(
      expect.objectContaining({
        recipeIds: [RECIPE_A, RECIPE_B],
        actorId: "captain-1",
        note: "Use tinned tomatoes.",
        plates: 45,
        promptVersion: PROMPT_VERSIONS.recipeSource,
        revisionPromptVersion: PROMPT_VERSIONS.recipeSourceRevision,
        model: "claude-opus-4-8",
      }),
    );
    expect(PROMPT_VERSIONS.recipeSource).toBe("2026-09-24.1");
    expect(PROMPT_VERSIONS.recipeSourceRevision).toBe("2026-09-24.1");
    // Not before the response: after() holds the work.
    expect(processRuns).not.toHaveBeenCalled();
    expect(after).toHaveBeenCalledTimes(1);
    const task = vi.mocked(after).mock.calls[0]![0] as () => Promise<unknown>;
    await task();
    expect(processRuns).toHaveBeenCalledWith({ runIds: ["run-1", "run-2"] });
  });

  it("processes after the response under E2E too, so the stages can be seen, and needs no key there", async () => {
    vi.mocked(isE2ETestMode).mockReturnValue(true);
    delete process.env.ANTHROPIC_API_KEY;
    expect(await runProofreadingAction(RUN)).toMatchObject({ ok: true });
    expect(processRuns).not.toHaveBeenCalled();
    expect(after).toHaveBeenCalledTimes(1);
    const task = vi.mocked(after).mock.calls[0]![0] as () => Promise<unknown>;
    await task();
    expect(processRuns).toHaveBeenCalledWith({ runIds: ["run-1", "run-2"] });
  });

  it("passes the write's refusal through, and processes nothing", async () => {
    vi.mocked(queueProofread).mockResolvedValueOnce({
      ok: false,
      error: "Dhal: Paste the recipe's text first. Claude does not open links.",
    });
    expect(await runProofreadingAction(RUN)).toEqual({
      ok: false,
      error: "Dhal: Paste the recipe's text first. Claude does not open links.",
    });
    expect(processRuns).not.toHaveBeenCalled();
    expect(after).not.toHaveBeenCalled();
  });

  it("refuses before queueing when the Anthropic key is not set", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    expect(await runProofreadingAction(RUN)).toEqual({
      ok: false,
      error: PROOFREAD_NOT_SET_UP,
    });
    expect(queueProofread).not.toHaveBeenCalled();
  });

  it("refuses an empty pick", async () => {
    expect(await runProofreadingAction({ recipeIds: [], plates: 40 })).toEqual({
      ok: false,
      error: "Pick a recipe to proofread.",
    });
    expect(queueProofread).not.toHaveBeenCalled();
  });

  it("needs a plate count from 1 to 500", async () => {
    for (const [plates, error] of [
      [0, "Cook for at least 1 plate."],
      [501, "Cook for at most 500 plates."],
      [40.5, "Use a whole number of plates."],
      [undefined, "Give the number of plates."],
    ] as const) {
      expect(await runProofreadingAction({ ...RUN, plates })).toEqual({
        ok: false,
        error,
      });
    }
    expect(queueProofread).not.toHaveBeenCalled();
  });
});

describe("decideRecipeAction", () => {
  const APPROVE = { recipeId: RECIPE_A, decision: "approve" };

  it("refuses a lead of another team, though they stand on the team_lead rung", async () => {
    actAs("team_lead", ["structures"]);
    expect(await decideRecipeAction(APPROVE)).toEqual({
      ok: false,
      error: DECIDE_REFUSAL,
    });
    expect(captainActionGate).toHaveBeenCalledWith("team_lead", DECIDE_REFUSAL);
    expect(decideRecipe).not.toHaveBeenCalled();
  });

  it("refuses a member", async () => {
    actAs("camp_member");
    expect(await decideRecipeAction(APPROVE)).toEqual({
      ok: false,
      error: DECIDE_REFUSAL,
    });
    expect(decideRecipe).not.toHaveBeenCalled();
  });

  it("lets a Kitchen lead decide, as themselves", async () => {
    actAs("team_lead", ["structures", "kitchen"], "lead-1");
    expect(
      await decideRecipeAction({
        recipeId: RECIPE_A,
        decision: "reject",
        reason: " Needs a fridge. ",
      }),
    ).toEqual({ ok: true });
    expect(decideRecipe).toHaveBeenCalledWith({
      recipeId: RECIPE_A,
      decision: "reject",
      reason: "Needs a fridge.",
      actorId: "lead-1",
    });
  });

  it("lets a captain decide without reading their teams", async () => {
    expect(await decideRecipeAction(APPROVE)).toEqual({ ok: true });
    expect(getLeadTeams).not.toHaveBeenCalled();
  });

  it("passes the compare-and-set sentence through", async () => {
    vi.mocked(decideRecipe).mockResolvedValueOnce({
      ok: false,
      error: "Someone else already decided this recipe. Reload the page.",
    });
    expect(await decideRecipeAction(APPROVE)).toEqual({
      ok: false,
      error: "Someone else already decided this recipe. Reload the page.",
    });
  });
});

describe("requestRerunAction", () => {
  const ASK = { recipeId: RECIPE_A, note: " Use grams, not cups. " };

  it("refuses a lead of another team and a member", async () => {
    for (const [rank, led] of [
      ["team_lead", ["structures"]],
      ["camp_member", []],
    ] as const) {
      actAs(rank, [...led]);
      expect(await requestRerunAction(ASK)).toEqual({
        ok: false,
        error: RERUN_REQUEST_REFUSAL,
      });
    }
    expect(requestRerun).not.toHaveBeenCalled();
  });

  it("lets a Kitchen lead ask, as themselves, and queues nothing", async () => {
    actAs("team_lead", ["kitchen"], "lead-1");
    expect(await requestRerunAction(ASK)).toEqual({ ok: true });
    expect(requestRerun).toHaveBeenCalledWith({
      recipeId: RECIPE_A,
      note: "Use grams, not cups.",
      actorId: "lead-1",
    });
    expect(queueProofread).not.toHaveBeenCalled();
    expect(processRuns).not.toHaveBeenCalled();
  });

  it("needs a note", async () => {
    actAs("team_lead", ["kitchen"], "lead-1");
    expect(await requestRerunAction({ recipeId: RECIPE_A, note: " " })).toEqual(
      { ok: false, error: "Say what Claude should do differently." },
    );
    expect(requestRerun).not.toHaveBeenCalled();
  });
});

describe("acceptProofreadAction", () => {
  const RECIPE = {
    title: "Hand-written",
    plates: 45,
    ingredients: [{ name: "Red lentils", category: "legume" }],
    steps: [{ instruction: "Simmer.", uses: ["Red lentils"] }],
  };

  it("accepts the run's own draft as the reviewer, with the reason given, and drops any recipe sent", async () => {
    actAs("team_lead", ["kitchen"], "lead-1");
    expect(
      await acceptProofreadAction({
        recipeId: RECIPE_A,
        runId: RECIPE_B,
        recipe: RECIPE,
        reason: "Accepted as Claude wrote it",
        actorId: "someone-else",
      }),
    ).toEqual({ ok: true, data: { version: 1 } });
    expect(acceptProofread).toHaveBeenCalledWith({
      recipeId: RECIPE_A,
      runId: RECIPE_B,
      reason: "Accepted as Claude wrote it",
      actorId: "lead-1",
    });
  });

  it("refuses a lead of another team, accepting nothing", async () => {
    actAs("team_lead", ["structures"], "lead-2");
    expect(
      (await acceptProofreadAction({ recipeId: RECIPE_A, runId: RECIPE_B })).ok,
    ).toBe(false);
    expect(acceptProofread).not.toHaveBeenCalled();
  });
});

describe("suggestRecipeAction", () => {
  it("suggests as the signed-in member, never as an id from the browser", async () => {
    actAs("camp_member", [], "member-1");
    expect(
      await suggestRecipeAction({
        title: "Dhal",
        source: "text",
        text: "Lentils. Simmer.",
        suitabilityNote: "",
        aiConsent: true,
        submitterId: "someone-else",
      }),
    ).toEqual({ ok: true, data: { id: "r-new" } });
    expect(suggestRecipe).toHaveBeenCalledWith(
      expect.objectContaining({
        submitterId: "member-1",
        title: "Dhal",
        sourceUrl: null,
        text: "Lentils. Simmer.",
        suitabilityNote: null,
        aiConsent: true,
      }),
    );
  });

  it("takes no name, leaving it to the text, and refuses a link with no recipe", async () => {
    actAs("camp_member", [], "member-1");
    expect(
      await suggestRecipeAction({
        source: "text",
        text: "Dal\nLentils. Simmer.",
        aiConsent: false,
      }),
    ).toEqual({ ok: true, data: { id: "r-new" } });
    expect(suggestRecipe).toHaveBeenCalledWith(
      expect.objectContaining({ title: null }),
    );
    vi.mocked(suggestRecipe).mockClear();
    const refused = await suggestRecipeAction({
      source: "text",
      text: "https://www.noble-notations.com/recipes/gai-yang-isaan-oven",
      aiConsent: true,
    });
    expect(refused.ok).toBe(false);
    expect(suggestRecipe).not.toHaveBeenCalled();
  });
});

describe("setKitchenSettingsAction", () => {
  const SETTINGS = {
    kitchenLargestPotLitres: 60,
    kitchenBurnerCount: null,
  };

  it("is a captain's alone", async () => {
    actAs("team_lead", ["kitchen"]);
    expect(await setKitchenSettingsAction(SETTINGS)).toEqual({
      ok: false,
      error: KITCHEN_SETTINGS_REFUSAL,
    });
    expect(setKitchenSettings).not.toHaveBeenCalled();
  });

  it("saves as the captain", async () => {
    expect(await setKitchenSettingsAction(SETTINGS)).toEqual({
      ok: true,
      data: { settings: { ...SETTINGS, actorId: "captain-1" } },
    });
    expect(setKitchenSettings).toHaveBeenCalledWith({
      ...SETTINGS,
      actorId: "captain-1",
    });
  });

  it("says what is wrong with a value", async () => {
    expect(
      await setKitchenSettingsAction({
        ...SETTINGS,
        kitchenLargestPotLitres: 0,
      }),
    ).toEqual({ ok: false, error: "A pot holds at least 1 litre." });
    expect(
      await setKitchenSettingsAction({ ...SETTINGS, kitchenBurnerCount: 21 }),
    ).toEqual({ ok: false, error: "Count at most 20 burners." });
    expect(setKitchenSettings).not.toHaveBeenCalled();
  });
});

describe("proofreadPlatesAction", () => {
  const VERSION = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";
  const ASK = { recipeId: RECIPE_A, versionId: VERSION, plates: 45 };

  it("refuses a lead of another team and a member, and queues nothing", async () => {
    for (const [rank, led] of [
      ["team_lead", ["structures"]],
      ["camp_member", []],
    ] as const) {
      actAs(rank, [...led]);
      expect(await proofreadPlatesAction(ASK)).toEqual({
        ok: false,
        error: RUN_REFUSAL,
      });
    }
    expect(captainActionGate).toHaveBeenCalledWith("team_lead", RUN_REFUSAL);
    expect(queuePlateProofread).not.toHaveBeenCalled();
    expect(after).not.toHaveBeenCalled();
  });

  it("lets a Kitchen lead ask for a count (2A), as themselves", async () => {
    actAs("team_lead", ["kitchen"], "lead-1");
    expect(await proofreadPlatesAction(ASK)).toEqual({
      ok: true,
      data: { runId: "run-p" },
    });
    expect(queuePlateProofread).toHaveBeenCalledWith(
      expect.objectContaining({ actorId: "lead-1" }),
    );
  });

  it("queues as the captain with the pinned plates prompt, no re-run by default, and runs it after the response", async () => {
    const result = await proofreadPlatesAction({ ...ASK, actorId: "someone" });
    expect(result).toEqual({ ok: true, data: { runId: "run-p" } });
    expect(queuePlateProofread).toHaveBeenCalledWith(
      expect.objectContaining({
        recipeId: RECIPE_A,
        versionId: VERSION,
        plates: 45,
        rerun: false,
        actorId: "captain-1",
        promptVersion: PROMPT_VERSIONS.recipePlates,
        model: "claude-opus-4-8",
      }),
    );
    expect(PROMPT_VERSIONS.recipePlates).toBe("2026-09-25.1");
    expect(processRuns).not.toHaveBeenCalled();
    const task = vi.mocked(after).mock.calls[0]![0] as () => Promise<unknown>;
    await task();
    expect(processRuns).toHaveBeenCalledWith({ runIds: ["run-p"] });
    expect(revalidatePath).toHaveBeenCalledWith(`/kitchen/recipes/${RECIPE_A}`);
  });

  it("passes an explicit re-run through, and runs inline under E2E", async () => {
    vi.mocked(isE2ETestMode).mockReturnValue(true);
    delete process.env.ANTHROPIC_API_KEY;
    expect(await proofreadPlatesAction({ ...ASK, rerun: true })).toMatchObject({
      ok: true,
    });
    expect(queuePlateProofread).toHaveBeenCalledWith(
      expect.objectContaining({ rerun: true }),
    );
    expect(processRuns).toHaveBeenCalledWith({ runIds: ["run-p"] });
    expect(after).not.toHaveBeenCalled();
  });

  it("passes the write's refusal through (a ready count), and runs nothing", async () => {
    vi.mocked(queuePlateProofread).mockResolvedValueOnce({
      ok: false,
      error: "Already proofread for 45 plates.",
    });
    expect(await proofreadPlatesAction(ASK)).toEqual({
      ok: false,
      error: "Already proofread for 45 plates.",
    });
    expect(processRuns).not.toHaveBeenCalled();
    expect(after).not.toHaveBeenCalled();
  });

  it("refuses before queueing without the Anthropic key, or with a bad count", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    expect(await proofreadPlatesAction(ASK)).toEqual({
      ok: false,
      error: PROOFREAD_NOT_SET_UP,
    });
    process.env.ANTHROPIC_API_KEY = "test-key";
    expect(await proofreadPlatesAction({ ...ASK, plates: 0 })).toEqual({
      ok: false,
      error: "Cook for at least 1 plate.",
    });
    expect(queuePlateProofread).not.toHaveBeenCalled();
  });
});

describe("sendSourceForProofreadingAction", () => {
  const SECTIONS = {
    ingredients: {
      type: "doc",
      content: [
        {
          type: "bulletList",
          content: [
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "500 g red lentils" }],
                },
              ],
            },
          ],
        },
      ],
    },
    equipment: { type: "doc", content: [{ type: "paragraph" }] },
    steps: {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "Simmer." }] },
      ],
    },
    notes: { type: "doc" },
  };
  const SEND = {
    recipeId: RECIPE_A,
    basedOnSourceId: RECIPE_B,
    serves: 4,
    sections: SECTIONS,
  };

  it("refuses a lead of another team and a member: nothing is read, written or scheduled", async () => {
    for (const [rank, led] of [
      ["team_lead", ["structures"]],
      ["camp_member", []],
    ] as const) {
      actAs(rank, [...led]);
      expect(await sendSourceForProofreadingAction(SEND)).toEqual({
        ok: false,
        error: RUN_REFUSAL,
      });
    }
    expect(RUN_REFUSAL).toMatch(/a captain or a Kitchen lead/);
    expect(RUN_EXPLAINED).toMatch(/A captain or a Kitchen lead/);
    expect(getMealPlan).not.toHaveBeenCalled();
    expect(sendSourceForProofreading).not.toHaveBeenCalled();
    expect(after).not.toHaveBeenCalled();
  });

  it("lets a Kitchen lead send, for the meal plan's largest count, never the browser's", async () => {
    actAs("team_lead", ["kitchen"], "lead-1");
    expect(
      await sendSourceForProofreadingAction({
        ...SEND,
        plates: 3,
        actorId: "someone-else",
      }),
    ).toEqual({ ok: true, data: { runId: "run-s", sourceId: "source-2" } });
    expect(sendSourceForProofreading).toHaveBeenCalledWith(
      expect.objectContaining({
        recipeId: RECIPE_A,
        actorId: "lead-1",
        basedOnSourceId: RECIPE_B,
        serves: 4,
        // The largest count in the meal plan: day 1's breakfast, 60.
        plates: 60,
        promptVersion: PROMPT_VERSIONS.recipeSource,
        revisionPromptVersion: PROMPT_VERSIONS.recipeSourceRevision,
        model: "claude-opus-4-8",
      }),
    );
    // Zod keeps only the nodes the editor offers, as the editor sent them.
    const sent = vi.mocked(sendSourceForProofreading).mock.calls[0]![0];
    expect(sent.sections.steps).toEqual(SECTIONS.steps);
    expect(revalidatePath).toHaveBeenCalledWith(`/kitchen/recipes/${RECIPE_A}`);
  });

  it("schedules the run after the response, in production and under E2E", async () => {
    for (const e2e of [false, true]) {
      vi.clearAllMocks();
      vi.mocked(isE2ETestMode).mockReturnValue(e2e);
      expect(await sendSourceForProofreadingAction(SEND)).toMatchObject({
        ok: true,
      });
      expect(processRuns).not.toHaveBeenCalled();
      expect(after).toHaveBeenCalledTimes(1);
      const task = vi.mocked(after).mock.calls[0]![0] as () => Promise<unknown>;
      await task();
      expect(processRuns).toHaveBeenCalledWith({ runIds: ["run-s"] });
    }
  });

  it("refuses a node the editor does not offer, and a missing key, before writing", async () => {
    expect(
      await sendSourceForProofreadingAction({
        ...SEND,
        sections: {
          ...SECTIONS,
          notes: { type: "doc", content: [{ type: "table" }] },
        },
      }),
    ).toMatchObject({ ok: false });
    delete process.env.ANTHROPIC_API_KEY;
    expect(await sendSourceForProofreadingAction(SEND)).toEqual({
      ok: false,
      error: PROOFREAD_NOT_SET_UP,
    });
    expect(sendSourceForProofreading).not.toHaveBeenCalled();
    expect(after).not.toHaveBeenCalled();
  });

  it("passes the write's refusal through, and schedules nothing", async () => {
    vi.mocked(sendSourceForProofreading).mockResolvedValueOnce({
      ok: false,
      error: "Someone else changed this recipe's source. Reload the page.",
    });
    expect(await sendSourceForProofreadingAction(SEND)).toEqual({
      ok: false,
      error: "Someone else changed this recipe's source. Reload the page.",
    });
    expect(after).not.toHaveBeenCalled();
  });
});

describe("proofreadRecipeAction", () => {
  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = "sk-test";
    actAs("captain", [], "captain-1");
  });

  it("refuses a lead of another team and a member: nothing is read, queued or scheduled", async () => {
    for (const [rank, led] of [
      ["team_lead", ["structures"]],
      ["camp_member", []],
    ] as const) {
      actAs(rank, [...led]);
      expect(await proofreadRecipeAction({ recipeId: RECIPE_A })).toEqual({
        ok: false,
        error: RUN_REFUSAL,
      });
    }
    expect(getMealPlan).not.toHaveBeenCalled();
    expect(queueProofread).not.toHaveBeenCalled();
    expect(after).not.toHaveBeenCalled();
  });

  it("queues the recipe as it stands for the meal plan's largest count, as the Kitchen lead, and runs it after the response", async () => {
    vi.mocked(queueProofread).mockResolvedValueOnce({
      ok: true,
      runIds: ["run-r"],
    });
    actAs("team_lead", ["kitchen"], "lead-1");
    expect(
      await proofreadRecipeAction({
        recipeId: RECIPE_A,
        plates: 3,
        actorId: "someone-else",
      }),
    ).toEqual({ ok: true, data: { runId: "run-r" } });
    expect(queueProofread).toHaveBeenCalledWith(
      expect.objectContaining({
        recipeIds: [RECIPE_A],
        actorId: "lead-1",
        note: null,
        plates: 60,
        promptVersion: PROMPT_VERSIONS.recipeSource,
        revisionPromptVersion: PROMPT_VERSIONS.recipeSourceRevision,
        model: "claude-opus-4-8",
      }),
    );
    expect(processRuns).not.toHaveBeenCalled();
    const task = vi.mocked(after).mock.calls[0]![0] as () => Promise<unknown>;
    await task();
    expect(processRuns).toHaveBeenCalledWith({ runIds: ["run-r"] });
    expect(revalidatePath).toHaveBeenCalledWith(`/kitchen/recipes/${RECIPE_A}`);
  });

  it("writes for 40 plates when the meal plan has none", async () => {
    vi.mocked(getMealPlan).mockResolvedValueOnce({
      cycle: 2026,
      daysOnSite: 1,
      days: [{ breakfast: 0, lunch: 0, dinner: 0 }],
      version: 0,
      updatedAt: null,
    });
    await proofreadRecipeAction({ recipeId: RECIPE_A });
    expect(queueProofread).toHaveBeenCalledWith(
      expect.objectContaining({ plates: 40 }),
    );
  });

  it("refuses a bad id and a missing key before queueing, and passes the write's refusal through", async () => {
    expect(await proofreadRecipeAction({ recipeId: "nope" })).toEqual({
      ok: false,
      error: "Check the recipe and try again.",
    });
    delete process.env.ANTHROPIC_API_KEY;
    expect(await proofreadRecipeAction({ recipeId: RECIPE_A })).toEqual({
      ok: false,
      error: PROOFREAD_NOT_SET_UP,
    });
    expect(queueProofread).not.toHaveBeenCalled();
    process.env.ANTHROPIC_API_KEY = "sk-test";
    vi.mocked(queueProofread).mockResolvedValueOnce({
      ok: false,
      error: "Camp dal: This recipe can't be proofread now.",
    });
    expect(await proofreadRecipeAction({ recipeId: RECIPE_A })).toEqual({
      ok: false,
      error: "Camp dal: This recipe can't be proofread now.",
    });
    expect(after).not.toHaveBeenCalled();
  });
});

describe("answerProofreadQuestionsAction", () => {
  const ANSWER = {
    recipeId: RECIPE_A,
    runId: RECIPE_B,
    answer: " Two 400 ml tins. ",
  };

  it("refuses a lead of another team and a member, and schedules nothing", async () => {
    for (const [rank, led] of [
      ["team_lead", ["structures"]],
      ["camp_member", []],
    ] as const) {
      actAs(rank, [...led]);
      expect(await answerProofreadQuestionsAction(ANSWER)).toEqual({
        ok: false,
        error: RUN_REFUSAL,
      });
    }
    expect(answerProofreadQuestions).not.toHaveBeenCalled();
    expect(after).not.toHaveBeenCalled();
  });

  it("queues the next round as the Kitchen lead, and runs it after the response", async () => {
    actAs("team_lead", ["kitchen"], "lead-1");
    expect(await answerProofreadQuestionsAction(ANSWER)).toEqual({
      ok: true,
      data: { runId: "run-a" },
    });
    expect(answerProofreadQuestions).toHaveBeenCalledWith(
      expect.objectContaining({
        recipeId: RECIPE_A,
        runId: RECIPE_B,
        actorId: "lead-1",
        answer: "Two 400 ml tins.",
        promptVersion: PROMPT_VERSIONS.recipeSource,
        revisionPromptVersion: PROMPT_VERSIONS.recipeSourceRevision,
      }),
    );
    const task = vi.mocked(after).mock.calls[0]![0] as () => Promise<unknown>;
    await task();
    expect(processRuns).toHaveBeenCalledWith({ runIds: ["run-a"] });
  });

  it("needs an answer", async () => {
    expect(
      await answerProofreadQuestionsAction({ ...ANSWER, answer: "  " }),
    ).toEqual({ ok: false, error: "Write your answer." });
    expect(answerProofreadQuestions).not.toHaveBeenCalled();
  });
});

describe("proofreadProgressAction", () => {
  it("gives a Kitchen reviewer the stage, outcome, questions and error, and nothing else", async () => {
    actAs("team_lead", ["kitchen"], "lead-1");
    expect(await proofreadProgressAction({ recipeId: RECIPE_A })).toEqual({
      ok: true,
      data: {
        stage: "checking",
        outcome: "running",
        questions: null,
        error: null,
      },
    });
    expect(getProofreadProgress).toHaveBeenCalledWith(RECIPE_A, undefined);
  });

  it("reads the run the editor started, after handing back runs that will never finish", async () => {
    const RUN = "9b2f3c1e-4d5a-4e6b-8c7d-0e1f2a3b4c5d";
    await proofreadProgressAction({ recipeId: RECIPE_A, runId: RUN });
    expect(getProofreadProgress).toHaveBeenCalledWith(RECIPE_A, RUN);
    // No cron: the poll resets a stuck run first, so it can read as failed.
    expect(resetStaleRuns).toHaveBeenCalledTimes(1);
    expect(vi.mocked(resetStaleRuns).mock.invocationCallOrder[0]!).toBeLessThan(
      vi.mocked(getProofreadProgress).mock.invocationCallOrder[0]!,
    );
    expect(
      (await proofreadProgressAction({ recipeId: RECIPE_A, runId: "nope" })).ok,
    ).toBe(false);
  });

  it("refuses a lead of another team and a member, reading nothing", async () => {
    for (const [rank, led] of [
      ["team_lead", ["structures"]],
      ["camp_member", []],
    ] as const) {
      actAs(rank, [...led]);
      expect(await proofreadProgressAction({ recipeId: RECIPE_A })).toEqual({
        ok: false,
        error: REVIEW_REFUSAL,
      });
    }
    expect(getProofreadProgress).not.toHaveBeenCalled();
  });

  it("answers null for a recipe with no run, and refuses a bad id", async () => {
    vi.mocked(getProofreadProgress).mockResolvedValueOnce(null);
    expect(await proofreadProgressAction({ recipeId: RECIPE_A })).toEqual({
      ok: true,
      data: null,
    });
    expect((await proofreadProgressAction({ recipeId: "not-an-id" })).ok).toBe(
      false,
    );
  });
});
