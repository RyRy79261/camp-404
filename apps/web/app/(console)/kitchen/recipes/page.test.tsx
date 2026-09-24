import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The recipe book lists each recipe with the plates it is written for and
// every plate count it is ready for, its own count first. Its Review button
// counts what waits on a reviewer: the suggestions to decide and the drafts to
// check, never one sent back to its member. Nobody else is sent even the
// number.

vi.mock("@/lib/captain-gate", () => ({ captainPageGate: vi.fn() }));
vi.mock("@/lib/users", () => ({ getLeadTeams: vi.fn() }));
vi.mock("@/lib/recipes", () => ({
  listAwaitingAcceptance: vi.fn(),
  listMySuggestions: vi.fn(async () => []),
  listRecipeBook: vi.fn(async () => []),
  listReviewQueue: vi.fn(),
  resetStaleRuns: vi.fn(async () => ({ reset: 0 })),
}));

import { captainPageGate } from "@/lib/captain-gate";
import {
  listAwaitingAcceptance,
  listRecipeBook,
  listReviewQueue,
  resetStaleRuns,
} from "@/lib/recipes";
import { getLeadTeams } from "@/lib/users";
import RecipeBookPage from "./page";

const queued = (id: string, status: "suggested" | "changes_requested") => ({
  id,
  title: id,
  status,
  source: "text" as const,
  sourceUrl: null,
  submitterId: "u1",
  submitterName: "Rita Member",
  suitabilityNote: null,
  changesNote: null,
  createdAt: new Date("2026-09-20T08:00:00Z"),
});

const awaiting = (id: string) => ({
  id,
  title: id,
  latestRunId: "run",
  finishedAt: new Date("2026-09-21T08:00:00Z"),
  acceptedVersionId: null,
});

async function renderAs(
  rank: "camp_member" | "team_lead" | "captain",
  leads: string[] = [],
) {
  vi.mocked(captainPageGate).mockResolvedValue({
    campUser: { id: "viewer" },
    rank,
    cleared: true,
  } as never);
  vi.mocked(getLeadTeams).mockResolvedValue(leads);
  render(await RecipeBookPage());
}

afterEach(cleanup);

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(listReviewQueue).mockResolvedValue([
    queued("a", "suggested"),
    queued("b", "changes_requested"),
  ]);
  vi.mocked(listAwaitingAcceptance).mockResolvedValue([
    awaiting("c"),
    awaiting("d"),
  ]);
});

describe("recipe book", () => {
  it("shows each recipe's plates, ready counts (its own first), version and day", async () => {
    vi.mocked(listRecipeBook).mockResolvedValue([
      {
        id: "11111111-1111-4111-8111-111111111111",
        title: "Gai yang",
        status: "accepted",
        variantOfRecipeId: null,
        version: 2,
        plates: 50,
        readyPlates: [45, 50, 60],
        versionCreatedAt: new Date("2026-09-22T08:00:00Z"),
      },
      {
        id: "22222222-2222-4222-8222-222222222222",
        title: "Gai yang, tofu",
        status: "accepted",
        variantOfRecipeId: "11111111-1111-4111-8111-111111111111",
        version: 1,
        plates: 1,
        readyPlates: [1],
        versionCreatedAt: new Date("2026-09-23T08:00:00Z"),
      },
    ]);
    await renderAs("camp_member");
    const table = screen.getByRole("table", { name: "Recipe book" });
    const headers = within(table)
      .getAllByRole("columnheader")
      .map((h) => h.textContent);
    expect(headers).toEqual([
      "Recipe",
      "Written for",
      "Ready for",
      "Version",
      "Updated",
    ]);
    const [, first, second] = within(table).getAllByRole("row");
    const cells = within(first!)
      .getAllByRole("cell")
      .map((c) => c.textContent);
    expect(cells).toEqual([
      "Gai yang",
      "50 plates",
      "504560",
      "v2",
      "22 Sept 2026",
    ]);
    expect(
      within(first!)
        .getByRole("link", { name: "Gai yang" })
        .getAttribute("href"),
    ).toBe("/kitchen/recipes/11111111-1111-4111-8111-111111111111");
    expect(within(second!).getByText("Variation")).toBeTruthy();
    expect(within(second!).getByText("1 plate")).toBeTruthy();
    expect(screen.queryByText(/Vegan|Allergens/)).toBeNull();
  });

  it("offers every member the import, and a reviewer the review", async () => {
    await renderAs("captain");
    expect(
      screen
        .getByRole("link", { name: "Import a recipe" })
        .getAttribute("href"),
    ).toBe("/kitchen/recipes/new");
    expect(screen.getByRole("link", { name: "Review (3)" })).toBeTruthy();
  });

  it("counts suggestions to decide and proofreads to accept, not ones sent back", async () => {
    await renderAs("team_lead", ["kitchen"]);
    expect(screen.getByRole("link", { name: "Review (3)" })).toBeTruthy();
  });

  it("hands back stuck runs every time it loads, since there is no cron", async () => {
    await renderAs("camp_member");
    expect(resetStaleRuns).toHaveBeenCalledTimes(1);
  });

  it("reads no count for a member", async () => {
    await renderAs("camp_member");
    expect(screen.queryByRole("link", { name: /Review/ })).toBeNull();
    expect(listReviewQueue).not.toHaveBeenCalled();
    expect(listAwaitingAcceptance).not.toHaveBeenCalled();
  });
});
