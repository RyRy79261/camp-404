// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

vi.mock("@camp404/db/questionnaire-definitions", () => ({
  getDefinitionMetaRow: vi.fn(),
}));
vi.mock("@camp404/db/cycles", () => ({ carryOverFor: vi.fn() }));
vi.mock("../../questionnaire-authoring", () => ({
  canEditQuestionnaire: vi.fn(),
}));
vi.mock("../../questionnaire-definitions", () => ({
  getBuilderDefinition: vi.fn(async () => ({ title: "Theme ideas" })),
}));

import { carryOverFor } from "@camp404/db/cycles";
import { getDefinitionMetaRow } from "@camp404/db/questionnaire-definitions";
import { canEditQuestionnaire } from "../../questionnaire-authoring";
import type { McpScope } from "../../mcp/scope";
import { QUESTIONNAIRES_MORE_PREVIEWS } from "../previews-questionnaires-more";

const ME = "11111111-1111-4111-8111-111111111111";
const scope = (over: Partial<McpScope> = {}): McpScope => ({
  campUserId: ME,
  rank: "member",
  viewerRank: "team_lead",
  leadTeams: ["kitchen"],
  memberTeams: ["kitchen"],
  isDriver: false,
  isCaptain: false,
  ...over,
});
const now = new Date("2026-10-06T10:00:00Z");
const META = {
  key: "theme-ideas",
  status: "draft",
  version: null,
  createdBy: ME,
  anonymousResults: false,
};

describe("questionnaire previews", () => {
  it("names the questionnaire by its own title, and blocks one not found", async () => {
    vi.mocked(getDefinitionMetaRow).mockResolvedValue(META as never);
    const p = await QUESTIONNAIRES_MORE_PREVIEWS.duplicate_questionnaire!(
      { key: "theme-ideas" },
      { scope: scope(), now },
    );
    expect(p.sentence).toBe("Copy “Theme ideas” into a new draft of yours");
    vi.mocked(getDefinitionMetaRow).mockResolvedValue(null);
    expect(
      (
        await QUESTIONNAIRES_MORE_PREVIEWS.duplicate_questionnaire!(
          { key: "nope" },
          { scope: scope(), now },
        )
      ).blocked,
    ).toBe("No questionnaire with that key.");
  });

  it("hides names for the author, and blocks someone who may not edit it", async () => {
    vi.mocked(getDefinitionMetaRow).mockResolvedValue(META as never);
    vi.mocked(canEditQuestionnaire).mockResolvedValue({ ok: true });
    const p =
      await QUESTIONNAIRES_MORE_PREVIEWS.set_questionnaire_anonymous_results!(
        { key: "theme-ideas", anonymous: true },
        { scope: scope(), now },
      );
    expect(p.sentence).toBe(
      "Hide names on the shared results of “Theme ideas”",
    );
    expect(p.blocked).toBeUndefined();
    vi.mocked(canEditQuestionnaire).mockResolvedValue({
      ok: false,
      error: "You can only edit your own questionnaires.",
    });
    expect(
      (
        await QUESTIONNAIRES_MORE_PREVIEWS.set_questionnaire_anonymous_results!(
          { key: "theme-ideas", anonymous: true },
          { scope: scope(), now },
        )
      ).blocked,
    ).toBe("You can only edit your own questionnaires.");
  });

  it("keeps the year policy a captain's, and says when it is already so", async () => {
    vi.mocked(getDefinitionMetaRow).mockResolvedValue(META as never);
    vi.mocked(carryOverFor).mockResolvedValue("carry");
    expect(
      (
        await QUESTIONNAIRES_MORE_PREVIEWS.set_questionnaire_carry_over!(
          { key: "theme-ideas", carryOver: false },
          { scope: scope(), now },
        )
      ).blocked,
    ).toBe("Only a captain can do this.");
    const captain = scope({
      isCaptain: true,
      viewerRank: "captain",
      rank: "captain",
    });
    const p = await QUESTIONNAIRES_MORE_PREVIEWS.set_questionnaire_carry_over!(
      { key: "theme-ideas", carryOver: false },
      { scope: captain, now },
    );
    expect(p.sentence).toBe(
      "Ask “Theme ideas” again on a blank form each new year",
    );
    expect(p.blocked).toBeUndefined();
    expect(
      (
        await QUESTIONNAIRES_MORE_PREVIEWS.set_questionnaire_carry_over!(
          { key: "theme-ideas", carryOver: true },
          { scope: captain, now },
        )
      ).blocked,
    ).toBe("That is already its year policy.");
  });
});
