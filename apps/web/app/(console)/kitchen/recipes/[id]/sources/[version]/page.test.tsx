import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sourceFromText } from "@camp404/core";
import type { RecipeDetail } from "@/lib/recipes";

// One source version on its own page (the owner, 2026-09-24): the heading
// says which source version it is and whether it is the current (newest) one,
// the text is read only, and a link goes back to History. The source is the
// member's words: only its submitter and the Kitchen's reviewers see it.

vi.mock("@/lib/captain-gate", () => ({ captainPageGate: vi.fn() }));
vi.mock("@/lib/users", () => ({ getLeadTeams: vi.fn() }));
vi.mock("@/lib/recipes", () => ({
  getRecipeDetail: vi.fn(),
  listRecipeSources: vi.fn(),
}));
const NOT_FOUND = new Error("NEXT_NOT_FOUND");
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw NOT_FOUND;
  },
}));

import { captainPageGate } from "@/lib/captain-gate";
import { getRecipeDetail, listRecipeSources } from "@/lib/recipes";
import { getLeadTeams } from "@/lib/users";
import RecipeSourceVersionPage from "./page";

const RECIPE = "11111111-1111-4111-8111-111111111111";

const DETAIL = {
  id: RECIPE,
  title: "Camp dal",
  submitterId: "member",
  acceptedVersionId: "v1",
} as RecipeDetail;

async function renderAs(
  n: string,
  viewer: { id: string; rank: string; leads?: string[] },
) {
  vi.mocked(captainPageGate).mockResolvedValue({
    campUser: { id: viewer.id },
    rank: viewer.rank,
    cleared: true,
  } as never);
  vi.mocked(getLeadTeams).mockResolvedValue(viewer.leads ?? []);
  render(
    await RecipeSourceVersionPage({
      params: Promise.resolve({ id: RECIPE, version: n }),
    }),
  );
}

afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getRecipeDetail).mockResolvedValue(DETAIL);
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
});

describe("source version page", () => {
  it("names the recipe and the source version, shows its words read only, and links back to History", async () => {
    await renderAs("1", { id: "member", rank: "camp_member" });
    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Camp dal — Source version 1",
      }),
    ).toBeTruthy();
    expect(screen.getByText("FIRST-SOURCE-WORDS")).toBeTruthy();
    expect(screen.queryByText("SECOND-SOURCE-WORDS")).toBeNull();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(
      screen
        .getByRole("link", { name: "Back to History" })
        .getAttribute("href"),
    ).toBe(`/kitchen/recipes/${RECIPE}?tab=history`);
  });

  it("says when it is the current source version", async () => {
    await renderAs("2", { id: "lead", rank: "team_lead", leads: ["kitchen"] });
    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Camp dal — Source version 2 (current)",
      }),
    ).toBeTruthy();
    expect(screen.getByText("SECOND-SOURCE-WORDS")).toBeTruthy();
  });

  it("is a 404 for any other member, and for a source version that does not exist", async () => {
    await expect(
      renderAs("1", { id: "someone", rank: "camp_member" }),
    ).rejects.toBe(NOT_FOUND);
    await expect(
      renderAs("1", { id: "lead", rank: "team_lead", leads: ["structures"] }),
    ).rejects.toBe(NOT_FOUND);
    expect(listRecipeSources).not.toHaveBeenCalled();
    await expect(
      renderAs("3", { id: "member", rank: "camp_member" }),
    ).rejects.toBe(NOT_FOUND);
  });
});
