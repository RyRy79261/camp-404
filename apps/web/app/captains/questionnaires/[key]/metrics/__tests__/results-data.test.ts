import { beforeEach, describe, expect, it, vi } from "vitest";

// The captain gate and the year resolution. Mocked at the module boundary so
// the server-only auth and DB modules stay out of the unit run — what is being
// asserted is the ORDER of the checks (rank before read) and the arithmetic,
// neither of which needs a database.

vi.mock("@/lib/auth", () => ({ getAuthenticatedUserOrRedirect: vi.fn() }));
vi.mock("@/lib/users", () => ({
  ensureCampUser: vi.fn(),
  hasCampAccess: vi.fn(),
  isApproved: vi.fn(),
}));
vi.mock("next/navigation", () => ({ notFound: vi.fn(), redirect: vi.fn() }));
vi.mock("@camp404/db/questionnaire-definitions", () => ({
  getDefinitionMetaRow: vi.fn(),
}));
vi.mock("@camp404/db/questionnaire-results", () => ({
  listActivationResponses: vi.fn(),
  listActivationsForCycle: vi.fn(),
  listResultCycles: vi.fn(),
}));
vi.mock("@/lib/camp-config", () => ({ getCurrentCycle: vi.fn() }));
vi.mock("@/lib/questionnaire-definitions", () => ({
  getBuilderDefinition: vi.fn(),
}));

import { getAuthenticatedUserOrRedirect } from "@/lib/auth";
import { ensureCampUser, hasCampAccess, isApproved } from "@/lib/users";
import { getDefinitionMetaRow } from "@camp404/db/questionnaire-definitions";
import {
  listActivationResponses,
  listActivationsForCycle,
  listResultCycles,
} from "@camp404/db/questionnaire-results";
import { getCurrentCycle } from "@/lib/camp-config";
import { getBuilderDefinition } from "@/lib/questionnaire-definitions";
import {
  cycleLabel,
  emptyStateFor,
  loadResults,
  respondentsOf,
  summarise,
  type ResultsView,
} from "../results-data";

const KEY = "feedback";

function asRank(rank: "member" | "team_lead" | "captain") {
  vi.mocked(ensureCampUser).mockResolvedValue({
    id: "viewer",
    rank,
  } as never);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getAuthenticatedUserOrRedirect).mockResolvedValue({
    primaryEmail: "captain@example.com",
  } as never);
  vi.mocked(hasCampAccess).mockReturnValue(true);
  vi.mocked(isApproved).mockReturnValue(true);
  asRank("captain");
  vi.mocked(getDefinitionMetaRow).mockResolvedValue({
    key: KEY,
    status: "published",
    version: "1",
    createdBy: "someone",
  } as never);
  vi.mocked(getBuilderDefinition).mockResolvedValue({
    version: "1",
    title: "Camp feedback",
    pages: [
      {
        id: "p1",
        type: "question",
        title: "",
        blocks: [
          {
            kind: "question",
            question: {
              id: "colour",
              kind: "short_text",
              prompt: "Colour",
              maxLength: 120,
              required: true,
            },
          },
        ],
      },
    ],
  } as never);
  vi.mocked(listResultCycles).mockResolvedValue([2027, 2026]);
  vi.mocked(getCurrentCycle).mockResolvedValue({
    year: 2027,
    startedAt: "2027-01-01T00:00:00Z",
    endedAt: null,
  });
  vi.mocked(listActivationResponses).mockResolvedValue([]);
  vi.mocked(listActivationsForCycle).mockResolvedValue([]);
});

describe("loadResults — the captain gate", () => {
  it("refuses a team lead and never reads a single answer", async () => {
    asRank("team_lead");

    const access = await loadResults(KEY);

    expect(access).toEqual({ ok: false, reason: "locked" });
    // Withheld server-side (§4.1): the refusal happens before the read, so the
    // answers are never fetched, let alone rendered and hidden with CSS.
    expect(listActivationResponses).not.toHaveBeenCalled();
    expect(getDefinitionMetaRow).not.toHaveBeenCalled();
  });

  it("refuses a plain member", async () => {
    asRank("member");
    expect(await loadResults(KEY)).toEqual({ ok: false, reason: "locked" });
  });

  it("lets a captain through", async () => {
    const access = await loadResults(KEY);
    expect(access.ok).toBe(true);
    expect(listActivationResponses).toHaveBeenCalledWith({
      definitionKey: KEY,
      cycle: 2027,
    });
  });

  it("has no results for a questionnaire that was never published", async () => {
    vi.mocked(getDefinitionMetaRow).mockResolvedValue({
      key: KEY,
      status: "draft",
      version: null,
      createdBy: "someone",
    } as never);

    expect(await loadResults(KEY)).toEqual({ ok: false, reason: "draft" });
    expect(listActivationResponses).not.toHaveBeenCalled();
  });

  it("still shows results for an unpublished questionnaire", async () => {
    // Taking a questionnaire offline preserves its answers (§6.3).
    vi.mocked(getDefinitionMetaRow).mockResolvedValue({
      key: KEY,
      status: "unpublished",
      version: "1",
      createdBy: "someone",
    } as never);

    expect((await loadResults(KEY)).ok).toBe(true);
  });
});

