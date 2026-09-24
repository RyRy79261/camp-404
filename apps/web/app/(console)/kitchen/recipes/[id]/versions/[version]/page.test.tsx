import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { KitchenRecipe } from "@camp404/types";
import type { RecipeDetail } from "@/lib/recipes";

// One recipe version on its own page (the owner, 2026-09-24): the heading
// says which version it is and whether it is the current one, the recipe is
// the Recipe tab's reader (read only), a link goes back to History, and Notes
// lists this version's lessons with the add-a-lesson form, which adds to this
// version. Who sees it is the recipe page's rule.

vi.mock("@/lib/captain-gate", () => ({ captainPageGate: vi.fn() }));
vi.mock("@/lib/users", () => ({ getLeadTeams: vi.fn(async () => []) }));
vi.mock("@/lib/recipes", () => ({ getRecipeDetail: vi.fn() }));
vi.mock("../../../actions", () => ({
  acceptProofreadAction: vi.fn(),
  addLessonAction: vi.fn(async () => ({ ok: true })),
  retypeRecipeTextAction: vi.fn(),
}));
vi.mock("@camp404/ui/components/toast", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));
const NOT_FOUND = new Error("NEXT_NOT_FOUND");
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  notFound: () => {
    throw NOT_FOUND;
  },
}));

import { captainPageGate } from "@/lib/captain-gate";
import { getRecipeDetail } from "@/lib/recipes";
import { addLessonAction } from "../../../actions";
import RecipeVersionPage from "./page";

const RECIPE = "11111111-1111-4111-8111-111111111111";

const body = (instruction: string) =>
  KitchenRecipe.parse({
    title: "Camp dal",
    summary: `Summary for ${instruction}`,
    plates: 45,
    ingredients: [
      { name: "Red lentils", category: "legume", quantity: 3, unit: "kg" },
    ],
    steps: [{ phase: "Cook", instruction, uses: ["Red lentils"] }],
  });

function version(n: number, instruction: string) {
  return {
    id: `v${n}`,
    version: n,
    plates: 45,
    recipe: body(instruction),
    report: null,
    scalingNotes: [],
    reason: null,
    runId: null,
    authorName: "Kit Lead",
    createdAt: new Date("2026-09-21T08:00:00Z"),
  };
}

function detail(overrides: Partial<RecipeDetail> = {}): RecipeDetail {
  return {
    id: RECIPE,
    title: "Camp dal",
    status: "accepted",
    source: "text",
    sourceUrl: null,
    text: "Lentils.",
    suitabilityNote: null,
    submitterId: "member",
    submitterName: "Rita Member",
    textAuthorId: "member",
    blockedReason: null,
    rerunRequest: null,
    changesNote: null,
    rejectionReason: null,
    lastError: null,
    acceptedVersionId: "v2",
    createdAt: new Date("2026-09-20T08:00:00Z"),
    latestRun: null,
    currentVersion: null,
    plateCounts: [],
    openPlateRuns: [],
    failedPlateRuns: [],
    versions: [version(2, "SIMMER-V2"), version(1, "SIMMER-V1")],
    lessons: [
      {
        id: "l2",
        versionId: "v2",
        body: "LESSON-ON-V2",
        cycle: 2026,
        authorName: "Rita Member",
        createdAt: new Date("2026-09-23T08:00:00Z"),
      },
      {
        id: "l1",
        versionId: "v1",
        body: "LESSON-ON-V1",
        cycle: 2026,
        authorName: "Kit Lead",
        createdAt: new Date("2026-09-22T08:00:00Z"),
      },
    ],
    history: [],
    ...overrides,
  };
}

async function renderAs(
  n: string,
  recipe: RecipeDetail = detail(),
  viewer = "someone",
) {
  vi.mocked(captainPageGate).mockResolvedValue({
    campUser: { id: viewer },
    rank: "camp_member",
    cleared: true,
  } as never);
  vi.mocked(getRecipeDetail).mockResolvedValue(recipe);
  render(
    await RecipeVersionPage({
      params: Promise.resolve({ id: RECIPE, version: n }),
    }),
  );
}

afterEach(cleanup);
beforeEach(() => vi.clearAllMocks());

describe("recipe version page", () => {
  it("names the recipe and the version, reads it with the recipe reader, and links back to History", async () => {
    await renderAs("1");
    expect(
      screen.getByRole("heading", { level: 1, name: "Camp dal — Version 1" }),
    ).toBeTruthy();
    expect(screen.getByText("SIMMER-V1")).toBeTruthy();
    expect(screen.queryByText("SIMMER-V2")).toBeNull();
    expect(screen.getByRole("list", { name: "Step 1 uses" }).textContent).toBe(
      "3 kgRed lentils",
    );
    // Read only: nothing to type into but the note.
    expect(screen.getAllByRole("textbox")).toHaveLength(1);
    expect(
      screen
        .getByRole("link", { name: "Back to History" })
        .getAttribute("href"),
    ).toBe(`/kitchen/recipes/${RECIPE}?tab=history`);
  });

  it("says when the version is the current one", async () => {
    await renderAs("2");
    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Camp dal — Version 2 (current)",
      }),
    ).toBeTruthy();
  });

  it("lists only this version's lessons under Notes, and adds a lesson to this version", async () => {
    await renderAs("1");
    const notes = screen.getByRole("region", { name: "Notes" });
    expect(within(notes).getByText("LESSON-ON-V1")).toBeTruthy();
    expect(screen.queryByText("LESSON-ON-V2")).toBeNull();
    fireEvent.change(within(notes).getByLabelText("Add a note"), {
      target: { value: "Soak overnight." },
    });
    await act(async () => {
      fireEvent.click(
        within(notes).getByRole("button", { name: "Add note" }),
      );
    });
    expect(addLessonAction).toHaveBeenCalledWith({
      recipeId: RECIPE,
      versionId: "v1",
      body: "Soak overnight.",
    });
  });

  it("is a 404 for a version that does not exist, and for another member before the book", async () => {
    for (const n of ["3", "0", "x"]) {
      await expect(renderAs(n)).rejects.toBe(NOT_FOUND);
    }
    await expect(
      renderAs("1", detail({ acceptedVersionId: null })),
    ).rejects.toBe(NOT_FOUND);
  });
});
