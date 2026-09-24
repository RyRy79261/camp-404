import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sourceFromText } from "@camp404/core";
import { KitchenRecipe } from "@camp404/types";
import type { ProofreadProgress, RecipeDetail } from "@/lib/recipes";

// The recipe page decides on the server who sees what: "Edit source", "Send
// for proofreading" (or "Claude needs more details — answer here" while
// Claude's questions wait, read on the server), the "Proofread for N plates"
// button and the Decision buttons render for a Kitchen lead or a captain (2A),
// no run counter or daily limit renders for anyone, and a recipe that is not
// in the book is a 404 for anyone but its submitter and the Kitchen's
// reviewers. In the book it has two tabs, the choice in the address: Recipe
// (the plate selector from the meal plan, the reader, "How this was scaled")
// and History (where it came from, the list of recipe versions and the list
// of source versions, each opening on its own page and never in place).

vi.mock("@/lib/captain-gate", () => ({ captainPageGate: vi.fn() }));
vi.mock("@/lib/users", () => ({ getLeadTeams: vi.fn() }));
vi.mock("@/lib/recipes", () => ({
  getPlateCount: vi.fn(async () => null),
  getProofreadProgress: vi.fn(async () => null),
  getRecipeDetail: vi.fn(),
  listRecipeSources: vi.fn(async () => []),
  resetStaleRuns: vi.fn(async () => ({ reset: 0 })),
}));
vi.mock("@/lib/meal-plan", () => ({ getMealPlan: vi.fn() }));
vi.mock("../actions", () => ({
  acceptProofreadAction: vi.fn(),
  addLessonAction: vi.fn(),
  answerProofreadQuestionsAction: vi.fn(),
  decideRecipeAction: vi.fn(),
  proofreadPlatesAction: vi.fn(),
  proofreadProgressAction: vi.fn(async () => ({ ok: true, data: null })),
  proofreadRecipeAction: vi.fn(),
  resubmitRecipeAction: vi.fn(),
  retypeRecipeTextAction: vi.fn(),
}));
vi.mock("@camp404/ui/components/toast", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));
const NOT_FOUND = new Error("NEXT_NOT_FOUND");
const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push }),
  notFound: () => {
    throw NOT_FOUND;
  },
}));

import { toast } from "@camp404/ui/components/toast";
import { captainPageGate } from "@/lib/captain-gate";
import { getMealPlan } from "@/lib/meal-plan";
import {
  getPlateCount,
  getProofreadProgress,
  getRecipeDetail,
  listRecipeSources,
  resetStaleRuns,
  type PlateCountDetail,
} from "@/lib/recipes";
import { getLeadTeams } from "@/lib/users";
import {
  choose,
  installSelectPolyfills,
  optionNames,
} from "@/components/questionnaires/__tests__/select-helpers";
import { proofreadPlatesAction, proofreadRecipeAction } from "../actions";
import RecipePage from "./page";

const RECIPE = "11111111-1111-4111-8111-111111111111";

const RECIPE_BODY = KitchenRecipe.parse({
  title: "Camp dal",
  plates: 45,
  ingredients: [
    { name: "Red lentils", category: "legume", quantity: 3, unit: "kg" },
  ],
  steps: [{ instruction: "Simmer.", uses: ["Red lentils"] }],
});

