import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sourceFromText } from "@camp404/core";
import type {
  ProofreadProgress,
  RecipeDetail,
  RecipeSourceVersion,
} from "@/lib/recipes";

// The source editor page decides on the server who may edit, and what the
// editor opens with: the newest source (or the pasted text, when there is
// none), the four sections in order, the Send button only while no run is
// open, and Claude's questions when the newest run asked them (with "Claude
// needs more details — answer here" where Send was). Anyone else
// reads the refusal and not a word of the recipe.

vi.mock("@/lib/captain-gate", () => ({ captainPageGate: vi.fn() }));
vi.mock("@/lib/users", () => ({ getLeadTeams: vi.fn() }));
vi.mock("@/lib/recipes", () => ({
  getRecipeDetail: vi.fn(),
  getRecipeSource: vi.fn(),
  getProofreadProgress: vi.fn(),
  resetStaleRuns: vi.fn(async () => ({ reset: 0 })),
}));
vi.mock("../../actions", () => ({
  sendSourceForProofreadingAction: vi.fn(),
  answerProofreadQuestionsAction: vi.fn(),
  proofreadProgressAction: vi.fn(async () => ({ ok: true, data: null })),
}));
// Tiptap needs a real layout; the page only needs to know which sections it
// draws, and with what text.
vi.mock("@/components/recipes/source-section-editor", () => ({
  SourceSectionEditor: ({
    ariaLabel,
    value,
  }: {
    ariaLabel: string;
    value: unknown;
  }) => (
    <div role="textbox" aria-label={ariaLabel}>
      {JSON.stringify(value)}
    </div>
  ),
}));
const NOT_FOUND = new Error("NEXT_NOT_FOUND");
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  notFound: () => {
    throw NOT_FOUND;
  },
}));

import { captainPageGate } from "@/lib/captain-gate";
import {
  getProofreadProgress,
  getRecipeDetail,
  getRecipeSource,
  resetStaleRuns,
} from "@/lib/recipes";
import { getLeadTeams } from "@/lib/users";
import EditRecipePage from "./page";

const RECIPE = "11111111-1111-4111-8111-111111111111";

function detail(overrides: Partial<RecipeDetail> = {}): RecipeDetail {
  return {
    id: RECIPE,
    title: "Camp dal",
    status: "accepted",
    source: "text",
    sourceUrl: null,
    text: "SECRET-LENTILS, simmered.",
    suitabilityNote: null,
    submitterId: "member",
    submitterName: "Rita Member",
    textAuthorId: "member",
    blockedReason: null,
    rerunRequest: null,
    changesNote: null,
    rejectionReason: null,
    lastError: null,
    acceptedVersionId: "v1",
    createdAt: new Date("2026-09-20T08:00:00Z"),
    latestRun: null,
    currentVersion: null,
    plateCounts: [],
    openPlateRuns: [],
    failedPlateRuns: [],
    versions: [],
    lessons: [],
    history: [],
    ...overrides,
  };
}

const SOURCE: RecipeSourceVersion = {
  id: "source-1",
  version: 1,
  serves: 6,
  sections: {
    ...sourceFromText("Simmer SECRET-LENTILS."),
    ingredients: sourceFromText("- 500 g red lentils").steps,
  },
  authorId: "member",
};

function progress(
  overrides: Partial<ProofreadProgress> = {},
): ProofreadProgress {
  return {
    runId: "run-1",
    kind: "source",
    outcome: "running",
    stage: "reading",
    questions: null,
    error: null,
    ...overrides,
  };
}

async function renderAs(
  viewer: { rank: "camp_member" | "team_lead" | "captain" },
  leads: string[],
  recipe: RecipeDetail | null,
  options: {
    source?: RecipeSourceVersion | null;
    run?: ProofreadProgress | null;
  } = {},
) {
  vi.mocked(captainPageGate).mockResolvedValue({
    campUser: { id: "viewer" },
    rank: viewer.rank,
    cleared: viewer.rank !== "camp_member",
  } as never);
  vi.mocked(getLeadTeams).mockResolvedValue(leads);
  vi.mocked(getRecipeDetail).mockResolvedValue(recipe);
  vi.mocked(getRecipeSource).mockResolvedValue(
    options.source === undefined ? SOURCE : options.source,
  );
  vi.mocked(getProofreadProgress).mockResolvedValue(options.run ?? null);
  render(await EditRecipePage({ params: Promise.resolve({ id: RECIPE }) }));
}

const heading = () => screen.getByRole("heading", { level: 1 }).textContent;
const sendButton = () =>
  screen.queryByRole("button", { name: "Send for proofreading" });

afterEach(cleanup);
beforeEach(() => vi.clearAllMocks());

