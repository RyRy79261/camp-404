import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { KitchenRecipe } from "@camp404/types";
import type { RecipeDetail } from "@/lib/recipes";

// The recipe page decides on the server who sees what: the Run button, the
// plate-count field, the Decision buttons and "Edit recipe" render for a
// Kitchen lead or a captain (2A; everyone else reads why), no run counter
// renders for anyone, and a recipe that is not in the book is a 404 for anyone
// but its submitter and the Kitchen's reviewers. "How this was scaled" is for
// every reader of the book.

vi.mock("@/lib/captain-gate", () => ({ captainPageGate: vi.fn() }));
vi.mock("@/lib/users", () => ({ getLeadTeams: vi.fn() }));
vi.mock("@/lib/recipes", () => ({
  getKitchenSettings: vi.fn(async () => ({
    recipeProofreadDailyCap: 5,
    kitchenLargestPotLitres: null,
    kitchenBurnerCount: null,
    kitchenPlatesBreakfast: 60,
    kitchenPlatesLunch: null,
    kitchenPlatesDinner: 45,
  })),
  getPlateCount: vi.fn(async () => null),
  getRecipeDetail: vi.fn(),
  resetStaleRuns: vi.fn(async () => ({ reset: 0 })),
}));
vi.mock("../actions", () => ({
  acceptProofreadAction: vi.fn(),
  addLessonAction: vi.fn(),
  decideRecipeAction: vi.fn(),
  proofreadPlatesAction: vi.fn(),
  requestRerunAction: vi.fn(),
  resubmitRecipeAction: vi.fn(),
  retypeRecipeTextAction: vi.fn(),
  runProofreadingAction: vi.fn(),
  startVariationAction: vi.fn(),
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
  getPlateCount,
  getRecipeDetail,
  resetStaleRuns,
  type PlateCountDetail,
} from "@/lib/recipes";
import { getLeadTeams } from "@/lib/users";
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
    variantOfRecipeId: null,
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
        reason: "Written by hand",
        runId: null,
        authorName: "Kit Lead",
        createdAt: new Date("2026-09-21T08:00:00Z"),
      },
    ],
    ...overrides,
  });
}

const proofreadingCard = () =>
  screen.getByRole("article", { name: "Turn into a recipe" });

/** No run counter and no per-day limit, anywhere on the page. */
const NO_RUN_COUNT = /runs? left|per day/i;

afterEach(cleanup);

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getPlateCount).mockResolvedValue(null);
});

