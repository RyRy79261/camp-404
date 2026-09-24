import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The review queue: a lead of another team reaches the rung but reads no row;
// a Kitchen lead gets the suggestions, the recipes ready for Claude with the
// picker and the plate counts (2A), and the drafts to check, but never the
// captain's token usage, which is not even read for them. Whoever sends picks
// the plates from the meals in this year's meal plan (each at its largest
// day), or types another count. No one sees a run counter.

vi.mock("@/lib/captain-gate", () => ({ captainPageGate: vi.fn() }));
vi.mock("@/lib/users", () => ({ getLeadTeams: vi.fn() }));
vi.mock("@/lib/meal-plan", () => ({
  getMealPlan: vi.fn(async () => ({
    cycle: 2026,
    daysOnSite: 2,
    days: [
      { breakfast: 0, lunch: 55, dinner: 40 },
      { breakfast: 0, lunch: 30, dinner: 45 },
    ],
    version: 1,
    firstDay: null,
    updatedAt: null,
  })),
}));
vi.mock("@/lib/recipes", () => ({
  listReviewQueue: vi.fn(),
  listAwaitingAcceptance: vi.fn(),
  listReadyToProofread: vi.fn(),
  listProofreadRuns: vi.fn(),
  proofreadTokenTotals: vi.fn(),
  resetStaleRuns: vi.fn(async () => ({ reset: 0 })),
}));
vi.mock("../actions", () => ({ runProofreadingAction: vi.fn() }));
vi.mock("@camp404/ui/components/toast", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

import { toast } from "@camp404/ui/components/toast";
import { captainPageGate } from "@/lib/captain-gate";
import { getMealPlan } from "@/lib/meal-plan";
import {
  listAwaitingAcceptance,
  listProofreadRuns,
  listReadyToProofread,
  listReviewQueue,
  proofreadTokenTotals,
  resetStaleRuns,
} from "@/lib/recipes";
import { runProofreadingAction } from "../actions";
import { getLeadTeams } from "@/lib/users";
import RecipeReviewPage from "./page";

const RECIPE = "11111111-1111-4111-8111-111111111111";

afterEach(cleanup);

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(listReviewQueue).mockResolvedValue([
    {
      id: RECIPE,
      title: "Camp dal",
      status: "suggested",
      source: "url",
      sourceUrl: "https://example.com/dal",
      submitterId: "u1",
      submitterName: "Rita Member",
      suitabilityNote: null,
      changesNote: null,
      createdAt: new Date("2026-09-20T08:00:00Z"),
    },
  ]);
  vi.mocked(listAwaitingAcceptance).mockResolvedValue([]);
  vi.mocked(listReadyToProofread).mockResolvedValue([
    {
      id: RECIPE,
      title: "Camp dal",
      status: "approved",
      blockedReason: null,
      lastError: null,
      acceptedVersionId: null,
      rerunRequest: { note: "Use grams, not cups.", byName: "Kim Kitchen" },
      updatedAt: new Date("2026-09-20T08:00:00Z"),
    },
  ]);
  vi.mocked(listProofreadRuns).mockResolvedValue([
    {
      id: "r1",
      recipeId: RECIPE,
      recipeTitle: "Camp dal",
      requestedByName: "Cap Tain",
      requestedAt: new Date("2026-09-21T08:00:00Z"),
      startedAt: new Date("2026-09-21T08:00:01Z"),
      finishedAt: new Date("2026-09-21T08:01:00Z"),
      outcome: "succeeded",
      inputTokens: 4321,
      outputTokens: 987,
      promptVersion: "2026-09-24.1",
      model: "claude-opus-4-8",
      error: null,
    },
  ]);
  vi.mocked(proofreadTokenTotals).mockResolvedValue({
    since: new Date("2026-09-01T00:00:00Z"),
    runs: 1,
    inputTokens: 4321,
    outputTokens: 987,
  });
});

async function renderAs(
  rank: "camp_member" | "team_lead" | "captain",
  leads: string[] = [],
) {
  vi.mocked(captainPageGate).mockResolvedValue({
    campUser: { id: "viewer" },
    rank,
    cleared: rank !== "camp_member",
  } as never);
  vi.mocked(getLeadTeams).mockResolvedValue(leads);
  render(await RecipeReviewPage());
}