describe("recipe source editor page", () => {
  it("refuses a Structures lead and a member, and reads nothing", async () => {
    for (const [rank, leads] of [
      ["team_lead", ["structures"]],
      ["camp_member", []],
    ] as const) {
      await renderAs({ rank }, [...leads], detail());
      expect(heading()).toBe("Edit recipe");
      expect(
        screen.getByText(
          "Only a Kitchen lead or a captain can edit a recipe's source.",
        ),
      ).toBeTruthy();
      expect(screen.queryByText(/SECRET-LENTILS/)).toBeNull();
      expect(sendButton()).toBeNull();
      expect(screen.queryByRole("textbox")).toBeNull();
      expect(getRecipeDetail).not.toHaveBeenCalled();
      expect(getRecipeSource).not.toHaveBeenCalled();
      expect(getProofreadProgress).not.toHaveBeenCalled();
      cleanup();
    }
  });

  it("opens a Kitchen lead on the newest source: serves, then the four sections in order", async () => {
    await renderAs({ rank: "team_lead" }, ["kitchen"], detail());
    expect(resetStaleRuns).toHaveBeenCalled();
    expect(heading()).toBe("Camp dal");
    expect(sendButton()).toBeTruthy();
    expect((screen.getByLabelText("Serves") as HTMLInputElement).value).toBe(
      "6",
    );
    expect(
      screen.getByText("(the size the source recipe is written for)"),
    ).toBeTruthy();
    const regions = screen.getAllByRole("region");
    expect(regions.map((r) => r.getAttribute("aria-labelledby"))).toEqual([
      "source-ingredients",
      "source-equipment",
      "source-steps",
      "source-notes",
    ]);
    expect(
      screen.getAllByRole("textbox").map((t) => t.getAttribute("aria-label")),
    ).toEqual(["Ingredients", "Equipment", "Steps", "Notes"]);
    expect(within(regions[0]!).getByRole("textbox").textContent).toContain(
      "500 g red lentils",
    );
    expect(screen.queryByRole("status", { name: "Proofreading" })).toBeNull();
  });

  it("starts a recipe with no source from its pasted text, all in Steps", async () => {
    await renderAs({ rank: "captain" }, [], detail({ status: "approved" }), {
      source: null,
    });
    expect((screen.getByLabelText("Serves") as HTMLInputElement).value).toBe(
      "",
    );
    expect(
      screen.getByRole("textbox", { name: "Steps" }).textContent,
    ).toContain("SECRET-LENTILS, simmered.");
    expect(
      screen.getByRole("textbox", { name: "Ingredients" }).textContent,
    ).not.toContain("SECRET-LENTILS");
  });

  it("hides the button while a run is open, and shows the panel at its stage", async () => {
    for (const [run, at] of [
      [progress({ outcome: "queued", stage: null }), "Sending the recipe"],
      [
        progress({ outcome: "running", stage: "reading" }),
        "Claude is reading it",
      ],
    ] as const) {
      await renderAs({ rank: "captain" }, [], detail({ status: "analysing" }), {
        run,
      });
      expect(sendButton()).toBeNull();
      const panel = screen.getByRole("status", { name: "Proofreading" });
      expect(panel.getAttribute("aria-live")).toBe("polite");
      expect(
        panel.querySelector('[aria-current="step"]')?.textContent,
      ).toContain(at);
      cleanup();
    }
  });

  it("shows the questions of an unanswered needs-info run, above Serves, with the dialog open", async () => {
    await renderAs({ rank: "team_lead" }, ["kitchen"], detail(), {
      run: progress({
        outcome: "succeeded",
        stage: "saving",
        questions: ["How much coconut milk?", "Ground or whole cumin?"],
      }),
    });
    // Read on the server, so it holds after leaving and coming back: the
    // heading asks for the answer instead of sending again. The dialog hides
    // the rest of the page from assistive technology.
    expect(
      screen.getByRole("button", {
        name: "Claude needs more details — answer here",
        hidden: true,
      }),
    ).toBeTruthy();
    expect(
      screen.queryByRole("button", {
        name: "Send for proofreading",
        hidden: true,
      }),
    ).toBeNull();
    const dialog = screen.getByRole("dialog", {
      name: "Claude needs more before it can write this recipe",
    });
    expect(within(dialog).getByText("How much coconut milk?")).toBeTruthy();
    // The same questions stay on the page as a plain block.
    expect(
      screen.getAllByText("Claude needs more before it can write this recipe"),
    ).toHaveLength(2);
    expect(screen.getAllByText("Ground or whole cumin?")).toHaveLength(2);
  });

  it("ignores a plate count's run", async () => {
    await renderAs({ rank: "captain" }, [], detail(), {
      run: progress({ kind: "plates", outcome: "running" }),
    });
    expect(sendButton()).toBeTruthy();
    expect(screen.queryByRole("status", { name: "Proofreading" })).toBeNull();
  });

  it("is a 404 for a missing recipe, a suggestion, one sent back and one rejected", async () => {
    for (const recipe of [
      null,
      detail({ status: "suggested", acceptedVersionId: null }),
      detail({ status: "changes_requested", acceptedVersionId: null }),
      detail({ status: "rejected", acceptedVersionId: null }),
    ]) {
      await expect(renderAs({ rank: "captain" }, [], recipe)).rejects.toBe(
        NOT_FOUND,
      );
    }
  });
});
