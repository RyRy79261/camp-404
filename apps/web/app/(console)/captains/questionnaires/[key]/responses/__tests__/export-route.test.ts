import { beforeEach, describe, expect, it, vi } from "vitest";

// The export route: the CSV is built on download, behind the same gate as the
// pages. loadResults is mocked (its gate has its own tests); everything after
// it, down to the bytes and headers, is the real code.

// The loader's own imports reach the auth SDK and the database, so they are
// cut at the module boundary exactly as results-data.test.ts does. That keeps
// the REAL respondentsOf, which the CSV is built from.
vi.mock("@/lib/auth", () => ({ getAuthenticatedUserOrRedirect: vi.fn() }));
vi.mock("@/lib/users", () => ({
  ensureCampUser: vi.fn(),
  hasCampAccess: vi.fn(),
  isApproved: vi.fn(),
}));
vi.mock("next/navigation", () => ({ notFound: vi.fn(), redirect: vi.fn() }));
vi.mock("@camp404/db/questionnaire-definitions", () => ({
  getDefinitionMetaRow: vi.fn(),
  listVersionDefinitions: vi.fn(async () => []),
}));
vi.mock("@camp404/db/questionnaire-results", () => ({
  listActivationResponses: vi.fn(),
  listActivationsForCycle: vi.fn(),
  listResultCycles: vi.fn(),
}));
vi.mock("@/lib/camp-config", () => ({ getCycles: vi.fn() }));
vi.mock("@/lib/questionnaire-definitions", () => ({
  getBuilderDefinition: vi.fn(),
}));
vi.mock("@camp404/db/audit", () => ({ appendAuditEvents: vi.fn() }));

import { appendAuditEvents } from "@camp404/db/audit";
import * as resultsData from "../../metrics/results-data";
import type { ResultsView } from "../../metrics/results-data";
import { GET } from "../export/route";
import { responsesCsvHref } from "../csv-export";

const view: ResultsView = {
  key: "feedback",
  title: "Camp feedback",
  questions: [
    {
      id: "q1",
      kind: "short_text",
      prompt: "Anything to tell us?",
      required: false,
      maxLength: 120,
    } as never,
    {
      id: "q2",
      kind: "long_text",
      prompt: "Allergies",
      required: false,
      role: resultsData.ALLERGY_ROLES[0],
    } as never,
  ],
  cycle: 2026,
  cycleOptions: [2026],
  currentCycle: 2026,
  cycleNames: {},
  rows: [
    {
      userId: "u1",
      displayName: "Ada",
      profileImageUrl: null,
      gateStatus: "completed",
      gateVersion: "1",
      gateActivationId: "act1",
      responses: { q1: "More shade", q2: "Peanuts" },
      definitionVersion: "1",
      completedAt: new Date("2026-03-10T10:00:00Z"),
      updatedAt: null,
    } as never,
    {
      userId: "u2",
      displayName: "Bo",
      profileImageUrl: null,
      gateStatus: "completed",
      gateVersion: "1",
      gateActivationId: "act1",
      responses: { q1: "Less shade" },
      definitionVersion: "1",
      completedAt: new Date("2026-03-11T10:00:00Z"),
      updatedAt: null,
    } as never,
  ],
  activations: [],
  activeActivation: null,
  viewerId: "cap1",
  allergyQuestionIds: ["q2"],
};

function get(query = "?cycle=2026") {
  return GET(
    new Request(
      `https://camp.test/captains/questionnaires/feedback/responses/export${query}`,
    ),
    { params: Promise.resolve({ key: "feedback" }) },
  );
}

const loadResults = vi.spyOn(resultsData, "loadResults");

beforeEach(() => {
  loadResults.mockReset();
  vi.mocked(appendAuditEvents).mockReset();
  vi.mocked(appendAuditEvents).mockResolvedValue(undefined);
});

describe("GET responses/export", () => {
  it("asks the gate for the questionnaire and the year in the link", async () => {
    loadResults.mockResolvedValue({ ok: true, view });
    await get();
    expect(loadResults).toHaveBeenCalledWith("feedback", "2026");
  });

  it("returns the file as a download that is never cached", async () => {
    loadResults.mockResolvedValue({ ok: true, view });
    const res = await get();
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Disposition")).toBe(
      'attachment; filename="feedback-2026-responses.csv"',
    );
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
    const body = await res.text();
    expect(body).toContain("Ada");
    expect(body).toContain("More shade");
  });

  it("records each member whose allergy answer is in the file, before the file", async () => {
    loadResults.mockResolvedValue({ ok: true, view });
    const res = await get();
    expect(res.status).toBe(200);
    // Ada answered the allergy question; Bo did not, so only Ada's read is
    // recorded.
    expect(appendAuditEvents).toHaveBeenCalledWith([
      {
        actorId: "cap1",
        action: "safety.allergies.view",
        target: "u1",
        metadata: {
          via: "questionnaire_csv",
          questionnaire: "feedback",
          title: "Camp feedback",
          cycle: 2026,
        },
      },
    ]);
  });

  it("makes no file when the reads cannot be recorded", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    loadResults.mockResolvedValue({ ok: true, view });
    vi.mocked(appendAuditEvents).mockRejectedValue(
      new Error("Failed query: insert into audit_log\nparams: u1"),
    );
    const res = await get();
    expect(res.status).toBe(503);
    const body = await res.text();
    expect(body).not.toContain("Ada");
    expect(body).not.toContain("Peanuts");
  });

  it("gives a non-captain no data", async () => {
    loadResults.mockResolvedValue({ ok: false, reason: "locked" });
    const res = await get();
    expect(res.status).toBe(403);
    expect(await res.text()).not.toContain("Ada");
  });

  it("answers 404 for a questionnaire that was never published", async () => {
    loadResults.mockResolvedValue({ ok: false, reason: "draft" });
    expect((await get()).status).toBe(404);
  });

  it("links the button to this route for the year on screen", () => {
    expect(responsesCsvHref("feedback", 2026)).toBe(
      "/captains/questionnaires/feedback/responses/export?cycle=2026",
    );
  });
});