describe("recipe page", () => {
  it("gives a Kitchen lead the Run panel (2A), and its submitter only the reason", async () => {
    await renderAs({ id: "lead", rank: "team_lead" }, ["kitchen"], detail());
    expect(
      within(proofreadingCard()).getByRole("button", {
        name: "Turn into a recipe with Claude",
      }),
    ).toBeTruthy();
    cleanup();

    await renderAs({ id: "member", rank: "camp_member" }, [], detail());
    const card = proofreadingCard();
    expect(
      within(card).getByRole("heading", { name: "Turn into a recipe" }),
    ).toBeTruthy();
    expect(
      within(card).getByText(
        "A captain or a Kitchen lead turns recipes into kitchen recipes with Claude, because each run costs money.",
      ),
    ).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: /turn into a recipe/i }),
    ).toBeNull();
  });

  it("gives a captain the Run button, with no run counter", async () => {
    await renderAs({ id: "cap", rank: "captain" }, [], detail());
    const card = proofreadingCard();
    expect(
      within(card).getByRole("button", {
        name: "Turn into a recipe with Claude",
      }),
    ).toBeTruthy();
    // The plates offered are the largest meal's.
    expect(
      (within(card).getByLabelText("Plates") as HTMLInputElement).value,
    ).toBe("60");
    expect(document.body.textContent).not.toMatch(NO_RUN_COUNT);
    expect(getLeadTeams).not.toHaveBeenCalled();
  });

  it("offers a re-run on an accepted recipe, and holds it back when the text is not cleared", async () => {
    await renderAs(
      { id: "cap", rank: "captain" },
      [],
      detail({
        status: "proofread",
        blockedReason: "The member did not agree to Claude.",
      }),
    );
    const button = within(proofreadingCard()).getByRole("button", {
      name: "Turn into a recipe again",
    }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(
      within(proofreadingCard()).getByText(
        "The member did not agree to Claude.",
      ),
    ).toBeTruthy();
  });

  it("lets a Kitchen lead re-run it, and shows an older re-run request", async () => {
    // A Kitchen lead sends it again (2A), so asking a captain is gone.
    await renderAs(
      { id: "lead", rank: "team_lead" },
      ["kitchen"],
      detail({ status: "proofread" }),
    );
    expect(
      within(proofreadingCard()).getByRole("button", {
        name: "Turn into a recipe again",
      }),
    ).toBeTruthy();
    expect(
      within(proofreadingCard()).queryByRole("button", {
        name: "Ask a captain to re-run",
      }),
    ).toBeNull();
    cleanup();

    // The member who suggested it reads the page, but asks nothing.
    await renderAs(
      { id: "member", rank: "camp_member" },
      [],
      detail({ status: "proofread" }),
    );
    expect(
      within(proofreadingCard()).queryByRole("button", {
        name: /Ask a captain/,
      }),
    ).toBeNull();
    cleanup();

    await renderAs(
      { id: "cap", rank: "captain" },
      [],
      detail({
        status: "proofread",
        rerunRequest: {
          note: "Use grams, not cups.",
          byName: "Kim Kitchen",
          at: new Date("2026-09-22T08:00:00Z"),
        },
      }),
    );
    const card = proofreadingCard();
    expect(
      within(card).getByText("Kim Kitchen asked for a re-run"),
    ).toBeTruthy();
    // The captain's note starts from the lead's words.
    expect(
      (
        within(card).getByLabelText(
          /What should Claude do differently/,
        ) as HTMLTextAreaElement
      ).value,
    ).toBe("Use grams, not cups.");
    expect(
      within(card).queryByRole("button", { name: /Ask a captain/ }),
    ).toBeNull();
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
    expect(
      within(proofreadingCard()).getByText(
        "The last run failed: The run stopped.",
      ),
    ).toBeTruthy();
    cleanup();

    // A member reading an ordinary recipe resets too: there is no cron.
    vi.mocked(resetStaleRuns).mockClear();
    await renderAs({ id: "member", rank: "camp_member" }, [], detail());
    expect(resetStaleRuns).toHaveBeenCalledTimes(1);
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

  it("shows another member the book's parts only, never the working text", async () => {
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
    expect(screen.queryByText("Lentils, water, cumin.")).toBeNull();
    expect(screen.queryByText("One pot.")).toBeNull();
    expect(screen.queryByText("Original text")).toBeNull();
    expect(
      screen.queryByRole("button", { name: /Start a variation/ }),
    ).toBeNull();
    expect(
      screen.queryByRole("article", { name: "Turn into a recipe" }),
    ).toBeNull();
    expect(screen.getByRole("button", { name: "Add lesson" })).toBeTruthy();
    // Everything not about cooking the dish comes after the recipe.
    const about = screen.getByRole("region", { name: "About this recipe" });
    const method = screen.getByRole("region", { name: "Method" });
    expect(
      method.compareDocumentPosition(about) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      within(about).getByRole("article", { name: "Versions" }),
    ).toBeTruthy();
    expect(
      within(about).getByRole("article", { name: "History" }),
    ).toBeTruthy();
  });

  it("keeps the original text in a details box for the submitter and the reviewers", async () => {
    await renderAs({ id: "member", rank: "camp_member" }, [], inBook());
    const source = screen.getByRole("article", { name: "Where it came from" });
    expect(within(source).getByText("Original text")).toBeTruthy();
    expect(within(source).getByText("Lentils, water, cumin.")).toBeTruthy();
    expect(within(source).getByText("One pot.")).toBeTruthy();
    expect(
      within(source).getByRole("link", { name: "https://example.com/dal" }),
    ).toBeTruthy();
  });

  it("switches plate counts from the address, and says when a count is not ready", async () => {
    vi.mocked(getPlateCount).mockImplementation(async (_v, plates) =>
      plates === 60 ? FOR_60 : null,
    );
    await renderAs({ id: "someone", rank: "camp_member" }, [], inBook(), {
      plates: "60",
    });
    expect(getPlateCount).toHaveBeenCalledWith("v1", 60);
    const bar = screen.getByRole("navigation", { name: "Plate count" });
    expect(
      within(bar)
        .getByRole("link", { name: "60" })
        .getAttribute("aria-current"),
    ).toBe("page");
    expect(
      within(bar).getByRole("link", { name: "45" }).getAttribute("href"),
    ).toBe(`/kitchen/recipes/${RECIPE}?plates=45`);
    expect(screen.getByRole("list", { name: "Step 1 uses" }).textContent).toBe(
      "3.9 kgRed lentils",
    );
    const notes = screen.getByRole("region", { name: "Cook notes" });
    expect(within(notes).getByText("For 60 plates")).toBeTruthy();
    expect(within(notes).getByText("Cook in 2 pots.")).toBeTruthy();
    // The meta line still names the recipe's own count.
    expect(screen.getByText(/^Written for 45 plates/)).toBeTruthy();
    cleanup();

    // A count that is not ready shows the recipe's own amounts, and says so.
    await renderAs({ id: "cap", rank: "captain" }, [], inBook(), {
      plates: "50",
    });
    expect(screen.getByRole("status").textContent).toContain(
      "Not proofread for 50 plates yet.",
    );
    expect(screen.getByRole("list", { name: "Step 1 uses" }).textContent).toBe(
      "3 kgRed lentils",
    );
    expect(
      (screen.getByLabelText("Another count") as HTMLInputElement).value,
    ).toBe("50");
    expect(
      screen.getByRole("button", { name: "Proofread for 50 plates" }),
    ).toBeTruthy();
    const plateBar = document.querySelector<HTMLElement>("[data-plate-bar]")!;
    expect(plateBar.textContent).not.toMatch(NO_RUN_COUNT);
    cleanup();

    // A count Claude is still writing is shown, but cannot be picked.
    await renderAs(
      { id: "someone", rank: "camp_member" },
      [],
      inBook({ openPlateRuns: [80] }),
      { plates: "80" },
    );
    expect(screen.getByText("80, with Claude").tagName).toBe("SPAN");
    expect(screen.getByRole("status").textContent).toContain(
      "Claude is proofreading 80 plates.",
    );
    cleanup();

    // A count whose paid run failed says so, and why.
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

  it("gives a Kitchen lead the plate-count field (2A), and tells everyone else why there is none", async () => {
    await renderAs({ id: "lead", rank: "team_lead" }, ["kitchen"], inBook());
    expect(screen.getByLabelText("Another count")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Proofread" })).toBeTruthy();
    expect(document.body.textContent).not.toMatch(NO_RUN_COUNT);
    cleanup();

    for (const [viewer, leads] of [
      [{ id: "someone", rank: "camp_member" }, []],
      [{ id: "struct", rank: "team_lead" }, ["structures"]],
    ] as const) {
      await renderAs(viewer, [...leads], inBook());
      expect(
        screen.getByText(
          "A captain or a Kitchen lead proofreads a new plate count, because each run costs money.",
        ),
      ).toBeTruthy();
      expect(screen.queryByLabelText("Another count")).toBeNull();
      expect(screen.queryByRole("button", { name: /^Proofread/ })).toBeNull();
      cleanup();
    }
  });

  it("gives a member no report, and a Kitchen reviewer both reports", async () => {
    vi.mocked(getPlateCount).mockImplementation(async (_v, plates) =>
      plates === 60 ? FOR_60 : null,
    );
    const recipe = inBook({
      currentVersion: {
        ...inBook().currentVersion!,
        report: { changed: ["SECRET-VERSION-REPORT"], unsure: [] },
      },
    });
    await renderAs({ id: "someone", rank: "camp_member" }, [], recipe, {
      plates: "60",
    });
    expect(screen.queryByText("SECRET-VERSION-REPORT")).toBeNull();
    expect(screen.queryByText("SECRET-COUNT-REPORT")).toBeNull();
    expect(
      screen.queryByRole("article", { name: "Claude's report" }),
    ).toBeNull();
    cleanup();

    await renderAs({ id: "lead", rank: "team_lead" }, ["kitchen"], recipe, {
      plates: "60",
    });
    const report = screen.getByRole("article", { name: "Claude's report" });
    expect(within(report).getByText("SECRET-VERSION-REPORT")).toBeTruthy();
    expect(within(report).getByText("SECRET-COUNT-REPORT")).toBeTruthy();
    expect(within(report).getByText("For 60 plates")).toBeTruthy();
  });

  it("links a Kitchen reviewer to the editor from the book, and no one else", async () => {
    await renderAs({ id: "lead", rank: "team_lead" }, ["kitchen"], inBook());
    expect(
      screen.getByRole("link", { name: "Edit recipe" }).getAttribute("href"),
    ).toBe(`/kitchen/recipes/${RECIPE}/edit`);
    cleanup();

    await renderAs({ id: "cap", rank: "captain" }, [], inBook());
    expect(screen.getByRole("link", { name: "Edit recipe" })).toBeTruthy();
    cleanup();

    // The member who suggested it, and a lead of another team, read it only.
    await renderAs({ id: "member", rank: "camp_member" }, [], inBook());
    expect(screen.queryByRole("link", { name: "Edit recipe" })).toBeNull();
    cleanup();
    await renderAs(
      { id: "struct", rank: "team_lead" },
      ["structures"],
      inBook(),
    );
    expect(screen.queryByRole("link", { name: "Edit recipe" })).toBeNull();
    cleanup();

    // While Claude is writing a new version, the editor has nothing to open.
    await renderAs(
      { id: "lead", rank: "team_lead" },
      ["kitchen"],
      inBook({ status: "analysing" }),
    );
    expect(screen.queryByRole("link", { name: "Edit recipe" })).toBeNull();
  });

  it("links a Kitchen reviewer to the source editor before the book, while approved or proofread", async () => {
    for (const status of ["approved", "proofread"] as const) {
      await renderAs(
        { id: "lead", rank: "team_lead" },
        ["kitchen"],
        detail({ status, blockedReason: "No consent." }),
      );
      const decision = screen.getByRole("article", { name: "Decision" });
      expect(
        within(decision)
          .getByRole("link", { name: "Edit recipe" })
          .getAttribute("href"),
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
    expect(screen.queryByRole("link", { name: "Edit recipe" })).toBeNull();
    cleanup();

    // Nor is it offered before the recipe is approved.
    await renderAs(
      { id: "lead", rank: "team_lead" },
      ["kitchen"],
      detail({ status: "suggested" }),
    );
    expect(screen.queryByRole("link", { name: "Edit recipe" })).toBeNull();
  });

  it("says how the recipe was scaled, last, to everyone who reads the book", async () => {
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
    // At the very bottom, after "About this recipe".
    const about = screen.getByRole("region", { name: "About this recipe" });
    expect(
      about.compareDocumentPosition(scaling) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    cleanup();

    // No notes (a version from before them): no section.
    await renderAs({ id: "someone", rank: "camp_member" }, [], inBook());
    expect(
      screen.getByRole("region", { name: "About this recipe" }),
    ).toBeTruthy();
    expect(
      screen.queryByRole("region", { name: "How this was scaled" }),
    ).toBeNull();
    expect(screen.queryByText("How this was scaled")).toBeNull();
  });
});