function detail(overrides: Partial<RecipeDetail> = {}): RecipeDetail {
  return {
    id: RECIPE,
    title: "Camp dal",
    status: "approved",
    source: "text",
    sourceUrl: null,
    text: "Lentils, water, cumin.",
    suitabilityNote: "One pot.",
    submitterId: "member",
    submitterName: "Rita Member",
    textAuthorId: "member",
    blockedReason: null,
    rerunRequest: null,
    changesNote: null,
    rejectionReason: null,
    lastError: null,
    acceptedVersionId: null,
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

/** A meal plan whose distinct counts are these, over as many days. */
function mealPlanWith(counts: number[]) {
  vi.mocked(getMealPlan).mockResolvedValue({
    cycle: 2026,
    daysOnSite: counts.length || 1,
    days: counts.length
      ? counts.map((n) => ({ breakfast: n, lunch: 0, dinner: n }))
      : [{ breakfast: 0, lunch: 0, dinner: 0 }],
    version: 1,
    firstDay: null,
    updatedAt: null,
  });
}

async function renderAs(
  viewer: { id: string; rank: "camp_member" | "team_lead" | "captain" },
  leads: string[],
  recipe: RecipeDetail,
  query: Record<string, string> = {},
) {
  vi.mocked(captainPageGate).mockResolvedValue({
    campUser: { id: viewer.id },
    rank: viewer.rank,
    cleared: true,
  } as never);
  vi.mocked(getLeadTeams).mockResolvedValue(leads);
  vi.mocked(getRecipeDetail).mockResolvedValue(recipe);
  render(
    await RecipePage({
      params: Promise.resolve({ id: RECIPE }),
      searchParams: Promise.resolve(query),
    }),
  );
}

const BOOK_BODY = KitchenRecipe.parse({
  title: "Camp dal",
  summary: "Lentils, soft and spiced.",
  plates: 45,
  totalTimeMinutes: 90,
  ingredients: [
    { name: "Red lentils", category: "legume", quantity: 3, unit: "kg" },
  ],
  steps: [{ phase: "Cook", instruction: "Simmer.", uses: ["Red lentils"] }],
  notes: [{ kind: "warning", body: "Stir the bottom." }],
});

const FOR_60: PlateCountDetail = {
  plates: 60,
  lines: [
    {
      name: "Red lentils",
      quantity: 3.9,
      quantityMax: null,
      unit: "kg",
      note: null,
    },
  ],
  pots: 2,
  notes: ["Cook in two pots."],
  report: { changed: ["SECRET-COUNT-REPORT"], unsure: [] },
  source: "proofread",
};

/** An accepted recipe, version 1 for 45 plates, also proofread for 60. */
function inBook(overrides: Partial<RecipeDetail> = {}): RecipeDetail {
  return detail({
    status: "accepted",
    sourceUrl: "https://example.com/dal",
    acceptedVersionId: "v1",
    currentVersion: {
      id: "v1",
      version: 1,
      plates: 45,
      recipe: BOOK_BODY,
      report: null,
      scalingNotes: [],
      runId: null,
      reason: "Written by hand",
      authorName: "Kit Lead",
      createdAt: new Date("2026-09-21T08:00:00Z"),
    },
    plateCounts: [
      {
        plates: 45,
        source: "version",
        pots: null,
        createdAt: new Date("2026-09-21T08:00:00Z"),
      },
      {
        plates: 60,
        source: "proofread",
        pots: 2,
        createdAt: new Date("2026-09-22T08:00:00Z"),
      },
    ],
    versions: [
      {
        id: "v1",
        version: 1,
        plates: 45,
        recipe: BOOK_BODY,
        report: null,
        scalingNotes: [],
        reason: "Written by hand",
        runId: null,
        authorName: "Kit Lead",
        createdAt: new Date("2026-09-21T08:00:00Z"),
      },
    ],
    ...overrides,
  });
}

/** No run counter and no per-day limit, anywhere on the page. */
const NO_RUN_COUNT = /runs? left|per day|tomorrow/i;

const SEND = "Send for proofreading";
const ANSWER = "Claude needs more details — answer here";
const QUESTIONS = ["How much coconut milk?", "Ground or whole cumin?"];

function progress(overrides: Partial<ProofreadProgress>): ProofreadProgress {
  return {
    runId: "run-1",
    kind: "source",
    outcome: "succeeded",
    stage: "saving",
    questions: null,
    error: null,
    ...overrides,
  };
}

const tabs = () => screen.getByRole("navigation", { name: "Recipe tabs" });

afterEach(cleanup);

installSelectPolyfills();

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getPlateCount).mockResolvedValue(null);
  vi.mocked(getProofreadProgress).mockResolvedValue(null);
  vi.mocked(listRecipeSources).mockResolvedValue([]);
  mealPlanWith([45, 60]);
});

