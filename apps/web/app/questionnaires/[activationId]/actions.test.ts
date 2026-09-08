import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Draft (non-final) saves used to reach the responses JSONB after nothing more
// than a structural parse: any key at all, at any size. These guard the
// allow-list + size cap that now bound them against the activation's PINNED
// definition. Mocked at the module boundary so the real server-only / DB
// modules stay out of the unit run.

vi.mock("@/lib/auth", () => ({
  getAuthenticatedUserOrRedirect: vi.fn(),
}));
vi.mock("@/lib/users", () => ({
  ensureCampUser: vi.fn(),
  hasCampAccess: vi.fn(),
  getPendingRequiredActions: vi.fn(),
}));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@camp404/db/activations", () => ({
  completeBuilderResponse: vi.fn(),
  getActivationById: vi.fn(),
  getRequiredAction: vi.fn(),
}));
vi.mock("@camp404/db/questionnaire-responses", () => ({
  upsertQuestionnaireResponse: vi.fn(),
}));
vi.mock("@/lib/questionnaire-definitions", () => ({
  getBuilderDefinition: vi.fn(),
}));
vi.mock("@/lib/required-actions", () => ({ nextGate: vi.fn() }));

import { BuilderQuestionnaire } from "@camp404/types";
import { saveBuilderResponses } from "./actions";
import { getAuthenticatedUserOrRedirect } from "@/lib/auth";
import { ensureCampUser, hasCampAccess } from "@/lib/users";
import { getActivationById, getRequiredAction } from "@camp404/db/activations";
import { upsertQuestionnaireResponse } from "@camp404/db/questionnaire-responses";
import { getBuilderDefinition } from "@/lib/questionnaire-definitions";

// Parsed so Zod fills the defaulted field params (maxLength, …).
const definition = BuilderQuestionnaire.parse({
  version: "v2",
  title: "Kitchen shift",
  pages: [
    {
      id: "p1",
      type: "question",
      title: "Shifts",
      blocks: [
        {
          kind: "question",
          question: { id: "name", kind: "short_text", prompt: "Name", required: true },
        },
        { id: "hdr", kind: "header_break", headingText: "More" },
        {
          kind: "question",
          question: { id: "notes", kind: "long_text", prompt: "Notes", required: false },
        },
      ],
    },
  ],
});

describe("saveBuilderResponses draft bounds", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getAuthenticatedUserOrRedirect).mockResolvedValue({
      id: "auth-1",
      primaryEmail: "member@example.com",
      displayName: "Member",
    } as never);
    vi.mocked(ensureCampUser).mockResolvedValue({
      id: "camp-1",
      authUserId: "auth-1",
      displayName: "Member",
      profileImageUrl: null,
      inviteCode: "INV",
      rank: "member",
      approvalStatus: "approved",
    } as never);
    vi.mocked(hasCampAccess).mockReturnValue(true);
    vi.mocked(getActivationById).mockResolvedValue({
      id: "act-1",
      status: "open",
      questionnaireKey: "kitchen_shift",
      version: "v2",
    } as never);
    vi.mocked(getRequiredAction).mockResolvedValue({
      status: "pending",
      activationId: "act-1",
    } as never);
    vi.mocked(getBuilderDefinition).mockResolvedValue(definition);
    vi.mocked(upsertQuestionnaireResponse).mockResolvedValue(undefined as never);
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("drops keys not in the pinned definition on a non-final save", async () => {
    // REFUSED CASE: `hdr` is a content block and `smuggled` is nothing at all —
    // neither is a field id, so neither may reach the JSONB.
    const result = await saveBuilderResponses(
      "act-1",
      { name: "Ada", hdr: "x", smuggled: "y" },
      false,
    );

    expect(result.ok).toBe(true);
    expect(upsertQuestionnaireResponse).toHaveBeenCalledTimes(1);
    const { responses } = vi.mocked(upsertQuestionnaireResponse).mock.calls[0]![0]!;
    expect(responses).toEqual({ name: "Ada" });
  });

  it("rejects an oversized draft without persisting", async () => {
    // REFUSED CASE: a legal field id holding ~200 KB, past the 128 KB cap.
    const result = await saveBuilderResponses(
      "act-1",
      { notes: "x".repeat(200 * 1024) },
      false,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors._form).toMatch(/unreadable or too large/i);
    expect(upsertQuestionnaireResponse).not.toHaveBeenCalled();
  });

  it("still succeeds with required fields empty on a non-final save", async () => {
    // The resume guarantee: `name` is required, and a draft may omit it.
    const result = await saveBuilderResponses("act-1", { notes: "half typed" }, false);

    expect(result.ok).toBe(true);
    const { responses } = vi.mocked(upsertQuestionnaireResponse).mock.calls[0]![0]!;
    expect(responses).toEqual({ notes: "half typed" });
  });

  it("returns 'This form is unavailable' when the pinned version is missing", async () => {
    // The definition is now loaded on EVERY save, so a draft against a
    // missing/malformed pinned version fails loudly instead of storing blind.
    vi.mocked(getBuilderDefinition).mockResolvedValue(null);

    const result = await saveBuilderResponses("act-1", { name: "Ada" }, false);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors._form).toBe("This form is unavailable.");
    expect(upsertQuestionnaireResponse).not.toHaveBeenCalled();
  });
});