describe("loadResults — which year", () => {
  it("defaults to the year the camp is in", async () => {
    const access = await loadResults(KEY);
    expect(access.ok && access.view.cycle).toBe(2027);
    expect(access.ok && access.view.cycleOptions).toEqual([2027, 2026]);
  });

  it("reads last year's results when asked for them", async () => {
    const access = await loadResults(KEY, "2026");
    expect(access.ok && access.view.cycle).toBe(2026);
    expect(listActivationResponses).toHaveBeenCalledWith({
      definitionKey: KEY,
      cycle: 2026,
    });
  });

  it("falls back to the newest year for a year with nothing in it", async () => {
    const access = await loadResults(KEY, "1999");
    expect(access.ok && access.view.cycle).toBe(2027);
  });

  it("offers the current year even before it has any answers", async () => {
    vi.mocked(listResultCycles).mockResolvedValue([2026]);
    const access = await loadResults(KEY);
    expect(access.ok && access.view.cycleOptions).toEqual([2027, 2026]);
  });

  it("falls back to the sentinel year on a camp that hasn't named one", async () => {
    vi.mocked(listResultCycles).mockResolvedValue([]);
    vi.mocked(getCurrentCycle).mockResolvedValue(null);
    const access = await loadResults(KEY);
    expect(access.ok && access.view.cycle).toBe(1);
    expect(cycleLabel(1, null)).toBe("This year");
  });
});

// --- The pure view-model half --------------------------------------------

const ROW = {
  userId: "u1",
  displayName: "Ada",
  profileImageUrl: null,
  gateStatus: null,
  gateVersion: null,
  gateActivationId: null,
  gateDueAt: null,
  responses: null,
  definitionVersion: null,
  completedAt: null,
  updatedAt: null,
};

function viewWith(over: Partial<ResultsView>): ResultsView {
  return {
    key: KEY,
    title: "Camp feedback",
    questions: [],
    cycle: 2027,
    cycleOptions: [2027],
    currentCycle: 2027,
    rows: [],
    activations: [],
    activeActivation: null,
    ...over,
  };
}

const activation = {
  id: "act1",
  version: "1",
  title: "Camp feedback",
  status: "open" as const,
  cycle: 2027,
  dueAt: null,
  openedAt: new Date("2027-02-01T00:00:00Z"),
  closedAt: null,
  createdAt: new Date("2027-02-01T00:00:00Z"),
};

describe("summarise", () => {
  it("counts finished answers, not part-filled drafts", () => {
    const view = viewWith({
      rows: [
        { ...ROW, userId: "a", responses: { q: 1 }, completedAt: new Date() },
        // Saved on a page advance and abandoned — a row, but not an answer.
        { ...ROW, userId: "b", responses: { q: 1 }, completedAt: null },
        { ...ROW, userId: "c" },
      ],
    });

    const summary = summarise(view);
    expect(summary.respondents).toBe(1);
    expect(summary.inProgress).toBe(1);
    expect(respondentsOf(view).map((r) => r.userId)).toEqual(["a"]);
  });

  it("counts reach against the send being viewed, and excludes expired gates", () => {
    const view = viewWith({
      activations: [activation],
      activeActivation: activation,
      rows: [
        {
          ...ROW,
          userId: "a",
          gateStatus: "completed",
          gateActivationId: "act1",
          responses: {},
          completedAt: new Date(),
        },
        {
          ...ROW,
          userId: "b",
          gateStatus: "pending",
          gateActivationId: "act1",
        },
        // Left over from a send that was closed: not an obligation, not an
        // answer, and so not in the completion denominator (§7.1).
        {
          ...ROW,
          userId: "c",
          gateStatus: "expired",
          gateActivationId: "act1",
        },
        // Someone else's gate entirely — a different questionnaire's send.
        { ...ROW, userId: "d", gateStatus: "pending", gateActivationId: "old" },
      ],
    });

    const summary = summarise(view);
    expect(summary.sent).toBe(3);
    expect(summary.outstanding).toBe(1);
    expect(summary.completionPercent).toBe(50);
    expect(summary.reachIsPartial).toBe(false);
  });

  it("flags answers the current send's gates can't account for", () => {
    // Two members answered under an earlier send this year; the re-send
    // overwrote only one of their gate rows.
    const view = viewWith({
      activations: [activation],
      activeActivation: activation,
      rows: [
        {
          ...ROW,
          userId: "a",
          gateActivationId: "act1",
          gateStatus: "completed",
          completedAt: new Date(),
        },
        { ...ROW, userId: "b", completedAt: new Date() },
      ],
    });

    expect(summarise(view).reachIsPartial).toBe(true);
  });

  it("reports no completion rate when nothing is outstanding or completed", () => {
    expect(summarise(viewWith({})).completionPercent).toBeNull();
  });
});

describe("emptyStateFor", () => {
  it("says nothing when there are answers", () => {
    expect(emptyStateFor(viewWith({}), 3)).toBeNull();
  });

  it("distinguishes 'never sent' from 'nobody has answered yet'", () => {
    expect(emptyStateFor(viewWith({}), 0)?.title).toBe("Not sent in 2027");
    expect(
      emptyStateFor(
        viewWith({ activations: [activation], activeActivation: activation }),
        0,
      )?.title,
    ).toBe("No answers yet");
  });

  it("names the send that was closed before anyone answered", () => {
    const closed = { ...activation, status: "closed" as const };
    expect(
      emptyStateFor(
        viewWith({ activations: [closed], activeActivation: closed }),
        0,
      )?.title,
    ).toBe("Closed before anyone answered");
  });
});