describe("recipe page", () => {
  it("gives a Kitchen lead and a captain Send for proofreading in the heading, and no one else", async () => {
    for (const [viewer, leads, recipe] of [
      [{ id: "lead", rank: "team_lead" }, ["kitchen"], detail()],
      [{ id: "cap", rank: "captain" }, [], detail()],
      [{ id: "cap", rank: "captain" }, [], inBook()],
    ] as const) {
      await renderAs(viewer, [...leads], recipe);
      expect(screen.getByRole("button", { name: SEND })).toBeTruthy();
      // The old card, its plates box and its note are gone.
      expect(
        screen.queryByRole("article", { name: "Turn into a recipe" }),
      ).toBeNull();
      expect(
        screen.queryByLabelText(/What should Claude do differently/),
      ).toBeNull();
      expect(document.body.textContent).not.toMatch(NO_RUN_COUNT);
      cleanup();
    }
    expect(getLeadTeams).toHaveBeenCalledTimes(1);
    vi.mocked(getProofreadProgress).mockClear();

    for (const [viewer, leads, recipe] of [
      [{ id: "member", rank: "camp_member" }, [], detail()],
      [{ id: "someone", rank: "camp_member" }, [], inBook()],
      [{ id: "struct", rank: "team_lead" }, ["structures"], inBook()],
    ] as const) {
      await renderAs(viewer, [...leads], recipe);
      expect(screen.queryByRole("button", { name: SEND })).toBeNull();
      expect(getProofreadProgress).not.toHaveBeenCalled();
      cleanup();
    }
  });

  it("sends the recipe as it stands, and spins while Claude has it", async () => {
    vi.mocked(proofreadRecipeAction).mockResolvedValue({
      ok: true,
      data: { runId: "run-2" },
    });
    await renderAs({ id: "cap", rank: "captain" }, [], inBook());
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: SEND }));
    });
    expect(proofreadRecipeAction).toHaveBeenCalledWith({ recipeId: RECIPE });
    expect(
      (
        screen.getByRole("button", {
          name: /Claude is proofreading/,
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    cleanup();

    // A refusal says why in a toast, and the button stays.
    vi.mocked(proofreadRecipeAction).mockResolvedValue({
      ok: false,
      error: "Paste the recipe's text first. Claude does not open links.",
    });
    await renderAs({ id: "cap", rank: "captain" }, [], inBook());
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: SEND }));
    });
    expect(toast.error).toHaveBeenCalledWith(
      "Paste the recipe's text first. Claude does not open links.",
    );
    expect(screen.getByRole("button", { name: SEND })).toBeTruthy();
    cleanup();

    // A run already with Claude when the page loads spins too.
    vi.mocked(getProofreadProgress).mockResolvedValue(
      progress({ outcome: "running", stage: "reading" }),
    );
    await renderAs(
      { id: "lead", rank: "team_lead" },
      ["kitchen"],
      inBook({ status: "analysing" }),
    );
    expect(screen.queryByRole("button", { name: SEND })).toBeNull();
    expect(
      screen.getByRole("button", { name: /Claude is proofreading/ }),
    ).toBeTruthy();
  });

  it("asks for the answer instead of sending again while Claude's questions wait, read on the server", async () => {
    vi.mocked(getProofreadProgress).mockResolvedValue(
      progress({ questions: QUESTIONS }),
    );
    for (const recipe of [inBook(), detail()]) {
      await renderAs({ id: "lead", rank: "team_lead" }, ["kitchen"], recipe);
      expect(getProofreadProgress).toHaveBeenLastCalledWith(RECIPE);
      expect(screen.queryByRole("button", { name: SEND })).toBeNull();
      const answer = screen.getByRole("button", { name: ANSWER });
      // It opens the questions dialog.
      expect(screen.queryByRole("dialog")).toBeNull();
      await act(async () => {
        fireEvent.click(answer);
      });
      const dialog = screen.getByRole("dialog", {
        name: "Claude needs more before it can write this recipe",
      });
      expect(within(dialog).getByText(QUESTIONS[1]!)).toBeTruthy();
      expect(within(dialog).getByLabelText("Your answer")).toBeTruthy();
      cleanup();
    }

    // A plate count's run is not the recipe's: Send stays.
    vi.mocked(getProofreadProgress).mockResolvedValue(
      progress({ kind: "plates", outcome: "running" }),
    );
    await renderAs({ id: "cap", rank: "captain" }, [], inBook());
    expect(screen.getByRole("button", { name: SEND })).toBeTruthy();
  });

  it("hands back stuck runs before it reads the recipe, every time it loads", async () => {
    const order: string[] = [];
    vi.mocked(resetStaleRuns).mockImplementationOnce(async () => {
      order.push("reset");
      return { reset: 1 };
    });
    vi.mocked(captainPageGate).mockResolvedValue({
      campUser: { id: "cap" },
      rank: "captain",
      cleared: true,
    } as never);
    vi.mocked(getRecipeDetail).mockImplementationOnce(async () => {
      order.push("read");
      return detail({ status: "approved", lastError: "The run stopped." });
    });
    render(await RecipePage({ params: Promise.resolve({ id: RECIPE }) }));
    expect(order).toEqual(["reset", "read"]);
    // The page has rendered (its title is there), and it carries no
    // "last run failed" line: the owner has not approved one.
    expect(screen.getByRole("heading", { level: 1 })).toBeTruthy();
    expect(screen.queryByText(/The last run failed/)).toBeNull();
    cleanup();

    // A member reading an ordinary recipe resets too: there is no cron.
    vi.mocked(resetStaleRuns).mockClear();
    await renderAs({ id: "member", rank: "camp_member" }, [], detail());
    expect(resetStaleRuns).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/The last run failed/)).toBeNull();
  });

  it("shows a Kitchen lead an older draft of Claude's with the same reader and a button to accept it", async () => {
    await renderAs(
      { id: "lead", rank: "team_lead" },
      ["kitchen"],
      detail({
        status: "proofread",
        latestRun: {
          id: "run-1",
          outcome: "succeeded",
          requestedAt: new Date("2026-09-22T08:00:00Z"),
          finishedAt: new Date("2026-09-22T08:01:00Z"),
          note: null,
          plates: 45,
          promptVersion: "2026-09-25.1",
          model: "claude-opus-4-8",
          error: null,
          draft: {
            recipe: RECIPE_BODY,
            report: { changed: ["Cups to grams."], unsure: [] },
          },
          draftUnreadable: false,
          stage: null,
          questions: null,
        },
      }),
    );
    const draft = screen.getByRole("article", { name: "Claude's recipe" });
    expect(
      within(draft).getByText(
        "Written for 45 plates. Accepting saves it as version 1.",
      ),
    ).toBeTruthy();
    expect(
      within(draft).getByRole("region", { name: "Ingredients" }).textContent,
    ).toContain("3 kg");
    expect(
      within(draft).getByRole("list", { name: "Step 1 uses" }).textContent,
    ).toBe("3 kgRed lentils");
    expect(within(draft).getByText("Simmer.")).toBeTruthy();
    expect(within(draft).getByText("Cups to grams.")).toBeTruthy();
    expect(
      within(draft).getByRole("button", { name: "Accept Claude's recipe" }),
    ).toBeTruthy();
    // The structured editor is gone: the draft is accepted as written.
    expect(within(draft).queryByRole("link")).toBeNull();
    expect(screen.getByRole("article", { name: "Original" })).toBeTruthy();
  });

  it("records a run that only asked questions as asking, not as writing the recipe", async () => {
    const asked = {
      id: "run-q",
      outcome: "succeeded" as const,
      requestedAt: new Date("2026-09-22T08:00:00Z"),
      finishedAt: new Date("2026-09-22T08:01:00Z"),
      note: null,
      plates: 45,
      promptVersion: "2026-09-24.1",
      model: "claude-opus-4-8",
      error: null,
      draft: null,
      draftUnreadable: false,
      stage: null,
      questions: ["How much coconut milk?"],
    };
    await renderAs(
      { id: "lead", rank: "team_lead" },
      ["kitchen"],
      detail({ status: "approved", latestRun: asked }),
    );
    expect(screen.getByText("Claude asked questions")).toBeTruthy();
    expect(screen.queryByText("Claude wrote it as a recipe")).toBeNull();
    cleanup();

    // A run that did write it still says so.
    await renderAs(
      { id: "lead", rank: "team_lead" },
      ["kitchen"],
      detail({
        status: "approved",
        latestRun: { ...asked, questions: null },
      }),
    );
    expect(screen.getByText("Claude wrote it as a recipe")).toBeTruthy();
  });

  it("says a run stored in an older shape cannot be accepted", async () => {
    await renderAs(
      { id: "lead", rank: "team_lead" },
      ["kitchen"],
      detail({
        status: "proofread",
        latestRun: {
          id: "run-1",
          outcome: "succeeded",
          requestedAt: new Date("2026-09-22T08:00:00Z"),
          finishedAt: new Date("2026-09-22T08:01:00Z"),
          note: null,
          plates: null,
          promptVersion: "2026-09-24.1",
          model: "claude-opus-4-8",
          error: null,
          draft: null,
          draftUnreadable: true,
          stage: null,
          questions: null,
        },
      }),
    );
    const draft = screen.getByRole("article", { name: "Claude's recipe" });
    expect(within(draft).getByText(/in an older shape/)).toBeTruthy();
    expect(within(draft).queryByRole("button")).toBeNull();
  });

  it("shows the Decision buttons to a Kitchen lead on a suggestion, not to its submitter", async () => {
    await renderAs(
      { id: "lead", rank: "team_lead" },
      ["kitchen"],
      detail({ status: "suggested" }),
    );
    const decision = screen.getByRole("article", { name: "Decision" });
    expect(
      within(decision).getByRole("button", { name: "Approve" }),
    ).toBeTruthy();
    cleanup();

    await renderAs(
      { id: "member", rank: "camp_member" },
      [],
      detail({ status: "suggested" }),
    );
    expect(
      within(screen.getByRole("article", { name: "Decision" })).queryByRole(
        "button",
        { name: "Approve" },
      ),
    ).toBeNull();
    expect(screen.getByText("Lentils, water, cumin.")).toBeTruthy();
  });

  it("is a 404 for another member until the recipe is in the book", async () => {
    await expect(
      renderAs({ id: "someone", rank: "camp_member" }, [], detail()),
    ).rejects.toBe(NOT_FOUND);
    // A lead of another team is no Kitchen reviewer either.
    await expect(
      renderAs({ id: "someone", rank: "team_lead" }, ["structures"], detail()),
    ).rejects.toBe(NOT_FOUND);
  });

  it("opens on the Recipe tab: only the refined recipe, for a member of the book", async () => {
    await renderAs({ id: "someone", rank: "camp_member" }, [], inBook());
    expect(
      screen.getByRole("heading", { level: 1, name: "Camp dal" }),
    ).toBeTruthy();
    expect(screen.getByText("Kitchen / Recipes")).toBeTruthy();
    expect(
      screen.getByText("Written for 45 plates · Version 1 · Total 1 h 30 min"),
    ).toBeTruthy();
    expect(screen.getByText("Lentils, soft and spiced.")).toBeTruthy();
    expect(screen.getByRole("list", { name: "Step 1 uses" }).textContent).toBe(
      "3 kgRed lentils",
    );
    expect(screen.getByRole("region", { name: "Cook notes" })).toBeTruthy();

    // The tabs: Recipe first and chosen, History a link that keeps the tab.
    const links = within(tabs()).getAllByRole("link");
    expect(links.map((l) => l.textContent)).toEqual(["Recipe", "History"]);
    expect(links[0]!.getAttribute("aria-current")).toBe("page");
    expect(links[1]!.getAttribute("href")).toBe(
      `/kitchen/recipes/${RECIPE}?tab=history`,
    );

    // Nothing of the History tab.
    for (const name of [
      "Where it came from",
      "Recipe versions",
      "Lessons learned",
      "Activity",
    ]) {
      expect(screen.queryByRole("article", { name })).toBeNull();
    }
    expect(screen.queryByText("Lentils, water, cumin.")).toBeNull();
    expect(screen.queryByText("One pot.")).toBeNull();
    expect(screen.queryByRole("button", { name: "Add note" })).toBeNull();
    expect(listRecipeSources).not.toHaveBeenCalled();
  });

  it("keeps the History tab in the address: where it came from, and lists of versions that open on their own pages", async () => {
    const recipe = inBook({
      acceptedVersionId: "v2",
      versions: [
        {
          id: "v2",
          version: 2,
          plates: 45,
          recipe: BOOK_BODY,
          report: null,
          scalingNotes: ["SCALING-NOTE-V2"],
          reason: "Less cumin",
          runId: null,
          authorName: "Kit Lead",
          createdAt: new Date("2026-09-22T08:00:00Z"),
        },
        inBook().versions[0]!,
      ],
      lessons: [
        {
          id: "l1",
          versionId: "v1",
          body: "LESSON-ON-V1",
          cycle: 2026,
          authorName: "Rita Member",
          createdAt: new Date("2026-09-23T08:00:00Z"),
        },
      ],
    });
    await renderAs({ id: "someone", rank: "camp_member" }, [], recipe, {
      tab: "history",
    });
    const links = within(tabs()).getAllByRole("link");
    expect(links[1]!.getAttribute("aria-current")).toBe("page");
    expect(links[0]!.getAttribute("href")).toBe(`/kitchen/recipes/${RECIPE}`);
    expect(
      screen.queryByRole("navigation", { name: "Plate count" }),
    ).toBeNull();

    expect(
      screen.getByRole("article", { name: "Where it came from" }),
    ).toBeTruthy();
    const versions = screen.getByRole("article", { name: "Recipe versions" });
    // A list: each version is a link to its own page, newest first.
    expect(
      within(versions)
        .getAllByRole("link")
        .map((l) => [l.textContent, l.getAttribute("href")]),
    ).toEqual([
      ["Version 2", `/kitchen/recipes/${RECIPE}/versions/2`],
      ["Version 1", `/kitchen/recipes/${RECIPE}/versions/1`],
    ]);
    expect(within(versions).getByText("Current")).toBeTruthy();
    // Nothing opens in place: no recipe, no notes, nothing to expand.
    expect(document.querySelector("details")).toBeNull();
    expect(screen.queryByRole("list", { name: "Step 1 uses" })).toBeNull();
    expect(screen.queryByText("SCALING-NOTE-V2")).toBeNull();
    // Lessons live on their version's page, not in a card here.
    expect(
      screen.queryByRole("article", { name: "Lessons learned" }),
    ).toBeNull();
    expect(screen.queryByText("LESSON-ON-V1")).toBeNull();
    expect(screen.queryByRole("button", { name: "Add note" })).toBeNull();

    // Not the member's words: no original text, no source versions.
    expect(screen.queryByText("Original text")).toBeNull();
    expect(screen.queryByText("Lentils, water, cumin.")).toBeNull();
    expect(
      screen.queryByRole("article", { name: "Source versions" }),
    ).toBeNull();
    expect(listRecipeSources).not.toHaveBeenCalled();
  });

  it("gives no reviewer a way to start a variation", async () => {
    for (const [viewer, leads] of [
      [{ id: "lead", rank: "team_lead" }, ["kitchen"]],
      [{ id: "cap", rank: "captain" }, []],
    ] as const) {
      for (const tab of ["recipe", "history"]) {
        await renderAs(viewer, [...leads], inBook(), { tab });
        expect(screen.queryByText(/variation/i)).toBeNull();
        cleanup();
      }
    }
  });

  it("lists every source version for the submitter and the reviewers, each a link to its own page", async () => {
    vi.mocked(listRecipeSources).mockResolvedValue([
      {
        id: "s2",
        version: 2,
        serves: 4,
        sections: sourceFromText("SECOND-SOURCE-WORDS"),
        authorId: "lead",
        authorName: "Kit Lead",
        createdAt: new Date("2026-09-22T08:00:00Z"),
      },
      {
        id: "s1",
        version: 1,
        serves: null,
        sections: sourceFromText("FIRST-SOURCE-WORDS"),
        authorId: "member",
        authorName: "Rita Member",
        createdAt: new Date("2026-09-20T08:00:00Z"),
      },
    ]);
    for (const [viewer, leads] of [
      [{ id: "member", rank: "camp_member" }, []],
      [{ id: "lead", rank: "team_lead" }, ["kitchen"]],
    ] as const) {
      await renderAs(viewer, [...leads], inBook(), { tab: "history" });
      const source = screen.getByRole("article", {
        name: "Where it came from",
      });
      // The pasted text is source version 1: a link below, never shown here.
      expect(within(source).queryByText("Original text")).toBeNull();
      expect(within(source).queryByText("Lentils, water, cumin.")).toBeNull();
      expect(document.querySelector("details")).toBeNull();
      expect(within(source).getByText("One pot.")).toBeTruthy();
      expect(
        within(source).getByRole("link", { name: "https://example.com/dal" }),
      ).toBeTruthy();
      const sources = screen.getByRole("article", { name: "Source versions" });
      expect(
        within(sources)
          .getAllByRole("link")
          .map((l) => [l.textContent, l.getAttribute("href")]),
      ).toEqual([
        ["Source version 2", `/kitchen/recipes/${RECIPE}/sources/2`],
        ["Source version 1", `/kitchen/recipes/${RECIPE}/sources/1`],
      ]);
      // The words open on the source version's own page, never here.
      expect(within(sources).queryByText("SECOND-SOURCE-WORDS")).toBeNull();
      expect(within(sources).queryByText("FIRST-SOURCE-WORDS")).toBeNull();
      expect(sources.querySelector("details")).toBeNull();
      expect(listRecipeSources).toHaveBeenLastCalledWith(RECIPE);
      cleanup();
    }
  });

  it("keeps the plate count in the address on both tabs' links", async () => {
    await renderAs({ id: "someone", rank: "camp_member" }, [], inBook(), {
      plates: "45",
    });
    let links = within(tabs()).getAllByRole("link");
    expect(links[1]!.getAttribute("href")).toBe(
      `/kitchen/recipes/${RECIPE}?tab=history&plates=45`,
    );
    cleanup();

    await renderAs({ id: "someone", rank: "camp_member" }, [], inBook(), {
      tab: "history",
      plates: "45",
    });
    links = within(tabs()).getAllByRole("link");
    expect(links[1]!.getAttribute("aria-current")).toBe("page");
    expect(links[0]!.getAttribute("href")).toBe(
      `/kitchen/recipes/${RECIPE}?plates=45`,
    );
  });

  it("shows no one Claude's reports or an Activity card on the History tab", async () => {
    vi.mocked(getPlateCount).mockImplementation(async (_v, plates) =>
      plates === 60 ? FOR_60 : null,
    );
    const recipe = inBook({
      versions: [
        {
          ...inBook().versions[0]!,
          report: { changed: ["SECRET-VERSION-REPORT"], unsure: [] },
        },
      ],
    });
    for (const [viewer, leads] of [
      [{ id: "someone", rank: "camp_member" }, []],
      [{ id: "lead", rank: "team_lead" }, ["kitchen"]],
      [{ id: "cap", rank: "captain" }, []],
    ] as const) {
      await renderAs(viewer, [...leads], recipe, { tab: "history" });
      // The tab has rendered: its version list is there.
      expect(
        screen.getByRole("article", { name: "Recipe versions" }),
      ).toBeTruthy();
      expect(
        screen.queryByRole("article", { name: "Claude's reports" }),
      ).toBeNull();
      expect(screen.queryByRole("article", { name: "Activity" })).toBeNull();
      expect(screen.queryByText("SECRET-VERSION-REPORT")).toBeNull();
      expect(screen.queryByText("SECRET-COUNT-REPORT")).toBeNull();
      // Nor are the counts' reports read for it.
      expect(getPlateCount).not.toHaveBeenCalled();
      cleanup();
    }

    // Not on the Recipe tab.
    await renderAs({ id: "lead", rank: "team_lead" }, ["kitchen"], recipe);
    expect(screen.queryByText("SECRET-VERSION-REPORT")).toBeNull();
  });

  it("offers one selector of the meal plan's counts and every ready count, smallest first, on the count in the address", async () => {
    mealPlanWith([60, 50, 45, 50]);
    const recipe = inBook({
      plateCounts: [
        ...inBook().plateCounts,
        {
          plates: 70,
          source: "proofread",
          pots: 2,
          createdAt: new Date("2026-09-23T08:00:00Z"),
        },
      ],
    });
    await renderAs({ id: "someone", rank: "camp_member" }, [], recipe, {
      plates: "50",
    });
    const bar = screen.getByRole("navigation", { name: "Plate count" });
    const select = within(bar).getByRole("combobox", { name: "Plates" });
    // The count asked for is the one selected, ready or not.
    expect(select.textContent).toBe("50 plates");
    expect(await optionNames(select)).toEqual([
      "45 plates",
      "50 plates",
      "60 plates",
      "70 plates",
    ]);
    // Picking a count puts it in the address; the server draws it.
    await choose(select, "60 plates");
    expect(push).toHaveBeenLastCalledWith(
      `/kitchen/recipes/${RECIPE}?plates=60`,
    );
    cleanup();

    // No count in the address: the count shown is selected.
    await renderAs({ id: "someone", rank: "camp_member" }, [], recipe);
    expect(screen.getByRole("combobox", { name: "Plates" }).textContent).toBe(
      "45 plates",
    );
  });

  it("marks a count with a stored result Verified, an indicator and not a control, and shows its amounts", async () => {
    mealPlanWith([45, 50, 60]);
    vi.mocked(getPlateCount).mockImplementation(async (_v, plates) =>
      plates === 60 ? FOR_60 : null,
    );
    for (const [viewer, leads] of [
      [{ id: "someone", rank: "camp_member" }, []],
      [{ id: "lead", rank: "team_lead" }, ["kitchen"]],
    ] as const) {
      await renderAs(viewer, [...leads], inBook(), { plates: "60" });
      expect(getPlateCount).toHaveBeenCalledWith("v1", 60);
      const bar = screen.getByRole("navigation", { name: "Plate count" });
      const verified = within(bar).getByText("Verified");
      expect(verified.closest("a, button")).toBeNull();
      expect(within(bar).queryByRole("button")).toBeNull();
      expect(within(bar).queryByRole("link")).toBeNull();
      expect(within(bar).queryByText(/Proofread for|Not proofread/)).toBeNull();
      expect(screen.queryByRole("status")).toBeNull();
      expect(
        screen.getByRole("list", { name: "Step 1 uses" }).textContent,
      ).toBe("3.9 kgRed lentils");
      const notes = screen.getByRole("region", { name: "Cook notes" });
      expect(within(notes).getByText("For 60 plates")).toBeTruthy();
      expect(within(notes).getByText("Cook in 2 pots.")).toBeTruthy();
      // The meta line still names the recipe's own count and version.
      expect(
        screen.getByText(
          "Written for 45 plates · Version 1 · Total 1 h 30 min",
        ),
      ).toBeTruthy();
      // The Recipe tab keeps the count in the address.
      expect(
        within(tabs())
          .getByRole("link", { name: "Recipe" })
          .getAttribute("href"),
      ).toBe(`/kitchen/recipes/${RECIPE}?plates=60`);
      cleanup();
    }
  });

  it("says With Claude while Claude writes a count, to everyone, with no button", async () => {
    mealPlanWith([45, 80]);
    for (const [viewer, leads] of [
      [{ id: "someone", rank: "camp_member" }, []],
      [{ id: "cap", rank: "captain" }, []],
    ] as const) {
      await renderAs(viewer, [...leads], inBook({ openPlateRuns: [80] }), {
        plates: "80",
      });
      const bar = screen.getByRole("navigation", { name: "Plate count" });
      expect(within(bar).getByText("With Claude…").tagName).toBe("SPAN");
      expect(within(bar).queryByRole("button")).toBeNull();
      expect(within(bar).queryByText("Verified")).toBeNull();
      expect(screen.getByRole("status").textContent).toContain(
        "Claude is proofreading 80 plates.",
      );
      // The body stays on the version's own count until the result is in.
      expect(
        screen.getByRole("list", { name: "Step 1 uses" }).textContent,
      ).toBe("3 kgRed lentils");
      cleanup();
    }

    // A count whose paid run failed says so, and why.
    mealPlanWith([45, 70]);
    await renderAs(
      { id: "someone", rank: "camp_member" },
      [],
      inBook({
        failedPlateRuns: [
          {
            plates: 70,
            error: "Claude took too long.",
            finishedAt: new Date("2026-09-24T10:00:00Z"),
          },
        ],
      }),
      { plates: "70" },
    );
    expect(screen.getByRole("status").textContent).toContain(
      "The last run for 70 plates failed: Claude took too long.",
    );
  });

  it("gives a Kitchen lead and a captain Proofread for N plates on a count with no result, for the same version", async () => {
    mealPlanWith([45, 50, 60]);
    vi.mocked(proofreadPlatesAction).mockResolvedValue({
      ok: true,
      data: { runId: "run-9" },
    });
    for (const [viewer, leads] of [
      [{ id: "lead", rank: "team_lead" }, ["kitchen"]],
      [{ id: "cap", rank: "captain" }, []],
    ] as const) {
      await renderAs(viewer, [...leads], inBook(), { plates: "50" });
      const bar = screen.getByRole("navigation", { name: "Plate count" });
      const button = within(bar).getByRole("button", {
        name: "Proofread for 50 plates",
      });
      expect(within(bar).getAllByRole("button")).toHaveLength(1);
      expect(within(bar).queryByText("Verified")).toBeNull();
      expect(screen.getByRole("status").textContent).toBe(
        "Not proofread for 50 plates yet. Showing 45 plates.",
      );
      // The body shows the version's own count, not the one asked for.
      expect(
        screen.getByRole("list", { name: "Step 1 uses" }).textContent,
      ).toBe("3 kgRed lentils");
      await act(async () => {
        fireEvent.click(button);
      });
      expect(proofreadPlatesAction).toHaveBeenLastCalledWith({
        recipeId: RECIPE,
        versionId: "v1",
        plates: 50,
        rerun: false,
      });
      expect(push).toHaveBeenLastCalledWith(
        `/kitchen/recipes/${RECIPE}?plates=50`,
      );
      expect(document.body.textContent).not.toMatch(NO_RUN_COUNT);
      cleanup();
    }

    // It spins, and cannot be pressed twice, only while the action runs.
    let finish: (value: {
      ok: true;
      data: { runId: string };
    }) => void = () => {};
    vi.mocked(proofreadPlatesAction).mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    await renderAs({ id: "cap", rank: "captain" }, [], inBook(), {
      plates: "50",
    });
    const button = screen.getByRole("button", {
      name: "Proofread for 50 plates",
    });
    expect(button.querySelector(".animate-spin")).toBeNull();
    await act(async () => {
      fireEvent.click(button);
    });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    expect(button.querySelector(".animate-spin")).not.toBeNull();
    await act(async () => {
      finish({ ok: true, data: { runId: "run-9" } });
    });
    expect((button as HTMLButtonElement).disabled).toBe(false);
    expect(button.querySelector(".animate-spin")).toBeNull();
    cleanup();

    // A refused run says why in a toast.
    vi.mocked(proofreadPlatesAction).mockResolvedValue({
      ok: false,
      error: "Someone else saved a newer version of this recipe.",
    });
    await renderAs({ id: "cap", rank: "captain" }, [], inBook(), {
      plates: "50",
    });
    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: "Proofread for 50 plates" }),
      );
    });
    expect(toast.error).toHaveBeenCalledWith(
      "Someone else saved a newer version of this recipe.",
    );
  });

  it("tells everyone else a count with no result is not proofread yet, with no button", async () => {
    mealPlanWith([45, 50]);
    for (const [viewer, leads] of [
      [{ id: "someone", rank: "camp_member" }, []],
      [{ id: "struct", rank: "team_lead" }, ["structures"]],
    ] as const) {
      await renderAs(viewer, [...leads], inBook(), { plates: "50" });
      const bar = screen.getByRole("navigation", { name: "Plate count" });
      expect(within(bar).getByText("Not proofread yet")).toBeTruthy();
      expect(within(bar).queryByRole("button")).toBeNull();
      expect(screen.queryByText(/Proofread for/)).toBeNull();
      expect(
        screen.getByRole("list", { name: "Step 1 uses" }).textContent,
      ).toBe("3 kgRed lentils");
      cleanup();
    }
  });

  it("links a Kitchen reviewer to the source editor from the heading, and no one else", async () => {
    await renderAs({ id: "lead", rank: "team_lead" }, ["kitchen"], inBook());
    expect(
      screen.getByRole("link", { name: "Edit source" }).getAttribute("href"),
    ).toBe(`/kitchen/recipes/${RECIPE}/edit`);
    cleanup();

    await renderAs({ id: "cap", rank: "captain" }, [], inBook());
    expect(screen.getByRole("link", { name: "Edit source" })).toBeTruthy();
    cleanup();

    // The member who suggested it, and a lead of another team, read it only.
    await renderAs({ id: "member", rank: "camp_member" }, [], inBook());
    expect(screen.queryByRole("link", { name: "Edit source" })).toBeNull();
    cleanup();
    await renderAs(
      { id: "struct", rank: "team_lead" },
      ["structures"],
      inBook(),
    );
    expect(screen.queryByRole("link", { name: "Edit source" })).toBeNull();
    cleanup();

    // While Claude is writing a new version, the editor has nothing to open.
    await renderAs(
      { id: "lead", rank: "team_lead" },
      ["kitchen"],
      inBook({ status: "analysing" }),
    );
    expect(screen.queryByRole("link", { name: "Edit source" })).toBeNull();
  });

  it("links a Kitchen reviewer to the source editor before the book, while approved or proofread", async () => {
    for (const status of ["approved", "proofread"] as const) {
      await renderAs(
        { id: "lead", rank: "team_lead" },
        ["kitchen"],
        detail({ status, blockedReason: "No consent." }),
      );
      expect(
        screen.getByRole("link", { name: "Edit source" }).getAttribute("href"),
      ).toBe(`/kitchen/recipes/${RECIPE}/edit`);
      expect(screen.queryByText(/by hand/)).toBeNull();
      cleanup();
    }

    // Its submitter reads the page, but edits nothing.
    await renderAs(
      { id: "member", rank: "camp_member" },
      [],
      detail({ status: "approved" }),
    );
    expect(screen.queryByRole("link", { name: "Edit source" })).toBeNull();
    cleanup();

    // Nor is it offered before the recipe is approved, and nor is Send.
    await renderAs(
      { id: "lead", rank: "team_lead" },
      ["kitchen"],
      detail({ status: "suggested" }),
    );
    expect(screen.queryByRole("link", { name: "Edit source" })).toBeNull();
    expect(screen.queryByRole("button", { name: SEND })).toBeNull();
  });

  it("says how the recipe was scaled, last on the Recipe tab, to everyone who reads the book", async () => {
    const recipe = inBook({
      currentVersion: {
        ...inBook().currentVersion!,
        scalingNotes: [
          "The source serves 4; the lentils are ten times it.",
          "Salt and cumin were scaled more slowly than the lentils.",
        ],
      },
    });
    await renderAs({ id: "someone", rank: "camp_member" }, [], recipe);
    const scaling = screen.getByRole("region", { name: "How this was scaled" });
    expect(
      within(scaling)
        .getAllByRole("listitem")
        .map((li) => li.textContent),
    ).toEqual([
      "The source serves 4; the lentils are ten times it.",
      "Salt and cumin were scaled more slowly than the lentils.",
    ]);
    // At the very bottom, after the cook notes.
    const notes = screen.getByRole("region", { name: "Cook notes" });
    expect(
      notes.compareDocumentPosition(scaling) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    cleanup();

    // No notes (a version from before them): no section.
    await renderAs({ id: "someone", rank: "camp_member" }, [], inBook());
    expect(screen.getByRole("region", { name: "Cook notes" })).toBeTruthy();
    expect(
      screen.queryByRole("region", { name: "How this was scaled" }),
    ).toBeNull();
    expect(screen.queryByText("How this was scaled")).toBeNull();
  });
});
