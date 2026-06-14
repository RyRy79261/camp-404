import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_TEAMS } from "@camp404/db/camp-config";
import { buildQuestionnaire } from "@/lib/questionnaire";

// Phase 3 archive invariant at the ACTION level: saveFormReplay must validate +
// diff a re-submit against the FULL team catalogue (getQuestionnaireForResponses,
// all teams incl. archived) — NOT the active-only picker the member saw
// (form.questionnaire). The multi_select validator silently DROPS values not in
// its options, so validating against the active set would erase a member's
// since-archived team_lead.interests pick on re-save. This guards that wiring.

vi.mock("@/lib/auth", () => ({ getAuthenticatedUserOrRedirect: vi.fn() }));
vi.mock("@/lib/users", () => ({
  ensureCampUser: vi.fn(),
  hasCampAccess: vi.fn(),
}));
vi.mock("@/lib/forms", () => ({
  getReplayableForm: vi.fn(),
  recordFormEdit: vi.fn(),
}));
vi.mock("@/lib/questionnaire-config", () => ({
  getQuestionnaireForResponses: vi.fn(),
}));
vi.mock("@camp404/db/id-documents", () => ({ ID_NUMBER_KEY: "id.number" }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

import { saveFormReplay } from "./actions";
import { getAuthenticatedUserOrRedirect } from "@/lib/auth";
import { ensureCampUser, hasCampAccess } from "@/lib/users";
import { getReplayableForm, recordFormEdit } from "@/lib/forms";
import { getQuestionnaireForResponses } from "@/lib/questionnaire-config";

// Every required answer, so validateResponses passes and we can observe how the
// optional team_lead.interests pick is treated.
const required: Record<string, unknown> = {
  birthday: "1990-04-12",
  phone: "+27 82 555 1234",
  country: "ZA",
  "id.type": "sa_id",
  "id.number": "1234567890123",
  "competency.cooking": "teach",
  "logistics.driving": "yes",
  "logistics.onsite_before": "yes_full",
  "logistics.onsite_after": "yes_partial",
  "history.afrikaburn_count": "1_2",
  "intent.this_year": "want",
  "bio.statement": "Long-time burner.",
};

const ARCHIVED_KEY = "ministry_of_memes";
// The active-only picker the member saw (no archived team) …
const activePicker = buildQuestionnaire([
  { value: "kitchen", label: "Kitchen" },
  { value: "structures", label: "Structures" },
]);
// … and the full catalogue the action must validate against (incl. archived).
const fullCatalogue = buildQuestionnaire(
  DEFAULT_TEAMS.map((t) => ({ value: t.key, label: t.label })),
);

describe("saveFormReplay — archive invariant", () => {
  const save = vi.fn(
    async (_userId: string, _responses: Record<string, unknown>) => {},
  );

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getAuthenticatedUserOrRedirect).mockResolvedValue({
      id: "auth-1",
      primaryEmail: "m@example.com",
      displayName: "M",
    } as never);
    vi.mocked(ensureCampUser).mockResolvedValue({ id: "camp-1" } as never);
    vi.mocked(hasCampAccess).mockReturnValue(true);
    vi.mocked(getQuestionnaireForResponses).mockResolvedValue(fullCatalogue);
  });

  it("preserves a since-archived team pick on re-save (validates against the full set)", async () => {
    const stored = {
      ...required,
      "team_lead.interests": ["kitchen", ARCHIVED_KEY],
    };
    vi.mocked(getReplayableForm).mockResolvedValue({
      key: "burner_profile",
      title: "Burner profile",
      description: "",
      questionnaire: activePicker, // active-only; archived team absent here
      load: vi.fn(async () => ({
        responses: stored,
        completedAt: new Date("2026-01-01"),
        updatedAt: null,
      })),
      save,
    } as never);

    // Re-submit unchanged.
    const result = await saveFormReplay("burner_profile", { ...stored }, true);

    expect(result.ok).toBe(true);
    // The archived pick survived — it was NOT silently dropped (which it would
    // have been if validated against the active-only picker).
    const saved = save.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(saved["team_lead.interests"]).toEqual(["kitchen", ARCHIVED_KEY]);
    // Unchanged answers → no spurious change-log entry (no false "removal").
    expect(recordFormEdit).not.toHaveBeenCalled();
  });
});