describe("recipe review page", () => {
  it("locks a plain member and reads nothing", async () => {
    await renderAs("camp_member");
    expect(screen.getByText("Kitchen leads and captains")).toBeTruthy();
    expect(listReviewQueue).not.toHaveBeenCalled();
  });

  it("refuses a lead of another team, and reads no suggestion", async () => {
    await renderAs("team_lead", ["structures"]);
    expect(
      screen.getByText("Only a Kitchen lead or a captain reviews recipes."),
    ).toBeTruthy();
    expect(screen.queryByText("Camp dal")).toBeNull();
    expect(listReviewQueue).not.toHaveBeenCalled();
    expect(listAwaitingAcceptance).not.toHaveBeenCalled();
    // There is no cron, so even this page load hands back stuck runs; it
    // reads and returns nothing.
    expect(resetStaleRuns).toHaveBeenCalledTimes(1);
  });

  it("hands back stopped runs before a reviewer reads the lists", async () => {
    await renderAs("team_lead", ["kitchen"]);
    expect(resetStaleRuns).toHaveBeenCalledTimes(1);
    expect(vi.mocked(resetStaleRuns).mock.invocationCallOrder[0]!).toBeLessThan(
      vi.mocked(listAwaitingAcceptance).mock.invocationCallOrder[0]!,
    );
  });

  it("gives a Kitchen lead the suggestions, the picker (2A) and the drafts, and no token usage", async () => {
    vi.mocked(listAwaitingAcceptance).mockResolvedValue([
      {
        id: "22222222-2222-4222-8222-222222222222",
        title: "Gai yang",
        latestRunId: "run",
        finishedAt: new Date("2026-09-21T08:00:00Z"),
        acceptedVersionId: null,
      },
    ]);
    await renderAs("team_lead", ["structures", "kitchen"]);
    const table = screen.getByRole("table", { name: "Suggestions" });
    expect(within(table).getByText("Rita Member")).toBeTruthy();
    expect(within(table).getByText("Link")).toBeTruthy();
    expect(
      within(table)
        .getByRole("link", { name: "Camp dal" })
        .getAttribute("href"),
    ).toBe(`/kitchen/recipes/${RECIPE}`);

    // The recipes waiting for Claude, which a Kitchen lead sends too.
    const ready = screen.getByRole("article", { name: "Ready for Claude" });
    expect(
      within(ready).getByRole("table", { name: "Recipes ready for Claude" }),
    ).toBeTruthy();
    expect(
      within(ready).getAllByRole("checkbox", { name: "Pick Camp dal" }),
    ).not.toHaveLength(0);
    expect(
      (within(ready).getByLabelText("Plates") as HTMLSelectElement).value,
    ).toBe("lunch");
    expect(
      within(ready).getByRole("button", {
        name: "Turn into recipes with Claude",
      }),
    ).toBeTruthy();

    const drafts = screen.getByRole("region", { name: "Drafts to check" });
    expect(
      within(drafts).getByRole("table", { name: "Drafts to check" })
        .textContent,
    ).toMatch(/Gai yang/);

    expect(screen.queryByText("Proofreading usage")).toBeNull();
    expect(document.body.textContent).not.toMatch(/runs? left|per day/i);
    expect(getMealPlan).toHaveBeenCalledTimes(1);
    expect(listProofreadRuns).not.toHaveBeenCalled();
    expect(proofreadTokenTotals).not.toHaveBeenCalled();
  });

  it("gives a captain the picker, the meals' plates and the tokens, never a price or a run count", async () => {
    await renderAs("captain");
    expect(getLeadTeams).not.toHaveBeenCalled();
    // Present first, then the absences.
    expect(
      screen.getByRole("heading", { level: 1, name: "Review recipes" }),
    ).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/runs? left|per day/i);
    const ready = screen.getByRole("article", { name: "Ready for Claude" });
    // The meals that are set, then Other; the largest meal is chosen.
    const plates = within(ready).getByLabelText("Plates") as HTMLSelectElement;
    expect(Array.from(plates.options).map((o) => o.text)).toEqual([
      "Lunch · 55 plates",
      "Dinner · 45 plates",
      "Other",
    ]);
    expect(plates.value).toBe("lunch");
    expect(
      within(ready).getByText("Claude writes every amount for 55 plates."),
    ).toBeTruthy();
    expect(
      within(ready).getAllByRole("checkbox", { name: "Pick Camp dal" }),
    ).not.toHaveLength(0);
    expect(
      within(ready).getByRole("button", {
        name: "Turn into recipes with Claude",
      }),
    ).toBeTruthy();
    // A Kitchen lead's request to run it again shows beside the recipe.
    expect(
      within(ready).getAllByText(
        "Kim Kitchen asked for a re-run: Use grams, not cups.",
      ),
    ).not.toHaveLength(0);

    const usage = screen.getByRole("article", { name: "Proofreading usage" });
    expect(usage.textContent).toMatch(
      /This month:\s*4\s321 input tokens, 987 output tokens/,
    );
    const runs = within(usage).getByRole("table", {
      name: "Recent proofreading runs",
    });
    expect(within(runs).getByText("Cap Tain")).toBeTruthy();
    expect(within(runs).getByText("2026-09-24.1")).toBeTruthy();
    expect(within(runs).getByText("claude-opus-4-8")).toBeTruthy();
    expect(usage.textContent).not.toMatch(/\bR\s?\d|\$|USD|ZAR|price/);
    // The month's tokens, with no count of runs beside them.
    expect(usage.textContent).not.toMatch(/over \d+ runs?/);
  });

  it("sends the picked recipes for a meal's plates, and says how many went", async () => {
    vi.mocked(runProofreadingAction).mockResolvedValue({
      ok: true,
      data: { queued: 1 },
    });
    await renderAs("captain");
    const ready = screen.getByRole("article", { name: "Ready for Claude" });
    fireEvent.change(within(ready).getByLabelText("Plates"), {
      target: { value: "dinner" },
    });
    fireEvent.click(
      within(ready).getAllByRole("checkbox", { name: "Pick Camp dal" })[0]!,
    );
    fireEvent.click(
      within(ready).getByRole("button", {
        name: "Turn into recipes with Claude",
      }),
    );
    await waitFor(() =>
      expect(runProofreadingAction).toHaveBeenCalledWith({
        recipeIds: [RECIPE],
        note: "",
        plates: 45,
      }),
    );
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith("Sent 1 recipe to Claude"),
    );
  });

  it("takes another count under Other, and puts a wrong one beside its field", async () => {
    vi.mocked(runProofreadingAction).mockResolvedValue({
      ok: true,
      data: { queued: 1 },
    });
    await renderAs("captain");
    const ready = screen.getByRole("article", { name: "Ready for Claude" });
    fireEvent.change(within(ready).getByLabelText("Plates"), {
      target: { value: "other" },
    });
    const other = within(ready).getByLabelText(
      "Number of plates",
    ) as HTMLInputElement;
    expect(other.value).toBe("55");
    fireEvent.click(
      within(ready).getAllByRole("checkbox", { name: "Pick Camp dal" })[0]!,
    );
    fireEvent.change(other, { target: { value: "501" } });
    const send = within(ready).getByRole("button", {
      name: "Turn into recipes with Claude",
    });
    fireEvent.click(send);
    expect(
      await within(ready).findByText("Cook for at most 500 plates."),
    ).toBeTruthy();
    expect(other.getAttribute("aria-invalid")).toBe("true");
    expect(runProofreadingAction).not.toHaveBeenCalled();

    fireEvent.change(other, { target: { value: "30" } });
    fireEvent.click(send);
    await waitFor(() =>
      expect(runProofreadingAction).toHaveBeenCalledWith(
        expect.objectContaining({ plates: 30 }),
      ),
    );
  });

  it("offers only Other, at 40 plates, when no meal is set", async () => {
    vi.mocked(getMealPlan).mockResolvedValueOnce({
      cycle: 2026,
      daysOnSite: 1,
      days: [{ breakfast: 0, lunch: 0, dinner: 0 }],
      version: 0,
      firstDay: null,
      updatedAt: null,
    });
    await renderAs("captain");
    const ready = screen.getByRole("article", { name: "Ready for Claude" });
    const plates = within(ready).getByLabelText("Plates") as HTMLSelectElement;
    expect(Array.from(plates.options).map((o) => o.text)).toEqual(["Other"]);
    expect(
      (within(ready).getByLabelText("Number of plates") as HTMLInputElement)
        .value,
    ).toBe("40");
  });
});
